import type { CableNode, Vec2, Wall } from '../types'
import { wallDir } from './geom'

const EPS = 1 // mm

/** Verläuft die Richtung (dx, dy) parallel zu einer Wand (≈ 1°)? Dann ist sie in der Wandansicht „waagerecht“. */
function parallelToWall(dx: number, dy: number, walls: Wall[]): boolean {
  const len = Math.hypot(dx, dy)
  if (len < EPS) return true
  for (const w of walls) {
    if (Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) < 1) continue
    const d = wallDir(w)
    if (Math.abs(dx * d.y - dy * d.x) / len < 0.02) return true
  }
  return false
}

/**
 * Knoten, die an `last` angehängt werden müssen, damit eine Leitung nur waagerecht (achsparallel bzw. wandparallel)
 * oder senkrecht verläuft. Der letzte zurückgegebene Knoten ist immer `target` (mit deviceId, falls vorhanden).
 * Reihenfolge: erst waagerecht (bei Bedarf mit rechtwinkligem Knick), dann senkrecht – so landet die Leitung
 * von oben/unten in der Dose.
 */
export function routeTo(last: CableNode, target: CableNode, walls: Wall[]): CableNode[] {
  const out: CableNode[] = []
  let cur: CableNode = { x: last.x, y: last.y, z: last.z }
  const dx = target.x - cur.x
  const dy = target.y - cur.y

  if (Math.hypot(dx, dy) > EPS) {
    const axis = Math.abs(dx) < EPS || Math.abs(dy) < EPS
    if (!axis && !parallelToWall(dx, dy, walls)) {
      const corner: Vec2 = Math.abs(dx) >= Math.abs(dy) ? { x: target.x, y: cur.y } : { x: cur.x, y: target.y }
      cur = { x: corner.x, y: corner.y, z: cur.z }
      out.push(cur)
    }
    if (Math.hypot(target.x - cur.x, target.y - cur.y) > EPS) {
      cur = { x: target.x, y: target.y, z: cur.z }
      out.push(cur)
    }
  }
  if (Math.abs(cur.z - target.z) > EPS) out.push({ ...target })

  if (out.length) {
    const tail = out[out.length - 1]
    if (Math.hypot(tail.x - target.x, tail.y - target.y) <= EPS && Math.abs(tail.z - target.z) <= EPS) out[out.length - 1] = { ...target }
  }
  return out
}

/** Hat die Leitung nur waagerechte/senkrechte Abschnitte? (Hilfsfunktion für Tests) */
export function isOrthogonal(points: CableNode[], walls: Wall[]): boolean {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const dxy = Math.hypot(b.x - a.x, b.y - a.y)
    const dz = Math.abs(b.z - a.z)
    if (dxy > EPS && dz > EPS) return false
    if (dxy > EPS && !(Math.abs(b.x - a.x) < EPS || Math.abs(b.y - a.y) < EPS || parallelToWall(b.x - a.x, b.y - a.y, walls))) return false
  }
  return true
}
