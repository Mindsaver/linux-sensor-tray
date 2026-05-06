import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'
import type { SystemInfoLshwParsed, SystemInfoMemoryModule } from '@shared/types'

/** Promisified callback-style execFile. We never use the raw callback form. */
const execFileAsync = promisify(execFile)

export type LshwNode = {
  id?: string
  class?: string
  description?: string
  product?: string
  vendor?: string
  serial?: string
  slot?: string
  size?: number
  logicalname?: string | string[]
  children?: LshwNode[]
  configuration?: Record<string, string>
}

const LSHW_TIMEOUT_MS = 20000
const LSHW_MAX_BUFFER = 32 * 1024 * 1024
const LSHW_PATHS = ['/usr/sbin/lshw', '/usr/bin/lshw'] as const

export function detectLshwDeps(): { hasPkexec: boolean; hasAnyLshw: boolean } {
  const hasPkexec = existsSync('/usr/bin/pkexec')
  const hasAnyLshw = LSHW_PATHS.some((p) => existsSync(p)) || existsSync('/usr/bin/lshw') || existsSync('/usr/sbin/lshw')
  return { hasPkexec, hasAnyLshw }
}

export type FetchFullLshwResult = {
  root: LshwNode | null
  source: 'pkexec' | 'user' | null
  /** Last error message captured when no JSON could be obtained (helps "Test now" UX). */
  error: string | null
}

async function runCapture(file: string, args: string[]): Promise<string> {
  // execFile defaults to utf8 encoding so stdout is a string.
  const { stdout } = await execFileAsync(file, args, {
    timeout: LSHW_TIMEOUT_MS,
    maxBuffer: LSHW_MAX_BUFFER
  })
  return stdout ?? ''
}

export async function fetchFullLshwJson(tryPrivileged: boolean): Promise<FetchFullLshwResult> {
  if (process.platform !== 'linux') return { root: null, source: null, error: null }

  let lastError: string | null = null

  if (tryPrivileged) {
    for (const bin of LSHW_PATHS) {
      try {
        const out = await runCapture('pkexec', [bin, '-json'])
        if (out) {
          try {
            return { root: JSON.parse(out) as LshwNode, source: 'pkexec', error: null }
          } catch (e) {
            lastError = e instanceof Error ? e.message : String(e)
          }
        }
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e)
      }
    }
  }

  try {
    const out = await runCapture('lshw', ['-json'])
    if (out) {
      try {
        return { root: JSON.parse(out) as LshwNode, source: 'user', error: null }
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e)
      }
    }
  } catch (e) {
    lastError = e instanceof Error ? e.message : String(e)
  }

  return { root: null, source: null, error: lastError }
}

function parseDescription(desc: string): { type: string; mhz: number | null } {
  let mhz: number | null = null
  const mhzMatch = desc.match(/(\d+(?:\.\d+)?)\s*(?:MHz|MT\/s)/i)
  if (mhzMatch) mhz = Math.round(parseFloat(mhzMatch[1]))
  let typ = ''
  const ddr = desc.match(/\b(DDR[45][^\s,]*|LPDDR[45][X]?)\b/i)
  if (ddr) typ = ddr[1].replace(/dram$/i, '').toUpperCase()
  return { type: typ, mhz }
}

/** lshw often puts DMI strings under `configuration` instead of top-level `vendor`. */
function pickConfiguration(cfg: Record<string, string> | undefined, keys: string[]): string {
  if (!cfg) return ''
  const lower = new Map<string, string>()
  for (const [k, v] of Object.entries(cfg)) {
    if (v != null && String(v).trim()) lower.set(k.toLowerCase(), String(v).trim())
  }
  for (const k of keys) {
    const v = lower.get(k.toLowerCase())
    if (v) return v
  }
  return ''
}

export function moduleFromLshwNode(n: LshwNode): SystemInfoMemoryModule {
  const desc = n.description ?? ''
  const parsed = parseDescription(desc)
  const type =
    parsed.type || (desc.includes('DDR') ? desc.split(/\s+/).find((w) => /DDR/i.test(w)) ?? '' : '')
  const cfg = n.configuration
  const manufacturer =
    (n.vendor ?? '').trim() ||
    pickConfiguration(cfg, ['vendor', 'manufacturer', 'manufacturername', 'mem_manufacturer', 'modulemanufacturerid'])

  const productTop = (n.product ?? '').trim()
  const partNum =
    productTop || pickConfiguration(cfg, ['partnumber', 'part', 'product', 'modulenumber', 'moduleproduct'])

  const serialTop = (n.serial ?? '').trim()
  const serialCfg = pickConfiguration(cfg, ['serial', 'serialnumber'])
  const serialNum = serialTop || (serialCfg && serialCfg !== partNum ? serialCfg : '')

  return {
    sizeBytes: n.size ?? 0,
    type: type || '—',
    manufacturer: manufacturer || '—',
    partNum: partNum || '—',
    clockMHz: parsed.mhz,
    formFactor: pickConfiguration(cfg, ['formfactor', 'type']) || '',
    slot:
      (n.slot ?? pickConfiguration(cfg, ['slot', 'sloc', 'locator']) ?? n.id?.replace(/^bank:/i, 'bank ') ?? '').trim() ||
      undefined,
    serialNum: serialNum.trim() || undefined
  }
}

