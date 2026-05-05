import type { MainboardSnapshot, MoboFan, MoboTemp, MoboVoltage } from '@shared/types'
import { findHwmonByName, readLabeledInputs, readText } from './hwmon'

const CANDIDATES = ['nct6687', 'nct6779', 'nct6798', 'nct6796', 'it87', 'it8665']

export async function readMainboardSnapshot(): Promise<MainboardSnapshot> {
  let dir: string | null = null
  let chip: string | null = null
  for (const name of CANDIDATES) {
    const found = await findHwmonByName(name)
    if (found) {
      dir = found
      chip = name
      break
    }
  }
  if (!dir) {
    return { chip: null, voltages: [], fans: [], temps: [] }
  }

  const [ins, fans, temps] = await Promise.all([
    readLabeledInputs(dir, 'in'),
    readLabeledInputs(dir, 'fan'),
    readLabeledInputs(dir, 'temp')
  ])

  const voltages: MoboVoltage[] = ins.map((r) => ({
    label: r.label ?? `in${r.index}`,
    volts: r.value
  }))

  const fanList: MoboFan[] = fans.map((r) => ({
    label: r.label ?? `fan${r.index}`,
    rpm: Math.round(r.value)
  }))

  const tempList: MoboTemp[] = []
  for (const r of temps) {
    let label = r.label
    if (!label) {
      // nct6687 driver doesn't always export tempN_label; try the per-source label.
      label = await readText(`${dir}/temp${r.index}_label`)
    }
    if (r.value < -40 || r.value > 200) continue // discard nonsense
    tempList.push({ label: label ?? `temp${r.index}`, tempC: r.value })
  }

  return { chip, voltages, fans: fanList, temps: tempList }
}
