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

/** Distro package managers we can drive non-interactively from `linux-sensor-tray-setup install-deps`. */
export type SetupPkgManager = 'pacman' | 'apt' | 'dnf' | 'zypper' | 'unknown'

/** Per-process snapshot of optional setup state (driven by `linux-sensor-tray-setup doctor --json`). */
export type SetupCapabilities = {
  /** True when the CLI wasn't found on PATH and the data below is synthesized in main. */
  cliMissing: boolean
  /** Absolute path to `linux-sensor-tray-setup`, null when synthesized fallback. */
  cliPath: string | null
  /** Reason the CLI couldn't be invoked (only set when `cliMissing` is true). */
  cliError?: string
  cpuVendor: 'AuthenticAMD' | 'GenuineIntel' | 'other'
  distro: {
    id: string
    idLike: string[]
    pkgManager: SetupPkgManager
  }
  hwmon: {
    zenpower: boolean
    k10temp: boolean
    blacklistFile: string
    blacklistInstalled: boolean
  }
  polkitRule: { installed: boolean; path: string }
  tools: { pkexec: boolean; lshw: boolean; yay: boolean; paru: boolean }
  optionalPkgs: { lshw: boolean; polkit: boolean; 'zenpower3-dkms': boolean }
}

/** Result of a privileged setup CLI invocation (zenpower / polkit-rule / install-deps). */
export type SetupCommandResult = {
  ok: boolean
  exitCode: number | null
  stdout: string
  stderr: string
  error?: string
}

/** Whether to open the first-run wizard on this launch; main process decides via semver compare. */
export type SetupWizardState = {
  shouldOpen: boolean
  currentVersion: string
  seenForVersion: string
}

/** Persisted UI / logging preferences (`userData/linux-sensor-tray-settings.json`; legacy `monitor-settings.json` is migrated once). */
export type AppSettings = {
  /** In-memory ring buffer length; at 1 Hz this is minutes × 60 samples. Clamped 10 min … 7 d. */
  historyRetentionMinutes: number
  /** Chart time span; cannot exceed retention. */
  chartWindowMinutes: number
  diskLogEnabled: boolean
  /** Minimum seconds between disk log lines (poll is ~1 Hz). Clamped in main process. Default 1. */
  diskLogIntervalSeconds: number
  /** Absolute path, or null for default under Electron userData/sensor_logs */
  diskLogDirectory: string | null
  /**
   * When true (default), a tray icon is shown and closing the window hides it.
   * When false, there is no tray entry and closing the window quits the app.
   */
  trayEnabled: boolean
  /**
   * Linux packaged builds only: write XDG autostart (`~/.config/autostart/…`).
   * Ignored in dev and on non-Linux platforms.
   */
  openAtLogin: boolean
  /**
   * Linux only privileged hardware probe via `pkexec /usr/sbin/lshw -json`.
   * - 'off'      — never call pkexec; only unprivileged lshw runs.
   * - 'onDemand' — System info shows an "Enrich with root data" button that triggers pkexec on click (app default).
   * - 'always'   — every System info refresh runs pkexec (use with a polkit YES rule to skip prompts).
   */
  privilegedSystemProbe: PrivilegedSystemProbeMode
  /**
   * Highest app version for which the user clicked "Don't show anymore" on the first-run setup wizard.
   * Empty string means the wizard has not been dismissed yet. Compared with semver to decide auto-open.
   * "Skip" does NOT write this field — it closes for the session only.
   */
  setupWizardSeenForVersion: string
}

export type PrivilegedSystemProbeMode = 'off' | 'onDemand' | 'always'

export type AppSettingsResolved = AppSettings & {
  resolvedLogDirectory: string
  /** Whether `openAtLogin` can take effect (packaged Linux AppImage/deb-style install). */
  openAtLoginSupported: boolean
  /** True when `privilegedSystemProbe` applies (Linux). */
  privilegedSystemProbeSupported: boolean
}

export const IPC_CHANNEL_SNAPSHOT = 'sensors:snapshot'

