import { mem, processes } from 'systeminformation'
import { loadavg, uptime } from 'node:os'
import type { TaskMonitorSnapshot, TaskProcessRow } from '@shared/types'

function clampCpuPct(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return null
  if (n < 0) return 0
  if (n > 100) return 100
  return n
}

function toNullableString(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s ? s : null
}

function buildCommand(p: any): string | null {
  const cmdline =
    toNullableString(p?.commandLine) ??
    toNullableString(p?.cmdline) ??
    toNullableString(p?.cmd) ??
    toNullableString(p?.fullcmd) ??
    null
  if (cmdline) return cmdline.replace(/\s+/g, ' ').trim()

  const base = toNullableString(p?.command) ?? toNullableString(p?.name) ?? null
  const params = toNullableString(p?.params) ?? toNullableString(p?.arguments) ?? null
  if (base && params) return `${base} ${params}`.replace(/\s+/g, ' ').trim()
  if (base) return base

  return toNullableString(p?.path) ?? null
}

function toNullableNumber(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function toCpuTimeSec(p: any): number | null {
  // Common-ish names across platforms/versions.
  const s =
    toNullableNumber(p?.cpuTime) ??
    toNullableNumber(p?.cputime) ??
    toNullableNumber(p?.time) ??
    toNullableNumber(p?.times) ??
    null
  if (s == null) return null
  // Some APIs expose ms.
  if (s > 365 * 24 * 3600) return Math.round(s / 1000)
  return s
}

export async function collectTaskMonitorSnapshot(): Promise<TaskMonitorSnapshot> {
  const collectedAt = Date.now()
  const warnings: string[] = []

  try {
    const [r, memR] = await Promise.all([processes(), mem()])
    const rawList: unknown[] = Array.isArray((r as any)?.list) ? (r as any).list : []
    // Align with htop semantics:
    // - "Tasks" ~= process count
    // - "thr"   ~= thread count
    const processCount =
      toNullableNumber((r as any)?.processes) ??
      toNullableNumber((r as any)?.procs) ??
      toNullableNumber((r as any)?.all) ??
      toNullableNumber((r as any)?.count) ??
      rawList.length
    const threadCount =
      toNullableNumber((r as any)?.threads) ?? toNullableNumber((r as any)?.allThreads) ?? undefined
    const runningCount =
      toNullableNumber((r as any)?.running) ?? toNullableNumber((r as any)?.run) ?? undefined
    const kernelThreadCount =
      toNullableNumber((r as any)?.kernelThreads) ?? toNullableNumber((r as any)?.kthreads) ?? undefined

    const mapped: TaskProcessRow[] = rawList
      .map((p: any): TaskProcessRow | null => {
        const pid = toNullableNumber(p?.pid)
        if (pid == null) return null

        const command = buildCommand(p)
        const name =
          toNullableString(p?.name) ??
          toNullableString(p?.command) ??
          (command ? command.split(/\s+/)[0] ?? null : null) ??
          String(pid)
        const cpuPct = clampCpuPct(p?.cpu)

        // systeminformation commonly provides `mem` as bytes; some platforms expose `memRss` / `mem_rss`.
        const memBytes =
          toNullableNumber(p?.memRss) ??
          toNullableNumber(p?.mem_rss) ??
          toNullableNumber(p?.mem) ??
          null

        // systeminformation on Linux often spawns `ps` to collect the list; hide that transient helper.
        const looksLikePsHelper =
          (name === 'ps' || (command ?? '').startsWith('ps ')) &&
          (command === 'ps' || (command ?? '').startsWith('ps ')) &&
          (memBytes ?? 0) < 5 * 1024 * 1024
        if (looksLikePsHelper) return null

        return {
          pid,
          ppid: toNullableNumber(p?.parentPid) ?? toNullableNumber(p?.ppid) ?? undefined,
          name,
          cpuPct,
          memRssBytes: memBytes,
          memVszBytes: toNullableNumber(p?.memVsz) ?? toNullableNumber(p?.mem_vsz) ?? toNullableNumber(p?.memvsz) ?? null,
          user: toNullableString(p?.user),
          state: toNullableString(p?.state),
          nice: toNullableNumber(p?.nice) ?? null,
          priority: toNullableNumber(p?.priority) ?? toNullableNumber(p?.pri) ?? null,
          cpuTimeSec: toCpuTimeSec(p),
          command
        }
      })
      .filter((x: TaskProcessRow | null): x is TaskProcessRow => x != null)

    // Keep IPC payload bounded. Default sort by CPU desc, then mem desc.
    mapped.sort((a, b) => {
      const ac = a.cpuPct ?? -1
      const bc = b.cpuPct ?? -1
      if (bc !== ac) return bc - ac
      const am = a.memRssBytes ?? -1
      const bm = b.memRssBytes ?? -1
      return bm - am
    })

    return {
      collectedAt,
      summary: {
        uptimeSec: uptime(),
        loadAvg: [loadavg()[0] ?? 0, loadavg()[1] ?? 0, loadavg()[2] ?? 0],
        taskCount: processCount,
        threadCount,
        runningCount,
        kernelThreadCount,
        mem: memR
          ? {
              totalBytes: Number(memR.total) || 0,
              usedBytes: Number(memR.used) || 0,
              freeBytes: Number(memR.free) || 0,
              buffCacheBytes: memR.buffcache != null ? Number(memR.buffcache) : undefined,
              buffersBytes: memR.buffers != null ? Number(memR.buffers) : undefined,
              cachedBytes: memR.cached != null ? Number(memR.cached) : undefined
            }
          : undefined,
        swap: memR
          ? {
              totalBytes: Number(memR.swaptotal) || 0,
              usedBytes: Number(memR.swapused) || 0,
              freeBytes: Number(memR.swapfree) || 0
            }
          : undefined
      },
      list: mapped.slice(0, 200),
      warnings: warnings.length ? warnings : undefined
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    warnings.push(`processes(): ${msg}`)
    return {
      collectedAt,
      summary: {
        uptimeSec: uptime(),
        loadAvg: [loadavg()[0] ?? 0, loadavg()[1] ?? 0, loadavg()[2] ?? 0],
        taskCount: 0
      },
      list: [],
      warnings
    }
  }
}

