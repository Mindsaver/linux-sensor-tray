import type { JSX, ReactNode } from 'react'

type Props = {
  label: ReactNode
  value: number
  max?: number
  unit?: string
  display?: ReactNode
  /** Color thresholds. */
  colorFor?: (v: number, max: number) => string
  className?: string
}

const defaultColor = (v: number, max: number): string => {
  const r = v / max
  if (r >= 0.92) return 'bg-red-500'
  if (r >= 0.78) return 'bg-orange-500'
  if (r >= 0.6) return 'bg-yellow-500'
  if (r >= 0.35) return 'bg-emerald-500'
  return 'bg-cyan-500'
}

export function BarMeter({
  label,
  value,
  max = 100,
  unit,
  display,
  colorFor = defaultColor,
  className = ''
}: Props): JSX.Element {
  const safe = Number.isFinite(value) ? Math.max(0, Math.min(max, value)) : 0
  const pct = (safe / max) * 100
  return (
    <div className={'flex flex-col gap-1 ' + className}>
      <div className="flex justify-between items-baseline">
        <span className="text-[11px] uppercase tracking-wider text-slate-400">{label}</span>
        <span className="mono text-xs text-slate-200">
          {display != null ? display : `${safe.toFixed(1)}${unit ? ' ' + unit : ''}`}
        </span>
      </div>
      <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
        <div
          className={'h-full transition-[width] duration-300 ease-out ' + colorFor(safe, max)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
