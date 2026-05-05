function formatHistoryRangeMinutes(m: number): string {
  const rounded = Math.round(m)
  if (rounded < 60) return `${rounded} min`
  if (rounded < 1440) {
    const h = Math.floor(rounded / 60)
    const mm = rounded % 60
    return mm ? `${h} h ${mm} min` : `${h} h`
  }
  const d = Math.floor(rounded / 1440)
  const rest = rounded % 1440
  if (rest === 0) return `${d} d`
  return `${d} d ${formatHistoryRangeMinutes(rest)}`
}

export const fmt = {
  pct(v: number | null | undefined, digits = 0): string {
    if (v == null || !Number.isFinite(v)) return '—'
    return v.toFixed(digits) + '%'
  },
  temp(v: number | null | undefined, digits = 1): string {
    if (v == null || !Number.isFinite(v)) return '—'
    return v.toFixed(digits) + '°C'
  },
  volt(v: number | null | undefined, digits = 3): string {
    if (v == null || !Number.isFinite(v)) return '—'
    return v.toFixed(digits) + ' V'
  },
  watt(v: number | null | undefined, digits = 1): string {
    if (v == null || !Number.isFinite(v)) return '—'
    return v.toFixed(digits) + ' W'
  },
  amp(v: number | null | undefined, digits = 2): string {
    if (v == null || !Number.isFinite(v)) return '—'
    return v.toFixed(digits) + ' A'
  },
  mhz(v: number | null | undefined): string {
    if (v == null || !Number.isFinite(v)) return '—'
    if (v >= 1000) return (v / 1000).toFixed(2) + ' GHz'
    return v.toFixed(0) + ' MHz'
  },
  rpm(v: number | null | undefined): string {
    if (v == null || !Number.isFinite(v)) return '—'
    return Math.round(v) + ' RPM'
  },
  bytesFromKB(kb: number): string {
    const bytes = kb * 1024
    if (bytes >= 1024 ** 3) return (bytes / 1024 ** 3).toFixed(2) + ' GB'
    if (bytes >= 1024 ** 2) return (bytes / 1024 ** 2).toFixed(0) + ' MB'
    return Math.round(kb) + ' KB'
  },
  historyRangeMinutes: formatHistoryRangeMinutes
}

export const tempAccent = (t: number | null | undefined, ranges: [number, number, number] = [60, 75, 88]): string => {
  if (t == null) return 'text-slate-300'
  if (t >= ranges[2]) return 'text-red-400'
  if (t >= ranges[1]) return 'text-orange-400'
  if (t >= ranges[0]) return 'text-yellow-400'
  return 'text-emerald-400'
}

export const loadAccent = (l: number | null | undefined): string => {
  if (l == null) return 'text-slate-300'
  if (l >= 90) return 'text-red-400'
  if (l >= 75) return 'text-orange-400'
  if (l >= 50) return 'text-yellow-400'
  return 'text-cyan-400'
}
