import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { SystemInfoMemoryModule } from '@shared/types'
import {
  treeHasOnlySystemMemoryAggregate,
  walkLshwMemoryBanks,
  type LshwNode
} from './lshwProbe'

const execFileAsync = promisify(execFile)

/** Raw row shape from `systeminformation` memLayout (Linux uses dmidecode). */
export type SiMemoryLayoutRow = {
  size: number
  bank: string
  type: string
  clockSpeed: number | null
  formFactor: string
  manufacturer: string
  partNum: string
  serialNum: string
}

const EDAC_MC = '/sys/devices/system/edac/mc'

function modulesRoughlyMatchTotal(mods: SystemInfoMemoryModule[], totalBytes: number): boolean {
  if (mods.length === 0) return false
  const sum = mods.reduce((a, m) => a + m.sizeBytes, 0)
  return Math.abs(sum - totalBytes) <= Math.max(128 * 1024 * 1024, totalBytes * 0.08)
}

function unknownishMemField(s: string | undefined | null): boolean {
  const t = (s ?? '').trim()
  return !t || /^unknown$/i.test(t) || t === '—' || t === '-'
}

/**
 * True when memLayout has no usable SMBIOS detail — try EDAC / lshw.
 * A single “total RAM” row with DDR type but no manufacturer still counts as fallback (common without root).
 */
export function isDmidecodeFallback(rows: SiMemoryLayoutRow[] | null, totalBytes: number): boolean {
  if (!rows || rows.length === 0) return true
  const populated = rows.filter((r) => r.size > 0)
  if (populated.length === 0) return true

  if (populated.length > 1) {
    return populated.every((r) => unknownishMemField(r.manufacturer) && unknownishMemField(r.partNum))
  }

  const r = populated[0]
  const sizeMatch =
    Math.abs(r.size - totalBytes) <= Math.max(64 * 1024 * 1024, Math.round(totalBytes * 0.02))
  const noType = unknownishMemField(r.type)
  const noPart = unknownishMemField(r.partNum)
  const badClock = r.clockSpeed === 0 || r.clockSpeed == null
  const noMfr = unknownishMemField(r.manufacturer)
  return sizeMatch && (noType || noPart || badClock || noMfr)
}

async function readText(path: string): Promise<string> {
  try {
    return (await readFile(path, 'utf8')).trim()
  } catch {
    return ''
  }
}

async function parseEdacDimm(dimPath: string): Promise<SystemInfoMemoryModule | null> {
  const sizeStr = await readText(join(dimPath, 'size'))
  const mb = parseInt(sizeStr, 10)
  if (!Number.isFinite(mb) || mb <= 0) return null
  const sizeBytes = mb * 1024 * 1024

  const label =
    (await readText(join(dimPath, 'dimm_label'))) ||
    (await readText(join(dimPath, 'dimm_location'))) ||
    ''

  const memType =
    (await readText(join(dimPath, 'dimm_mem_type'))) ||
    (await readText(join(dimPath, 'dimm_dev_type'))) ||
    (await readText(join(dimPath, 'mem_type'))) ||
    ''

  let clockMHz: number | null = null
  const clk =
    (await readText(join(dimPath, 'dimm_clock_speed'))) || (await readText(join(dimPath, 'clock_speed')))
  if (clk) {
    const n = parseInt(clk, 10)
    if (Number.isFinite(n) && n > 0) clockMHz = n
  }

  return {
    sizeBytes,
    type: memType || '—',
    manufacturer: '',
    partNum: '',
    clockMHz,
    formFactor: '',
    slot: label || undefined
  }
}

async function readEdacModules(): Promise<SystemInfoMemoryModule[]> {
  const out: SystemInfoMemoryModule[] = []
  try {
    const mcs = await readdir(EDAC_MC, { withFileTypes: true })
    for (const mc of mcs) {
      if (!mc.isDirectory() || !mc.name.startsWith('mc')) continue
      const mcPath = join(EDAC_MC, mc.name)
      const dimms = await readdir(mcPath, { withFileTypes: true })
      for (const d of dimms) {
        if (!d.isDirectory() || !d.name.toLowerCase().startsWith('dimm')) continue
        const mod = await parseEdacDimm(join(mcPath, d.name))
        if (mod) out.push(mod)
      }
    }
  } catch {
    // No EDAC or permission
  }
  return out
}

async function readLshwModules(totalBytes: number): Promise<{
  modules: SystemInfoMemoryModule[]
  aggregateOnly: boolean
}> {
  try {
    const { stdout } = await execFileAsync('lshw', ['-json', '-class', 'memory'], {
      timeout: 15000,
      maxBuffer: 20 * 1024 * 1024
    })
    const root = JSON.parse(stdout) as LshwNode
    const out: SystemInfoMemoryModule[] = []
    walkLshwMemoryBanks(root, totalBytes, out)
    const aggregateOnly = out.length === 0 && treeHasOnlySystemMemoryAggregate(root)
    return { modules: out, aggregateOnly }
  } catch {
    return { modules: [], aggregateOnly: false }
  }
}

function memoryBanksFromFullLshw(
  root: LshwNode,
  totalBytes: number
): { modules: SystemInfoMemoryModule[]; aggregateOnly: boolean } {
  const out: SystemInfoMemoryModule[] = []
  walkLshwMemoryBanks(root, totalBytes, out)
  const aggregateOnly = out.length === 0 && treeHasOnlySystemMemoryAggregate(root)
  return { modules: out, aggregateOnly }
}

export async function enhanceLinuxMemoryModules(
  totalBytes: number,
  siRaw: SiMemoryLayoutRow[] | null,
  mapped: SystemInfoMemoryModule[],
  lshwFullRoot: LshwNode | null
): Promise<{ modules: SystemInfoMemoryModule[] }> {
  if (process.platform !== 'linux') {
    return { modules: mapped.filter((m) => m.sizeBytes > 0) }
  }

  if (!isDmidecodeFallback(siRaw, totalBytes)) {
    return { modules: mapped.filter((m) => m.sizeBytes > 0) }
  }

  const edac = await readEdacModules()
  if (edac.length > 0 && modulesRoughlyMatchTotal(edac, totalBytes)) {
    return { modules: edac }
  }

  const lshwResult = lshwFullRoot
    ? memoryBanksFromFullLshw(lshwFullRoot, totalBytes)
    : await readLshwModules(totalBytes)
  const lshw = lshwResult.modules
  if (lshw.length > 0 && modulesRoughlyMatchTotal(lshw, totalBytes)) {
    return { modules: lshw }
  }

  if (edac.length > 0) {
    return { modules: edac }
  }
  if (lshw.length > 0) {
    return { modules: lshw }
  }

  return { modules: [] }
}
