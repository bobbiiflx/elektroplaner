import type { Device, ProjectSettings, ZoneSettings, InstallMethod } from '../types'

// ---------------------------------------------------------------------------
// Gerätetypen (Dosen, Steckdosen, Schalter, KNX, Netzwerk, Displays)
// Preise sind Platzhalter (EUR netto, ca.) und später in der Oberfläche pflegbar.
// Maße in mm: w = Breite, h = Höhe, d = Vorstand vor der Wand.
// ---------------------------------------------------------------------------

export type DeviceCategory = 'power' | 'switch' | 'data' | 'knx' | 'display' | 'iot' | 'light' | 'box'

export interface DeviceType {
  id: string
  name: string
  category: DeviceCategory
  defaultHeight: number // Mitte über OKFF
  w: number
  h: number
  d: number
  color: string
  price: number
  boxPrice: number // zugehörige Unterputz-/Gerätedose
  gangs?: number // Rahmenfelder bei Schalterserien (Breite = Rahmen + (n−1) · Mittenabstand)
  sizes?: SizeVariant[] // Größenvarianten bei Typen ohne Rahmen (Richtwerte)
  box?: boolean // hat eine Unterputz-/Gerätedose (Auswahl möglich)
  mount?: 'wall' | 'ceiling' | 'floor' // Montage: Wand (Standard) oder freie Position an Decke bzw. Boden
  ceilingDrop?: number // bei Deckenmontage: Abstand der Mitte unter der Decke
  kind?: DeviceKind // Rolle im Schaltschrank-Konzept (sonst aus der Kategorie abgeleitet)
  defaultPowerW?: number // Richtwert Leistung bei Neuanlage
  defaultDimmable?: boolean
}

/** Rolle eines Geräts: Last (Steckdose, Herd …), Leuchte, Sensor/Taster, Daten, sonstiges. */
export type DeviceKind = 'load' | 'light' | 'sensor' | 'data' | 'other'

const KIND_BY_CATEGORY: Record<DeviceCategory, DeviceKind> = {
  power: 'load',
  switch: 'sensor',
  knx: 'sensor',
  data: 'data',
  display: 'other',
  iot: 'data',
  light: 'light',
  box: 'other',
}
export const kindOf = (dt: DeviceType): DeviceKind => dt.kind ?? KIND_BY_CATEGORY[dt.category]

export interface SizeVariant {
  id: string
  label: string
  w: number
  h: number
}

export const CATEGORY_LABEL: Record<DeviceCategory, string> = {
  power: 'Steckdosen',
  switch: 'Schalter',
  data: 'Netzwerk / Daten',
  knx: 'KNX',
  display: 'Displays',
  iot: 'IoT / Sicherheit',
  light: 'Leuchten',
  box: 'Dosen & Verteiler',
}