function isLshwDimmRow(n: LshwNode, totalBytes: number): boolean {
  if (n.class !== 'memory' || typeof n.size !== 'number' || n.size <= 0) return false
  const id = n.id ?? ''
  if (/^bank:/i.test(id) || /^dimm/i.test(id)) return true
  const desc = n.description ?? ''
  if (/\b(SO)?DIMM\b/i.test(desc)) return true
  if (n.size === totalBytes && id === 'memory' && !/\b(SO)?DIMM\b/i.test(desc)) return false
  return false
}

export function walkLshwMemoryBanks(
  node: LshwNode | null | undefined,
  totalBytes: number,
  out: SystemInfoMemoryModule[]
): void {
  if (!node) return
  if (isLshwDimmRow(node, totalBytes)) out.push(moduleFromLshwNode(node))
  if (node.children) {
    for (const c of node.children) walkLshwMemoryBanks(c, totalBytes, out)
  }
}

export function treeHasOnlySystemMemoryAggregate(node: LshwNode | null | undefined): boolean {
  if (!node) return false
  let sawAggregate = false
  function w(n: LshwNode): void {
    if (
      n.class === 'memory' &&
      n.id === 'memory' &&
      typeof n.size === 'number' &&
      n.size > 0 &&
      (n.description ?? '').toLowerCase().includes('system memory')
    ) {
      sawAggregate = true
    }
    if (n.children) for (const c of n.children) w(c)
  }
  w(node)
  return sawAggregate
}

function normLogicalName(n: LshwNode): string {
  const l = n.logicalname
  if (typeof l === 'string') return l
  if (Array.isArray(l) && l.length > 0) return l[0] ?? ''
  return ''
}

export function parseLshwExtras(root: LshwNode): SystemInfoLshwParsed {
  const extras: SystemInfoLshwParsed = {}

  const caches: { l1?: number; l2?: number; l3?: number } = {}
  const nvme: NonNullable<SystemInfoLshwParsed['nvmeDevices']> = []
  const nvmeSeen = new Set<string>()
  const notableUsb: { vendor: string; product: string }[] = []
  let primaryGpu: string | undefined
  let systemProduct: string | undefined
  let baseboardSerial: string | undefined
  let hasCrypto = false

  function walk(n: LshwNode): void {
    if (n.class === 'system' && n.id && !systemProduct) {
      if (n.product) systemProduct = n.product.trim()
    }

    if (n.class === 'bus' && n.description === 'Motherboard') {
      if (n.serial && n.serial.trim() && !n.serial.toLowerCase().includes('to be filled')) {
        baseboardSerial = n.serial.trim()
      }
    }

    if (n.class === 'memory' && n.description) {
      const d = n.description
      if (d === 'L1 cache' && typeof n.size === 'number' && n.size > 0) caches.l1 = n.size
      if (d === 'L2 cache' && typeof n.size === 'number' && n.size > 0) caches.l2 = n.size
      if (d === 'L3 cache' && typeof n.size === 'number' && n.size > 0) caches.l3 = n.size
    }

    if (n.class === 'display' && n.product) {
      const p = n.product.trim()
      if (p && !primaryGpu) primaryGpu = p
    }

    if (n.class === 'storage' && n.description === 'NVMe device' && n.product) {
      const dev = normLogicalName(n)
      const serial = (n.serial ?? '').trim()
      const key = `${serial}\0${dev}`
      if (nvmeSeen.has(key)) {
        // skip duplicate namespace rows
      } else {
        nvmeSeen.add(key)
        nvme.push({
          product: (n.product ?? '').trim(),
          vendor: (n.vendor ?? '').trim(),
          serial,
          sizeBytes: typeof n.size === 'number' ? n.size : null,
          device: dev || '—'
        })
      }
    }

    if (n.class === 'generic' && n.description === 'Encryption controller' && n.product?.includes('Cryptographic')) {
      hasCrypto = true
    }

    if (n.class === 'multimedia' && n.description === 'Audio device' && n.vendor && n.product) {
      const v = n.vendor.trim()
      const p = n.product.trim()
      if (v && p && notableUsb.length < 12) {
        const key = `${v}:${p}`
        if (!notableUsb.some((x) => `${x.vendor}:${x.product}` === key)) {
          notableUsb.push({ vendor: v, product: p })
        }
      }
    }

    if (n.children) for (const c of n.children) walk(c)
  }

  walk(root)

  if (caches.l1 != null || caches.l2 != null || caches.l3 != null) extras.cpuCacheBytes = caches
  if (primaryGpu) extras.primaryGpuProduct = primaryGpu
  if (systemProduct) extras.systemProduct = systemProduct
  if (baseboardSerial) extras.baseboardSerial = baseboardSerial
  if (nvme.length > 0) {
    extras.nvmeDevices = nvme
  }
  if (notableUsb.length > 0) extras.notableUsb = notableUsb
  if (hasCrypto) extras.amdCryptoCoprocessor = true

  return extras
}
