import type { JSX } from 'react'
import { Card } from '../components/Card'
import { Gauge } from '../components/Gauge'
import { Stat } from '../components/Stat'
import { BarMeter } from '../components/BarMeter'
import { Sparkline, type Series } from '../components/Sparkline'
import { useChartHistoryWindow, useLatest } from '../hooks'
import { fmt, tempAccent } from '../format'

export function GpuTab(): JSX.Element {
  const s = useLatest()
  const { history, rangeLabel } = useChartHistoryWindow()
  if (!s) return <div className="text-slate-400 text-sm">Waiting…</div>

  const usageSeries: Series[] = [
    {
      key: 'gpuBusy',
      label: 'GPU busy %',
      color: '#a78bfa',
      data: history.map((h) => ({ t: h.t, v: h.gpuBusy }))
    }
  ]
  const tempSeries: Series[] = [
    {
      key: 'gpuEdge',
      label: 'Die edge',
      color: '#22d3ee',
      data: history.map((h) => ({ t: h.t, v: h.gpuEdge }))
    },
    {
      key: 'gpuJunction',
      label: 'Hotspot junction',
      color: '#f87171',
      data: history.map((h) => ({ t: h.t, v: h.gpuJunction }))
    },
    {
      key: 'gpuMem',
      label: 'VRAM junction',
      color: '#facc15',
      data: history.map((h) => ({ t: h.t, v: h.gpuMem }))
    }
  ]
  const powerSeries: Series[] = [
    {
      key: 'gpuPower',
      label: 'PPT (total power)',
      color: '#fb923c',
      data: history.map((h) => ({ t: h.t, v: h.gpuPower }))
    }
  ]
  const voltSeries: Series[] = [
    {
      key: 'gpuVddgfx',
      label: 'vddgfx (core V)',
      color: '#34d399',
      data: history.map((h) => ({ t: h.t, v: h.gpuVddgfx }))
    }
  ]

  return (
    <div className="grid grid-cols-12 gap-4">
      <Card title={s.gpu.model} subtitle="AMDGPU" className="col-span-12">
        <div className="flex flex-wrap items-center gap-6">
          <Gauge value={s.gpu.busy ?? 0} label="Busy" unit="%" size={170} integer />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-3 flex-1 min-w-[260px]">
            <Stat label="Edge" value={fmt.temp(s.gpu.tempEdge)} accent={tempAccent(s.gpu.tempEdge)} size="lg" />
            <Stat label="Junction" value={fmt.temp(s.gpu.tempJunction)} accent={tempAccent(s.gpu.tempJunction, [70, 85, 95])} size="lg" />
            <Stat label="Memory" value={fmt.temp(s.gpu.tempMemory)} accent={tempAccent(s.gpu.tempMemory, [70, 85, 95])} size="lg" />
            <Stat label="vddgfx" value={fmt.volt(s.gpu.vddgfx)} size="lg" />
            <Stat label="Power (PPT)" value={fmt.watt(s.gpu.power)} hint={s.gpu.powerCap != null ? `cap ${fmt.watt(s.gpu.powerCap, 0)}` : undefined} size="md" />
            <Stat label="Core clock" value={fmt.mhz(s.gpu.sclkMHz)} size="md" />
            <Stat label="Memory clock" value={fmt.mhz(s.gpu.mclkMHz)} size="md" />
            <Stat
              label="Fan"
              value={s.gpu.fanRpm != null ? fmt.rpm(s.gpu.fanRpm) : '—'}
              hint={s.gpu.fanPwm != null ? `${s.gpu.fanPwm.toFixed(0)}% PWM` : undefined}
              size="md"
            />
          </div>
        </div>
      </Card>

      <Card title="Overclocking" className="col-span-12">
        <p className="text-sm text-slate-400">
          DPM level, PPT caps, and <span className="mono text-slate-300">pp_od_clk_voltage</span> tables are on the{' '}
          <span className="text-cyan-300/90">Overclock</span> tab.
        </p>
      </Card>

      {s.gpu.powerCap != null && s.gpu.power != null && (
        <Card title="Power & fan" className="col-span-12">
          <div className="space-y-3">
            <BarMeter
              label="PPT"
              value={s.gpu.power}
              max={s.gpu.powerCap}
              display={`${s.gpu.power.toFixed(1)} / ${s.gpu.powerCap.toFixed(0)} W`}
            />
            {s.gpu.fanRpm != null && s.gpu.fanMax != null && s.gpu.fanMax > 0 && (
              <BarMeter
                label="Fan"
                value={s.gpu.fanRpm}
                max={s.gpu.fanMax}
                display={`${Math.round(s.gpu.fanRpm)} / ${Math.round(s.gpu.fanMax)} RPM`}
              />
            )}
          </div>
        </Card>
      )}

      <Card title={`GPU usage · ${rangeLabel}`} className="col-span-12 xl:col-span-6">
        <Sparkline
          series={usageSeries}
          yMax={100}
          unit="%"
          height={228}
          area
          caption="Usage history — GPU busy % from amdgpu (shader / engine activity)."
        />
      </Card>
      <Card title={`Temperatures · ${rangeLabel}`} className="col-span-12 xl:col-span-6">
        <Sparkline
          series={tempSeries}
          unit="°C"
          height={228}
          autoY
          caption="Temperature history — die edge, hotspot junction, and VRAM junction (see legend)."
        />
      </Card>
      <Card title={`Power (PPT) · ${rangeLabel}`} className="col-span-12 xl:col-span-6">
        <Sparkline
          series={powerSeries}
          unit="W"
          height={228}
          autoY
          caption="Power history — total GPU power (PPT) vs driver limit when available."
        />
      </Card>
      <Card title={`vddgfx · ${rangeLabel}`} className="col-span-12 xl:col-span-6">
        <Sparkline
          series={voltSeries}
          unit="V"
          height={228}
          autoY
          caption="Voltage history — gfx core rail (vddgfx) reported by the driver."
        />
      </Card>
    </div>
  )
}
