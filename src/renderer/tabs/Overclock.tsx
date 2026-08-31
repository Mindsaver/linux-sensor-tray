import type { JSX } from 'react'
import { Card } from '../components/Card'
import { Stat } from '../components/Stat'
import { GpuTuningDisplay } from '../components/GpuTuningDisplay'
import { NvidiaTuningDisplay } from '../components/NvidiaTuningDisplay'
import { useLatest } from '../hooks'
import { fmt } from '../format'

export function OverclockTab(): JSX.Element {
  const s = useLatest()
  if (!s) return <div className="text-slate-400 text-sm">Waiting…</div>

  const t = s.cpu.tuning
  const g = s.gpu.tuning
  const nv = s.gpu.nvidiaTuning

  return (
    <div className="grid grid-cols-12 gap-4">
      <Card title="Overclocking & tuning" subtitle="Read-only sysfs — use LACT, BIOS, etc. to change values" className="col-span-12">
        <p className="text-sm text-slate-400 leading-relaxed max-w-4xl">
          This tab collects limits and driver-visible tuning state: CPU cpufreq ceiling vs scaling cap, plus whatever the
          GPU driver exposes — AMDGPU DPM / overdrive tables (what tools like{' '}
          <span className="mono text-cyan-300/90">LACT</span> program), or the NVIDIA power/clock limits reported by{' '}
          <span className="mono text-cyan-300/90">nvidia-smi</span>. Nothing here writes to hardware.
        </p>
      </Card>

      <Card
        title="CPU — frequency limits"
        subtitle={`${s.cpu.model} · cpufreq policy on cpu0`}
        className="col-span-12"
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-x-6 gap-y-3">
          <Stat label="Driver" value={t.cpufreqDriver ?? '—'} size="sm" />
          <Stat label="Governor" value={t.governor ?? '—'} size="sm" />
          <Stat label="amd_pstate" value={t.amdPstateStatus ?? '—'} size="sm" />
          <Stat label="EPP" value={t.energyPerformancePreference ?? '—'} size="sm" />
          <Stat label="HW max" value={fmt.mhz(t.cpuinfoMaxMHz)} size="sm" />
          <Stat label="HW min" value={fmt.mhz(t.cpuinfoMinMHz)} size="sm" />
          <Stat label="Scaling max" value={fmt.mhz(t.scalingMaxMHz)} size="sm" />
          <Stat label="Scaling min" value={fmt.mhz(t.scalingMinMHz)} size="sm" />
          <Stat
            label="BIOS limit"
            value={t.biosLimitMHz != null ? fmt.mhz(t.biosLimitMHz) : '—'}
            hint="When the kernel exposes firmware ceiling"
            size="sm"
          />
        </div>
        {t.boostFreqsMHz.length > 0 && (
          <p className="mt-3 text-xs text-slate-400">
            Boost steps (MHz):{' '}
            <span className="mono text-slate-200">
              {t.boostFreqsMHz.map((f) => f.toFixed(0)).join(', ')}
            </span>
          </p>
        )}
        <p className="mt-3 text-[11px] text-slate-500 leading-relaxed">
          PBO, Curve Optimizer, and similar are mostly BIOS/firmware; the kernel does not expose a single sysfs view of
          per-core CO offsets here.
        </p>
      </Card>

      {nv != null ? (
        <Card
          title="GPU — clocks & power limits"
          subtitle={`${s.gpu.model} · nvidia-smi`}
          className="col-span-12"
        >
          <NvidiaTuningDisplay gpu={s.gpu} tuning={nv} />
        </Card>
      ) : s.gpu.vendor === 'amd' ? (
        <Card
          title="GPU — DPM & overdrive"
          subtitle={`${s.gpu.model} · sysfs (matches what LACT drives)`}
          className="col-span-12"
        >
          <GpuTuningDisplay gpu={s.gpu} tuning={g} />
        </Card>
      ) : (
        <Card title="GPU" subtitle="No supported GPU sensors" className="col-span-12">
          <p className="text-sm text-slate-400 m-0">
            No tuning state to show — needs the <span className="mono text-cyan-300/90">amdgpu</span> driver or{' '}
            <span className="mono text-cyan-300/90">nvidia-smi</span>.
          </p>
        </Card>
      )}
    </div>
  )
}
