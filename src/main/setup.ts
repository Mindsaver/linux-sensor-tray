import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { app } from 'electron'
import type {
  SetupCapabilities,
  SetupCommandResult,
  SetupPkgManager,
  SetupWizardState
} from '@shared/types'
import { getSettingsSnapshot, saveSettings } from './settings'

const execFileAsync = promisify(execFile)

const CLI_BINARY = 'linux-sensor-tray-setup'
/** Locations the CLI may live in, in priority order: AUR install → user install → /usr/local. */
const CLI_LOOKUP_PATHS = [
  `/usr/bin/${CLI_BINARY}`,
  `/usr/local/bin/${CLI_BINARY}`,
  join(homedir(), '.local', 'bin', CLI_BINARY)
]

const POLKIT_RULE_PATH = '/etc/polkit-1/rules.d/49-linux-sensor-tray.rules'
const K10TEMP_BLACKLIST_FILE = '/etc/modprobe.d/linux-sensor-tray-blacklist-k10temp.conf'

const CAPABILITIES_TTL_MS = 5_000
let cachedCaps: { at: number; value: SetupCapabilities } | null = null

function which(bin: string): string | null {
  for (const dir of (process.env.PATH ?? '').split(':')) {
    if (!dir) continue
    const p = join(dir, bin)
    if (existsSync(p)) return p
  }
  return null
}

function findCli(): string | null {
  for (const p of CLI_LOOKUP_PATHS) {
    if (existsSync(p)) return p
  }
  return which(CLI_BINARY)
}

function readCpuVendor(): SetupCapabilities['cpuVendor'] {
  try {
    const t = readFileSync('/proc/cpuinfo', 'utf8')
    if (t.includes('AuthenticAMD')) return 'AuthenticAMD'
    if (t.includes('GenuineIntel')) return 'GenuineIntel'
  } catch {
    // ignore — non-Linux or no /proc access
  }
  return 'other'
}

function readOsRelease(): { id: string; idLike: string[] } {
  try {
    const t = readFileSync('/etc/os-release', 'utf8')
    const map = new Map<string, string>()
    for (const raw of t.split('\n')) {
      const line = raw.trim()
      if (!line || line.startsWith('#')) continue
      const eq = line.indexOf('=')
      if (eq === -1) continue
      const key = line.slice(0, eq)
      let val = line.slice(eq + 1)
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1)
      map.set(key, val)
    }
    const id = map.get('ID') ?? 'unknown'
    const idLikeRaw = map.get('ID_LIKE') ?? ''
    const idLike = idLikeRaw.length === 0 ? [] : idLikeRaw.split(/\s+/).filter(Boolean)
    return { id, idLike }
  } catch {
    return { id: 'unknown', idLike: [] }
  }
}

function detectPkgManager(): SetupPkgManager {
  if (which('pacman')) return 'pacman'
  if (which('apt-get')) return 'apt'
  if (which('dnf')) return 'dnf'
  if (which('zypper')) return 'zypper'
  return 'unknown'
}

/**
 * Build a SetupCapabilities object directly from /proc + /sys + filesystem checks,
 * without invoking the CLI. Used when `linux-sensor-tray-setup` is not installed
 * (older AppImage installs, dev runs). Returned with `cliMissing: true`.
 */
function synthesizeCapabilities(cliError?: string): SetupCapabilities {
  const cpuVendor = readCpuVendor()
  const { id, idLike } = readOsRelease()
  const pkgManager = detectPkgManager()
  return {
    cliMissing: true,
    cliPath: null,
    cliError,
    cpuVendor,
    distro: { id, idLike, pkgManager },
    hwmon: {
      // Without the CLI we can still read /sys/module/<mod> to see what's loaded.
      zenpower: existsSync('/sys/module/zenpower'),
      k10temp: existsSync('/sys/module/k10temp'),
      blacklistFile: K10TEMP_BLACKLIST_FILE,
      blacklistInstalled: existsSync(K10TEMP_BLACKLIST_FILE)
    },
    polkitRule: { installed: existsSync(POLKIT_RULE_PATH), path: POLKIT_RULE_PATH },
    tools: {
      pkexec: which('pkexec') !== null,
      lshw: which('lshw') !== null,
      yay: which('yay') !== null,
      paru: which('paru') !== null
    },
    optionalPkgs: {
      // We can't easily probe the package DB from main without spawning subprocesses;
      // use `tools.lshw` as a proxy and leave the rest false. The CLI fills these in
      // accurately when it's available.
      lshw: which('lshw') !== null,
      polkit: which('pkexec') !== null,
      'zenpower3-dkms': existsSync('/sys/module/zenpower')
    }
  }
}

