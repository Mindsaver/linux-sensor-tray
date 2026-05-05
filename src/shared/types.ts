export type CpuCore = {
  index: number
  load: number // 0-100
  freqMHz: number | null
}

export type CpuSnapshot = {
  model: string
  loadTotal: number // 0-100
  cores: CpuCore[]
  tempTctl: number | null // °C
  tempTdie: number | null // °C
  tempCcds: number[] // per CCD, °C
  vCore: number | null // V
  vSoC: number | null // V
  pCore: number | null // W
  pSoC: number | null // W
  iCore: number | null // A
  iSoC: number | null // A
  /** True if zenpower is loaded; otherwise we fall back to k10temp (less detail). */
  hasZenpower: boolean
  /**
   * Frequency / P-state limits from cpufreq (mostly cpu0 policy).
   * Useful to see BIOS ceiling vs OS cap, governor, and amd-pstate mode — not a full Ryzen Master view.
   */
  tuning: CpuTuningSnapshot
}

/** CPU tuning / limit info from sysfs (no root). */
export type CpuTuningSnapshot = {
  cpufreqDriver: string | null
  governor: string | null
  /** Fused / firmware-reported limits (MHz). */
  cpuinfoMinMHz: number | null
  cpuinfoMaxMHz: number | null
  /** Current scaling cap / floor (MHz). */
  scalingMinMHz: number | null
  scalingMaxMHz: number | null
  /** BIOS OC ceiling when exposed (MHz). */
  biosLimitMHz: number | null
  /** `energy_performance_preference` (amd-pstate-epp), e.g. performance, balance_power. */
  energyPerformancePreference: string | null
  /** `/sys/.../amd_pstate/status`: active, passive, guided, … */
  amdPstateStatus: string | null
  /** Parsed boost step frequencies (MHz) when `scaling_boost_frequencies` exists. */
  boostFreqsMHz: number[]
}

export type GpuSnapshot = {
  model: string
  /** GPU usage 0-100 (gpu_busy_percent). */
  busy: number | null
  tempEdge: number | null
  tempJunction: number | null
  tempMemory: number | null
  /** vddgfx, V */
  vddgfx: number | null
  /** instantaneous package power (W) */
  power: number | null
  /** package power cap (W) */
  powerCap: number | null
  /** Shader/core clock, MHz */
  sclkMHz: number | null
  /** Memory clock, MHz */
  mclkMHz: number | null
  /** Fan rpm */
  fanRpm: number | null
  /** Fan max rpm */
  fanMax: number | null
  /** Fan PWM duty 0-100 */
  fanPwm: number | null
  /**
   * DPM / power-profile / OD tables from amdgpu sysfs.
   * “Overclock” in the driver is usually manual DPM + `pp_od_clk_voltage`; values appear when the stack exposes them.
   */
  tuning: GpuTuningSnapshot
}

/** GPU tuning / DPM info from sysfs (no root; some files only populate in manual/OC modes). */
export type GpuTuningSnapshot = {
  /** `power_dpm_force_performance_level`: auto, low, high, manual, profile_*, … */
  dpmPerformanceLevel: string | null
  /** `power_dpm_state` */
  dpmState: string | null
  /** Raw `pp_power_profile_mode` (often multi-line). */
  powerProfileModeRaw: string | null
  /** Multi-line DPM state table for sclk (* = active). */
  ppDpmSclk: string | null
  ppDpmMclk: string | null
  /** `pp_od_clk_voltage` when readable (WattMan-style OD table). */
  ppOdClkVoltage: string | null
  powerCapDefaultW: number | null
  powerCapMaxW: number | null
  powerCapMinW: number | null
}

export type MemorySnapshot = {
  totalKB: number
  availableKB: number
  usedKB: number
  swapTotalKB: number
  swapFreeKB: number
  swapUsedKB: number
}

export type MoboVoltage = { label: string; volts: number }
export type MoboFan = { label: string; rpm: number }
export type MoboTemp = { label: string; tempC: number }

export type MainboardSnapshot = {
  /** chip name, e.g. nct6687 */
  chip: string | null
  voltages: MoboVoltage[]
  fans: MoboFan[]
  temps: MoboTemp[]
}

export type StorageDevice = {
  /** human-readable device label, e.g. nvme0 */
  label: string
  composite: number | null
  sensorsAdditional: { label: string; tempC: number }[]
}

export type StorageSnapshot = {
  drives: StorageDevice[]
}

export type SensorSnapshot = {
  /** ms since epoch */
  timestamp: number
  cpu: CpuSnapshot
  gpu: GpuSnapshot
  memory: MemorySnapshot
  mainboard: MainboardSnapshot
  storage: StorageSnapshot
}

/** One row per poll (~1 Hz) for charts and optional JSONL export. */
export type HistoryPoint = {
  t: number
  cpuLoad: number
  cpuTctl: number | null
  /** Mean of per-core `scaling_cur_freq` (MHz); null if no cores report. */
  cpuAvgMHz: number | null
  cpuVcore: number | null
  cpuPCore: number | null
  gpuBusy: number | null
  gpuEdge: number | null
  gpuJunction: number | null
  gpuMem: number | null
  gpuVddgfx: number | null
  gpuPower: number | null
  ramUsedPct: number
}

/** Persisted UI / logging preferences (`userData/linux-sensor-tray-settings.json`; legacy `monitor-settings.json` is migrated once). */
export type AppSettings = {
  /** In-memory ring buffer length; at 1 Hz this is minutes × 60 samples. Clamped 10 min … 7 d. */
  historyRetentionMinutes: number
  /** Chart time span; cannot exceed retention. */
  chartWindowMinutes: number
  diskLogEnabled: boolean
  /** Absolute path, or null for default under Electron userData/sensor_logs */
  diskLogDirectory: string | null
}

export type AppSettingsResolved = AppSettings & {
  resolvedLogDirectory: string
}

export const IPC_CHANNEL_SNAPSHOT = 'sensors:snapshot'
