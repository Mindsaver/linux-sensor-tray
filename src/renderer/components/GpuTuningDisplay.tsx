import type { JSX } from 'react'
import type { GpuSnapshot, GpuTuningSnapshot } from '@shared/types'
import { Stat } from './Stat'
import { fmt } from '../format'
import {
  parseDpmClockTable,
  parseOdSections,
  parsePowerProfiles
} from '../utils/amdgpuSysfsParse'

type Props = {
  gpu: GpuSnapshot
  tuning: GpuTuningSnapshot
}

function DpmClockPanel({ title, raw }: { title: string; raw: string | null | undefined }): JSX.Element {
  const rows = parseDpmClockTable(raw ?? '')
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-3">
        <div className="text-xs font-medium text-slate-400 mb-2">{title}</div>
        <p className="text-[11px] text-slate-500 m-0">No DPM states parsed — raw sysfs empty or unexpected format.</p>
      </div>
    )
  }
  return (
    <div className="rounded-xl border border-slate-800/80 overflow-hidden bg-slate-950/40">
      <div className="px-3 py-2 text-xs font-medium text-slate-200 bg-slate-900/70 border-b border-slate-800/90">
        {title}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wide text-slate-500 border-b border-slate-800/80">
              <th className="px-3 py-2 font-medium">DPM</th>
              <th className="px-3 py-2 font-medium">MHz</th>
              <th className="px-3 py-2 font-medium w-24">Status</th>
            </tr>
          </thead>
          <tbody className="mono text-[13px]">
            {rows.map((r) => (
              <tr
                key={`${title}-${r.state}`}
                className={
                  r.active
                    ? 'bg-cyan-950/35 border-l-[3px] border-cyan-400 text-slate-50'
                    : 'border-l-[3px] border-transparent text-slate-300 hover:bg-slate-900/30'
                }
              >
                <td className="px-3 py-1.5 align-middle">{r.state}</td>
                <td className="px-3 py-1.5 align-middle text-slate-100">{r.mhz}</td>
                <td className="px-3 py-1.5 align-middle text-[11px] text-cyan-400/90">
                  {r.active ? 'Active' : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PowerProfilePanel({ raw }: { raw: string | null | undefined }): JSX.Element {
  if (raw == null || raw === '') return <p className="text-xs text-slate-500 m-0">—</p>
  const { preamble, profiles } = parsePowerProfiles(raw)
  if (profiles.length === 0) {
    return (
      <pre className="mono text-[11px] leading-relaxed text-slate-300 bg-slate-950/60 border border-slate-800 rounded-xl p-3 overflow-x-auto whitespace-pre m-0 max-h-96">
        {raw}
      </pre>
    )
  }
  return (
    <div className="space-y-3">
      {preamble && (
        <div className="text-[10px] mono text-slate-500 overflow-x-auto pb-2 border-b border-slate-800/70 whitespace-nowrap leading-relaxed">
          {preamble}
        </div>
      )}
      <div className="text-[10px] uppercase tracking-wider text-slate-500">Profiles</div>
      <div className="space-y-1.5 max-h-[min(520px,55vh)] overflow-y-auto overscroll-contain pr-1">
        {profiles.map((p) => (
          <details
            key={p.index}
            open={p.active}
            className="group rounded-xl border border-slate-800/80 bg-slate-950/50 open:border-slate-700/90 open:bg-slate-900/25"
          >
            <summary className="cursor-pointer select-none list-none flex items-center gap-2 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
              <span className="mono text-xs text-slate-500 w-7 shrink-0">{p.index}</span>
              <span className="mono text-sm text-slate-100 flex-1 min-w-0 truncate">{p.name}</span>
              {p.active && (
                <span className="shrink-0 rounded-md bg-cyan-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-cyan-300">
                  Active
                </span>
              )}
              <span className="text-slate-600 text-[10px] shrink-0" aria-hidden>
                ▼
              </span>
            </summary>
            <div className="border-t border-slate-800/60 bg-slate-950/40">
              <pre className="mono text-[11px] leading-snug text-slate-400 px-3 py-3 m-0 overflow-x-auto whitespace-pre">
                {p.content || ' '}
              </pre>
            </div>
          </details>
        ))}
      </div>
    </div>
  )
}

function OverdrivePanel({ raw }: { raw: string | null | undefined }): JSX.Element {
  if (raw == null || raw === '') return <p className="text-xs text-slate-500 m-0">—</p>
  const sections = parseOdSections(raw)
  if (sections.length === 0) {
    return (
      <pre className="mono text-[12px] leading-relaxed text-slate-300 bg-slate-950/60 border border-slate-800 rounded-xl p-3 overflow-x-auto whitespace-pre-wrap m-0">
        {raw}
      </pre>
    )
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {sections.map((s) => (
        <div
          key={s.title}
          className="rounded-xl border border-slate-800/80 bg-slate-950/45 overflow-hidden"
        >
          <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-cyan-400/85 bg-slate-900/50 border-b border-slate-800/80">
            {s.title}
          </div>
          <pre className="mono text-[12px] leading-relaxed text-slate-200 px-3 py-2.5 m-0 whitespace-pre-wrap break-words">
            {s.body || '—'}
          </pre>
        </div>
      ))}
    </div>
  )
}

export function GpuTuningDisplay({ gpu, tuning }: Props): JSX.Element {
  const g = tuning
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-4 gap-y-3 p-4 rounded-2xl bg-slate-900/35 border border-slate-800/60">
        <Stat label="DPM level" value={g.dpmPerformanceLevel ?? '—'} size="sm" />
        <Stat label="DPM state" value={g.dpmState ?? '—'} size="sm" />
        <Stat label="PPT cap (now)" value={fmt.watt(gpu.powerCap)} size="sm" />
        <Stat label="PPT default" value={fmt.watt(g.powerCapDefaultW)} size="sm" />
        <Stat label="PPT max" value={fmt.watt(g.powerCapMaxW)} size="sm" />
        <Stat label="PPT min" value={fmt.watt(g.powerCapMinW)} size="sm" />
      </div>

      <section>
        <h3 className="text-[11px] uppercase tracking-wider text-slate-500 mb-2">pp_power_profile_mode</h3>
        <PowerProfilePanel raw={g.powerProfileModeRaw} />
      </section>

      <section>
        <h3 className="text-[11px] uppercase tracking-wider text-slate-500 mb-2">DPM clocks</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <DpmClockPanel title="pp_dpm_sclk (GFX / shader)" raw={g.ppDpmSclk} />
          <DpmClockPanel title="pp_dpm_mclk (memory)" raw={g.ppDpmMclk} />
        </div>
      </section>

      <section>
        <h3 className="text-[11px] uppercase tracking-wider text-slate-500 mb-2">pp_od_clk_voltage</h3>
        <OverdrivePanel raw={g.ppOdClkVoltage} />
      </section>

      <p className="text-[11px] text-slate-500 leading-relaxed m-0 pt-1 border-t border-slate-800/60">
        If you use <span className="mono text-slate-400">LACT</span>, these sysfs nodes are what it updates. This view is
        read-only.
      </p>
    </div>
  )
}
