import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC_CHANNEL_SNAPSHOT,
  type AppSettings,
  type AppSettingsResolved,
  type SensorSnapshot,
  type SetupCapabilities,
  type SetupCommandResult,
  type SetupWizardState,
  type TaskMonitorSnapshot,
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
  getTasks(): Promise<TaskMonitorSnapshot> {
    return ipcRenderer.invoke('tasks:get') as Promise<TaskMonitorSnapshot>
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
  },
  /**
   * Get the real app icon (from packaged `icon.png` / dev `build/icon.png`) as a PNG data URL.
   * Safe for use in the renderer UI and favicon.
   */
  getAppIconDataUrl(size?: number): Promise<string> {
    return ipcRenderer.invoke('app:getIconDataUrl', size) as Promise<string>
  },
  setup: {
    getCapabilities(): Promise<SetupCapabilities> {
      return ipcRenderer.invoke('setup:capabilities') as Promise<SetupCapabilities>
    },
    getWizardState(): Promise<SetupWizardState> {
      return ipcRenderer.invoke('setup:wizardState') as Promise<SetupWizardState>
    },
    markWizardSeen(): Promise<SetupWizardState> {
      return ipcRenderer.invoke('setup:markWizardSeen') as Promise<SetupWizardState>
    },
    resetWizardSeen(): Promise<SetupWizardState> {
      return ipcRenderer.invoke('setup:resetWizardSeen') as Promise<SetupWizardState>
    },
    configureZenpower(): Promise<SetupCommandResult> {
      return ipcRenderer.invoke('setup:configureZenpower') as Promise<SetupCommandResult>
    },
    revertZenpower(): Promise<SetupCommandResult> {
      return ipcRenderer.invoke('setup:revertZenpower') as Promise<SetupCommandResult>
    },
    installPolkitRule(): Promise<SetupCommandResult> {
      return ipcRenderer.invoke('setup:installPolkitRule') as Promise<SetupCommandResult>
    },
    removePolkitRule(): Promise<SetupCommandResult> {
      return ipcRenderer.invoke('setup:removePolkitRule') as Promise<SetupCommandResult>
    },
    installDeps(packages: string[]): Promise<SetupCommandResult> {
      return ipcRenderer.invoke('setup:installDeps', packages) as Promise<SetupCommandResult>
    }
  }
}

declare global {
  interface Window {
    api: typeof api
  }
}

contextBridge.exposeInMainWorld('api', api)
