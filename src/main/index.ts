import {
  BrowserWindow,
  app,
  dialog,
  ipcMain,
  nativeImage,
  shell,
  type OpenDialogOptions
} from 'electron'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { collectSnapshot } from './sensors'
import { createTray, destroyTray, setTrayTooltip } from './tray'
import { generateAppIcon } from './icon'
import { queueHistoryAppend } from './historyLog'
import {
  getDefaultLogDirectory,
  getSettingsSnapshot,
  initSettings,
  resolveLogDirectory,
  saveSettings
} from './settings'
import { ensureHistoryViewerInDir } from './installHistoryViewer'
import { initAutoUpdater, triggerUpdateCheck } from './updater'
import { skipAutoUpdate } from './runtimeEnv'
import {
  IPC_CHANNEL_SNAPSHOT,
  type AppSettings,
  type AppSettingsResolved,
  type SensorSnapshot
} from '@shared/types'

const __dirname = dirname(fileURLToPath(import.meta.url))
const POLL_MS = 1000

function resolvePreload(): string {
  const candidates = [
    join(__dirname, '../preload/index.mjs'),
    join(__dirname, '../preload/index.js')
  ]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  console.error('[lst] Preload script not found. Tried:\n  ' + candidates.join('\n  '))
  return candidates[0]
}

let mainWindow: BrowserWindow | null = null
let pollTimer: NodeJS.Timeout | null = null
let isQuitting = false

function createWindow(): BrowserWindow {
  const icon = nativeImage.createFromBuffer(generateAppIcon(128))
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    title: 'Linux Sensor Tray',
    icon,
    backgroundColor: '#0b1020',
    autoHideMenuBar: true,
    webPreferences: {
      preload: resolvePreload(),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (!app.isPackaged) {
    win.webContents.openDevTools({ mode: 'detach' })
  }

  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error('[lst] did-fail-load', code, desc, url)
  })

  win.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      win.hide()
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

function fmtTooltip(s: SensorSnapshot): string {
  const parts: string[] = []
  parts.push(`CPU ${s.cpu.loadTotal.toFixed(0)}%`)
  if (s.cpu.tempTctl != null) parts.push(`${s.cpu.tempTctl.toFixed(0)}°C`)
  parts.push(`GPU ${s.gpu.busy != null ? s.gpu.busy.toFixed(0) + '%' : '—'}`)
  if (s.gpu.tempEdge != null) parts.push(`${s.gpu.tempEdge.toFixed(0)}°C`)
  return parts.join(' · ')
}

function resolvedSettings(): AppSettingsResolved {
  const s = getSettingsSnapshot()
  return { ...s, resolvedLogDirectory: resolveLogDirectory(s) }
}

async function deployHistoryViewer(): Promise<void> {
  const def = getDefaultLogDirectory()
  const cur = resolveLogDirectory(getSettingsSnapshot())
  try {
    await ensureHistoryViewerInDir(def)
    if (cur !== def) await ensureHistoryViewerInDir(cur)
  } catch (e) {
    console.error('[lst] could not write history-viewer.html:', e)
  }
}

function canSendToMainRenderer(): boolean {
  if (!mainWindow || mainWindow.isDestroyed()) return false
  const wc = mainWindow.webContents
  return !wc.isDestroyed() && !wc.isCrashed()
}

async function tick(): Promise<void> {
  try {
    const snap = await collectSnapshot()
    if (canSendToMainRenderer()) {
      try {
        mainWindow!.webContents.send(IPC_CHANNEL_SNAPSHOT, snap)
      } catch {
        // Race: frame disposed between check and send (e.g. renderer crash / navigation).
      }
    }
    setTrayTooltip(fmtTooltip(snap))
    const st = getSettingsSnapshot()
    if (st.diskLogEnabled) {
      queueHistoryAppend(resolveLogDirectory(st), snap)
    }
  } catch (err) {
    console.error('[sensors] poll failed:', err)
  }
}

function startPolling(): void {
  if (pollTimer) return
  void tick()
  pollTimer = setInterval(() => {
    void tick()
  }, POLL_MS)
}

function stopPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function quitApp(): void {
  isQuitting = true
  stopPolling()
  destroyTray()
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy()
  app.quit()
}

app.whenReady().then(async () => {
  await initSettings()
  await deployHistoryViewer()

  ipcMain.handle('sensors:get', () => collectSnapshot())
  ipcMain.handle('settings:get', () => resolvedSettings())
  ipcMain.handle('settings:set', async (_e, partial: Partial<AppSettings>) => {
    await saveSettings(partial)
    await deployHistoryViewer()
    return resolvedSettings()
  })
  ipcMain.handle('history:openLogFolder', async () => {
    const dir = resolveLogDirectory(getSettingsSnapshot())
    const err = await shell.openPath(dir)
    if (err) console.error('[lst] open log folder:', err)
  })
  ipcMain.handle('history:chooseLogDir', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? mainWindow
    const opts: OpenDialogOptions = { properties: ['openDirectory', 'createDirectory'] }
    const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (r.canceled || r.filePaths.length === 0) return null
    return r.filePaths[0]
  })
  ipcMain.handle('history:defaultLogDir', () => getDefaultLogDirectory())

  mainWindow = createWindow()
  initAutoUpdater(() => mainWindow)
  const canCheckUpdates = app.isPackaged && !skipAutoUpdate()
  createTray(
    () => mainWindow,
    () => quitApp(),
    canCheckUpdates ? () => triggerUpdateCheck(true) : undefined
  )
  startPolling()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow()
    } else if (mainWindow) {
      mainWindow.show()
    }
  })
})

app.on('window-all-closed', () => {
  // Stay alive in tray.
})

app.on('before-quit', () => {
  isQuitting = true
})

process.on('SIGINT', () => quitApp())
process.on('SIGTERM', () => quitApp())
