import { useCallback, useEffect, useMemo, useRef, useState, type JSX, type ReactNode } from 'react'
import type { SetupCapabilities, SetupCommandResult } from '@shared/types'

type RowState = 'idle' | 'running' | 'success' | 'error'

type Props = {
  /** Restrict which rows render. Useful for embedding a single row in a banner. */
  rows?: ReadonlyArray<RowKey>
  /** When true, hide the read-only k10temp / AUR-helper rows for a tighter wizard layout. */
  compact?: boolean
  className?: string
  /** Notified each time capabilities refresh after an action — lets parents close modals on success. */
  onCapsChange?: (caps: SetupCapabilities) => void
}

type RowKey =
  | 'zenpower'
  | 'k10temp'
  | 'lshw'
  | 'pkexec'
  | 'polkit-rule'
  | 'aur-helper'
  | 'zenpower3-dkms'

const ALL_ROWS: ReadonlyArray<RowKey> = [
  'zenpower',
  'k10temp',
  'lshw',
  'pkexec',
  'polkit-rule',
  'aur-helper',
  'zenpower3-dkms'
]

const COMPACT_ROWS: ReadonlyArray<RowKey> = ['zenpower', 'lshw', 'pkexec', 'polkit-rule', 'zenpower3-dkms']

const README_HASH = 'https://github.com/Mindsaver/linux-sensor-tray#zenpower-and-k10temp'

function StatusDot({ kind }: { kind: 'ok' | 'warn' | 'na' | 'busy' }): JSX.Element {
  const color =
    kind === 'ok'
      ? 'bg-emerald-400'
      : kind === 'warn'
        ? 'bg-amber-400'
        : kind === 'busy'
          ? 'bg-cyan-400 animate-pulse'
          : 'bg-slate-600'
  return (
    <span
      aria-hidden
      className={`inline-block h-2.5 w-2.5 rounded-full shrink-0 ${color}`}
    />
  )
}

type RowProps = {
  state: RowState
  status: 'ok' | 'warn' | 'na'
  title: string
  description: ReactNode
  actions: ReactNode
  message?: ReactNode
}

