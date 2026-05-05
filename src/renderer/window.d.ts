import type { AppSettings, AppSettingsResolved, SensorSnapshot } from '@shared/types'

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
    }
  }
}

export {}
