import { app, BrowserWindow, Menu, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { openDb } from './db/client'
import { seedDemo } from './db/seed'
import { ensureDefaultUser, authState } from './services/auth'
import { ensureAutoRequestsForAll } from './services/requests'
import { registerIpc } from './ipc'

function migrationsFolder(): string {
  return app.isPackaged ? join(process.resourcesPath, 'drizzle') : join(app.getAppPath(), 'drizzle')
}

function initDatabase(): void {
  const db = openDb(join(app.getPath('userData'), 'zakupki.sqlite'), migrationsFolder())
  // первый запуск: учётная запись admin/admin и демонстрационные данные
  if (!authState().hasUser) {
    db.transaction((tx) => {
      ensureDefaultUser(tx)
      seedDemo(tx)
    })
  }
  ensureAutoRequestsForAll(db)
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    title: 'Закупки — Карачаевский пивзавод',
    backgroundColor: '#f8f4ec',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  win.on('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const [w] = BrowserWindow.getAllWindows()
    if (w) {
      if (w.isMinimized()) w.restore()
      w.focus()
    }
  })

  app.whenReady().then(() => {
    app.setAppUserModelId('ru.karachaevsky.purchasing')
    if (!is.dev) Menu.setApplicationMenu(null)
    initDatabase()
    registerIpc()
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
