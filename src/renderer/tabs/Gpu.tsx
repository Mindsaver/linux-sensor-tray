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

  const gpu = s.gpu
  const isNvidia = gpu.vendor === 'nvidia'

  if (gpu.vendor === 'unknown') {
    return (
      <div className="grid grid-cols-12 gap-4">
        <Card title={gpu.model} subtitle="No supported GPU sensors" className="col-span-12">
          <p className="text-sm text-slate-400 leading-relaxed max-w-3xl">
            Neither GPU backend answered. AMD cards report through the{' '}
            <span className="mono text-cyan-300/90">amdgpu</span> hwmon node; NVIDIA cards need the proprietary
            driver loaded and <span className="mono text-cyan-300/90">nvidia-smi</span> on <span className="mono">PATH</span>.
            Intel and nouveau are not supported.
          </p>
        </Card>
      </div>
    )
  }

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
      label: isNvidia ? 'Core' : 'Die edge',
      color: '#22d3ee',
      data: history.map((h) => ({ t: h.t, v: h.gpuEdge }))
    },
    ...(isNvidia
      ? []
      : [
          {
            key: 'gpuJunction',
            label: 'Hotspot junction',
            color: '#f87171',
            data: history.map((h) => ({ t: h.t, v: h.gpuJunction }))
          }
        ]),
    {
      key: 'gpuMem',
      label: isNvidia ? 'Memory' : 'VRAM junction',
      color: '#facc15',
      data: history.map((h) => ({ t: h.t, v: h.gpuMem }))
    }
  ]
  const powerSeries: Series[] = [
    {
      key: 'gpuPower',
      label: isNvidia ? 'Board power' : 'PPT (total power)',
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
  const vramSeries: Series[] = [
    {
      key: 'gpuVram',
      label: 'VRAM used',
      color: '#34d399',
      data: history.map((h) => ({ t: h.t, v: h.gpuVramUsedMiB }))
    }
  ]

  const powerLabel = isNvidia ? 'Power' : 'Power (PPT)'
  const vramTotalMiB = gpu.vramTotalBytes != null ? gpu.vramTotalBytes / (1024 * 1024) : null

  return (
    <div className="grid grid-cols-12 gap-4">
      <Card title={gpu.model} subtitle={isNvidia ? 'NVIDIA · nvidia-smi' : 'AMDGPU'} className="col-span-12">
        <div className="flex flex-wrap items-center gap-6">
          <Gauge value={gpu.busy ?? 0} label="Busy" unit="%" size={170} integer />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-3 flex-1 min-w-[260px]">
            <Stat
              label={isNvidia ? 'Core' : 'Edge'}
              value={fmt.temp(gpu.tempEdge)}
              accent={tempAccent(gpu.tempEdge)}
              size="lg"
            />
            {isNvidia ? (
              <Stat
                label="VRAM"
                value={gpu.vramUsedBytes != null ? fmt.bytes(gpu.vramUsedBytes) : '—'}
                hint={gpu.vramTotalBytes != null ? `of ${fmt.bytes(gpu.vramTotalBytes)}` : undefined}
                size="lg"
              />
            ) : (
              <Stat
                label="Junction"
                value={fmt.temp(gpu.tempJunction)}
                accent={tempAccent(gpu.tempJunction, [70, 85, 95])}
                size="lg"
              />
            )}
            <Stat
              label={isNvidia ? 'Memory T°' : 'Memory'}
              value={fmt.temp(gpu.tempMemory)}
              accent={tempAccent(gpu.tempMemory, [70, 85, 95])}
              size="lg"
            />
            {isNvidia ? (
              <Stat
                label="P-state"
                value={gpu.nvidiaTuning?.pstate ?? '—'}
                hint={gpu.nvidiaTuning?.memoryUtil != null ? `mem bus ${fmt.pct(gpu.nvidiaTuning.memoryUtil)}` : undefined}
                size="lg"
              />
            ) : (
              <Stat label="vddgfx" value={fmt.volt(gpu.vddgfx)} size="lg" />
            )}
            <Stat
              label={powerLabel}
              value={fmt.watt(gpu.power)}
              hint={gpu.powerCap != null ? `cap ${fmt.watt(gpu.powerCap, 0)}` : undefined}
              size="md"
            />
            <Stat label="Core clock" value={fmt.mhz(gpu.sclkMHz)} size="md" />
            <Stat label="Memory clock" value={fmt.mhz(gpu.mclkMHz)} size="md" />
            <Stat
              label="Fan"
              value={
                gpu.fanRpm != null
                  ? fmt.rpm(gpu.fanRpm)
                  : gpu.fanPwm != null
                    ? fmt.pct(gpu.fanPwm)
                    : '—'
              }
              hint={
                gpu.fanRpm != null && gpu.fanPwm != null ? `${gpu.fanPwm.toFixed(0)}% PWM` : undefined
              }
              size="md"
            />
          </div>
        </div>
        {isNvidia && (gpu.nvidiaTuning?.throttleReasons.length ?? 0) > 0 && (
          <p className="mt-3 text-[11px] text-amber-300/90 border-t border-slate-800/80 pt-2 m-0">
            Clocks limited by: {gpu.nvidiaTuning?.throttleReasons.join(', ')}
          </p>
        )}
      </Card>

      {((gpu.powerCap != null && gpu.power != null) ||
        (gpu.vramTotalBytes != null && gpu.vramUsedBytes != null)) && (
        <Card title={isNvidia ? 'Power & VRAM' : 'Power & fan'} className="col-span-12">
          <div className="space-y-3">
            {gpu.powerCap != null && gpu.power != null && (
              <BarMeter
                label={isNvidia ? 'Board power' : 'PPT'}
                value={gpu.power}
                max={gpu.powerCap}
                display={`${gpu.power.toFixed(1)} / ${gpu.powerCap.toFixed(0)} W`}
              />
            )}
            {gpu.vramTotalBytes != null && gpu.vramUsedBytes != null && gpu.vramTotalBytes > 0 && (
              <BarMeter
                label="VRAM"
                value={gpu.vramUsedBytes}
                max={gpu.vramTotalBytes}
                display={`${fmt.bytes(gpu.vramUsedBytes)} / ${fmt.bytes(gpu.vramTotalBytes)}`}
              />
            )}
            {gpu.fanRpm != null && gpu.fanMax != null && gpu.fanMax > 0 && (
              <BarMeter
                label="Fan"
                value={gpu.fanRpm}
                max={gpu.fanMax}
                display={`${Math.round(gpu.fanRpm)} / ${Math.round(gpu.fanMax)} RPM`}
              />
            )}
            {gpu.fanRpm == null && gpu.fanPwm != null && (
              <BarMeter
                label="Fan"
                value={gpu.fanPwm}
                max={100}
                display={`${gpu.fanPwm.toFixed(0)} %`}
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
          caption={
            isNvidia
              ? 'Usage history — utilization.gpu from nvidia-smi (share of the last sample period with work running).'
              : 'Usage history — GPU busy % from amdgpu (shader / engine activity).'
          }
        />
      </Card>
      <Card title={`Temperatures · ${rangeLabel}`} className="col-span-12 xl:col-span-6">
        <Sparkline
          series={tempSeries}
          unit="°C"
          height={228}
          autoY
          caption={
            isNvidia
              ? 'Temperature history — core temperature, plus memory temperature when the board reports it.'
              : 'Temperature history — die edge, hotspot junction, and VRAM junction (see legend).'
          }
        />
      </Card>
      <Card title={`${powerLabel} · ${rangeLabel}`} className="col-span-12 xl:col-span-6">
        <Sparkline
          series={powerSeries}
          unit="W"
          height={228}
          autoY
          caption={
            isNvidia
              ? 'Power history — total board power draw vs the enforced limit when available.'
              : 'Power history — total GPU power (PPT) vs driver limit when available.'
          }
        />
      </Card>
      {isNvidia ? (
        <Card title={`VRAM used · ${rangeLabel}`} className="col-span-12 xl:col-span-6">
          <Sparkline
            series={vramSeries}
            unit="MiB"
            height={228}
            autoY
            yMax={vramTotalMiB ?? undefined}
            caption="VRAM history — memory.used from nvidia-smi. nvidia-smi reports no voltage, so there is no vddgfx trace."
          />
        </Card>
      ) : (
        <Card title={`vddgfx · ${rangeLabel}`} className="col-span-12 xl:col-span-6">
          <Sparkline
            series={voltSeries}
            unit="V"
            height={228}
            autoY
            caption="Voltage history — gfx core rail (vddgfx) reported by the driver."
          />
        </Card>
      )}
    </div>
  )
}
