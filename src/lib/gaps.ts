import type { Vec2, Wall } from '../types'
import { dist, wallDir } from './geom'

export interface WallGap {
  a: Vec2 // Ende der ersten Wand
  b: Vec2 // Ende der zweiten Wand
  length: number
  thickness: number
  kind: Wall['kind']
  t: number // Position des Zeigers entlang der Lücke (mm ab a)
}

/** Distanz Punkt → Strecke der Wand (Mittellinie) */
function distToWall(w: Wall, p: Vec2): number {
  const dx = w.b.x - w.a.x, dy = w.b.y - w.a.y
  const l2 = dx * dx + dy * dy || 1
  const t = Math.max(0, Math.min(1, ((p.x - w.a.x) * dx + (p.y - w.a.y) * dy) / l2))
  return Math.hypot(p.x - (w.a.x + t * dx), p.y - (w.a.y + t * dy))
}

/**
 * Sucht eine Lücke zwischen zwei fluchtenden Wandenden, in der der Zeiger liegt.
 * Dort kann eine Tür/ein Fenster gesetzt werden – die Lücke wird dabei als Wand geschlossen.
 */
export function findGap(walls: Wall[], p: Vec2, opts: { minGap?: number; maxGap?: number; reach?: number } = {}): WallGap | null {
  const minGap = opts.minGap ?? 250
  const maxGap = opts.maxGap ?? 4000
  const reach = opts.reach ?? 450
  const ends: { w: Wall; pt: Vec2; out: Vec2 }[] = []
  for (const w of walls) {
    const d = wallDir(w)
    if (dist(w.a, w.b) < 1) continue
    ends.push({ w, pt: w.a, out: { x: -d.x, y: -d.y } })
    ends.push({ w, pt: w.b, out: d })
  }
  let best: { gap: WallGap; score: number } | null = null
  for (let i = 0; i < ends.length; i++) {
    for (let j = i + 1; j < ends.length; j++) {
      const e1 = ends[i], e2 = ends[j]
      if (e1.w === e2.w) continue
      const G = dist(e1.pt, e2.pt)
      if (G < minGap || G > maxGap) continue
      const v = { x: (e2.pt.x - e1.pt.x) / G, y: (e2.pt.y - e1.pt.y) / G }
      // beide Wände zeigen mit ihrem Ende auf die Lücke und fluchten
      if (e1.out.x * v.x + e1.out.y * v.y < 0.985) continue
      if (e2.out.x * -v.x + e2.out.y * -v.y < 0.985) continue
      const rx = p.x - e1.pt.x, ry = p.y - e1.pt.y
      const t = rx * v.x + ry * v.y
      const lat = Math.abs(-rx * v.y + ry * v.x)
      if (t < -100 || t > G + 100 || lat > reach) continue
      // Lücke darf nicht bereits durch eine andere Wand belegt sein
      const mid = { x: (e1.pt.x + e2.pt.x) / 2, y: (e1.pt.y + e2.pt.y) / 2 }
      if (walls.some((w) => w !== e1.w && w !== e2.w && distToWall(w, mid) < w.thickness / 2 + 20)) continue
      const thickness = Math.max(e1.w.thickness, e2.w.thickness)
      const kind = e1.w.thickness >= e2.w.thickness ? e1.w.kind : e2.w.kind
      if (!best || lat < best.score) best = { gap: { a: e1.pt, b: e2.pt, length: G, thickness, kind, t: Math.max(0, Math.min(G, t)) }, score: lat }
    }
  }
  return best?.gap ?? null
}
