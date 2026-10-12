import { deviceType, kindOf, type DeviceType } from '../config/catalog'
import type { Circuit, Device, Floor, Project } from '../types'

export type MissingKey = 'circuit' | 'control' | 'dimmable' | 'dimType' | 'power' | 'group'

export const MISSING_LABEL: Record<MissingKey, string> = {
  circuit: 'Stromkreis',
  control: 'Steuerung (direkt / KNX)',
  dimmable: 'Dimmbar ja / nein',
  dimType: 'Dimmart',
  power: 'Leistung',
  group: 'KNX-Gruppe',
}

/** Welche Angaben für den Schaltschrank noch fehlen – abhängig von der Rolle des Geräts. */
export function missingFor(d: Device, dt: DeviceType = deviceType(d.typeId)): MissingKey[] {
  const kind = kindOf(dt)
  const out: MissingKey[] = []
  if (kind === 'load' || kind === 'light') {
    if (!d.circuitId) out.push('circuit')
    if (d.control === undefined) out.push('control')
    else if (d.control === 'knx' && !d.groupIds?.length) out.push('group')
  }
  if (kind === 'light') {
    if (d.dimmable === undefined) out.push('dimmable')
    else if (d.dimmable && !d.dimType) out.push('dimType')
    if (!d.powerW) out.push('power')
  }
  return out
}

/** Hat das Gerät überhaupt etwas zuzuordnen (sonst zählt es nicht zu den offenen Punkten)? */
const needsElectrics = (dt: DeviceType) => kindOf(dt) === 'load' || kindOf(dt) === 'light'

export interface OpenPoint {
  floor: Floor
  device: Device
  missing: MissingKey[]
}

export function openPoints(project: Project): OpenPoint[] {
  const out: OpenPoint[] = []
  for (const floor of project.floors) {
    for (const device of floor.devices) {
      const m = missingFor(device)
      if (m.length) out.push({ floor, device, missing: m })
    }
  }
  return out
}

function circuitOf(project: Pick<Project, 'circuits'>, d: Device): Circuit | undefined {
  return d.circuitId ? (project.circuits ?? []).find((c) => c.id === d.circuitId) : undefined
}

export type ColorBy = 'type' | 'circuit' | 'control'
const UNSET_COLOR = '#8e8e93'
const CONTROL_COLOR = { knx: '#30d158', direct: '#ff9f0a' }

/** Füllfarbe des Planzeichens je nach Darstellung (Typ / Stromkreis / Steuerung). */
export function fillFor(d: Device, dt: DeviceType, project: Pick<Project, 'circuits'>, by: ColorBy): string {
  if (by === 'circuit') {
    if (!needsElectrics(dt)) return '#c7c7cc'
    return circuitOf(project, d)?.color ?? UNSET_COLOR
  }
  if (by === 'control') {
    if (!needsElectrics(dt)) return '#c7c7cc'
    return d.control ? CONTROL_COLOR[d.control] : UNSET_COLOR
  }
  return dt.color
}

/** Zusammenfassung je Stromkreis: Anzahl Geräte, Summenleistung. */
export function circuitStats(project: Project, circuitId: string) {
  let count = 0
  let watts = 0
  for (const f of project.floors)
    for (const d of f.devices)
      if (d.circuitId === circuitId) {
        count++
        watts += d.powerW ?? 0
      }
  return { count, watts }
}
