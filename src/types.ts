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
  zones: ZoneSettings
  vde: VdeSettings
}

export interface Project {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  settings: ProjectSettings
  floors: Floor[]
}

export interface ProjectMeta {
  id: string
  name: string
  updatedAt: string
}
