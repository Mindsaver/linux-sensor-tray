import type {
  AppSettings,
  AppSettingsResolved,
  SensorSnapshot,
  SystemInfoSnapshot
} from '@shared/types'

declare global {
  interface Window {
    api: {
      onSnapshot: (cb: (snap: SensorSnapshot) => void) => () => void
      getSnapshot: () => Promise<SensorSnapshot>
      getSettings: () => Promise<AppSettingsResolved>
      setSettings: (partial: Partial<AppSettings>) => Promise<AppSettingsResolved>
      openHistoryLogFolder: () => Promise<void>
      chooseHistoryLogDir: () => Promise<string | null>
      getDefaultHistoryLogDir: () => Promise<string>
      getSystemInfo: () => Promise<SystemInfoSnapshot>
      enrichSystemInfo: () => Promise<SystemInfoSnapshot>
      polkitRuleStatus: () => Promise<{
        supported: boolean
        installed: boolean | null
        readable: boolean
        matchesShippedRule: boolean | null
        path: string
      }>
      installPolkitRule: () => Promise<{
        supported: boolean
        installed: boolean | null
        readable: boolean
        matchesShippedRule: boolean | null
        path: string
      }>
      uninstallPolkitRule: () => Promise<{
        supported: boolean
        installed: boolean | null
        readable: boolean
        matchesShippedRule: boolean | null
        path: string
      }>
    }
  }
}

export {}
