import {
  baseboard,
  bios,
  blockDevices as siBlockDevices,
  chassis,
  cpu,
  diskLayout,
  fsSize,
  graphics,
  mem,
  memLayout,
  networkInterfaces,
  osInfo,
  system
} from 'systeminformation'
import {
  PRIVILEGED_PROBE_HINT_LINE,
  type SystemInfoBlockDev,
  type SystemInfoCpu,
  type SystemInfoDisk,
  type SystemInfoDisplay,
  type SystemInfoFs,
  type SystemInfoGpu,
  type SystemInfoLshwExtras,
  type SystemInfoLshwParsed,
  type SystemInfoMemoryModule,
  type SystemInfoMemorySummary,
  type SystemInfoNet,
  type SystemInfoSnapshot
} from '@shared/types'
import { enhanceLinuxMemoryModules, type SiMemoryLayoutRow } from './linuxMemoryModules'
import { detectLshwDeps, fetchFullLshwJson, parseLshwExtras, type LshwNode } from './lshwProbe'
import { getSettingsSnapshot } from './settings'

type SiMemModule = Awaited<ReturnType<typeof memLayout>>[number]
type SiGpuCtrl = Awaited<ReturnType<typeof graphics>>['controllers'][number]
type SiDisp = Awaited<ReturnType<typeof graphics>>['displays'][number]
type SiDiskRow = Awaited<ReturnType<typeof diskLayout>>[number]
type SiBlk = Awaited<ReturnType<typeof siBlockDevices>>[number]
type SiFs = Awaited<ReturnType<typeof fsSize>>[number]
/** Single interface row (networkInterfaces may return one object or an array depending on overload). */
type SiNet = import('systeminformation').Systeminformation.NetworkInterfacesData

function warn(warnings: string[], label: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err)
  warnings.push(`${label}: ${msg}`)
}

function mbFromSiCacheL3(l3Kb: number | undefined): number | null {
  if (l3Kb == null || !Number.isFinite(l3Kb) || l3Kb <= 0) return null
  return Math.round((l3Kb / 1024) * 10) / 10
}

function mapSiMemoryModules(memLayR: SiMemModule[] | null): SystemInfoMemoryModule[] {
  return (memLayR ?? []).map((m) => ({
    sizeBytes: m.size,
    type: (m.type ?? '').trim(),
    manufacturer: (m.manufacturer ?? '').trim(),
    partNum: (m.partNum ?? '').trim(),
    clockMHz: m.clockSpeed != null && Number(m.clockSpeed) > 0 ? Number(m.clockSpeed) : null,
    formFactor: (m.formFactor ?? '').trim(),
    slot: (m.bank ?? '').trim() || undefined,
    serialNum: (m.serialNum ?? '').trim() || undefined
  }))
}

export type CollectSystemInfoOptions = {
  /** When 'privileged', run the polkit/pkexec probe regardless of the user's mode setting. */
  force?: 'privileged'
}

