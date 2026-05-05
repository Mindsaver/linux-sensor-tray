import { useEffect, useState, type JSX } from 'react'
import { startSensorBridge, useSensorTray } from './store'
import { Overview } from './tabs/Overview'
import { CpuTab } from './tabs/Cpu'
import { GpuTab } from './tabs/Gpu'
import { MainboardTab } from './tabs/Mainboard'
import { StorageTab } from './tabs/Storage'
import { OverclockTab } from './tabs/Overclock'
import { SettingsTab } from './tabs/Settings'
import { ChartWindowControl } from './components/ChartWindowControl'

type TabId = 'overview' | 'cpu' | 'gpu' | 'overclock' | 'mobo' | 'storage' | 'settings'

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'cpu', label: 'CPU' },
  { id: 'gpu', label: 'GPU' },
  { id: 'overclock', label: 'Overclock' },
  { id: 'mobo', label: 'Mainboard' },
  { id: 'storage', label: 'Storage' },
  { id: 'settings', label: 'Settings' }
]

export default function App(): JSX.Element {
  const [tab, setTab] = useState<TabId>('overview')
  const latest = useSensorTray((s) => s.latest)
  const [preloadOk] = useState(() => typeof window !== 'undefined' && !!window.api)

  useEffect(() => startSensorBridge(), [])

  const headerRight = latest
    ? `${new Date(latest.timestamp).toLocaleTimeString()}`
    : 'Initializing…'

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="px-5 py-3 border-b border-slate-800/80 flex flex-wrap items-center gap-x-4 gap-y-2 bg-slate-950/60 backdrop-blur sticky top-0 z-10">
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-cyan-500 to-purple-600 shadow shadow-cyan-500/20" />
          <h1 className="text-base font-semibold tracking-wide text-slate-100">Linux Sensor Tray</h1>
          <span className="text-[10px] uppercase tracking-widest text-slate-500 ml-1">
            CachyOS · AMD
          </span>
        </div>
        <nav className="flex gap-1 flex-wrap min-w-0">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={
                'px-3 py-1.5 rounded-lg text-sm transition-colors ' +
                (tab === t.id
                  ? 'bg-slate-800 text-cyan-300 shadow-inner shadow-cyan-500/10'
                  : 'text-slate-300 hover:bg-slate-800/60')
              }
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-3 min-w-0">
          <ChartWindowControl />
          <div className="text-xs mono text-slate-400 shrink-0 tabular-nums">{headerRight}</div>
        </div>
      </header>

      <main className="flex-1 min-h-0 p-5 overflow-y-auto">
        {!preloadOk && (
          <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-950/40 px-4 py-3 text-sm text-amber-100">
            <strong className="font-semibold">Preload bridge missing.</strong> The sensor IPC API was
            not exposed (<span className="mono">window.api</span> is undefined). Check that{' '}
            <span className="mono">webPreferences.preload</span> points to the built preload script
            and restart with <span className="mono">npm run dev</span>.
          </div>
        )}
        {tab === 'overview' && <Overview />}
        {tab === 'cpu' && <CpuTab />}
        {tab === 'gpu' && <GpuTab />}
        {tab === 'overclock' && <OverclockTab />}
        {tab === 'mobo' && <MainboardTab />}
        {tab === 'storage' && <StorageTab />}
        {tab === 'settings' && <SettingsTab />}
      </main>
    </div>
  )
}