/**
 * Run `linux-sensor-tray-setup doctor --json` and parse the result. Falls back to
 * synthesized data when the CLI is missing or returns an unparseable payload.
 * Cached for {@link CAPABILITIES_TTL_MS} so wizard + System tab + CPU banner mounting
 * simultaneously do not stampede the subprocess.
 */
export async function getSetupCapabilities(opts?: { force?: boolean }): Promise<SetupCapabilities> {
  if (!opts?.force && cachedCaps && Date.now() - cachedCaps.at < CAPABILITIES_TTL_MS) {
    return cachedCaps.value
  }

  const cli = findCli()
  let value: SetupCapabilities
  if (!cli) {
    value = synthesizeCapabilities('CLI not found on PATH')
  } else {
    try {
      const { stdout } = await execFileAsync(cli, ['doctor', '--json'], {
        timeout: 10_000,
        maxBuffer: 1024 * 1024
      })
      const parsed = JSON.parse(stdout) as Partial<SetupCapabilities> & {
        cpuVendor?: string
        distro?: Partial<SetupCapabilities['distro']>
      }
      value = {
        cliMissing: false,
        cliPath: cli,
        cpuVendor: (parsed.cpuVendor === 'AuthenticAMD' || parsed.cpuVendor === 'GenuineIntel'
          ? parsed.cpuVendor
          : 'other') as SetupCapabilities['cpuVendor'],
        distro: {
          id: parsed.distro?.id ?? 'unknown',
          idLike: Array.isArray(parsed.distro?.idLike) ? (parsed.distro!.idLike as string[]) : [],
          pkgManager: (parsed.distro?.pkgManager ?? 'unknown') as SetupPkgManager
        },
        hwmon: {
          zenpower: Boolean(parsed.hwmon?.zenpower),
          k10temp: Boolean(parsed.hwmon?.k10temp),
          blacklistFile: parsed.hwmon?.blacklistFile ?? K10TEMP_BLACKLIST_FILE,
          blacklistInstalled: Boolean(parsed.hwmon?.blacklistInstalled)
        },
        polkitRule: {
          installed: Boolean(parsed.polkitRule?.installed),
          path: parsed.polkitRule?.path ?? POLKIT_RULE_PATH
        },
        tools: {
          pkexec: Boolean(parsed.tools?.pkexec),
          lshw: Boolean(parsed.tools?.lshw),
          yay: Boolean(parsed.tools?.yay),
          paru: Boolean(parsed.tools?.paru)
        },
        optionalPkgs: {
          lshw: Boolean(parsed.optionalPkgs?.lshw),
          polkit: Boolean(parsed.optionalPkgs?.polkit),
          'zenpower3-dkms': Boolean(parsed.optionalPkgs?.['zenpower3-dkms'])
        }
      }
    } catch (e) {
      console.error('[setup] doctor --json failed; using synthesized capabilities:', e)
      const msg = e instanceof Error ? e.message : String(e)
      value = synthesizeCapabilities(`doctor --json failed: ${msg}`)
    }
  }

  cachedCaps = { at: Date.now(), value }
  return value
}

/** Force the next call to {@link getSetupCapabilities} to recompute. */
export function invalidateSetupCapabilitiesCache(): void {
  cachedCaps = null
}

/**
 * Run a CLI subcommand. When `privileged` is true we wrap with `pkexec` so the
 * caller's polkit agent prompts for a password (or auto-allows via the rule).
 * Errors never throw — they are normalized into the result object so the renderer
 * can react uniformly.
 */
