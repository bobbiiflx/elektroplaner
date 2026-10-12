import { planPoint } from '../lib/runs'
import { selectInRect } from '../lib/clip'
import { roofPlaneAt, skylightGeometry } from '../lib/roof'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Maximize, Minus, Plus } from 'lucide-react'
import { findGap, type WallGap } from '../lib/gaps'
import { roofAxes, roofContour, rectArea, rectCorners } from '../lib/roof'
import { PlanOpening } from './OpeningGlyphs'
import { openingDef, cableType, deviceType, electricDefaults, type DeviceCategory } from '../config/catalog'
import { useFloor, useStore } from '../store'
import type { CableNode, Floor, Vec2, Wall } from '../types'
import {
  boundsOf,
  clamp,
  dist,
  nearestWall,
  pointOnWall,
  projectOnWall,
  uid,
  wallAngleDeg,
  wallLength,
  wallNormal,
} from '../lib/geom'
import { findJoined, moveEnds, syncDeviceNodes, type WallEnd } from '../lib/link'
import { formatLen } from '../lib/units'
import { Dim, FreeDim, PlanDims } from './dims'
import { fillFor, missingFor } from '../lib/completeness'
import { autoRef, lockAxis, snapPlanPoint } from '../lib/autoDims'
import { LenField } from './NumberField'
import { routeTo } from '../lib/cableRoute'
import { PlanSymbolShape } from './DeviceIcons'
import { PaneSwitch } from './PaneSwitch'
import { ToolOptionsBar } from './ToolOptionsBar'
import { Modal } from './ui'

type Drag =
  | { kind: 'pan'; sx: number; sy: number; tx0: number; ty0: number }
  | { kind: 'device'; id: string }
  | { kind: 'opening'; id: string }
  | { kind: 'wallEnd'; id: string; end: 'a' | 'b'; joined: WallEnd[] }
  | { kind: 'cableNode'; id: string; idx: number }
  | { kind: 'marquee'; start: Vec2 }
  | { kind: 'sky'; id: string; start: Vec2; c0: Vec2 }
  | { kind: 'shape'; what: ShapeKind; id: string; start: Vec2; a0: Vec2; b0: Vec2 }
  | { kind: 'shapePt'; what: ShapeKind; id: string; pt: 'a' | 'b' | 'depth' }

type ShapeKind = 'roof' | 'dormer' | 'loggia'

interface View {
  tx: number
  ty: number
  s: number // Pixel pro mm
}

const MIN_S = 0.004
const MAX_S = 4

const HINTS: Record<string, string> = {
  select: 'Element anklicken zum Bearbeiten · Ziehen verschiebt · Leertaste + Ziehen verschiebt die Ansicht',
  wall: 'Klicken setzt Punkte · Doppelklick, Enter oder Rechtsklick beendet · Shift schaltet „rechtwinklig“ um',
  opening: 'Auf eine Wand oder in eine Lücke zwischen zwei Wänden klicken, um eine Tür / ein Fenster zu setzen',
  device: 'Auf eine Wand klicken, um das Gerät zu setzen',
  cable: 'Leitungen laufen nur waagerecht/senkrecht · Dose oder Schalter anklicken verbindet · Enter beendet · Detailarbeit in der Wandansicht (E)',
  measure: 'Zwei Punkte anklicken, um eine Maßlinie zu zeichnen · Umschalt = waagerecht/senkrecht · rastet an Objektmitten ein',
  calibrate: 'Zwei Punkte mit bekanntem Abstand anklicken',
  roof: 'Dachschräge: 1. und 2. Klick = Linie, an der die Schräge beginnt (Kniestock/Traufe) · 3. Klick = Seite, zu der sie ansteigt (in den Raum)',
  dormer: 'Gaube: 1. und 2. Klick = Gaubenfront (Außenkante) · 3. Klick = Tiefe in den Raum (zieht die Rechteckfläche auf)',
  skylight: 'Dachflächenfenster: in die Dachschräge klicken (Mitte des Fensters) · danach Größe rechts einstellen',
  loggia: 'Loggia: 1. und 2. Klick = offene Seite (Brüstung) · 3. Klick = Tiefe in den Raum',
  anchor: 'Passpunkt setzen: denselben Bezugspunkt (z. B. Außenecke, Schacht) in jedem Geschoss anklicken',
}

