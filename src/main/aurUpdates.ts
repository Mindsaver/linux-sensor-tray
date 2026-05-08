import { BrowserWindow, dialog, ipcMain, type BrowserWindow as ElectronBrowserWindow } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'

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

async function showAurUpdateCmdModal(opts: {
  parent: ElectronBrowserWindow | null
  title: string
  message: string
  cmd: string
}): Promise<'ignore' | 'close'> {
  const channel = `aurUpdateDialog:result:${randomUUID()}`

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'"
    />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(opts.title)}</title>
    <style>
      :root {
        color-scheme: dark;
      }
      body {
        margin: 0;
        padding: 16px;
        font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, sans-serif;
        background: #0b1020;
        color: #e2e8f0;
      }
      h1 {
        margin: 0 0 8px 0;
        font-size: 14px;
        font-weight: 650;
      }
      p {
        margin: 0 0 10px 0;
        font-size: 12px;
        line-height: 1.45;
        color: #cbd5e1;
      }
      label {
        display: block;
        margin: 10px 0 6px 0;
        font-size: 11px;
        color: #94a3b8;
      }
      textarea {
        width: 100%;
        box-sizing: border-box;
        resize: none;
        height: 72px;
        padding: 10px 10px;
        border-radius: 10px;
        border: 1px solid rgba(148, 163, 184, 0.25);
        background: rgba(15, 23, 42, 0.55);
        color: #e2e8f0;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        font-size: 12px;
        line-height: 1.4;
      }
      .row {
        display: flex;
        gap: 10px;
        justify-content: flex-end;
        margin-top: 12px;
      }
      button {
        border: 1px solid rgba(148, 163, 184, 0.25);
        background: rgba(15, 23, 42, 0.75);
        color: #e2e8f0;
        padding: 8px 10px;
        border-radius: 10px;
        font-size: 12px;
        cursor: pointer;
      }
      button.primary {
        background: rgba(30, 41, 59, 0.9);
      }
      button:hover {
        border-color: rgba(148, 163, 184, 0.5);
      }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(opts.message)}</h1>
    <p>Copy/paste this command into a terminal:</p>
    <label for="cmd">Command</label>
    <textarea id="cmd" readonly spellcheck="false"></textarea>
    <div class="row">
      <button id="ignore" class="primary" type="button">Ignore this version</button>
      <button id="close" type="button">Close</button>
    </div>
    <script>
      const { ipcRenderer } = require('electron');
      const cmd = ${JSON.stringify(opts.cmd)};
      const ta = document.getElementById('cmd');
      ta.value = cmd;
      ta.focus();
      ta.select();
      function sendResult(v) { ipcRenderer.send(${JSON.stringify(channel)}, v); }
      document.getElementById('ignore').addEventListener('click', () => sendResult('ignore'));
      document.getElementById('close').addEventListener('click', () => sendResult('close'));
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') sendResult('close');
      });
    </script>
  </body>
</html>`

  const modal = new BrowserWindow({
    width: 520,
    height: 265,
    resizable: false,
    minimizable: false,
    maximizable: false,
    parent: opts.parent && !opts.parent.isDestroyed() ? opts.parent : undefined,
    modal: Boolean(opts.parent && !opts.parent.isDestroyed()),
    title: opts.title,
    backgroundColor: '#0b1020',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      // This window only loads our own in-memory HTML.
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false
    }
  })

  const result = await new Promise<'ignore' | 'close'>((resolve) => {
    let settled = false
    const settle = (v: 'ignore' | 'close') => {
      if (settled) return
      settled = true
      resolve(v)
    }

    const cleanup = () => {
      ipcMain.removeAllListeners(channel)
    }

    ipcMain.once(channel, (_e, v: unknown) => {
      cleanup()
      if (v === 'ignore') settle('ignore')
      else settle('close')
      if (!modal.isDestroyed()) modal.close()
    })

    modal.on('closed', () => {
      cleanup()
      settle('close')
    })

    void modal
      .loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
      .catch((e) => {
        console.error('[aurUpdates] failed to load modal:', e)
        settle('close')
      })
      .finally(() => {
        if (!modal.isDestroyed()) modal.show()
      })
  })

  return result
}

function escapeHtml(s: string): string {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

export async function showAurUpdateAvailableDialog(opts: {
  getWindow: () => ElectronBrowserWindow | null
  update: AurUpdateAvailable
  onIgnore: (version: string) => void | Promise<void>
}): Promise<void> {
  const cmd = buildAurUpdateCommand(opts.update)

  const win = opts.getWindow()
  // If we can't create a modal (e.g. early app startup), fall back to a basic message box.
  if (!win || win.isDestroyed()) {
    const body =
      `A new version is available via AUR.\n\n` +
      `Package: ${opts.update.pkgName}\n` +
      `New version: ${opts.update.newVersion}\n\n` +
      `Run this command:\n` +
      `  ${cmd}\n`
    const r = await dialog.showMessageBox({
      type: 'info',
      title: 'Linux Sensor Tray',
      message: `Update available (${opts.update.newVersion})`,
      detail: body,
      buttons: ['Ignore this version', 'Close'],
      defaultId: 1,
      cancelId: 1
    })
    if (r.response === 0) await opts.onIgnore(opts.update.newVersion)
    return
  }

  const r = await showAurUpdateCmdModal({
    parent: win,
    title: 'Linux Sensor Tray',
    message: `Update available (${opts.update.newVersion})`,
    cmd
  })
  if (r === 'ignore') await opts.onIgnore(opts.update.newVersion)
}

