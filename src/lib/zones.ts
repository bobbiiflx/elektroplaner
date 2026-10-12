import type { Cable, Floor, Opening, Wall, ZoneSettings } from '../types'
import { dist, projectOnWall, wallLength } from './geom'

export interface ZoneBand {
  id: string
  label: string
  center: number // mm über OKFF
}

export function horizontalBands(zones: ZoneSettings, wallHeight: number): ZoneBand[] {
  return zones.horizontal.map((z) => ({
    id: z.id,
    label: z.label,
    center: z.ref === 'floor' ? z.center : wallHeight - z.center,
  }))
}

function inHorizontalZone(z: number, zones: ZoneSettings, wallHeight: number): ZoneBand | null {
  const half = zones.width / 2
  for (const b of horizontalBands(zones, wallHeight)) {
    if (Math.abs(z - b.center) <= half) return b
  }
  return null
}

export interface DeviceZoneCheck {
  ok: boolean
  band?: ZoneBand
  nearest?: ZoneBand
  delta?: number // Abstand zur nächsten Zonenmitte
}

export function checkDevice(heightMm: number, zones: ZoneSettings, wallHeight: number): DeviceZoneCheck {
  const band = inHorizontalZone(heightMm, zones, wallHeight)
  if (band) return { ok: true, band }
  let nearest: ZoneBand | undefined
  let delta = Infinity
  for (const b of horizontalBands(zones, wallHeight)) {
    const d = Math.abs(heightMm - b.center)
    if (d < delta) {
      delta = d
      nearest = b
    }
  }
  return { ok: false, nearest, delta }
}

/** Spannen (Abstand vom Wandanfang) der senkrechten Zonen entlang einer Wand: an Wandenden und neben Öffnungen. */
export function verticalSpans(wall: Wall, openings: Opening[], zones: ZoneSettings): Array<[number, number]> {
  const L = wallLength(wall)
  const o = zones.verticalOffset
  const w = zones.verticalWidth
  const half = wall.thickness / 2
  const spans: Array<[number, number]> = []
  // Wandenden (Innenkante ≈ Mittellinie ± halbe Dicke)
  spans.push([half + o, half + o + w])
  spans.push([L - half - o - w, L - half - o])
  for (const op of openings.filter((x) => x.wallId === wall.id)) {
    spans.push([op.offset - o - w, op.offset - o])
    spans.push([op.offset + op.width + o, op.offset + op.width + o + w])
  }
  return spans.filter(([a, b]) => b > a && a >= 0 && b <= L)
}

export interface CableIssue {
  segment: number
  message: string
}

const NEAR_WALL = 80 // mm Toleranz zur Wandmittellinie plus halbe Dicke

/**
 * Prüfung nach DIN 18015-3 (Beta): waagerechte Abschnitte nur in waagerechten Zonen,
 * senkrechte Abschnitte nur in senkrechten Zonen oder direkt über/unter einem Gerät,
 * keine schrägen Abschnitte. Abschnitte in Decke (z ≥ Wandhöhe) und Fußboden (z ≤ 0)
 * gelten als Decken-/Fußbodenverlegung und werden nicht bewertet.
 */
export function checkCable(cable: Cable, floor: Floor, zones: ZoneSettings, wallHeightDefault: number): CableIssue[] {
  const issues: CableIssue[] = []
  const pts = cable.points
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const dxy = Math.hypot(b.x - a.x, b.y - a.y)
    const dz = Math.abs(b.z - a.z)
    const seg = i

    if (dxy > 1 && dz > 1) {
      issues.push({ segment: seg, message: 'Schräger Abschnitt – nur waagerecht oder senkrecht verlegen.' })
      continue
    }
    if (dxy <= 1 && dz <= 1) continue

    const wallH = floor.wallHeight || wallHeightDefault
    if (dxy > 1) {
      // waagerecht
      const z = a.z
      if (z >= wallH - 1 || z <= 1) continue // Decke / Fußboden
      const nearWall = nearestWallToPoint(floor.walls, a, b)
      if (!nearWall) continue // frei im Raum (z. B. Hohlraum) – nicht bewertet
      if (!inHorizontalZone(z, zones, wallH)) {
        issues.push({ segment: seg, message: `Waagerecht in ${Math.round(z)} mm Höhe – außerhalb der Installationszonen.` })
      }
    } else {
      // senkrecht
      const p = a
      const w = nearestWallToPoint(floor.walls, p, p)
      if (!w) continue
      const r = projectOnWall(w, p)
      const inZone = verticalSpans(w, floor.openings, zones).some(([s, e]) => r.t >= s - 1 && r.t <= e + 1)
      const atDevice = floor.devices.some((d) => {
        const dw = floor.walls.find((x) => x.id === d.wallId)
        if (!dw) return false
        const pr = projectOnWall(dw, p)
        return dw.id === w.id && Math.abs(pr.t - d.offset) <= zones.verticalWidth + 50 && pr.dist < dw.thickness / 2 + NEAR_WALL
      })
      const endpointDevice = [a, b].some((n) => {
        if (!n.deviceId) return false
        const d = floor.devices.find((x) => x.id === n.deviceId)
        return !!d && d.wallId === w.id
      })
      if (!inZone && !atDevice && !endpointDevice) {
        issues.push({ segment: seg, message: 'Senkrecht außerhalb der senkrechten Installationszonen.' })
      }
    }
  }
  return issues
}

function nearestWallToPoint(walls: Wall[], a: { x: number; y: number }, b: { x: number; y: number }): Wall | null {
  let best: Wall | null = null
  let bd = Infinity
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  for (const w of walls) {
    if (wallLength(w) < 1) continue
    const ra = projectOnWall(w, a)
    const rb = projectOnWall(w, b)
    const rm = projectOnWall(w, mid)
    const tol = w.thickness / 2 + NEAR_WALL
    if (ra.dist <= tol && rb.dist <= tol && rm.dist <= tol) {
      const d = ra.dist + rb.dist
      if (d < bd) {
        bd = d
        best = w
      }
    }
  }
  return best
}

export { dist }
