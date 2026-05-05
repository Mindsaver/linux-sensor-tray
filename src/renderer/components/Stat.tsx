import type { JSX, ReactNode } from 'react'

type Props = {
  label: ReactNode
  value: ReactNode
  unit?: string
  hint?: ReactNode
  /** Optional accent color tag (Tailwind class) for the value, e.g. 'text-amber-400'. */
  accent?: string
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

const SIZES = {
  sm: { value: 'text-base', label: 'text-[10px]' },
  md: { value: 'text-xl', label: 'text-[11px]' },
  lg: { value: 'text-3xl', label: 'text-xs' }
}

export function Stat({
  label,
  value,
  unit,
  hint,
  accent = 'text-slate-100',
  className = '',
  size = 'md'
}: Props): JSX.Element {
  const s = SIZES[size]
  return (
    <div className={'flex flex-col ' + className}>
      <span
        className={
          s.label +
          ' uppercase tracking-wider text-slate-400 font-medium'
        }
      >
        {label}
      </span>
      <span className={'mono font-semibold ' + s.value + ' ' + accent}>
        {value}
        {unit && <span className="ml-1 text-slate-400 text-[0.6em] font-normal">{unit}</span>}
      </span>
      {hint && <span className="text-[10px] text-slate-500 mt-0.5">{hint}</span>}
    </div>
  )
}
