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
import { createTray, destroyTray, destroyTraySync, setTrayTooltip } from './tray'
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
import { linuxAutostartSupported, syncLinuxAutostart } from './linuxAutostart'
import { detectAurUpdate, showAurUpdateAvailableDialog } from './aurUpdates'
import { collectSystemInfo } from './systemInfo'
import { getPolkitRuleStatus, installPolkitRule, uninstallPolkitRule } from './linuxPolkitRule'
import { collectTaskMonitorSnapshot } from './tasks'
import {
  computeWizardState,
  getSetupCapabilities,
  markSetupWizardSeen,
  resetSetupWizardSeen,
  runSetupCommand
} from './setup'
import {
  IPC_CHANNEL_SNAPSHOT,
  type AppSettings,
  type AppSettingsResolved,
  type SensorSnapshot
} from '@shared/types'

const __dirname = dirname(fileURLToPath(import.meta.url))
const POLL_MS = 1000

function appIconDataUrl(size = 64): string {
  const png = generateAppIcon(size)
  return `data:image/png;base64,${png.toString('base64')}`
}

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
/** Passed into tray menu when packaged updates are enabled. */
let trayUpdateCheck: (() => void) | undefined
/** Last snapshot timestamp (ms) when a disk log line was written; null until first write after enable. */
let lastDiskLogAtMs: number | null = null
let aurUpdatePromptOpen = false

async function checkAurUpdates(userInitiated: boolean): Promise<void> {
  if (!app.isPackaged || !skipAutoUpdate()) return
  if (aurUpdatePromptOpen) return

  try {
    const update = await detectAurUpdate()
    if (!update) {
      if (!userInitiated) return
      const win = BrowserWindow.getFocusedWindow() ?? mainWindow
      const opts = {
        type: 'info' as const,
        title: 'Linux Sensor Tray',
        message: 'You are on the latest version.'
      }
      await (win && !win.isDestroyed() ? dialog.showMessageBox(win, opts) : dialog.showMessageBox(opts))
      return
    }

    const ignored = getSettingsSnapshot().ignoredAurUpdateVersion
    if (ignored && ignored === update.newVersion) return

    aurUpdatePromptOpen = true
    await showAurUpdateAvailableDialog({
      getWindow: () => BrowserWindow.getFocusedWindow() ?? mainWindow,
      update,
      onIgnore: async (version) => {
        await saveSettings({ ignoredAurUpdateVersion: version })
      }
    })
  } catch (e) {
    console.error('[aurUpdates] check failed:', e)
  } finally {
    aurUpdatePromptOpen = false
  }
}

// Single-instance app (tray-first): if the user launches again, focus the existing window.
const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    // This can fire before `whenReady` creates a window; in that case just
    // let the primary instance continue starting up.
    if (isQuitting) return
    if (!app.isReady()) return

    if (!mainWindow || mainWindow.isDestroyed()) {
      console.warn('[lst] second-instance: main window missing, recreating')
      mainWindow = createWindow()
    }

    if (mainWindow.isMinimized()) mainWindow.restore()
    if (!mainWindow.isVisible()) mainWindow.show()
    mainWindow.focus()
  })
}

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
    if (isQuitting) return
    if (getSettingsSnapshot().trayEnabled) {
      e.preventDefault()
      win.hide()
    }
  })

  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
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
  return {
    ...s,
    resolvedLogDirectory: resolveLogDirectory(s),
    openAtLoginSupported: linuxAutostartSupported(),
    privilegedSystemProbeSupported: process.platform === 'linux'
  }
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
      const intervalMs = Math.max(1, st.diskLogIntervalSeconds) * 1000
      const t = snap.timestamp
      if (lastDiskLogAtMs === null || t - lastDiskLogAtMs >= intervalMs) {
        queueHistoryAppend(resolveLogDirectory(st), snap)
        lastDiskLogAtMs = t
      }
    } else {
      lastDiskLogAtMs = null
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
  if (isQuitting) return
  isQuitting = true

  console.info('[lst] quit: begin')
  stopPolling()
  destroyTraySync()

  let requestedQuit = false
  const forceExit = (reason: string): void => {
    // Some Linux StatusNotifier implementations can leave a “zombie” tray icon if the process
    // terminates immediately after destroy(). Give the event loop a moment, then hard-exit.
    console.warn('[lst] quit: force-exit', reason)
    setTimeout(() => {
      try {
        app.exit(0)
      } catch {
        process.exit(0)
      }
    }, 1200).unref()
  }

  const requestQuit = (): void => {
    if (requestedQuit) return
    requestedQuit = true
    try {
      console.info('[lst] quit: app.quit()')
      app.quit()
    } catch (e) {
      console.error('[lst] quit: app.quit threw', e)
    } finally {
      forceExit('post-app.quit')
    }
  }

  const failsafe = setTimeout(() => forceExit('failsafe-timeout'), 7000)
  failsafe.unref()

  const windows = BrowserWindow.getAllWindows()
  if (windows.length > 0) {
    console.info('[lst] quit: closing windows', windows.length)
  }
  for (const w of windows) {
    try {
      // Ensure no “hide instead of close” handler can intercept a quit-triggered close.
      w.removeAllListeners('close')
    } catch {
      /* ignore */
    }
    try {
      w.close()
    } catch (e) {
      console.error('[lst] quit: window.close failed', e)
    }
  }

  // Do not depend on any single window event; always proceed to request app quit.
  requestQuit()
}

