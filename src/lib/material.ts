import { cableType, deviceType, resolveDevice } from '../config/catalog'
import type { Project, Variant } from '../types'
import { cableLengths } from './geom'
import { kindOf } from '../config/catalog'
import { RICHTWERT_NAME, sourcePrices } from './priceSources'
import { actuatorChannels, actuatorNeeds, wayRows } from './schrank'

export type MatGroup = 'Geräte' | 'Verteiler & Dosen' | 'Leitungen (gezeichnet)' | 'Zuleitungen zum Verteiler (geschätzt)' | 'Aktoren (Richtwert)'

export interface MatLine {
  key: string // Schlüssel für eigene Preise
  group: MatGroup
  name: string
  unit: 'Stk' | 'm'
  qty: number
  defaultPrice: number
  price: number
  sum: number
  note?: string
  supplier: string // Händler (frei wählbar; Standard = Name der Preisquelle)
}

export const DEFAULT_MATERIAL = { endMm: 100, wastePct: 5 }

/** Richtwerte für Aktoren (€ netto je Gerät). */
const ACTUATOR_PRICE: Record<string, number> = {
  'Schaltaktor 8-fach': 190,
  'Dimmaktor 4-fach (Phasen)': 240,
}

export interface MatOptions {
  floorId?: string
  includeRuns?: boolean
}

export const ACTUATOR_LABELS = Object.keys(ACTUATOR_PRICE)

export const VAT = 0.19

export function materialList(project: Project, opts: MatOptions = {}): { lines: MatLine[]; net: number } {
  const prices = project.prices ?? {}
  const src = sourcePrices(project)
  const fromSrc = (key: string, d: number) => src[key.startsWith('run:') ? 'cab:' + key.slice(4) : key] ?? d
  const mat = project.material ?? DEFAULT_MATERIAL
  const defSupplier = project.priceSourceId === 'richtwert' ? RICHTWERT_NAME : (project.priceSources?.find((x) => x.id === project.priceSourceId)?.name ?? 'ohne Händler')
  const map = new Map<string, MatLine>()
  const add = (key: string, group: MatGroup, name: string, unit: 'Stk' | 'm', qty: number, defaultPrice: number, note?: string) => {
    let l = map.get(key)
    if (!l) {
      defaultPrice = fromSrc(key, defaultPrice)
      const price = prices[key] ?? defaultPrice
      l = { key, group, name, unit, qty: 0, defaultPrice, price, sum: 0, note, supplier: project.suppliers?.[key] ?? defSupplier }
      map.set(key, l)
    }
    l.qty += qty
  }
  const floors = project.floors.filter((f) => !opts.floorId || f.id === opts.floorId)
  for (const f of floors) {
    for (const d of f.devices) {
      const r = resolveDevice(d, project.settings)
      const dt = deviceType(d.typeId)
      if (d.typeId === 'steig' || d.typeId === 'foto') continue
      const grp: MatGroup = dt.category === 'box' ? 'Verteiler & Dosen' : 'Geräte'
      add('dev:' + dt.id, grp, r.sizeLabel && dt.sizes ? `${dt.name} · ${r.sizeLabel}` : dt.name, 'Stk', 1, dt.price)
      if (dt.box && dt.boxPrice > 0) add('box:' + dt.id, 'Verteiler & Dosen', `Gerätedose zu ${dt.name}`, 'Stk', 1, dt.boxPrice)
    }
    for (const c of f.cables) {
      const ct = cableType(c.typeId)
      add('cab:' + ct.id, 'Leitungen (gezeichnet)', ct.name, 'm', (cableLengths(c.points).total + 2 * mat.endMm) / 1000, ct.price, mat.endMm || mat.wastePct ? `inkl. ${mat.endMm / 10} cm je Ende und ${mat.wastePct} % Verschnitt` : undefined)
    }
  }
  if (opts.includeRuns !== false) {
    for (const w of wayRows(project)) {
      if (opts.floorId && w.floor.id !== opts.floorId) continue
      if (!w.len) continue
      const dt = deviceType(w.device.typeId)
      const ct = cableType(dt.category === 'knx' ? 'knx' : kindOf(dt) === 'load' ? 'nym-3x2.5' : 'nym-3x1.5')
      add('run:' + ct.id, 'Zuleitungen zum Verteiler (geschätzt)', ct.name, 'm', w.len / 1000, ct.price, 'Nicht doppelt zählen, falls diese Leitungen schon gezeichnet sind.')
    }
  }
  if (!opts.floorId) {
    for (const n of actuatorNeeds(actuatorChannels(project))) {
      if (n.units === null) continue
      add('act:' + n.label, 'Aktoren (Richtwert)', n.label, 'Stk', n.units, ACTUATOR_PRICE[n.label] ?? 200)
    }
  }
  const lines = [...map.values()]
  for (const l of lines) {
    if (l.unit === 'm') l.qty = Math.ceil(l.qty * (l.key.startsWith('cab:') ? 1 + mat.wastePct / 100 : 1) * 10) / 10
    l.price = prices[l.key] ?? l.defaultPrice
    l.sum = l.qty * l.price
  }
  const order: MatGroup[] = ['Geräte', 'Verteiler & Dosen', 'Leitungen (gezeichnet)', 'Zuleitungen zum Verteiler (geschätzt)', 'Aktoren (Richtwert)']
  lines.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || a.name.localeCompare(b.name, 'de'))
  return { lines, net: lines.reduce((s, l) => s + l.sum, 0) }
}

