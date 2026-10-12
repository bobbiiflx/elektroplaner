import { deviceType, electricDefaults, kindOf } from '../config/catalog'
import { roomReq } from '../config/rooms'
import type { Characteristic, Device, Floor, Phase, Project, Room, Vec2 } from '../types'
import { dist, pointOnWall, projectOnWall, wallLength, wallNormal } from './geom'
import { planPoint } from './runs'
import { polyCentroid, roomOfDevice, roomStats } from './rooms'

// ---------------------------------------------------------------------------
// 1) Stromkreis-Vorschlag: noch nicht zugeordnete Lasten/Leuchten je Raum bündeln
// ---------------------------------------------------------------------------

/** Richtwert: höchstens so viele Steckdosen bzw. Lichtauslässe je Stromkreis. */
export const MAX_PER_CIRCUIT = 10
/** Höchstens so viele Stromkreise je FI/RCD-Gruppe. */
export const MAX_CIRCUITS_PER_RCD = 6
/** Ab dieser Leistung bekommt ein Gerät einen eigenen Stromkreis. */
const OWN_CIRCUIT_W = 2000
/** Räume, deren Steckdosen einen eigenen Kreis bekommen. */
const OWN_ROOMS = new Set(['kitchen', 'bath', 'utility'])

export interface ProposedCircuit {
  name: string
  rating: number
  charac: Characteristic
  phase: Phase
  rcd: string
  deviceIds: string[]
}

interface Item {
  device: Device
  floor: Floor
  room: Room | null
}

export function suggestCircuits(project: Project): ProposedCircuit[] {
  const items: Item[] = []
  for (const f of project.floors)
    for (const d of f.devices) {
      const k = kindOf(deviceType(d.typeId))
      if ((k !== 'load' && k !== 'light') || d.circuitId) continue
      const p = planPoint(f, d)
      items.push({ device: d, floor: f, room: p ? roomOfDevice(f, p) : null })
    }

  const out: ProposedCircuit[] = []
  const rest: Item[] = []
  // 1. Großverbraucher einzeln (Herd 3-phasig)
  for (const it of items) {
    const dt = deviceType(it.device.typeId)
    const w = it.device.powerW ?? dt.defaultPowerW ?? 0
    if (it.device.typeId === 'sd-herd') {
      out.push({ name: `Herd · ${it.floor.name}`, rating: 16, charac: 'B', phase: '3L', rcd: '', deviceIds: [it.device.id] })
    } else if (w >= OWN_CIRCUIT_W) {
      out.push({ name: `${dt.name} · ${it.floor.name}`, rating: 16, charac: 'B', phase: 'L1', rcd: '', deviceIds: [it.device.id] })
    } else rest.push(it)
  }

  // 2. Rest: je Geschoss Licht und Steckdosen getrennt; Küche/Bad/HWR eigene Steckdosenkreise
  const floors = project.floors.filter((f) => rest.some((i) => i.floor.id === f.id))
  for (const f of floors) {
    const mine = rest.filter((i) => i.floor.id === f.id)
    const lights = mine.filter((i) => kindOf(deviceType(i.device.typeId)) === 'light')
    const sockets = mine.filter((i) => kindOf(deviceType(i.device.typeId)) === 'load')

    const byRoom = new Map<string, Item[]>()
    const common: Item[] = []
    for (const it of sockets) {
      if (it.room && (it.room.ownCircuit ?? OWN_ROOMS.has(it.room.type))) {
        const arr = byRoom.get(it.room.id) ?? []
        arr.push(it)
        byRoom.set(it.room.id, arr)
      } else common.push(it)
    }
    for (const [rid, arr] of byRoom) {
      const room = f.rooms?.find((r) => r.id === rid)
      chunk(arr, MAX_PER_CIRCUIT).forEach((c, i, all) =>
        out.push({ name: `Steckdosen ${room?.name ?? ''}${all.length > 1 ? ' ' + (i + 1) : ''} · ${f.name}`.replace(/\s+/g, ' '), rating: 16, charac: 'B', phase: 'L1', rcd: '', deviceIds: c.map((x) => x.device.id) }),
      )
    }
    // übrige Steckdosen räumlich nach Raum sortiert bündeln
    const sorted = (xs: Item[]) => [...xs].sort((a, b) => (a.room?.name ?? '~').localeCompare(b.room?.name ?? '~'))
    chunk(sorted(common), MAX_PER_CIRCUIT).forEach((c, i, all) =>
      out.push({ name: `Steckdosen ${f.name}${all.length > 1 ? ' ' + (i + 1) : ''}`, rating: 16, charac: 'B', phase: 'L1', rcd: '', deviceIds: c.map((x) => x.device.id) }),
    )
    chunk(sorted(lights), MAX_PER_CIRCUIT).forEach((c, i, all) =>
      out.push({ name: `Licht ${f.name}${all.length > 1 ? ' ' + (i + 1) : ''}`, rating: 10, charac: 'B', phase: 'L1', rcd: '', deviceIds: c.map((x) => x.device.id) }),
    )
  }
  return out
}

