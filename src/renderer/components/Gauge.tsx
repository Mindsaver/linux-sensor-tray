import type { JSX } from 'react'

type Props = {
  /** value between 0 and `max`. */
  value: number
  /** maximum (default 100). */
  max?: number
  /** Diameter in px. */
  size?: number
  /** Stroke width in px. */
  stroke?: number
  /** Label below the value. */
  label?: string
  /** Unit text after the value. */
  unit?: string
  /** When true, the value is displayed without decimals. */
  integer?: boolean
  /** Color thresholds: stops at fractions of `max` mapping to color names. */
  colorFor?: (value: number, max: number) => string
}

const defaultColor = (v: number, max: number): string => {
  const r = v / max
  if (r >= 0.92) return '#f87171' // red-400
  if (r >= 0.78) return '#fb923c' // orange-400
  if (r >= 0.6) return '#facc15' // yellow-400
  if (r >= 0.35) return '#4ade80' // green-400
  return '#22d3ee' // cyan-400
}

export function Gauge({
  value,
  max = 100,
  size = 130,
  stroke = 12,
  label,
  unit,
  integer = false,
  colorFor = defaultColor
}: Props): JSX.Element {
  const safeValue = Number.isFinite(value) ? Math.max(0, Math.min(max, value)) : 0
  const r = (size - stroke) / 2
  const cx = size / 2
  const cy = size / 2
  const circumference = 2 * Math.PI * r
  // Use 75% of circle (270deg sweep) as the gauge arc range.
  const sweep = 0.75
  const dashTotal = circumference * sweep
  const filled = dashTotal * (safeValue / max)
  const color = colorFor(safeValue, max)

  return (
    <div
      className="relative inline-flex items-center justify-center select-none"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: 'rotate(135deg)' }}
      >
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="#1f2944"
          strokeWidth={stroke}
          strokeDasharray={`${dashTotal} ${circumference}`}
          strokeLinecap="round"
        />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={`${filled} ${circumference}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 350ms ease-out' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="mono font-bold leading-none"
          style={{ fontSize: size * 0.26, color }}
        >
          {integer ? Math.round(safeValue) : safeValue.toFixed(1)}
          {unit && (
            <span
              className="font-normal text-slate-400 ml-1"
              style={{ fontSize: size * 0.13 }}
            >
              {unit}
            </span>
          )}
        </span>
        {label && (
          <span className="text-[10px] uppercase tracking-wider text-slate-400 mt-1">
            {label}
          </span>
        )}
      </div>
    </div>
  )
}