export const DEVICE_TYPES: DeviceType[] = [
  { id: 'sd-1', name: 'Steckdose 1-fach', category: 'power', defaultHeight: 300, w: 80, h: 80, d: 12, color: '#ff9f0a', price: 4.5, boxPrice: 1.2, gangs: 1, box: true },
  { id: 'sd-2', name: 'Steckdose 2-fach', category: 'power', defaultHeight: 300, w: 152, h: 80, d: 12, color: '#ff9f0a', price: 9, boxPrice: 2.4, gangs: 2, box: true },
  { id: 'sd-3', name: 'Steckdose 3-fach', category: 'power', defaultHeight: 300, w: 224, h: 80, d: 12, color: '#ff9f0a', price: 13.5, boxPrice: 3.6, gangs: 3, box: true },
  { id: 'sd-4', name: 'Steckdose 4-fach', category: 'power', defaultHeight: 300, w: 296, h: 80, d: 12, color: '#ff9f0a', price: 18, boxPrice: 4.8, gangs: 4, box: true },
  { id: 'sd-herd', name: 'Herdanschluss 400 V', category: 'power', defaultHeight: 300, w: 80, h: 80, d: 15, color: '#ff453a', price: 12, boxPrice: 2.5, gangs: 1, box: true },
  { id: 'sw-1', name: 'Schalter 1-fach', category: 'switch', defaultHeight: 1050, w: 80, h: 80, d: 12, color: '#64d2ff', price: 6, boxPrice: 1.2, gangs: 1, box: true },
  { id: 'sw-w', name: 'Wechselschalter', category: 'switch', defaultHeight: 1050, w: 80, h: 80, d: 12, color: '#64d2ff', price: 7, boxPrice: 1.2, gangs: 1, box: true },
  { id: 'sw-2', name: 'Serienschalter', category: 'switch', defaultHeight: 1050, w: 80, h: 80, d: 12, color: '#64d2ff', price: 9, boxPrice: 1.2, gangs: 1, box: true },
  { id: 'sw-jal', name: 'Jalousietaster', category: 'switch', defaultHeight: 1050, w: 80, h: 80, d: 12, color: '#5e5ce6', price: 11, boxPrice: 1.2, gangs: 1, box: true },
  { id: 'poe', name: 'RJ45-Auslass (PoE, Kamera / Access Point)', category: 'data', defaultHeight: 2400, w: 80, h: 80, d: 12, color: '#0a84ff', price: 16, boxPrice: 1.2, gangs: 1, box: true },
  { id: 'eth-1', name: 'Ethernet-Dose 1-fach (RJ45)', category: 'data', defaultHeight: 300, w: 80, h: 80, d: 12, color: '#0a84ff', price: 14, boxPrice: 1.2, gangs: 1, box: true },
  { id: 'eth-2', name: 'Ethernet-Dose 2-fach (RJ45)', category: 'data', defaultHeight: 300, w: 80, h: 80, d: 12, color: '#0a84ff', price: 24, boxPrice: 1.2, gangs: 1, box: true },
  { id: 'knx-4', name: 'KNX-Taster 4-fach', category: 'knx', defaultHeight: 1050, w: 80, h: 80, d: 10, color: '#30d158', price: 110, boxPrice: 1.2, gangs: 1, box: true },
  { id: 'knx-ts', name: 'KNX-Raumtemperaturregler', category: 'knx', defaultHeight: 1500, w: 80, h: 80, d: 10, color: '#30d158', price: 120, boxPrice: 1.2, gangs: 1, box: true },
  { id: 'disp', name: 'Wanddisplay (KNX)', category: 'display', defaultHeight: 1500, w: 200, h: 130, d: 15, color: '#bf5af2', price: 450, boxPrice: 8, box: true, sizes: [{ id: 'd4', label: 'Display ≈ 4″ (120 × 90)', w: 120, h: 90 }, { id: 'd7', label: 'Display ≈ 7″ (200 × 130)', w: 200, h: 130 }, { id: 'd10', label: 'Display ≈ 10″ (270 × 185)', w: 270, h: 185 }] },
  { id: 'cam', name: 'Überwachungskamera (PoE)', category: 'iot', defaultHeight: 2400, w: 90, h: 90, d: 120, color: '#ff375f', price: 120, boxPrice: 3.5, sizes: [{ id: 'c90', label: 'Mini-Dome Ø 90', w: 90, h: 90 }, { id: 'c120', label: 'Dome Ø 120', w: 120, h: 120 }, { id: 'c150', label: 'Bullet / Tube 150 × 80', w: 150, h: 80 }] },
  { id: 'nfc', name: 'NFC-Leser (Zutritt)', category: 'iot', defaultHeight: 1200, w: 80, h: 80, d: 15, color: '#5ac8fa', price: 160, boxPrice: 1.2, gangs: 1, box: true },
  { id: 'pin', name: 'PIN-Eingabetaster', category: 'iot', defaultHeight: 1200, w: 85, h: 85, d: 15, color: '#5e5ce6', price: 95, boxPrice: 1.2, gangs: 1, box: true },
  { id: 'bell', name: 'Video-Türklingel', category: 'iot', defaultHeight: 1400, w: 70, h: 150, d: 25, color: '#ac8e68', price: 140, boxPrice: 2.5, box: true, sizes: [{ id: 'b1', label: 'Slim 55 × 135', w: 55, h: 135 }, { id: 'b2', label: 'Standard 70 × 150', w: 70, h: 150 }, { id: 'b3', label: 'Groß 100 × 200', w: 100, h: 200 }] },
  { id: 'ev', name: 'Ladesäule / Wallbox', category: 'iot', kind: 'load', defaultHeight: 700, w: 300, h: 1400, d: 250, color: '#32ade6', price: 900, boxPrice: 0, sizes: [{ id: 'e1', label: 'Wallbox kompakt 220 × 330', w: 220, h: 330 }, { id: 'e2', label: 'Ladesäule 300 × 1400', w: 300, h: 1400 }] },
  { id: 'l-spot', name: 'Einbau-Deckenstrahler', category: 'light', mount: 'ceiling', ceilingDrop: 0, defaultHeight: 0, w: 90, h: 60, d: 90, color: '#ffd60a', price: 12, boxPrice: 0, defaultPowerW: 6 },
  { id: 'l-pendel', name: 'Pendelleuchte', category: 'light', mount: 'ceiling', ceilingDrop: 700, defaultHeight: 0, w: 220, h: 300, d: 220, color: '#ffd60a', price: 90, boxPrice: 0, defaultPowerW: 10 },
  { id: 'l-kron', name: 'Kronleuchter', category: 'light', mount: 'ceiling', ceilingDrop: 400, defaultHeight: 0, w: 600, h: 500, d: 600, color: '#ffd60a', price: 250, boxPrice: 0, defaultPowerW: 30 },
  { id: 'l-schiene', name: 'Stromschienen-System', category: 'light', mount: 'ceiling', ceilingDrop: 60, defaultHeight: 0, w: 1000, h: 130, d: 80, color: '#ffd60a', price: 110, boxPrice: 0, defaultPowerW: 16 },
  { id: 'l-vent', name: 'Deckenventilator mit Leuchte', category: 'light', mount: 'ceiling', ceilingDrop: 250, defaultHeight: 0, w: 1100, h: 300, d: 1100, color: '#ffd60a', price: 220, boxPrice: 0, defaultPowerW: 24 },
  { id: 'l-band', name: 'LED-Band (Voute / Unterbau)', category: 'light', mount: 'ceiling', ceilingDrop: 150, defaultHeight: 0, w: 1000, h: 25, d: 20, color: '#ffd60a', price: 40, boxPrice: 0, defaultPowerW: 24, defaultDimmable: true },
  { id: 'l-rgb', name: 'Smarte RGB-Leuchte (E27)', category: 'light', mount: 'ceiling', ceilingDrop: 200, defaultHeight: 0, w: 60, h: 110, d: 60, color: '#ffd60a', price: 25, boxPrice: 0, defaultPowerW: 9, defaultDimmable: true },
  { id: 'l-wand', name: 'Wandleuchte', category: 'light', defaultHeight: 1700, w: 110, h: 250, d: 110, color: '#ffd60a', price: 60, boxPrice: 1.2, box: true, defaultPowerW: 8 },
  { id: 'l-bild', name: 'Bilderleuchte', category: 'light', defaultHeight: 1900, w: 600, h: 60, d: 100, color: '#ffd60a', price: 55, boxPrice: 1.2, defaultPowerW: 8 },
  { id: 'l-not', name: 'Notleuchte / Rettungszeichen', category: 'light', defaultHeight: 2300, w: 360, h: 150, d: 50, color: '#30d158', price: 85, boxPrice: 1.2, defaultPowerW: 3 },
  { id: 'l-aussen', name: 'Außenstehleuchte', category: 'light', mount: 'floor', defaultHeight: 300, w: 250, h: 600, d: 250, color: '#ffd60a', price: 120, boxPrice: 0, defaultPowerW: 10 },
  { id: 'kab-aus', name: 'Kabelauslassdose (Bürste)', category: 'box', defaultHeight: 1100, w: 80, h: 80, d: 12, color: '#8e8e93', price: 7, boxPrice: 1.2, gangs: 1, box: true },
  { id: 'dose-ab', name: 'Abzweigdose', category: 'box', defaultHeight: 2300, w: 80, h: 80, d: 4, color: '#8e8e93', price: 1.8, boxPrice: 0, sizes: [{ id: 'a70', label: 'Abzweigdose Ø 70', w: 70, h: 70 }, { id: 'a80', label: 'Abzweigdose Ø 80', w: 80, h: 80 }, { id: 'a100', label: 'Abzweigdose Ø 100', w: 100, h: 100 }] },
  { id: 'uv', name: 'Unterverteiler', category: 'box', defaultHeight: 1500, w: 400, h: 600, d: 80, color: '#636366', price: 120, boxPrice: 0, sizes: [{ id: 'u1', label: 'Verteiler 1 × 12 TE (≈ 300 × 200)', w: 300, h: 200 }, { id: 'u2', label: 'Verteiler 2 × 12 TE (≈ 300 × 330)', w: 300, h: 330 }, { id: 'u3', label: 'Verteiler 3 × 12 TE (≈ 400 × 600)', w: 400, h: 600 }] },
]

