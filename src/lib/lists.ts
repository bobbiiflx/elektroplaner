import { DIM_LABEL, deviceType } from '../config/catalog'
import type { Project } from '../types'
import { roleOf } from './groups'
import { VAT, materialList } from './material'
import { actuatorChannels, actuatorNeeds, circuitRows, wayRows } from './schrank'
import { formatLen } from './units'

export type Cell = string | number
export interface Table {
  head: string[]
  rows: Cell[][]
  warn?: (string | undefined)[]
  /** Spalten, die rechtsbündig stehen (Zahlen) */
  right?: number[]
}

export const num = (n: number, d = 0) => n.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d })

export interface ListTables {
  circuits: Table
  needs: Table
  channels: Table
  ga: Table
  scenes: Table
  ways: Table
  material: Table
  waysTotal: number
  unassigned: number
}

export function buildTables(project: Project, unit: 'mm' | 'cm' | 'm', opt: { floorId?: string; runs?: boolean } = {}): ListTables {
  const m = (mm: number) => formatLen(mm, unit === 'mm' ? 'm' : unit === 'cm' ? 'm' : unit)
  const { rows: crow, unassigned } = circuitRows(project)
  const chs = actuatorChannels(project)
  const needsL = actuatorNeeds(chs)
  const ways0 = wayRows(project)
  const mat = materialList(project, { floorId: opt.floorId, includeRuns: opt.runs !== false })
  const groups = project.groups ?? []
  const circuits: Table = {
    head: ['Nr.', 'Stromkreis', 'LS', 'Phase', 'FI-Gruppe', 'Geräte', 'davon KNX', 'Leistung W', 'Strom A', 'Geschosse', 'Hinweis'],
    rows: crow.map((r, i) => [i + 1, r.circuit.name, `${r.circuit.charac}${r.circuit.rating}`, r.circuit.phase === '3L' ? '3 Ph.' : r.circuit.phase, r.circuit.rcd || '–', r.devices.length, r.knx, num(r.watts), num(r.amps, 1), r.floors.join(', ') || '–', r.warn.join(' · ')]),
    warn: crow.map((r) => (r.warn.length ? r.warn.join(' · ') : undefined)),
    right: [5, 6, 7, 8],
  }
  const channels: Table = {
    head: ['Verteiler', 'Gruppe', 'GA', 'Art', 'Stromkreis', 'Geräte', 'Last W', 'Hinweis'],
    rows: chs.map((c) => [c.dist?.name ?? '–', c.groupName, c.ga, c.kind === 'switch' ? 'Schalten' : `Dimmen ${c.dimType ? DIM_LABEL[c.dimType as keyof typeof DIM_LABEL] : ''}`, c.circuitName, c.devices, num(c.watts), c.warn.join(' · ')]),
    warn: chs.map((c) => (c.warn.length ? c.warn.join(' · ') : undefined)),
    right: [5, 6],
  }
  const needs: Table = {
    head: ['Verteiler', 'Aktor / Kanalart', 'Kanäle', 'Geräte (Stück)'],
    rows: needsL.map((n) => [n.dist, n.label, n.channels, n.units ?? 'nach Dimmart wählen']),
    right: [2],
  }
  const ga: Table = {
    head: ['Gruppe', 'Schalten', 'Dimmen', 'Helligkeit', 'Status', 'Sender', 'Empfänger'],
    rows: groups.map((g) => {
      const mem = project.floors.flatMap((f) => f.devices.filter((d) => d.groupIds?.includes(g.id)))
      const names = (role: 'sender' | 'receiver') => mem.filter((d) => roleOf(d) === role).map((d) => deviceType(d.typeId).name)
      return [g.name, g.ga, g.gaDim ?? '', g.gaValue ?? '', g.gaStatus ?? '', names('sender').join(', ') || '–', `${names('receiver').length}`]
    }),
    right: [6],
  }
  const scenes: Table = {
    head: ['Szene', 'Nr.', ...groups.map((g) => g.name)],
    rows: (project.scenes ?? []).map((sc) => [sc.name, sc.no, ...groups.map((g) => (sc.values[g.id] === undefined ? '–' : `${sc.values[g.id]} %`))]),
  }
  const ways: Table = {
    head: ['Verteiler', 'Gerät', 'Geschoss', 'Gruppen', 'Länge', 'Angabe'],
    rows: ways0.map((w) => [w.distName, deviceType(w.device.typeId).name, w.floor.name, w.groups.join(', ') || '–', m(w.len), w.manual ? 'gesetzt' : 'geschätzt']),
    warn: ways0.map((w) => w.warn),
    right: [4],
  }
  const material: Table = {
    head: ['Gruppe', 'Position', 'Menge', 'Einheit', 'Einzelpreis €', 'Summe €'],
    rows: [
      ...mat.lines.map((l) => [l.group, l.name, num(l.qty, l.unit === 'm' ? 1 : 0), l.unit, num(l.price, 2), num(l.sum, 2)] as Cell[]),
      ['', 'Summe netto', '', '', '', num(mat.net, 2)],
      ['', `MwSt. ${Math.round(VAT * 100)} %`, '', '', '', num(mat.net * VAT, 2)],
      ['', 'Summe brutto', '', '', '', num(mat.net * (1 + VAT), 2)],
    ],
    right: [2, 4, 5],
  }
  return { circuits, needs, channels, ga, scenes, ways, material, waysTotal: ways0.reduce((s, w) => s + w.len, 0), unassigned: unassigned.length }
}
