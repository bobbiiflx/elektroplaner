import type { Circuit, Project } from '../types'
import { actuatorChannels, actuatorNeeds, circuitRows } from './schrank'

export type ModKind = 'main' | 'spd' | 'rcd' | 'mcb' | 'knx' | 'actuator' | 'reserve'
export interface Module {
  kind: ModKind
  label: string // Kurzbezeichnung im Modul
  sub?: string // 2. Zeile (z. B. Stromkreisname)
  te: number
  circuit?: Circuit
}
export interface CabinetRow {
  modules: Module[]
  used: number
}
export interface RcdGroup {
  name: string
  circuits: Circuit[]
}
export interface Cabinet {
  rowTE: number
  rows: CabinetRow[]
  groups: RcdGroup[]
  teUsed: number // belegt (ohne Reserve)
  teReserve: number
  teTotal: number
  terminals: { n: number; pe: number; l: number } // Reihenklemmen je Abgang inkl. Reserve
  threePhase: boolean
}

export interface CabinetOpts {
  rowTE: number // Teilungseinheiten je Hutschienenreihe
  reservePct: number // Platzreserve in % der belegten Plätze
}
export const DEFAULT_CABINET_OPTS: CabinetOpts = { rowTE: 24, reservePct: 20 }

const mcbTE = (c: Circuit) => (c.phase === '3L' ? 3 : 1)

/** Belegt die Hutschienen: Hauptschalter → Überspannungsschutz → je FI-Gruppe FI + Leitungsschutzschalter → KNX-Netzteil/Aktoren → Reserve. */
export function planCabinet(project: Project, o: CabinetOpts = DEFAULT_CABINET_OPTS): Cabinet {
  const { rows: crow } = circuitRows(project)
  const circuits = crow.map((r) => r.circuit).sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }))
  const threePhase = circuits.some((c) => c.phase === '3L')

  const byRcd = new Map<string, Circuit[]>()
  for (const c of circuits) {
    const k = c.rcd.trim() || 'ohne FI'
    byRcd.set(k, [...(byRcd.get(k) ?? []), c])
  }
  const groups: RcdGroup[] = [...byRcd].sort((a, b) => a[0].localeCompare(b[0], 'de', { numeric: true })).map(([name, cs]) => ({ name, circuits: cs }))

  // Blöcke (bleiben möglichst zusammen in einer Reihe)
  const blocks: Module[][] = []
  blocks.push([{ kind: 'main', label: 'HS', sub: '3P 63 A', te: 3 }, { kind: 'spd', label: 'ÜSS', sub: 'Typ 2', te: 2 }])
  for (const g of groups) {
    const mods: Module[] = []
    if (g.name !== 'ohne FI') mods.push({ kind: 'rcd', label: 'FI', sub: g.name, te: 4 })
    for (const c of g.circuits) mods.push({ kind: 'mcb', label: `${c.charac}${c.rating}`, sub: c.name, te: mcbTE(c), circuit: c })
    blocks.push(mods)
  }
  const ch = actuatorChannels(project)
  const needs = actuatorNeeds(ch)
  if (ch.length) {
    const mods: Module[] = [{ kind: 'knx', label: 'KNX NT', sub: 'Spannungsvers.', te: 4 }]
    for (const n of needs) if (n.units) for (let i = 0; i < n.units; i++) mods.push({ kind: 'actuator', label: n.label.startsWith('Schalt') ? 'SA 8f' : 'DA 4f', sub: n.dist, te: 4 })
    blocks.push(mods)
  }

  const teUsed = blocks.flat().reduce((s, m) => s + m.te, 0)
  const teReserve = Math.max(2, Math.ceil((teUsed * o.reservePct) / 100))

  const rows: CabinetRow[] = [{ modules: [], used: 0 }]
  const place = (m: Module) => {
    let r = rows[rows.length - 1]
    if (r.used + m.te > o.rowTE) {
      r = { modules: [], used: 0 }
      rows.push(r)
    }
    r.modules.push(m)
    r.used += m.te
  }
  for (const b of blocks) {
    const w = b.reduce((s, m) => s + m.te, 0)
    const r = rows[rows.length - 1]
    if (r.used > 0 && r.used + w > o.rowTE && w <= o.rowTE) rows.push({ modules: [], used: 0 })
    b.forEach(place)
  }
  for (let i = 0; i < teReserve; i++) place({ kind: 'reserve', label: '', te: 1 })

  const n = circuits.length
  const spare = Math.max(2, Math.ceil(n * 0.2))
  return { rowTE: o.rowTE, rows, groups, teUsed, teReserve, teTotal: rows.length * o.rowTE, terminals: { n: n + spare, pe: n + spare, l: threePhase ? 3 : 1 }, threePhase }
}