function Row({ state, status, title, description, actions, message }: RowProps): JSX.Element {
  return (
    <li className="flex flex-col gap-2 border-b border-slate-800/60 py-3 last:border-0 sm:flex-row sm:items-start sm:gap-4">
      <div className="flex min-w-0 items-start gap-2 sm:flex-1">
        <StatusDot kind={state === 'running' ? 'busy' : status} />
        <div className="min-w-0">
          <div className="text-sm font-medium text-slate-100">{title}</div>
          <div className="mt-0.5 text-xs text-slate-400 leading-relaxed">{description}</div>
          {message && <div className="mt-1 text-[11px] leading-relaxed">{message}</div>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">{actions}</div>
    </li>
  )
}

const baseBtn =
  'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed'
const primaryBtn = `${baseBtn} bg-cyan-500/15 text-cyan-200 hover:bg-cyan-500/25 border border-cyan-500/30`
const secondaryBtn = `${baseBtn} bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700`
const dangerBtn = `${baseBtn} bg-amber-500/15 text-amber-200 hover:bg-amber-500/25 border border-amber-500/30`

function ResultMessage({
  kind,
  result
}: {
  kind: 'success' | 'error'
  result: SetupCommandResult
}): JSX.Element {
  if (kind === 'success') {
    return <span className="text-emerald-400/90">Done.</span>
  }
  // exit 4 = AUR-only requested; tone it down to neutral
  if (result.exitCode === 4) {
    return (
      <span className="text-amber-300/90">
        AUR-only package — install with an AUR helper instead.
      </span>
    )
  }
  const detail = (result.stderr || result.error || '').trim().split('\n').slice(-2).join(' ')
  return (
    <span className="text-amber-300/90 break-words">
      {detail || `Failed (exit ${result.exitCode ?? '?'})`}
    </span>
  )
}

export function SetupStatus({
  rows: rowFilter,
  compact = false,
  className = '',
  onCapsChange
}: Props): JSX.Element {
  const [caps, setCaps] = useState<SetupCapabilities | null>(null)
  const [loading, setLoading] = useState(true)
  const [errors, setErrors] = useState<Partial<Record<RowKey, SetupCommandResult>>>({})
  const [busy, setBusy] = useState<Partial<Record<RowKey, RowState>>>({})
  const [copyHint, setCopyHint] = useState<string | null>(null)
  const onCapsChangeRef = useRef(onCapsChange)
  onCapsChangeRef.current = onCapsChange

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const c = await window.api.setup.getCapabilities()
      setCaps(c)
      onCapsChangeRef.current?.(c)
    } catch (e) {
      console.error('[SetupStatus] getCapabilities failed:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const visible = useMemo(() => {
    if (rowFilter && rowFilter.length > 0) return rowFilter
    if (compact) return COMPACT_ROWS
    return ALL_ROWS
  }, [rowFilter, compact])

  const runAction = useCallback(
    async (key: RowKey, fn: () => Promise<SetupCommandResult>) => {
      setBusy((b) => ({ ...b, [key]: 'running' }))
      setErrors((e) => ({ ...e, [key]: undefined }))
      try {
        const r = await fn()
        if (r.ok) {
          setBusy((b) => ({ ...b, [key]: 'success' }))
        } else {
          setBusy((b) => ({ ...b, [key]: 'error' }))
          setErrors((e) => ({ ...e, [key]: r }))
        }
      } catch (err) {
        setBusy((b) => ({ ...b, [key]: 'error' }))
        setErrors((e) => ({
          ...e,
          [key]: {
            ok: false,
            exitCode: null,
            stdout: '',
            stderr: '',
            error: err instanceof Error ? err.message : String(err)
          }
        }))
      }
      await refresh()
    },
    [refresh]
  )

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopyHint(text)
      window.setTimeout(() => setCopyHint(null), 2000)
    } catch (e) {
      console.error('[SetupStatus] clipboard write failed:', e)
    }
  }, [])

  if (loading && !caps) {
    return <div className={`text-sm text-slate-400 ${className}`}>Reading setup status…</div>
  }
  if (!caps) {
    return <div className={`text-sm text-amber-300 ${className}`}>Could not read setup status.</div>
  }

  const isAmd = caps.cpuVendor === 'AuthenticAMD'
  const isArchFamily =
    caps.distro.id === 'arch' ||
    caps.distro.idLike.includes('arch') ||
    caps.distro.pkgManager === 'pacman'
  const hasAurHelper = caps.tools.yay || caps.tools.paru
  const aurHelper = caps.tools.yay ? 'yay' : caps.tools.paru ? 'paru' : null
  const cliMissing = caps.cliMissing
  const noPkexec = !caps.tools.pkexec
  const distroLabel = `${caps.distro.id || 'unknown'}${caps.distro.idLike.length ? ` (${caps.distro.idLike.join(', ')})` : ''}`

  const rowState = (k: RowKey): RowState => busy[k] ?? 'idle'
  const rowMessage = (k: RowKey): ReactNode => {
    const s = rowState(k)
    if (s === 'success') return <ResultMessage kind="success" result={errors[k] ?? ({} as SetupCommandResult)} />
    const err = errors[k]
    if (s === 'error' && err) return <ResultMessage kind="error" result={err} />
    return undefined
  }

  function actionButton(
    key: RowKey,
    label: string,
    onClick: () => void,
    style: 'primary' | 'secondary' | 'danger' = 'primary',
    disabled = false
  ): JSX.Element {
    const cls = style === 'primary' ? primaryBtn : style === 'danger' ? dangerBtn : secondaryBtn
    return (
      <button
        key={`${key}-${label}`}
        type="button"
        className={cls}
        disabled={disabled || rowState(key) === 'running' || cliMissing}
        onClick={onClick}
      >
        {rowState(key) === 'running' ? 'Working…' : label}
      </button>
    )
  }

  function copyButton(text: string, key: RowKey, label = 'Copy command'): JSX.Element {
    return (
      <button
        type="button"
        className={secondaryBtn}
        onClick={() => void copyToClipboard(text)}
      >
        {copyHint === text ? 'Copied!' : label}
      </button>
    )
  }

  function readmeLink(): JSX.Element {
    return (
      <a
        href={README_HASH}
        target="_blank"
        rel="noreferrer"
        className={`${secondaryBtn} no-underline`}
      >
        Open README
      </a>
    )
  }

  const rendered: JSX.Element[] = []

  // ── Zenpower row ─────────────────────────────────────────────────────────────
  if (visible.includes('zenpower')) {
    if (!isAmd) {
      rendered.push(
        <Row
          key="zenpower"
          state={rowState('zenpower')}
          status="na"
          title="zenpower (AMD-only)"
          description={`Not applicable on ${caps.cpuVendor === 'GenuineIntel' ? 'Intel' : 'this CPU'}.`}
          actions={null}
        />
      )
    } else if (caps.hwmon.zenpower) {
      rendered.push(
        <Row
          key="zenpower"
          state={rowState('zenpower')}
          status="ok"
          title="zenpower bound"
          description="Vcore, V SoC, per-CCD temps and SVI2 power are available."
          message={rowMessage('zenpower')}
          actions={
            caps.hwmon.blacklistInstalled
              ? actionButton(
                  'zenpower',
                  'Revert to k10temp',
                  () =>
                    void runAction('zenpower', () => window.api.setup.revertZenpower()),
                  'danger'
                )
              : null
          }
        />
      )
    } else {
      const cmd = `sudo ${caps.cliPath ?? 'linux-sensor-tray-setup'} zenpower`
      rendered.push(
        <Row
          key="zenpower"
          state={rowState('zenpower')}
          status="warn"
          title="zenpower not bound"
          description={
            caps.optionalPkgs['zenpower3-dkms']
              ? 'Module is installed but k10temp owns the AMD hwmon. Configure to blacklist k10temp + load zenpower.'
              : 'Install zenpower3-dkms via an AUR helper, then click Configure to blacklist k10temp and load it.'
          }
          message={rowMessage('zenpower')}
          actions={
            noPkexec ? (
              copyButton(cmd, 'zenpower', 'Copy sudo command')
            ) : (
              <>
                {actionButton(
                  'zenpower',
                  'Configure (root)',
                  () => void runAction('zenpower', () => window.api.setup.configureZenpower()),
                  'primary',
                  !caps.optionalPkgs['zenpower3-dkms']
                )}
                {!caps.optionalPkgs['zenpower3-dkms'] && hasAurHelper && (
                  <button
                    type="button"
                    className={secondaryBtn}
                    onClick={() =>
                      void copyToClipboard(`${aurHelper} -S --needed zenpower3-dkms`)
                    }
                  >
                    {copyHint === `${aurHelper} -S --needed zenpower3-dkms`
                      ? 'Copied!'
                      : `Copy ${aurHelper} command`}
                  </button>
                )}
                {!caps.optionalPkgs['zenpower3-dkms'] && !hasAurHelper && readmeLink()}
              </>
            )
          }
        />
      )
    }
  }

  // ── k10temp blacklist mirror (read-only, hidden in compact view) ─────────────
  if (visible.includes('k10temp')) {
    const blistOk = caps.hwmon.blacklistInstalled || !isAmd
    rendered.push(
      <Row
        key="k10temp"
        state={rowState('k10temp')}
        status={isAmd && caps.hwmon.k10temp && !caps.hwmon.zenpower ? 'warn' : blistOk ? 'ok' : 'na'}
        title="k10temp blacklist"
        description={
          caps.hwmon.blacklistInstalled
            ? `Installed: ${caps.hwmon.blacklistFile}`
            : isAmd
              ? 'Not installed; k10temp keeps the hwmon binding (basic temps only).'
              : 'Not applicable on this CPU.'
        }
        actions={null}
      />
    )
  }

  // ── lshw row ─────────────────────────────────────────────────────────────────
  if (visible.includes('lshw')) {
    const lshwOk = caps.optionalPkgs.lshw && caps.tools.lshw
    if (lshwOk) {
      rendered.push(
        <Row
          key="lshw"
          state={rowState('lshw')}
          status="ok"
          title="lshw installed"
          description="System tab can pull DIMM banks, DMI caches, NVMe vendor strings."
          message={rowMessage('lshw')}
          actions={null}
        />
      )
    } else {
      const canInstall = caps.distro.pkgManager !== 'unknown' && !noPkexec
      rendered.push(
        <Row
          key="lshw"
          state={rowState('lshw')}
          status="warn"
          title="lshw missing"
          description={
            canInstall
              ? `Install via ${caps.distro.pkgManager}; needed for full System info enrichment.`
              : `Install via your distro package manager (${distroLabel}).`
          }
          message={rowMessage('lshw')}
          actions={
            canInstall
              ? actionButton('lshw', 'Install lshw', () =>
                  void runAction('lshw', () => window.api.setup.installDeps(['lshw']))
                )
              : copyButton('sudo lshw -json', 'lshw', 'Copy lshw command')
          }
        />
      )
    }
  }

  // ── pkexec / polkit binary row ───────────────────────────────────────────────
  if (visible.includes('pkexec')) {
    if (caps.tools.pkexec) {
      rendered.push(
        <Row
          key="pkexec"
          state={rowState('pkexec')}
          status="ok"
          title="pkexec available"
          description="In-app actions can run privileged setup commands without a terminal."
          actions={null}
        />
      )
    } else {
      const canInstall = caps.distro.pkgManager !== 'unknown'
      rendered.push(
        <Row
          key="pkexec"
          state={rowState('pkexec')}
          status="warn"
          title="pkexec missing"
          description={
            canInstall
              ? `Install the polkit package via ${caps.distro.pkgManager}; required for in-app privileged actions.`
              : `Install your distro's polkit package (${distroLabel}).`
          }
          message={rowMessage('pkexec')}
          actions={
            canInstall
              ? actionButton(
                  'pkexec',
                  'Install polkit',
                  () => void runAction('pkexec', () => window.api.setup.installDeps(['polkit'])),
                  'primary',
                  // We need pkexec to run install-deps via pkexec; chicken-and-egg.
                  noPkexec
                )
              : copyButton('sudo apt install polkit', 'pkexec', 'Copy install command')
          }
        />
      )
    }
  }

  // ── polkit rule row ──────────────────────────────────────────────────────────
  if (visible.includes('polkit-rule')) {
    if (caps.polkitRule.installed) {
      rendered.push(
        <Row
          key="polkit-rule"
          state={rowState('polkit-rule')}
          status="ok"
          title="lshw polkit rule installed"
          description={`${caps.polkitRule.path} — wheel-group users skip the prompt.`}
          message={rowMessage('polkit-rule')}
          actions={
            !noPkexec
              ? actionButton(
                  'polkit-rule',
                  'Remove rule',
                  () =>
                    void runAction('polkit-rule', () => window.api.setup.removePolkitRule()),
                  'danger'
                )
              : null
          }
        />
      )
    } else {
      rendered.push(
        <Row
          key="polkit-rule"
          state={rowState('polkit-rule')}
          status="warn"
          title="lshw polkit rule not installed"
          description="Optional: install the rule so privileged lshw never prompts (members of group 'wheel')."
          message={rowMessage('polkit-rule')}
          actions={
            noPkexec
              ? copyButton(
                  `sudo ${caps.cliPath ?? 'linux-sensor-tray-setup'} polkit-rule`,
                  'polkit-rule',
                  'Copy sudo command'
                )
              : actionButton(
                  'polkit-rule',
                  'Install rule (root)',
                  () =>
                    void runAction('polkit-rule', () => window.api.setup.installPolkitRule())
                )
          }
        />
      )
    }
  }

  // ── AUR helper row (Arch family only, hidden in compact) ─────────────────────
  if (visible.includes('aur-helper') && isArchFamily) {
    rendered.push(
      <Row
        key="aur-helper"
        state={rowState('aur-helper')}
        status={hasAurHelper ? 'ok' : 'na'}
        title="AUR helper"
        description={
          hasAurHelper
            ? `${aurHelper} detected — drives the zenpower3-dkms install command below.`
            : 'No yay or paru detected. Install one to make AUR-only packages a one-liner.'
        }
        actions={null}
      />
    )
  }

  // ── zenpower3-dkms package row ───────────────────────────────────────────────
  if (visible.includes('zenpower3-dkms')) {
    if (!isAmd) {
      // Hide on non-AMD entirely; the zenpower row already states it's N/A.
    } else if (caps.optionalPkgs['zenpower3-dkms']) {
      rendered.push(
        <Row
          key="zenpower3-dkms"
          state={rowState('zenpower3-dkms')}
          status="ok"
          title="zenpower3-dkms installed"
          description={
            caps.hwmon.zenpower
              ? 'Module installed and bound.'
              : 'Module installed; click "Configure (root)" above to bind it.'
          }
          actions={null}
        />
      )
    } else if (isArchFamily) {
      const cmd = hasAurHelper
        ? `${aurHelper} -S --needed zenpower3-dkms`
        : 'yay -S --needed zenpower3-dkms'
      rendered.push(
        <Row
          key="zenpower3-dkms"
          state={rowState('zenpower3-dkms')}
          status="warn"
          title="zenpower3-dkms not installed"
          description={
            hasAurHelper
              ? `Run with ${aurHelper}; we deliberately don't run AUR builds from inside the app.`
              : 'Install yay or paru, then run the command. The app will not run AUR builds itself.'
          }
          actions={
            <>
              {copyButton(cmd, 'zenpower3-dkms', 'Copy AUR command')}
              {readmeLink()}
            </>
          }
        />
      )
    } else {
      rendered.push(
        <Row
          key="zenpower3-dkms"
          state={rowState('zenpower3-dkms')}
          status="na"
          title="zenpower3-dkms (Arch AUR only)"
          description="The DKMS package is currently distributed only via the Arch User Repository."
          actions={readmeLink()}
        />
      )
    }
  }

  return (
    <div className={className}>
      {cliMissing && (
        <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-950/30 px-3 py-2 text-xs text-amber-200 leading-relaxed">
          <strong className="font-semibold">Update Linux Sensor Tray to enable in-app setup.</strong>{' '}
          The <span className="mono">linux-sensor-tray-setup</span> CLI is missing. The grid below shows
          best-effort status; action buttons are disabled until the CLI ships with your install.{' '}
          <a className="text-amber-100 underline" href={README_HASH} target="_blank" rel="noreferrer">
            See the README
          </a>{' '}
          for upgrade options.
          {caps.cliError && (
            <div className="mt-1 mono text-[10px] break-all opacity-80">{caps.cliError}</div>
          )}
        </div>
      )}
      {noPkexec && !cliMissing && (
        <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-xs text-amber-200 leading-relaxed">
          <strong className="font-semibold">pkexec is not installed.</strong> Action buttons are
          replaced with copy-to-clipboard hints; run them in a terminal until polkit is available.
        </div>
      )}
      <ul className="divide-y divide-slate-800/50">{rendered}</ul>
      <div className="mt-3 flex items-center justify-end gap-2 text-[11px] text-slate-500">
        <span>
          Distro: <span className="mono text-slate-400">{distroLabel}</span> · pkg:{' '}
          <span className="mono text-slate-400">{caps.distro.pkgManager}</span> · CPU:{' '}
          <span className="mono text-slate-400">{caps.cpuVendor}</span>
        </span>
        <button type="button" className={secondaryBtn} onClick={() => void refresh()}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
    </div>
  )
}
