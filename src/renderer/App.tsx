import { useEffect, useState, type JSX } from 'react'
import { startSensorBridge, useSensorTray } from './store'
import { Overview } from './tabs/Overview'
import { CpuTab } from './tabs/Cpu'
import { GpuTab } from './tabs/Gpu'
import { MainboardTab } from './tabs/Mainboard'
import { StorageTab } from './tabs/Storage'
import { OverclockTab } from './tabs/Overclock'
import { SettingsTab } from './tabs/Settings'
import { SystemTab } from './tabs/System'
import { TasksTab } from './tabs/Tasks'
import { ChartWindowControl } from './components/ChartWindowControl'

type TabId = 'overview' | 'cpu' | 'gpu' | 'tasks' | 'overclock' | 'mobo' | 'storage' | 'system' | 'settings'

const TABS: { id: Exclude<TabId, 'settings'>; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'cpu', label: 'CPU' },
  { id: 'gpu', label: 'GPU' },
  { id: 'mobo', label: 'Mainboard' },
  { id: 'storage', label: 'Storage' },
  { id: 'system', label: 'System info' },
  { id: 'overclock', label: 'OC' },
  { id: 'tasks', label: 'Tasks' }
]

function tabBtnClass(active: boolean): string {
  return (
    'px-3 py-1.5 rounded-lg text-sm transition-colors ' +
    (active ? 'bg-slate-800 text-cyan-300 shadow-inner shadow-cyan-500/10' : 'text-slate-300 hover:bg-slate-800/60')
  )
}

export default function App(): JSX.Element {
  const [tab, setTab] = useState<TabId>('overview')
  const latest = useSensorTray((s) => s.latest)
  const [preloadOk] = useState(() => typeof window !== 'undefined' && !!window.api)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)

  useEffect(() => startSensorBridge(), [])
  useEffect(() => {
    if (!preloadOk) return
    void window.api.getAppIconDataUrl(64).then((url: string) => {
      setLogoUrl(url)
      const el = document.querySelector<HTMLLinkElement>("link[rel~='icon']")
      if (el) el.href = url
    })
  }, [preloadOk])

  const headerRight = latest
    ? `${new Date(latest.timestamp).toLocaleTimeString()}`
    : 'Initializing…'

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="px-5 py-3 border-b border-slate-800/80 flex flex-wrap items-center gap-x-4 gap-y-2 bg-slate-950/60 backdrop-blur sticky top-0 z-10">
        <div className="flex items-center gap-2.5 shrink-0">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt=""
              width={28}
              height={28}
              decoding="async"
              draggable={false}
              className="h-7 w-7 rounded-lg object-contain shrink-0 bg-slate-900/60 ring-1 ring-slate-700/70 shadow-sm shadow-black/30"
              aria-hidden
            />
          ) : (
            <div
              className="h-7 w-7 rounded-lg shrink-0 bg-slate-900/60 ring-1 ring-slate-700/70 shadow-sm shadow-black/30 grid place-items-center"
              aria-hidden
            >
              <svg
                viewBox="0 0 64 64"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14 48V18l18 22 18-22v30" className="text-slate-100" />
              </svg>
            </div>
          )}
          <h1 className="text-base font-semibold tracking-wide text-slate-100">Linux Sensor Tray</h1>
        </div>
        <nav className="flex gap-1 flex-wrap min-w-0">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              title={t.id === 'overclock' ? 'Overclock' : undefined}
              className={tabBtnClass(tab === t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2 min-w-0 shrink-0">
          <ChartWindowControl />
          <div className="text-xs mono text-slate-400 shrink-0 tabular-nums">{headerRight}</div>
          <button
            type="button"
            onClick={() => setTab('settings')}
            title="Settings"
            aria-label="Settings"
            className={
              'p-2 rounded-lg transition-colors shrink-0 -mr-0.5 ' +
              (tab === 'settings'
                ? 'bg-slate-800 text-cyan-300 shadow-inner shadow-cyan-500/10'
                : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200')
            }
          >
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z" />
            </svg>
          </button>
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
        {tab === 'tasks' && <TasksTab />}
        {tab === 'overclock' && <OverclockTab />}
        {tab === 'mobo' && <MainboardTab />}
        {tab === 'storage' && <StorageTab />}
        {tab === 'system' && <SystemTab />}
        {tab === 'settings' && <SettingsTab />}
      </main>
    </div>
  )
}
