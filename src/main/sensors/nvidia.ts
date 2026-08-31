import { execFile as execFileCb } from 'node:child_process'
import { promisify } from 'node:util'
import type { GpuSnapshot, NvidiaTuningSnapshot } from '@shared/types'
import { readText } from './hwmon'
import { emptyGpuTuning } from './gpuShared'

const execFile = promisify(execFileCb)

const MIB = 1024 * 1024

/**
 * Per-poll query field sets, most complete first. `nvidia-smi` rejects the whole
 * query when a single field name is unknown to the driver, so the first set that
 * runs successfully is cached and reused. Notable gaps: `temperature.memory` needs
 * a recent driver, and `clocks_throttle_reasons.*` was renamed `clocks_event_reasons.*`.
 *
 * Every field here is comma-free (a number or a bare token). The CSV output has no
 * quoting, so free text — `name` above all — is queried on its own (`readModel`);
 * mixing it in would let one comma silently shift the whole row.
 */
const BASE_FIELDS = [
  'utilization.gpu',
  'utilization.memory',
  'temperature.gpu',
  'power.draw',
  'power.limit',
  'clocks.current.graphics',
  'clocks.current.memory',
  'fan.speed',
  'memory.used',
  'memory.total',
  'pstate'
]

const LIVE_FIELD_SETS: string[][] = [
  [...BASE_FIELDS, 'temperature.memory', 'clocks_event_reasons.active'],
  [...BASE_FIELDS, 'temperature.memory', 'clocks_throttle_reasons.active'],
  [...BASE_FIELDS, 'clocks_throttle_reasons.active'],
  [...BASE_FIELDS],
  [
    'utilization.gpu',
    'temperature.gpu',
    'power.draw',
    'clocks.current.graphics',
    'clocks.current.memory',
    'fan.speed',
    'memory.used',
    'memory.total'
  ]
]

/** Fields that only change when someone reconfigures the card — polled rarely. */
const STATIC_FIELDS = [
  'power.default_limit',
  'power.min_limit',
  'power.max_limit',
  'clocks.max.graphics',
  'clocks.max.memory',
  'compute_mode',
  'persistence_mode',
  'driver_version'
]

const MODEL_FALLBACK = 'NVIDIA GPU'

const STATIC_TTL_MS = 30_000
/** After a failed probe, wait this long before spawning `nvidia-smi` again. */
const FAILURE_BACKOFF_MS = 60_000

/** NVML bits in `clocks_event_reasons.active`, low → high. */
const THROTTLE_BITS: [number, string][] = [
  [0x1, 'GPU idle'],
  [0x2, 'Applications clocks setting'],
  [0x4, 'SW power cap'],
  [0x8, 'HW slowdown'],
  [0x10, 'Sync boost'],
  [0x20, 'SW thermal slowdown'],
  [0x40, 'HW thermal slowdown'],
  [0x80, 'HW power brake slowdown'],
  [0x100, 'Display clock setting']
]

let liveFieldSet: string[] | null = null
let staticCache: { at: number; row: Row } | null = null
let modelCache: string | null = null
let modelRetryAt = 0
let backoffUntil = 0
let inFlight: Promise<GpuSnapshot | null> | null = null

type Row = Record<string, string>

/** Run one `--query-gpu`, returning the first GPU's cells keyed by field name. */
async function queryGpu(fields: string[]): Promise<Row | null> {
  let stdout: string
  try {
    ;({ stdout } = await execFile(
      'nvidia-smi',
      [`--query-gpu=${fields.join(',')}`, '--format=csv,noheader,nounits'],
      { timeout: 4000 }
    ))
  } catch {
    return null
  }
  const line = stdout.split('\n').find((l) => l.trim() !== '')
  if (line == null) return null

  const cells = line.split(',').map((c) => c.trim())
  // A mismatch means the driver answered in a shape we can't map; better no
  // reading than a row silently shifted by one.
  if (cells.length !== fields.length) return null

  const row: Row = {}
  fields.forEach((f, i) => {
    row[f] = cells[i]
  })
  return row
}

/** `[N/A]`, `[Not Supported]`, `[Unknown Error]`, … all mean "no reading". */
function text(row: Row, field: string): string | null {
  const v = row[field]
  if (v == null) return null
  const t = v.trim()
  if (t === '' || t.startsWith('[') || t === 'N/A') return null
  return t
}

