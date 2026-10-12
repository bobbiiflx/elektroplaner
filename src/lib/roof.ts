import type { Floor, OrientedRect, RoofPlane, Skylight, Vec2, Wall } from '../types'
import { wallLength } from './geom'

const rad = (d: number) => (d * Math.PI) / 180
const TOL = 60 // mm Toleranz am Rand der Ebene (Wandenden)

export function roofLength(r: RoofPlane): number {
  return Math.hypot(r.b.x - r.a.x, r.b.y - r.a.y)
}
/** Einheitsvektor entlang der Linie und Normale zur Anstiegsseite */
export function roofAxes(r: RoofPlane): { u: Vec2; n: Vec2; L: number } {
  const L = roofLength(r) || 1
  const u = { x: (r.b.x - r.a.x) / L, y: (r.b.y - r.a.y) / L }
  return { u, n: { x: -u.y * r.side, y: u.x * r.side }, L }
}

/** Höhe der Ebene über OKFF an Punkt p; null, wenn p nicht im Wirkungsbereich liegt (Seite ohne Anstieg oder neben der Linie). */
export function planeHeightAt(r: RoofPlane, p: Vec2): number | null {
  const { u, n, L } = roofAxes(r)
  if (L < 1) return null
  const rx = p.x - r.a.x, ry = p.y - r.a.y
  const along = rx * u.x + ry * u.y
  const d = rx * n.x + ry * n.y
  if (along < -TOL || along > L + TOL || d < -TOL) return null
  return r.knee + Math.tan(rad(r.angle)) * Math.max(0, d)
}

/** Raum-/Wandhöhe an Punkt p unter Berücksichtigung aller Dachschrägen (Obergrenze: cap). */
export function roofHeightAt(floor: Floor, p: Vec2, cap = floor.wallHeight): number {
  let h = cap
  for (const r of floor.roofs ?? []) {
    const v = planeHeightAt(r, p)
    if (v !== null && v < h) h = v
  }
  // Gauben heben die Schräge im Rechteck auf ihre lichte Höhe an
  for (const d of floor.dormers ?? []) if (inRect(d, p, TOL)) {
    const v = dormerHeightAt(d, p)
    if (v > h) h = Math.min(cap, v)
  }
  return Math.max(0, h)
}

/** Höhe der Gaubendecke an Punkt p: Flachdachgaube = konstant, Schleppgaube fällt von der Front nach hinten. */
export function dormerHeightAt(d: { a: Vec2; b: Vec2; side: 1 | -1; height: number; slope?: number }, p: Vec2): number {
  if (!d.slope) return d.height
  const L = Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y) || 1
  const nx = (-(d.b.y - d.a.y) / L) * d.side, ny = ((d.b.x - d.a.x) / L) * d.side
  const t = Math.max(0, (p.x - d.a.x) * nx + (p.y - d.a.y) * ny)
  return d.height - Math.tan(rad(d.slope)) * t
}

// --- Rechtecke (Gaube, Loggia) -------------------------------------------
export function rectAxes(r: OrientedRect): { u: Vec2; n: Vec2; L: number } {
  const L = Math.hypot(r.b.x - r.a.x, r.b.y - r.a.y) || 1
  const u = { x: (r.b.x - r.a.x) / L, y: (r.b.y - r.a.y) / L }
  return { u, n: { x: -u.y * r.side, y: u.x * r.side }, L }
}
export function rectCorners(r: OrientedRect): Vec2[] {
  const { n } = rectAxes(r)
  return [r.a, r.b, { x: r.b.x + n.x * r.depth, y: r.b.y + n.y * r.depth }, { x: r.a.x + n.x * r.depth, y: r.a.y + n.y * r.depth }]
}
export function inRect(r: OrientedRect, p: Vec2, tol = 0): boolean {
  const { u, n, L } = rectAxes(r)
  const rx = p.x - r.a.x, ry = p.y - r.a.y
  const along = rx * u.x + ry * u.y
  const d = rx * n.x + ry * n.y
  return along >= -tol && along <= L + tol && d >= -tol && d <= r.depth + tol
}
export const rectArea = (r: OrientedRect) => (rectAxes(r).L * r.depth) / 1e6 // m²
export const rectWidth = (r: OrientedRect) => rectAxes(r).L

export const hasRoof = (floor: Floor) => (floor.roofs?.length ?? 0) > 0 || (floor.dormers?.length ?? 0) > 0

export interface ProfilePt { u: number; h: number }

/** Oberkante der Wand (Höhe über OKFF) entlang der Wand, u = Abstand ab Wandanfang. */
export function wallProfile(floor: Floor, wall: Wall): ProfilePt[] {
  const L = wallLength(wall)
  const cap = wall.height ?? floor.wallHeight
  if (!hasRoof(floor) || L < 1) return [{ u: 0, h: cap }, { u: L, h: cap }]
  const dx = (wall.b.x - wall.a.x) / L, dy = (wall.b.y - wall.a.y) / L
  const n = Math.max(2, Math.ceil(L / 40))
  const raw: ProfilePt[] = []
  for (let i = 0; i <= n; i++) {
    const u = (L * i) / n
    raw.push({ u, h: roofHeightAt(floor, { x: wall.a.x + dx * u, y: wall.a.y + dy * u }, cap) })
  }
  // fast gerade Punkte entfernen
  const out: ProfilePt[] = [raw[0]]
  for (let i = 1; i < raw.length - 1; i++) {
    const a = out[out.length - 1], b = raw[i], c = raw[i + 1]
    const t = (b.u - a.u) / (c.u - a.u)
    if (Math.abs(a.h + (c.h - a.h) * t - b.h) > 3) out.push(b)
  }
  out.push(raw[raw.length - 1])
  return out
}