export function deviceType(id: string): DeviceType {
  return DEVICE_TYPES.find((t) => t.id === id) ?? DEVICE_TYPES[0]
}

// ---------------------------------------------------------------------------
// Schalterserien (Rahmenmaße) und Unterputzdosen
// Rahmen 1-fach: Gira Standard 55 = 80,7 × 80,7 mm, Busch-Jaeger Reflex SI = 81 mm (4-fach 294 × 81 mm);
// Mittenabstand in Mehrfachkombinationen 71 mm. Wippe/Einsatz meist 55 × 55 mm.
// Einträge mit „≈“ sind Richtwerte – vor der Bestellung im Datenblatt des Herstellers prüfen.
// ---------------------------------------------------------------------------

export interface Series {
  id: string
  name: string
  frame: number // Außenmaß Einfachrahmen (quadratisch), mm
  pitch: number // Mittenabstand zwischen zwei Feldern, mm
  verified: boolean
}

export const SERIES: Series[] = [
  { id: 'gira-s55', name: 'Gira Standard 55 / System 55', frame: 80.7, pitch: 71, verified: true },
  { id: 'bj-reflex', name: 'Busch-Jaeger Reflex SI', frame: 81, pitch: 71, verified: true },
  { id: 'generic', name: 'Allgemein 80 × 80 mm', frame: 80, pitch: 71, verified: false },
  { id: 'berker-s1', name: 'Berker S.1 / Q.1 (≈)', frame: 80, pitch: 71, verified: false },
  { id: 'jung-ls990', name: 'Jung LS 990 (≈)', frame: 80, pitch: 71, verified: false },
  { id: 'merten-m', name: 'Schneider Merten System M (≈)', frame: 80, pitch: 71, verified: false },
]
export const DEFAULT_SERIES_ID = 'gira-s55'

