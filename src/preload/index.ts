import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC_CHANNEL_SNAPSHOT,
  type AppSettings,
  type AppSettingsResolved,
  type SensorSnapshot,
  type SystemInfoSnapshot
} from '@shared/types'

type PolkitRuleStatus = {
  supported: boolean
  installed: boolean | null
  readable: boolean
  matchesShippedRule: boolean | null
  path: string
}

const api = {
  /**
   * Subscribe to live sensor snapshots from the main process.
   * Returns an unsubscribe function.
   */
  onSnapshot(cb: (snap: SensorSnapshot) => void): () => void {
    const handler = (_e: unknown, snap: SensorSnapshot): void => cb(snap)
    ipcRenderer.on(IPC_CHANNEL_SNAPSHOT, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNEL_SNAPSHOT, handler)
    }
  },
  /** Request a single snapshot immediately. */
  getSnapshot(): Promise<SensorSnapshot> {
    return ipcRenderer.invoke('sensors:get') as Promise<SensorSnapshot>
  },
  getSettings(): Promise<AppSettingsResolved> {
    return ipcRenderer.invoke('settings:get') as Promise<AppSettingsResolved>
  },
  setSettings(partial: Partial<AppSettings>): Promise<AppSettingsResolved> {
    return ipcRenderer.invoke('settings:set', partial) as Promise<AppSettingsResolved>
  },
  openHistoryLogFolder(): Promise<void> {
    return ipcRenderer.invoke('history:openLogFolder') as Promise<void>
  },
  chooseHistoryLogDir(): Promise<string | null> {
    return ipcRenderer.invoke('history:chooseLogDir') as Promise<string | null>
  },
  getDefaultHistoryLogDir(): Promise<string> {
    return ipcRenderer.invoke('history:defaultLogDir') as Promise<string>
  },
  getSystemInfo(): Promise<SystemInfoSnapshot> {
    return ipcRenderer.invoke('system:getInfo') as Promise<SystemInfoSnapshot>
  },
  /** Re-collect system info while forcing a polkit/pkexec privileged lshw probe. */
  enrichSystemInfo(): Promise<SystemInfoSnapshot> {
    return ipcRenderer.invoke('system:enrichWithRoot') as Promise<SystemInfoSnapshot>
  },
  polkitRuleStatus(): Promise<PolkitRuleStatus> {
    return ipcRenderer.invoke('polkit:ruleStatus') as Promise<PolkitRuleStatus>
  },
  installPolkitRule(): Promise<PolkitRuleStatus> {
    return ipcRenderer.invoke('polkit:installRule') as Promise<PolkitRuleStatus>
  },
  uninstallPolkitRule(): Promise<PolkitRuleStatus> {
    return ipcRenderer.invoke('polkit:uninstallRule') as Promise<PolkitRuleStatus>
  }
}

declare global {
  interface Window {
    api: typeof api
  }
}

contextBridge.exposeInMainWorld('api', api)