function chunk<T>(xs: T[], n: number): T[][] {
  if (!xs.length) return []
  const parts = Math.ceil(xs.length / n)
  const size = Math.ceil(xs.length / parts) // gleichmäßig verteilen
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size))
  return out
}

/** Nummer der höchsten vorhandenen „FI n“-Gruppe. */
function maxRcdNo(project: Project): number {
  let m = 0
  for (const c of project.circuits ?? []) {
    const n = /FI\s*(\d+)/i.exec(c.rcd)
    if (n) m = Math.max(m, +n[1])
  }
  return m
}

/** Ergänzt Phasen (gleichmäßig auf L1–L3) und FI-Gruppen (30 mA, höchstens 6 Kreise je FI). */
export function finishProposal(project: Project, list: ProposedCircuit[]): ProposedCircuit[] {
  const existing = project.circuits ?? []
  const load = { L1: 0, L2: 0, L3: 0 }
  for (const c of existing) if (c.phase !== '3L') load[c.phase]++
  let fi = maxRcdNo(project)
  let inGroup = MAX_CIRCUITS_PER_RCD // erzwingt neue Gruppe beim ersten Kreis
  return list.map((c) => {
    let phase = c.phase
    if (phase !== '3L') {
      phase = (Object.keys(load) as ('L1' | 'L2' | 'L3')[]).sort((a, b) => load[a] - load[b])[0]
      load[phase]++
    }
    if (inGroup >= MAX_CIRCUITS_PER_RCD) {
      fi++
      inGroup = 0
    }
    inGroup++
    return { ...c, phase, rcd: `FI ${fi} · 30 mA` }
  })
}

// ---------------------------------------------------------------------------
// 2) Fehlende Ausstattung je Raum ergänzen
// ---------------------------------------------------------------------------

export interface NewDevice {
  floorId: string
  device: Device
}