export function seriesById(id: string | undefined): Series {
  return SERIES.find((x) => x.id === id) ?? SERIES.find((x) => x.id === DEFAULT_SERIES_ID)!
}

export interface BoxPreset {
  id: string
  name: string
  dia: number // Außendurchmesser der Dose
  depth: number
  drill: number // Bohrkronen-Durchmesser
}

export const BOX_PRESETS: BoxPreset[] = [
  { id: 'g60-40', name: 'Gerätedose Ø 60 × 40 (flach)', dia: 60, depth: 40, drill: 68 },
  { id: 'g60-47', name: 'Gerätedose Ø 60 × 47 (Standard)', dia: 60, depth: 47, drill: 68 },
  { id: 'g60-61', name: 'Gerätedose Ø 60 × 61 (tief)', dia: 60, depth: 61, drill: 68 },
  { id: 'g60-75', name: 'Gerätedose Ø 60 × 75 (extra tief, Netzwerk/Aktor)', dia: 60, depth: 75, drill: 68 },
  { id: 'h68-47', name: 'Hohlwanddose Ø 68 × 47', dia: 68, depth: 47, drill: 68 },
  { id: 'h68-61', name: 'Hohlwanddose Ø 68 × 61 (tief)', dia: 68, depth: 61, drill: 68 },
]
export const DEFAULT_BOX_ID = 'g60-47'
export const BOX_PITCH = 71 // mm Mittenabstand mehrerer Dosen in einer Kombination

/** Auswahl der Maße, wie sie im Gerät und in den Werkzeugoptionen gespeichert wird. */
export type DeviceSpec = Pick<Device, 'seriesId' | 'sizeId' | 'w' | 'h' | 'boxId' | 'boxDia' | 'boxDepth'>

export interface ResolvedBox {
  name: string
  dia: number
  depth: number
  drill: number
  count: number
  pitch: number
}

export interface ResolvedDevice {
  dt: DeviceType // mit überschriebenen Maßen w/h
  series?: Series
  sizeLabel: string
  box?: ResolvedBox
}

const r1 = (n: number) => Math.round(n * 10) / 10

