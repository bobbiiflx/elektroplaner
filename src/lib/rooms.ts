import { deviceType } from '../config/catalog'
import { roomReq } from '../config/rooms'
import type { Floor, Project, Room, Vec2, Wall } from '../types'
import { boundsOf, pointOnWall, projectOnWall, wallLength } from './geom'
import { planPoint } from './runs'

const CELL = 50 // mm

export function polyArea(p: Vec2[]): number {
  let a = 0
  for (let i = 0; i < p.length; i++) {
    const q = p[(i + 1) % p.length]
    a += p[i].x * q.y - q.x * p[i].y
  }
  return Math.abs(a) / 2 / 1e6 // m²
}
export function polyCentroid(p: Vec2[]): Vec2 {
  let a = 0, cx = 0, cy = 0
  for (let i = 0; i < p.length; i++) {
    const q = p[(i + 1) % p.length]
    const c = p[i].x * q.y - q.x * p[i].y
    a += c
    cx += (p[i].x + q.x) * c
    cy += (p[i].y + q.y) * c
  }
  if (Math.abs(a) < 1e-6) return p[0] ?? { x: 0, y: 0 }
  return { x: cx / (3 * a), y: cy / (3 * a) }
}
function pointInPoly(p: Vec2[], q: Vec2): boolean {
  let inside = false
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    if (p[i].y > q.y !== p[j].y > q.y && q.x < ((p[j].x - p[i].x) * (q.y - p[i].y)) / (p[j].y - p[i].y) + p[i].x) inside = !inside
  }
  return inside
}
function distSeg(q: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x, dy = b.y - a.y
  const l2 = dx * dx + dy * dy
  const t = l2 ? Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / l2)) : 0
  return Math.hypot(q.x - (a.x + t * dx), q.y - (a.y + t * dy))
}
/** 0 innerhalb, sonst Abstand zum Umriss */
function distToPoly(p: Vec2[], q: Vec2): number {
  if (pointInPoly(p, q)) return 0
  let m = Infinity
  for (let i = 0; i < p.length; i++) m = Math.min(m, distSeg(q, p[i], p[(i + 1) % p.length]))
  return m
}

function rdpArr(pts: Vec2[], eps: number): Vec2[] {
  if (pts.length < 3) return pts
  let md = 0, mi = -1
  for (let i = 1; i < pts.length - 1; i++) {
    const d = distSeg(pts[i], pts[0], pts[pts.length - 1])
    if (d > md) { md = d; mi = i }
  }
  if (mi < 0 || md <= eps) return [pts[0], pts[pts.length - 1]]
  return [...rdpArr(pts.slice(0, mi + 1), eps).slice(0, -1), ...rdpArr(pts.slice(mi), eps)]
}
/** Ramer-Douglas-Peucker auf einem geschlossenen Ring */
function simplify(pts: Vec2[], eps: number): Vec2[] {
  if (pts.length < 4) return pts
  const half = Math.floor(pts.length / 2)
  const first = rdpArr(pts.slice(0, half + 1), eps)
  const second = rdpArr([...pts.slice(half), pts[0]], eps)
  return [...first.slice(0, -1), ...second.slice(0, -1)]
}

