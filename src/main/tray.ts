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

export function destroyTray(): void {
  if (tray) {
    tray.destroy()
    tray = null
  }
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
