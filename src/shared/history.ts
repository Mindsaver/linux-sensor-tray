import type { HistoryPoint, SensorSnapshot } from './types'

export function cpuFreqSummary(cores: SensorSnapshot['cpu']['cores']): {
  avg: number | null
  max: number | null
} {
  const mhz = cores.map((c) => c.freqMHz).filter((f): f is number => f != null && f > 0)
  if (mhz.length === 0) return { avg: null, max: null }
  const sum = mhz.reduce((a, b) => a + b, 0)
  return { avg: sum / mhz.length, max: Math.max(...mhz) }
}

export function deriveHistoryPoint(s: SensorSnapshot): HistoryPoint {
  const ramUsedPct =
    s.memory.totalKB > 0 ? (s.memory.usedKB / s.memory.totalKB) * 100 : 0
  const { avg } = cpuFreqSummary(s.cpu.cores)
  return {
    t: s.timestamp,
    cpuLoad: s.cpu.loadTotal,
    cpuTctl: s.cpu.tempTctl,
    cpuAvgMHz: avg,
    cpuVcore: s.cpu.vCore,
    cpuPCore: s.cpu.pCore,
    gpuBusy: s.gpu.busy,
    gpuEdge: s.gpu.tempEdge,
    gpuJunction: s.gpu.tempJunction,
    gpuMem: s.gpu.tempMemory,
    gpuVddgfx: s.gpu.vddgfx,
    gpuPower: s.gpu.power,
    gpuVramUsedMiB: s.gpu.vramUsedBytes != null ? s.gpu.vramUsedBytes / (1024 * 1024) : null,
    ramUsedPct
  }
}