export default function Editor2D() {
  const floor = useFloor()
  const project = useStore((s) => s.project)
  const backgrounds = useStore((s) => s.backgrounds)
  const ghostBelow = useStore((s) => s.ghostBelow)
  const ghostAbove = useStore((s) => s.ghostAbove)
  const suggest = useStore((s) => s.suggest)
  const dropSuggestion = useStore((s) => s.dropSuggestion)
  const acceptSuggestion = useStore((s) => s.acceptSuggestion)
  const setSuggest = useStore((s) => s.setSuggest)
  const selection = useStore((s) => s.selection)
  const tool = useStore((s) => s.tool)
  const opts = useStore((s) => s.opts)
  const unit = useStore((s) => s.unit)
  const showDims = useStore((s) => s.showDims)
  const colorBy = useStore((s) => s.colorBy)
  const edit = useStore((s) => s.edit)
  const select = useStore((s) => s.select)
  const setTool = useStore((s) => s.setTool)
  const showToast = useStore((s) => s.showToast)
  const createCable = useStore((s) => s.createCable)
  const planPane = useStore((s) => s.planPane)
  const openElevation = useStore((s) => s.openElevation)

  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<Drag | null>(null)
  const spaceRef = useRef(false)

  const [size, setSize] = useState({ w: 0, h: 0 })
  const [view, setView] = useState<View>({ tx: 40, ty: 40, s: 0.1 })
  const multi = useStore((s) => s.multi)
  const setMulti = useStore((s) => s.setMulti)
  const [marquee, setMarquee] = useState<{ a: Vec2; b: Vec2 } | null>(null)
  const [cursor, setCursor] = useState<Vec2 | null>(null)
  const [panning, setPanning] = useState(false)
  const [draft, setDraft] = useState<{ first: Vec2; last: Vec2 } | null>(null)
  const [cableDraft, setCableDraft] = useState<CableNode[]>([])
  const [calib, setCalib] = useState<{ a?: Vec2; b?: Vec2 }>({})
  const [calibReal, setCalibReal] = useState(0)
  const [measureA, setMeasureA] = useState<Vec2 | null>(null)
  const [roofA, setRoofA] = useState<Vec2 | null>(null)
  const [roofB, setRoofB] = useState<Vec2 | null>(null)
  const [shiftDown, setShiftDown] = useState(false)

  const settings = project.settings
  const bg = floor.background
  const bgUrl = backgrounds[floor.id]
  const showBackground = useStore((s) => s.showBackground)
  const s = view.s

  // --- Größe & Einpassen --------------------------------------------------
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  const fit = useCallback(() => {
    if (size.w < 50 || size.h < 50) return
    const pts: Vec2[] = []
    // Mit gezeichneten Wänden auf diese einpassen, sonst auf den ganzen Grundriss
    if (floor.walls.length) {
      for (const w of floor.walls) pts.push(w.a, w.b)
    } else if (bg) {
      pts.push({ x: 0, y: 0 }, { x: bg.width * bg.mmPerPx, y: bg.height * bg.mmPerPx })
    }
    const b = boundsOf(pts) ?? { minX: 0, minY: 0, maxX: 10000, maxY: 8000 }
    // Platz für Werkzeugleiste (links), Optionsleiste (oben), Zoom (rechts) und Statuszeile lassen
    const padL = 84
    const padR = 64
    const padT = 76
    const padB = 52
    const w = Math.max(b.maxX - b.minX, 1000)
    const h = Math.max(b.maxY - b.minY, 1000)
    const availW = size.w - padL - padR
    const availH = size.h - padT - padB
    const sc = clamp(Math.min(availW / w, availH / h), MIN_S, MAX_S)
    setView({
      s: sc,
      tx: padL + (availW - w * sc) / 2 - b.minX * sc,
      ty: padT + (availH - h * sc) / 2 - b.minY * sc,
    })
  }, [size.w, size.h, bg, floor.walls])

  const fittedKey = useRef('')
  useEffect(() => {
    if (size.w < 50) return
    const key = `${project.id}|${floor.id}|${bg?.width ?? 0}|${bg?.mmPerPx ?? 0}`
    if (fittedKey.current !== key) {
      fittedKey.current = key
      fit()
    }
  }, [size.w, size.h, project.id, floor.id, bg?.width, bg?.mmPerPx, fit])

  // --- Zoom per Mausrad / Trackpad ----------------------------------------
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = svg.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      if (e.shiftKey && !e.ctrlKey) {
        setView((v) => ({ ...v, tx: v.tx - (e.deltaX || e.deltaY), ty: v.ty }))
        return
      }
      const k = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))
      setView((v) => {
        const ns = clamp(v.s * k, MIN_S, MAX_S)
        const f = ns / v.s
        return { s: ns, tx: sx - (sx - v.tx) * f, ty: sy - (sy - v.ty) * f }
      })
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [])

  const zoomBy = (k: number) => {
    setView((v) => {
      const ns = clamp(v.s * k, MIN_S, MAX_S)
      const f = ns / v.s
      const cx = size.w / 2
      const cy = size.h / 2
      return { s: ns, tx: cx - (cx - v.tx) * f, ty: cy - (cy - v.ty) * f }
    })
  }

  const toPlan = (clientX: number, clientY: number): Vec2 => {
    const rect = svgRef.current!.getBoundingClientRect()
    return { x: (clientX - rect.left - view.tx) / view.s, y: (clientY - rect.top - view.ty) / view.s }
  }

  // --- Tastatur ------------------------------------------------------------
  const cancelDrafts = useCallback(() => {
    setDraft(null)
    setCableDraft([])
    setCalib({})
    setMeasureA(null)
    setRoofA(null)
    setRoofB(null)
  }, [])

  const finishCable = useCallback(() => {
    if (cableDraft.length >= 2) createCable(cableDraft)
    setCableDraft([])
  }, [cableDraft, createCable])

  useEffect(() => {
    const isTyping = (t: EventTarget | null) => {
      const el = t as HTMLElement | null
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')
    }
    const down = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return
      if ((wrapRef.current?.clientWidth ?? 0) === 0) return // Wandansicht ist aktiv
      if (e.code === 'Space') {
        spaceRef.current = true
        e.preventDefault()
      } else if (e.key === 'Escape') {
        const st = useStore.getState()
        if (st.pickerOpen) st.setPickerOpen(false)
        else if (draft || cableDraft.length || calib.a || measureA || roofA) cancelDrafts()
        else setTool('select')
      } else if (e.key === 'Enter') {
        if (tool === 'cable') finishCable()
        else setDraft(null)
      } else if (e.key === 'f' && !e.metaKey && !e.ctrlKey) {
        fit()
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceRef.current = false
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [draft, cableDraft, calib.a, measureA, roofA, tool, cancelDrafts, finishCable, fit, setTool])

  useEffect(() => {
    cancelDrafts()
  }, [tool, floor.id, planPane, cancelDrafts])

  // --- Einrasten -----------------------------------------------------------
  const snap = (
    raw: Vec2,
    from: Vec2 | undefined,
    ortho: boolean,
    preferWallLine = false,
    skip?: WallEnd[],
  ): { p: Vec2; kind: 'node' | 'wall' | 'grid' } => {
    const tol = 14 / s
    const g = settings.grid
    let best: Vec2 | null = null
    let bd = tol
    const nodes: Vec2[] = []
    const skipIds = new Set((skip ?? []).map((e) => e.id))
    for (const w of floor.walls) {
      if (!skip?.some((e) => e.id === w.id && e.end === 'a')) nodes.push(w.a)
      if (!skip?.some((e) => e.id === w.id && e.end === 'b')) nodes.push(w.b)
    }
    if (draft) nodes.push(draft.first)
    for (const q of nodes) {
      const d = dist(q, raw)
      if (d < bd) {
        bd = d
        best = q
      }
    }
    if (best) return { p: { x: best.x, y: best.y }, kind: 'node' }

    if (preferWallLine || !(from && ortho)) {
      const hit = nearestWall(
        skipIds.size ? floor.walls.filter((w) => !skipIds.has(w.id)) : floor.walls,
        raw,
        tol * (preferWallLine ? 1.6 : 1),
      )
      if (hit) {
        const q = pointOnWall(hit.wall, hit.t)
        const w = hit.wall
        if (Math.abs(w.a.y - w.b.y) < 1e-6) q.x = Math.round(q.x / g) * g
        else if (Math.abs(w.a.x - w.b.x) < 1e-6) q.y = Math.round(q.y / g) * g
        return { p: q, kind: 'wall' }
      }
    }

    const p = { ...raw }
    if (from && ortho) {
      if (Math.abs(p.x - from.x) >= Math.abs(p.y - from.y)) {
        p.y = from.y
        p.x = Math.round(p.x / g) * g
      } else {
        p.x = from.x
        p.y = Math.round(p.y / g) * g
      }
    } else {
      p.x = Math.round(p.x / g) * g
      p.y = Math.round(p.y / g) * g
    }
    return { p, kind: 'grid' }
  }

  const devicePos = (f: Floor, id: string): { face: Vec2; center: Vec2; wall: Wall | null } | null => {
    const d = f.devices.find((x) => x.id === id)
    if (!d) return null
    const w = f.walls.find((x) => x.id === d.wallId)
    if (!w) {
      // frei montiert (Decke / Boden)
      if (d.x === undefined || d.y === undefined) return null
      const q = { x: d.x, y: d.y }
      return { face: q, center: q, wall: null }
    }
    return {
      face: pointOnWall(w, d.offset, d.side, w.thickness / 2),
      center: pointOnWall(w, d.offset),
      wall: w,
    }
  }

  // --- Zeichen-Aktionen ----------------------------------------------------
  const addWallPoint = (p: Vec2) => {
    if (!draft) {
      setDraft({ first: p, last: p })
      return
    }
    if (dist(draft.last, p) < 20) return
    const kind = opts.wallKind
    const thickness = kind === 'outer' ? settings.outerThickness : settings.innerThickness
    edit((pr) => {
      const f = pr.floors.find((x) => x.id === floor.id)
      f?.walls.push({ id: uid('w_'), a: draft.last, b: p, thickness, kind })
    })
    const closed = dist(p, draft.first) < 1
    setDraft(closed ? null : { first: draft.first, last: p })
  }

  /** Wand direkt unter dem Zeiger – sonst ggf. eine Lücke zwischen zwei fluchtenden Wänden. */
  const openingTarget = (p: Vec2): { hit: ReturnType<typeof nearestWall>; gap: WallGap | null } => {
    const hit = nearestWall(floor.walls, p, 400)
    if (hit && hit.dist <= hit.wall.thickness / 2 + 80) return { hit, gap: null }
    const gap = findGap(floor.walls, p)
    return { hit: gap ? null : hit, gap }
  }

  const placeOpening = (raw: Vec2) => {
    const { hit, gap } = openingTarget(raw)
    if (!hit && !gap) {
      showToast('Zum Platzieren auf eine Wand oder in eine Lücke zwischen zwei Wänden klicken.')
      return
    }
    const def = openingDef(opts.openingType)
    const id = uid('o_')
    if (gap) {
      // Lücke als Wand schließen; die Öffnung sitzt darin, der Rest (neben/über/unter der Öffnung) bleibt Wand
      const wid = uid('w_')
      const width = Math.min(def.width, gap.length)
      edit((p) => {
        const f = p.floors.find((x) => x.id === floor.id)
        if (!f) return
        f.walls.push({ id: wid, a: { ...gap.a }, b: { ...gap.b }, thickness: gap.thickness, kind: gap.kind })
        f.openings.push({ id, wallId: wid, type: opts.openingType, offset: Math.round(clamp(gap.t - width / 2, 0, gap.length - width)), width: Math.round(width), height: def.height, sill: def.sill })
      })
      select({ kind: 'opening', id })
      return
    }
    if (!hit) return
    const L = wallLength(hit.wall)
    const width = Math.min(def.width, L)
    edit((p) => {
      const f = p.floors.find((x) => x.id === floor.id)
      f?.openings.push({
        id,
        wallId: hit.wall.id,
        type: opts.openingType,
        offset: clamp(hit.t - width / 2, 0, L - width),
        width,
        height: def.height,
        sill: def.sill,
      })
    })
    select({ kind: 'opening', id })
  }

  const addRoofPoint = (raw: Vec2, ortho: boolean) => {
    if (!roofA) {
      setRoofA(snap(raw, undefined, false, true).p)
      return
    }
    if (!roofB) {
      const p = snap(raw, roofA, ortho, true).p
      if (dist(roofA, p) < 100) return
      setRoofB(p)
      return
    }
    // 3. Klick: Seite des Anstiegs bzw. Tiefe
    const dx = roofB.x - roofA.x, dy = roofB.y - roofA.y
    const proj = ((raw.x - roofA.x) * -dy + (raw.y - roofA.y) * dx) / (Math.hypot(dx, dy) || 1)
    const side: 1 | -1 = proj >= 0 ? 1 : -1
    const id = uid(tool === 'roof' ? 'r_' : tool === 'dormer' ? 'g_' : 'l_')
    const a = roofA, b = roofB
    if (tool === 'roof') {
      edit((p) => {
        const f = p.floors.find((x) => x.id === floor.id)
        if (!f) return
        f.roofs = f.roofs ?? []
        f.roofs.push({ id, a, b, side, knee: 1000, angle: 40 })
      })
      select({ kind: 'roof', id })
      showToast('Dachschräge angelegt – Kniestock und Neigung stehen rechts.')
    } else if (tool === 'dormer') {
      const depth = Math.max(500, Math.round(Math.abs(proj) / 50) * 50)
      edit((p) => {
        const f = p.floors.find((x) => x.id === floor.id)
        if (!f) return
        f.dormers = f.dormers ?? []
        f.dormers.push({ id, a, b, side, depth, height: Math.min(2300, floor.wallHeight) })
      })
      select({ kind: 'dormer', id })
      showToast('Gaube angelegt – die Wände dort werden bis zur Gaubenhöhe hochgezogen. Gaubenwände zeichnest du wie normale Wände.')
    } else {
      const depth = Math.max(500, Math.round(Math.abs(proj) / 50) * 50)
      const wid = uid('w_')
      const parapet = 1000
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      const hasWall = !!nearestWall(floor.walls, mid, 60)
      edit((p) => {
        const f = p.floors.find((x) => x.id === floor.id)
        if (!f) return
        f.loggias = f.loggias ?? []
        if (!hasWall) f.walls.push({ id: wid, a: { ...a }, b: { ...b }, thickness: 120, kind: 'outer', height: parapet })
        f.loggias.push({ id, a, b, side, depth, parapet, parapetWallId: hasWall ? undefined : wid })
      })
      select({ kind: 'loggia', id })
      showToast(hasWall ? 'Loggia angelegt.' : 'Loggia angelegt – Brüstung an der offenen Seite wurde als Wand ergänzt.')
    }
    setRoofA(null)
    setRoofB(null)
  }

  const placeDevice = (raw: Vec2) => {
    const dt0 = deviceType(opts.deviceTypeId)
    if (dt0.mount && dt0.mount !== 'wall') {
      // Decken- bzw. Bodenmontage: freie Position im Raum, am Raster ausgerichtet
      const g = settings.grid
      const q = { x: Math.round(raw.x / g) * g, y: Math.round(raw.y / g) * g }
      const id = uid('d_')
      const height = dt0.mount === 'ceiling' ? floor.wallHeight - (dt0.ceilingDrop ?? 0) : dt0.defaultHeight
      edit((p) => {
        const f = p.floors.find((x) => x.id === floor.id)
        f?.devices.push({ id, typeId: dt0.id, wallId: '', offset: 0, side: 1, height, x: q.x, y: q.y, ...electricDefaults(dt0), ...(opts.circuitId ? { circuitId: opts.circuitId } : {}), ...opts.spec })
      })
      select({ kind: 'device', id })
      return
    }
    const hit = nearestWall(floor.walls, raw, 400)
    if (!hit) {
      showToast('Zum Platzieren auf eine Wand klicken.')
      return
    }
    const dt = deviceType(opts.deviceTypeId)
    const id = uid('d_')
    edit((p) => {
      const f = p.floors.find((x) => x.id === floor.id)
      f?.devices.push({
        id,
        typeId: dt.id,
        wallId: hit.wall.id,
        offset: hit.t,
        side: hit.signed >= 0 ? 1 : -1,
        height: dt.defaultHeight,
        ...electricDefaults(dt),
        ...(opts.circuitId ? { circuitId: opts.circuitId } : {}),
        ...opts.spec,
      })
    })
    select({ kind: 'device', id })
  }

  /**
   * Ziel eines Leitungsklicks: Dose/Schalter (rastet an der Mitte ein) oder Punkt auf Wandlinie/Raster.
   * Leitungen laufen immer nur waagerecht (achs- oder wandparallel) oder senkrecht – routeTo ergänzt Knicke.
   */
  const cableTarget = (raw: Vec2): { node: CableNode; deviceId?: string } => {
    const tol = 18 / s
    let best: { id: string; d: number; pos: Vec2; z: number } | null = null
    for (const d of floor.devices) {
      const pos = devicePos(floor, d.id)
      if (!pos) continue
      const dd = Math.min(dist(pos.face, raw), dist(pos.center, raw))
      if (dd <= tol && (!best || dd < best.d)) best = { id: d.id, d: dd, pos: pos.center, z: d.height }
    }
    if (best) return { node: { x: best.pos.x, y: best.pos.y, z: best.z, deviceId: best.id }, deviceId: best.id }
    const last = cableDraft[cableDraft.length - 1]
    const { p } = snap(raw, last ? { x: last.x, y: last.y } : undefined, true, true)
    return { node: { x: p.x, y: p.y, z: opts.cableZ } }
  }

  const addCableNode = (raw: Vec2) => {
    const { node } = cableTarget(raw)
    const last = cableDraft[cableDraft.length - 1]
    if (!last) {
      setCableDraft([node])
      return
    }
    const more = routeTo(last, node, floor.walls)
    if (more.length) setCableDraft([...cableDraft, ...more])
  }

  const addVertical = () => {
    const last = cableDraft[cableDraft.length - 1]
    if (!last) return
    if (Math.abs(last.z - opts.cableZ) < 1) {
      showToast('Andere Höhe im Feld „Höhe“ einstellen, dann „Senkrecht“.')
      return
    }
    setCableDraft([...cableDraft, { x: last.x, y: last.y, z: opts.cableZ }])
  }

  /** Punkt des Lineals: rastet (wenn aktiv) an Objektmitten, Wand-/Öffnungspunkten oder am Raster ein; Umschalt = waagerecht/senkrecht. */
  const measurePoint = (raw: Vec2, shift: boolean) => {
    let r = snapPlanPoint(floor, raw, 14 / s, settings.grid, opts.snap)
    if (shift && measureA) r = { ...r, p: lockAxis(measureA, opts.snap ? snapPlanPoint(floor, raw, 14 / s, settings.grid, true).p : raw) }
    return r
  }

  const addMeasurePoint = (raw: Vec2, shift: boolean) => {
    const { p } = measurePoint(raw, shift)
    if (!measureA) {
      setMeasureA(p)
      return
    }
    if (dist(measureA, p) < 1) return
    const id = uid('m_')
    const a = measureA
    edit((pr) => {
      const f = pr.floors.find((x) => x.id === floor.id)
      if (!f) return
      f.dims = f.dims ?? []
      f.dims.push({ id, space: 'plan', a, b: p })
    })
    setMeasureA(null)
  }

  const addCalibPoint = (raw: Vec2) => {
    if (!bg) {
      showToast('Zuerst einen Grundriss laden.')
      return
    }
    if (!calib.a || calib.b) {
      setCalib({ a: raw })
    } else {
      const measured = dist(calib.a, raw)
      if (measured < 1) return
      setCalib({ a: calib.a, b: raw })
      setCalibReal(Math.round(measured))
    }
  }

  const applyCalibration = () => {
    if (!calib.a || !calib.b || !bg || calibReal <= 0) return
    const measured = dist(calib.a, calib.b)
    const factor = calibReal / measured
    edit((p) => {
      const f = p.floors.find((x) => x.id === floor.id)
      if (f?.background) f.background.mmPerPx *= factor
      // Ausschnitte desselben Blatts teilen sich den Maßstab
      const sid = f?.background?.sheetId
      if (sid) for (const o of p.floors) if (o !== f && o.background?.sheetId === sid) o.background.mmPerPx *= factor
    })
    setCalib({})
    setTool('select')
    showToast(`Maßstab gesetzt – 1 Pixel entspricht ${(bg.mmPerPx * factor).toFixed(2).replace('.', ',')} mm.`)
  }

  // --- Zeiger --------------------------------------------------------------
  const startPan = (e: React.PointerEvent) => {
    dragRef.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, tx0: view.tx, ty0: view.ty }
    setPanning(true)
    svgRef.current?.setPointerCapture(e.pointerId)
  }

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button === 1 || (e.button === 0 && spaceRef.current)) {
      startPan(e)
      return
    }
    if (e.button !== 0) return
    const raw = toPlan(e.clientX, e.clientY)
    const orthoNow = opts.ortho !== e.shiftKey
    switch (tool) {
      case 'select':
        select(null)
        if (e.shiftKey) {
          dragRef.current = { kind: 'marquee', start: raw }
          setMarquee({ a: raw, b: raw })
          svgRef.current?.setPointerCapture(e.pointerId)
        } else startPan(e)
        break
      case 'wall': {
        const { p } = snap(raw, draft?.last, orthoNow)
        addWallPoint(p)
        break
      }
      case 'opening':
        placeOpening(raw)
        break
      case 'roof':
      case 'dormer':
      case 'loggia':
        addRoofPoint(raw, orthoNow)
        break
      case 'skylight': {
        const r = roofPlaneAt(floor, raw)
        if (!r) {
          showToast('Dachflächenfenster nur innerhalb einer Dachschräge setzen.')
          break
        }
        const id = uid('s_')
        edit((p) => {
          const f = p.floors.find((x) => x.id === floor.id)
          if (!f) return
          ;(f.skylights ??= []).push({ id, roofId: r.id, c: { x: Math.round(raw.x / 10) * 10, y: Math.round(raw.y / 10) * 10 }, w: 780, h: 1180 })
        })
        select({ kind: 'skylight', id })
        setTool('select')
        break
      }
      case 'device':
        placeDevice(raw)
        break
      case 'cable':
        addCableNode(raw)
        break
      case 'measure':
        addMeasurePoint(raw, e.shiftKey)
        break
      case 'calibrate':
        addCalibPoint(raw)
        break
      case 'anchor': {
        const sn = snap(raw, undefined, false)
        const pt = sn.kind === 'node' ? sn.p : raw
        edit((p) => {
          const f = p.floors.find((x) => x.id === floor.id)
          if (f) f.anchor = { x: Math.round(pt.x), y: Math.round(pt.y) }
        })
        setTool('select')
        showToast('Passpunkt gesetzt.')
        break
      }
    }
  }

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const raw = toPlan(e.clientX, e.clientY)
    setCursor(raw)
    if (e.shiftKey !== shiftDown) setShiftDown(e.shiftKey)
    const d = dragRef.current
    if (!d) return
    if (d.kind === 'pan') {
      setView((v) => ({ ...v, tx: d.tx0 + (e.clientX - d.sx), ty: d.ty0 + (e.clientY - d.sy) }))
      return
    }
    if (d.kind === 'marquee') {
      setMarquee({ a: d.start, b: raw })
      return
    }
    if (d.kind === 'sky') {
      const gr = settings.grid
      edit((p) => {
        const f = p.floors.find((x) => x.id === floor.id)
        const sk = f?.skylights?.find((x) => x.id === d.id)
        if (!f || !sk) return
        const c = { x: Math.round((d.c0.x + raw.x - d.start.x) / gr) * gr, y: Math.round((d.c0.y + raw.y - d.start.y) / gr) * gr }
        const pl = roofPlaneAt(f as Floor, c)
        if (pl) {
          sk.c = c
          sk.roofId = pl.id
        }
      }, `sky:${d.id}`)
      return
    }
    if (d.kind === 'device') {
      const cur = floor.devices.find((x) => x.id === d.id)
      if (cur && !cur.wallId) {
        const g = settings.grid
        edit((p) => {
          const f = p.floors.find((x) => x.id === floor.id)
          const dv = f?.devices.find((x) => x.id === d.id)
          if (!f || !dv) return
          dv.x = Math.round(raw.x / g) * g
          dv.y = Math.round(raw.y / g) * g
          syncDeviceNodes(f, dv.id)
        }, `dev:${d.id}`)
        return
      }
      const hit = nearestWall(floor.walls, raw, 700)
      if (!hit) return
      edit((p) => {
        const f = p.floors.find((x) => x.id === floor.id)
        const dv = f?.devices.find((x) => x.id === d.id)
        if (!f || !dv) return
        dv.wallId = hit.wall.id
        dv.offset = hit.t
        dv.side = hit.signed >= 0 ? 1 : -1
        syncDeviceNodes(f, dv.id)
      }, `dev:${d.id}`)
    } else if (d.kind === 'opening') {
      const hit = nearestWall(floor.walls, raw, 700)
      if (!hit) return
      edit((p) => {
        const f = p.floors.find((x) => x.id === floor.id)
        const op = f?.openings.find((x) => x.id === d.id)
        if (!op) return
        const L = wallLength(hit.wall)
        op.wallId = hit.wall.id
        op.offset = clamp(hit.t - op.width / 2, 0, Math.max(0, L - op.width))
      }, `open:${d.id}`)
    } else if (d.kind === 'wallEnd') {
      const { p: q } = snap(raw, undefined, false, false, d.joined)
      edit((p) => {
        const f = p.floors.find((x) => x.id === floor.id)
        if (f) moveEnds(f, d.joined, q)
      }, `wall:${d.id}:${d.end}`)
    } else if (d.kind === 'shape' || d.kind === 'shapePt') {
      const gr = settings.grid
      const rd = (v: number) => Math.round(v / gr) * gr
      edit((p) => {
        const f = p.floors.find((x) => x.id === floor.id)
        if (!f) return
        const sh = d.what === 'roof' ? f.roofs?.find((x) => x.id === d.id) : d.what === 'dormer' ? f.dormers?.find((x) => x.id === d.id) : f.loggias?.find((x) => x.id === d.id)
        if (!sh) return
        if (d.kind === 'shape') {
          const dx = rd(raw.x - d.start.x), dy = rd(raw.y - d.start.y)
          sh.a = { x: d.a0.x + dx, y: d.a0.y + dy }
          sh.b = { x: d.b0.x + dx, y: d.b0.y + dy }
        } else if (d.pt === 'depth') {
          if ('depth' in sh) {
            const L = Math.hypot(sh.b.x - sh.a.x, sh.b.y - sh.a.y) || 1
            const nx = (-(sh.b.y - sh.a.y) / L) * sh.side, ny = ((sh.b.x - sh.a.x) / L) * sh.side
            sh.depth = Math.max(300, rd((raw.x - sh.a.x) * nx + (raw.y - sh.a.y) * ny))
          }
        } else {
          const q = snap(raw, d.pt === 'a' ? sh.b : sh.a, opts.ortho, true).p
          sh[d.pt] = { x: q.x, y: q.y }
        }
        if (d.what === 'loggia') {
          const lg = sh as NonNullable<typeof f.loggias>[number]
          const w = lg.parapetWallId ? f.walls.find((x) => x.id === lg.parapetWallId) : undefined
          if (w) { w.a = { ...lg.a }; w.b = { ...lg.b } }
        }
      }, `shape:${d.id}`)
    } else if (d.kind === 'cableNode') {
      const { p: q } = snap(raw, undefined, false, true)
      edit((p) => {
        const f = p.floors.find((x) => x.id === floor.id)
        const c = f?.cables.find((x) => x.id === d.id)
        const n = c?.points[d.idx]
        if (n) {
          n.x = q.x
          n.y = q.y
        }
      }, `cn:${d.id}:${d.idx}`)
    }
  }

  const endDrag = (e: React.PointerEvent<SVGSVGElement>) => {
    if (dragRef.current?.kind === 'marquee' && marquee) {
      const r = { x0: Math.min(marquee.a.x, marquee.b.x), y0: Math.min(marquee.a.y, marquee.b.y), x1: Math.max(marquee.a.x, marquee.b.x), y1: Math.max(marquee.a.y, marquee.b.y) }
      if (r.x1 - r.x0 > 80 || r.y1 - r.y0 > 80) setMulti(selectInRect(floor, r))
      setMarquee(null)
    }
    if (dragRef.current) {
      dragRef.current = null
      setPanning(false)
      try {
        svgRef.current?.releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
    }
  }

  const onDoubleClick = () => {
    if (tool === 'select' && selection?.kind === 'wall') openElevation(selection.id)
    else if (tool === 'wall') setDraft(null)
    else if (tool === 'cable') finishCable()
  }

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    if (tool === 'wall') setDraft(null)
    else if (tool === 'cable') finishCable()
  }

  const beginElementDrag = (e: React.PointerEvent, drag: Drag | null, sel?: { kind: 'wall' | 'opening' | 'device' | 'cable' | 'dim' | 'roof' | 'dormer' | 'loggia' | 'skylight'; id: string }) => {
    if (tool !== 'select' || e.button !== 0 || spaceRef.current) return
    e.stopPropagation()
    if (sel) select(sel)
    if (!drag) return
    dragRef.current = drag
    svgRef.current?.setPointerCapture(e.pointerId)
  }

  // --- Darstellung ---------------------------------------------------------
  const px = (n: number) => n / s // Bildschirm-Pixel → mm
  const vis = {
    x0: -view.tx / s,
    y0: -view.ty / s,
    w: size.w / s,
    h: size.h / s,
  }
  const g = settings.grid

  const snapPreview = useMemo(() => {
    if (!cursor) return null
    if (tool === 'wall') return snap(cursor, draft?.last, opts.ortho).p
    return null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, tool, draft, opts.ortho, floor.walls, s])

  const ghost = useMemo(() => {
    if (!cursor || (tool !== 'opening' && tool !== 'device')) return null
    const hit = nearestWall(floor.walls, cursor, 400)
    if (!hit) return null
    if (tool === 'opening' && hit.dist > hit.wall.thickness / 2 + 80 && findGap(floor.walls, cursor)) return null
    return hit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, tool, floor.walls])
  const gapGhost = useMemo(() => (cursor && tool === 'opening' ? openingTarget(cursor).gap : null), [cursor, tool, floor.walls]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Griffe zum Ziehen der Eckpunkte (und der Tiefe bei Gaube/Loggia) */
  const shapeHandles = (what: ShapeKind, id: string, a: Vec2, b: Vec2, corners?: Vec2[]) => {
    const dot = (pt: 'a' | 'b' | 'depth', x: number, y: number) => (
      <circle
        key={pt}
        cx={x}
        cy={y}
        r={px(6)}
        fill="var(--paper)"
        stroke="var(--accent)"
        strokeWidth={px(2)}
        style={{ cursor: 'grab' }}
        onPointerDown={(e) => beginElementDrag(e, { kind: 'shapePt', what, id, pt })}
      />
    )
    return (
      <g>
        {dot('a', a.x, a.y)}
        {dot('b', b.x, b.y)}
        {corners && dot('depth', (corners[2].x + corners[3].x) / 2, (corners[2].y + corners[3].y) / 2)}
      </g>
    )
  }

  const label = (text: string, x: number, y: number, rot = 0, color = 'var(--ink)') => {
    const flip = rot > 90 || rot < -90 ? rot + 180 : rot
    return (
      <text
        x={x}
        y={y}
        transform={`rotate(${flip} ${x} ${y})`}
        fontSize={px(12)}
        textAnchor="middle"
        dominantBaseline="central"
        fill={color}
        stroke="var(--paper)"
        strokeWidth={px(3.5)}
        style={{ paintOrder: 'stroke', pointerEvents: 'none', fontWeight: 600 }}
      >
        {text}
      </text>
    )
  }

  const wallLabel = (w: Wall, color?: string) => {
    const mid = pointOnWall(w, wallLength(w) / 2)
    const n = wallNormal(w)
    const off = w.thickness / 2 + px(14)
    return label(formatLen(wallLength(w), unit), mid.x + n.x * off, mid.y + n.y * off, wallAngleDeg(w), color)
  }

  const shape = (cat: DeviceCategory, r: number, fill: string, selected: boolean) => (
    <PlanSymbolShape cat={cat} r={r} fill={fill} stroke={selected ? 'var(--accent)' : 'var(--paper)'} sw={selected ? px(2.5) : px(1.5)} />
  )

  /** Mittenbemaßung entlang der Wand: zur nächsten Wandkante, bzw. nur zur Mitte eines Objekts auf gleicher Höhe. */
  const planAutoDim = (wall: Wall, t: number, z: number, side: 1 | -1, ignoreId?: string) => {
    const ref = autoRef(wall, floor.devices, t, z, ignoreId)
    if (Math.abs(ref.u - t) < 1) return null
    const ang = wallAngleDeg(wall)
    const y = side * (wall.thickness / 2 + px(26))
    return (
      <g transform={`translate(${wall.a.x} ${wall.a.y}) rotate(${ang})`} style={{ pointerEvents: 'none' }}>
        <Dim x1={ref.u} y1={y} x2={t} y2={y} text={formatLen(Math.abs(ref.u - t), unit)} px={px} flip={ang > 90 || ang < -90} />
        <line x1={ref.u} y1={0} x2={ref.u} y2={y} stroke="var(--dim, var(--accent))" strokeWidth={px(0.8)} strokeDasharray={`${px(3)} ${px(3)}`} opacity={0.6} />
        <line x1={t} y1={0} x2={t} y2={y} stroke="var(--dim, var(--accent))" strokeWidth={px(0.8)} strokeDasharray={`${px(3)} ${px(3)}`} opacity={0.6} />
      </g>
    )
  }

  const selWall = selection?.kind === 'wall' ? floor.walls.find((w) => w.id === selection.id) : undefined
  const calibMeasured = calib.a && calib.b ? dist(calib.a, calib.b) : 0
  const cursorStyle = panning ? 'grabbing' : tool === 'select' ? 'default' : 'crosshair'

  return (
    <div className="editor2d" ref={wrapRef}>
      <svg
        ref={svgRef}
        className="plan"
        style={{ cursor: cursorStyle }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={() => !dragRef.current && setCursor(null)}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
      >
        <defs>
          <pattern id="gridMinor" width={g} height={g} patternUnits="userSpaceOnUse">
            <path d={`M ${g} 0 L 0 0 0 ${g}`} fill="none" stroke="var(--grid-minor)" strokeWidth={px(1)} />
          </pattern>
          <pattern id="roofHatch" width={90} height={90} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width={90} height={90} fill="#ff9f0a" opacity={0.1} />
            <line x1={0} y1={0} x2={0} y2={90} stroke="#c77c0a" strokeWidth={px(1)} opacity={0.55} />
          </pattern>
          <pattern id="gridMajor" width={1000} height={1000} patternUnits="userSpaceOnUse">
            <path d="M 1000 0 L 0 0 0 1000" fill="none" stroke="var(--grid-major)" strokeWidth={px(1)} />
          </pattern>
        </defs>

        <g transform={`translate(${view.tx} ${view.ty}) scale(${s})`}>
          {bg && bgUrl && showBackground && (
            <image
              href={bgUrl}
              x={bg.x ?? 0}
              y={bg.y ?? 0}
              width={bg.width * bg.mmPerPx}
              height={bg.height * bg.mmPerPx}
              opacity={bg.opacity}
              preserveAspectRatio="none"
              style={{ pointerEvents: 'none' }}
            />
          )}
          {g * s >= 7 && <rect x={vis.x0} y={vis.y0} width={vis.w} height={vis.h} fill="url(#gridMinor)" style={{ pointerEvents: 'none' }} />}
          {1000 * s >= 12 && <rect x={vis.x0} y={vis.y0} width={vis.w} height={vis.h} fill="url(#gridMajor)" style={{ pointerEvents: 'none' }} />}

          {/* Nachbargeschosse als Hilfslinien (Stapelkontrolle) */}
          {([
            { on: ghostBelow, d: -1, color: '#af52de' },
            { on: ghostAbove, d: 1, color: '#30b0c7' },
          ] as const).map(({ on, d, color }) => {
            if (!on) return null
            const idx = project.floors.findIndex((f) => f.id === floor.id)
            const nb = project.floors[idx + d]
            if (!nb) return null
            return (
              <g key={d} style={{ pointerEvents: 'none' }} opacity={0.5}>
                {nb.walls.map((w) => (
                  <line key={w.id} x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y} stroke={color} strokeWidth={Math.max(30, w.thickness * 0.4)} strokeDasharray={`${px(8)} ${px(5)}`} />
                ))}
                {nb.devices
                  .filter((dv) => dv.typeId === 'steig')
                  .map((dv) => {
                    const q = planPoint(nb, dv)
                    return q ? <circle key={dv.id} cx={q.x} cy={q.y} r={140} fill="none" stroke={color} strokeWidth={px(2)} /> : null
                  })}
              </g>
            )
          })}

          {floor.anchor && (
            <g style={{ pointerEvents: 'none' }} stroke="#ff2d55" strokeWidth={px(2)}>
              <circle cx={floor.anchor.x} cy={floor.anchor.y} r={px(8)} fill="none" />
              <line x1={floor.anchor.x - px(14)} y1={floor.anchor.y} x2={floor.anchor.x + px(14)} y2={floor.anchor.y} />
              <line x1={floor.anchor.x} y1={floor.anchor.y - px(14)} x2={floor.anchor.x} y2={floor.anchor.y + px(14)} />
            </g>
          )}

          {/* Dachschrägen */}
          {(floor.roofs ?? []).map((r) => {
            const { n } = roofAxes(r)
            const sel = selection?.kind === 'roof' && selection.id === r.id
            const c1 = roofContour(r, 1000, floor.wallHeight)
            const c2 = roofContour(r, 2000, floor.wallHeight)
            const lowEnd = r.knee < 1000 ? c1 : null
            const mid = { x: (r.a.x + r.b.x) / 2, y: (r.a.y + r.b.y) / 2 }
            const ang = (Math.atan2(r.b.y - r.a.y, r.b.x - r.a.x) * 180) / Math.PI
            return (
              <g key={r.id}>
                {lowEnd && <polygon points={`${r.a.x},${r.a.y} ${r.b.x},${r.b.y} ${lowEnd.b.x},${lowEnd.b.y} ${lowEnd.a.x},${lowEnd.a.y}`} fill="url(#roofHatch)" style={{ pointerEvents: 'none' }} />}
                {[
                  { c: c1, t: 1000 },
                  { c: c2, t: 2000 },
                ].map(({ c, t }) =>
                  c ? (
                    <g key={t} style={{ pointerEvents: 'none' }}>
                      <line x1={c.a.x} y1={c.a.y} x2={c.b.x} y2={c.b.y} stroke="#c77c0a" strokeWidth={px(1.2)} strokeDasharray={`${px(7)} ${px(4)}`} />
                      {label(`${formatLen(t, unit)} Linie`, (c.a.x + c.b.x) / 2, (c.a.y + c.b.y) / 2 + n.y * px(10), ang, '#c77c0a')}
                    </g>
                  ) : null,
                )}
                <line x1={r.a.x} y1={r.a.y} x2={r.b.x} y2={r.b.y} stroke={sel ? 'var(--accent)' : '#ff9f0a'} strokeWidth={px(sel ? 3.5 : 2.5)} strokeDasharray={`${px(10)} ${px(5)}`} style={{ pointerEvents: 'none' }} />
                <line x1={r.a.x} y1={r.a.y} x2={r.b.x} y2={r.b.y} stroke="transparent" strokeWidth={px(14)} style={{ cursor: tool === 'select' ? 'pointer' : undefined, pointerEvents: tool === 'select' ? 'stroke' : 'none' }} onPointerDown={(e) => beginElementDrag(e, { kind: 'shape', what: 'roof', id: r.id, start: toPlan(e.clientX, e.clientY), a0: { ...r.a }, b0: { ...r.b } }, { kind: 'roof', id: r.id })} />
                {/* Anstiegsrichtung */}
                <g style={{ pointerEvents: 'none' }} stroke={sel ? 'var(--accent)' : '#ff9f0a'} strokeWidth={px(2)} fill="none">
                  <line x1={mid.x} y1={mid.y} x2={mid.x + n.x * px(28)} y2={mid.y + n.y * px(28)} />
                  <path d={`M ${mid.x + n.x * px(28) - n.x * px(7) - n.y * px(5)} ${mid.y + n.y * px(28) - n.y * px(7) + n.x * px(5)} L ${mid.x + n.x * px(28)} ${mid.y + n.y * px(28)} L ${mid.x + n.x * px(28) - n.x * px(7) + n.y * px(5)} ${mid.y + n.y * px(28) - n.y * px(7) - n.x * px(5)}`} />
                </g>
                {sel && tool === 'select' && shapeHandles('roof', r.id, r.a, r.b)}
                {label(`${formatLen(r.knee, unit)} · ${Math.round(r.angle)}°`, mid.x + n.x * px(42), mid.y + n.y * px(42), ang, '#c77c0a')}
              </g>
            )
          })}
          {(tool === 'roof' || tool === 'dormer' || tool === 'loggia') && roofA && cursor && (() => {
            const b = roofB ?? snap(cursor, roofA, opts.ortho, true).p
            const dx = b.x - roofA.x, dy = b.y - roofA.y
            const L = Math.hypot(dx, dy) || 1
            let nx = -dy / L, ny = dx / L
            let depth = px(60)
            if (roofB) {
              const pr = (cursor.x - roofA.x) * nx + (cursor.y - roofA.y) * ny
              if (pr < 0) { nx = -nx; ny = -ny }
              if (tool !== 'roof') depth = Math.max(500, Math.abs(pr))
            }
            return (
              <g style={{ pointerEvents: 'none' }}>
                <line x1={roofA.x} y1={roofA.y} x2={b.x} y2={b.y} stroke="#ff9f0a" strokeWidth={px(2.5)} strokeDasharray={`${px(10)} ${px(5)}`} />
                <circle cx={roofA.x} cy={roofA.y} r={px(4)} fill="#ff9f0a" />
                {roofB && <polygon points={`${roofA.x},${roofA.y} ${b.x},${b.y} ${b.x + nx * depth},${b.y + ny * depth} ${roofA.x + nx * depth},${roofA.y + ny * depth}`} fill={tool === 'loggia' ? '#0a84ff' : '#ff9f0a'} opacity={0.2} />}
                {roofB && tool !== 'roof' && label(formatLen(depth, unit), (roofA.x + b.x) / 2 + nx * depth, (roofA.y + b.y) / 2 + ny * depth, 0, 'var(--ink)')}
              </g>
            )
          })()}

          {/* Gauben und Loggien */}
          {(floor.dormers ?? []).map((d) => {
            const sel = selection?.kind === 'dormer' && selection.id === d.id
            const pts = rectCorners(d).map((q) => `${q.x},${q.y}`).join(' ')
            const c = rectCorners(d)
            const mid = { x: (c[0].x + c[2].x) / 2, y: (c[0].y + c[2].y) / 2 }
            return (
              <g key={d.id}>
                <polygon points={pts} fill="#ff9f0a" opacity={0.14} style={{ pointerEvents: 'none' }} />
                <polygon points={pts} fill="transparent" stroke={sel ? 'var(--accent)' : '#c77c0a'} strokeWidth={px(sel ? 3 : 2)} strokeDasharray={`${px(8)} ${px(4)}`} style={{ cursor: tool === 'select' ? 'pointer' : undefined, pointerEvents: tool === 'select' ? 'all' : 'none' }} onPointerDown={(e) => beginElementDrag(e, { kind: 'shape', what: 'dormer', id: d.id, start: toPlan(e.clientX, e.clientY), a0: { ...d.a }, b0: { ...d.b } }, { kind: 'dormer', id: d.id })} />
                {sel && tool === 'select' && shapeHandles('dormer', d.id, d.a, d.b, rectCorners(d))}
                {label(`${d.slope ? 'Schleppgaube' : 'Gaube'} · ${formatLen(d.height, unit)}`, mid.x, mid.y, 0, '#c77c0a')}
              </g>
            )
          })}
          {(floor.loggias ?? []).map((l) => {
            const sel = selection?.kind === 'loggia' && selection.id === l.id
            const pts = rectCorners(l).map((q) => `${q.x},${q.y}`).join(' ')
            const c = rectCorners(l)
            const mid = { x: (c[0].x + c[2].x) / 2, y: (c[0].y + c[2].y) / 2 }
            return (
              <g key={l.id}>
                <polygon points={pts} fill="#0a84ff" opacity={0.12} style={{ pointerEvents: 'none' }} />
                <polygon points={pts} fill="transparent" stroke={sel ? 'var(--accent)' : '#0a84ff'} strokeWidth={px(sel ? 3 : 1.6)} strokeDasharray={`${px(3)} ${px(4)}`} style={{ cursor: tool === 'select' ? 'pointer' : undefined, pointerEvents: tool === 'select' ? 'all' : 'none' }} onPointerDown={(e) => beginElementDrag(e, { kind: 'shape', what: 'loggia', id: l.id, start: toPlan(e.clientX, e.clientY), a0: { ...l.a }, b0: { ...l.b } }, { kind: 'loggia', id: l.id })} />
                {sel && tool === 'select' && shapeHandles('loggia', l.id, l.a, l.b, rectCorners(l))}
                {label(`Loggia · ${rectArea(l).toFixed(1).replace('.', ',')} m²`, mid.x, mid.y, 0, '#0a6fd0')}
              </g>
            )
          })}

          {/* Dachflächenfenster */}
          {(floor.skylights ?? []).map((sk) => {
            const g = skylightGeometry(floor, sk)
            if (!g) return null
            const sel = selection?.kind === 'skylight' && selection.id === sk.id
            const pts = g.pts.map((q) => `${q.x},${q.y}`).join(' ')
            return (
              <g key={sk.id}>
                <polygon points={pts} fill="#8ec5ff" fillOpacity={0.45} stroke={sel ? 'var(--accent)' : '#0a6fd0'} strokeWidth={px(sel ? 3 : 1.8)} style={{ cursor: tool === 'select' ? 'move' : undefined, pointerEvents: tool === 'select' ? 'all' : 'none' }} onPointerDown={(e) => beginElementDrag(e, { kind: 'sky', id: sk.id, start: toPlan(e.clientX, e.clientY), c0: { ...sk.c } }, { kind: 'skylight', id: sk.id })} />
                <line x1={g.pts[0].x} y1={g.pts[0].y} x2={g.pts[2].x} y2={g.pts[2].y} stroke="#0a6fd0" strokeWidth={px(1)} style={{ pointerEvents: 'none' }} />
                <line x1={g.pts[1].x} y1={g.pts[1].y} x2={g.pts[3].x} y2={g.pts[3].y} stroke="#0a6fd0" strokeWidth={px(1)} style={{ pointerEvents: 'none' }} />
              </g>
            )
          })}

          {/* Mehrfachauswahl */}
          {multi.length > 0 && (
            <g style={{ pointerEvents: 'none' }} opacity={0.55}>
              {multi.map((m) => {
                if (m.kind === 'wall') {
                  const w = floor.walls.find((x) => x.id === m.id)
                  return w ? <line key={m.kind + m.id} x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y} stroke="var(--accent)" strokeWidth={w.thickness + px(6)} strokeLinecap="square" /> : null
                }
                if (m.kind === 'device') {
                  const d = floor.devices.find((x) => x.id === m.id)
                  const q = d ? planPoint(floor, d) : null
                  return q ? <circle key={m.kind + m.id} cx={q.x} cy={q.y} r={px(11)} fill="none" stroke="var(--accent)" strokeWidth={px(3)} /> : null
                }
                if (m.kind === 'cable') {
                  const c = floor.cables.find((x) => x.id === m.id)
                  return c ? <polyline key={m.kind + m.id} points={c.points.map((q) => `${q.x},${q.y}`).join(' ')} fill="none" stroke="var(--accent)" strokeWidth={px(6)} strokeLinejoin="round" /> : null
                }
                if (m.kind === 'roof') {
                  const r = (floor.roofs ?? []).find((x) => x.id === m.id)
                  return r ? <line key={m.kind + m.id} x1={r.a.x} y1={r.a.y} x2={r.b.x} y2={r.b.y} stroke="var(--accent)" strokeWidth={px(6)} /> : null
                }
                if (m.kind === 'dormer' || m.kind === 'loggia') {
                  const r = (m.kind === 'dormer' ? floor.dormers : floor.loggias)?.find((x) => x.id === m.id)
                  return r ? <polygon key={m.kind + m.id} points={rectCorners(r).map((q) => `${q.x},${q.y}`).join(' ')} fill="var(--accent)" fillOpacity={0.15} stroke="var(--accent)" strokeWidth={px(3)} /> : null
                }
                return null
              })}
            </g>
          )}
          {marquee && <rect x={Math.min(marquee.a.x, marquee.b.x)} y={Math.min(marquee.a.y, marquee.b.y)} width={Math.abs(marquee.b.x - marquee.a.x)} height={Math.abs(marquee.b.y - marquee.a.y)} fill="var(--accent)" fillOpacity={0.08} stroke="var(--accent)" strokeWidth={px(1.2)} strokeDasharray={`${px(5)} ${px(3)}`} style={{ pointerEvents: 'none' }} />}

          {/* Wände */}
          {floor.walls.map((w) => {
            const sel = selection?.kind === 'wall' && selection.id === w.id
            return (
              <line
                key={w.id}
                x1={w.a.x}
                y1={w.a.y}
                x2={w.b.x}
                y2={w.b.y}
                stroke={sel ? 'var(--accent)' : 'var(--wall)'}
                strokeWidth={w.thickness}
                strokeLinecap="square"
                opacity={0.92}
                style={{ cursor: tool === 'select' ? 'pointer' : undefined }}
                onPointerDown={(e) => beginElementDrag(e, null, { kind: 'wall', id: w.id })}
              />
            )
          })}

          {/* Vorgeschlagene Wände (Erkennung) */}
          {suggest?.floorId === floor.id &&
            suggest.walls.map((w) => (
              <line
                key={w.id}
                x1={w.a.x}
                y1={w.a.y}
                x2={w.b.x}
                y2={w.b.y}
                stroke="#ff9500"
                strokeWidth={w.thickness}
                strokeLinecap="butt"
                opacity={0.6}
                style={{ cursor: 'pointer' }}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  dropSuggestion(w.id)
                }}
              >
                <title>Klicken zum Entfernen</title>
              </line>
            ))}

          {/* Öffnungen */}
          {floor.openings.map((o) => {
            const w = floor.walls.find((x) => x.id === o.wallId)
            if (!w) return null
            const sel = selection?.kind === 'opening' && selection.id === o.id
            const t = w.thickness
            return (
              <g
                key={o.id}
                transform={`translate(${w.a.x} ${w.a.y}) rotate(${wallAngleDeg(w)})`}
                style={{ cursor: tool === 'select' ? 'pointer' : undefined }}
                onPointerDown={(e) => beginElementDrag(e, { kind: 'opening', id: o.id }, { kind: 'opening', id: o.id })}
              >
                <rect x={o.offset} y={-t / 2 - 2} width={o.width} height={t + 4} fill="var(--paper)" />
                <PlanOpening type={o.type} x={o.offset} w={o.width} t={t} sw={1.5} sw2={1} vec />
                {sel && <rect x={o.offset} y={-t / 2 - 2} width={o.width} height={t + 4} fill="none" stroke="var(--accent)" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />}
              </g>
            )
          })}

          {/* Leitungen (Draufsicht) */}
          {floor.cables.map((c) => {
            const ct = cableType(c.typeId)
            const sel = selection?.kind === 'cable' && selection.id === c.id
            const pts = c.points.map((p) => `${p.x},${p.y}`).join(' ')
            return (
              <g key={c.id}>
                <polyline points={pts} fill="none" stroke="transparent" strokeWidth={14} vectorEffect="non-scaling-stroke" style={{ pointerEvents: tool === 'select' ? 'stroke' : 'none', cursor: 'pointer' }} onPointerDown={(e) => beginElementDrag(e, null, { kind: 'cable', id: c.id })} />
                <polyline points={pts} fill="none" stroke={ct.color} strokeWidth={sel ? 5 : 3} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" opacity={0.95} style={{ pointerEvents: 'none' }} />
                {c.points.map((n, i) => {
                  const prev = c.points[i - 1]
                  const riser = (prev && dist(prev, n) < 1) || (c.points[i + 1] && dist(c.points[i + 1], n) < 1)
                  if (!sel && !riser) return null
                  return (
                    <g key={i}>
                      <circle
                        cx={n.x}
                        cy={n.y}
                        r={px(sel ? 6 : 4)}
                        fill={riser ? 'var(--paper)' : ct.color}
                        stroke={ct.color}
                        strokeWidth={px(2)}
                        style={{ cursor: sel && !n.deviceId ? 'move' : undefined }}
                        onPointerDown={(e) => !n.deviceId && sel && beginElementDrag(e, { kind: 'cableNode', id: c.id, idx: i })}
                      />
                      {sel && label(`${formatLen(n.z, unit, false)}`, n.x + px(14), n.y - px(12), 0, ct.color)}
                    </g>
                  )
                })}
              </g>
            )
          })}

          {showDims && <PlanDims floor={floor} unit={unit} px={px} />}
          {(floor.dims ?? [])
            .filter((m) => m.space === 'plan')
            .map((m) => (
              <FreeDim
                key={m.id}
                a={m.a}
                b={m.b}
                text={formatLen(dist(m.a, m.b), unit)}
                px={px}
                selected={selection?.kind === 'dim' && selection.id === m.id}
                onPointerDown={tool === 'select' ? (e) => beginElementDrag(e, null, { kind: 'dim', id: m.id }) : undefined}
              />
            ))}
          {tool === 'measure' && cursor && (() => {
            const r = measurePoint(cursor, shiftDown)
            return (
              <g style={{ pointerEvents: 'none' }}>
                {measureA && <FreeDim a={measureA} b={r.p} text={formatLen(dist(measureA, r.p), unit)} px={px} color="var(--accent)" ghost />}
                {measureA && <circle cx={measureA.x} cy={measureA.y} r={px(4)} fill="var(--accent)" />}
                <circle cx={r.p.x} cy={r.p.y} r={px(r.kind === 'device' ? 8 : 5)} fill={r.kind === 'device' ? 'none' : 'var(--accent)'} stroke="var(--accent)" strokeWidth={px(2)} />
                {r.kind === 'device' && label('Mitte', r.p.x, r.p.y - px(16), 0, 'var(--accent)')}
              </g>
            )
          })()}

          {/* Geräte */}
          {floor.devices.map((d) => {
            const pos = devicePos(floor, d.id)
            if (!pos) return null
            const dt = deviceType(d.typeId)
            const sel = selection?.kind === 'device' && selection.id === d.id
            const r = Math.max(65, px(7.5))
            const open = colorBy !== 'type' && missingFor(d, dt).length > 0
            return (
              <g
                key={d.id}
                transform={`translate(${pos.face.x} ${pos.face.y})`}
                style={{ cursor: tool === 'select' ? 'pointer' : undefined }}
                onPointerDown={(e) => beginElementDrag(e, { kind: 'device', id: d.id }, { kind: 'device', id: d.id })}
              >
                {open && <circle r={r * 1.55} fill="none" stroke="var(--warn)" strokeWidth={px(1.8)} strokeDasharray={`${px(4)} ${px(3)}`} />}
                {shape(dt.category, r, fillFor(d, dt, project, colorBy), sel)}
                {sel && label(`${dt.name} · ${formatLen(d.height, unit)}`, 0, -r - px(12))}
              </g>
            )
          })}

          {/* Griffe der gewählten Wand */}
          {selWall && tool === 'select' && (
            <>
              {(['a', 'b'] as const).map((end) => (
                <circle
                  key={end}
                  cx={selWall[end].x}
                  cy={selWall[end].y}
                  r={px(7)}
                  fill="var(--paper)"
                  stroke="var(--accent)"
                  strokeWidth={px(2.5)}
                  style={{ cursor: 'move' }}
                  onPointerDown={(e) =>
                    beginElementDrag(e, { kind: 'wallEnd', id: selWall.id, end, joined: findJoined(floor, selWall[end]) })
                  }
                />
              ))}
              {wallLabel(selWall, 'var(--accent)')}
            </>
          )}

          {/* Wandentwurf */}
          {tool === 'wall' && draft && snapPreview && (
            <g style={{ pointerEvents: 'none' }}>
              <line
                x1={draft.last.x}
                y1={draft.last.y}
                x2={snapPreview.x}
                y2={snapPreview.y}
                stroke="var(--accent)"
                strokeWidth={opts.wallKind === 'outer' ? settings.outerThickness : settings.innerThickness}
                strokeLinecap="square"
                opacity={0.45}
              />
              {label(
                formatLen(dist(draft.last, snapPreview), unit),
                (draft.last.x + snapPreview.x) / 2,
                (draft.last.y + snapPreview.y) / 2 - px(20),
                0,
                'var(--accent)',
              )}
            </g>
          )}
          {tool === 'wall' && snapPreview && <circle cx={snapPreview.x} cy={snapPreview.y} r={px(5)} fill="var(--accent)" style={{ pointerEvents: 'none' }} />}

          {/* Platzierungs-Vorschau */}
          {ghost && tool === 'opening' && (() => {
            const def = openingDef(opts.openingType)
            const L = wallLength(ghost.wall)
            const width = Math.min(def.width, L)
            const off = clamp(ghost.t - width / 2, 0, L - width)
            return (
              <g transform={`translate(${ghost.wall.a.x} ${ghost.wall.a.y}) rotate(${wallAngleDeg(ghost.wall)})`} style={{ pointerEvents: 'none' }}>
                <rect x={off} y={-ghost.wall.thickness / 2 - 2} width={width} height={ghost.wall.thickness + 4} fill="var(--accent)" opacity={0.35} />
              </g>
            )
          })()}
          {gapGhost && tool === 'opening' && (() => {
            const def = openingDef(opts.openingType)
            const width = Math.min(def.width, gapGhost.length)
            const off = clamp(gapGhost.t - width / 2, 0, gapGhost.length - width)
            const ang = (Math.atan2(gapGhost.b.y - gapGhost.a.y, gapGhost.b.x - gapGhost.a.x) * 180) / Math.PI
            return (
              <g transform={`translate(${gapGhost.a.x} ${gapGhost.a.y}) rotate(${ang})`} style={{ pointerEvents: 'none' }}>
                <rect x={0} y={-gapGhost.thickness / 2} width={gapGhost.length} height={gapGhost.thickness} fill="var(--wall)" opacity={0.28} stroke="var(--accent)" strokeDasharray="6 4" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
                <rect x={off} y={-gapGhost.thickness / 2 - 2} width={width} height={gapGhost.thickness + 4} fill="var(--accent)" opacity={0.4} />
              </g>
            )
          })()}
          {tool === 'device' && cursor && (() => {
            const dt = deviceType(opts.deviceTypeId)
            if (!dt.mount || dt.mount === 'wall') return null
            const g = settings.grid
            const q = { x: Math.round(cursor.x / g) * g, y: Math.round(cursor.y / g) * g }
            const r = Math.max(65, px(7.5))
            return (
              <g transform={`translate(${q.x} ${q.y})`} opacity={0.6} style={{ pointerEvents: 'none' }}>
                {shape(dt.category, r, dt.color, false)}
                {label(dt.mount === 'ceiling' ? `Decke · ${formatLen(floor.wallHeight - (dt.ceilingDrop ?? 0), unit)}` : `Boden · ${formatLen(dt.defaultHeight, unit)}`, 0, -r - px(11))}
              </g>
            )
          })()}
          {ghost && tool === 'device' && deviceType(opts.deviceTypeId).mount !== 'ceiling' && deviceType(opts.deviceTypeId).mount !== 'floor' && (() => {
            const dt = deviceType(opts.deviceTypeId)
            const side = ghost.signed >= 0 ? 1 : -1
            const pos = pointOnWall(ghost.wall, ghost.t, side, ghost.wall.thickness / 2)
            const r = Math.max(65, px(7.5))
            return (
              <g transform={`translate(${pos.x} ${pos.y})`} opacity={0.6} style={{ pointerEvents: 'none' }}>
                {shape(dt.category, r, dt.color, false)}
                {label(`H ${formatLen(dt.defaultHeight, unit)}`, 0, -r - px(11))}
              </g>
            )
          })()}
          {ghost && tool === 'device' && planAutoDim(ghost.wall, ghost.t, deviceType(opts.deviceTypeId).defaultHeight, ghost.signed >= 0 ? 1 : -1)}
          {tool === 'select' && selection?.kind === 'device' && (() => {
            const dv = floor.devices.find((x) => x.id === selection.id)
            const w = dv && floor.walls.find((x) => x.id === dv.wallId)
            return dv && w ? planAutoDim(w, dv.offset, dv.height, dv.side, dv.id) : null
          })()}

          {/* Leitungsentwurf */}
          {tool === 'cable' && cursor && (() => {
            const col = cableType(opts.cableTypeId).color
            const tgt = cableTarget(cursor)
            const last = cableDraft[cableDraft.length - 1]
            const ahead = last ? [last, ...routeTo(last, tgt.node, floor.walls)] : [tgt.node]
            return (
              <g style={{ pointerEvents: 'none' }}>
                {cableDraft.length > 1 && (
                  <polyline points={cableDraft.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={col} strokeWidth={3} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
                )}
                <polyline points={ahead.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={col} strokeWidth={3} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" opacity={0.85} />
                {cableDraft.map((n, i) => (
                  <g key={i}>
                    <circle cx={n.x} cy={n.y} r={px(4.5)} fill={col} />
                    {label(formatLen(n.z, unit, false), n.x + px(14), n.y - px(12), 0, col)}
                  </g>
                ))}
                <circle cx={tgt.node.x} cy={tgt.node.y} r={px(tgt.deviceId ? 12 : 6)} fill={tgt.deviceId ? 'none' : 'var(--accent)'} stroke="var(--accent)" strokeWidth={px(2.5)} />
                {tgt.deviceId && label(`${deviceType(floor.devices.find((d) => d.id === tgt.deviceId)!.typeId).name} · ${formatLen(tgt.node.z, unit)}`, tgt.node.x, tgt.node.y - px(22), 0, 'var(--accent)')}
              </g>
            )
          })()}
          {tool === 'cable' && !cursor && cableDraft.length > 0 && (
            <g style={{ pointerEvents: 'none' }}>
              <polyline points={cableDraft.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={cableType(opts.cableTypeId).color} strokeWidth={3} vectorEffect="non-scaling-stroke" />
            </g>
          )}

          {/* Kalibrierung */}
          {tool === 'calibrate' && calib.a && (
            <g style={{ pointerEvents: 'none' }}>
              <circle cx={calib.a.x} cy={calib.a.y} r={px(5)} fill="var(--accent)" />
              {(() => {
                const b = calib.b ?? cursor
                if (!b) return null
                return (
                  <>
                    <line x1={calib.a.x} y1={calib.a.y} x2={b.x} y2={b.y} stroke="var(--accent)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
                    <circle cx={b.x} cy={b.y} r={px(5)} fill="var(--accent)" />
                    {label(formatLen(dist(calib.a, b), unit), (calib.a.x + b.x) / 2, (calib.a.y + b.y) / 2 - px(16), 0, 'var(--accent)')}
                  </>
                )
              })()}
            </g>
          )}
        </g>
      </svg>

      <PaneSwitch />

      <ToolOptionsBar
        cableNodes={cableDraft.length}
        onVertical={addVertical}
        onFinishCable={finishCable}
        onCancelCable={() => setCableDraft([])}
      />

      <div className="zoom glass" onPointerDown={(e) => e.stopPropagation()}>
        <button className="icon-btn" title="Verkleinern" onClick={() => zoomBy(1 / 1.3)}>
          <Minus size={16} />
        </button>
        <button className="icon-btn" title="Vergrößern" onClick={() => zoomBy(1.3)}>
          <Plus size={16} />
        </button>
        <button className="icon-btn" title="Einpassen (F)" onClick={fit}>
          <Maximize size={16} />
        </button>
      </div>

      {suggest?.floorId === floor.id && (
        <div className="suggest-bar">
          <span>{suggest.walls.length} erkannte Wände · Wand anklicken = entfernen</span>
          <button className="btn small primary" disabled={!suggest.walls.length} onClick={acceptSuggestion}>
            Übernehmen
          </button>
          <button className="btn small" onClick={() => setSuggest(null)}>
            Verwerfen
          </button>
        </div>
      )}

      <div className="status">
        <span className="hint-text">{HINTS[tool]}</span>
        {cursor && (
          <span className="coords">
            x {formatLen(cursor.x, unit)} · y {formatLen(cursor.y, unit)}
          </span>
        )}
      </div>

      {calib.a && calib.b && (
        <Modal
          title="Maßstab kalibrieren"
          width={420}
          onClose={() => setCalib({})}
          footer={
            <>
              <button className="btn" onClick={() => setCalib({})}>
                Abbrechen
              </button>
              <button className="btn primary" disabled={calibReal <= 0} onClick={applyCalibration}>
                Maßstab setzen
              </button>
            </>
          }
        >
          <p className="muted">
            Gemessen im Plan: <b>{formatLen(calibMeasured, unit)}</b>. Wie lang ist die Strecke in Wirklichkeit?
          </p>
          <div className="row-ctl wide">
            <LenField mm={calibReal} min={1} onCommit={setCalibReal} />
          </div>
          {floor.walls.length > 0 && (
            <p className="warn">Bereits gezeichnete Wände werden nicht mitskaliert. Besser zuerst kalibrieren, dann zeichnen.</p>
          )}
        </Modal>
      )}
    </div>
  )
}
