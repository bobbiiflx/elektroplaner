import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Maximize, Minus, Plus } from 'lucide-react'
import { DOOR_DEFAULT, WINDOW_DEFAULT, cableType, deviceType, electricDefaults, type DeviceCategory } from '../config/catalog'
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
  opening: 'Auf eine Wand klicken, um eine Tür bzw. ein Fenster zu setzen',
  device: 'Auf eine Wand klicken, um das Gerät zu setzen',
  cable: 'Leitungen laufen nur waagerecht/senkrecht · Dose oder Schalter anklicken verbindet · Enter beendet · Detailarbeit in der Wandansicht (E)',
  measure: 'Zwei Punkte anklicken, um eine Maßlinie zu zeichnen · Umschalt = waagerecht/senkrecht · rastet an Objektmitten ein',
  calibrate: 'Zwei Punkte mit bekanntem Abstand anklicken',
}

export default function Editor2D() {
  const floor = useFloor()
  const project = useStore((s) => s.project)
  const backgrounds = useStore((s) => s.backgrounds)
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
  const [cursor, setCursor] = useState<Vec2 | null>(null)
  const [panning, setPanning] = useState(false)
  const [draft, setDraft] = useState<{ first: Vec2; last: Vec2 } | null>(null)
  const [cableDraft, setCableDraft] = useState<CableNode[]>([])
  const [calib, setCalib] = useState<{ a?: Vec2; b?: Vec2 }>({})
  const [calibReal, setCalibReal] = useState(0)
  const [measureA, setMeasureA] = useState<Vec2 | null>(null)
  const [shiftDown, setShiftDown] = useState(false)

  const settings = project.settings
  const bg = floor.background
  const bgUrl = backgrounds[floor.id]
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
        else if (draft || cableDraft.length || calib.a || measureA) cancelDrafts()
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
  }, [draft, cableDraft, calib.a, measureA, tool, cancelDrafts, finishCable, fit, setTool])

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

  const placeOpening = (raw: Vec2) => {
    const hit = nearestWall(floor.walls, raw, 400)
    if (!hit) {
      showToast('Zum Platzieren auf eine Wand klicken.')
      return
    }
    const def = opts.openingType === 'door' ? DOOR_DEFAULT : WINDOW_DEFAULT
    const L = wallLength(hit.wall)
    const width = Math.min(def.width, L)
    const id = uid('o_')
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
        startPan(e)
        break
      case 'wall': {
        const { p } = snap(raw, draft?.last, orthoNow)
        addWallPoint(p)
        break
      }
      case 'opening':
        placeOpening(raw)
        break
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

  const beginElementDrag = (e: React.PointerEvent, drag: Drag | null, sel?: { kind: 'wall' | 'opening' | 'device' | 'cable' | 'dim'; id: string }) => {
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
    return hit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, tool, floor.walls])

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
          <pattern id="gridMajor" width={1000} height={1000} patternUnits="userSpaceOnUse">
            <path d="M 1000 0 L 0 0 0 1000" fill="none" stroke="var(--grid-major)" strokeWidth={px(1)} />
          </pattern>
        </defs>

        <g transform={`translate(${view.tx} ${view.ty}) scale(${s})`}>
          {bg && bgUrl && (
            <image
              href={bgUrl}
              x={0}
              y={0}
              width={bg.width * bg.mmPerPx}
              height={bg.height * bg.mmPerPx}
              opacity={bg.opacity}
              preserveAspectRatio="none"
              style={{ pointerEvents: 'none' }}
            />
          )}
          {g * s >= 7 && <rect x={vis.x0} y={vis.y0} width={vis.w} height={vis.h} fill="url(#gridMinor)" style={{ pointerEvents: 'none' }} />}
          {1000 * s >= 12 && <rect x={vis.x0} y={vis.y0} width={vis.w} height={vis.h} fill="url(#gridMajor)" style={{ pointerEvents: 'none' }} />}

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
                {o.type === 'door' ? (
                  <>
                    <line x1={o.offset} y1={0} x2={o.offset} y2={o.width} stroke="var(--ink)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                    <path d={`M ${o.offset} ${o.width} A ${o.width} ${o.width} 0 0 0 ${o.offset + o.width} 0`} fill="none" stroke="var(--ink-soft)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                  </>
                ) : (
                  <>
                    <rect x={o.offset} y={-t / 2} width={o.width} height={t} fill="none" stroke="var(--ink)" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
                    <line x1={o.offset} y1={0} x2={o.offset + o.width} y2={0} stroke="var(--ink)" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
                  </>
                )}
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
            const def = opts.openingType === 'door' ? DOOR_DEFAULT : WINDOW_DEFAULT
            const L = wallLength(ghost.wall)
            const width = Math.min(def.width, L)
            const off = clamp(ghost.t - width / 2, 0, L - width)
            return (
              <g transform={`translate(${ghost.wall.a.x} ${ghost.wall.a.y}) rotate(${wallAngleDeg(ghost.wall)})`} style={{ pointerEvents: 'none' }}>
                <rect x={off} y={-ghost.wall.thickness / 2 - 2} width={width} height={ghost.wall.thickness + 4} fill="var(--accent)" opacity={0.35} />
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