function applyTrayFromSettings(settings?: AppSettings): void {
  const st = settings ?? getSettingsSnapshot()
  destroyTray()
  if (!st.trayEnabled) {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.show()
    }
    return
  }
  createTray(
    () => mainWindow,
    () => quitApp(),
    trayUpdateCheck
  )
}

app.whenReady().then(async () => {
  await initSettings()
  await syncLinuxAutostart(getSettingsSnapshot().openAtLogin)
  await deployHistoryViewer()

  ipcMain.handle('app:getIconDataUrl', (_e, size?: number) => appIconDataUrl(size ?? 64))
  ipcMain.handle('sensors:get', () => collectSnapshot())
  ipcMain.handle('tasks:get', () => collectTaskMonitorSnapshot())
  ipcMain.handle('system:getInfo', () => collectSystemInfo())
  ipcMain.handle('system:enrichWithRoot', () => collectSystemInfo({ force: 'privileged' }))
  ipcMain.handle('polkit:ruleStatus', () => getPolkitRuleStatus())
  ipcMain.handle('polkit:installRule', () => installPolkitRule())
  ipcMain.handle('polkit:uninstallRule', () => uninstallPolkitRule())
  ipcMain.handle('setup:capabilities', () => getSetupCapabilities({ force: true }))
  ipcMain.handle('setup:wizardState', () => computeWizardState())
  ipcMain.handle('setup:markWizardSeen', () => markSetupWizardSeen())
  ipcMain.handle('setup:resetWizardSeen', () => resetSetupWizardSeen())
  ipcMain.handle('setup:configureZenpower', () =>
    runSetupCommand(['zenpower'], { privileged: true })
  )
  ipcMain.handle('setup:revertZenpower', () =>
    runSetupCommand(['zenpower', '--revert'], { privileged: true })
  )
  ipcMain.handle('setup:installPolkitRule', () =>
    runSetupCommand(['polkit-rule'], { privileged: true })
  )
  ipcMain.handle('setup:removePolkitRule', () =>
    runSetupCommand(['polkit-rule', '--remove'], { privileged: true })
  )
  ipcMain.handle('setup:installDeps', (_e, packages: string[]) => {
    const safe = Array.isArray(packages) ? packages.filter((p) => typeof p === 'string' && p.length > 0) : []
    if (safe.length === 0) {
      return Promise.resolve({
        ok: false,
        exitCode: null,
        stdout: '',
        stderr: '',
        error: 'No packages requested.'
      })
    }
    return runSetupCommand(['install-deps', ...safe], { privileged: true })
  })
  ipcMain.handle('settings:get', () => resolvedSettings())
  ipcMain.handle('settings:set', async (_e, partial: Partial<AppSettings>) => {
    const merged = await saveSettings(partial)
    await syncLinuxAutostart(merged.openAtLogin)
    await deployHistoryViewer()
    applyTrayFromSettings(merged)
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
  const canShowUpdateMenu = app.isPackaged
  trayUpdateCheck = canShowUpdateMenu
    ? () => {
        if (!skipAutoUpdate()) {
          triggerUpdateCheck(true)
          return
        }
        void checkAurUpdates(true)
      }
    : undefined
  applyTrayFromSettings()
  startPolling()

  if (app.isPackaged && skipAutoUpdate()) {
    setTimeout(() => void checkAurUpdates(false), 6000)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow()
    } else if (mainWindow) {
      mainWindow.show()
    }
  })
})

app.on('window-all-closed', () => {
  if (!getSettingsSnapshot().trayEnabled && !isQuitting) {
    quitApp()
  }
})

app.on('before-quit', () => {
  isQuitting = true
})

process.on('SIGINT', () => quitApp())
process.on('SIGTERM', () => quitApp())
