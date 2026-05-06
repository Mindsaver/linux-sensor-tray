import { Menu, Tray, nativeImage, type BrowserWindow, type MenuItemConstructorOptions } from 'electron'
import { generateAppIcon } from './icon'

let tray: Tray | null = null

export function createTray(
  getWindow: () => BrowserWindow | null,
  quit: () => void,
  checkForUpdates?: () => void
): Tray {
  const icon = nativeImage.createFromBuffer(generateAppIcon(32))
  tray = new Tray(icon)
  tray.setToolTip('Linux Sensor Tray — collecting…')

  const buildMenu = (): Menu => {
    const items: MenuItemConstructorOptions[] = [
      {
        label: 'Show / Hide',
        click: () => toggleWindow(getWindow())
      }
    ]
    if (checkForUpdates) {
      items.push({
        label: 'Check for updates…',
        click: () => checkForUpdates()
      })
    }
    items.push({ type: 'separator' }, { label: 'Quit', click: quit })
    return Menu.buildFromTemplate(items)
  }

  tray.setContextMenu(buildMenu())
  tray.on('click', () => toggleWindow(getWindow()))
  return tray
}

export function setTrayTooltip(text: string): void {
  if (tray) tray.setToolTip(text)
}

function teardownTrayInstance(t: Tray, destroyNow: boolean): void {
  try {
    t.removeAllListeners()
  } catch {
    /* ignore */
  }
  try {
    t.closeContextMenu()
  } catch {
    /* Linux / no open menu */
  }
  try {
    t.setContextMenu(null)
  } catch {
    /* ignore */
  }
  try {
    t.setToolTip('')
  } catch {
    /* ignore */
  }

  const finish = (): void => {
    try {
      if (!t.isDestroyed()) t.destroy()
    } catch {
      /* ignore */
    }
  }

  if (destroyNow || process.platform !== 'linux') {
    finish()
  } else {
    setImmediate(finish)
  }
}

/**
 * Fully tear down the tray. Linux StatusNotifier often needs destroy deferred so the
 * shell removes the icon when toggling settings — but {@link destroyTraySync} must be
 * used before {@link app.quit}.
 */
export function destroyTray(): void {
  const t = tray
  if (!t) return
  tray = null
  teardownTrayInstance(t, false)
}

/** Same cleanup as {@link destroyTray} but always destroys the native tray immediately (required for Quit). */
export function destroyTraySync(): void {
  const t = tray
  if (!t) return
  tray = null
  teardownTrayInstance(t, true)
}

function toggleWindow(win: BrowserWindow | null): void {
  if (!win) return
  if (win.isVisible() && !win.isMinimized()) {
    win.hide()
  } else {
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  }
}
