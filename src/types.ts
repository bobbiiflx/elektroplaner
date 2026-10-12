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
  x?: number // Versatz der Bildecke im Plan (mm), Standard 0
  y?: number
  sheetId?: string // gleiche ID = Ausschnitte desselben Blatts (gemeinsamer Maßstab)
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

export type OpeningType = 'door' | 'window' | 'floorWindow' | 'liftSlide'
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

/** Dachschräge: Ebene, die an der Linie a–b (Kniestock/Traufe) mit Höhe `knee` beginnt und zur Seite `side` mit `angle` ansteigt. Obergrenze ist die Geschoss-Wandhöhe (Firsthöhe). */
export interface RoofPlane {
  id: string
  a: Vec2
  b: Vec2
  side: 1 | -1 // Anstiegsrichtung = Normale (-dy, dx) · side
  knee: number // Höhe über OKFF an der Linie (mm)
  angle: number // Neigung in Grad
}

/** Rechteck, ausgehend von der Linie a–b (z. B. Gaubenfront) mit Tiefe zur Seite `side` (Normale (-dy, dx) · side). */
export interface OrientedRect {
  a: Vec2
  b: Vec2
  depth: number
  side: 1 | -1
}
/** Gaube: hebt die Dachschräge im Rechteck auf die Gaubenhöhe an (Wände dort werden entsprechend höher). */
export interface Dormer extends OrientedRect {
  id: string
  height: number // lichte Höhe unter der Gaubendecke über OKFF (mm); bei Schleppgaube: an der Front
  slope?: number // Neigung der Gaubendecke in ° (Schleppgaube); fehlt/0 = Flachdachgaube
}
export type RoomType = 'living' | 'dining' | 'bedroom' | 'kids' | 'office' | 'kitchen' | 'bath' | 'wc' | 'hall' | 'utility' | 'storage' | 'cellar' | 'balcony' | 'other'
/** Raum: Umriss (Innenseiten der Wände) für Fläche und Ausstattungsprüfung. */
export interface Room {
  id: string
  name: string
  type: RoomType
  poly: Vec2[]
}
/** Dachflächenfenster: liegt in der Dachebene `roofId`; c = Mitte im Grundriss, w entlang der Traufe, h entlang der Schräge. */
export interface Skylight {
  id: string
  roofId: string
  c: Vec2
  w: number
  h: number
}
/** Loggia: offener, überdachter Außenbereich; an der offenen Seite sitzt eine Brüstung. */
export interface Loggia extends OrientedRect {
  id: string
  parapet: number // Brüstungshöhe (mm)
  parapetWallId?: string
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
  roofs?: RoofPlane[] // Dachschrägen (begrenzen die Wandhöhe)
  dormers?: Dormer[] // Gauben (heben die Schräge lokal an)
  loggias?: Loggia[] // Loggien / Außenbereiche
  skylights?: Skylight[] // Dachflächenfenster
  rooms?: Room[] // Räume (für Ausstattungsprüfung)
  anchor?: Vec2 // Passpunkt zum Übereinanderlegen der Geschosse
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
  priceSources?: PriceSource[] // importierte Preislisten
  priceSourceId?: string // 'katalog' | 'richtwert' | PriceSource.id
  prices?: Record<string, number> // eigene Einzelpreise (€) je Position, überschreiben die Richtwerte
  scenes?: Scene[]
  cabinet?: { rowTE: number; reservePct: number } // Schaltschrank-Belegung
  suppliers?: Record<string, string> // Händler je Material-Position (Schlüssel wie bei prices)
  material?: { endMm: number; wastePct: number } // Leitungszuschlag je Ende (mm) und Verschnitt (%)
  roomReq?: Partial<Record<RoomType, { sockets: number; lights: number }>> // eigene Soll-Werte je Raumart
  done?: Record<string, boolean> // Baustellen-Modus: erledigte Geräte/Leitungen (Element-ID)
  notes?: Record<string, Note> // Notizen und Fotos je Element-ID
  variants?: Variant[] // gemerkte Materialstände zum Vergleichen (z. B. KNX gegen konventionell)
}
/** Notiz mit Fotos an einem Element (Wand, Gerät, Leitung …). Fotos liegen separat in der Datenbank. */
export interface Note {
  text: string
  photos: string[]
}
export interface Variant {
  id: string
  name: string
  at: string // ISO
  net: number
  lines: { key: string; name: string; unit: 'Stk' | 'm'; qty: number; sum: number }[]
}

export interface PriceSource {
  id: string
  name: string
  date: string // ISO
  prices: Record<string, number> // Netto-€ je Positions-Schlüssel (dev:/box:/cab:/act:)
}

export interface ProjectMeta {
  id: string
  name: string
  updatedAt: string
}
