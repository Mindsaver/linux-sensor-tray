import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import { Card } from '../components/Card'
import { Gauge } from '../components/Gauge'
import { Stat } from '../components/Stat'
import { PerCoreBars } from '../components/PerCoreBars'
import { Sparkline, type Series } from '../components/Sparkline'
import { useChartHistoryWindow, useLatest } from '../hooks'
import { fmt, tempAccent } from '../format'
import type { SetupCapabilities } from '@shared/types'

const README_HASH = 'https://github.com/Mindsaver/linux-sensor-tray#zenpower-and-k10temp'

/**
 * CPU-tab banner shown only when zenpower is not bound. Capability-aware: drives the
 * privileged zenpower setup via api.setup.configureZenpower() when pkexec is available,
 * falls back to copy-to-clipboard sudo commands or a README link otherwise.
 *
 * The banner is hidden by the `!s.cpu.hasZenpower` parent gate; once setup succeeds,
 * the next 1 Hz polling tick flips `hasZenpower` and the banner disappears automatically.
 */
function ZenpowerBanner(): JSX.Element | null {
  const [caps, setCaps] = useState<SetupCapabilities | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const cancelledRef = useRef(false)

  const refresh = useCallback(async () => {
    try {
      const c = await window.api.setup.getCapabilities()
      if (!cancelledRef.current) setCaps(c)
    } catch (e) {
      console.error('[ZenpowerBanner] getCapabilities failed:', e)
    }
  }, [])

  useEffect(() => {
    cancelledRef.current = false
    void refresh()
    return () => {
      cancelledRef.current = true
    }
  }, [refresh])

  const copyCmd = useCallback(async (cmd: string) => {
    try {
      await navigator.clipboard.writeText(cmd)
      setCopied(cmd)
      window.setTimeout(() => setCopied(null), 2000)
    } catch (e) {
      console.error('[ZenpowerBanner] clipboard write failed:', e)
    }
  }, [])

  if (!caps) return null
  // Hidden on non-AMD CPUs — zenpower is AMD-only.
  if (caps.cpuVendor !== 'AuthenticAMD') return null

  const cliCmd = `sudo ${caps.cliPath ?? 'linux-sensor-tray-setup'} zenpower`
  const aurHelper = caps.tools.yay ? 'yay' : caps.tools.paru ? 'paru' : null
  const aurCmd = `${aurHelper ?? 'yay'} -S --needed zenpower3-dkms`
  const dkmsInstalled = caps.optionalPkgs['zenpower3-dkms']
  const canDriveSetup = !caps.cliMissing && caps.tools.pkexec

  const onConfigure = async (): Promise<void> => {
    setBusy(true)
    setMsg(null)
    try {
      const r = await window.api.setup.configureZenpower()
      if (r.ok) {
        setMsg({ kind: 'ok', text: 'zenpower configured. The banner will disappear on the next poll.' })
      } else {
        const detail = (r.stderr || r.error || '').trim().split('\n').slice(-2).join(' ')
        setMsg({ kind: 'err', text: detail || `Failed (exit ${r.exitCode ?? '?'})` })
      }
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
      void refresh()
    }
  }

  return (
    <Card title="Enable full Ryzen telemetry" className="col-span-12">
      <p className="text-sm text-slate-300 leading-relaxed">
        Bind the <span className="mono text-cyan-300">zenpower</span> hwmon driver to expose Vcore,
        V SoC, per-CCD temps, and SVI2 power for your AMD CPU. Without it, only basic{' '}
        <span className="mono text-slate-400">k10temp</span> data is available.
      </p>

      {!dkmsInstalled && (
        <p className="mt-2 text-sm text-amber-200/90 leading-relaxed">
          The <span className="mono">zenpower3-dkms</span> kernel module is not installed yet.
          Install it via an AUR helper first (we don&apos;t run AUR builds from inside the app).
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!dkmsInstalled && (
          <button
            type="button"
            onClick={() => void copyCmd(aurCmd)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700"
          >
            {copied === aurCmd ? 'Copied!' : `Copy ${aurHelper ?? 'AUR helper'} command`}
          </button>
        )}
        {canDriveSetup ? (
          <button
            type="button"
            onClick={() => void onConfigure()}
            disabled={busy || !dkmsInstalled}
            title={!dkmsInstalled ? 'Install zenpower3-dkms first' : undefined}
            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-cyan-500/15 text-cyan-200 hover:bg-cyan-500/25 border border-cyan-500/30 disabled:opacity-40"
          >
            {busy ? 'Working…' : 'Configure zenpower (root)'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void copyCmd(cliCmd)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-800 text-cyan-200 hover:bg-slate-700 border border-slate-700"
          >
            {copied === cliCmd ? 'Copied!' : 'Copy sudo command'}
          </button>
        )}
        <a
          href={README_HASH}
          target="_blank"
          rel="noreferrer"
          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700 no-underline"
        >
          Open README
        </a>
      </div>

      {msg && (
        <p
          className={
            'mt-2 text-xs leading-relaxed ' +
            (msg.kind === 'ok' ? 'text-emerald-400/90' : 'text-amber-300/90 break-words')
          }
        >
          {msg.text}
        </p>
      )}

      {caps.cliMissing && (
        <p className="mt-2 text-[11px] text-amber-300/90 leading-relaxed">
          <strong className="font-semibold">linux-sensor-tray-setup not found.</strong> Update Linux
          Sensor Tray (or install via AUR / install.sh) to enable the in-app Configure button.
        </p>
      )}
    </Card>
  )
}

export function CpuTab(): JSX.Element {
  const s = useLatest()
  const { history, rangeLabel } = useChartHistoryWindow()
  if (!s) return <div className="text-slate-400 text-sm">Waiting…</div>

  const loadSeries: Series[] = [
    {
      key: 'cpuLoad',
      label: 'Total CPU load',
      color: '#22d3ee',
      data: history.map((h) => ({ t: h.t, v: h.cpuLoad }))
    }
  ]
  const tempSeries: Series[] = [
    {
      key: 'cpuTctl',
      label: 'Tctl',
      color: '#f87171',
      data: history.map((h) => ({ t: h.t, v: h.cpuTctl }))
    }
  ]
  const voltSeries: Series[] = [
    {
      key: 'cpuVcore',
      label: 'Vcore',
      color: '#fbbf24',
      data: history.map((h) => ({ t: h.t, v: h.cpuVcore }))
    }
  ]
  const powerSeries: Series[] = [
    {
      key: 'cpuPCore',
      label: 'Package P (core)',
      color: '#a78bfa',
      data: history.map((h) => ({ t: h.t, v: h.cpuPCore }))
    }
  ]

  return (
    <div className="grid grid-cols-12 gap-4">
      <Card
        title={s.cpu.model}
        subtitle={`${s.cpu.cores.length} threads · ${s.cpu.hasZenpower ? 'zenpower' : 'k10temp fallback'}`}
        className="col-span-12"
      >
        <div className="flex flex-wrap items-center gap-6">
          <Gauge value={s.cpu.loadTotal} label="Load" unit="%" size={170} integer />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-3 flex-1 min-w-[260px]">
            <Stat label="Tctl" value={fmt.temp(s.cpu.tempTctl)} accent={tempAccent(s.cpu.tempTctl)} size="lg" />
            <Stat label="Tdie" value={fmt.temp(s.cpu.tempTdie)} accent={tempAccent(s.cpu.tempTdie)} size="lg" />
            <Stat label="Vcore" value={fmt.volt(s.cpu.vCore)} size="lg" />
            <Stat label="V SoC" value={fmt.volt(s.cpu.vSoC)} size="lg" />
            <Stat label="P Core" value={fmt.watt(s.cpu.pCore)} size="md" />
            <Stat label="P SoC" value={fmt.watt(s.cpu.pSoC)} size="md" />
            <Stat label="I Core" value={fmt.amp(s.cpu.iCore)} size="md" />
            <Stat label="I SoC" value={fmt.amp(s.cpu.iSoC)} size="md" />
            {s.cpu.tempCcds.map((t, i) => (
              <Stat
                key={i}
                label={`CCD${i + 1}`}
                value={fmt.temp(t)}
                accent={tempAccent(t)}
                size="md"
              />
            ))}
          </div>
        </div>
      </Card>

      <Card title="Per-core load & frequency" className="col-span-12">
        <PerCoreBars cores={s.cpu.cores} />
      </Card>

      <Card title={`CPU load · ${rangeLabel}`} className="col-span-12 xl:col-span-6">
        <Sparkline
          series={loadSeries}
          yMax={100}
          unit="%"
          height={228}
          area
          caption="Load history — total utilization of all logical cores (0–100%)."
        />
      </Card>
      <Card title={`Tctl temperature · ${rangeLabel}`} className="col-span-12 xl:col-span-6">
        <Sparkline
          series={tempSeries}
          unit="°C"
          height={228}
          autoY
          caption="Temperature history — CPU control temperature (Tctl) from k10temp or zenpower."
        />
      </Card>
      <Card title={`Vcore · ${rangeLabel}`} className="col-span-12 xl:col-span-6">
        <Sparkline
          series={voltSeries}
          unit="V"
          height={228}
          autoY
          caption="Voltage history — core rail (Vcore) when exposed by the driver."
        />
      </Card>
      <Card title={`Package power · ${rangeLabel}`} className="col-span-12 xl:col-span-6">
        <Sparkline
          series={powerSeries}
          unit="W"
          height={228}
          autoY
          caption="Power history — CPU package core power (P Core) in watts."
        />
      </Card>

      {!s.cpu.hasZenpower && <ZenpowerBanner />}
    </div>
  )
}
