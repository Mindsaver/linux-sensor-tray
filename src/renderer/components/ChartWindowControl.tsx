import { useCallback, useMemo, type JSX } from 'react'
import { fmt } from '../format'
import { useHistoryRetentionMinutes } from '../hooks'
import { useSensorTray } from '../store'

function chartSelectOptions(retentionMin: number, current: number): { value: number; label: string }[] {
  const clampedCur = Math.min(Math.max(1, Math.round(current)), retentionMin)
  if (retentionMin <= 60) {
    const out: { value: number; label: string }[] = []
    for (let m = 1; m <= retentionMin; m++) {
      const full = m === retentionMin
      out.push({
        value: m,
        label: full ? `${m} min · full buffer` : `${m} min`
      })
    }
    return out
  }
  const seeds = [
    1, 5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 360, 480, 720, 1080, 1440, 2880, 4320, 7200,
    10080
  ]
  const values = new Set<number>()
  for (const m of seeds) {
    if (m >= 1 && m <= retentionMin) values.add(m)
  }
  values.add(retentionMin)
  values.add(clampedCur)
  const sorted = [...values].sort((a, b) => a - b)
  return sorted.map((m) => ({
    value: m,
    label:
      m === retentionMin
        ? `${fmt.historyRangeMinutes(m)} · full buffer`
        : fmt.historyRangeMinutes(m)
  }))
}

export function ChartWindowControl(): JSX.Element {
  const chartWindowMinutes = useSensorTray((s) => s.chartWindowMinutes)
  const applySettings = useSensorTray((s) => s.applySettings)
  const retentionMin = useHistoryRetentionMinutes()

  const options = useMemo(
    () => chartSelectOptions(retentionMin, chartWindowMinutes),
    [retentionMin, chartWindowMinutes]
  )

  const persist = useCallback(
    async (chartWindowMinutes: number) => {
      const m = Math.min(Math.max(1, Math.round(chartWindowMinutes)), retentionMin)
      const next = await window.api.setSettings({ chartWindowMinutes: m })
      applySettings(next)
    },
    [applySettings, retentionMin]
  )

  return (
    <div
      className="flex items-center gap-2 min-w-0 max-w-full"
      title="Time range for sparklines on Overview, CPU, and GPU"
    >
      <span className="text-[10px] uppercase tracking-wider text-slate-500 shrink-0 hidden md:inline">
        Charts
      </span>
      <select
        value={chartWindowMinutes}
        onChange={(e) => void persist(Number(e.target.value))}
        aria-label="Chart time range"
        className="w-[min(100%,12rem)] sm:w-52 rounded-lg border border-slate-700/90 bg-slate-900/90 px-2.5 py-1.5 text-xs text-slate-100 shadow-inner focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}
