import type { Cable, Device, Dormer, Floor, Loggia, Opening, RoofPlane, Skylight, Vec2, Wall } from '../types'
import { rectCorners } from './roof'
import { planPoint } from './runs'
import { uid } from './geom'

export type SelKind = 'wall' | 'opening' | 'device' | 'cable' | 'dim' | 'roof' | 'dormer' | 'loggia' | 'skylight'
export interface Sel {
  kind: SelKind
  id: string
}

export interface Clip {
  walls: Wall[]
  openings: Opening[]
  devices: Device[]
  cables: Cable[]
  roofs: RoofPlane[]
  dormers: Dormer[]
  loggias: Loggia[]
  skylights: Skylight[]
  from?: string // Quell-Geschoss
}

export interface Rect {
  x0: number
  y0: number
  x1: number
  y1: number
}

const inside = (r: Rect, p: Vec2) => p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1
const clone = <T,>(o: T): T => JSON.parse(JSON.stringify(o)) as T

/** Alles, was vollständig im Rechteck liegt (Wände mit beiden Enden, Leitungen mit allen Punkten, Geräte mit ihrer Position). */
export function selectInRect(floor: Floor, r: Rect): Sel[] {
  const out: Sel[] = []
  const wallIds = new Set<string>()
  for (const w of floor.walls) if (inside(r, w.a) && inside(r, w.b)) { out.push({ kind: 'wall', id: w.id }); wallIds.add(w.id) }
  for (const o of floor.openings) if (wallIds.has(o.wallId)) out.push({ kind: 'opening', id: o.id })
  for (const d of floor.devices) {
    const p = planPoint(floor, d)
    if (p && inside(r, p)) out.push({ kind: 'device', id: d.id })
  }
  for (const c of floor.cables) if (c.points.length && c.points.every((q) => inside(r, q))) out.push({ kind: 'cable', id: c.id })
  for (const x of floor.roofs ?? []) if (inside(r, x.a) && inside(r, x.b)) out.push({ kind: 'roof', id: x.id })
  for (const x of floor.dormers ?? []) if (rectCorners(x).every((q) => inside(r, q))) out.push({ kind: 'dormer', id: x.id })
  for (const x of floor.loggias ?? []) if (rectCorners(x).every((q) => inside(r, q))) out.push({ kind: 'loggia', id: x.id })
  for (const x of floor.skylights ?? []) if (inside(r, x.c)) out.push({ kind: 'skylight', id: x.id })
  return out
}

/** Auswahl → Zwischenablage. Wände nehmen ihre Öffnungen und wandmontierten Geräte mit. */
export function collectClip(floor: Floor, sels: Sel[]): Clip {
  const has = (k: SelKind, id: string) => sels.some((s) => s.kind === k && s.id === id)
  const walls = floor.walls.filter((w) => has('wall', w.id))
  const wallIds = new Set(walls.map((w) => w.id))
  const openings = floor.openings.filter((o) => has('opening', o.id) || wallIds.has(o.wallId))
  const devices = floor.devices.filter((d) => has('device', d.id) || (d.wallId && wallIds.has(d.wallId)))
  const cables = floor.cables.filter((c) => has('cable', c.id))
  return clone({
    walls,
    openings,
    devices,
    cables,
    roofs: (floor.roofs ?? []).filter((x) => has('roof', x.id)),
    dormers: (floor.dormers ?? []).filter((x) => has('dormer', x.id)),
    loggias: (floor.loggias ?? []).filter((x) => has('loggia', x.id)),
    skylights: (floor.skylights ?? []).filter((x) => has('skylight', x.id)),
  })
}

export const clipSize = (c: Clip) => c.walls.length + c.devices.length + c.cables.length + c.roofs.length + c.dormers.length + c.loggias.length + c.skylights.length + c.openings.filter((o) => !c.walls.some((w) => w.id === o.wallId)).length

/**
 * Fügt die Zwischenablage in ein Geschoss ein (neue IDs). `offset` verschiebt alles im Plan.
 * Wandmontierte Geräte/Öffnungen, deren Wand nicht mitkopiert wurde, bleiben nur bei `sameFloor` an der Originalwand.
 */
