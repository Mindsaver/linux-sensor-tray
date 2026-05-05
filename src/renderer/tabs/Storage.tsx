import type { JSX } from 'react'
import { Card } from '../components/Card'
import { Stat } from '../components/Stat'
import { useLatest } from '../hooks'
import { fmt, tempAccent } from '../format'

export function StorageTab(): JSX.Element {
  const s = useLatest()
  if (!s) return <div className="text-slate-400 text-sm">Waiting…</div>

  const drives = s.storage.drives

  return (
    <div className="grid grid-cols-12 gap-4">
      {drives.length === 0 && (
        <Card title="Storage" className="col-span-12">
          <div className="text-xs text-slate-500">No NVMe drives detected.</div>
        </Card>
      )}
      {drives.map((d) => (
        <Card key={d.label} title={d.label} subtitle="NVMe" className="col-span-12 md:col-span-6 xl:col-span-4">
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            <Stat
              label="Composite"
              value={fmt.temp(d.composite)}
              accent={tempAccent(d.composite, [55, 70, 80])}
              size="lg"
            />
            {d.sensorsAdditional.map((sn) => (
              <Stat
                key={sn.label}
                label={sn.label}
                value={fmt.temp(sn.tempC)}
                accent={tempAccent(sn.tempC, [55, 70, 80])}
                size="md"
              />
            ))}
          </div>
        </Card>
      ))}
    </div>
  )
}
