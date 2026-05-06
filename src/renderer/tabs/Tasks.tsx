import { useEffect, useMemo, useState, type JSX } from 'react'
import { Card } from '../components/Card'
import { BarMeter } from '../components/BarMeter'
import { Stat } from '../components/Stat'
import type { TaskMonitorSnapshot, TaskProcessRow } from '@shared/types'
import { fmt, loadAccent } from '../format'
import { useLatest } from '../hooks'

type SortKey =
  | 'pid'
  | 'pri'
  | 'ni'
  | 'virt'
  | 'res'
  | 'state'
  | 'cpu'
  | 'memPct'
  | 'time'
  | 'name'
  | 'command'
type SortDir = 'asc' | 'desc'

function safeLower(s: string | null | undefined): string {
  return (s ?? '').toLowerCase()
}

function compactBar(pct: number, widthClass = 'w-full'): JSX.Element {
  const p = Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 0
  const color = (() => {
    if (p >= 92) return 'bg-red-500'
    if (p >= 78) return 'bg-orange-500'
    if (p >= 60) return 'bg-yellow-500'
    if (p >= 35) return 'bg-emerald-500'
    return 'bg-cyan-500'
  })()
  return (
    <div className={widthClass + ' h-1.5 rounded-full bg-slate-800 overflow-hidden'}>
      <div className={'h-full transition-[width] duration-300 ease-out ' + color} style={{ width: `${p}%` }} />
    </div>
  )
}

function stackedBar(parts: { pct: number; className: string }[], widthClass = 'w-full'): JSX.Element {
  const clamp = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 0)
  const safe = parts
    .map((p) => ({ pct: clamp(p.pct), className: p.className }))
    .filter((p) => p.pct > 0)
  const total = safe.reduce((a, b) => a + b.pct, 0)
  const normalized =
    total > 100.001 ? safe.map((p) => ({ ...p, pct: (p.pct / total) * 100 })) : safe

  return (
    <div className={widthClass + ' h-1.5 rounded-full bg-slate-800 overflow-hidden flex'}>
      {normalized.map((p, i) => (
        <div key={i} className={p.className} style={{ width: `${p.pct}%` }} />
      ))}
    </div>
  )
}

function rowMatches(row: TaskProcessRow, q: string): boolean {
  if (!q) return true
  const s =
    safeLower(row.name) +
    '\n' +
    safeLower(row.command) +
    '\n' +
    safeLower(row.user) +
    '\n' +
    String(row.pid)
  return s.includes(q)
}

