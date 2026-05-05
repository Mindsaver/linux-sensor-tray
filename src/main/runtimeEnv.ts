/** Prefer `LST_SKIP_AUTO_UPDATE`; `MONITOR_SKIP_AUTO_UPDATE` kept for migration. */
export function skipAutoUpdate(): boolean {
  return (
    process.env.LST_SKIP_AUTO_UPDATE === '1' || process.env.MONITOR_SKIP_AUTO_UPDATE === '1'
  )
}
