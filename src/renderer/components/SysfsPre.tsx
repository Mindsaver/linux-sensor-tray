import type { JSX } from 'react'

type Props = {
  label: string
  text: string | null | undefined
  /** max height tailwind class */
  maxHeightClass?: string
}

/** Scrollable monospace dump of multi-line sysfs content. */
export function SysfsPre({ label, text, maxHeightClass = 'max-h-40' }: Props): JSX.Element | null {
  if (text == null || text === '') return null
  return (
    <div className="mt-3 min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">{label}</div>
      <pre
        className={
          'mono text-[10px] leading-relaxed text-slate-300 bg-slate-950/80 border border-slate-800 rounded-lg p-3 overflow-auto whitespace-pre-wrap break-all ' +
          maxHeightClass
        }
      >
        {text}
      </pre>
    </div>
  )
}
