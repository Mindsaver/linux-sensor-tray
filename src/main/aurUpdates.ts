import { clipboard, dialog, type BrowserWindow } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

function pathExistsOnPATH(exe: string): boolean {
  const path = process.env.PATH ?? ''
  for (const dir of path.split(':')) {
    if (!dir) continue
    if (existsSync(join(dir, exe))) return true
  }
  return false
}

type AurHelper = 'paru' | 'yay' | null

function detectAurHelper(): AurHelper {
  if (pathExistsOnPATH('paru')) return 'paru'
  if (pathExistsOnPATH('yay')) return 'yay'
  return null
}

type TerminalSpec = { cmd: string; args: (commandToRun: string) => string[] }

function detectTerminal(): TerminalSpec | null {
  if (pathExistsOnPATH('xdg-terminal-exec')) {
    return { cmd: 'xdg-terminal-exec', args: (c) => ['--', 'sh', '-lc', c] }
  }
  if (pathExistsOnPATH('gnome-terminal')) {
    return { cmd: 'gnome-terminal', args: (c) => ['--', 'bash', '-lc', c] }
  }
  if (pathExistsOnPATH('konsole')) {
    return { cmd: 'konsole', args: (c) => ['-e', 'bash', '-lc', c] }
  }
  if (pathExistsOnPATH('alacritty')) {
    return { cmd: 'alacritty', args: (c) => ['-e', 'bash', '-lc', c] }
  }
  if (pathExistsOnPATH('kitty')) {
    return { cmd: 'kitty', args: (c) => ['sh', '-lc', c] }
  }
  if (pathExistsOnPATH('xterm')) {
    return { cmd: 'xterm', args: (c) => ['-e', 'bash', '-lc', c] }
  }
  return null
}

function defaultUpdateCommand(): string {
  const helper = detectAurHelper()
  const pkgs = 'linux-sensor-tray   # or linux-sensor-tray-bin'
  if (helper === 'paru') return `paru -Syu ${pkgs}`
  if (helper === 'yay') return `yay -Syu ${pkgs}`
  return `sudo pacman -Syu`
}

function tryLaunchTerminal(command: string): boolean {
  const term = detectTerminal()
  if (!term) return false

  const wrapped =
    `${command}; echo; ` +
    `printf "%s" "Press Enter to close..."; read _`

  try {
    const child = spawn(term.cmd, term.args(wrapped), { detached: true, stdio: 'ignore' })
    child.unref()
    return true
  } catch {
    return false
  }
}

export async function showAurUpdateDialog(getWindow: () => BrowserWindow | null): Promise<void> {
  const cmd = defaultUpdateCommand()
  const canOpenTerminal = detectTerminal() !== null
  const buttons = canOpenTerminal ? ['Copy command', 'Open terminal', 'Close'] : ['Copy command', 'Close']

  const body =
    'This copy was installed via your system package manager (AUR/pacman), so in-app updates are disabled.\n\n' +
    'Recommended (AUR helper):\n' +
    '  paru -Syu linux-sensor-tray   # or linux-sensor-tray-bin\n' +
    '  yay  -Syu linux-sensor-tray   # or linux-sensor-tray-bin\n\n' +
    'Or update your whole system:\n' +
    '  sudo pacman -Syu\n'

  const win = getWindow()
  const opts = {
    type: 'info' as const,
    title: 'Linux Sensor Tray',
    message: 'Updates are managed by pacman/AUR',
    detail: body,
    buttons,
    defaultId: 0,
    cancelId: buttons.length - 1
  }

  const r = win && !win.isDestroyed() ? await dialog.showMessageBox(win, opts) : await dialog.showMessageBox(opts)
  if (r.response === 0) {
    clipboard.writeText(cmd)
    return
  }
  if (canOpenTerminal && r.response === 1) {
    const ok = tryLaunchTerminal(cmd)
    if (!ok) {
      clipboard.writeText(cmd)
      const warn = {
        type: 'warning' as const,
        title: 'Linux Sensor Tray',
        message: 'Could not open a terminal',
        detail: 'The update command has been copied to your clipboard.'
      }
      if (win && !win.isDestroyed()) {
        await dialog.showMessageBox(win, warn)
      } else {
        await dialog.showMessageBox(warn)
      }
    }
  }
}

