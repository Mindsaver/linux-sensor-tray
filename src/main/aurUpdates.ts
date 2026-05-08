import { clipboard, dialog, type BrowserWindow } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

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

export type AurUpdateAvailable = {
  pkgName: string
  newVersion: string
  helper: 'paru' | 'yay'
}

async function pacmanHasPackage(pkg: string): Promise<boolean> {
  try {
    await execFileAsync('pacman', ['-Q', pkg], { timeout: 2500 })
    return true
  } catch {
    return false
  }
}

async function installedCandidates(): Promise<string[]> {
  const candidates = ['linux-sensor-tray', 'linux-sensor-tray-bin'] as const
  const out: string[] = []
  for (const c of candidates) {
    if (await pacmanHasPackage(c)) out.push(c)
  }
  return out
}

function parseQuaLine(line: string): { pkgName: string; newVersion: string } | null {
  // Common formats:
  // - "pkgname oldver -> newver"
  // - "pkgname newver"
  const t = line.trim()
  if (!t) return null
  const parts = t.split(/\s+/g)
  if (parts.length < 2) return null
  const pkgName = parts[0]
  const arrowIdx = parts.indexOf('->')
  if (arrowIdx !== -1 && arrowIdx + 1 < parts.length) {
    return { pkgName, newVersion: parts[arrowIdx + 1] }
  }
  return { pkgName, newVersion: parts[1] }
}

export async function detectAurUpdate(): Promise<AurUpdateAvailable | null> {
  const helper = detectAurHelper()
  if (!helper) return null

  const installed = await installedCandidates()
  if (installed.length === 0) return null

  try {
    const { stdout } = await execFileAsync(helper, ['-Qua'], { timeout: 6000, maxBuffer: 2 * 1024 * 1024 })
    const lines = String(stdout ?? '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)

    for (const line of lines) {
      const parsed = parseQuaLine(line)
      if (!parsed) continue
      if (installed.includes(parsed.pkgName)) {
        return { pkgName: parsed.pkgName, newVersion: parsed.newVersion, helper }
      }
    }
    return null
  } catch (e) {
    console.error('[aurUpdates] helper check failed:', e)
    return null
  }
}

export function buildAurUpdateCommand(update: AurUpdateAvailable): string {
  return `${update.helper} -Syu ${update.pkgName}`
}

export async function showAurUpdateAvailableDialog(opts: {
  getWindow: () => BrowserWindow | null
  update: AurUpdateAvailable
  onIgnore: (version: string) => void | Promise<void>
}): Promise<void> {
  const cmd = buildAurUpdateCommand(opts.update)
  const buttons = ['Copy command', 'Ignore this version', 'Close']

  const body =
    `A new version is available via AUR.\n\n` +
    `Package: ${opts.update.pkgName}\n` +
    `New version: ${opts.update.newVersion}\n\n` +
    `Run this command:\n` +
    `  ${cmd}\n`

  const win = opts.getWindow()
  const msgBox = {
    type: 'info' as const,
    title: 'Linux Sensor Tray',
    message: `Update available (${opts.update.newVersion})`,
    detail: body,
    buttons,
    defaultId: 0,
    cancelId: buttons.length - 1
  }

  const r =
    win && !win.isDestroyed()
      ? await dialog.showMessageBox(win, msgBox)
      : await dialog.showMessageBox(msgBox)
  if (r.response === 0) {
    clipboard.writeText(cmd)
    return
  }
  if (r.response === 1) {
    await opts.onIgnore(opts.update.newVersion)
    return
  }
}