export async function runSetupCommand(
  args: string[],
  opts: { privileged: boolean }
): Promise<SetupCommandResult> {
  const cli = findCli()
  if (!cli) {
    return {
      ok: false,
      exitCode: null,
      stdout: '',
      stderr: '',
      error: 'linux-sensor-tray-setup not found on PATH'
    }
  }

  let cmd: string
  let cmdArgs: string[]
  if (opts.privileged) {
    if (!which('pkexec')) {
      return {
        ok: false,
        exitCode: null,
        stdout: '',
        stderr: '',
        error: 'pkexec not installed; install polkit and try again'
      }
    }
    cmd = 'pkexec'
    cmdArgs = [cli, ...args]
  } else {
    cmd = cli
    cmdArgs = args
  }

  try {
    const { stdout, stderr } = await execFileAsync(cmd, cmdArgs, {
      timeout: 5 * 60_000,
      maxBuffer: 4 * 1024 * 1024
    })
    invalidateSetupCapabilitiesCache()
    return { ok: true, exitCode: 0, stdout, stderr }
  } catch (e) {
    invalidateSetupCapabilitiesCache()
    if (e && typeof e === 'object' && 'code' in e) {
      const ne = e as NodeJS.ErrnoException & { stdout?: string; stderr?: string; code?: unknown }
      const exitCode = typeof ne.code === 'number' ? ne.code : null
      return {
        ok: false,
        exitCode,
        stdout: typeof ne.stdout === 'string' ? ne.stdout : '',
        stderr: typeof ne.stderr === 'string' ? ne.stderr : '',
        error: ne.message ?? String(e)
      }
    }
    return {
      ok: false,
      exitCode: null,
      stdout: '',
      stderr: '',
      error: e instanceof Error ? e.message : String(e)
    }
  }
}

/** Compare two semver-ish strings (`X.Y.Z[-pre]`); returns true when `a` is strictly less than `b`. */
export function semverLt(a: string, b: string): boolean {
  const parse = (v: string): number[] => {
    const trimmed = v.trim().replace(/^v/, '').split('-')[0] ?? ''
    return trimmed.split('.').map((n) => {
      const x = Number.parseInt(n, 10)
      return Number.isFinite(x) ? x : 0
    })
  }
  const aa = parse(a)
  const bb = parse(b)
  const len = Math.max(aa.length, bb.length, 3)
  for (let i = 0; i < len; i++) {
    const x = aa[i] ?? 0
    const y = bb[i] ?? 0
    if (x !== y) return x < y
  }
  return false
}

/**
 * Decide whether the first-run wizard should auto-open. Returns false when:
 *  - the stored "seen" version is current or newer (semver compare, no lexicographic traps),
 *  - or nothing actionable is missing (already in a fully-configured state).
 */
export function shouldOpenSetupWizard(
  seenForVersion: string,
  currentVersion: string,
  caps: SetupCapabilities
): boolean {
  const hasSeenCurrent = seenForVersion.trim().length > 0 && !semverLt(seenForVersion, currentVersion)
  if (hasSeenCurrent) return false

  const isAmd = caps.cpuVendor === 'AuthenticAMD'
  const actionableMissing =
    caps.cliMissing ||
    !caps.tools.pkexec ||
    !caps.optionalPkgs.lshw ||
    !caps.optionalPkgs.polkit ||
    !caps.polkitRule.installed ||
    (isAmd && !caps.hwmon.zenpower)

  return actionableMissing
}

/**
 * Computes the wizard state the renderer reads on mount. We combine the version gate with
 * "anything actionable missing?" so a fully-configured user never sees a no-op modal.
 * When the version gate would have fired but nothing was actionable, we proactively mark
 * the current version as seen so the wizard never auto-opens for this version.
 */
export async function computeWizardState(): Promise<SetupWizardState> {
  const currentVersion = app.getVersion()
  const settings = getSettingsSnapshot()
  const seenForVersion = settings.setupWizardSeenForVersion ?? ''
  const caps = await getSetupCapabilities()
  const shouldOpen = shouldOpenSetupWizard(seenForVersion, currentVersion, caps)

  if (!shouldOpen && (seenForVersion.trim().length === 0 || semverLt(seenForVersion, currentVersion))) {
    // Nothing actionable but the wizard would otherwise have shown; auto-mark seen so we
    // don't keep re-evaluating on every launch.
    try {
      await saveSettings({ setupWizardSeenForVersion: currentVersion })
    } catch (e) {
      console.error('[setup] failed to auto-mark wizard seen:', e)
    }
  }

  return { shouldOpen, currentVersion, seenForVersion }
}

export async function markSetupWizardSeen(): Promise<SetupWizardState> {
  const currentVersion = app.getVersion()
  await saveSettings({ setupWizardSeenForVersion: currentVersion })
  return { shouldOpen: false, currentVersion, seenForVersion: currentVersion }
}

export async function resetSetupWizardSeen(): Promise<SetupWizardState> {
  await saveSettings({ setupWizardSeenForVersion: '' })
  return computeWizardState()
}
