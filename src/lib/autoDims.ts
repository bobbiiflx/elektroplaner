import type { Device, Floor, Vec2, Wall } from '../types'
import { clamp, pointOnWall, wallLength } from './geom'

/** Referenz einer automatischen Mittenbemaßung entlang einer Wand. */
export type AutoRef = { kind: 'device'; id: string; u: number } | { kind: 'wall'; end: 'start' | 'end'; u: number }

/**
 * Bezugspunkt für die waagerechte Mittenbemaßung eines (neuen oder gewählten) Objekts bei Abstand u / Höhe z:
 * Liegt ein anderes Objekt auf derselben Höhe (± tol), wird nur zu dessen Mitte bemaßt – sonst zur nächsten Wandkante.
 */
export function autoRef(wall: Wall, devices: Device[], u: number, z: number, ignoreId?: string, tol = 2): AutoRef {
  const L = wallLength(wall)
  let best: Device | null = null
  for (const d of devices) {
    if (d.id === ignoreId || d.wallId !== wall.id) continue
    if (Math.abs(d.height - z) > tol) continue
    if (!best || Math.abs(d.offset - u) < Math.abs(best.offset - u)) best = d
  }
  if (best) return { kind: 'device', id: best.id, u: best.offset }
  return u <= L - u ? { kind: 'wall', end: 'start', u: 0 } : { kind: 'wall', end: 'end', u: L }
}

/** Mittenpunkt eines Geräts auf der Wandachse im Grundriss. */
export function deviceCenter(floor: Floor, d: Device): Vec2 | null {
  const w = floor.walls.find((x) => x.id === d.wallId)
  return w ? pointOnWall(w, d.offset) : null
}

export interface SnapResult {
  p: Vec2
  kind: 'device' | 'wall' | 'opening' | 'grid' | 'free'
}

/** Einrasten des Lineals im Grundriss: Objektmitten > Wandpunkte > Öffnungskanten > Raster. */
export function snapPlanPoint(floor: Floor, raw: Vec2, tol: number, grid: number, snapOn: boolean): SnapResult {
  if (!snapOn) return { p: raw, kind: 'free' }
  let best: SnapResult | null = null
  let bd = tol
  const consider = (q: Vec2, kind: SnapResult['kind']) => {
    const d = Math.hypot(q.x - raw.x, q.y - raw.y)
    if (d < bd) {
      bd = d
      best = { p: { x: q.x, y: q.y }, kind }
    }
  }
  for (const d of floor.devices) {
    const w = floor.walls.find((x) => x.id === d.wallId)
    if (!w) continue
    const L = wallLength(w) || 1
    const nx = -(w.b.y - w.a.y) / L
    const ny = (w.b.x - w.a.x) / L
    const c = pointOnWall(w, d.offset)
    consider({ x: c.x + nx * d.side * w.thickness / 2, y: c.y + ny * d.side * w.thickness / 2 }, 'device')
  }
  if (best) return best
  for (const w of floor.walls) {
    consider(w.a, 'wall')
    consider(w.b, 'wall')
  }
  for (const o of floor.openings) {
    const w = floor.walls.find((x) => x.id === o.wallId)
    if (!w) continue
    consider(pointOnWall(w, o.offset), 'opening')
    consider(pointOnWall(w, o.offset + o.width), 'opening')
  }
  if (best) return best
  return { p: { x: Math.round(raw.x / grid) * grid, y: Math.round(raw.y / grid) * grid }, kind: 'grid' }
}

/** Einrasten des Lineals in der Wandansicht (u, z): Objektmitten > Öffnungsecken/Wandecken > Raster. */
export function snapWallPoint(
  wall: Wall,
  H: number,
  devices: Device[],
  openings: { offset: number; width: number; sill: number; height: number }[],
  raw: Vec2,
  tol: number,
  grid: number,
  snapOn: boolean,
  sizeOf?: (d: Device) => { w: number; h: number },
): SnapResult {
  void sizeOf
  const L = wallLength(wall)
  if (!snapOn) return { p: { x: clamp(raw.x, 0, L), y: clamp(raw.y, 0, H) }, kind: 'free' }
  let best: SnapResult | null = null
  let bd = tol
  const consider = (x: number, y: number, kind: SnapResult['kind']) => {
    const d = Math.hypot(x - raw.x, y - raw.y)
    if (d < bd) {
      bd = d
      best = { p: { x, y }, kind }
    }
  }
  for (const d of devices) consider(d.offset, d.height, 'device')
  if (best) return best
  for (const o of openings) for (const x of [o.offset, o.offset + o.width]) for (const y of [o.sill, o.sill + o.height]) consider(x, y, 'opening')
  for (const x of [0, L]) for (const y of [0, H]) consider(x, y, 'wall')
  if (best) return best
  return { p: { x: clamp(Math.round(raw.x / grid) * grid, 0, L), y: clamp(Math.round(raw.y / grid) * grid, 0, H) }, kind: 'grid' }
}

/** Auf waagerechte oder senkrechte Linie relativ zu `from` einrasten (Umschalt-Taste). */
export function lockAxis(from: Vec2, p: Vec2): Vec2 {
  return Math.abs(p.x - from.x) >= Math.abs(p.y - from.y) ? { x: p.x, y: from.y } : { x: from.x, y: p.y }
}
