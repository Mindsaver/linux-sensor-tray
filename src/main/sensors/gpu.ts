import { exec as execCb } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'
import type { GpuSnapshot, GpuTuningSnapshot } from '@shared/types'
import { findHwmonByName, readLabeledInputs, readNumber, readText } from './hwmon'

const exec = promisify(execCb)

let modelCache: string | null = null

async function readGpuModel(vendorFilter?: 'amd' | 'nvidia'): Promise<string> {
  if (modelCache != null) return modelCache
  try {
    const { stdout } = await exec('lspci -mm', { timeout: 1500 })
    let firstFound: string | null = null
    for (const line of stdout.split('\n')) {
      // -mm output has quoted fields. We pick the first VGA / 3D controller line.
      if (!/VGA|3D|Display/i.test(line)) continue
      const m = line.match(/"([^"]*)"\s+"([^"]*)"\s+"([^"]*)"/)
      if (!m) continue
      const vendor = m[2]
      const device = m[3]
      const model = `${vendor} ${device}`
        .replace(/Advanced Micro Devices, Inc\.\s*/g, 'AMD ')
        .replace(/\s*\[AMD\/ATI\]\s*/g, ' ')
        .trim()
      if (firstFound == null) firstFound = model
      const v = vendor.toLowerCase()
      if (vendorFilter === 'amd' && (v.includes('amd') || v.includes('advanced micro devices'))) {
        modelCache = model
        return modelCache
      }
      if (vendorFilter === 'nvidia' && v.includes('nvidia')) {
        modelCache = model
        return modelCache
      }
      if (!vendorFilter) {
        modelCache = model
        return modelCache
      }
    }
    if (firstFound != null) {
      modelCache = firstFound
      return modelCache
    }
  } catch {
    // ignore
  }
  modelCache = vendorFilter === 'nvidia' ? 'NVIDIA GPU' : vendorFilter === 'amd' ? 'AMD GPU' : 'GPU'
  return modelCache
}

/** Read gpu_busy_percent from the hwmon's parent device dir. */
async function readBusyPercent(hwmonDir: string): Promise<number | null> {
  return readNumber(join(hwmonDir, 'device', 'gpu_busy_percent'))
}

function emptyGpuTuning(): GpuTuningSnapshot {
  return {
    dpmPerformanceLevel: null,
    dpmState: null,
    powerProfileModeRaw: null,
    ppDpmSclk: null,
    ppDpmMclk: null,
    ppOdClkVoltage: null,
    powerCapDefaultW: null,
    powerCapMaxW: null,
    powerCapMinW: null
  }
}

