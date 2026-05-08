import type { CpuSnapshot } from '@shared/types'

export function getCpuTelemetryPresentation(cpu: CpuSnapshot): {
  sourceLabel: string
  sourceDescription: string
  primaryTempLabel: string
  secondaryTempLabel: string | null
  showAmdRailStats: boolean
  showCcds: boolean
} {
  switch (cpu.telemetrySource) {
    case 'zenpower':
      return {
        sourceLabel: 'zenpower',
        sourceDescription: 'zenpower',
        primaryTempLabel: 'Tctl',
        secondaryTempLabel: 'Tdie',
        showAmdRailStats: true,
        showCcds: true
      }
    case 'k10temp':
      return {
        sourceLabel: 'k10temp fallback',
        sourceDescription: 'k10temp',
        primaryTempLabel: 'Tctl',
        secondaryTempLabel: 'Tdie',
        showAmdRailStats: false,
        showCcds: false
      }
    case 'coretemp':
      return {
        sourceLabel: 'coretemp',
        sourceDescription: 'Intel coretemp',
        primaryTempLabel: 'Package',
        secondaryTempLabel: 'Core max',
        showAmdRailStats: false,
        showCcds: false
      }
    default:
      return {
        sourceLabel: 'no CPU hwmon',
        sourceDescription: 'available CPU sensors',
        primaryTempLabel: 'CPU temp',
        secondaryTempLabel: null,
        showAmdRailStats: false,
        showCcds: false
      }
  }
}
