import { useCallback, useEffect, useState, type JSX } from 'react'
import { Card } from '../components/Card'
import type { AppSettingsResolved } from '@shared/types'
import { useSensorTray } from '../store'
import { fmt } from '../format'

const RETENTION_PRESETS = [60, 180, 360, 720, 1440, 2880, 10080] as const

export function SettingsTab(): JSX.Element {
  const applySettings = useSensorTray((s) => s.applySettings)
  const [resolved, setResolved] = useState<AppSettingsResolved | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  const load = useCallback(async () => {
    const r = await window.api.getSettings()
    setResolved(r)
    applySettings(r)
  }, [applySettings])

  useEffect(() => {
    void load()
  }, [load])

  const persist = async (partial: Partial<AppSettingsResolved>) => {
    const { resolvedLogDirectory: _r, ...rest } = partial
    const next = await window.api.setSettings(rest)
    setResolved(next)
    applySettings(next)
    setStatus('Saved.')
    window.setTimeout(() => setStatus(null), 2000)
  }

  if (!resolved) {
    return <div className="text-slate-400 text-sm">Loading settings…</div>
  }

  return (
    <div className="grid grid-cols-12 gap-4 max-w-4xl">
      <Card
        title="History buffer"
        subtitle="In-memory ring (~1 sample/s). How long charts can span is set in the top bar (Charts)."
        className="col-span-12"
      >
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-2">
            Keep in RAM — {fmt.historyRangeMinutes(resolved.historyRetentionMinutes)} (
            {(resolved.historyRetentionMinutes * 60).toLocaleString()} samples)
          </label>
          <input
            type="range"
            min={10}
            max={10080}
            step={10}
            value={resolved.historyRetentionMinutes}
            onChange={(e) => {
              const historyRetentionMinutes = Number(e.target.value)
              void persist({
                ...resolved,
                historyRetentionMinutes,
                chartWindowMinutes: Math.min(resolved.chartWindowMinutes, historyRetentionMinutes)
              })
            }}
            className="w-full accent-cyan-500"
          />
          <div className="flex flex-wrap gap-1.5 mt-2">
            {RETENTION_PRESETS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() =>
                  void persist({
                    ...resolved,
                    historyRetentionMinutes: m,
                    chartWindowMinutes: Math.min(resolved.chartWindowMinutes, m)
                  })
                }
                className="px-2 py-1 rounded-md text-[11px] bg-slate-800/80 text-slate-300 hover:bg-slate-700/90"
              >
                {fmt.historyRangeMinutes(m)}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Card
        title="Disk logging"
        subtitle="Append-only JSON Lines (one object per second) for spreadsheets or scripts"
        className="col-span-12"
      >
        <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-200">
          <input
            type="checkbox"
            checked={resolved.diskLogEnabled}
            onChange={(e) => void persist({ ...resolved, diskLogEnabled: e.target.checked })}
            className="rounded border-slate-600"
          />
          Log samples to disk
        </label>
        <p className="mt-2 text-[11px] text-slate-500 mono break-all leading-relaxed">
          Folder: {resolved.resolvedLogDirectory}
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          <button
            type="button"
            onClick={async () => {
              const p = await window.api.chooseHistoryLogDir()
              if (p) void persist({ ...resolved, diskLogDirectory: p })
            }}
            className="px-3 py-1.5 rounded-lg text-sm bg-slate-800 text-slate-200 hover:bg-slate-700"
          >
            Choose folder…
          </button>
          <button
            type="button"
            onClick={() => void persist({ ...resolved, diskLogDirectory: null })}
            className="px-3 py-1.5 rounded-lg text-sm bg-slate-800 text-slate-200 hover:bg-slate-700"
          >
            Use default
          </button>
          <button
            type="button"
            onClick={() => void window.api.openHistoryLogFolder()}
            className="px-3 py-1.5 rounded-lg text-sm bg-slate-800 text-cyan-300 hover:bg-slate-700"
          >
            Open in file manager
          </button>
        </div>
        <p className="mt-3 text-[11px] text-slate-500 leading-relaxed">
          Files: <span className="mono text-slate-400">linux-sensor-tray-YYYY-MM-DD.jsonl</span> — each line is{' '}
          <span className="mono text-slate-400">schema 3</span>: chart fields (same as before) plus{' '}
          <span className="mono text-slate-400">mem</span>, <span className="mono">cpu</span> (model,
          Tdie/CCDs, SoC power, per-core load/freq), <span className="mono">cpuTuning</span>,{' '}
          <span className="mono">gpu</span> (clocks,
          fan, PPT caps, DPM mode — not the huge sysfs text blobs), <span className="mono">mainboard</span>,{' '}
          <span className="mono">storage</span>. Open <span className="mono text-slate-400">history-viewer.html</span>{' '}
          for charts; use <span className="mono text-slate-400">jq</span> / Python for the rest.
        </p>
      </Card>

      {status && <p className="col-span-12 text-xs text-emerald-400/90">{status}</p>}
    </div>
  )
}
