import { create } from 'zustand'
import { deriveHistoryPoint } from '@shared/history'
import type { AppSettings, HistoryPoint, SensorSnapshot } from '@shared/types'

/** Matches src/main/settings.ts DEFAULTS until async settings load. */
const DEFAULT_RETENTION_MIN = 360

type Store = {
  latest: SensorSnapshot | null
  history: HistoryPoint[]
  historyCapSamples: number
  chartWindowMinutes: number
  ingest: (s: SensorSnapshot) => void
  applySettings: (s: AppSettings) => void
}

function capSamplesFromMinutes(minutes: number): number {
  return Math.max(10, Math.min(10080, Math.round(minutes))) * 60
}

export const useSensorTray = create<Store>((set, get) => ({
  latest: null,
  history: [],
  historyCapSamples: capSamplesFromMinutes(DEFAULT_RETENTION_MIN),
  chartWindowMinutes: 1,
  ingest: (s) => {
    const point = deriveHistoryPoint(s)
    const cap = get().historyCapSamples
    let next = [...get().history, point]
    if (next.length > cap) next = next.slice(-cap)
    set({ latest: s, history: next })
  },
  applySettings: (s) => {
    const cap = capSamplesFromMinutes(s.historyRetentionMinutes)
    const chart = Math.min(s.chartWindowMinutes, s.historyRetentionMinutes)
    set((state) => {
      let h = state.history
      if (h.length > cap) h = h.slice(-cap)
      return {
        historyCapSamples: cap,
        chartWindowMinutes: chart,
        history: h
      }
    })
  }
}))

/** Bootstrapped after React mounts: subscribe to main-process snapshots. */
export function startSensorBridge(): () => void {
  const api = typeof window !== 'undefined' ? window.api : undefined
  if (!api) {
    console.error(
      '[lst] Preload did not expose window.api — check BrowserWindow webPreferences.preload path'
    )
    return () => {}
  }
  void api.getSettings().then((r) => useSensorTray.getState().applySettings(r))
  const unsub = api.onSnapshot((snap) => useSensorTray.getState().ingest(snap))
  void api.getSnapshot().then((s) => useSensorTray.getState().ingest(s))
  return unsub
}
