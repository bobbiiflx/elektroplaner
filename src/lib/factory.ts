import { DEFAULT_SETTINGS, cableType, deviceType } from '../config/catalog'
import type { Floor, Project, ProjectSettings } from '../types'
import { uid } from './geom'

function cloneSettings(): ProjectSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as ProjectSettings
}

export function newFloor(settings: ProjectSettings, name: string): Floor {
  return {
    id: uid('f_'),
    name,
    levelHeight: settings.levelHeight,
    wallHeight: settings.wallHeight,
    walls: [],
    openings: [],
    devices: [],
    cables: [],
  }
}

export function newProject(name: string): Project {
  const settings = cloneSettings()
  const now = new Date().toISOString()
  return {
    id: uid('p_'),
    name,
    createdAt: now,
    updatedAt: now,
    settings,
    floors: [newFloor(settings, 'Erdgeschoss')],
  }
}

/** Kleines Beispielzimmer (5 × 4 m), damit die App beim ersten Start nicht leer ist. */
export function sampleProject(): Project {
  const p = newProject('Beispiel – Wohnzimmer')
  const t = p.settings.outerThickness
  const f = p.floors[0]
  const A = { x: 1000, y: 1000 }
  const B = { x: 6000, y: 1000 }
  const C = { x: 6000, y: 5000 }
  const D = { x: 1000, y: 5000 }
  f.walls = [
    { id: 'w1', a: A, b: B, thickness: t, kind: 'outer' },
    { id: 'w2', a: B, b: C, thickness: t, kind: 'outer' },
    { id: 'w3', a: C, b: D, thickness: t, kind: 'outer' },
    { id: 'w4', a: D, b: A, thickness: t, kind: 'outer' },
  ]
  f.openings = [
    { id: 'o1', wallId: 'w3', type: 'door', offset: 3500, width: 1010, height: 2135, sill: 0 },
    { id: 'o2', wallId: 'w1', type: 'window', offset: 1800, width: 1500, height: 1250, sill: 900 },
  ]
  const sd = deviceType('sd-2')
  const sw = deviceType('sw-1')
  const eth = deviceType('eth-1')
  const disp = deviceType('disp')
  f.devices = [
    { id: 'd1', typeId: sd.id, wallId: 'w4', offset: 2000, side: 1, height: sd.defaultHeight },
    { id: 'd2', typeId: sw.id, wallId: 'w3', offset: 3250, side: 1, height: sw.defaultHeight },
    { id: 'd3', typeId: eth.id, wallId: 'w1', offset: 4300, side: 1, height: eth.defaultHeight },
    { id: 'd4', typeId: disp.id, wallId: 'w2', offset: 2000, side: 1, height: disp.defaultHeight },
    { id: 'd5', typeId: sw.id, wallId: 'w4', offset: 3680, side: 1, height: sw.defaultHeight },
  ]
  const ct = cableType('nym-3x2.5')
  f.cables = [
    {
      id: 'c1',
      typeId: ct.id,
      fuseA: ct.defaultFuse ?? 16,
      method: 'B2',
      charac: 'B',
      points: [
        { x: 1000, y: 3000, z: 300, deviceId: 'd1' },
        { x: 1000, y: 3000, z: 2200 },
        { x: 1000, y: 1320, z: 2200 },
        { x: 1000, y: 1320, z: 1050, deviceId: 'd5' },
      ],
    },
  ]
  return p
}

/** OKFF-Höhe eines Geschosses über dem Gebäudenullpunkt (Summe der Geschosshöhen darunter). */
export function elevationOf(project: Project, floorIndex: number): number {
  let e = 0
  for (let i = 0; i < floorIndex; i++) e += project.floors[i].levelHeight
  return e
}
