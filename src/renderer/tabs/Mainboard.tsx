import type { JSX } from 'react'
import { Card } from '../components/Card'
import { Stat } from '../components/Stat'
import { useLatest } from '../hooks'
import { fmt, tempAccent } from '../format'

export function MainboardTab(): JSX.Element {
  const s = useLatest()
  if (!s) return <div className="text-slate-400 text-sm">Waiting…</div>
  const m = s.mainboard

  if (!m.chip) {
    return (
      <Card title="Mainboard">
        <p className="text-sm text-slate-300">
          No supported super-IO chip found in <span className="mono">/sys/class/hwmon</span>. Common
          chips like <span className="mono text-cyan-300">nct6687</span> may need the
          <span className="mono mx-1 text-cyan-300">nct6687d</span> kernel module to be loaded.
        </p>
      </Card>
    )
  }

  return (
    <div className="grid grid-cols-12 gap-4">
      <Card
        title="Voltages"
        subtitle={`chip: ${m.chip}`}
        className="col-span-12 xl:col-span-6"
      >
        {m.voltages.length === 0 ? (
          <div className="text-xs text-slate-500">No voltages reported.</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
            {m.voltages.map((v) => (
              <Stat key={v.label} label={v.label} value={fmt.volt(v.volts, 2)} size="md" />
            ))}
          </div>
        )}
      </Card>

      <Card title="Temperatures" className="col-span-12 xl:col-span-3">
        {m.temps.length === 0 ? (
          <div className="text-xs text-slate-500">No mainboard temperatures reported.</div>
        ) : (
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            {m.temps.map((t, i) => (
              <Stat
                key={t.label + i}
                label={t.label}
                value={fmt.temp(t.tempC)}
                accent={tempAccent(t.tempC, [55, 70, 85])}
                size="md"
              />
            ))}
          </div>
        )}
      </Card>

      <Card title="Fans" className="col-span-12 xl:col-span-3">
        {m.fans.length === 0 ? (
          <div className="text-xs text-slate-500">No fans reporting RPM.</div>
        ) : (
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            {m.fans.map((f) => (
              <Stat key={f.label} label={f.label} value={fmt.rpm(f.rpm)} size="md" />
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
