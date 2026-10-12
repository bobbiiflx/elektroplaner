// Alle Längen sind intern in Millimetern. Plan-Koordinaten: x nach rechts, y nach unten (wie im Bild).
// Höhen (z) sind in mm über OKFF (Oberkante Fertigfußboden) des jeweiligen Geschosses.

export type Unit = 'mm' | 'cm' | 'm'

export interface Vec2 {
  x: number
  y: number
}
export interface Vec3 extends Vec2 {
  z: number
}

export interface Background {
  width: number // Pixel
  height: number // Pixel
  mmPerPx: number // Maßstab nach Kalibrierung
  opacity: number
  source: string // z. B. "Grundriss.pdf · Seite 2"
}

export type WallKind = 'outer' | 'inner'
export interface Wall {
  id: string
  a: Vec2
  b: Vec2
  thickness: number
  height?: number // überschreibt die Geschoss-Wandhöhe
  kind: WallKind
}

export type OpeningType = 'door' | 'window'
export interface Opening {
  id: string
  wallId: string
  type: OpeningType
  offset: number // Abstand von Wandanfang (a) bis zur linken Kante
  width: number
  height: number
  sill: number // Brüstungshöhe über OKFF
}

export interface Device {
  id: string
  typeId: string
  wallId: string
  offset: number // Abstand Wandanfang → Mitte des Geräts
  side: 1 | -1 // Seite der Wand (Normale = (-dy, dx))
  height: number // Mitte über OKFF
  // Maße (optional): fehlt alles, gelten Projektstandard-Serie und Standarddose des Gerätetyps
  seriesId?: string // Schalterserie (nur Typen mit Rahmen), 'custom' = eigene Maße w × h
  sizeId?: string // Größenvariante bei Typen ohne Rahmen, 'custom' = eigene Maße w × h
  w?: number // eigene Breite (mm)
  h?: number // eigene Höhe (mm)
  boxId?: string // Unterputzdose (Preset) oder 'custom'
  boxDia?: number // eigener Dosendurchmesser (mm)
  boxDepth?: number // eigene Dosentiefe (mm)
  // Freie Position (Decken-/Bodenmontage): wallId = '' und x/y im Grundriss
  x?: number
  y?: number
  // Elektrische Zuordnung (Schaltschrank-Grundlagen)
  circuitId?: string
  distId?: string // Verteiler (Gerät), zu dem die Leitung läuft; leer = automatisch
  runLen?: number // gemessene/gesetzte Leitungslänge zum Verteiler in mm (überschreibt die Schätzung)
  groupIds?: string[] // KNX-Gruppen: Taster/Sensoren senden, Leuchten/Lasten empfangen
  control?: 'direct' | 'knx' // direkt über Schalter/Sicherung oder über KNX-Aktor geschaltet
  dimmable?: boolean // nur Leuchten: ja / nein (undefined = noch nicht entschieden)
  dimType?: 'phase' | 'v010' | 'dali' | 'pwm' // Dimmart
  powerW?: number // Leistung in W
}

export type InstallMethod = 'A2' | 'B2' | 'C'
export type Characteristic = 'B' | 'C'

export interface CableNode extends Vec3 {
  deviceId?: string
}
export interface Cable {
  id: string
  typeId: string
  points: CableNode[]
  fuseA: number
  method: InstallMethod
  charac: Characteristic
}

/** Vom Nutzer gezeichnete Maßlinie. space 'plan': x/y im Grundriss; 'wall': x = Abstand vom Wandanfang (u), y = Höhe über OKFF. */
export interface Dimension {
  id: string
  space: 'plan' | 'wall'
  wallId?: string
  a: Vec2
  b: Vec2
}

export interface Floor {
  id: string
  name: string
  levelHeight: number // Geschosshöhe inkl. Decke
  wallHeight: number
  background?: Background
  walls: Wall[]
  openings: Opening[]
  devices: Device[]
  cables: Cable[]
  dims?: Dimension[]
}

export interface HorizontalZone {
  id: string
  label: string
  ref: 'floor' | 'ceiling'
  center: number // mm ab OKFF bzw. mm unter Decke
}

export interface ZoneSettings {
  horizontal: HorizontalZone[]
  width: number // Breite der waagerechten Zonen
  verticalWidth: number
  verticalOffset: number // Abstand der senkrechten Zone von Ecke/Laibung
}

export interface VdeSettings {
  dropLimitPct: number
  kappa: number // m/(Ω·mm²)
  cosPhi: number
  sourceImpedance: number // Ω bis zum Verteiler
}

export interface ProjectSettings {
  wallHeight: number
  outerThickness: number
  innerThickness: number
  levelHeight: number
  grid: number
  runPct?: number // Zuschlag auf geschätzte Leitungswege in % (Standard 10)
  runReserve?: number // fester Zuschlag je Leitung in mm (Standard 1000)
  seriesId?: string // Standard-Schalterserie für neue und nicht abweichende Geräte
  zones: ZoneSettings
  vde: VdeSettings
}

export type Phase = 'L1' | 'L2' | 'L3' | '3L'
export interface Circuit {
  id: string
  name: string // z. B. „F3 Wohnzimmer Steckdosen“
  rating: number // Nennstrom des Leitungsschutzschalters in A
  charac: Characteristic
  phase: Phase
  rcd: string // FI-/RCD-Gruppe, z. B. „FI 1 · 30 mA“ (leer = noch nicht zugeordnet)
  color: string
}

/** KNX-Gruppe (Lichtgruppe …) mit Gruppenadressen. */
export interface Group {
  id: string
  name: string
  ga: string // Gruppenadresse Schalten, z. B. „1/0/3“
  gaDim?: string // Dimmen relativ
  gaValue?: string // Helligkeitswert
  gaStatus?: string // Rückmeldung
}

/** Szene: je Gruppe ein Wert in % (0 = aus, 100 = an); nicht gelistete Gruppen bleiben unverändert. */
export interface Scene {
  id: string
  name: string
  no: number // Szenennummer 1–64
  values: Record<string, number>
}

export interface Project {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  settings: ProjectSettings
  floors: Floor[]
  circuits?: Circuit[]
  groups?: Group[]
  scenes?: Scene[]
}

export interface ProjectMeta {
  id: string
  name: string
  updatedAt: string
}
