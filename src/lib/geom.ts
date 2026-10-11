import type { CableNode, Vec2, Wall } from '../types'

export function uid(prefix = ''): string {
  const r =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 10)
      : Math.random().toString(36).slice(2, 12)
  return prefix + r
}

export const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y)
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function wallLength(w: Wall): number {
  return dist(w.a, w.b)
}

/** Einheitsvektor von a nach b. */
export function wallDir(w: Wall): Vec2 {
  const l = wallLength(w) || 1
  return { x: (w.b.x - w.a.x) / l, y: (w.b.y - w.a.y) / l }
}

/** Normale (-dy, dx). Positive Seite (side = 1) liegt in Richtung dieser Normalen. */
export function wallNormal(w: Wall): Vec2 {
  const d = wallDir(w)
  return { x: -d.y, y: d.x }
}

export function wallAngleDeg(w: Wall): number {
  return (Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x) * 180) / Math.PI
}

/** Punkt auf der Wandmittellinie bei Abstand t vom Anfang, optional zur Seite versetzt. */
export function pointOnWall(w: Wall, t: number, side: 0 | 1 | -1 = 0, off = 0): Vec2 {
  const d = wallDir(w)
  const n = wallNormal(w)
  return {
    x: w.a.x + d.x * t + n.x * side * off,
    y: w.a.y + d.y * t + n.y * side * off,
  }
}

export interface WallHit {
  wall: Wall
  t: number // Abstand vom Wandanfang (auf [0, Länge] begrenzt)
  signed: number // vorzeichenbehafteter Abstand zur Mittellinie (+ = Seite der Normalen)
  dist: number
}

export function projectOnWall(w: Wall, p: Vec2): { t: number; signed: number; dist: number } {
  const L = wallLength(w)
  const d = wallDir(w)
  const n = wallNormal(w)
  const rx = p.x - w.a.x
  const ry = p.y - w.a.y
  const tRaw = rx * d.x + ry * d.y
  const signed = rx * n.x + ry * n.y
  const t = clamp(tRaw, 0, L)
  const dd = Math.hypot(tRaw - t, signed)
  return { t, signed, dist: dd }
}

export function nearestWall(walls: Wall[], p: Vec2, maxDist: number): WallHit | null {
  let best: WallHit | null = null
  for (const w of walls) {
    if (wallLength(w) < 1) continue
    const r = projectOnWall(w, p)
    if (r.dist <= maxDist && (!best || r.dist < best.dist)) best = { wall: w, ...r }
  }
  return best
}

export function boundsOf(points: Vec2[]): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (!points.length) return null
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity
  for (const p of points) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  return { minX, minY, maxX, maxY }
}

export interface CableLengths {
  total: number
  horizontal: number
  vertical: number
}

/** Länge einer 3D-Leitung in mm (inkl. senkrechter Abschnitte). */
export function cableLengths(points: CableNode[]): CableLengths {
  let horizontal = 0
  let vertical = 0
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    horizontal += Math.hypot(b.x - a.x, b.y - a.y)
    vertical += Math.abs(b.z - a.z)
  }
  return { total: horizontal + vertical, horizontal, vertical }
}
