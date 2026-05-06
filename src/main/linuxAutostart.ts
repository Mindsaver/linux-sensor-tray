import { app } from 'electron'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const LINUX_AUTOSTART_DESKTOP = 'linux-sensor-tray.desktop'

/** XDG autostart is only meaningful for packaged Linux builds. */
export function linuxAutostartSupported(): boolean {
  return process.platform === 'linux' && app.isPackaged
}

function autostartDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME
  if (xdg && xdg.length > 0) return join(xdg, 'autostart')
  return join(homedir(), '.config', 'autostart')
}

export function linuxAutostartDesktopPath(): string {
  return join(autostartDir(), LINUX_AUTOSTART_DESKTOP)
}

/** Quote `Exec=` path for a .desktop file (freedesktop). */
export function quoteDesktopExec(execPath: string): string {
  if (!/[\s'"\\]/.test(execPath)) return execPath
  return `"${execPath.replace(/"/g, '\\"')}"`
}

/**
 * Install or remove `~/.config/autostart/linux-sensor-tray.desktop`.
 * In dev / non-Linux, removes our autostart file so a leftover packaged entry
 * does not keep launching an old AppImage while developing.
 */
export async function syncLinuxAutostart(want: boolean): Promise<void> {
  if (process.platform !== 'linux') return

  const dest = linuxAutostartDesktopPath()

  if (!linuxAutostartSupported()) {
    try {
      await unlink(dest)
    } catch {
      /* ENOENT */
    }
    return
  }

  if (!want) {
    try {
      await unlink(dest)
    } catch {
      /* ENOENT */
    }
    return
  }

  const exe = process.execPath
  await mkdir(autostartDir(), { recursive: true })
  const execLine = quoteDesktopExec(exe)
  await writeFile(
    dest,
    `[Desktop Entry]
Type=Application
Version=1.0
Name=Linux Sensor Tray
Comment=Hardware sensor tray monitor
Exec=${execLine}
Terminal=false
Categories=Utility;System;
StartupWMClass=linux-sensor-tray
X-GNOME-Autostart-enabled=true
`,
    'utf8'
  )
}
