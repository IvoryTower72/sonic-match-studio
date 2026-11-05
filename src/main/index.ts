import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  session,
  type MenuItemConstructorOptions,
} from 'electron'
import { MediaGate } from './access.js'
import { refreshSavedTracks, scanLibrary } from './library.js'
import { startPreviewServer, type PreviewServer } from './preview-server.js'
import { createSet, listSets, overwriteSet, readSet } from './sets.js'
import type { LibrarySnapshot, MenuCommand, SetDraft, SetFile } from '../shared/types.js'

app.setName('sonic-match-studio')
if (process.platform === 'win32') {
  app.setAppUserModelId('com.sonicmatchstudio.desktop')
}

const moduleDir = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(moduleDir, '../..')
const preloadPath = path.join(moduleDir, '../preload.cjs')
const rendererHtml = path.join(appRoot, 'dist/renderer/index.html')
const isDev = process.argv.includes('--dev')

const gate = new MediaGate()
let previewServer: PreviewServer | null = null
let windowRef: BrowserWindow | null = null
let setsDirectory = ''
let userData = ''
let currentLibrary: LibrarySnapshot = {
  folder: null,
  tracks: [],
  skippedCount: 0,
  unreadableCount: 0,
  truncated: false,
}
let scanToken = 0
let startupScan: Promise<void> = Promise.resolve()

function cliFlag(name: string): string | null {
  const index = process.argv.indexOf(name)
  if (index < 0) return null
  const value = process.argv[index + 1]
  if (!value || value.startsWith('--')) return null
  return value
}

function libraryRecordPath(): string {
  return path.join(userData, 'library.json')
}

function readSavedFolder(): string | null {
  try {
    const raw = JSON.parse(fs.readFileSync(libraryRecordPath(), 'utf8')) as { folder?: unknown }
    return typeof raw.folder === 'string' ? raw.folder : null
  } catch {
    return null
  }
}

function writeSavedFolder(folder: string | null): void {
  fs.writeFileSync(libraryRecordPath(), `${JSON.stringify({ folder }, null, 2)}\n`, 'utf8')
}

function send(channel: string, payload: unknown): void {
  if (windowRef && !windowRef.isDestroyed()) windowRef.webContents.send(channel, payload)
}

async function openLibrary(folder: string): Promise<LibrarySnapshot> {
  const token = ++scanToken
  const snapshot = await scanLibrary(folder, (progress) => {
    if (token === scanToken) send('library:progress', progress)
  })
  if (token !== scanToken) return currentLibrary
  currentLibrary = snapshot
  if (snapshot.folder) gate.setRoot(snapshot.folder)
  writeSavedFolder(snapshot.folder)
  return snapshot
}

function installContentSecurityPolicy(previewOrigin: string): void {
  const policy = isDev
    ? `default-src 'self' http://127.0.0.1:5173; script-src 'self' 'unsafe-inline' 'unsafe-eval' http://127.0.0.1:5173; style-src 'self' 'unsafe-inline' http://127.0.0.1:5173; connect-src 'self' ws://127.0.0.1:5173 http://127.0.0.1:5173; media-src 'self' ${previewOrigin} http://127.0.0.1:5173; img-src 'self' data:`
    : `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; media-src 'self' ${previewOrigin}; img-src 'self' data:`
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (details.url.startsWith(previewOrigin)) {
      callback(details.responseHeaders ? { responseHeaders: details.responseHeaders } : {})
      return
    }
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [policy],
      },
    })
  })
}

function buildMenu(win: BrowserWindow): void {
  const sendCommand = (command: MenuCommand) => {
    win.webContents.send('menu:command', command)
  }
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        { label: 'Open Folder', accelerator: 'CmdOrCtrl+O', click: () => sendCommand('open-folder') },
        { type: 'separator' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => sendCommand('save') },
        { label: 'Save As', accelerator: 'CmdOrCtrl+Shift+S', click: () => sendCommand('save-as') },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
  ]
  if (isDev) {
    template.push({
      label: 'View',
      submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }],
    })
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: '#101218',
    title: 'Sonic Match Studio',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  })
  windowRef = win
  win.once('ready-to-show', () => win.show())
  win.on('closed', () => {
    if (windowRef === win) windowRef = null
  })
  win.webContents.on('did-fail-load', (_event, code, description) => {
    console.error('Window failed to load', code, description)
  })
  if (isDev) void win.loadURL('http://127.0.0.1:5173')
  else void win.loadFile(rendererHtml)
  buildMenu(win)
  return win
}

function registerIpc(preview: PreviewServer): void {
  ipcMain.handle('app:load', async () => {
    await startupScan
    return {
      library: currentLibrary,
      sets: listSets(setsDirectory),
      setsDirectory,
    }
  })

  ipcMain.handle('library:open', async () => {
    const options = {
      title: 'Open a music folder',
      properties: ['openDirectory'] as Array<'openDirectory'>,
    }
    const result = windowRef
      ? await dialog.showOpenDialog(windowRef, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || !result.filePaths[0]) return null
    return openLibrary(result.filePaths[0])
  })

  ipcMain.handle('library:rescan', async () => {
    if (!currentLibrary.folder) throw new Error('Open a folder first.')
    return openLibrary(currentLibrary.folder)
  })

  ipcMain.handle('sets:list', async () => listSets(setsDirectory))

  ipcMain.handle('sets:save', async (_event, file: SetFile) => {
    const saved = overwriteSet(setsDirectory, file)
    for (const track of saved.tracks) gate.allow(track.path)
    return saved
  })

  ipcMain.handle('sets:save-as', async (_event, draft: SetDraft) => {
    if (!draft || !Array.isArray(draft.tracks)) throw new Error('The set could not be saved.')
    const saved = createSet(setsDirectory, draft)
    for (const track of saved.tracks) gate.allow(track.path)
    return saved
  })

  ipcMain.handle('sets:open', async (_event, fileId: string) => {
    const file = readSet(setsDirectory, fileId)
    const tracks = await refreshSavedTracks(file.tracks)
    for (const track of tracks) {
      if (!track.missing) gate.allow(track.path)
    }
    return { ...file, tracks }
  })

  ipcMain.handle('media:url', async (_event, filePath: unknown) => {
    if (typeof filePath !== 'string') throw new Error('That track has no file.')
    if (!gate.resolve(filePath)) throw new Error('That file is not in the open folder or the open set.')
    return preview.urlFor(filePath)
  })

  ipcMain.handle('media:bytes', async (_event, filePath: unknown) => {
    if (typeof filePath !== 'string') throw new Error('That track has no file.')
    const resolved = gate.resolve(filePath)
    if (!resolved) throw new Error('That file is not in the open folder or the open set.')
    const file = await fs.promises.readFile(resolved)
    return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength)
  })
}

void app.whenReady().then(async () => {
  userData = app.getPath('userData')
  setsDirectory = path.join(userData, 'sets')
  previewServer = await startPreviewServer(gate)
  installContentSecurityPolicy(previewServer.origin)
  registerIpc(previewServer)

  const requested = cliFlag('--library') ?? readSavedFolder() ?? process.env.SMS_LIBRARY ?? null
  if (requested && fs.existsSync(requested)) {
    startupScan = openLibrary(requested).then(
      () => undefined,
      (error: unknown) => {
        console.error(error)
      },
    )
  }

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  app.quit()
})

app.on('will-quit', () => {
  void previewServer?.close().catch(() => undefined)
})