/** Plant Geräte, die dem Soll des Raums noch fehlen (Steckdosen, Lichtauslässe, Schalter). */
export function missingDevices(project: Project, floor: Floor, room: Room, uid: () => string): NewDevice[] {
  const req = roomReq(project, room.type)
  const st = roomStats(floor, room)
  const out: NewDevice[] = []
  const mk = (typeId: string, extra: Partial<Device>): Device => {
    const dt = deviceType(typeId)
    return { id: uid(), typeId, wallId: '', offset: 0, side: 1, height: dt.defaultHeight, ...electricDefaults(dt), ...extra }
  }
  const poly = room.poly
  const c = polyCentroid(poly)
  const edges = poly
    .map((a, i) => ({ a, b: poly[(i + 1) % poly.length] }))
    .map((e) => ({ ...e, len: dist(e.a, e.b) }))
    .filter((e) => e.len >= 600)
    .sort((x, y) => y.len - x.len)

  // freie Stellen an den Wänden (Abstand zu Türen/Fenstern und bereits gesetzten Geräten)
  const taken: { wallId: string; t: number }[] = floor.devices.filter((d) => d.wallId).map((d) => ({ wallId: d.wallId, t: d.offset }))
  const spot = (e: { a: Vec2; b: Vec2; len: number }, frac: number, minGap = 350) => {
    const m = { x: e.a.x + (e.b.x - e.a.x) * frac, y: e.a.y + (e.b.y - e.a.y) * frac }
    let best: { wallId: string; t: number; side: 1 | -1; d: number } | null = null
    for (const w of floor.walls) {
      const pr = projectOnWall(w, m)
      if (pr.dist > w.thickness / 2 + 120) continue
      if (!best || pr.dist < best.d) best = { wallId: w.id, t: pr.t, side: (pr.signed >= 0 ? -1 : 1) as 1 | -1, d: pr.dist }
    }
    if (!best) return null
    const w = floor.walls.find((x) => x.id === best!.wallId)!
    // Seite = zum Raumschwerpunkt hin
    const n = wallNormal(w)
    const pt = pointOnWall(w, best.t)
    const side: 1 | -1 = (c.x - pt.x) * n.x + (c.y - pt.y) * n.y >= 0 ? 1 : -1
    const L = wallLength(w)
    for (const dt of [0, 150, -150, 300, -300, 450, -450]) {
      const t = Math.min(Math.max(best.t + dt, 150), L - 150)
      const inOpening = floor.openings.some((o) => o.wallId === w.id && t > o.offset - 150 && t < o.offset + o.width + 150)
      const near = taken.some((x) => x.wallId === w.id && Math.abs(x.t - t) < minGap)
      if (!inOpening && !near) {
        taken.push({ wallId: w.id, t })
        return { wallId: w.id, offset: t, side }
      }
    }
    return null
  }

  let ei = 0
  const nextEdge = () => (edges.length ? edges[ei++ % edges.length] : null)
  const place = (typeId: string, frac: number) => {
    for (let tries = 0; tries < Math.max(edges.length, 1); tries++) {
      const e = nextEdge()
      if (!e) return
      const s = spot(e, frac)
      if (s) {
        out.push({ floorId: floor.id, device: mk(typeId, s) })
        return
      }
    }
  }

  let needS = Math.max(0, req.sockets - st.sockets)
  // gleichmäßig verteilt: zuerst 2-fach, Rest 1-fach
  let k = 0
  while (needS > 0) {
    const two = needS >= 2
    place(two ? 'sd-2' : 'sd-1', [0.3, 0.7, 0.5][k++ % 3])
    needS -= two ? 2 : 1
  }

  const needL = Math.max(0, req.lights - st.lights)
  for (let i = 0; i < needL; i++) {
    const off = needL > 1 ? (i - (needL - 1) / 2) * 900 : 0
    const ext = boundsOfPoly(poly)
    const horizontal = ext.w >= ext.h
    out.push({
      floorId: floor.id,
      device: mk('a-decke', { x: Math.round(c.x + (horizontal ? off : 0)), y: Math.round(c.y + (horizontal ? 0 : off)), height: floor.wallHeight }),
    })
  }

  const lightsAfter = st.lights + needL
  if (lightsAfter > 0 && st.switches === 0) {
    // Schalter neben der Tür des Raums, sonst an der längsten Kante
    let placed = false
    for (const o of floor.openings) {
      if (o.type !== 'door') continue
      const w = floor.walls.find((x) => x.id === o.wallId)
      if (!w) continue
      const mid = pointOnWall(w, o.offset + o.width / 2)
      if (!inPoly(poly, mid, 400)) continue
      const n = wallNormal(w)
      const side: 1 | -1 = (c.x - mid.x) * n.x + (c.y - mid.y) * n.y >= 0 ? 1 : -1
      const L = wallLength(w)
      for (const t of [o.offset + o.width + 150, o.offset - 150]) {
        if (t < 100 || t > L - 100) continue
        if (floor.openings.some((q) => q.wallId === w.id && t > q.offset - 100 && t < q.offset + q.width + 100)) continue
        out.push({ floorId: floor.id, device: mk('sw-1', { wallId: w.id, offset: t, side }) })
        placed = true
        break
      }
      if (placed) break
    }
    if (!placed) place('sw-1', 0.15)
  }
  return out
}

function boundsOfPoly(p: Vec2[]) {
  const xs = p.map((q) => q.x)
  const ys = p.map((q) => q.y)
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
}

function inPoly(poly: Vec2[], q: Vec2, tol: number): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j]
    if (a.y > q.y !== b.y > q.y && q.x < ((b.x - a.x) * (q.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  if (inside) return true
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    const l = dist(a, b) || 1
    const t = Math.max(0, Math.min(1, ((q.x - a.x) * (b.x - a.x) + (q.y - a.y) * (b.y - a.y)) / (l * l)))
    if (dist(q, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }) <= tol) return true
  }
  return false
}
