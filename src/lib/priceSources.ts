import { CABLE_TYPES, DEVICE_TYPES } from '../config/catalog'
import type { Project } from '../types'
import { ACTUATOR_LABELS } from './material'

export const RICHTWERT_DATE = '10/2026'
export const RICHTWERT_NAME = `Richtwert (Stand ${RICHTWERT_DATE})`
export const BRUTTO = 1.19

/**
 * Richtwerte in € netto.
 * Leitungen: recherchiert (elektrikshop.de, 100-m-Ringe bzw. Meterware, Okt. 2026, brutto → netto).
 * Geräte, Aktoren, Datenkabel: Schätzung für Mittelklasse-Serien (Busch-Jaeger / Gira / Jung, MDT) – keine Live-Preise.
 */
export const RICHTWERT: Record<string, number> = {
  'cab:nym-3x1.5': 0.8,
  'cab:nym-3x2.5': 1.32,
  'cab:nym-5x1.5': 1.32,
  'cab:nym-5x2.5': 2.18,
  'cab:nym-5x4': 4.0,
  'cab:nym-5x6': 5.8,
  'cab:nym-5x10': 9.5,
  'cab:cat7': 0.75,
  'cab:knx': 0.65,
  'cab:rohr-m25': 0.5,
  'dev:sd-1': 8.5,
  'dev:sd-2': 15,
  'dev:sd-3': 22,
  'dev:sd-4': 29,
  'dev:sw-1': 9,
  'dev:sw-w': 10.5,
  'dev:sw-2': 12,
  'dev:sw-jal': 22,
  'dev:dimm-t': 55,
  'dev:dimm-d': 65,
  'dev:eth-1': 16,
  'dev:eth-2': 26,
  'dev:knx-4': 120,
  'dev:knx-ts': 130,
  'dev:knx-bm': 75,
  'dev:knx-pm': 125,
  'act:Schaltaktor 8-fach': 175,
  'act:Dimmaktor 4-fach (Phasen)': 290,
}

export interface Candidate { key: string; name: string }

export const priceCandidates = (): Candidate[] => [
  ...DEVICE_TYPES.filter((d) => d.id !== 'steig').flatMap((d) => [
    { key: 'dev:' + d.id, name: d.name },
    ...(d.box && d.boxPrice > 0 ? [{ key: 'box:' + d.id, name: `Gerätedose ${d.name}` }] : []),
  ]),
  ...CABLE_TYPES.map((c) => ({ key: 'cab:' + c.id, name: c.name })),
  ...ACTUATOR_LABELS.map((l) => ({ key: 'act:' + l, name: l })),
]

export function sourcePrices(project: Project): Record<string, number> {
  const id = project.priceSourceId
  if (id === 'richtwert') return RICHTWERT
  const s = project.priceSources?.find((x) => x.id === id)
  return s ? s.prices : {}
}

// ---- Import --------------------------------------------------------------
export interface PriceRow { name: string; price: number }

export function parseNumber(raw: string): number | null {
  let t = raw.replace(/[€\s]|EUR|netto|brutto/gi, '').replace(/^ab/i, '')
  if (!/^\d[\d.,]*$/.test(t)) return null
  const lc = t.lastIndexOf(','), ld = t.lastIndexOf('.')
  if (lc >= 0 && ld >= 0) t = lc > ld ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '')
  else if (lc >= 0) t = t.replace(',', '.')
  else if (ld >= 0 && /\.\d{3}$/.test(t) && t.split('.').length > 1 && t.length > 4) t = t.replace(/\./g, '')
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export function parsePriceText(text: string): PriceRow[] {
  const rows: PriceRow[] = []
  for (const line of text.split(/\r?\n/)) {
    const l = line.trim()
    if (!l) continue
    const delim = l.includes(';') ? ';' : l.includes('\t') ? '\t' : null
    let name = '', price: number | null = null
    if (delim) {
      const cells = l.split(delim).map((c) => c.replace(/^"|"$/g, '').trim())
      // Preis = letzte parsebare Zelle, Name = längste Textzelle
      for (let i = cells.length - 1; i >= 0 && price === null; i--) price = parseNumber(cells[i])
      name = cells.filter((c) => parseNumber(c) === null).sort((a, b) => b.length - a.length)[0] ?? ''
    } else {
      const m = l.match(/^(.*?)[\s:–-]+(?:ab\s*)?(\d[\d.,]*)\s*(?:€|EUR)?(?:\s*\/\s*\w+)?\s*$/i)
      if (m) { name = m[1].trim(); price = parseNumber(m[2]) }
    }
    if (name && price !== null && price > 0) rows.push({ name, price })
  }
  return rows
}

const SYN: [RegExp, string][] = [
  [/schuko|steckdose|steckd/g, 'steckdose'],
  [/ausschalter|wippschalter|lichtschalter/g, 'schalter'],
  [/wechsel/g, 'wechselschalter'],
  [/serien/g, 'serienschalter'],
  [/jalousie|rollladen|rolladen/g, 'jalousie'],
  [/rj45|netzwerkdose|lan-?dose|datendose/g, 'ethernet'],
  [/praesenz/g, 'praesenzmelder'],
  [/bewegung/g, 'bewegungsmelder'],
]
const norm = (s: string) => {
  let t = s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/×/g, 'x')
  t = t.replace(/(\d),(\d)/g, '$1.$2').replace(/(\d)\s*x\s*(\d)/g, '$1x$2')
  for (const [r, v] of SYN) t = t.replace(r, v)
  return t.split(/[^a-z0-9.]+/).filter((w) => w.length > 1 || /\d/.test(w))
}

export function matchRow(name: string, cands: Candidate[]): { key: string; score: number } | null {
  const a = new Set(norm(name))
  let best: { key: string; score: number } | null = null
  for (const c of cands) {
    const b = new Set(norm(c.name))
    let inter = 0
    a.forEach((w) => b.has(w) && inter++)
    if (!inter) continue
    const score = inter / (a.size + b.size - inter)
    // Zahlen/Querschnitte (z. B. 3x2.5, 1-fach) müssen übereinstimmen
    const nums = [...b].filter((w) => /\d/.test(w))
    if (nums.some((w) => a.size && !a.has(w)) && /nym|cat|leerrohr|steckdose|ethernet/.test(c.name.toLowerCase().replace(/ä/g, 'ae') + c.key)) continue
    if (!best || score > best.score) best = { key: c.key, score }
  }
  return best && best.score >= 0.3 ? best : null
}
