import type { ProjectSettings, ZoneSettings, InstallMethod } from '../types'

// ---------------------------------------------------------------------------
// Gerätetypen (Dosen, Steckdosen, Schalter, KNX, Netzwerk, Displays)
// Preise sind Platzhalter (EUR netto, ca.) und später in der Oberfläche pflegbar.
// Maße in mm: w = Breite, h = Höhe, d = Vorstand vor der Wand.
// ---------------------------------------------------------------------------

export type DeviceCategory = 'power' | 'switch' | 'data' | 'knx' | 'display' | 'box'

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
}

export const CATEGORY_LABEL: Record<DeviceCategory, string> = {
  power: 'Steckdosen',
  switch: 'Schalter',
  data: 'Netzwerk / Daten',
  knx: 'KNX',
  display: 'Displays',
  box: 'Dosen & Verteiler',
}

export const DEVICE_TYPES: DeviceType[] = [
  { id: 'sd-1', name: 'Steckdose 1-fach', category: 'power', defaultHeight: 300, w: 80, h: 80, d: 12, color: '#ff9f0a', price: 4.5, boxPrice: 1.2 },
  { id: 'sd-2', name: 'Steckdose 2-fach', category: 'power', defaultHeight: 300, w: 152, h: 80, d: 12, color: '#ff9f0a', price: 9, boxPrice: 2.4 },
  { id: 'sd-3', name: 'Steckdose 3-fach', category: 'power', defaultHeight: 300, w: 224, h: 80, d: 12, color: '#ff9f0a', price: 13.5, boxPrice: 3.6 },
  { id: 'sd-herd', name: 'Herdanschluss 400 V', category: 'power', defaultHeight: 300, w: 80, h: 80, d: 15, color: '#ff453a', price: 12, boxPrice: 2.5 },
  { id: 'sw-1', name: 'Schalter 1-fach', category: 'switch', defaultHeight: 1050, w: 80, h: 80, d: 12, color: '#64d2ff', price: 6, boxPrice: 1.2 },
  { id: 'sw-w', name: 'Wechselschalter', category: 'switch', defaultHeight: 1050, w: 80, h: 80, d: 12, color: '#64d2ff', price: 7, boxPrice: 1.2 },
  { id: 'sw-2', name: 'Serienschalter', category: 'switch', defaultHeight: 1050, w: 80, h: 80, d: 12, color: '#64d2ff', price: 9, boxPrice: 1.2 },
  { id: 'sw-jal', name: 'Jalousietaster', category: 'switch', defaultHeight: 1050, w: 80, h: 80, d: 12, color: '#5e5ce6', price: 11, boxPrice: 1.2 },
  { id: 'eth-1', name: 'Ethernet-Dose 1-fach (RJ45)', category: 'data', defaultHeight: 300, w: 80, h: 80, d: 12, color: '#0a84ff', price: 14, boxPrice: 1.2 },
  { id: 'eth-2', name: 'Ethernet-Dose 2-fach (RJ45)', category: 'data', defaultHeight: 300, w: 80, h: 80, d: 12, color: '#0a84ff', price: 24, boxPrice: 1.2 },
  { id: 'knx-1', name: 'KNX-Taster 1-fach', category: 'knx', defaultHeight: 1050, w: 55, h: 55, d: 10, color: '#30d158', price: 70, boxPrice: 1.2 },
  { id: 'knx-4', name: 'KNX-Taster 4-fach', category: 'knx', defaultHeight: 1050, w: 80, h: 80, d: 10, color: '#30d158', price: 110, boxPrice: 1.2 },
  { id: 'knx-ts', name: 'KNX-Raumtemperaturregler', category: 'knx', defaultHeight: 1500, w: 80, h: 80, d: 10, color: '#30d158', price: 120, boxPrice: 1.2 },
  { id: 'disp', name: 'Wanddisplay (KNX)', category: 'display', defaultHeight: 1500, w: 200, h: 130, d: 15, color: '#bf5af2', price: 450, boxPrice: 8 },
  { id: 'dose-ab', name: 'Abzweigdose', category: 'box', defaultHeight: 2300, w: 80, h: 80, d: 4, color: '#8e8e93', price: 1.8, boxPrice: 0 },
  { id: 'uv', name: 'Unterverteiler', category: 'box', defaultHeight: 1500, w: 400, h: 600, d: 80, color: '#636366', price: 120, boxPrice: 0 },
]

export function deviceType(id: string): DeviceType {
  return DEVICE_TYPES.find((t) => t.id === id) ?? DEVICE_TYPES[0]
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