/** Static / slow-changing hardware + OS summary from `systeminformation` (main process). */
export type SystemInfoOs = {
  hostname: string
  distro: string
  release: string
  kernel: string
  arch: string
  platform: string
  uefi: boolean | null
}

export type SystemInfoHardware = {
  manufacturer: string
  model: string
  version: string
  serial: string
  virtual: boolean
}

export type SystemInfoBios = {
  vendor: string
  version: string
  releaseDate: string
}

export type SystemInfoBaseboard = {
  manufacturer: string
  model: string
  version: string
  serial: string
  memSlots: number | null
  memMaxMB: number | null
}

export type SystemInfoCpu = {
  manufacturer: string
  brand: string
  vendor: string
  cores: number
  physicalCores: number
  processors: number
  socket: string
  speedGHz: number
  speedMinGHz: number
  speedMaxGHz: number
  governor: string
  virtualization: boolean
  /** Level 3 cache in MB when reported. */
  cacheL3MB: number | null
}

export type SystemInfoMemoryModule = {
  sizeBytes: number
  type: string
  manufacturer: string
  partNum: string
  clockMHz: number | null
  formFactor: string
  /** Bank / slot locator when SMBIOS, EDAC, or lshw provides it. */
  slot?: string
  serialNum?: string
}

export type SystemInfoMemorySummary = {
  totalBytes: number
  modules: SystemInfoMemoryModule[]
}

export type SystemInfoGpu = {
  vendor: string
  model: string
  bus: string
  vramBytes: number | null
  driverVersion: string | null
}

export type SystemInfoDisk = {
  device: string
  type: string
  name: string
  vendor: string
  sizeBytes: number
  interfaceType: string
  serialNum: string
  firmware: string
  tempC: number | null
}

export type SystemInfoFs = {
  mount: string
  fs: string
  type: string
  sizeBytes: number
  usedBytes: number
  usePct: number
}

export type SystemInfoNet = {
  iface: string
  mac: string
  ip4: string
  speedMbps: number | null
  operstate: string
  internal: boolean
  virtual: boolean
}

export type SystemInfoDisplay = {
  vendor: string
  model: string
  resolution: string
  refreshHz: number | null
  connection: string | null
}

export type SystemInfoBlockDev = {
  name: string
  type: string
  mount: string
  sizeBytes: number
  removable: boolean
  model: string
}

export type SystemInfoLshwNvme = {
  product: string
  vendor: string
  serial: string
  sizeBytes: number | null
  device: string
}

/** Optional fields from a full `lshw -json` parse (excluding probe mode). */
export type SystemInfoLshwParsed = {
  cpuCacheBytes?: { l1?: number; l2?: number; l3?: number }
  primaryGpuProduct?: string
  systemProduct?: string
  baseboardSerial?: string
  nvmeDevices?: SystemInfoLshwNvme[]
  notableUsb?: { vendor: string; product: string }[]
  amdCryptoCoprocessor?: boolean
}

/** Optional fields from a full `lshw -json` parse (privileged or user). */
export type SystemInfoLshwExtras = SystemInfoLshwParsed & {
  probeSource: 'pkexec' | 'user'
}

export type SystemInfoSnapshot = {
  collectedAt: number
  os: SystemInfoOs | null
  hardware: SystemInfoHardware | null
  bios: SystemInfoBios | null
  baseboard: SystemInfoBaseboard | null
  chassis: { manufacturer: string; model: string; type: string } | null
  cpu: SystemInfoCpu | null
  memory: SystemInfoMemorySummary | null
  gpus: SystemInfoGpu[]
  displays: SystemInfoDisplay[]
  disks: SystemInfoDisk[]
  blockDevices: SystemInfoBlockDev[]
  filesystems: SystemInfoFs[]
  network: SystemInfoNet[]
  /** Full lshw parse when the probe succeeded; merge with `gpus` / baseboard in UI as needed. */
  lshwExtras: SystemInfoLshwExtras | null
  /**
   * Linux: how to enable a polkit rule for richer SMBIOS. Null when not applicable or already using privileged probe.
   */
  privilegedProbeHint: string | null
  /** Non-fatal collection issues (missing dmidecode, permission, …). */
  warnings: string[]
}

