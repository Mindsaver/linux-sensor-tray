import { app, dialog, type BrowserWindow } from 'electron'
import electronUpdater from 'electron-updater'
import { skipAutoUpdate } from './runtimeEnv'

const { autoUpdater } = electronUpdater

let notifyIfNoUpdate = false
/** Prevents stacking Download / Don't update dialogs from concurrent checks. */
let promptOpen = false
/** True between user confirming download and update-downloaded / error / failed downloadUpdate. */
let downloading = false

export function initAutoUpdater(getWindow: () => BrowserWindow | null): void {
  if (!app.isPackaged || skipAutoUpdate()) return

  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.autoDownload = false

  autoUpdater.on('update-available', async (info) => {
    console.log('[updater] update available', info.version)
    if (promptOpen || downloading) return
    promptOpen = true
    try {
      const win = getWindow()
      const opts = {
        type: 'info' as const,
        buttons: ['Download', "Don't update"],
        defaultId: 0,
        cancelId: 1,
        title: 'Update available',
        message: `Linux Sensor Tray ${info.version} is available.`,
        detail: 'Choose Download to fetch the update (you will be asked to restart when ready), or Don\'t update to skip for now.'
      }
      const r =
        win && !win.isDestroyed()
          ? await dialog.showMessageBox(win, opts)
          : await dialog.showMessageBox(opts)
      if (r.response !== 0) {
        console.log('[updater] user declined update download')
        return
      }
      downloading = true
      try {
        await autoUpdater.downloadUpdate()
      } catch (e) {
        console.error('[updater] download failed', e)
        downloading = false
      }
    } finally {
      promptOpen = false
    }
  })

  autoUpdater.on('update-downloaded', async (info) => {
    downloading = false
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
    downloading = false
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
