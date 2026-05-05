import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import os from 'node:os'
import type { CpuSnapshot, CpuTuningSnapshot } from '@shared/types'
import {
  findHwmonByName,
  readLabeledInputs,
  readNumber,
  readText
} from './hwmon'

type CpuTimes = { idle: number; total: number }
type StatParsed = { all: CpuTimes; cores: CpuTimes[] }

/** Parse /proc/stat into idle and total ticks for the aggregate `cpu` line and each `cpuN` line. */
function parseStat(text: string): StatParsed {
  let all: CpuTimes = { idle: 0, total: 0 }
  const coresMap: Map<number, CpuTimes> = new Map()
  for (const line of text.split('\n')) {
    if (!line.startsWith('cpu')) continue
    const parts = line.trim().split(/\s+/)
    const head = parts[0]
    const cols = parts.slice(1).map((n) => Number(n))
    if (cols.some((n) => !Number.isFinite(n))) continue
    // user nice system idle iowait irq softirq steal guest guest_nice
    const [user = 0, nice = 0, system = 0, idle = 0, iowait = 0, irq = 0, softirq = 0, steal = 0] =
      cols
    const idleAll = idle + iowait
    const total = user + nice + system + idle + iowait + irq + softirq + steal
    if (head === 'cpu') {
      all = { idle: idleAll, total }
    } else {
      const m = /^cpu(\d+)$/.exec(head)
      if (m) coresMap.set(Number(m[1]), { idle: idleAll, total })
    }
  }
  const max = coresMap.size === 0 ? -1 : Math.max(...coresMap.keys())
  const cores: CpuTimes[] = []
  for (let i = 0; i <= max; i++) cores.push(coresMap.get(i) ?? { idle: 0, total: 0 })
  return { all, cores }
}

let prev: StatParsed | null = null

/** Compute load percentages from two /proc/stat reads. First call returns zeros. */
async function readCpuLoad(): Promise<{ total: number; cores: number[] }> {
  const text = await fs.readFile('/proc/stat', 'utf8')
  const cur = parseStat(text)
  if (!prev) {
    prev = cur
    return { total: 0, cores: cur.cores.map(() => 0) }
  }
  const pct = (a: CpuTimes, b: CpuTimes): number => {
    const dT = b.total - a.total
    const dI = b.idle - a.idle
    if (dT <= 0) return 0
    return Math.max(0, Math.min(100, ((dT - dI) / dT) * 100))
  }
  const total = pct(prev.all, cur.all)
  const cores = cur.cores.map((c, i) => {
    const p = prev!.cores[i]
    return p ? pct(p, c) : 0
  })
  prev = cur
  return { total, cores }
}

async function readCoreFrequencies(count: number): Promise<(number | null)[]> {
  const out: (number | null)[] = []
  for (let i = 0; i < count; i++) {
    const khz = await readNumber(`/sys/devices/system/cpu/cpu${i}/cpufreq/scaling_cur_freq`)
    out.push(khz != null ? khz / 1000 : null)
  }
  return out
}

async function readCpuModel(): Promise<string> {
  try {
    const text = await fs.readFile('/proc/cpuinfo', 'utf8')
    const m = /^model name\s*:\s*(.+)$/m.exec(text)
    if (m) return m[1].trim()
  } catch {
    // ignore
  }
  return os.cpus()[0]?.model ?? 'Unknown CPU'
}