/** Parse numeric telemetry field; returns null for unavailable / unsupported values. */
function parseTelemetryNumber(v: string | undefined): number | null {
  if (!v) return null
  if (/^n\/a$/i.test(v) || /^not supported$/i.test(v) || /^unknown$/i.test(v)) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** DPM / profile / OD tables live under the card device dir; power caps on hwmon. */
async function readGpuTuning(hwmonDir: string): Promise<GpuTuningSnapshot> {
  const dev = join(hwmonDir, 'device')
  const uWtoW = (u: number | null): number | null =>
    u != null && Number.isFinite(u) ? u / 1_000_000 : null

  const [
    dpmPerformanceLevel,
    dpmState,
    powerProfileModeRaw,
    ppDpmSclk,
    ppDpmMclk,
    ppOdClkVoltage,
    capDefUw,
    capMaxUw,
    capMinUw
  ] = await Promise.all([
    readText(join(dev, 'power_dpm_force_performance_level')),
    readText(join(dev, 'power_dpm_state')),
    readText(join(dev, 'pp_power_profile_mode')),
    readText(join(dev, 'pp_dpm_sclk')),
    readText(join(dev, 'pp_dpm_mclk')),
    readText(join(dev, 'pp_od_clk_voltage')),
    readNumber(join(hwmonDir, 'power1_cap_default')),
    readNumber(join(hwmonDir, 'power1_cap_max')),
    readNumber(join(hwmonDir, 'power1_cap_min'))
  ])

  return {
    dpmPerformanceLevel,
    dpmState,
    powerProfileModeRaw,
    ppDpmSclk,
    ppDpmMclk,
    ppOdClkVoltage,
    powerCapDefaultW: uWtoW(capDefUw),
    powerCapMaxW: uWtoW(capMaxUw),
    powerCapMinW: uWtoW(capMinUw)
  }
}

export async function readGpuSnapshot(): Promise<GpuSnapshot> {
  const dir = await findHwmonByName('amdgpu')
  if (!dir) {
    try {
      const { stdout } = await exec(
        'nvidia-smi --query-gpu=name,utilization.gpu,temperature.gpu,power.draw,power.limit,clocks.gr,clocks.mem,fan.speed --format=csv,noheader,nounits',
        { timeout: 1500 }
      )
      const first = stdout
        .split('\n')
        .map((s) => s.trim())
        .find((s) => s.length > 0)
      if (first) {
        const cols = first.split(',').map((s) => s.trim())
        return {
          backend: 'nvidia',
          model: cols[0] || (await readGpuModel('nvidia')),
          busy: parseTelemetryNumber(cols[1]),
          tempEdge: parseTelemetryNumber(cols[2]),
          tempJunction: null,
          tempMemory: null,
          vddgfx: null,
          power: parseTelemetryNumber(cols[3]),
          powerCap: parseTelemetryNumber(cols[4]),
          sclkMHz: parseTelemetryNumber(cols[5]),
          mclkMHz: parseTelemetryNumber(cols[6]),
          fanRpm: null,
          fanMax: null,
          fanPwm: parseTelemetryNumber(cols[7]),
          tuning: emptyGpuTuning()
        }
      }
    } catch {
      // ignore
    }
    return {
      backend: 'unknown',
      model: await readGpuModel(),
      busy: null,
      tempEdge: null,
      tempJunction: null,
      tempMemory: null,
      vddgfx: null,
      power: null,
      powerCap: null,
      sclkMHz: null,
      mclkMHz: null,
      fanRpm: null,
      fanMax: null,
      fanPwm: null,
      tuning: emptyGpuTuning()
    }
  }

  const [model, busy, temps, ins, freqs, fanRpm, fanMax, pwm1Raw, powAvg, powCap, tuning] =
    await Promise.all([
      readGpuModel('amd'),
      readBusyPercent(dir),
      readLabeledInputs(dir, 'temp'),
      readLabeledInputs(dir, 'in'),
      readLabeledInputs(dir, 'freq'),
      readNumber(join(dir, 'fan1_input')),
      readNumber(join(dir, 'fan1_max')),
      readNumber(join(dir, 'pwm1')),
      readNumber(join(dir, 'power1_average')),
      readNumber(join(dir, 'power1_cap')),
      readGpuTuning(dir)
    ])

  const findByLabel = <T extends { label: string | null; value: number }>(
    arr: T[],
    label: string
  ): number | null => arr.find((x) => x.label === label)?.value ?? null

  const tempEdge = findByLabel(temps, 'edge')
  const tempJunction = findByLabel(temps, 'junction')
  const tempMemory = findByLabel(temps, 'mem')
  const vddgfx = findByLabel(ins, 'vddgfx')
  const sclk = findByLabel(freqs, 'sclk')
  const mclk = findByLabel(freqs, 'mclk')

  return {
    backend: 'amdgpu',
    model,
    busy,
    tempEdge,
    tempJunction,
    tempMemory,
    vddgfx,
    power: powAvg != null ? powAvg / 1_000_000 : null,
    powerCap: powCap != null ? powCap / 1_000_000 : null,
    sclkMHz: sclk,
    mclkMHz: mclk,
    fanRpm,
    fanMax,
    fanPwm: pwm1Raw != null ? (pwm1Raw * 100) / 255 : null,
    tuning
  }
}
