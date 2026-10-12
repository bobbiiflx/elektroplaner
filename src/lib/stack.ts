import type { Floor, Project, Vec2 } from '../types'
import { isRiser, planPoint } from './runs'

/** Verschiebt den gesamten Inhalt eines Geschosses (Wände, freie Geräte, Leitungen, Maße, Hintergrund, Passpunkt). */
export function translateFloor(f: Floor, dx: number, dy: number) {
  for (const w of f.walls) { w.a.x += dx; w.a.y += dy; w.b.x += dx; w.b.y += dy }
  for (const d of f.devices) if (d.x !== undefined && d.y !== undefined) { d.x += dx; d.y += dy }
  for (const c of f.cables) for (const p of c.points) { p.x += dx; p.y += dy }
  for (const m of f.dims ?? []) if (m.space === 'plan') { m.a.x += dx; m.a.y += dy; m.b.x += dx; m.b.y += dy }
  if (f.background) { f.background.x = (f.background.x ?? 0) + dx; f.background.y = (f.background.y ?? 0) + dy }
  if (f.anchor) { f.anchor.x += dx; f.anchor.y += dy }
}

/** Richtet alle Geschosse mit Passpunkt so aus, dass ihr Passpunkt auf dem des Bezugsgeschosses liegt. */
export function alignToReference(p: Project, refId: string): number {
  const ref = p.floors.find((f) => f.id === refId)
  if (!ref?.anchor) return 0
  let n = 0
  for (const f of p.floors) {
    if (f === ref || !f.anchor) continue
    const dx = ref.anchor.x - f.anchor.x, dy = ref.anchor.y - f.anchor.y
    if (dx || dy) { translateFloor(f, dx, dy); n++ }
  }
  return n
}

export interface StackIssue { text: string; floorId: string }

const TOL = 300 // mm: gleiche Durchführung
const NEAR = 1500 // mm: wahrscheinlich gemeint, aber versetzt

/** Prüft Steigpunkte / Deckendurchführungen über die Geschosse (Geschosse müssen ausgerichtet sein). */
export function riserChecks(project: Project): StackIssue[] {
  const pts: { fi: number; p: Vec2 }[] = []
  project.floors.forEach((f, fi) => {
    for (const d of f.devices) if (isRiser(d.typeId)) { const p = planPoint(f, d); if (p) pts.push({ fi, p }) }
  })
  const groups: { fi: number; p: Vec2 }[][] = []
  for (const r of pts) {
    const g = groups.find((g) => g.some((m) => m.fi !== r.fi && Math.hypot(m.p.x - r.p.x, m.p.y - r.p.y) <= TOL))
    if (g) g.push(r)
    else groups.push([r])
  }
  const out: StackIssue[] = []
  const name = (i: number) => project.floors[i].name
  const m = (v: number) => (v / 1000).toFixed(2).replace('.', ',')
  for (const g of groups) {
    const fis = g.map((x) => x.fi)
    const lo = Math.min(...fis), hi = Math.max(...fis)
    for (let i = lo + 1; i < hi; i++)
      if (!fis.includes(i)) out.push({ floorId: project.floors[i].id, text: `Durchführung bei x ${m(g[0].p.x)} m / y ${m(g[0].p.y)} m fehlt im ${name(i)}` })
    if (g.length === 1) {
      const r = g[0]
      for (const adj of [r.fi - 1, r.fi + 1]) {
        if (adj < 0 || adj >= project.floors.length) continue
        const near = pts.filter((q) => q.fi === adj && Math.hypot(q.p.x - r.p.x, q.p.y - r.p.y) > TOL && Math.hypot(q.p.x - r.p.x, q.p.y - r.p.y) <= NEAR)
        for (const q of near) {
          if (groups.some((gg) => gg !== g && gg.includes(q) && gg.some((mm) => mm.fi === r.fi))) continue
          if (adj > r.fi) out.push({ floorId: project.floors[adj].id, text: `Steigpunkt ${name(r.fi)} ↔ ${name(adj)} um ${Math.round(Math.hypot(q.p.x - r.p.x, q.p.y - r.p.y) / 10)} cm versetzt` })
        }
      }
    }
  }
  return out
}