/** Wandhöhe an Stelle u (lineare Interpolation im Profil). */
export function profileAt(profile: ProfilePt[], u: number): number {
  if (u <= profile[0].u) return profile[0].h
  for (let i = 1; i < profile.length; i++) {
    if (u <= profile[i].u) {
      const a = profile[i - 1], b = profile[i]
      return b.u === a.u ? b.h : a.h + ((b.h - a.h) * (u - a.u)) / (b.u - a.u)
    }
  }
  return profile[profile.length - 1].h
}

/** Kleinste Wandhöhe im Bereich u0..u1 */
export function minProfile(profile: ProfilePt[], u0: number, u1: number): number {
  let m = Math.min(profileAt(profile, u0), profileAt(profile, u1))
  for (const p of profile) if (p.u > u0 && p.u < u1) m = Math.min(m, p.h)
  return m
}

/** Höhenlinie der Ebene (z. B. 1 m / 2 m über OKFF) als Strecke im Grundriss; null, wenn die Höhe nicht innerhalb der Schräge liegt. */
export function roofContour(r: RoofPlane, height: number, cap: number): { a: Vec2; b: Vec2; dist: number } | null {
  const t = Math.tan(rad(r.angle))
  if (t < 0.01 || height <= r.knee || height > cap) return null
  const dd = (height - r.knee) / t
  const { n } = roofAxes(r)
  return { a: { x: r.a.x + n.x * dd, y: r.a.y + n.y * dd }, b: { x: r.b.x + n.x * dd, y: r.b.y + n.y * dd }, dist: dd }
}

export interface RoofIssue { kind: 'device' | 'cable'; id: string; text: string }

/** Geräte und Leitungspunkte, die über der Dachschräge liegen (dort ist keine Wand). */
export function roofIssues(floor: Floor): RoofIssue[] {
  if (!hasRoof(floor)) return []
  const out: RoofIssue[] = []
  for (const d of floor.devices) {
    const w = floor.walls.find((x) => x.id === d.wallId)
    let allowed: number
    if (w) {
      const L = wallLength(w)
      const f = L > 0 ? d.offset / L : 0
      allowed = roofHeightAt(floor, { x: w.a.x + (w.b.x - w.a.x) * f, y: w.a.y + (w.b.y - w.a.y) * f }, w.height ?? floor.wallHeight)
    } else if (d.x !== undefined && d.y !== undefined) allowed = roofHeightAt(floor, { x: d.x, y: d.y })
    else continue
    if (d.height > allowed - 20) out.push({ kind: 'device', id: d.id, text: `Gerät auf ${Math.round(d.height / 10)} cm, Wand/Decke dort nur ${Math.round(allowed / 10)} cm hoch` })
  }
  for (const c of floor.cables) {
    const bad = c.points.find((pt) => pt.z > roofHeightAt(floor, { x: pt.x, y: pt.y }) + 20)
    if (bad) out.push({ kind: 'cable', id: c.id, text: `Leitungspunkt auf ${Math.round(bad.z / 10)} cm liegt über der Dachschräge` })
  }
  return out
}

export interface LoggiaNote { id: string; text: string }
/** Geräte in einer Loggia (Außenbereich): IP-Schutz und RCD nötig. */
export function loggiaNotes(floor: Floor): LoggiaNote[] {
  const out: LoggiaNote[] = []
  if (!(floor.loggias?.length)) return out
  for (const d of floor.devices) {
    let p: Vec2 | null = null
    const w = floor.walls.find((x) => x.id === d.wallId)
    if (w) {
      const L = wallLength(w) || 1
      const f = d.offset / L
      p = { x: w.a.x + (w.b.x - w.a.x) * f, y: w.a.y + (w.b.y - w.a.y) * f }
    } else if (d.x !== undefined && d.y !== undefined) p = { x: d.x, y: d.y }
    if (p && floor.loggias.some((l) => inRect(l, p!, 150))) out.push({ id: d.id, text: 'in der Loggia: Außenbereich – spritzwassergeschützt (mind. IP44), Stromkreis mit RCD 30 mA' })
  }
  return out
}

// --- Dachflächenfenster -------------------------------------------------------
/** Eckpunkte im Grundriss (Traufseite a, b; Firstseite c, d) und Höhen über OKFF auf der Dachebene. */
export function skylightGeometry(floor: Floor, s: Skylight): { pts: Vec2[]; hs: number[] } | null {
  const r = (floor.roofs ?? []).find((x) => x.id === s.roofId)
  if (!r) return null
  const { u, n } = roofAxes(r)
  const dep = (s.h * Math.cos(rad(r.angle))) / 2
  const hw = s.w / 2
  const P = (du: number, dn: number): Vec2 => ({ x: s.c.x + u.x * du + n.x * dn, y: s.c.y + u.y * du + n.y * dn })
  const pts = [P(-hw, -dep), P(hw, -dep), P(hw, dep), P(-hw, dep)]
  const hs = pts.map((p) => planeHeightAt(r, p) ?? r.knee)
  return { pts, hs }
}
/** Dachebene unter Punkt p (niedrigste, auf der p im Anstieg liegt). */
export function roofPlaneAt(floor: Floor, p: Vec2): RoofPlane | null {
  let best: RoofPlane | null = null
  let bh = Infinity
  for (const r of floor.roofs ?? []) {
    const v = planeHeightAt(r, p)
    if (v !== null && v < bh && v < floor.wallHeight) {
      bh = v
      best = r
    }
  }
  return best
}
