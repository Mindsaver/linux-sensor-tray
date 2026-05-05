import { promises as fs } from 'node:fs'
import { join } from 'node:path'

const HWMON_ROOT = '/sys/class/hwmon'

/** Read a sysfs file as trimmed text. Returns null on any error. */
export async function readText(path: string): Promise<string | null> {
  try {
    const t = await fs.readFile(path, 'utf8')
    return t.trim()
  } catch {
    return null
  }
}

/** Read a sysfs file as a number. Returns null on any error. */
export async function readNumber(path: string): Promise<number | null> {
  const t = await readText(path)
  if (t == null) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/** List all `/sys/class/hwmon/hwmonN` directories. */
export async function listHwmon(): Promise<string[]> {
  try {
    const entries = await fs.readdir(HWMON_ROOT)
    return entries.map((e) => join(HWMON_ROOT, e))
  } catch {
    return []
  }
}

/** Find the first hwmon directory whose `name` file equals `name`. */
export async function findHwmonByName(name: string): Promise<string | null> {
  for (const dir of await listHwmon()) {
    const n = await readText(join(dir, 'name'))
    if (n === name) return dir
  }
  return null
}

/** Find all hwmon directories whose `name` matches. */
export async function findAllHwmonByName(name: string): Promise<string[]> {
  const out: string[] = []
  for (const dir of await listHwmon()) {
    const n = await readText(join(dir, 'name'))
    if (n === name) out.push(dir)
  }
  return out
}

export type LabeledReading = {
  /** Numeric index from filename, e.g. `1` for `temp1_input`. */
  index: number
  /** Optional label loaded from `<prefix><N>_label`, otherwise null. */
  label: string | null
  /** Already-scaled value in target unit (°C, V, W, A, RPM, MHz, %). */
  value: number
  /** Raw value before scaling. */
  raw: number
}

const SCALES: Record<string, number> = {
  temp: 1 / 1000, // millidegree → °C
  in: 1 / 1000, // millivolt → V
  power: 1 / 1_000_000, // microwatt → W
  curr: 1 / 1000, // milliamp → A
  fan: 1, // RPM
  freq: 1 / 1_000_000, // Hz → MHz
  pwm: 100 / 255 // 0-255 → 0-100 %
}

/**
 * Read all `<prefix>N_input` files in a hwmon dir, with their `<prefix>N_label`
 * if present. Values are scaled to target units.
 */
export async function readLabeledInputs(
  hwmonDir: string,
  prefix: keyof typeof SCALES
): Promise<LabeledReading[]> {
  let files: string[]
  try {
    files = await fs.readdir(hwmonDir)
  } catch {
    return []
  }
  const re = new RegExp(`^${prefix}(\\d+)_input$`)
  const out: LabeledReading[] = []
  for (const f of files) {
    const m = re.exec(f)
    if (!m) continue
    const idx = Number(m[1])
    const raw = await readNumber(join(hwmonDir, f))
    if (raw == null) continue
    const label = await readText(join(hwmonDir, `${prefix}${idx}_label`))
    out.push({ index: idx, label, value: raw * SCALES[prefix], raw })
  }
  out.sort((a, b) => a.index - b.index)
  return out
}

/** Read pwmN files (0-255) scaled to 0-100 %. */
export async function readPwms(hwmonDir: string): Promise<{ index: number; pwm: number }[]> {
  let files: string[]
  try {
    files = await fs.readdir(hwmonDir)
  } catch {
    return []
  }
  const re = /^pwm(\d+)$/
  const out: { index: number; pwm: number }[] = []
  for (const f of files) {
    const m = re.exec(f)
    if (!m) continue
    const idx = Number(m[1])
    const raw = await readNumber(join(hwmonDir, f))
    if (raw == null) continue
    out.push({ index: idx, pwm: (raw * 100) / 255 })
  }
  out.sort((a, b) => a.index - b.index)
  return out
}

export const SCALE_FACTORS = SCALES
