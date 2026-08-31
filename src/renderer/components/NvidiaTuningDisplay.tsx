import type { JSX } from 'react'
import type { GpuSnapshot, NvidiaTuningSnapshot } from '@shared/types'
import { Stat } from './Stat'
import { fmt } from '../format'

type Props = {
  gpu: GpuSnapshot
  tuning: NvidiaTuningSnapshot
}

export function NvidiaTuningDisplay({ gpu, tuning }: Props): JSX.Element {
  const n = tuning
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-4 gap-y-3 p-4 rounded-2xl bg-slate-900/35 border border-slate-800/60">
        <Stat label="P-state" value={n.pstate ?? '—'} hint="P0 = max, P12 = idle" size="sm" />
        <Stat label="Driver" value={n.driverVersion ?? '—'} size="sm" />
        <Stat label="Persistence" value={n.persistenceMode ?? '—'} size="sm" />
        <Stat label="Compute mode" value={n.computeMode ?? '—'} size="sm" />
        <Stat label="Mem bus util" value={fmt.pct(n.memoryUtil)} hint="utilization.memory" size="sm" />
        <Stat label="Fan duty" value={fmt.pct(gpu.fanPwm)} hint="nvidia-smi reports no RPM" size="sm" />
      </div>

      <section>
        <h3 className="text-[11px] uppercase tracking-wider text-slate-500 mb-2">Power limits</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
          <Stat label="Enforced (now)" value={fmt.watt(gpu.powerCap)} size="sm" />
          <Stat label="Default" value={fmt.watt(n.powerCapDefaultW)} size="sm" />
          <Stat label="Min" value={fmt.watt(n.powerCapMinW)} size="sm" />
          <Stat label="Max" value={fmt.watt(n.powerCapMaxW)} size="sm" />
        </div>
      </section>

      <section>
        <h3 className="text-[11px] uppercase tracking-wider text-slate-500 mb-2">Clocks</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
          <Stat label="Graphics (now)" value={fmt.mhz(gpu.sclkMHz)} size="sm" />
          <Stat label="Graphics (max)" value={fmt.mhz(n.maxSclkMHz)} size="sm" />
          <Stat label="Memory (now)" value={fmt.mhz(gpu.mclkMHz)} size="sm" />
          <Stat label="Memory (max)" value={fmt.mhz(n.maxMclkMHz)} size="sm" />
        </div>
      </section>

      <section>
        <h3 className="text-[11px] uppercase tracking-wider text-slate-500 mb-2">
          Active clock limiters
        </h3>
        {n.throttleReasons.length === 0 ? (
          <p className="text-xs text-slate-500 m-0">
            None reported — the GPU is running unconstrained, or the driver does not expose
            <span className="mono"> clocks_event_reasons</span>.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {n.throttleReasons.map((r) => (
              <span
                key={r}
                className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-200"
              >
                {r}
              </span>
            ))}
          </div>
        )}
      </section>

      <p className="text-[11px] text-slate-500 leading-relaxed m-0 pt-1 border-t border-slate-800/60">
        Read from <span className="mono text-slate-400">nvidia-smi --query-gpu</span>. The proprietary driver has no
        sysfs DPM/overdrive tables, so there is no AMD-style state list; clock and voltage offsets live in{' '}
        <span className="mono text-slate-400">nvidia-settings</span> (needs Coolbits) or{' '}
        <span className="mono text-slate-400">nvidia-smi -lgc / -pl</span>. This view is read-only.
      </p>
    </div>
  )
}