/** Wendet Serie, Größenvariante bzw. eigene Maße und die Dose auf einen Gerätetyp an. */
export function resolveSpec(typeId: string, spec: DeviceSpec = {}, defaultSeriesId?: string): ResolvedDevice {
  const base = deviceType(typeId)
  let w = base.w
  let h = base.h
  let series: Series | undefined
  let sizeLabel = `${r1(w)} × ${r1(h)} mm`
  if (base.gangs) {
    if (spec.seriesId === 'custom' && spec.w && spec.h) {
      w = spec.w
      h = spec.h
      sizeLabel = `eigene Maße ${r1(w)} × ${r1(h)} mm`
    } else {
      series = seriesById(spec.seriesId && spec.seriesId !== 'custom' ? spec.seriesId : defaultSeriesId)
      w = r1(series.frame + (base.gangs - 1) * series.pitch)
      h = series.frame
      sizeLabel = `${series.name} · ${r1(w)} × ${r1(h)} mm`
    }
  } else if (base.sizes) {
    if (spec.sizeId === 'custom' && spec.w && spec.h) {
      w = spec.w
      h = spec.h
      sizeLabel = `eigene Maße ${r1(w)} × ${r1(h)} mm`
    } else {
      const v = base.sizes.find((x) => x.id === spec.sizeId) ?? base.sizes.find((x) => x.w === base.w && x.h === base.h) ?? base.sizes[0]
      w = v.w
      h = v.h
      sizeLabel = v.label
    }
  }
  let box: ResolvedBox | undefined
  if (base.box) {
    const count = Math.max(1, base.gangs ?? 1)
    if (spec.boxId === 'custom' && spec.boxDia && spec.boxDepth) {
      box = { name: `Eigene Dose Ø ${r1(spec.boxDia)} × ${r1(spec.boxDepth)}`, dia: spec.boxDia, depth: spec.boxDepth, drill: Math.max(68, spec.boxDia + 8), count, pitch: BOX_PITCH }
    } else {
      const bp = BOX_PRESETS.find((x) => x.id === spec.boxId) ?? BOX_PRESETS.find((x) => x.id === DEFAULT_BOX_ID)!
      box = { name: bp.name, dia: bp.dia, depth: bp.depth, drill: bp.drill, count, pitch: BOX_PITCH }
    }
  }
  return { dt: { ...base, w, h }, series, sizeLabel, box }
}

/** Auflösung für ein platziertes Gerät unter den Projekteinstellungen. */
export function resolveDevice(d: Device, settings: ProjectSettings): ResolvedDevice {
  return resolveSpec(d.typeId, d, settings.seriesId)
}

/** Gerätetyp mit den für dieses Gerät gültigen Maßen. */
export function devType(d: Device, settings: ProjectSettings): DeviceType {
  return resolveDevice(d, settings).dt
}

// ---------------------------------------------------------------------------
// Leitungstypen
// ---------------------------------------------------------------------------

export type CableCategory = 'power' | 'data' | 'knx' | 'conduit'

export interface CableType {
  id: string
  name: string
  category: CableCategory
  crossSection?: number // mm² je Ader (nur Strom)
  cores?: number
  phases?: 1 | 3
  defaultFuse?: number
  color: string
  price: number // €/m
}

export const CABLE_TYPES: CableType[] = [
  { id: 'nym-3x1.5', name: 'NYM-J 3×1,5', category: 'power', crossSection: 1.5, cores: 3, phases: 1, defaultFuse: 10, color: '#ff453a', price: 0.9 },
  { id: 'nym-3x2.5', name: 'NYM-J 3×2,5', category: 'power', crossSection: 2.5, cores: 3, phases: 1, defaultFuse: 16, color: '#ff9f0a', price: 1.4 },
  { id: 'nym-5x1.5', name: 'NYM-J 5×1,5', category: 'power', crossSection: 1.5, cores: 5, phases: 3, defaultFuse: 10, color: '#ff6482', price: 1.4 },
  { id: 'nym-5x2.5', name: 'NYM-J 5×2,5', category: 'power', crossSection: 2.5, cores: 5, phases: 3, defaultFuse: 16, color: '#ffd60a', price: 2.1 },
  { id: 'nym-5x4', name: 'NYM-J 5×4', category: 'power', crossSection: 4, cores: 5, phases: 3, defaultFuse: 25, color: '#ac8e68', price: 3.2 },
  { id: 'nym-5x6', name: 'NYM-J 5×6', category: 'power', crossSection: 6, cores: 5, phases: 3, defaultFuse: 32, color: '#a2845e', price: 4.6 },
  { id: 'nym-5x10', name: 'NYM-J 5×10', category: 'power', crossSection: 10, cores: 5, phases: 3, defaultFuse: 40, color: '#8e6e4a', price: 7.5 },
  { id: 'cat7', name: 'Cat.7 S/FTP', category: 'data', color: '#0a84ff', price: 0.95 },
  { id: 'knx', name: 'KNX-Busleitung J-Y(St)Y 2×2×0,8', category: 'knx', color: '#30d158', price: 0.8 },
  { id: 'rohr-m25', name: 'Leerrohr M25', category: 'conduit', color: '#8e8e93', price: 0.45 },
]