/** Raum um `seed` aus den Wänden bestimmen (Flutfüllung). null, wenn der Punkt in einer Wand liegt oder der Raum nicht geschlossen ist. */
export function detectRoom(floor: Floor, seed: Vec2, maxAreaM2 = 400): Vec2[] | null {
  const b = boundsOf(floor.walls.flatMap((w) => [w.a, w.b]))
  if (!b) return null
  const x0 = b.minX - 500, y0 = b.minY - 500
  const W = Math.ceil((b.maxX - b.minX + 1000) / CELL) + 1
  const H = Math.ceil((b.maxY - b.minY + 1000) / CELL) + 1
  if (W * H > 4_000_000) return null
  const wall = new Uint8Array(W * H)
  for (const w of floor.walls) {
    const r = w.thickness / 2
    const ax = Math.max(0, Math.floor((Math.min(w.a.x, w.b.x) - r - x0) / CELL) - 1)
    const bx = Math.min(W - 1, Math.ceil((Math.max(w.a.x, w.b.x) + r - x0) / CELL) + 1)
    const ay = Math.max(0, Math.floor((Math.min(w.a.y, w.b.y) - r - y0) / CELL) - 1)
    const by = Math.min(H - 1, Math.ceil((Math.max(w.a.y, w.b.y) + r - y0) / CELL) + 1)
    for (let y = ay; y <= by; y++)
      for (let x = ax; x <= bx; x++) {
        const c = { x: x0 + (x + 0.5) * CELL, y: y0 + (y + 0.5) * CELL }
        if (distSeg(c, w.a, w.b) <= r + CELL * 0.35) wall[y * W + x] = 1
      }
  }
  const sx = Math.floor((seed.x - x0) / CELL), sy = Math.floor((seed.y - y0) / CELL)
  if (sx < 0 || sy < 0 || sx >= W || sy >= H || wall[sy * W + sx]) return null
  const inR = new Uint8Array(W * H)
  const stack = [sy * W + sx]
  inR[sy * W + sx] = 1
  let count = 0
  while (stack.length) {
    const i = stack.pop()!
    const x = i % W, y = (i / W) | 0
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1) return null // läuft nach außen: nicht geschlossen
    if (++count * CELL * CELL > maxAreaM2 * 1e6) return null
    for (const j of [i - 1, i + 1, i - W, i + W]) if (!wall[j] && !inR[j]) { inR[j] = 1; stack.push(j) }
  }
  // Randkanten einsammeln (Zelle innen links der Kante)
  const next = new Map<string, [number, number][]>()
  const key = (x: number, y: number) => x + ',' + y
  const addE = (ax: number, ay: number, bx: number, by: number) => {
    const k = key(ax, ay)
    const l = next.get(k) ?? []
    l.push([bx, by])
    next.set(k, l)
  }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!inR[y * W + x]) continue
      if (y === 0 || !inR[(y - 1) * W + x]) addE(x, y, x + 1, y)
      if (x === W - 1 || !inR[y * W + x + 1]) addE(x + 1, y, x + 1, y + 1)
      if (y === H - 1 || !inR[(y + 1) * W + x]) addE(x + 1, y + 1, x, y + 1)
      if (x === 0 || !inR[y * W + x - 1]) addE(x, y + 1, x, y)
    }
  // längste Schleife
  let best: [number, number][] = []
  const used = new Set<string>()
  for (const [k0, outs] of next) {
    for (const o of outs) {
      const id0 = k0 + '>' + o[0] + ',' + o[1]
      if (used.has(id0)) continue
      const loop: [number, number][] = []
      let [cx, cy] = k0.split(',').map(Number)
      let nx = o[0], ny = o[1]
      for (let guard = 0; guard < 2_000_000; guard++) {
        used.add(key(cx, cy) + '>' + nx + ',' + ny)
        loop.push([cx, cy])
        cx = nx
        cy = ny
        const cand = (next.get(key(cx, cy)) ?? []).filter((t) => !used.has(key(cx, cy) + '>' + t[0] + ',' + t[1]))
        if (!cand.length) break
        ;[nx, ny] = cand[0]
        if (key(cx, cy) === k0 && nx === o[0] && ny === o[1]) break
      }
      if (loop.length > best.length) best = loop
    }
  }
  if (best.length < 4) return null
  const poly = simplify(best.map(([x, y]) => ({ x: x0 + x * CELL, y: y0 + y * CELL })), CELL * 0.9)
  return poly.length >= 3 ? poly.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })) : null
}

// --- Ausstattung -------------------------------------------------------------
export interface RoomStats {
  sockets: number
  lights: number
  switches: number
}
const SOCKET_TOL = 400 // mm: Geräte an der Wandfläche gehören zum nächstgelegenen Raum