export async function collectSystemInfo(opts: CollectSystemInfoOptions = {}): Promise<SystemInfoSnapshot> {
  const warnings: string[] = []
  const collectedAt = Date.now()
  const settings = getSettingsSnapshot()
  const isLinux = process.platform === 'linux'
  const forcedPrivileged = isLinux && opts.force === 'privileged'
  const alwaysPrivileged = isLinux && settings.privilegedSystemProbe === 'always'
  const tryPriv = forcedPrivileged || alwaysPrivileged

  let lshwRoot: LshwNode | null = null
  let lshwSource: 'pkexec' | 'user' | null = null
  if (isLinux) {
    const probe = await fetchFullLshwJson(tryPriv)
    lshwRoot = probe.root
    lshwSource = probe.source
  }

  const [
    osR,
    sysR,
    biosR,
    bbR,
    chR,
    cpuR,
    memR,
    memLayR,
    gfxR,
    disksR,
    blkR,
    fsR,
    netR
  ] = await Promise.all([
    osInfo().catch((e: unknown) => {
      warn(warnings, 'osInfo', e)
      return null
    }),
    system().catch((e: unknown) => {
      warn(warnings, 'system', e)
      return null
    }),
    bios().catch((e: unknown) => {
      warn(warnings, 'bios', e)
      return null
    }),
    baseboard().catch((e: unknown) => {
      warn(warnings, 'baseboard', e)
      return null
    }),
    chassis().catch((e: unknown) => {
      warn(warnings, 'chassis', e)
      return null
    }),
    cpu().catch((e: unknown) => {
      warn(warnings, 'cpu', e)
      return null
    }),
    mem().catch((e: unknown) => {
      warn(warnings, 'mem', e)
      return null
    }),
    memLayout().catch((e: unknown) => {
      warn(warnings, 'memLayout', e)
      return null
    }),
    graphics().catch((e: unknown) => {
      warn(warnings, 'graphics', e)
      return null
    }),
    diskLayout().catch((e: unknown) => {
      warn(warnings, 'diskLayout', e)
      return null
    }),
    siBlockDevices().catch((e: unknown) => {
      warn(warnings, 'blockDevices', e)
      return null
    }),
    fsSize().catch((e: unknown) => {
      warn(warnings, 'fsSize', e)
      return null
    }),
    networkInterfaces().catch((e: unknown) => {
      warn(warnings, 'networkInterfaces', e)
      return null
    })
  ])

  let cpuOut: SystemInfoCpu | null = null
  if (cpuR) {
    const c = cpuR.cache
    const l3Mb = c ? mbFromSiCacheL3(c.l3) : null
    cpuOut = {
      manufacturer: cpuR.manufacturer,
      brand: cpuR.brand,
      vendor: cpuR.vendor,
      cores: cpuR.cores,
      physicalCores: cpuR.physicalCores,
      processors: cpuR.processors,
      socket: cpuR.socket,
      speedGHz: cpuR.speed,
      speedMinGHz: cpuR.speedMin,
      speedMaxGHz: cpuR.speedMax,
      governor: cpuR.governor,
      virtualization: cpuR.virtualization,
      cacheL3MB: l3Mb
    }
  }

  let memoryOut: SystemInfoMemorySummary | null = null
  if (memR) {
    let modules = mapSiMemoryModules(memLayR)
    const enhanced = await enhanceLinuxMemoryModules(
      memR.total,
      (memLayR ?? []) as SiMemoryLayoutRow[],
      modules,
      lshwRoot
    )
    modules = enhanced.modules
    memoryOut = {
      totalBytes: memR.total,
      modules
    }
  }

  let gpus: SystemInfoGpu[] = (gfxR?.controllers ?? []).map((g: SiGpuCtrl) => ({
    vendor: g.vendor,
    model: g.model,
    bus: g.bus,
    vramBytes: g.vram,
    driverVersion: g.driverVersion ?? null
  }))

  const displays: SystemInfoDisplay[] = (gfxR?.displays ?? []).map((d: SiDisp) => {
    const rx = d.currentResX ?? d.resolutionX
    const ry = d.currentResY ?? d.resolutionY
    const resolution =
      rx != null && ry != null ? `${rx}×${ry}` : rx != null || ry != null ? `${rx ?? '?'}×${ry ?? '?'}` : '—'
    return {
      vendor: d.vendor,
      model: d.model,
      resolution,
      refreshHz: d.currentRefreshRate,
      connection: d.connection
    }
  })

  const disks: SystemInfoDisk[] = (disksR ?? []).map((d: SiDiskRow) => ({
    device: d.device,
    type: d.type,
    name: d.name,
    vendor: d.vendor,
    sizeBytes: d.size,
    interfaceType: d.interfaceType,
    serialNum: d.serialNum,
    firmware: d.firmwareRevision,
    tempC: d.temperature
  }))

  const mappedBlockDevices: SystemInfoBlockDev[] = (blkR ?? []).map((b: SiBlk) => ({
    name: b.name,
    type: b.type,
    mount: b.mount,
    sizeBytes: b.size,
    removable: b.removable,
    model: b.model
  }))

  const filesystems: SystemInfoFs[] = (fsR ?? []).map((f: SiFs) => ({
    mount: f.mount,
    fs: f.fs,
    type: f.type,
    sizeBytes: f.size,
    usedBytes: f.used,
    usePct: f.use
  }))

  const netList: SiNet[] = Array.isArray(netR) ? netR : netR != null ? [netR as SiNet] : []
  const network: SystemInfoNet[] = netList
    .filter((n: SiNet) => n.iface !== 'lo')
    .map((n: SiNet) => ({
      iface: n.iface,
      mac: n.mac,
      ip4: n.ip4,
      speedMbps: n.speed,
      operstate: n.operstate,
      internal: n.internal,
      virtual: n.virtual
    }))

  let lshwExtras: SystemInfoLshwExtras | null = null
  let baseboardOut = bbR
    ? {
        manufacturer: bbR.manufacturer,
        model: bbR.model,
        version: bbR.version,
        serial: bbR.serial,
        memSlots: bbR.memSlots,
        memMaxMB: bbR.memMax
      }
    : null

  if (lshwRoot && lshwSource) {
    const parsed: SystemInfoLshwParsed = parseLshwExtras(lshwRoot)
    lshwExtras = { ...parsed, probeSource: lshwSource }

    if (gpus.length > 0 && parsed.primaryGpuProduct) {
      const lp = parsed.primaryGpuProduct
      if (lp.length > (gpus[0].model?.length ?? 0)) {
        gpus = gpus.map((g, i) => (i === 0 ? { ...g, model: lp } : g))
      }
    }

    if (baseboardOut && parsed.baseboardSerial) {
      const s = baseboardOut.serial
      if (!s || s.toLowerCase().includes('to be filled') || s === '-' || s.toLowerCase() === 'unknown') {
        baseboardOut = { ...baseboardOut, serial: parsed.baseboardSerial }
      }
    }

    if (cpuOut && parsed.cpuCacheBytes?.l3 != null && cpuOut.cacheL3MB == null) {
      const mb = Math.round((parsed.cpuCacheBytes.l3 / (1024 * 1024)) * 10) / 10
      cpuOut = { ...cpuOut, cacheL3MB: mb }
    }
  }

  // Surface the short hint when:
  //   - we're on Linux,
  //   - the user is not on 'always' (so a banner can still nudge them), AND
  //   - we don't already have privileged data merged in.
  // The full polkit instructions live in the Settings card; this is just a one-liner trigger.
  let privilegedProbeHint: string | null = null
  if (isLinux && settings.privilegedSystemProbe !== 'always' && lshwExtras?.probeSource !== 'pkexec') {
    const deps = detectLshwDeps()
    if (!deps.hasAnyLshw) {
      privilegedProbeHint =
        'To enrich hardware details, install `lshw` first (Arch/CachyOS: `sudo pacman -S --needed lshw`), then click Enrich with root data.'
    } else if (!deps.hasPkexec) {
      privilegedProbeHint =
        'To enrich hardware details, install `pkexec` (polkit) (Arch/CachyOS: `sudo pacman -S --needed polkit`), then click Enrich with root data.'
    } else {
      privilegedProbeHint = PRIVILEGED_PROBE_HINT_LINE
    }
  }

  const snapshot: SystemInfoSnapshot = {
    collectedAt,
    os: osR
      ? {
          hostname: osR.hostname,
          distro: osR.distro,
          release: osR.release,
          kernel: osR.kernel,
          arch: osR.arch,
          platform: osR.platform,
          uefi: osR.uefi
        }
      : null,
    hardware: sysR
      ? {
          manufacturer: sysR.manufacturer,
          model: sysR.model,
          version: sysR.version,
          serial: sysR.serial,
          virtual: sysR.virtual
        }
      : null,
    bios: biosR
      ? {
          vendor: biosR.vendor,
          version: biosR.version,
          releaseDate: biosR.releaseDate
        }
      : null,
    baseboard: baseboardOut,
    chassis: chR
      ? {
          manufacturer: chR.manufacturer,
          model: chR.model,
          type: chR.type
        }
      : null,
    cpu: cpuOut,
    memory: memoryOut,
    gpus,
    displays,
    disks,
    blockDevices: mappedBlockDevices,
    filesystems,
    network,
    lshwExtras,
    privilegedProbeHint,
    warnings
  }

  return snapshot
}