export function cableType(id: string): CableType {
  return CABLE_TYPES.find((t) => t.id === id) ?? CABLE_TYPES[0]
}

export const FUSE_OPTIONS = [6, 10, 13, 16, 20, 25, 32, 40, 50, 63]

export const METHOD_LABEL: Record<InstallMethod, string> = {
  A2: 'A2 – in wärmegedämmter Wand',
  B2: 'B2 – im Rohr in/auf Wand',
  C: 'C – direkt in/auf Wand',
}

// ---------------------------------------------------------------------------
// Strombelastbarkeit (Richtwerte nach DIN VDE 0298-4 / IEC 60364-5-52, Cu, PVC, 30 °C).
// Werte je Querschnitt: [2 belastete Adern, 3 belastete Adern]. Bitte gegen die
// aktuelle Normfassung prüfen – die Tabelle ist bewusst hier zentral pflegbar.
// ---------------------------------------------------------------------------
export const AMPACITY: Record<InstallMethod, Record<number, [number, number]>> = {
  A2: { 1.5: [14, 13], 2.5: [18.5, 17.5], 4: [25, 23], 6: [32, 29], 10: [43, 39] },
  B2: { 1.5: [16.5, 15], 2.5: [23, 20], 4: [30, 27], 6: [38, 34], 10: [52, 46] },
  C: { 1.5: [19.5, 17.5], 2.5: [27, 24], 4: [36, 32], 6: [46, 41], 10: [63, 57] },
}

// ---------------------------------------------------------------------------
// Installationszonen nach DIN 18015-3 (Werte laut Abstimmung, in der App änderbar)
// ---------------------------------------------------------------------------
export const DEFAULT_ZONES: ZoneSettings = {
  horizontal: [
    { id: 'z-300', label: '0,30 m über OKFF', ref: 'floor', center: 300 },
    { id: 'z-1050', label: '1,05 m über OKFF', ref: 'floor', center: 1050 },
    { id: 'z-1500', label: '1,50 m über OKFF', ref: 'floor', center: 1500 },
    { id: 'z-decke', label: '0,30 m unter Decke', ref: 'ceiling', center: 300 },
  ],
  width: 300,
  verticalWidth: 100,
  verticalOffset: 150,
}

export const DEFAULT_SETTINGS: ProjectSettings = {
  wallHeight: 2500,
  outerThickness: 240,
  innerThickness: 115,
  levelHeight: 2800,
  grid: 50,
  seriesId: DEFAULT_SERIES_ID,
  zones: DEFAULT_ZONES,
  vde: {
    dropLimitPct: 3,
    kappa: 48, // Kupfer bei 70 °C Betriebstemperatur
    cosPhi: 1,
    sourceImpedance: 0.4,
  },
}

export const DOOR_DEFAULT = { width: 1010, height: 2135, sill: 0 }
export const WINDOW_DEFAULT = { width: 1010, height: 1250, sill: 900 }

// ---------------------------------------------------------------------------
// Stromkreise: Farbpalette, Standardwerte
// ---------------------------------------------------------------------------
export const CIRCUIT_COLORS = ['#ff9f0a', '#0a84ff', '#30d158', '#bf5af2', '#ff453a', '#64d2ff', '#ffd60a', '#ff6482', '#5e5ce6', '#ac8e68']

export const DIM_LABEL: Record<NonNullable<Device['dimType']>, string> = {
  phase: 'Phasenan-/abschnitt (230 V)',
  v010: '0–10 V',
  dali: 'DALI',
  pwm: 'PWM / Konstantspannung (LED-Band)',
}

/** Startwerte der elektrischen Zuordnung für ein neu gesetztes Gerät. */
export function electricDefaults(dt: DeviceType): Partial<Device> {
  const out: Partial<Device> = {}
  const kind = kindOf(dt)
  if (kind === 'load' && dt.category === 'power') out.control = 'direct'
  if (dt.defaultPowerW) out.powerW = dt.defaultPowerW
  if (kind === 'light' && dt.defaultDimmable !== undefined) {
    out.dimmable = dt.defaultDimmable
    if (dt.defaultDimmable) out.dimType = dt.id === 'l-band' ? 'pwm' : 'phase'
  }
  return out
}