export function pasteClip(floor: Floor, clip: Clip, offset: Vec2, sameFloor: boolean): Sel[] {
  const c = clone(clip)
  const mv = (p: Vec2) => {
    p.x += offset.x
    p.y += offset.y
  }
  const out: Sel[] = []
  const wmap = new Map<string, string>()
  for (const w of c.walls) {
    const id = uid('w')
    wmap.set(w.id, id)
    w.id = id
    mv(w.a)
    mv(w.b)
    floor.walls.push(w)
    out.push({ kind: 'wall', id })
  }
  for (const o of c.openings) {
    const nw = wmap.get(o.wallId) ?? (sameFloor && floor.walls.some((w) => w.id === o.wallId) ? o.wallId : null)
    if (!nw) continue
    o.id = uid('o')
    o.wallId = nw
    floor.openings.push(o)
    out.push({ kind: 'opening', id: o.id })
  }
  const dmap = new Map<string, string>()
  for (const d of c.devices) {
    const old = d.id
    if (d.wallId) {
      const nw = wmap.get(d.wallId) ?? (sameFloor && floor.walls.some((w) => w.id === d.wallId) ? d.wallId : null)
      if (!nw) continue
      d.wallId = nw
    } else {
      if (d.x !== undefined) d.x += offset.x
      if (d.y !== undefined) d.y += offset.y
    }
    d.id = uid('d')
    dmap.set(old, d.id)
    floor.devices.push(d)
    out.push({ kind: 'device', id: d.id })
  }
  for (const cb of c.cables) {
    cb.id = uid('c')
    for (const n of cb.points) {
      n.x += offset.x
      n.y += offset.y
      if (n.deviceId) {
        const nd = dmap.get(n.deviceId)
        if (nd) n.deviceId = nd
        else delete n.deviceId
      }
    }
    floor.cables.push(cb)
    out.push({ kind: 'cable', id: cb.id })
  }
  const rmap = new Map<string, string>()
  for (const r of c.roofs) {
    rmap.set(r.id, uid('r'))
    r.id = rmap.get(r.id)!
    mv(r.a)
    mv(r.b)
    ;(floor.roofs ??= []).push(r)
    out.push({ kind: 'roof', id: r.id })
  }
  for (const r of c.dormers) {
    r.id = uid('g')
    mv(r.a)
    mv(r.b)
    ;(floor.dormers ??= []).push(r)
    out.push({ kind: 'dormer', id: r.id })
  }
  for (const k of c.skylights ?? []) {
    const nr = rmap.get(k.roofId) ?? (sameFloor && floor.roofs?.some((x) => x.id === k.roofId) ? k.roofId : null)
    if (!nr) continue
    k.id = uid('s')
    k.roofId = nr
    mv(k.c)
    ;(floor.skylights ??= []).push(k)
    out.push({ kind: 'skylight', id: k.id })
  }
  for (const r of c.loggias) {
    r.id = uid('l')
    const pw = r.parapetWallId
    if (pw) r.parapetWallId = wmap.get(pw)
    mv(r.a)
    mv(r.b)
    ;(floor.loggias ??= []).push(r)
    out.push({ kind: 'loggia', id: r.id })
  }
  return out
}

/** Löscht die gewählten Elemente samt abhängiger Öffnungen/Geräte. */
export function deleteSels(floor: Floor, sels: Sel[]) {
  const ids = (k: SelKind) => new Set(sels.filter((s) => s.kind === k).map((s) => s.id))
  const w = ids('wall'), o = ids('opening'), d = ids('device'), c = ids('cable'), r = ids('roof'), g = ids('dormer'), l = ids('loggia'), m = ids('dim'), k = ids('skylight')
  const goneDev = new Set(floor.devices.filter((x) => d.has(x.id) || w.has(x.wallId)).map((x) => x.id))
  floor.walls = floor.walls.filter((x) => !w.has(x.id))
  floor.openings = floor.openings.filter((x) => !o.has(x.id) && !w.has(x.wallId))
  floor.devices = floor.devices.filter((x) => !goneDev.has(x.id))
  for (const cb of floor.cables) for (const n of cb.points) if (n.deviceId && goneDev.has(n.deviceId)) delete n.deviceId
  floor.cables = floor.cables.filter((x) => !c.has(x.id))
  floor.roofs = (floor.roofs ?? []).filter((x) => !r.has(x.id))
  floor.dormers = (floor.dormers ?? []).filter((x) => !g.has(x.id))
  floor.loggias = (floor.loggias ?? []).filter((x) => !l.has(x.id))
  floor.dims = (floor.dims ?? []).filter((x) => !m.has(x.id))
  floor.skylights = (floor.skylights ?? []).filter((x) => !k.has(x.id) && (floor.roofs ?? []).some((rr) => rr.id === x.roofId))
}
