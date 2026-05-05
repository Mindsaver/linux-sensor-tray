import { useMemo } from 'react'
import type { HistoryPoint } from '@shared/types'
import { useSensorTray } from './store'
import { fmt } from './format'

/**
 * Chart window from settings (minutes → samples @ 1 Hz).
 * Do not slice inside the Zustand selector — unstable snapshots break React 19.
 */
export function useChartHistoryWindow(): { history: HistoryPoint[]; rangeLabel: string } {
  const chartWindowMinutes = useSensorTray((s) => s.chartWindowMinutes)
  const historyBuf = useSensorTray((s) => s.history)
  const windowSeconds = chartWindowMinutes * 60
  const history = useMemo(() => {
    if (historyBuf.length === 0) return historyBuf
    if (historyBuf.length <= windowSeconds) return historyBuf
    return historyBuf.slice(-windowSeconds)
  }, [historyBuf, windowSeconds])
  const rangeLabel = fmt.historyRangeMinutes(chartWindowMinutes)
  return { history, rangeLabel }
}

/** Retention cap in minutes (for Settings UI / labels). */
export function useHistoryRetentionMinutes(): number {
  const capSamples = useSensorTray((s) => s.historyCapSamples)
  return Math.round(capSamples / 60)
}

/** Convenience: subscribe to the latest snapshot only. */
export function useLatest() {
  return useSensorTray((s) => s.latest)
}
