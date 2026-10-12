import { deviceType, kindOf } from '../config/catalog'
import type { Device, Floor, Project, Vec2 } from '../types'
import { elevationOf } from './factory'
import { pointOnWall } from './geom'

export const DEFAULT_RUN_PCT = 10
export const DEFAULT_RUN_RESERVE = 1000

const isDist = (typeId: string) => typeId === 'hv' || typeId === 'uv'
export const isRiser = (typeId: string) => typeId === 'steig'

/** Braucht die Leitung zum Verteiler? KNX-geschaltete Leuchten/Lasten und KNX-Sensoren (Busleitung). */
export function needsRun(d: Device): boolean {
  const dt = deviceType(d.typeId)
  const k = kindOf(dt)
  if (k === 'sensor') return dt.category === 'knx'
  return (k === 'light' || k === 'load') && d.control === 'knx'
}

/** Position eines Geräts im Grundriss (Wandgerät: Punkt auf der Wand, freie Geräte: x/y). */
export function planPoint(floor: Floor, d: Device): Vec2 | null {
  if (!d.wallId) return d.x !== undefined && d.y !== undefined ? { x: d.x, y: d.y } : null
  const w = floor.walls.find((x) => x.id === d.wallId)
  return w ? pointOnWall(w, d.offset, d.side, w.thickness / 2) : null
}

export interface DistInfo {
  device: Device
  floor: Floor
  floorIndex: number
  name: string
}

export function allDists(project: Project): DistInfo[] {
  const out: DistInfo[] = []
  project.floors.forEach((floor, floorIndex) =>
    floor.devices.forEach((device) => {
      if (isDist(device.typeId)) out.push({ device, floor, floorIndex, name: `${deviceType(device.typeId).name} · ${floor.name}` })
    }),
  )
  return out
}

/** Zuständiger Verteiler: gewählter, sonst Unterverteiler im selben Geschoss, sonst Hauptverteiler. */
export function distFor(project: Project, d: Device, floorIndex: number): DistInfo | null {
  const dists = allDists(project)
  const chosen = d.distId ? dists.find((x) => x.device.id === d.distId) : undefined
  if (chosen) return chosen
  return dists.find((x) => x.floorIndex === floorIndex && x.device.typeId === 'uv') ?? dists.find((x) => x.device.typeId === 'hv') ?? dists[0] ?? null
}

const manhattan = (a: Vec2, b: Vec2) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y)

function nearestRiser(floor: Floor, p: Vec2): Vec2 | null {
  let best: Vec2 | null = null
  let bd = Infinity
  for (const r of floor.devices) {
    if (!isRiser(r.typeId)) continue
    const q = planPoint(floor, r)
    if (!q) continue
    const dd = manhattan(p, q)
    if (dd < bd) {
      bd = dd
      best = q
    }
  }
  return best
}

export interface Run {
  dist: DistInfo
  horiz: number
  vert: number
  extra: number
  len: number
  manual: boolean
  warn?: string
}

/** Leitungsweg eines Geräts zum Verteiler (geschätzt: rechtwinklig im Grundriss + Höhenunterschied + Zuschlag). */
export function runOf(project: Project, d: Device): Run | null {
  const fi = project.floors.findIndex((f) => f.devices.some((x) => x.id === d.id))
  if (fi < 0) return null
  const floor = project.floors[fi]
  const dist = distFor(project, d, fi)
  if (!dist) return null
  const pd = planPoint(floor, d)
  const pv = planPoint(dist.floor, dist.device)
  if (!pd || !pv) return null
  const zd = elevationOf(project, fi) + d.height
  const zv = elevationOf(project, dist.floorIndex) + dist.device.height
  const vert = Math.abs(zd - zv)
  let horiz: number
  let warn: string | undefined
  if (fi === dist.floorIndex) horiz = manhattan(pd, pv)
  else {
    const ra = nearestRiser(floor, pd)
    const rb = nearestRiser(dist.floor, pv)
    if (ra && rb) horiz = manhattan(pd, ra) + manhattan(rb, pv)
    else {
      horiz = manhattan(pd, pv)
      warn = `Kein Steigpunkt in ${!ra ? floor.name : dist.floor.name} – Weg ohne Steigpunkt geschätzt`
    }
  }
  const pct = project.settings.runPct ?? DEFAULT_RUN_PCT
  const reserve = project.settings.runReserve ?? DEFAULT_RUN_RESERVE
  const extra = Math.round(((horiz + vert) * pct) / 100 + reserve)
  const manual = d.runLen !== undefined && d.runLen > 0
  return { dist, horiz: Math.round(horiz), vert: Math.round(vert), extra, len: manual ? (d.runLen as number) : Math.round(horiz + vert + extra), manual, warn }
}

export interface DistSummary {
  dist: DistInfo
  runs: number
  total: number
  knx: number
}

export function runSummary(project: Project): { perDist: DistSummary[]; noDist: Device[]; warnings: { device: Device; text: string }[] } {
  const map = new Map<string, DistSummary>()
  const noDist: Device[] = []
  const warnings: { device: Device; text: string }[] = []
  for (const floor of project.floors)
    for (const d of floor.devices) {
      if (!needsRun(d)) continue
      const r = runOf(project, d)
      if (!r) {
        noDist.push(d)
        continue
      }
      const s = map.get(r.dist.device.id) ?? { dist: r.dist, runs: 0, total: 0, knx: 0 }
      s.runs++
      s.total += r.len
      s.knx += d.control === 'knx' ? 1 : 0
      map.set(r.dist.device.id, s)
      if (r.warn) warnings.push({ device: d, text: r.warn })
    }
  return { perDist: [...map.values()], noDist, warnings }
}
