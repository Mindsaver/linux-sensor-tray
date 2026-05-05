import type { JSX } from 'react'
import { Card } from '../components/Card'
import { Gauge } from '../components/Gauge'
import { Stat } from '../components/Stat'
import { BarMeter } from '../components/BarMeter'
import { Sparkline, type Series } from '../components/Sparkline'
import { useChartHistoryWindow, useLatest } from '../hooks'
import { fmt, loadAccent, tempAccent } from '../format'
import { cpuFreqSummary } from '@shared/history'

export function Overview(): JSX.Element {
  const s = useLatest()
  const { history, rangeLabel } = useChartHistoryWindow()

  if (!s) {
    return (
      <div className="text-slate-400 text-sm">Waiting for first sensor snapshot…</div>
    )
  }

  const cpuLoadSeries: Series[] = [
    {
      key: 'cpuLoad',
      label: 'CPU load',
      color: '#22d3ee',
      data: history.map((h) => ({ t: h.t, v: h.cpuLoad }))
    },
    {
      key: 'gpuBusy',
      label: 'GPU busy',
      color: '#a78bfa',
      data: history.map((h) => ({ t: h.t, v: h.gpuBusy }))
    },
    {
      key: 'ramUsedPct',
      label: 'RAM used',
      color: '#34d399',
      data: history.map((h) => ({ t: h.t, v: h.ramUsedPct }))
    }
  ]

  const tempSeries: Series[] = [
    {
      key: 'cpuTctl',
      label: 'CPU Tctl',
      color: '#f87171',
      data: history.map((h) => ({ t: h.t, v: h.cpuTctl }))
    },
    {
      key: 'gpuEdge',
      label: 'GPU die edge',
      color: '#22d3ee',
      data: history.map((h) => ({ t: h.t, v: h.gpuEdge }))
    },
    {
      key: 'gpuJunction',
      label: 'GPU junction',
      color: '#fb923c',
      data: history.map((h) => ({ t: h.t, v: h.gpuJunction }))
    },
    {
      key: 'gpuMem',
      label: 'GPU VRAM',
      color: '#facc15',
      data: history.map((h) => ({ t: h.t, v: h.gpuMem }))
    }
  ]

  const memTotalGB = (s.memory.totalKB / (1024 * 1024)).toFixed(1)
  const memUsedGB = (s.memory.usedKB / (1024 * 1024)).toFixed(1)
  const cpuClk = cpuFreqSummary(s.cpu.cores)

  const cpuFreqSeries: Series[] = [
    {
      key: 'cpuAvgMHz',
      label: 'Avg core frequency',
      color: '#38bdf8',
      data: history.map((h) => ({ t: h.t, v: h.cpuAvgMHz }))
    }
  ]

  return (
    <div className="grid grid-cols-12 gap-4">
      <Card title={s.cpu.model} subtitle="CPU" className="col-span-12 md:col-span-6 xl:col-span-4">
        <div className="flex items-center gap-4">
          <Gauge value={s.cpu.loadTotal} max={100} label="Load" unit="%" integer />
          <div className="grid grid-cols-2 gap-3 flex-1">
            <Stat label="Tctl" value={fmt.temp(s.cpu.tempTctl)} accent={tempAccent(s.cpu.tempTctl)} />
            <Stat
              label="CCD"
              value={s.cpu.tempCcds.length ? s.cpu.tempCcds.map((t) => t.toFixed(1)).join(' / ') + ' °C' : '—'}
              accent={tempAccent(s.cpu.tempCcds[0] ?? null)}
            />
            <Stat label="Vcore" value={fmt.volt(s.cpu.vCore)} />
            <Stat label="V SoC" value={fmt.volt(s.cpu.vSoC)} />
            <Stat label="P Core" value={fmt.watt(s.cpu.pCore)} />
            <Stat label="P SoC" value={fmt.watt(s.cpu.pSoC)} />
            <Stat label="Avg core" value={fmt.mhz(cpuClk.avg)} size="sm" />
            <Stat label="Max core" value={fmt.mhz(cpuClk.max)} size="sm" />
          </div>
        </div>
        <p className="mt-3 text-[10px] text-slate-500 border-t border-slate-800/80 pt-2 leading-relaxed">
          CPU tuning & CO: <span className="text-cyan-400/80">Overclock</span> tab
        </p>
      </Card>

      <Card title={s.gpu.model} subtitle="GPU" className="col-span-12 md:col-span-6 xl:col-span-4">
        <div className="flex items-center gap-4">
          <Gauge value={s.gpu.busy ?? 0} max={100} label="Busy" unit="%" integer />
          <div className="grid grid-cols-2 gap-3 flex-1">
            <Stat label="Edge" value={fmt.temp(s.gpu.tempEdge)} accent={tempAccent(s.gpu.tempEdge)} />
            <Stat
              label="Junction"
              value={fmt.temp(s.gpu.tempJunction)}
              accent={tempAccent(s.gpu.tempJunction, [70, 85, 95])}
            />
            <Stat label="Mem T°" value={fmt.temp(s.gpu.tempMemory)} accent={tempAccent(s.gpu.tempMemory, [70, 85, 95])} />
            <Stat label="vddgfx" value={fmt.volt(s.gpu.vddgfx)} />
            <Stat label="Power" value={fmt.watt(s.gpu.power)} hint={s.gpu.powerCap != null ? `cap ${fmt.watt(s.gpu.powerCap, 0)}` : undefined} />
            <Stat label="Clocks" value={`${fmt.mhz(s.gpu.sclkMHz)} / ${fmt.mhz(s.gpu.mclkMHz)}`} size="sm" />
          </div>
        </div>
        <p className="mt-3 text-[10px] text-slate-500 border-t border-slate-800/80 pt-2 leading-relaxed">
          GPU DPM / OC sysfs: <span className="text-cyan-400/80">Overclock</span> tab
        </p>
      </Card>

      <Card title="Memory" subtitle="RAM & Swap" className="col-span-12 md:col-span-6 xl:col-span-4">
        <div className="space-y-3">
          <BarMeter
            label="RAM"
            value={s.memory.usedKB}
            max={s.memory.totalKB || 1}
            display={`${memUsedGB} / ${memTotalGB} GB`}
          />
          {s.memory.swapTotalKB > 0 && (
            <BarMeter
              label="Swap"
              value={s.memory.swapUsedKB}
              max={s.memory.swapTotalKB}
              display={`${(s.memory.swapUsedKB / 1024 / 1024).toFixed(2)} / ${(s.memory.swapTotalKB / 1024 / 1024).toFixed(1)} GB`}
            />
          )}
          <div className="grid grid-cols-3 gap-2 pt-1">
            <Stat label="Total" value={fmt.bytesFromKB(s.memory.totalKB)} size="sm" />
            <Stat label="Used" value={fmt.bytesFromKB(s.memory.usedKB)} accent={loadAccent((s.memory.usedKB / Math.max(1, s.memory.totalKB)) * 100)} size="sm" />
            <Stat label="Free" value={fmt.bytesFromKB(s.memory.availableKB)} size="sm" />
          </div>
        </div>
      </Card>

      <Card
        title="Load history"
        subtitle={`Last ${rangeLabel} · CPU / GPU / RAM`}
        className="col-span-12 xl:col-span-8"
      >
        <Sparkline
          series={cpuLoadSeries}
          yMax={100}
          unit="%"
          height={200}
          area
          caption="Load history — CPU total %, GPU busy %, and RAM used as % of system RAM (same window)."
        />
      </Card>

      <Card
        title="Temperature history"
        subtitle={`Last ${rangeLabel} · CPU Tctl + GPU edge / junction / VRAM`}
        className="col-span-12 xl:col-span-4"
      >
        <Sparkline
          series={tempSeries}
          unit="°C"
          height={200}
          autoY
          caption="Temperature history — CPU Tctl and all AMDGPU temps: die edge, hotspot junction, and VRAM junction (see legend)."
        />
      </Card>

      <Card
        title="CPU frequency history"
        subtitle={`Last ${rangeLabel} · mean of per-core scaling frequency`}
        className="col-span-12"
      >
        <Sparkline
          series={cpuFreqSeries}
          unit="MHz"
          height={200}
          autoY
          caption="Average CPU clock across all cores each sample (from cpufreq scaling_cur_freq). Compare with the Overclock tab for limits and governor."
        />
      </Card>

      {s.mainboard.chip && (
        <Card title="Mainboard voltages" subtitle={`chip: ${s.mainboard.chip}`} className="col-span-12 md:col-span-6 xl:col-span-4">
          <div className="grid grid-cols-3 gap-2">
            {s.mainboard.voltages.slice(0, 12).map((v) => (
              <Stat key={v.label} label={v.label} value={fmt.volt(v.volts, 2)} size="sm" />
            ))}
          </div>
        </Card>
      )}

      <Card title="Fans" className="col-span-12 md:col-span-6 xl:col-span-4">
        {s.mainboard.fans.length === 0 && (
          <div className="text-xs text-slate-500">No fans reporting RPM.</div>
        )}
        <div className="grid grid-cols-2 gap-2">
          {s.mainboard.fans.map((f) => (
            <Stat key={f.label} label={f.label} value={fmt.rpm(f.rpm)} size="sm" />
          ))}
          {s.gpu.fanRpm != null && (
            <Stat
              label="GPU fan"
              value={fmt.rpm(s.gpu.fanRpm)}
              hint={s.gpu.fanPwm != null ? `${s.gpu.fanPwm.toFixed(0)}% PWM` : undefined}
              size="sm"
            />
          )}
        </div>
      </Card>

      <Card title="Storage" subtitle="NVMe temperatures" className="col-span-12 md:col-span-6 xl:col-span-4">
        {s.storage.drives.length === 0 ? (
          <div className="text-xs text-slate-500">No NVMe drives detected.</div>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {s.storage.drives.map((d) => (
              <div
                key={d.label}
                className="flex items-center justify-between rounded-lg border border-slate-800/80 bg-slate-900/40 px-3 py-2"
              >
                <span className="mono text-sm text-slate-200">{d.label}</span>
                <span className={'mono text-sm ' + tempAccent(d.composite, [55, 70, 80])}>
                  {fmt.temp(d.composite)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
