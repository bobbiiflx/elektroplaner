import { DIM_LABEL, deviceType, kindOf } from '../config/catalog'
import type { Circuit, Device, Floor, Project } from '../types'
import { roleOf } from './groups'
import { distFor, needsRun, runOf, type DistInfo } from './runs'

const volt = (c: Circuit) => (c.phase === '3L' ? Math.sqrt(3) * 400 : 230)
export const amps = (watts: number, c?: Circuit) => (c ? watts / volt(c) : watts / 230)

export interface CircuitRow {
  circuit: Circuit
  devices: Device[]
  floors: string[]
  watts: number
  wattsKnown: number // Geräte mit Leistungsangabe
  amps: number
  knx: number
  direct: number
  warn: string[]
}

export function circuitRows(project: Project): { rows: CircuitRow[]; unassigned: { device: Device; floor: Floor }[] } {
  const rows = new Map<string, CircuitRow>()
  for (const c of project.circuits ?? []) rows.set(c.id, { circuit: c, devices: [], floors: [], watts: 0, wattsKnown: 0, amps: 0, knx: 0, direct: 0, warn: [] })
  const unassigned: { device: Device; floor: Floor }[] = []
  for (const floor of project.floors)
    for (const d of floor.devices) {
      const k = kindOf(deviceType(d.typeId))
      if (k !== 'load' && k !== 'light') continue
      const r = d.circuitId ? rows.get(d.circuitId) : undefined
      if (!r) {
        unassigned.push({ device: d, floor })
        continue
      }
      r.devices.push(d)
      if (!r.floors.includes(floor.name)) r.floors.push(floor.name)
      if (d.powerW) {
        r.watts += d.powerW
        r.wattsKnown++
      }
      if (d.control === 'knx') r.knx++
      else if (d.control === 'direct') r.direct++
    }
  for (const r of rows.values()) {
    r.amps = amps(r.watts, r.circuit)
    if (!r.devices.length) r.warn.push('Keine Geräte zugeordnet')
    if (r.amps > r.circuit.rating) r.warn.push(`Last ${r.amps.toFixed(1)} A über Nennstrom ${r.circuit.rating} A`)
    else if (r.amps > r.circuit.rating * 0.8) r.warn.push('Über 80 % des Nennstroms')
    if (r.wattsKnown < r.devices.length && r.devices.some((d) => deviceType(d.typeId).category === 'light')) r.warn.push('Nicht für alle Leuchten ist eine Leistung angegeben')
    if (!r.circuit.rcd.trim()) r.warn.push('Keine FI-Gruppe')
  }
  return { rows: [...rows.values()], unassigned }
}

export interface Channel {
  key: string
  groupId: string
  groupName: string
  ga: string
  kind: 'switch' | 'dim'
  dimType?: string
  circuitName: string
  watts: number
  devices: number
  dist: DistInfo | null
  warn: string[]
}

/** Aktorkanäle: je Gruppe × Stromkreis × Verteiler × Art (Schalten / Dimmen) ein Kanal. */
export function actuatorChannels(project: Project): Channel[] {
  const map = new Map<string, Channel>()
  const groups = new Map((project.groups ?? []).map((g) => [g.id, g]))
  const circuits = new Map((project.circuits ?? []).map((c) => [c.id, c]))
  project.floors.forEach((floor, fi) => {
    for (const d of floor.devices) {
      if (roleOf(d) !== 'receiver' || d.control !== 'knx' || !d.groupIds?.length) continue
      const dist = distFor(project, d, fi)
      const dim = kindOf(deviceType(d.typeId)) === 'light' && d.dimmable === true
      const kind: Channel['kind'] = dim ? 'dim' : 'switch'
      for (const gid of d.groupIds) {
        const g = groups.get(gid)
        if (!g) continue
        const key = [gid, d.circuitId ?? '', dist?.device.id ?? '', kind, dim ? (d.dimType ?? '') : ''].join('|')
        let ch = map.get(key)
        if (!ch) {
          ch = { key, groupId: gid, groupName: g.name, ga: g.ga, kind, dimType: dim ? d.dimType : undefined, circuitName: d.circuitId ? (circuits.get(d.circuitId)?.name ?? '?') : '–', watts: 0, devices: 0, dist, warn: [] }
          map.set(key, ch)
        }
        ch.devices++
        ch.watts += d.powerW ?? 0
      }
    }
  })
  const out = [...map.values()]
  for (const ch of out) {
    if (ch.circuitName === '–') ch.warn.push('Kein Stromkreis')
    if (!ch.dist) ch.warn.push('Kein Verteiler')
    if (ch.watts > 3680) ch.warn.push(`Last ${Math.round(ch.watts)} W > 16 A Kanal`)
    if (ch.kind === 'dim' && !ch.dimType) ch.warn.push('Dimmart fehlt')
  }
  return out.sort((a, b) => (a.dist?.name ?? '').localeCompare(b.dist?.name ?? '') || a.ga.localeCompare(b.ga, 'de', { numeric: true }))
}

export interface ActuatorNeed {
  dist: string
  label: string
  channels: number
  units: number | null // null = nach Dimmart/Hersteller festlegen
}

/** Benötigte Aktoren je Verteiler (Schalt-Aktor 8-fach, Dimm-Aktor 4-fach; andere Dimmarten nur Kanalzahl). */
export function actuatorNeeds(channels: Channel[]): ActuatorNeed[] {
  const m = new Map<string, ActuatorNeed>()
  for (const ch of channels) {
    const dist = ch.dist?.name ?? 'ohne Verteiler'
    const label = ch.kind === 'switch' ? 'Schaltaktor 8-fach' : ch.dimType === 'phase' ? 'Dimmaktor 4-fach (Phasen)' : `Dimmkanäle ${DIM_LABEL[ch.dimType as keyof typeof DIM_LABEL] ?? 'Dimmart offen'}`
    const key = dist + '|' + label
    const n = m.get(key) ?? { dist, label, channels: 0, units: label.startsWith('Dimmkanäle') ? null : 0 }
    n.channels++
    m.set(key, n)
  }
  for (const n of m.values()) if (n.units !== null) n.units = Math.ceil(n.channels / (n.label.startsWith('Schalt') ? 8 : 4))
  return [...m.values()].sort((a, b) => a.dist.localeCompare(b.dist) || a.label.localeCompare(b.label))
}

export interface WayRow {
  device: Device
  floor: Floor
  distName: string
  len: number
  manual: boolean
  groups: string[]
  warn?: string
}

export function wayRows(project: Project): WayRow[] {
  const gname = new Map((project.groups ?? []).map((g) => [g.id, g.name]))
  const out: WayRow[] = []
  for (const floor of project.floors)
    for (const d of floor.devices) {
      if (!needsRun(d)) continue
      const r = runOf(project, d)
      out.push({ device: d, floor, distName: r?.dist.name ?? '–', len: r?.len ?? 0, manual: !!r?.manual, groups: (d.groupIds ?? []).map((g) => gname.get(g) ?? '?'), warn: r?.warn ?? (r ? undefined : 'Kein Verteiler') })
    }
  return out.sort((a, b) => a.distName.localeCompare(b.distName) || b.len - a.len)
}

/** CSV mit Semikolon (deutsches Excel) und Anführungszeichen. */
export function toCsv(rows: (string | number)[][]): string {
  return rows.map((r) => r.map((c) => (/[;"\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : String(c))).join(';')).join('\r\n')
}