/** Geräte je Raum: nächster Raum (Abstand ≤ Toleranz) */
export function roomOfDevice(floor: Floor, p: Vec2): Room | null {
  let best: Room | null = null
  let bd = SOCKET_TOL
  let bestArea = Infinity
  for (const r of floor.rooms ?? []) {
    const d = distToPoly(r.poly, p)
    const area = polyArea(r.poly)
    // innerhalb mehrerer Räume (z. B. offene Küche im Wohnraum): der kleinste, also speziellste Raum gewinnt
    if (d < bd || (d === 0 && (bd > 0 || area < bestArea))) {
      bd = d
      bestArea = area
      best = r
    }
  }
  return best
}

export function roomStats(floor: Floor, room: Room): RoomStats {
  const s: RoomStats = { sockets: 0, lights: 0, switches: 0 }
  for (const d of floor.devices) {
    const p = planPoint(floor, d)
    if (!p || roomOfDevice(floor, p)?.id !== room.id) continue
    const dt = deviceType(d.typeId)
    if (dt.category === 'power' && d.typeId !== 'sd-herd') s.sockets += dt.gangs ?? 1
    else if (dt.category === 'light') s.lights++
    else if (dt.category === 'switch' || (dt.category === 'knx' && dt.id.startsWith('knx-') && /Taster/.test(dt.name))) s.switches++
  }
  return s
}

export interface WallSeg {
  label: string
  u0: number // Abstand vom Wandanfang
  u1: number
}

/**
 * Abschnitte einer Wand, die an einen Raum der angegebenen Seite grenzen (Raumausschnitt für die Wandansicht).
 * Festgelegte Räume werden verwendet, sonst wird der Raum an der Wand automatisch erkannt.
 */
export function wallSegments(floor: Floor, wall: Wall, side: 1 | -1): WallSeg[] {
  const L = wallLength(wall)
  const polys: { name: string; poly: Vec2[] }[] = (floor.rooms ?? []).map((r) => ({ name: r.name, poly: r.poly }))
  let auto = 0
  for (let t = 150, n = 0; t < L - 100 && n < 30; t += 400, n++) {
    const seed = pointOnWall(wall, t, side, wall.thickness / 2 + 150)
    if (polys.some((p) => pointInPoly(p.poly, seed))) continue
    const poly = detectRoom(floor, seed)
    if (poly) polys.push({ name: `Raum ${++auto}`, poly })
  }
  const segs: WallSeg[] = []
  const face = (side * wall.thickness) / 2
  for (const { name, poly } of polys) {
    let u0 = Infinity
    let u1 = -Infinity
    for (let i = 0; i < poly.length; i++) {
      const a = projectOnWall(wall, poly[i])
      const b = projectOnWall(wall, poly[(i + 1) % poly.length])
      if (Math.abs(a.signed - face) > 100 || Math.abs(b.signed - face) > 100) continue
      u0 = Math.min(u0, a.t, b.t)
      u1 = Math.max(u1, a.t, b.t)
    }
    if (u1 - u0 > 200) segs.push({ label: name, u0, u1 })
  }
  return segs.sort((x, y) => x.u0 - y.u0)
}

export interface RoomIssue { roomId: string; floorId: string; text: string }
export function roomIssues(project: Project): RoomIssue[] {
  const out: RoomIssue[] = []
  for (const f of project.floors)
    for (const r of f.rooms ?? []) {
      const req = roomReq(project, r.type)
      const st = roomStats(f, r)
      const nm = `${f.name} · ${r.name}`
      if (st.sockets < req.sockets) out.push({ roomId: r.id, floorId: f.id, text: `${nm}: ${st.sockets} von ${req.sockets} Steckdosen` })
      if (st.lights < req.lights) out.push({ roomId: r.id, floorId: f.id, text: `${nm}: ${st.lights} von ${req.lights} Lichtauslässen` })
      if (st.lights > 0 && st.switches === 0) out.push({ roomId: r.id, floorId: f.id, text: `${nm}: Licht ohne Schalter/Taster` })
    }
  return out
}
