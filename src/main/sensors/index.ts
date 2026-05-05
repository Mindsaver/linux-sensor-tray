import type { SensorSnapshot } from '@shared/types'
import { readCpuSnapshot } from './cpu'
import { readGpuSnapshot } from './gpu'
import { readMemorySnapshot } from './memory'
import { readMainboardSnapshot } from './mobo'
import { readStorageSnapshot } from './storage'

export async function collectSnapshot(): Promise<SensorSnapshot> {
  const [cpu, gpu, memory, mainboard, storage] = await Promise.all([
    readCpuSnapshot(),
    readGpuSnapshot(),
    readMemorySnapshot(),
    readMainboardSnapshot(),
    readStorageSnapshot()
  ])
  return { timestamp: Date.now(), cpu, gpu, memory, mainboard, storage }
}
