import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { PRIVILEGED_PROBE_POLKIT_RULES } from '@shared/types'

const execFileAsync = promisify(execFile)

const RULE_DIR = '/etc/polkit-1/rules.d'
const RULE_FILENAME = '49-linux-sensor-tray.rules'
const RULE_PATH = `${RULE_DIR}/${RULE_FILENAME}`

export type PolkitRuleStatus = {
  supported: boolean
  /** True/false when we can determine existence; null when permission prevents checking. */
  installed: boolean | null
  /** True when we could read the file contents (normally 0644); false otherwise. */
  readable: boolean
  /** True when file content matches our shipped rule text, null when unreadable. */
  matchesShippedRule: boolean | null
  path: string
}

export async function getPolkitRuleStatus(): Promise<PolkitRuleStatus> {
  if (process.platform !== 'linux') {
    return {
      supported: false,
      installed: false,
      readable: false,
      matchesShippedRule: null,
      path: RULE_PATH
    }
  }

  let exists: boolean | null = false
  try {
    await stat(RULE_PATH)
    exists = true
  } catch (e) {
    // Some distros lock down /etc/polkit-1/rules.d (no stat access). Don't lie.
    if ((e as NodeJS.ErrnoException)?.code === 'EACCES') exists = null
    else exists = false
  }

  try {
    const cur = await readFile(RULE_PATH, 'utf8')
    // Simple exact-match check: we write exactly this content (plus trailing newline).
    const norm = (s: string) => s.replace(/\r\n/g, '\n').trim()
    return {
      supported: true,
      installed: exists,
      readable: true,
      matchesShippedRule: norm(cur) === norm(PRIVILEGED_PROBE_POLKIT_RULES),
      path: RULE_PATH
    }
  } catch (e) {
    return {
      supported: true,
      installed: exists,
      readable: false,
      matchesShippedRule: null,
      path: RULE_PATH
    }
  }
}

export async function installPolkitRule(): Promise<PolkitRuleStatus> {
  if (process.platform !== 'linux') {
    return {
      supported: false,
      installed: false,
      readable: false,
      matchesShippedRule: null,
      path: RULE_PATH
    }
  }

  const dir = app.getPath('userData')
  await mkdir(dir, { recursive: true })
  const tmp = join(dir, RULE_FILENAME)
  await writeFile(tmp, `${PRIVILEGED_PROBE_POLKIT_RULES}\n`, 'utf8')

  // Create destination directory and install file as root (polkit prompt via pkexec).
  await execFileAsync('pkexec', ['mkdir', '-p', RULE_DIR])
  await execFileAsync('pkexec', ['install', '-m', '0644', tmp, RULE_PATH])

  // Best effort cleanup.
  try {
    await rm(tmp, { force: true })
  } catch {
    // ignore
  }

  return getPolkitRuleStatus()
}

export async function uninstallPolkitRule(): Promise<PolkitRuleStatus> {
  if (process.platform !== 'linux') {
    return {
      supported: false,
      installed: false,
      readable: false,
      matchesShippedRule: null,
      path: RULE_PATH
    }
  }
  await execFileAsync('pkexec', ['rm', '-f', RULE_PATH])
  return getPolkitRuleStatus()
}