export type TaskProcessRow = {
  pid: number
  ppid?: number
  /** “Name” column (best-effort; may be command basename depending on source). */
  name: string
  /** CPU usage percent (best-effort), typically 0-100. */
  cpuPct: number | null
  /** Resident memory bytes (best-effort). */
  memRssBytes: number | null
  /** Virtual memory size bytes (best-effort). */
  memVszBytes?: number | null
  user: string | null
  state: string | null
  nice?: number | null
  priority?: number | null
  /** CPU time (seconds), best-effort. */
  cpuTimeSec?: number | null
  command: string | null
}

export type TaskMonitorSummary = {
  /** Seconds since boot. */
  uptimeSec: number
  /** 1, 5, 15 minute load average. */
  loadAvg: [number, number, number]
  /** Total tasks on the system (best-effort). */
  taskCount: number
  /** Total threads across tasks (best-effort). */
  threadCount?: number
  /** Number of running tasks (best-effort). */
  runningCount?: number
  /** Number of kernel threads (best-effort). */
  kernelThreadCount?: number
  /** Memory breakdown (bytes), best-effort. */
  mem?: {
    totalBytes: number
    usedBytes: number
    freeBytes: number
    /** Buffers + cache combined (Linux). */
    buffCacheBytes?: number
    buffersBytes?: number
    cachedBytes?: number
  }
  /** Swap breakdown (bytes), best-effort. */
  swap?: {
    totalBytes: number
    usedBytes: number
    freeBytes: number
  }
}

export type TaskMonitorSnapshot = {
  collectedAt: number
  summary: TaskMonitorSummary
  list: TaskProcessRow[]
  warnings?: string[]
}

/** Polkit rules body (shown verbatim in Settings). */
export const PRIVILEGED_PROBE_POLKIT_RULES = `polkit.addRule(function(action, subject) {
  if (action.id !== "org.freedesktop.policykit.exec") return;
  var prog = action.lookup("program");
  if (prog !== "/usr/sbin/lshw" && prog !== "/usr/bin/lshw") return;
  if (subject.isInGroup("wheel")) return polkit.Result.YES;
});`

/**
 * Installer for bash/zsh/sh (fully visible).
 */
export const PRIVILEGED_PROBE_POLKIT_INSTALL_SH = `sudo sh -c 'umask 022; mkdir -p /etc/polkit-1/rules.d; cat > /etc/polkit-1/rules.d/49-linux-sensor-tray.rules' <<'EOF'
${PRIVILEGED_PROBE_POLKIT_RULES}
EOF
sudo chmod 0644 /etc/polkit-1/rules.d/49-linux-sensor-tray.rules`

/**
 * Installer for fish (fully visible). `tee` runs under sudo, so writing to /etc works.
 */
export const PRIVILEGED_PROBE_POLKIT_INSTALL_FISH = `sudo mkdir -p /etc/polkit-1/rules.d
begin
  echo 'polkit.addRule(function(action, subject) {'
  echo '  if (action.id !== \"org.freedesktop.policykit.exec\") return;'
  echo '  var prog = action.lookup(\"program\");'
  echo '  if (prog !== \"/usr/sbin/lshw\" && prog !== \"/usr/bin/lshw\") return;'
  echo '  if (subject.isInGroup(\"wheel\")) return polkit.Result.YES;'
  echo '});'
end | sudo tee /etc/polkit-1/rules.d/49-linux-sensor-tray.rules >/dev/null
sudo chmod 0644 /etc/polkit-1/rules.d/49-linux-sensor-tray.rules`

/**
 * Short hint string included in `SystemInfoSnapshot.privilegedProbeHint` so the renderer can
 * surface a minimal one-line info box (full instructions live in the Settings card).
 */
export const PRIVILEGED_PROBE_HINT_LINE =
  'Some hardware details need a privileged probe. Enable it in Settings or click Enrich with root data.'
