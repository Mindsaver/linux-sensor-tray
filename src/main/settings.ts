import { app } from 'electron'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { AppSettings } from '@shared/types'

export const SETTINGS_FILENAME = 'linux-sensor-tray-settings.json'
const LEGACY_SETTINGS_FILENAME = 'monitor-settings.json'

const DEFAULTS: AppSettings = {
  historyRetentionMinutes: 360,
  chartWindowMinutes: 1,
  diskLogEnabled: false,
  diskLogDirectory: null
}

const MIN_RETENTION = 10
const MAX_RETENTION = 10080 // 7 days @ 1 Hz ≈ 604k points (~tens of MB RAM)

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

  return {
    historyRetentionMinutes: history,
    chartWindowMinutes: chart,
    diskLogEnabled: Boolean(partial.diskLogEnabled),
    diskLogDirectory
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
  const merged = clampSettings({ ...base, ...partial })
  const dir = app.getPath('userData')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, SETTINGS_FILENAME), JSON.stringify(merged, null, 2), 'utf8')
  cached = merged
  return merged
}
