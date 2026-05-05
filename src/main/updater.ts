import { app, dialog, type BrowserWindow } from 'electron'
import electronUpdater from 'electron-updater'
import { skipAutoUpdate } from './runtimeEnv'

const { autoUpdater } = electronUpdater

let notifyIfNoUpdate = false

export function initAutoUpdater(getWindow: () => BrowserWindow | null): void {
  if (!app.isPackaged || skipAutoUpdate()) return

  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('update-available', (info) => {
    console.log('[updater] update available', info.version)
  })

  autoUpdater.on('update-downloaded', async (info) => {
    const win = getWindow()
    const opts = {
      type: 'info' as const,
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'Update ready',
      message: `Linux Sensor Tray ${info.version} has been downloaded.`,
      detail: 'Restart the app to install the update.'
    }
    const r =
      win && !win.isDestroyed()
        ? await dialog.showMessageBox(win, opts)
        : await dialog.showMessageBox(opts)
    if (r.response === 0) {
      autoUpdater.quitAndInstall(false, true)
    }
  })

  autoUpdater.on('update-not-available', async () => {
    if (!notifyIfNoUpdate) return
    notifyIfNoUpdate = false
    const win = getWindow()
    const opts = {
      type: 'info' as const,
      title: 'Linux Sensor Tray',
      message: 'You are on the latest version.'
    }
    if (win && !win.isDestroyed()) {
      await dialog.showMessageBox(win, opts)
    } else {
      await dialog.showMessageBox(opts)
    }
  })

  autoUpdater.on('error', (err) => {
    console.error('[updater]', err)
  })

  setTimeout(() => {
    void autoUpdater.checkForUpdates().catch((e) => console.error('[updater] check failed', e))
  }, 4000)
}

export function triggerUpdateCheck(userInitiated = false): void {
  if (!app.isPackaged || skipAutoUpdate()) return
  if (userInitiated) notifyIfNoUpdate = true
  void autoUpdater.checkForUpdates().catch((e) => console.error('[updater] check failed', e))
}
