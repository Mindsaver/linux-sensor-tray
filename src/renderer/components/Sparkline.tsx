import { useLayoutEffect, useMemo, useRef, useState, type JSX } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'

export type Series = {
  key: string
  label: string
  color: string
  data: { t: number; v: number | null }[]
}

type Props = {
  series: Series[]
  height?: number
  /** When set, Y-axis is forced to [0, max]. */
  yMax?: number
  /** When true, Y-axis auto-fits with a small padding. */
  autoY?: boolean
  unit?: string
  /** Use stacked area look instead of line. */
  area?: boolean
  /** Render compact axis labels and grid? */
  compact?: boolean
  /** Short explanation under the chart (e.g. what the lines represent). */
  caption?: string
  /** Show a color legend for each line (default: true if more than one series). */
  showLegend?: boolean
}

function fmtTime(ms: number): string {
  const d = new Date(ms)
  return `${d.getHours().toString().padStart(2, '0')}:${d
    .getMinutes()
    .toString()
    .padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`
}

export function Sparkline({
  series,
  height = 120,
  yMax,
  autoY = false,
  unit = '',
  area = false,
  compact = false,
  caption,
  showLegend
}: Props): JSX.Element {
  const legendOn = showLegend ?? series.length > 1
  /** Extra SVG pixels so the legend does not shrink the plot (legend sits in bottom margin). */
  const svgHeight = height + (legendOn ? 44 : 0)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [chartWidth, setChartWidth] = useState(0)

  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = (): void => {
      const w = Math.max(1, Math.floor(el.getBoundingClientRect().width))
      setChartWidth(w)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Build merged dataset by timestamp.
  const data = useMemo(() => {
    const tIndex = new Map<number, Record<string, number | null | undefined> & { t: number }>()
    for (const s of series) {
      for (const p of s.data) {
        const row = tIndex.get(p.t) ?? { t: p.t }
        row[s.key] = p.v
        tIndex.set(p.t, row)
      }
    }
    return Array.from(tIndex.values()).sort((a, b) => a.t - b.t)
  }, [series])

  const yDomain: [number | string, number | string] = yMax != null
    ? [0, yMax]
    : autoY
      ? ['auto', 'auto']
      : ['dataMin', 'dataMax']

  const Chart = area ? AreaChart : LineChart

  return (
    <div ref={wrapRef} className="w-full min-w-0">
      {chartWidth > 0 && (
        <>
          <Chart
            width={chartWidth}
            height={svgHeight}
            data={data}
            margin={{
              top: 8,
              right: 10,
              left: compact ? -20 : 2,
              bottom: legendOn ? 34 : 6
            }}
          >
            <CartesianGrid stroke="#1c2541" strokeDasharray="2 4" vertical={false} />
            <XAxis
              dataKey="t"
              tickFormatter={fmtTime}
              stroke="#3a4a78"
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              minTickGap={50}
              hide={compact}
            />
            <YAxis
              stroke="#3a4a78"
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              domain={yDomain}
              width={compact ? 30 : 40}
              tickFormatter={(v: number) => v.toFixed(0)}
            />
            <Tooltip
              contentStyle={{
                background: '#0f172a',
                border: '1px solid #233057',
                borderRadius: 8,
                color: '#e2e8f0',
                fontSize: 12
              }}
              labelFormatter={(v) => fmtTime(v as number)}
              formatter={(v, name) => {
                const val =
                  typeof v === 'number' ? v.toFixed(1) : v == null ? '—' : String(v)
                const u = unit ? ` ${unit}` : ''
                return [`${val}${u}`, String(name)]
              }}
            />
            {legendOn && (
              <Legend
                verticalAlign="bottom"
                align="left"
                iconType="line"
                iconSize={12}
                wrapperStyle={{
                  fontSize: compact ? 10 : 11,
                  color: '#94a3b8',
                  paddingTop: 2
                }}
              />
            )}
            {series.map((s) =>
              area ? (
                <Area
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={s.color}
                  fill={s.color}
                  fillOpacity={0.18}
                  strokeWidth={1.6}
                  isAnimationActive={false}
                  dot={false}
                  connectNulls
                />
              ) : (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={s.color}
                  strokeWidth={1.6}
                  dot={false}
                  isAnimationActive={false}
                  connectNulls
                />
              )
            )}
          </Chart>
          {!legendOn && series[0] && (
            <p className="text-[11px] text-slate-500 mt-1 leading-snug">
              <span className="inline-block w-2.5 h-0.5 rounded-full mr-1.5 align-middle" style={{ backgroundColor: series[0].color }} />
              {series[0].label}
              {unit ? ` · ${unit}` : ''}
            </p>
          )}
          {caption ? (
            <p className="text-[11px] text-slate-500 mt-1.5 leading-snug border-t border-slate-800/60 pt-1.5">
              {caption}
            </p>
          ) : null}
        </>
      )}
    </div>
  )
}
