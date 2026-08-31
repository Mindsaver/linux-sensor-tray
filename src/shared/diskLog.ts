import type { SensorSnapshot } from './types'
import { deriveHistoryPoint } from './history'

/** Current on-disk JSONL schema (bump when shape changes). */
export const DISK_LOG_SCHEMA = 4

/**
 * One JSONL line: chart fields (HistoryPoint) + extended sensor snapshot.
 * Large AMDGPU sysfs blobs (power profile text, DPM tables, OD table) are omitted to avoid huge files.
 */
export function deriveDiskLogRecord(s: SensorSnapshot): Record<string, unknown> {
  const g = s.gpu.tuning
  const n = s.gpu.nvidiaTuning
  return {
    ...deriveHistoryPoint(s),
    schema: DISK_LOG_SCHEMA,
    mem: {
      totalKB: s.memory.totalKB,
      availableKB: s.memory.availableKB,
      usedKB: s.memory.usedKB,
      swapTotalKB: s.memory.swapTotalKB,
      swapFreeKB: s.memory.swapFreeKB,
      swapUsedKB: s.memory.swapUsedKB
    },
    cpu: {
      model: s.cpu.model,
      tempTdie: s.cpu.tempTdie,
      tempCcds: s.cpu.tempCcds,
      vSoC: s.cpu.vSoC,
      pSoC: s.cpu.pSoC,
      iCore: s.cpu.iCore,
      iSoC: s.cpu.iSoC,
      hasZenpower: s.cpu.hasZenpower,
      cores: s.cpu.cores.map((c) => ({ i: c.index, load: c.load, mhz: c.freqMHz }))
    },
    cpuTuning: {
      cpufreqDriver: s.cpu.tuning.cpufreqDriver,
      governor: s.cpu.tuning.governor,
      cpuinfoMinMHz: s.cpu.tuning.cpuinfoMinMHz,
      cpuinfoMaxMHz: s.cpu.tuning.cpuinfoMaxMHz,
      scalingMinMHz: s.cpu.tuning.scalingMinMHz,
      scalingMaxMHz: s.cpu.tuning.scalingMaxMHz,
      biosLimitMHz: s.cpu.tuning.biosLimitMHz,
      energyPerformancePreference: s.cpu.tuning.energyPerformancePreference,
      amdPstateStatus: s.cpu.tuning.amdPstateStatus,
      boostFreqsMHz: s.cpu.tuning.boostFreqsMHz
    },
    gpu: {
      vendor: s.gpu.vendor,
      model: s.gpu.model,
      powerCap: s.gpu.powerCap,
      sclkMHz: s.gpu.sclkMHz,
      mclkMHz: s.gpu.mclkMHz,
      fanRpm: s.gpu.fanRpm,
      fanMax: s.gpu.fanMax,
      fanPwm: s.gpu.fanPwm,
      vramUsedBytes: s.gpu.vramUsedBytes,
      vramTotalBytes: s.gpu.vramTotalBytes,
      dpmPerformanceLevel: g.dpmPerformanceLevel,
      dpmState: g.dpmState,
      powerCapDefaultW: g.powerCapDefaultW,
      powerCapMaxW: g.powerCapMaxW,
      powerCapMinW: g.powerCapMinW,
      nvidia: n && {
        pstate: n.pstate,
        memoryUtil: n.memoryUtil,
        driverVersion: n.driverVersion,
        persistenceMode: n.persistenceMode,
        computeMode: n.computeMode,
        powerCapDefaultW: n.powerCapDefaultW,
        powerCapMinW: n.powerCapMinW,
        powerCapMaxW: n.powerCapMaxW,
        maxSclkMHz: n.maxSclkMHz,
        maxMclkMHz: n.maxMclkMHz,
        throttleReasons: n.throttleReasons
      }
    },
    mainboard: {
      chip: s.mainboard.chip,
      voltages: s.mainboard.voltages,
      fans: s.mainboard.fans,
      temps: s.mainboard.temps
    },
    storage: s.storage.drives
  }
}
