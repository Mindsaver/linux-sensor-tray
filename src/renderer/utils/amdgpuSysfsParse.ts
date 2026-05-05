/** Parse AMDGPU sysfs text dumps for nicer UI rendering. */

export type DpmClockRow = {
  state: string
  mhz: string
  active: boolean
}

export type PowerProfileBlock = {
  index: number
  name: string
  active: boolean
  content: string
}

export type ParsedPowerProfiles = {
  preamble: string
  profiles: PowerProfileBlock[]
}

export type OdSection = {
  title: string
  body: string
}

/** Lines like `S: 0Mhz *` or `2: 2460Mhz` */
export function parseDpmClockTable(text: string | null | undefined): DpmClockRow[] {
  if (text == null || !text.trim()) return []
  const re = /^(S|\d+):\s*([\d.]+)\s*[Mm][Hh]z\s*(\*)?\s*$/i
  const rows: DpmClockRow[] = []
  for (const line of text.split('\n')) {
    const m = line.trim().match(re)
    if (m) rows.push({ state: m[1], mhz: m[2], active: !!m[3] })
  }
  return rows
}

/** Split `pp_od_clk_voltage` on `OD_FOO:` section headers. */
export function parseOdSections(text: string | null | undefined): OdSection[] {
  if (text == null || !text.trim()) return []
  const sections: OdSection[] = []
  let current: OdSection | null = null
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (/^[A-Z][A-Z0-9_]*:$/.test(t)) {
      if (current) sections.push(current)
      current = { title: t.replace(/:$/, ''), body: '' }
    } else if (current) {
      current.body += (current.body ? '\n' : '') + line
    }
  }
  if (current) sections.push(current)
  return sections.map((s) => ({ ...s, body: s.body.trimEnd() }))
}

/**
 * Split `pp_power_profile_mode` on profile headers `  N NAME*:`.
 * First non-matching lines become preamble (column header row).
 */
export function parsePowerProfiles(text: string | null | undefined): ParsedPowerProfiles {
  if (text == null || !text.trim()) return { preamble: '', profiles: [] }
  const lines = text.split('\n')
  const headerRe = /^\s*(\d+)\s+(.+?)(\*?)\s*:\s*$/
  const preambleLines: string[] = []
  const profiles: PowerProfileBlock[] = []
  let i = 0
  while (i < lines.length && !headerRe.test(lines[i])) {
    preambleLines.push(lines[i])
    i++
  }
  while (i < lines.length) {
    const hm = lines[i].match(headerRe)
    if (!hm) {
      i++
      continue
    }
    const index = Number(hm[1])
    const name = hm[2].trim()
    const active = hm[3] === '*'
    i++
    const body: string[] = []
    while (i < lines.length && !headerRe.test(lines[i])) {
      body.push(lines[i])
      i++
    }
    profiles.push({
      index,
      name,
      active,
      content: body.join('\n').replace(/\n+$/, '')
    })
  }
  return {
    preamble: preambleLines.join('\n').trimEnd(),
    profiles
  }
}
