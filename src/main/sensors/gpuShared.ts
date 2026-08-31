import type { GpuSnapshot, GpuTuningSnapshot, GpuVendor } from '@shared/types'

/** AMDGPU tuning block with nothing read — used as-is by non-AMD vendors. */
export function emptyGpuTuning(): GpuTuningSnapshot {
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

/** A snapshot with no readings — the shape the UI renders as all em-dashes. */
export function emptyGpuSnapshot(vendor: GpuVendor, model: string): GpuSnapshot {
  return {
    vendor,
    model,
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
    vramUsedBytes: null,
    vramTotalBytes: null,
    tuning: emptyGpuTuning(),
    nvidiaTuning: null
  }
}
