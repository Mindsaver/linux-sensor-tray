import { promises as fs } from 'node:fs'
import { basename, join } from 'node:path'
import type { StorageDevice, StorageSnapshot } from '@shared/types'
import { findAllHwmonByName, readLabeledInputs } from './hwmon'

export async function readStorageSnapshot(): Promise<StorageSnapshot> {
  const dirs = await findAllHwmonByName('nvme')
  const drives: StorageDevice[] = []
  for (const dir of dirs) {
    let label = basename(dir)
    try {
      const target = await fs.readlink(join(dir, 'device'))
      const name = basename(target)
      if (name) label = name
    } catch {
      // keep fallback
    }
    const temps = await readLabeledInputs(dir, 'temp')
    let composite: number | null = null
    const others: { label: string; tempC: number }[] = []
    for (const t of temps) {
      const lbl = t.label ?? `temp${t.index}`
      if (lbl === 'Composite') composite = t.value
      else others.push({ label: lbl, tempC: t.value })
    }
    drives.push({ label, composite, sensorsAdditional: others })
  }
  drives.sort((a, b) => a.label.localeCompare(b.label))
  return { drives }
}
