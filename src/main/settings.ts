import { app } from 'electron'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { AppSettings, PrivilegedSystemProbeMode } from '@shared/types'

export const SETTINGS_FILENAME = 'linux-sensor-tray-settings.json'
const LEGACY_SETTINGS_FILENAME = 'monitor-settings.json'

const DEFAULTS: AppSettings = {
  historyRetentionMinutes: 360,
  chartWindowMinutes: 1,
  diskLogEnabled: false,
  diskLogIntervalSeconds: 1,
  diskLogDirectory: null,
  trayEnabled: true,
  openAtLogin: false,
  privilegedSystemProbe: 'onDemand'
}

const PRIVILEGED_PROBE_MODES: readonly PrivilegedSystemProbeMode[] = ['off', 'onDemand', 'always']

const MIN_RETENTION = 10
const MAX_RETENTION = 10080 // 7 days @ 1 Hz ≈ 604k points (~tens of MB RAM)

const MIN_DISK_LOG_INTERVAL_SEC = 1
const MAX_DISK_LOG_INTERVAL_SEC = 3600

let cached: AppSettings | null = null

function clampSettings(partial: AppSettings): AppSettings {
  let history = Math.round(partial.historyRetentionMinutes)
  if (!Number.isFinite(history)) history = DEFAULTS.historyRetentionMinutes
  history = Math.max(MIN_RETENTION, Math.min(MAX_RETENTION, history))

  let chart = Math.round(partial.chartWindowMinutes)
  if (!Number.isFinite(chart)) chart = DEFAULTS.chartWindowMinutes
  chart = Math.max(1, Math.min(history, chart))

  const diskLogDirectory =
    partial.diskLogDirectory == null || partial.diskLogDirectory === ''
      ? null
      : partial.diskLogDirectory

  let diskLogIntervalSeconds = Math.round(partial.diskLogIntervalSeconds ?? DEFAULTS.diskLogIntervalSeconds)
  if (!Number.isFinite(diskLogIntervalSeconds)) diskLogIntervalSeconds = DEFAULTS.diskLogIntervalSeconds
  diskLogIntervalSeconds = Math.max(
    MIN_DISK_LOG_INTERVAL_SEC,
    Math.min(MAX_DISK_LOG_INTERVAL_SEC, diskLogIntervalSeconds)
  )

  const trayEnabled =
    partial.trayEnabled === true || partial.trayEnabled === false
      ? partial.trayEnabled
      : DEFAULTS.trayEnabled

  const p = partial.privilegedSystemProbe as unknown
  const privilegedSystemProbe: PrivilegedSystemProbeMode =
    p === true
      ? 'always'
      : p === false
        ? 'off'
        : PRIVILEGED_PROBE_MODES.includes(p as PrivilegedSystemProbeMode)
          ? (p as PrivilegedSystemProbeMode)
          : DEFAULTS.privilegedSystemProbe

  return {
    historyRetentionMinutes: history,
    chartWindowMinutes: chart,
    diskLogEnabled: Boolean(partial.diskLogEnabled),
    diskLogIntervalSeconds,
    diskLogDirectory,
    trayEnabled,
    openAtLogin: Boolean(partial.openAtLogin),
    privilegedSystemProbe
  }
}

export function getDefaultLogDirectory(): string {
  return join(app.getPath('userData'), 'sensor_logs')
}

export function resolveLogDirectory(s: AppSettings): string {
  const d = s.diskLogDirectory?.trim()
  if (d) return d
  return getDefaultLogDirectory()
}

async function readFromDisk(): Promise<{ settings: AppSettings; migrated: boolean }> {
  const ud = app.getPath('userData')
  const primary = join(ud, SETTINGS_FILENAME)
  try {
    const raw = await readFile(primary, 'utf8')
    const j = JSON.parse(raw) as Partial<AppSettings>
    return { settings: clampSettings({ ...DEFAULTS, ...j }), migrated: false }
  } catch {
    // ignore
  }

  const legacy = join(dirname(ud), 'monitor', LEGACY_SETTINGS_FILENAME)
  try {
    const raw = await readFile(legacy, 'utf8')
    const j = JSON.parse(raw) as Partial<AppSettings>
    return { settings: clampSettings({ ...DEFAULTS, ...j }), migrated: true }
  } catch {
    // ignore
  }

  return { settings: { ...DEFAULTS }, migrated: false }
}

export async function initSettings(): Promise<AppSettings> {
  const { settings, migrated } = await readFromDisk()
  cached = settings
  if (migrated) {
    const dir = app.getPath('userData')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, SETTINGS_FILENAME), JSON.stringify(settings, null, 2), 'utf8')
  }
  return cached
}

export function getSettingsSnapshot(): AppSettings {
  if (!cached) return { ...DEFAULTS }
  return { ...cached }
}

export async function saveSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
  const base = cached ?? DEFAULTS
  const cleaned = Object.fromEntries(
    Object.entries(partial).filter(([, v]) => v !== undefined)
  ) as Partial<AppSettings>
  const merged = clampSettings({ ...base, ...cleaned })
  const dir = app.getPath('userData')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, SETTINGS_FILENAME), JSON.stringify(merged, null, 2), 'utf8')
  cached = merged
  return merged
}