export function TasksTab(): JSX.Element {
  const latest = useLatest()
  const [data, setData] = useState<TaskMonitorSnapshot | null>(null)
  const [manualLoading, setManualLoading] = useState(false)
  const [autoLoading, setAutoLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('cpu')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [intervalMs, setIntervalMs] = useState(1000)
  const [selectedPid, setSelectedPid] = useState<number | null>(null)

  const load = async (source: 'manual' | 'auto'): Promise<void> => {
    if (source === 'manual') setManualLoading(true)
    else setAutoLoading(true)
    try {
      const snap = await window.api.getTasks()
      // Guard against main/renderer version skew (older main process may not send `summary`).
      if (!snap || typeof snap !== 'object' || !('summary' in snap)) {
        setErr('Task monitor backend is outdated (missing summary fields). Restart the app (main process) to apply updates.')
        setData(null)
        return
      }
      setData(snap)
      setErr(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      if (source === 'manual') setManualLoading(false)
      else setAutoLoading(false)
    }
  }

  // Only runs while the Tasks tab is mounted (visible).
  useEffect(() => {
    void load('auto')
  }, [])

  useEffect(() => {
    if (!autoRefresh) return
    const id = window.setInterval(() => void load('auto'), intervalMs)
    return () => window.clearInterval(id)
  }, [autoRefresh, intervalMs])

  const q = query.trim().toLowerCase()

  const lastAt = data?.collectedAt
  const summary = data?.summary

  const mem = latest?.memory ?? null
  const memUsed = mem?.usedKB ?? 0
  const memTotal = mem?.totalKB ?? 0
  const memAvail = mem?.availableKB ?? 0
  const swapUsed = mem?.swapUsedKB ?? 0
  const swapTotal = mem?.swapTotalKB ?? 0

  const memTotalBytes = memTotal * 1024
  const memUsedBytes = memUsed * 1024
  const swapTotalBytes = swapTotal * 1024
  const swapUsedBytes = swapUsed * 1024

  const memUsedPct = memTotal > 0 ? (memUsed / memTotal) * 100 : null
  const swapUsedPct = swapTotal > 0 ? (swapUsed / swapTotal) * 100 : null

  const memBreak = summary?.mem
  const swapBreak = summary?.swap

  const memTotalForPct = memBreak?.totalBytes ?? (memTotalBytes || 0)

  const rows = useMemo(() => {
    const list = data?.list ?? []
    const filtered = q ? list.filter((r) => rowMatches(r, q)) : list
    const sorted = [...filtered]
    sorted.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1
      const cmpNum = (aa: number | null | undefined, bb: number | null | undefined): number => {
        const aN = aa ?? -1
        const bN = bb ?? -1
        return aN === bN ? 0 : aN < bN ? -1 : 1
      }
      const cmpStr = (aa: string | null | undefined, bb: string | null | undefined): number => {
        const as = safeLower(aa)
        const bs = safeLower(bb)
        return as.localeCompare(bs)
      }

      let c = 0
      if (sortKey === 'pid') c = cmpNum(a.pid, b.pid)
      else if (sortKey === 'pri') c = cmpNum(a.priority, b.priority)
      else if (sortKey === 'ni') c = cmpNum(a.nice, b.nice)
      else if (sortKey === 'virt') c = cmpNum(a.memVszBytes ?? null, b.memVszBytes ?? null)
      else if (sortKey === 'res') c = cmpNum(a.memRssBytes, b.memRssBytes)
      else if (sortKey === 'state') c = cmpStr((a.state ?? '—').slice(0, 1), (b.state ?? '—').slice(0, 1))
      else if (sortKey === 'cpu') c = cmpNum(a.cpuPct, b.cpuPct)
      else if (sortKey === 'memPct')
        c = cmpNum(
          memTotalForPct > 0 && a.memRssBytes != null ? (a.memRssBytes / memTotalForPct) * 100 : null,
          memTotalForPct > 0 && b.memRssBytes != null ? (b.memRssBytes / memTotalForPct) * 100 : null
        )
      else if (sortKey === 'time') c = cmpNum(a.cpuTimeSec ?? null, b.cpuTimeSec ?? null)
      else if (sortKey === 'name') c = cmpStr(a.name, b.name)
      else if (sortKey === 'command') c = cmpStr(a.command, b.command)

      if (c !== 0) return c * dir
      // Stable-ish tie breaks.
      const cpuTie = cmpNum(a.cpuPct, b.cpuPct) * -1
      if (cpuTie !== 0) return cpuTie
      const memTie = cmpNum(a.memRssBytes, b.memRssBytes) * -1
      if (memTie !== 0) return memTie
      return a.pid - b.pid
    })
    return sorted
  }, [data, q, sortKey, sortDir, memTotalForPct])

  useEffect(() => {
    if (selectedPid != null) return
    if (rows.length === 0) return
    setSelectedPid(rows[0]!.pid)
  }, [rows, selectedPid])

  const fmtTime = (sec: number | null | undefined): string => {
    if (sec == null || !Number.isFinite(sec) || sec < 0) return '—'
    const s = Math.floor(sec)
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const ss = s % 60
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
    return `${m}:${String(ss).padStart(2, '0')}`
  }

  const fmtUptime = (sec: number): string => {
    const s = Math.max(0, Math.floor(sec))
    const d = Math.floor(s / 86400)
    const h = Math.floor((s % 86400) / 3600)
    const m = Math.floor((s % 3600) / 60)
    if (d > 0) return `${d}d ${h}h ${m}m`
    if (h > 0) return `${h}h ${m}m`
    return `${m}m`
  }

  const toggleSort = (key: SortKey): void => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'name' || key === 'command' || key === 'state' ? 'asc' : 'desc')
    }
  }

  const sortIndicator = (key: SortKey): string => {
    if (sortKey !== key) return ''
    return sortDir === 'asc' ? ' ▲' : ' ▼'
  }

  return (
    <div className="space-y-4 w-full max-w-none">
      <Card
      >
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void load('manual')}
            disabled={manualLoading}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-slate-800 text-cyan-200 hover:bg-slate-700 disabled:opacity-50 border border-slate-700"
          >
            {manualLoading ? 'Refreshing…' : 'Refresh'}
          </button>

          <label className="ml-auto flex items-center gap-2 text-sm text-slate-300 select-none">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="accent-cyan-400"
            />
            Auto-refresh
          </label>

          <select
            value={intervalMs}
            onChange={(e) => setIntervalMs(Number(e.target.value))}
            disabled={!autoRefresh}
            className="rounded-lg border border-slate-700 bg-slate-950/60 px-2 py-2 text-sm text-slate-200 disabled:opacity-50"
            title="Refresh interval"
          >
            <option value={1000}>1s</option>
            <option value={2000}>2s</option>
            <option value={5000}>5s</option>
          </select>
        </div>

        {err && (
          <div className="mt-3 rounded-xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-100">
            {err}
          </div>
        )}

        {data?.warnings?.length ? (
          <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">
            <div className="font-medium mb-1">Warnings</div>
            <ul className="list-disc pl-5 space-y-0.5">
              {data.warnings.map((w, i) => (
                <li key={i} className="text-[12px] text-amber-100/90">
                  {w}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>

      <Card>
        <div className="space-y-4">
          {latest?.cpu.cores?.length ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              {latest.cpu.cores.map((c) => (
                <BarMeter
                  key={c.index}
                  label={<span className="mono">{c.index}</span>}
                  value={c.load}
                  max={100}
                  unit="%"
                  display={
                    <span className="mono">
                      {c.load.toFixed(0)}%{c.freqMHz != null ? ` · ${(c.freqMHz / 1000).toFixed(2)} GHz` : ''}
                    </span>
                  }
                />
              ))}
            </div>
          ) : (
            <div className="text-sm text-slate-500">Waiting for per-core data…</div>
          )}

          <div className="grid grid-cols-12 gap-4 items-start">
            <div className="col-span-12 xl:col-span-8 space-y-2">
              <div className="flex items-center gap-3">
                <span className="mono text-cyan-300 w-10 text-[11px]">Mem</span>
                <div className="flex-1">
                  {memBreak
                    ? stackedBar([
                        {
                          pct:
                            memBreak.usedBytes > 0 && memBreak.totalBytes > 0
                              ? (memBreak.usedBytes / memBreak.totalBytes) * 100
                              : 0,
                          className: 'bg-emerald-500'
                        },
                        {
                          pct:
                            (memBreak.buffCacheBytes ?? 0) > 0 && memBreak.totalBytes > 0
                              ? ((memBreak.buffCacheBytes ?? 0) / memBreak.totalBytes) * 100
                              : 0,
                          className: 'bg-yellow-500'
                        }
                      ])
                    : compactBar(memTotalBytes > 0 ? (memUsedBytes / memTotalBytes) * 100 : 0)}
                </div>
                <span className="mono text-slate-300 tabular-nums w-40 text-right text-[11px]">
                  {memBreak
                    ? `${fmt.bytes(memBreak.usedBytes)}/${fmt.bytes(memBreak.totalBytes)}`
                    : mem
                      ? `${fmt.bytes(memUsedBytes)}/${fmt.bytes(memTotalBytes)}`
                      : '—'}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="mono text-cyan-300 w-10 text-[11px]">Swp</span>
                <div className="flex-1">
                  {swapBreak
                    ? stackedBar([
                        {
                          pct:
                            swapBreak.usedBytes > 0 && swapBreak.totalBytes > 0
                              ? (swapBreak.usedBytes / swapBreak.totalBytes) * 100
                              : 0,
                          className: 'bg-orange-500'
                        }
                      ])
                    : compactBar(swapTotalBytes > 0 ? (swapUsedBytes / swapTotalBytes) * 100 : 0)}
                </div>
                <span className="mono text-slate-300 tabular-nums w-40 text-right text-[11px]">
                  {swapBreak
                    ? `${fmt.bytes(swapBreak.usedBytes)}/${fmt.bytes(swapBreak.totalBytes)}`
                    : swapTotalBytes > 0
                      ? `${fmt.bytes(swapUsedBytes)}/${fmt.bytes(swapTotalBytes)}`
                      : '—'}
                </span>
              </div>
            </div>

            <div className="col-span-12 xl:col-span-4">
              <div className="space-y-1 text-[11px] leading-snug">
                <div className="mono text-slate-200">
                  <span className="text-cyan-300">Tasks:</span>{' '}
                  {summary
                    ? `${summary.taskCount}` +
                      (summary.threadCount != null ? `, ${summary.threadCount} thr` : '') +
                      (summary.kernelThreadCount != null ? `; ${summary.kernelThreadCount} kthr` : '') +
                      (summary.runningCount != null ? `; ${summary.runningCount} running` : '')
                    : '—'}
                </div>
                <div className="mono text-slate-200">
                  <span className="text-cyan-300">Load average:</span>{' '}
                  {summary
                    ? `${summary.loadAvg[0].toFixed(2)} ${summary.loadAvg[1].toFixed(2)} ${summary.loadAvg[2].toFixed(2)}`
                    : '—'}
                </div>
                <div className="mono text-slate-200">
                  <span className="text-cyan-300">Uptime:</span> {summary ? fmtUptime(summary.uptimeSec) : '—'}
                </div>
                <div className="mono text-slate-200">
                  <span className="text-cyan-300">CPU:</span>{' '}
                  <span className={loadAccent(latest?.cpu.loadTotal ?? null)}>
                    {latest ? fmt.pct(latest.cpu.loadTotal, 0) : '—'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card
        title="Processes"
        subtitle={
          rows.length === 0
            ? 'No rows (or filtered out).'
            : `${rows.length} shown${(data?.list?.length ?? 0) > rows.length ? ` of ${data?.list.length}` : ''}`
        }
        right={
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="min-w-[14rem] rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600"
          />
        }
        className="overflow-hidden"
      >
        <div className="rounded-lg border border-slate-800 overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-950/80 text-slate-400">
              <tr>
                <th className="px-2 py-1.5 font-medium">
                  <button type="button" className="hover:text-slate-200" onClick={() => toggleSort('pid')}>
                    PID{sortIndicator('pid')}
                  </button>
                </th>
                <th className="px-2 py-1.5 font-medium">
                  <button type="button" className="hover:text-slate-200" onClick={() => toggleSort('pri')}>
                    PRI{sortIndicator('pri')}
                  </button>
                </th>
                <th className="px-2 py-1.5 font-medium">
                  <button type="button" className="hover:text-slate-200" onClick={() => toggleSort('ni')}>
                    NI{sortIndicator('ni')}
                  </button>
                </th>
                <th className="px-2 py-1.5 font-medium">
                  <button type="button" className="hover:text-slate-200" onClick={() => toggleSort('virt')}>
                    VIRT{sortIndicator('virt')}
                  </button>
                </th>
                <th className="px-2 py-1.5 font-medium">
                  <button type="button" className="hover:text-slate-200" onClick={() => toggleSort('res')}>
                    RES{sortIndicator('res')}
                  </button>
                </th>
                <th className="px-2 py-1.5 font-medium">
                  <button type="button" className="hover:text-slate-200" onClick={() => toggleSort('state')}>
                    S{sortIndicator('state')}
                  </button>
                </th>
                <th className="px-2 py-1.5 font-medium">
                  <button type="button" className="hover:text-slate-200" onClick={() => toggleSort('cpu')}>
                    CPU{sortIndicator('cpu')}
                  </button>
                </th>
                <th className="px-2 py-1.5 font-medium">
                  <button type="button" className="hover:text-slate-200" onClick={() => toggleSort('memPct')}>
                    MEM%{sortIndicator('memPct')}
                  </button>
                </th>
                <th className="px-2 py-1.5 font-medium">
                  <button type="button" className="hover:text-slate-200" onClick={() => toggleSort('time')}>
                    TIME+{sortIndicator('time')}
                  </button>
                </th>
                <th className="px-2 py-1.5 font-medium">
                  <button type="button" className="hover:text-slate-200" onClick={() => toggleSort('name')}>
                    Name{sortIndicator('name')}
                  </button>
                </th>
                <th className="px-2 py-1.5 font-medium">
                  <button type="button" className="hover:text-slate-200" onClick={() => toggleSort('command')}>
                    COMMAND{sortIndicator('command')}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {rows.map((r) => (
                <tr
                  key={r.pid}
                  className={
                    'text-slate-200 cursor-pointer ' +
                    (r.pid === selectedPid ? 'bg-slate-800/40' : 'hover:bg-slate-800/20')
                  }
                  onClick={() => setSelectedPid(r.pid)}
                  title={r.command ?? undefined}
                >
                  <td className="px-2 py-1.5 mono whitespace-nowrap">{r.pid}</td>
                  <td className="px-2 py-1.5 mono tabular-nums whitespace-nowrap">
                    {r.priority ?? '—'}
                  </td>
                  <td className="px-2 py-1.5 mono tabular-nums whitespace-nowrap">
                    {r.nice ?? '—'}
                  </td>
                  <td className="px-2 py-1.5 mono tabular-nums whitespace-nowrap">
                    {r.memVszBytes != null ? fmt.bytes(r.memVszBytes) : '—'}
                  </td>
                  <td className="px-2 py-1.5 mono tabular-nums whitespace-nowrap">
                    {r.memRssBytes != null ? fmt.bytes(r.memRssBytes) : '—'}
                  </td>
                  <td className="px-2 py-1.5 mono whitespace-nowrap">
                    {(r.state ?? '—').slice(0, 1)}
                  </td>
                  <td className={'px-2 py-1.5 mono tabular-nums ' + loadAccent(r.cpuPct ?? null)}>
                    {fmt.pct(r.cpuPct ?? null, 0)}
                  </td>
                  <td className="px-2 py-1.5 mono tabular-nums whitespace-nowrap">
                    {memTotalForPct > 0 && r.memRssBytes != null
                      ? ((r.memRssBytes / memTotalForPct) * 100).toFixed(1)
                      : '—'}
                  </td>
                  <td className="px-2 py-1.5 mono tabular-nums whitespace-nowrap">{fmtTime(r.cpuTimeSec)}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{r.name}</td>
                  <td className="px-2 py-1.5">
                    <span className="mono text-[11px] text-slate-300 whitespace-nowrap truncate block max-w-[46rem]">
                      {r.command ?? '—'}
                    </span>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-3 py-6 text-sm text-slate-500">
                    No processes to display. Try refreshing, changing the search filter, or disabling auto-refresh.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

