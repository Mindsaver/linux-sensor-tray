import { useCallback, useEffect, useState, type JSX } from 'react'
import { Card } from '../components/Card'
import {
  PRIVILEGED_PROBE_POLKIT_INSTALL_FISH,
  PRIVILEGED_PROBE_POLKIT_INSTALL_SH,
  type AppSettings,
  type AppSettingsResolved,
  type PrivilegedSystemProbeMode
} from '@shared/types'
import { useSensorTray } from '../store'
import { fmt } from '../format'

const RETENTION_PRESETS = [60, 180, 360, 720, 1440, 2880, 10080] as const
const DISK_LOG_INTERVAL_PRESETS = [1, 5, 10, 30, 60, 300] as const

const PROBE_MODE_OPTIONS: ReadonlyArray<{
  value: PrivilegedSystemProbeMode
  label: string
  hint: string
}> = [
  { value: 'off', label: 'Off', hint: 'Never call pkexec. Some hardware details (DIMM banks, DMI caches) will be missing.' },
  {
    value: 'onDemand',
    label: 'On demand',
    hint:
      'System info shows an "Enrich with root data" button. First click triggers a polkit prompt; subsequent calls reuse polkit\u2019s session cache.'
  },
  {
    value: 'always',
    label: 'Always',
    hint:
      'Every System info refresh runs pkexec. Use with the polkit rule below to skip prompts entirely.'
  }
]