function num(row: Row, field: string): number | null {
  const t = text(row, field)
  if (t == null) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function decodeThrottle(row: Row): string[] {
  const raw =
    text(row, 'clocks_event_reasons.active') ?? text(row, 'clocks_throttle_reasons.active')
  if (raw == null) return []
  const mask = Number.parseInt(raw, 16)
  if (!Number.isFinite(mask) || mask === 0) return []
  return THROTTLE_BITS.filter(([bit]) => (mask & bit) !== 0).map(([, label]) => label)
}

/**
 * True when the kernel module is loaded. Cheap file read that keeps us from
 * spawning `nvidia-smi` on every poll of an AMD-only or Intel-only machine.
 */
export async function nvidiaDriverPresent(): Promise<boolean> {
  return (await readText('/proc/driver/nvidia/version')) != null
}

/**
 * Product name, cached for the process. Queried alone so commas in the name
 * (`NVIDIA A100-PCIE-40GB, Ampere`) can't be mistaken for column separators.
 */
async function readModel(): Promise<string> {
  if (modelCache != null) return modelCache
  // The name never changes, so a failure only earns an occasional retry — never
  // a fresh process on every poll.
  if (Date.now() < modelRetryAt) return MODEL_FALLBACK
  modelRetryAt = Date.now() + STATIC_TTL_MS

  let stdout: string
  try {
    ;({ stdout } = await execFile(
      'nvidia-smi',
      ['--query-gpu=name', '--format=csv,noheader'],
      { timeout: 4000 }
    ))
  } catch {
    return MODEL_FALLBACK
  }
  const line = stdout.split('\n').find((l) => l.trim() !== '')?.trim()
  if (line == null || line === '' || line.startsWith('[')) return MODEL_FALLBACK
  modelCache = line
  return modelCache
}

/** Run the live query, resolving (and caching) the field set the driver accepts. */
async function readLive(): Promise<Row | null> {
  if (liveFieldSet != null) {
    const row = await queryGpu(liveFieldSet)
    if (row != null) return row
    // Driver replaced/upgraded under us, or the card went away — re-resolve.
    liveFieldSet = null
  }
  for (const fields of LIVE_FIELD_SETS) {
    const row = await queryGpu(fields)
    if (row != null) {
      liveFieldSet = fields
      return row
    }
  }
  return null
}

async function readStatic(): Promise<Row> {
  const now = Date.now()
  if (staticCache != null && now - staticCache.at < STATIC_TTL_MS) return staticCache.row
  const row = await queryGpu(STATIC_FIELDS)
  // On failure keep the previous answer (or an empty row) but restart the clock, so a
  // driver that rejects this query isn't re-queried every poll. Missing keys read as null.
  staticCache = { at: now, row: row ?? staticCache?.row ?? {} }
  return staticCache.row
}

/**
 * Read the first NVIDIA GPU via `nvidia-smi`. Returns null when the driver isn't
 * loaded, the binary is missing, or no device answers — callers fall through to
 * the next vendor. Failures back off so a broken setup isn't probed every second.
 *
 * Concurrent callers share one run. The 1 Hz poll has no overlap guard and the
 * renderer can request a snapshot at any time; without this, a `nvidia-smi` that
 * takes longer than the poll interval (common when the GPU is in a deep power
 * state) would pile up processes.
 */
export function readNvidiaSnapshot(): Promise<GpuSnapshot | null> {
  if (inFlight != null) return inFlight
  inFlight = readNvidiaSnapshotUncached().finally(() => {
    inFlight = null
  })
  return inFlight
}

async function readNvidiaSnapshotUncached(): Promise<GpuSnapshot | null> {
  if (Date.now() < backoffUntil) return null
  if (!(await nvidiaDriverPresent())) {
    backoffUntil = Date.now() + FAILURE_BACKOFF_MS
    return null
  }

  const live = await readLive()
  if (live == null) {
    backoffUntil = Date.now() + FAILURE_BACKOFF_MS
    return null
  }
  const [stat, model] = await Promise.all([readStatic(), readModel()])

  const usedMiB = num(live, 'memory.used')
  const totalMiB = num(live, 'memory.total')

  const tuning: NvidiaTuningSnapshot = {
    pstate: text(live, 'pstate'),
    memoryUtil: num(live, 'utilization.memory'),
    driverVersion: text(stat, 'driver_version'),
    persistenceMode: text(stat, 'persistence_mode'),
    computeMode: text(stat, 'compute_mode'),
    powerCapDefaultW: num(stat, 'power.default_limit'),
    powerCapMinW: num(stat, 'power.min_limit'),
    powerCapMaxW: num(stat, 'power.max_limit'),
    maxSclkMHz: num(stat, 'clocks.max.graphics'),
    maxMclkMHz: num(stat, 'clocks.max.memory'),
    throttleReasons: decodeThrottle(live)
  }

  return {
    vendor: 'nvidia',
    model,
    busy: num(live, 'utilization.gpu'),
    tempEdge: num(live, 'temperature.gpu'),
    tempJunction: null,
    tempMemory: num(live, 'temperature.memory'),
    vddgfx: null,
    power: num(live, 'power.draw'),
    powerCap: num(live, 'power.limit'),
    sclkMHz: num(live, 'clocks.current.graphics'),
    mclkMHz: num(live, 'clocks.current.memory'),
    fanRpm: null,
    fanMax: null,
    fanPwm: num(live, 'fan.speed'),
    vramUsedBytes: usedMiB != null ? usedMiB * MIB : null,
    vramTotalBytes: totalMiB != null ? totalMiB * MIB : null,
    tuning: emptyGpuTuning(),
    nvidiaTuning: tuning
  }
}
