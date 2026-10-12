import type { Floor, Vec2 } from '../types'
import { clamp, dist, pointOnWall, wallDir, wallLength } from './geom'

export type WallEnd = { id: string; end: 'a' | 'b' }

/** Alle Wandenden, die (fast) auf dem Punkt liegen – diese bilden eine gemeinsame Ecke. */
export function findJoined(f: Pick<Floor, 'walls'>, p: Vec2, tol = 1): WallEnd[] {
  const out: WallEnd[] = []
  for (const w of f.walls) {
    if (dist(w.a, p) <= tol) out.push({ id: w.id, end: 'a' })
    if (dist(w.b, p) <= tol) out.push({ id: w.id, end: 'b' })
  }
  return out
}

/** Verschiebt Wandenden (Arbeitskopie aus immer) und zieht angehängte Geräte/Leitungsknoten nach. */
export function moveEnds(f: Floor, ends: WallEnd[], to: Vec2) {
  const touched = new Set<string>()
  for (const e of ends) {
    const w = f.walls.find((x) => x.id === e.id)
    if (!w) continue
    w[e.end] = { x: to.x, y: to.y }
    touched.add(w.id)
  }
  for (const id of touched) syncWallDevices(f, id)
}

/** Setzt die Länge einer Wand, indem Ende b (samt gemeinsamer Ecke) verschoben wird. */
export function setWallLength(f: Floor, wallId: string, length: number) {
  const w = f.walls.find((x) => x.id === wallId)
  if (!w || length < 10) return
  const d = wallDir(w)
  const joined = findJoined(f, w.b)
  const to = { x: w.a.x + d.x * length, y: w.a.y + d.y * length }
  moveEnds(f, joined, to)
}

/** Geräte hängen per Abstand an der Wand; Leitungsknoten, die an Geräten hängen, folgen. */
export function syncWallDevices(f: Floor, wallId: string) {
  const w = f.walls.find((x) => x.id === wallId)
  if (!w) return
  const L = wallLength(w)
  for (const d of f.devices) {
    if (d.wallId !== wallId) continue
    d.offset = clamp(d.offset, 0, L)
    syncDeviceNodes(f, d.id)
  }
}

/** Leitungsknoten, die mit einem Gerät verbunden sind, auf die Geräteposition setzen. */
export function syncDeviceNodes(f: Floor, deviceId: string) {
  const dv = f.devices.find((d) => d.id === deviceId)
  if (!dv) return
  const w = f.walls.find((x) => x.id === dv.wallId)
  // Wandgeräte folgen der Wand, frei montierte Geräte (Decke/Boden) liegen auf x/y
  const pos = w ? pointOnWall(w, dv.offset) : dv.x !== undefined && dv.y !== undefined ? { x: dv.x, y: dv.y } : null
  if (!pos) return
  for (const c of f.cables) {
    for (let i = 0; i < c.points.length; i++) {
      const n = c.points[i]
      if (n.deviceId !== deviceId) continue
      const ox = n.x
      const oy = n.y
      n.x = pos.x
      n.y = pos.y
      n.z = dv.height
      // senkrechte Nachbarn (gleiche alte Lage) mitnehmen
      for (const dir of [-1, 1]) {
        let j = i + dir
        while (j >= 0 && j < c.points.length) {
          const m = c.points[j]
          if (Math.abs(m.x - ox) < 1 && Math.abs(m.y - oy) < 1 && !m.deviceId) {
            m.x = pos.x
            m.y = pos.y
            j += dir
          } else break
        }
      }
    }
  }
}
