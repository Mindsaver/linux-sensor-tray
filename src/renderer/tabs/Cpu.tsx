import type { JSX } from 'react'
import { Card } from '../components/Card'
import { Gauge } from '../components/Gauge'
import { Stat } from '../components/Stat'
import { PerCoreBars } from '../components/PerCoreBars'
import { Sparkline, type Series } from '../components/Sparkline'
import { useChartHistoryWindow, useLatest } from '../hooks'
import { fmt, tempAccent } from '../format'

export function CpuTab(): JSX.Element {
  const s = useLatest()
  const { history, rangeLabel } = useChartHistoryWindow()
  if (!s) return <div className="text-slate-400 text-sm">Waiting…</div>

  const loadSeries: Series[] = [
    {
      key: 'cpuLoad',
      label: 'Total CPU load',
      color: '#22d3ee',
      data: history.map((h) => ({ t: h.t, v: h.cpuLoad }))
    }
  ]
  const tempSeries: Series[] = [
    {
      key: 'cpuTctl',
      label: 'Tctl',
      color: '#f87171',
      data: history.map((h) => ({ t: h.t, v: h.cpuTctl }))
    }
  ]
  const voltSeries: Series[] = [
    {
      key: 'cpuVcore',
      label: 'Vcore',
      color: '#fbbf24',
      data: history.map((h) => ({ t: h.t, v: h.cpuVcore }))
    }
  ]
  const powerSeries: Series[] = [
    {
      key: 'cpuPCore',
      label: 'Package P (core)',
      color: '#a78bfa',
      data: history.map((h) => ({ t: h.t, v: h.cpuPCore }))
    }
  ]

  return (
    <div className="grid grid-cols-12 gap-4">
      <Card
        title={s.cpu.model}
        subtitle={`${s.cpu.cores.length} threads · ${s.cpu.hasZenpower ? 'zenpower' : 'k10temp fallback'}`}
        className="col-span-12"
      >
        <div className="flex flex-wrap items-center gap-6">
          <Gauge value={s.cpu.loadTotal} label="Load" unit="%" size={170} integer />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-3 flex-1 min-w-[260px]">
            <Stat label="Tctl" value={fmt.temp(s.cpu.tempTctl)} accent={tempAccent(s.cpu.tempTctl)} size="lg" />
            <Stat label="Tdie" value={fmt.temp(s.cpu.tempTdie)} accent={tempAccent(s.cpu.tempTdie)} size="lg" />
            <Stat label="Vcore" value={fmt.volt(s.cpu.vCore)} size="lg" />
            <Stat label="V SoC" value={fmt.volt(s.cpu.vSoC)} size="lg" />
            <Stat label="P Core" value={fmt.watt(s.cpu.pCore)} size="md" />
            <Stat label="P SoC" value={fmt.watt(s.cpu.pSoC)} size="md" />
            <Stat label="I Core" value={fmt.amp(s.cpu.iCore)} size="md" />
            <Stat label="I SoC" value={fmt.amp(s.cpu.iSoC)} size="md" />
            {s.cpu.tempCcds.map((t, i) => (
              <Stat
                key={i}
                label={`CCD${i + 1}`}
                value={fmt.temp(t)}
                accent={tempAccent(t)}
                size="md"
              />
            ))}
          </div>
        </div>
      </Card>

      <Card title="Per-core load & frequency" className="col-span-12">
        <PerCoreBars cores={s.cpu.cores} />
      </Card>

      <Card title="Overclocking" className="col-span-12">
        <p className="text-sm text-slate-400">
          Frequency limits, Curve Optimizer (SMU), and related tuning are on the{' '}
          <span className="text-cyan-300/90">Overclock</span> tab.
        </p>
      </Card>

      <Card title={`CPU load · ${rangeLabel}`} className="col-span-12 xl:col-span-6">
        <Sparkline
          series={loadSeries}
          yMax={100}
          unit="%"
          height={228}
          area
          caption="Load history — total utilization of all logical cores (0–100%)."
        />
      </Card>
      <Card title={`Tctl temperature · ${rangeLabel}`} className="col-span-12 xl:col-span-6">
        <Sparkline
          series={tempSeries}
          unit="°C"
          height={228}
          autoY
          caption="Temperature history — CPU control temperature (Tctl) from k10temp or zenpower."
        />
      </Card>
      <Card title={`Vcore · ${rangeLabel}`} className="col-span-12 xl:col-span-6">
        <Sparkline
          series={voltSeries}
          unit="V"
          height={228}
          autoY
          caption="Voltage history — core rail (Vcore) when exposed by the driver."
        />
      </Card>
      <Card title={`Package power · ${rangeLabel}`} className="col-span-12 xl:col-span-6">
        <Sparkline
          series={powerSeries}
          unit="W"
          height={228}
          autoY
          caption="Power history — CPU package core power (P Core) in watts."
        />
      </Card>

      {!s.cpu.hasZenpower && (
        <Card title="Tip" className="col-span-12">
          <p className="text-sm text-slate-300">
            For full per-core voltage, current and CCD temperatures install the
            <span className="mono mx-1 text-cyan-300">zenpower3-dkms</span>
            kernel module (available on CachyOS via AUR). Then unload
            <span className="mono mx-1 text-cyan-300">k10temp</span> and load
            <span className="mono mx-1 text-cyan-300">zenpower</span>.
          </p>
        </Card>
      )}
    </div>
  )
}
