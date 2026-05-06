import type {
  AppSettings,
  AppSettingsResolved,
  SensorSnapshot,
  SystemInfoSnapshot,
  TaskMonitorSnapshot
} from '@shared/types'

type PolkitRuleStatus = {
  supported: boolean
  installed: boolean | null
  readable: boolean
  matchesShippedRule: boolean | null
  path: string
}

type PreloadApi = {
  onSnapshot(cb: (snap: SensorSnapshot) => void): () => void
  getSnapshot(): Promise<SensorSnapshot>
  getTasks(): Promise<TaskMonitorSnapshot>
  getSettings(): Promise<AppSettingsResolved>
  setSettings(partial: Partial<AppSettings>): Promise<AppSettingsResolved>
  openHistoryLogFolder(): Promise<void>
  chooseHistoryLogDir(): Promise<string | null>
  getDefaultHistoryLogDir(): Promise<string>
  getSystemInfo(): Promise<SystemInfoSnapshot>
  enrichSystemInfo(): Promise<SystemInfoSnapshot>
  polkitRuleStatus(): Promise<PolkitRuleStatus>
  installPolkitRule(): Promise<PolkitRuleStatus>
  uninstallPolkitRule(): Promise<PolkitRuleStatus>
  getAppIconDataUrl(size?: number): Promise<string>
}

declare global {
  interface Window {
    api: PreloadApi
  }
}

export {}