export function SettingsTab(): JSX.Element {
  const applySettings = useSensorTray((s) => s.applySettings)
  const [resolved, setResolved] = useState<AppSettingsResolved | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [probeTest, setProbeTest] = useState<{ kind: 'idle' | 'busy' | 'ok' | 'err'; msg?: string }>({
    kind: 'idle'
  })
  const [ruleBusy, setRuleBusy] = useState(false)
  const [ruleErr, setRuleErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    const r = await window.api.getSettings()
    setResolved(r)
    applySettings(r)
  }, [applySettings])

  useEffect(() => {
    void load()
  }, [load])

  /** Merge onto latest settings from main (never spread stale `resolved` — it could reset chart window). */
  const persist = useCallback(
    async (patch: Partial<AppSettings>) => {
      const cur = await window.api.getSettings()
      const {
        resolvedLogDirectory: _r,
        openAtLoginSupported: _s,
        privilegedSystemProbeSupported: _p,
        ...base
      } = cur
      const next = await window.api.setSettings({ ...base, ...patch })
      setResolved(next)
      applySettings(next)
      setStatus('Saved.')
      window.setTimeout(() => setStatus(null), 2000)
    },
    [applySettings]
  )

  if (!resolved) {
    return <div className="text-slate-400 text-sm">Loading settings…</div>
  }

  return (
    <div className="grid grid-cols-12 gap-4 max-w-4xl">
      <Card
        title="History buffer"
        subtitle="In-memory ring (~1 sample/s). How long charts can span is set in the top bar (Charts)."
        className="col-span-12"
      >
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-2">
            Keep in RAM — {fmt.historyRangeMinutes(resolved.historyRetentionMinutes)} (
            {(resolved.historyRetentionMinutes * 60).toLocaleString()} samples)
          </label>
          <input
            type="range"
            min={10}
            max={10080}
            step={10}
            value={resolved.historyRetentionMinutes}
            onChange={(e) => {
              const historyRetentionMinutes = Number(e.target.value)
              const chartLive = useSensorTray.getState().chartWindowMinutes
              void persist({
                historyRetentionMinutes,
                chartWindowMinutes: Math.min(chartLive, historyRetentionMinutes)
              })
            }}
            className="w-full accent-cyan-500"
          />
          <div className="flex flex-wrap gap-1.5 mt-2">
            {RETENTION_PRESETS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  const chartLive = useSensorTray.getState().chartWindowMinutes
                  void persist({
                    historyRetentionMinutes: m,
                    chartWindowMinutes: Math.min(chartLive, m)
                  })
                }}
                className="px-2 py-1 rounded-md text-[11px] bg-slate-800/80 text-slate-300 hover:bg-slate-700/90"
              >
                {fmt.historyRangeMinutes(m)}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Card
        title="Disk logging"
        subtitle="Append-only JSON Lines at the interval you choose (same schema as live sensors)"
        className="col-span-12"
      >
        <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-200">
          <input
            type="checkbox"
            checked={resolved.diskLogEnabled}
            onChange={(e) => void persist({ diskLogEnabled: e.target.checked })}
            className="rounded border-slate-600"
          />
          Log samples to disk
        </label>
        <div className="mt-4">
          <label className="block text-xs font-medium text-slate-400 mb-2">
            Write interval — every {resolved.diskLogIntervalSeconds} s (1–3600)
          </label>
          <input
            type="range"
            min={1}
            max={3600}
            step={1}
            value={resolved.diskLogIntervalSeconds}
            onChange={(e) => void persist({ diskLogIntervalSeconds: Number(e.target.value) })}
            className="w-full accent-cyan-500"
          />
          <div className="flex flex-wrap gap-1.5 mt-2">
            {DISK_LOG_INTERVAL_PRESETS.map((sec) => (
              <button
                key={sec}
                type="button"
                onClick={() => void persist({ diskLogIntervalSeconds: sec })}
                className="px-2 py-1 rounded-md text-[11px] bg-slate-800/80 text-slate-300 hover:bg-slate-700/90"
              >
                {sec < 60 ? `${sec}s` : `${sec / 60} min`}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-2 text-[11px] text-slate-500 mono break-all leading-relaxed">
          Folder: {resolved.resolvedLogDirectory}
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          <button
            type="button"
            onClick={async () => {
              const p = await window.api.chooseHistoryLogDir()
              if (p) void persist({ diskLogDirectory: p })
            }}
            className="px-3 py-1.5 rounded-lg text-sm bg-slate-800 text-slate-200 hover:bg-slate-700"
          >
            Choose folder…
          </button>
          <button
            type="button"
            onClick={() => void persist({ diskLogDirectory: null })}
            className="px-3 py-1.5 rounded-lg text-sm bg-slate-800 text-slate-200 hover:bg-slate-700"
          >
            Use default
          </button>
          <button
            type="button"
            onClick={() => void window.api.openHistoryLogFolder()}
            className="px-3 py-1.5 rounded-lg text-sm bg-slate-800 text-cyan-300 hover:bg-slate-700"
          >
            Open in file manager
          </button>
        </div>
        <p className="mt-3 text-[11px] text-slate-500 leading-relaxed">
          Files: <span className="mono text-slate-400">linux-sensor-tray-YYYY-MM-DD.jsonl</span> — each line is{' '}
          <span className="mono text-slate-400">schema 3</span>: chart fields (same as before) plus{' '}
          <span className="mono text-slate-400">mem</span>, <span className="mono">cpu</span> (model,
          Tdie/CCDs, SoC power, per-core load/freq), <span className="mono">cpuTuning</span>,{' '}
          <span className="mono">gpu</span> (clocks,
          fan, PPT caps, DPM mode — not the huge sysfs text blobs), <span className="mono">mainboard</span>,{' '}
          <span className="mono">storage</span>. Open <span className="mono text-slate-400">history-viewer.html</span>{' '}
          for charts; use <span className="mono text-slate-400">jq</span> / Python for the rest.
        </p>
      </Card>

      <Card
        title="System tray"
        subtitle="Background icon and close behavior"
        className="col-span-12"
      >
        <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-200">
          <input
            type="checkbox"
            checked={resolved.trayEnabled}
            onChange={(e) => void persist({ trayEnabled: e.target.checked })}
            className="rounded border-slate-600"
          />
          Show icon in system tray
        </label>
        <p className="mt-2 text-[11px] text-slate-500 leading-relaxed">
          When off, closing the window quits the app (no tray menu). Turning it off while the window is
          hidden will bring the window back so you are not stuck without a UI.
        </p>
        <label
          className={
            'mt-4 flex items-center gap-2 text-sm text-slate-200 ' +
            (resolved.openAtLoginSupported ? 'cursor-pointer' : 'cursor-not-allowed opacity-60')
          }
        >
          <input
            type="checkbox"
            checked={resolved.openAtLogin}
            disabled={!resolved.openAtLoginSupported}
            onChange={(e) => void persist({ openAtLogin: e.target.checked })}
            className="rounded border-slate-600"
          />
          Open automatically when you log in
        </label>
        <p className="mt-2 text-[11px] text-slate-500 leading-relaxed">
          {resolved.openAtLoginSupported ? (
            <>
              Adds{' '}
              <span className="mono text-slate-400">~/.config/autostart/linux-sensor-tray.desktop</span> pointing
              at this executable (XDG autostart). Disable anytime with this checkbox.
            </>
          ) : (
            <>Available when you run the packaged Linux app (AppImage/install). Dev mode cannot register session startup.</>
          )}
        </p>
      </Card>

      {resolved.privilegedSystemProbeSupported && (
        <Card
          title="Privileged hardware probe (Linux)"
          subtitle="Optional polkit/pkexec lshw probe for full SMBIOS (DIMM banks, DMI caches, NVMe strings)"
          className="col-span-12"
        >
          <fieldset className="space-y-2">
            {PROBE_MODE_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={
                  'flex items-start gap-2 cursor-pointer text-sm text-slate-200 ' +
                  (resolved.privilegedSystemProbe === opt.value ? '' : 'opacity-90')
                }
              >
                <input
                  type="radio"
                  name="privilegedSystemProbe"
                  value={opt.value}
                  checked={resolved.privilegedSystemProbe === opt.value}
                  onChange={() => void persist({ privilegedSystemProbe: opt.value })}
                  className="mt-1 accent-cyan-500"
                />
                <span>
                  <span className="font-medium">{opt.label}</span>
                  <span className="block text-[11px] text-slate-500 leading-relaxed">{opt.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={probeTest.kind === 'busy'}
              onClick={async () => {
                setProbeTest({ kind: 'busy' })
                try {
                  const s = await window.api.enrichSystemInfo()
                  if (s.lshwExtras?.probeSource === 'pkexec') {
                    setProbeTest({ kind: 'ok', msg: 'pkexec succeeded — privileged data is available.' })
                  } else if (s.lshwExtras?.probeSource === 'user') {
                    setProbeTest({
                      kind: 'err',
                      msg: 'pkexec did not elevate. Polkit rule missing, prompt cancelled, or pkexec not installed.'
                    })
                  } else {
                    setProbeTest({ kind: 'err', msg: 'lshw produced no JSON (is it installed?).' })
                  }
                } catch (e) {
                  setProbeTest({
                    kind: 'err',
                    msg: e instanceof Error ? e.message : String(e)
                  })
                }
              }}
              className="px-3 py-1.5 rounded-lg text-sm bg-slate-800 text-cyan-300 hover:bg-slate-700 disabled:opacity-50"
            >
              {probeTest.kind === 'busy' ? 'Testing…' : 'Test now'}
            </button>
            {probeTest.kind === 'ok' && (
              <span className="text-[11px] text-emerald-400/90">{probeTest.msg}</span>
            )}
            {probeTest.kind === 'err' && (
              <span className="text-[11px] text-amber-300/90">{probeTest.msg}</span>
            )}
          </div>

          <details className="mt-4 rounded-lg border border-slate-800 bg-slate-950/20 px-3 py-2">
            <summary className="cursor-pointer select-none text-[11px] font-medium text-slate-400 uppercase tracking-wide">
              Optional: install polkit rule (skip prompt)
            </summary>
            <div className="mt-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={ruleBusy}
                  onClick={async () => {
                    const ok = window.confirm(
                      'Remove the Linux Sensor Tray polkit rule?\n\nThis will restore the password prompt for privileged lshw.'
                    )
                    if (!ok) return
                    setRuleBusy(true)
                    setRuleErr(null)
                    try {
                      const fn = (
                        window.api as unknown as {
                          installPolkitRule?: () => Promise<{
                            supported: boolean
                            installed: boolean
                            readable: boolean
                            matchesShippedRule: boolean | null
                            path: string
                          }>
                        }
                      ).installPolkitRule
                      if (typeof fn !== 'function') throw new Error('Preload is outdated — restart the app to enable this button.')
                      await fn()
                    } catch (e) {
                      setRuleErr(e instanceof Error ? e.message : String(e))
                    } finally {
                      setRuleBusy(false)
                    }
                  }}
                  className="px-3 py-1.5 rounded-lg text-sm bg-slate-800 text-emerald-300 hover:bg-slate-700 disabled:opacity-50"
                >
                  {ruleBusy ? 'Working…' : 'Install rule (polkit prompt)'}
                </button>
                <button
                  type="button"
                  disabled={ruleBusy}
                  onClick={async () => {
                    setRuleBusy(true)
                    setRuleErr(null)
                    try {
                      const fn = (
                        window.api as unknown as {
                          uninstallPolkitRule?: () => Promise<{
                            supported: boolean
                            installed: boolean
                            readable: boolean
                            matchesShippedRule: boolean | null
                            path: string
                          }>
                        }
                      ).uninstallPolkitRule
                      if (typeof fn !== 'function') throw new Error('Preload is outdated — restart the app to enable this button.')
                      await fn()
                    } catch (e) {
                      setRuleErr(e instanceof Error ? e.message : String(e))
                    } finally {
                      setRuleBusy(false)
                    }
                  }}
                  className="px-3 py-1.5 rounded-lg text-sm bg-slate-800 text-amber-200 hover:bg-slate-700 disabled:opacity-50"
                >
                  {ruleBusy ? 'Working…' : 'Uninstall rule (polkit prompt)'}
                </button>
              </div>
              {ruleErr && (
                <p className="mt-2 text-[11px] text-amber-300/90 mono break-all">
                  {ruleErr}
                </p>
              )}

              <p className="mt-3 text-[11px] text-slate-500 leading-relaxed">
                Manual install (fully visible; pick the block matching your shell):
              </p>

              <p className="mt-3 text-[10px] font-medium text-slate-500 uppercase tracking-wide">bash / zsh / sh</p>
              <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px] text-slate-400 bg-slate-950/60 rounded-lg p-3 border border-slate-800 overflow-x-auto leading-relaxed">
                {PRIVILEGED_PROBE_POLKIT_INSTALL_SH}
              </pre>

              <p className="mt-3 text-[10px] font-medium text-slate-500 uppercase tracking-wide">fish</p>
              <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px] text-slate-400 bg-slate-950/60 rounded-lg p-3 border border-slate-800 overflow-x-auto leading-relaxed">
                {PRIVILEGED_PROBE_POLKIT_INSTALL_FISH}
              </pre>

              <p className="mt-3 text-[11px] text-slate-500 leading-relaxed">
                Without the rule, choosing <span className="mono text-slate-400">On demand</span> still works — polkit
                shows a GUI prompt the first time and caches the result for the session. Replace{' '}
                <span className="mono text-slate-400">wheel</span> with another group or use{' '}
                <span className="mono text-slate-400">subject.user === &quot;YOURUSER&quot;</span>.
              </p>
            </div>
          </details>
        </Card>
      )}

      {status && <p className="col-span-12 text-xs text-emerald-400/90">{status}</p>}
    </div>
  )
}
