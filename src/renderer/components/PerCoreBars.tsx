import type { JSX } from 'react'
import type { CpuCore } from '@shared/types'

type Props = {
  cores: CpuCore[]
}

const colorFor = (load: number): string => {
  if (load >= 92) return 'bg-red-500'
  if (load >= 78) return 'bg-orange-500'
  if (load >= 55) return 'bg-yellow-500'
  if (load >= 25) return 'bg-emerald-500'
  return 'bg-cyan-500'
}

export function PerCoreBars({ cores }: Props): JSX.Element {
  return (
    <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-8">
      {cores.map((c) => (
        <div
          key={c.index}
          className="rounded-lg border border-slate-800 bg-slate-900/60 p-2"
        >
          <div className="flex items-baseline justify-between text-[10px] text-slate-400">
            <span className="mono">#{c.index}</span>
            <span className="mono">
              {c.freqMHz != null ? (c.freqMHz / 1000).toFixed(2) + ' GHz' : '—'}
            </span>
          </div>
          <div className="mt-1 h-12 flex items-end">
            <div className="w-full bg-slate-800 rounded-sm overflow-hidden h-full flex flex-col-reverse">
              <div
                className={'w-full transition-[height] duration-300 ease-out ' + colorFor(c.load)}
                style={{ height: `${Math.max(0, Math.min(100, c.load))}%` }}
              />
            </div>
          </div>
          <div className="mt-1 text-center mono text-[11px] text-slate-200">
            {c.load.toFixed(0)}%
          </div>
        </div>
      ))}
    </div>
  )
}
