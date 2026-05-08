import { useEffect, type JSX } from 'react'
import { SetupStatus } from './SetupStatus'

type Props = {
  open: boolean
  onClose: () => void
  /** Skip = close for this session only; no setting written. */
  onSkip: () => void
  /** Don't show anymore = persist seen-version, then close. */
  onDontShowAnymore: () => void
}

/**
 * First-run modal that hosts {@link SetupStatus} plus header copy and a two-button footer.
 * The renderer never decides when to open: that's main's job via `setup:wizardState`.
 */
export function SetupWizard({ open, onClose, onSkip, onDontShowAnymore }: Props): JSX.Element | null {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="setup-wizard-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-3xl max-h-[88vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900/95 shadow-2xl shadow-black/50">
        <div className="px-6 py-5 border-b border-slate-800">
          <h2 id="setup-wizard-title" className="text-lg font-semibold text-slate-100">
            Welcome — let&apos;s enable optional features
          </h2>
          <p className="mt-1 text-sm text-slate-400 leading-relaxed">
            Linux Sensor Tray works out of the box, but a few optional packages and kernel modules
            unlock the full picture: extra AMD telemetry (Vcore, V SoC, per-CCD temps),
            DIMM banks &amp; DMI caches in the System tab, and a one-click polkit rule that skips
            the password prompt for read-only hardware probes. Each row below shows current status
            and a button to set it up. Nothing is changed until you click an action.
          </p>
        </div>

        <div className="px-6 py-5">
          <SetupStatus />
        </div>

        <div className="px-6 py-4 border-t border-slate-800 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onSkip}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={onDontShowAnymore}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-cyan-500/15 text-cyan-200 hover:bg-cyan-500/25 border border-cyan-500/30"
          >
            Don&apos;t show anymore
          </button>
        </div>
      </div>
    </div>
  )
}
