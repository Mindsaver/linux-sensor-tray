import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC_CHANNEL_SNAPSHOT,
  type AppSettings,
  type AppSettingsResolved,
  type SensorSnapshot
} from '@shared/types'

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
  }
}

declare global {
  interface Window {
    api: typeof api
  }
}

contextBridge.exposeInMainWorld('api', api)
