import type { JSX, ReactNode } from 'react'

type Props = {
  title?: ReactNode
  subtitle?: ReactNode
  right?: ReactNode
  className?: string
  children: ReactNode
}

export function Card({ title, subtitle, right, className = '', children }: Props): JSX.Element {
  return (
    <div
      className={
        'min-w-0 rounded-2xl border border-slate-800/80 bg-slate-900/60 backdrop-blur-sm shadow-lg shadow-black/30 p-4 ' +
        className
      }
    >
      {(title || right) && (
        <div className="flex items-baseline justify-between mb-3">
          <div>
            {title && <h3 className="text-sm font-semibold text-slate-200">{title}</h3>}
            {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          {right && <div className="text-xs text-slate-400">{right}</div>}
        </div>
      )}
      {children}
    </div>
  )
}