/** Map zenpower readings into the CpuSnapshot shape. */
async function readZenpower(): Promise<{
  hasZen: boolean
  tempTctl: number | null
  tempTdie: number | null
  tempCcds: number[]
  vCore: number | null
  vSoC: number | null
  pCore: number | null
  pSoC: number | null
  iCore: number | null
  iSoC: number | null
}> {
  const dir = await findHwmonByName('zenpower')
  if (!dir) {
    // Fall back to k10temp (only Tctl/Tdie are exposed, no voltages/power).
    const k10 = await findHwmonByName('k10temp')
    let tdie: number | null = null
    let tctl: number | null = null
    if (k10) {
      for (const t of await readLabeledInputs(k10, 'temp')) {
        if (t.label === 'Tctl') tctl = t.value
        else if (t.label === 'Tdie') tdie = t.value
      }
    }
    return {
      hasZen: false,
      tempTctl: tctl,
      tempTdie: tdie,
      tempCcds: [],
      vCore: null,
      vSoC: null,
      pCore: null,
      pSoC: null,
      iCore: null,
      iSoC: null
    }
  }

  const temps = await readLabeledInputs(dir, 'temp')
  const ins = await readLabeledInputs(dir, 'in')
  const powers = await readLabeledInputs(dir, 'power')
  const currents = await readLabeledInputs(dir, 'curr')

  let tctl: number | null = null
  let tdie: number | null = null
  const ccds: number[] = []
  for (const t of temps) {
    const label = t.label ?? ''
    if (label === 'Tctl') tctl = t.value
    else if (label === 'Tdie') tdie = t.value
    else if (/^Tccd\d+$/.test(label)) ccds.push(t.value)
  }

  const labelMap = <T extends { label: string | null; value: number }>(
    arr: T[],
    label: string
  ): number | null => arr.find((x) => x.label === label)?.value ?? null

  return {
    hasZen: true,
    tempTctl: tctl,
    tempTdie: tdie,
    tempCcds: ccds,
    vCore: labelMap(ins, 'SVI2_Core'),
    vSoC: labelMap(ins, 'SVI2_SoC'),
    pCore: labelMap(powers, 'SVI2_P_Core'),
    pSoC: labelMap(powers, 'SVI2_P_SoC'),
    iCore: labelMap(currents, 'SVI2_C_Core'),
    iSoC: labelMap(currents, 'SVI2_C_SoC')
  }
}

/** cpufreq policy for cpu0 — representative for homogeneous Ryzen desktop CPUs. */
async function readCpuTuning(): Promise<CpuTuningSnapshot> {
  const base = '/sys/devices/system/cpu/cpu0/cpufreq'
  const khzToMHz = (khz: number | null): number | null =>
    khz != null && Number.isFinite(khz) ? khz / 1000 : null

  const [
    cpufreqDriver,
    governor,
    cpuinfoMaxKhz,
    cpuinfoMinKhz,
    scalingMaxKhz,
    scalingMinKhz,
    biosLimitKhz,
    energyPerformancePreference,
    boostRaw,
    amdPstateStatus
  ] = await Promise.all([
    readText(join(base, 'scaling_driver')),
    readText(join(base, 'scaling_governor')),
    readNumber(join(base, 'cpuinfo_max_freq')),
    readNumber(join(base, 'cpuinfo_min_freq')),
    readNumber(join(base, 'scaling_max_freq')),
    readNumber(join(base, 'scaling_min_freq')),
    readNumber(join(base, 'bios_limit')),
    readText(join(base, 'energy_performance_preference')),
    readText(join(base, 'scaling_boost_frequencies')),
    readText('/sys/devices/system/cpu/amd_pstate/status')
  ])

  const boostFreqsMHz: number[] = []
  if (boostRaw) {
    for (const part of boostRaw.split(/[\s,]+/)) {
      if (!part) continue
      const n = Number(part)
      if (Number.isFinite(n) && n > 0) boostFreqsMHz.push(n / 1000)
    }
  }

  return {
    cpufreqDriver,
    governor,
    cpuinfoMinMHz: khzToMHz(cpuinfoMinKhz),
    cpuinfoMaxMHz: khzToMHz(cpuinfoMaxKhz),
    scalingMinMHz: khzToMHz(scalingMinKhz),
    scalingMaxMHz: khzToMHz(scalingMaxKhz),
    biosLimitMHz: khzToMHz(biosLimitKhz),
    energyPerformancePreference,
    amdPstateStatus,
    boostFreqsMHz
  }
}

let modelCache: string | null = null

export async function readCpuSnapshot(): Promise<CpuSnapshot> {
  if (modelCache == null) modelCache = await readCpuModel()

  const [load, freqs, zen, tuning] = await Promise.all([
    readCpuLoad(),
    readCoreFrequencies(os.cpus().length),
    readZenpower(),
    readCpuTuning()
  ])

  const cores = load.cores.map((l, i) => ({
    index: i,
    load: l,
    freqMHz: freqs[i] ?? null
  }))

  return {
    model: modelCache,
    loadTotal: load.total,
    cores,
    tempTctl: zen.tempTctl,
    tempTdie: zen.tempTdie,
    tempCcds: zen.tempCcds,
    vCore: zen.vCore,
    vSoC: zen.vSoC,
    pCore: zen.pCore,
    pSoC: zen.pSoC,
    iCore: zen.iCore,
    iSoC: zen.iSoC,
    hasZenpower: zen.hasZen,
    tuning
  }
}

// Allow swapping in tests if needed.
export const _internals = { parseStat, readText }
