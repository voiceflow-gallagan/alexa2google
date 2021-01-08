const { app, BrowserWindow, Menu, ipcMain, shell } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')
const _ = require('underscore')
const beautify = require('json-beautify')
const log = require('electron')

// Set env
//process.env.NODE_ENV = 'development'
process.env.NODE_ENV = 'production'

const isDev = process.env.NODE_ENV !== 'production' ? true : false
const isMac = process.platform === 'darwin' ? true : false

let mainWindow
let aboutWindow

function createAboutWindow() {
  aboutWindow = new BrowserWindow({
    parent: mainWindow,
    modal: false,
    title: 'About Voiceflow Alexa2Google Converter',
    backgroundColor: '#fff',
    icon: './assets/icons/png/256x256.png',
    minimizable: false,
    maximizable: false,
    width: 300,
    height: 300,
    resizable: false,
    fullscreenable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    titleBarStyle: 'hiddenInset',
  })

  aboutWindow.loadFile('./app/about.html')
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    title: 'Voiceflow Alexa2Google Converter',
    backgroundColor: '#fff',
    icon: './assets/icons/png/256x256.png',
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    movable: true,
    width: isDev ? 1200 : 500,
    height: 500,
    resizable: isDev ? true : false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      devTools: isDev ? true : false,
    },
    titleBarStyle: 'hiddenInset',
  })

  if (isDev) {
    mainWindow.webContents.openDevTools()
  }
  mainWindow.loadFile('./app/index.html')
}

const menu = [
  ...(isMac
    ? [
        {
          label: app.name,
          submenu: [
            {
              label: 'About',
              click: createAboutWindow,
            },
          ],
        },
      ]
    : []),
  {
    role: 'fileMenu',
  },
  ...(!isMac
    ? [
        {
          label: 'Help',
          submenu: [
            {
              label: 'About',
              click: createAboutWindow,
            },
          ],
        },
      ]
    : []),
  ...(isDev
    ? [
        {
          label: 'Developer',
          submenu: [
            { role: 'reload' },
            { role: 'forcereload' },
            { type: 'separator' },
            { role: 'toggledevtools' },
          ],
        },
      ]
    : []),
]

ipcMain.on('project:convert', (e, options) => {
  options.dest =
    path.parse(options.projectPath).dir +
    '/ga_' +
    path.parse(options.projectPath).base
  convertProject(options.projectPath, options.dest)
})

async function convertProject(projectPath, dest) {
  try {
    fs.readFile(projectPath, function (err, data) {
      if (err) throw err

      // Update project's info
      let project = JSON.parse(data.toString('utf8'))
      project.project.platform = 'google'
      project.project.name = 'GA ' + project.project.name
      project.version.platformData.publishing.pronunciation =
        project.version.platformData.publishing.invocationName

      // Update slots
      _.mapObject(project.version.platformData.slots, function (val, key) {
        if (
          project.version.platformData.slots[key].type.value == 'AMAZON.Book'
        ) {
          project.version.platformData.slots[key].type.value = 'Custom'
        } else if (
          project.version.platformData.slots[key].type.value == 'Number'
        ) {
          project.version.platformData.slots[key].type.value =
            'actions.type.Number'
        } else if (
          project.version.platformData.slots[key].type.value == 'Date'
        ) {
          project.version.platformData.slots[key].type.value =
            'actions.type.Date'
        } else if (
          project.version.platformData.slots[key].type.value == 'Time'
        ) {
          project.version.platformData.slots[key].type.value =
            'actions.type.Time'
        } else {
          project.version.platformData.slots[key].type.value = 'Custom'
        }
      })

      // Add custom Help, Yes and No intents
      project.version.platformData.intents.push(
        {
          key: 'kbb532fw',
          name: 'help_intent',
          slots: [],
          inputs: [
            { text: 'I need help', slots: [] },
            { text: 'help me', slots: [] },
            { text: 'help', slots: [] },
            { text: 'please help', slots: [] },
          ],
        },
        {
          key: 'kbb532fx',
          name: 'yes_intent',
          slots: [],
          inputs: [
            { text: 'yes', slots: [] },
            { text: 'sure', slots: [] },
            { text: 'ok', slots: [] },
          ],
        },
        {
          key: 'kbb532fy',
          name: 'no_intent',
          slots: [],
          inputs: [
            { text: 'no', slots: [] },
            { text: 'nope', slots: [] },
            { text: 'no way', slots: [] },
          ],
        }
      )

      // Convert AMAZON.Help, AMAZON.Yes and AMAZON.No intents
      let removeStop
      let diagram, node

      _.mapObject(project.diagrams, function (val, key) {
        _.mapObject(project.diagrams[key].nodes, function (valNodes, keyNodes) {
          if (
            project.diagrams[key].nodes[keyNodes].data.intent ==
            'AMAZON.HelpIntent'
          ) {
            project.diagrams[key].nodes[keyNodes].data.intent = 'kbb532fw'
          }
          if (project.diagrams[key].nodes[keyNodes].data.choices) {
            _.mapObject(
              project.diagrams[key].nodes[keyNodes].data.choices,
              function (valChoices, keyChoices) {
                if (
                  project.diagrams[key].nodes[keyNodes].data.choices[keyChoices]
                    .intent == 'AMAZON.YesIntent'
                ) {
                  project.diagrams[key].nodes[keyNodes].data.choices[
                    keyChoices
                  ].intent = 'kbb532fx'
                } else if (
                  project.diagrams[key].nodes[keyNodes].data.choices[keyChoices]
                    .intent == 'AMAZON.NoIntent'
                ) {
                  project.diagrams[key].nodes[keyNodes].data.choices[
                    keyChoices
                  ].intent = 'kbb532fy'
                }
              }
            )
          }

          if (
            project.diagrams[key].name == 'ROOT' &&
            project.diagrams[key].nodes[keyNodes].type == 'start'
          ) {
            diagram = key
            node = keyNodes
          }
          if (
            project.diagrams[key].nodes[keyNodes].data.intent ==
              'AMAZON.StopIntent' &&
            project.diagrams[key].nodes[keyNodes].type == 'command'
          ) {
            removeStop = project.diagrams[key].nodes[keyNodes].nodeID
            delete project.diagrams[key].nodes[keyNodes]
          }
        })
      })

      project.diagrams[diagram].nodes[node].data.steps = project.diagrams[
        diagram
      ].nodes[node].data.steps.filter((item) => item != removeStop)

      // Set default voice
      function replaceAll(str, replace) {
        return str.replace(/"voice":"(\w+)",/g, replace)
      }
      project = JSON.parse(
        replaceAll(JSON.stringify(project), '"voice":"Alexa",')
      )

      fs.writeFile(
        dest,
        beautify(project, null, 2, 80).toString('utf8'),
        function (err) {
          if (err) return console.log(err)
          shell.openPath(path.parse(dest).dir)

          mainWindow.webContents.send('convert:done')
        }
      )
    })
  } catch (error) {
    console.log(error)
  }
}

app.on('ready', () => {
  createMainWindow()
  const mainMenu = Menu.buildFromTemplate(menu)
  Menu.setApplicationMenu(mainMenu)
  mainWindow.on('ready', () => (mainWindow = null))
})

app.on('window-all-closed', () => {
  app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow()
  }
})

app.allowRendererProcessReuse = true