export interface PurchaseGroup {
  supplier: string
  lines: MatLine[]
  net: number
}
/** Einkaufsliste: Positionen nach Händler gruppiert (Rollen/Ringe als Hinweis bei Leitungen). */
export function purchaseList(lines: MatLine[]): PurchaseGroup[] {
  const m = new Map<string, PurchaseGroup>()
  for (const l of lines) {
    const g = m.get(l.supplier) ?? { supplier: l.supplier, lines: [], net: 0 }
    g.lines.push(l)
    g.net += l.sum
    m.set(l.supplier, g)
  }
  return [...m.values()].sort((a, b) => a.supplier.localeCompare(b.supplier, 'de'))
}

/** Ringe (Standard 100 m) für eine Leitungsmenge. */
export const rings = (qtyM: number, ringM = 100) => Math.ceil(qtyM / ringM)

export function toVariant(name: string, lines: MatLine[], net: number): Variant {
  return { id: Math.random().toString(36).slice(2, 10), name, at: new Date().toISOString(), net, lines: lines.map((l) => ({ key: l.key, name: l.name, unit: l.unit, qty: l.qty, sum: l.sum })) }
}

export interface VariantDiff {
  name: string
  unit: 'Stk' | 'm'
  qtyA: number
  qtyB: number
  sumA: number
  sumB: number
}
/** Vergleich: a = gemerkte Variante, b = aktueller Stand. Nur abweichende Positionen. */
export function compareVariant(a: Variant, b: { lines: MatLine[]; net: number }): { rows: VariantDiff[]; netA: number; netB: number } {
  const keys = new Set([...a.lines.map((l) => l.key), ...b.lines.map((l) => l.key)])
  const rows: VariantDiff[] = []
  for (const k of keys) {
    const x = a.lines.find((l) => l.key === k)
    const y = b.lines.find((l) => l.key === k)
    const qa = x?.qty ?? 0, qb = y?.qty ?? 0, sa = x?.sum ?? 0, sb = y?.sum ?? 0
    if (Math.abs(qa - qb) < 0.05 && Math.abs(sa - sb) < 0.01) continue
    rows.push({ name: (x ?? y)!.name, unit: (x ?? y)!.unit, qtyA: qa, qtyB: qb, sumA: sa, sumB: sb })
  }
  rows.sort((p, q) => Math.abs(q.sumB - q.sumA) - Math.abs(p.sumB - p.sumA))
  return { rows, netA: a.net, netB: b.net }
}
