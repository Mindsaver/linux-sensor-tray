import { promises as fs } from 'node:fs'
import type { MemorySnapshot } from '@shared/types'

export async function readMemorySnapshot(): Promise<MemorySnapshot> {
  let totalKB = 0
  let availableKB = 0
  let swapTotalKB = 0
  let swapFreeKB = 0
  try {
    const text = await fs.readFile('/proc/meminfo', 'utf8')
    for (const line of text.split('\n')) {
      const m = /^(\w+):\s+(\d+)\s+kB$/.exec(line)
      if (!m) continue
      const v = Number(m[2])
      switch (m[1]) {
        case 'MemTotal':
          totalKB = v
          break
        case 'MemAvailable':
          availableKB = v
          break
        case 'SwapTotal':
          swapTotalKB = v
          break
        case 'SwapFree':
          swapFreeKB = v
          break
      }
    }
  } catch {
    // ignore
  }
  return {
    totalKB,
    availableKB,
    usedKB: Math.max(0, totalKB - availableKB),
    swapTotalKB,
    swapFreeKB,
    swapUsedKB: Math.max(0, swapTotalKB - swapFreeKB)
  }
}
