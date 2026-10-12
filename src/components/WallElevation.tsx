import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Maximize, Minus, Plus } from 'lucide-react'
import { openingDef, isGlazed, electricDefaults, cableType, deviceType, deviceType as deviceTypeById, devType, resolveDevice, resolveSpec, type DeviceType } from '../config/catalog'
import { useFloor, useStore } from '../store'
import type { CableNode, Floor, Wall } from '../types'
import { clamp, pointOnWall, projectOnWall, uid, wallLength } from '../lib/geom'
import { routeTo } from '../lib/cableRoute'
import { autoRef, lockAxis, snapWallPoint, type AutoRef } from '../lib/autoDims'
import { fillFor, missingFor } from '../lib/completeness'
import { syncDeviceNodes } from '../lib/link'
import { horizontalBands, verticalSpans } from '../lib/zones'
import { profileAt, wallProfile } from '../lib/roof'
import { formatLen } from '../lib/units'
import { DeviceFace } from './DeviceIcons'
import { ElevationDims, FreeDim } from './dims'
import { PaneSwitch } from './PaneSwitch'
import { ToolOptionsBar } from './ToolOptionsBar'

interface View {
  tx: number
  ty: number
  s: number // Pixel pro mm
}
type Drag =
  | { kind: 'pan'; sx: number; sy: number; tx0: number; ty0: number }
  | { kind: 'device'; id: string; dx: number; dz: number }
  | { kind: 'opening'; id: string; grab: number }

const MIN_S = 0.02
const MAX_S = 3
const ON_WALL_TOL = 80 // mm neben der Wandfläche, bis zu dem ein Leitungsknoten noch „in der Wand“ liegt

const HINTS: Record<string, string> = {
  select: 'Gerät / Öffnung anklicken und ziehen · Leertaste + Ziehen verschiebt die Ansicht · Mausrad zoomt',
  wall: 'Wände werden im Grundriss gezeichnet',
  opening: 'Auf die Wand klicken, um Tür, Fenster oder Hebe-Schiebetür zu setzen',
  device: 'Auf die Wand klicken, um das Gerät zu setzen · rastet an Zonen und anderen Geräten ein',
  cable: 'Klicken setzt Leitungspunkte – nur waagerecht oder senkrecht · rastet an Dosen/Schaltern ein · Enter beendet',
  measure: 'Zwei Punkte anklicken, um eine Maßlinie zu zeichnen · Umschalt = waagerecht/senkrecht · rastet an Objektmitten ein',
  calibrate: 'Der Maßstab wird im Grundriss kalibriert',
}

interface Guide {
  u?: number
  z?: number
}

/** Frontansicht einer Wand mit Installationszonen, Geräten und Leitungen (zum Einzeichnen). */
export default function WallElevation() {
  const floor = useFloor()
  const project = useStore((s) => s.project)
  const wallId = useStore((s) => s.elevWallId)
  const side = useStore((s) => s.elevSide)
  const selection = useStore((s) => s.selection)
  const tool = useStore((s) => s.tool)
  const opts = useStore((s) => s.opts)
  const unit = useStore((s) => s.unit)
  const showZones = useStore((s) => s.showZones)
  const showDims = useStore((s) => s.showDims)
  const colorBy = useStore((s) => s.colorBy)
  const edit = useStore((s) => s.edit)
  const select = useStore((s) => s.select)
  const setTool = useStore((s) => s.setTool)
  const showToast = useStore((s) => s.showToast)
  const createCable = useStore((s) => s.createCable)

  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<Drag | null>(null)
  const spaceRef = useRef(false)

  const [size, setSize] = useState({ w: 0, h: 0 })
  const [view, setView] = useState<View>({ tx: 40, ty: 40, s: 0.2 })
  const [panning, setPanning] = useState(false)
  const [cursor, setCursor] = useState<{ u: number; z: number } | null>(null)
  const [draft, setDraft] = useState<CableNode[]>([])
  const [measureA, setMeasureA] = useState<{ x: number; y: number } | null>(null)
  const [shiftDown, setShiftDown] = useState(false)

  const settings = project.settings
  const wall: Wall | undefined = floor.walls.find((w) => w.id === wallId)
  const L = wall ? wallLength(wall) : 0
  const H = wall ? (wall.height ?? floor.wallHeight) : floor.wallHeight
  const profile = useMemo(() => (wall ? wallProfile(floor, wall) : [{ u: 0, h: H }, { u: 0, h: H }]), [floor, wall, H])
  const flatTop = profile.every((p) => Math.abs(p.h - H) < 1)
  /** Liegt der Punkt (u, z) über der Dachschräge, also dort, wo keine Wand ist? */
  const aboveRoof = (u: number, z: number) => !flatTop && z > profileAt(profile, clamp(u, 0, L)) - 20
  const s = view.s
  const px = (n: number) => n / s
  /** Kleine Geräte werden bei weit herausgezoomter Ansicht vergrößert dargestellt, damit sie sichtbar bleiben. */
  const kOf = (dt: DeviceType) => Math.max(1, Math.min(4, 22 / (dt.w * s)))
  const X = useCallback((u: number) => (side === 1 ? u : L - u), [side, L])

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
    if (size.w < 50 || size.h < 50 || !L) return
    const padL = 84
    const padR = 120
    const padT = 76
    const padB = 92
    const availW = size.w - padL - padR
    const availH = size.h - padT - padB
    const sc = clamp(Math.min(availW / (L + 400), availH / (H + 400)), MIN_S, MAX_S)
    setView({
      s: sc,
      tx: padL + (availW - L * sc) / 2,
      ty: padT + (availH - H * sc) / 2 + H * sc,
    })
  }, [size.w, size.h, L, H])

  const fittedKey = useRef('')
  useEffect(() => {
    if (size.w < 50 || !wall) return
    const key = `${wall.id}|${side}|${Math.round(L)}|${Math.round(H)}`
    if (fittedKey.current !== key) {
      fittedKey.current = key
      fit()
    }
  }, [size.w, size.h, wall, side, L, H, fit])

  // Wand existiert nicht mehr → zurück zum Grundriss
  useEffect(() => {
    if (!wall) useStore.getState().closeElevation()
  }, [wall])

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = svg.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
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

  const zoomBy = (k: number) =>
    setView((v) => {
      const ns = clamp(v.s * k, MIN_S, MAX_S)
      const f = ns / v.s
      const cx = size.w / 2
      const cy = size.h / 2
      return { s: ns, tx: cx - (cx - v.tx) * f, ty: cy - (cy - v.ty) * f }
    })

  const toWall = (clientX: number, clientY: number): { u: number; z: number } => {
    const rect = svgRef.current!.getBoundingClientRect()
    const Xp = (clientX - rect.left - view.tx) / view.s
    const Yp = (clientY - rect.top - view.ty) / view.s
    return { u: side === 1 ? Xp : L - Xp, z: -Yp }
  }

  // --- Leitungen: Knoten ↔ Wandkoordinaten ---------------------------------
  const onWall = useCallback(
    (n: { x: number; y: number }) => {
      if (!wall) return null
      const r = projectOnWall(wall, n)
      return r.dist <= wall.thickness / 2 + ON_WALL_TOL ? r.t : null
    },
    [wall],
  )

  const nodeAt = (u: number, z: number, deviceId?: string): CableNode => {
    const p = pointOnWall(wall!, clamp(u, 0, L))
    return { x: p.x, y: p.y, z: clamp(z, 0, H), ...(deviceId ? { deviceId } : {}) }
  }

  // --- Einrasten ------------------------------------------------------------
  const devicesHere = useMemo(() => floor.devices.filter((d) => d.wallId === wallId), [floor.devices, wallId])
  const openingsHere = useMemo(() => floor.openings.filter((o) => o.wallId === wallId), [floor.openings, wallId])

  /** Einrasten auf Flucht mit anderen Geräten, Zonenmitten, Öffnungskanten und Raster. */
  const snapFree = (u: number, z: number, opt: { lockU?: number; lockZ?: number; ignore?: string } = {}) => {
    const tol = 12 / s
    const g = settings.grid
    const guide: Guide = {}
    let uu = u
    let zz = z
    if (opt.lockU === undefined) {
      const cands = [
        ...devicesHere.filter((d) => d.id !== opt.ignore).map((d) => d.offset),
        ...openingsHere.flatMap((o) => [o.offset, o.offset + o.width]),
      ]
      const hit = cands.reduce<number | null>((b, c) => (Math.abs(c - u) <= tol && (b === null || Math.abs(c - u) < Math.abs(b - u)) ? c : b), null)
      if (hit !== null) {
        uu = hit
        guide.u = hit
      } else uu = Math.round(u / g) * g
    } else uu = opt.lockU
    if (opt.lockZ === undefined) {
      const cands = [
        ...devicesHere.filter((d) => d.id !== opt.ignore).map((d) => d.height),
        ...horizontalBands(settings.zones, H).map((b) => b.center),
      ]
      const hit = cands.reduce<number | null>((b, c) => (Math.abs(c - z) <= tol && (b === null || Math.abs(c - z) < Math.abs(b - z)) ? c : b), null)
      if (hit !== null) {
        zz = hit
        guide.z = hit
      } else zz = Math.round(z / g) * g
    } else zz = opt.lockZ
    return { u: clamp(uu, 0, L), z: clamp(zz, 0, H), guide }
  }

  /** Ziel eines Leitungsklicks: Gerät (Mitte) oder waagerecht/senkrecht eingerastete Position. */
  const cableTarget = (rawU: number, rawZ: number): { node: CableNode; guide: Guide; device?: string } => {
    // 1. Dosen / Schalter / Geräte – auch in der Nähe der Frontplatte
    const tol = 14 / s
    let best: { id: string; d: number } | null = null
    for (const d of devicesHere) {
      const dt = devType(d, settings)
      const k = kOf(dt)
      const dx = Math.max(0, Math.abs(rawU - d.offset) - (dt.w * k) / 2)
      const dz = Math.max(0, Math.abs(rawZ - d.height) - (dt.h * k) / 2)
      const dd = Math.hypot(dx, dz)
      if (dd <= tol && (!best || dd < best.d)) best = { id: d.id, d: dd }
    }
    if (best) {
      const d = devicesHere.find((x) => x.id === best!.id)!
      return { node: nodeAt(d.offset, d.height, d.id), guide: { u: d.offset, z: d.height }, device: d.id }
    }
    // 2. nur waagerecht oder senkrecht relativ zum letzten Punkt
    const last = draft[draft.length - 1]
    const lu = last ? onWall(last) : null
    if (last && lu !== null) {
      const du = Math.abs(rawU - lu)
      const dz = Math.abs(rawZ - last.z)
      if (du >= dz) {
        const r = snapFree(rawU, last.z, { lockZ: last.z })
        return { node: nodeAt(r.u, last.z), guide: r.guide }
      }
      const r = snapFree(lu, rawZ, { lockU: lu })
      return { node: nodeAt(lu, r.z), guide: r.guide }
    }
    const r = snapFree(rawU, rawZ)
    return { node: nodeAt(r.u, r.z), guide: r.guide }
  }

  // --- Aktionen -------------------------------------------------------------
  const finishCable = useCallback(() => {
    if (draft.length >= 2) createCable(draft)
    setDraft([])
  }, [draft, createCable])

  const addCablePoint = (rawU: number, rawZ: number) => {
    const { node } = cableTarget(rawU, rawZ)
    if (aboveRoof(rawU, node.z)) {
      showToast('Hier ist keine Wand – über der Dachschräge.')
      return
    }
    const last = draft[draft.length - 1]
    if (!last) {
      setDraft([node])
      return
    }
    const more = routeTo(last, node, floor.walls)
    if (more.length) setDraft([...draft, ...more])
  }

  const placeDevice = (rawU: number, rawZ: number) => {
    if (!wall) return
    const mt = deviceTypeById(opts.deviceTypeId).mount
    if (mt && mt !== 'wall') {
      showToast('Decken- und Bodenleuchten werden im Grundriss gesetzt.')
      return
    }
    const dt = resolveSpec(opts.deviceTypeId, opts.spec, settings.seriesId).dt
    const r = snapFree(rawU, rawZ)
    if (aboveRoof(r.u, r.z)) {
      showToast('Hier ist keine Wand – über der Dachschräge.')
      return
    }
    const id = uid('d_')
    edit((p) => {
      const f = p.floors.find((x) => x.id === floor.id)
      f?.devices.push({ id, typeId: dt.id, wallId: wall.id, offset: r.u, side, height: r.z, ...electricDefaults(dt), ...(opts.circuitId ? { circuitId: opts.circuitId } : {}), ...opts.spec })
    })
    select({ kind: 'device', id })
  }

  /** Punkt des Lineals (u, z): rastet – wenn aktiv – an Objektmitten, Öffnungs-/Wandecken oder am Raster ein. */
  const measurePoint = (rawU: number, rawZ: number, shift: boolean) => {
    if (!wall) return { p: { x: rawU, y: rawZ }, kind: 'free' as const }
    const snapped = snapWallPoint(wall, H, devicesHere, openingsHere, { x: rawU, y: rawZ }, 14 / s, settings.grid, opts.snap)
    if (shift && measureA) return { ...snapped, p: lockAxis(measureA, opts.snap ? snapped.p : { x: clamp(rawU, 0, L), y: clamp(rawZ, 0, H) }) }
    return snapped
  }

  const addMeasurePoint = (rawU: number, rawZ: number, shift: boolean) => {
    if (!wall) return
    const { p } = measurePoint(rawU, rawZ, shift)
    if (!measureA) {
      setMeasureA(p)
      return
    }
    if (Math.hypot(p.x - measureA.x, p.y - measureA.y) < 1) return
    const id = uid('m_')
    const a = measureA
    edit((pr) => {
      const f = pr.floors.find((x) => x.id === floor.id)
      if (!f) return
      f.dims = f.dims ?? []
      f.dims.push({ id, space: 'wall', wallId: wall.id, a, b: p })
    })
    setMeasureA(null)
  }

  const placeOpening = (rawU: number) => {
    if (!wall) return
    const def = openingDef(opts.openingType)
    const width = Math.min(def.width, L)
    const id = uid('o_')
    const g = settings.grid
    edit((p) => {
      const f = p.floors.find((x) => x.id === floor.id)
      f?.openings.push({
        id,
        wallId: wall.id,
        type: opts.openingType,
        offset: clamp(Math.round((rawU - width / 2) / g) * g, 0, L - width),
        width,
        height: def.height,
        sill: def.sill,
      })
    })
    select({ kind: 'opening', id })
  }

  // --- Tastatur -------------------------------------------------------------
  useEffect(() => {
    const isTyping = (t: EventTarget | null) => {
      const el = t as HTMLElement | null
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')
    }
    const down = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return
      if (e.code === 'Space') {
        spaceRef.current = true
        e.preventDefault()
      } else if (e.key === 'Escape') {
        const st = useStore.getState()
        if (st.pickerOpen) st.setPickerOpen(false)
        else if (draft.length) setDraft([])
        else if (measureA) setMeasureA(null)
        else setTool('select')
      } else if (e.key === 'Enter') {
        if (tool === 'cable') finishCable()
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
  }, [draft, measureA, tool, finishCable, fit, setTool])

  useEffect(() => {
    setDraft([])
    setMeasureA(null)
  }, [tool, floor.id, wallId, side])

  // --- Zeiger ---------------------------------------------------------------
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
    if (e.button !== 0 || !wall) return
    const { u, z } = toWall(e.clientX, e.clientY)
    const inside = u >= -300 && u <= L + 300 && z >= -300 && z <= H + 300
    switch (tool) {
      case 'select':
        select({ kind: 'wall', id: wall.id })
        startPan(e)
        break
      case 'device':
        if (inside) placeDevice(u, z)
        break
      case 'opening':
        if (inside) placeOpening(u)
        break
      case 'cable':
        if (inside) addCablePoint(u, z)
        break
      case 'measure':
        if (inside) addMeasurePoint(u, z, e.shiftKey)
        break
      default:
        showToast('Dieses Werkzeug gibt es nur im Grundriss.')
    }
  }

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const raw = toWall(e.clientX, e.clientY)
    setCursor(raw)
    if (e.shiftKey !== shiftDown) setShiftDown(e.shiftKey)
    const d = dragRef.current
    if (!d) return
    if (d.kind === 'pan') {
      setView((v) => ({ ...v, tx: d.tx0 + (e.clientX - d.sx), ty: d.ty0 + (e.clientY - d.sy) }))
    } else if (d.kind === 'device') {
      const r = snapFree(raw.u - d.dx, raw.z - d.dz, { ignore: d.id })
      edit((p) => {
        const f = p.floors.find((x) => x.id === floor.id)
        const dv = f?.devices.find((x) => x.id === d.id)
        if (!f || !dv) return
        dv.offset = r.u
        dv.height = r.z
        syncDeviceNodes(f, dv.id)
      }, `dev:${d.id}`)
    } else if (d.kind === 'opening') {
      const g = settings.grid
      edit((p) => {
        const f = p.floors.find((x) => x.id === floor.id)
        const op = f?.openings.find((x) => x.id === d.id)
        if (!op) return
        op.offset = clamp(Math.round((raw.u - d.grab) / g) * g, 0, Math.max(0, L - op.width))
      }, `open:${d.id}`)
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

  const finishOnDouble = () => {
    if (tool === 'cable') finishCable()
  }
  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    if (tool === 'cable') finishCable()
  }

  const beginElementDrag = (e: React.PointerEvent, drag: Drag | null, sel: { kind: 'opening' | 'device' | 'cable' | 'dim'; id: string }) => {
    if (tool !== 'select' || e.button !== 0 || spaceRef.current) return
    e.stopPropagation()
    select(sel)
    if (!drag) return
    dragRef.current = drag
    svgRef.current?.setPointerCapture(e.pointerId)
  }

  // --- Darstellung ----------------------------------------------------------
  const label = (text: string, x: number, y: number, color = 'var(--ink)', anchor: 'middle' | 'start' | 'end' = 'middle', size = 12) => (
    <text
      x={x}
      y={y}
      fontSize={px(size)}
      textAnchor={anchor}
      dominantBaseline="central"
      fill={color}
      stroke="var(--paper)"
      strokeWidth={px(3.5)}
      style={{ paintOrder: 'stroke', pointerEvents: 'none', fontWeight: 600 }}
    >
      {text}
    </text>
  )

  const dim = (x1: number, y1: number, x2: number, y2: number, text: string, textDx = 0, textDy = 0) => {
    const tick = px(5)
    const horiz = Math.abs(y1 - y2) < 1e-6
    return (
      <g style={{ pointerEvents: 'none' }} stroke="var(--accent)" strokeWidth={px(1.3)} fill="none">
        <line x1={x1} y1={y1} x2={x2} y2={y2} />
        {horiz ? (
          <>
            <line x1={x1} y1={y1 - tick} x2={x1} y2={y1 + tick} />
            <line x1={x2} y1={y2 - tick} x2={x2} y2={y2 + tick} />
          </>
        ) : (
          <>
            <line x1={x1 - tick} y1={y1} x2={x1 + tick} y2={y1} />
            <line x1={x2 - tick} y1={y2} x2={x2 + tick} y2={y2} />
          </>
        )}
        {label(text, (x1 + x2) / 2 + textDx, (y1 + y2) / 2 + textDy, 'var(--accent)')}
      </g>
    )
  }

  /** Mittenbemaßung eines Objekts: Höhe ab OKFF + waagerecht zur nächsten Wandkante – bzw. nur zur Mitte eines Objekts auf gleicher Höhe. */
  const autoDimsFor = (u: number, z: number, dt: DeviceType, ignoreId?: string) => {
    if (!wall) return null
    const k = kOf(dt)
    const cx = X(u)
    const cy = -z
    const ref: AutoRef = autoRef(wall, devicesHere, u, z, ignoreId)
    const rx = X(ref.u)
    const xr = cx + (dt.w * k) / 2 + px(22)
    return (
      <g>
        {dim(xr, 0, xr, cy, formatLen(z, unit), px(38), 0)}
        {Math.abs(cx - rx) > 1 && dim(rx, cy, cx, cy, formatLen(Math.abs(cx - rx), unit), 0, -px(12))}
        {ref.kind === 'device' && <circle cx={rx} cy={cy} r={px(3)} fill="var(--accent)" />}
        <circle cx={cx} cy={cy} r={px(3)} fill="var(--accent)" />
      </g>
    )
  }

  const g = settings.grid
  const bands = useMemo(() => horizontalBands(settings.zones, H), [settings.zones, H])
  const spans = useMemo(() => (wall ? verticalSpans(wall, openingsHere, settings.zones) : []), [wall, openingsHere, settings.zones])

  // Leitungsabschnitte, die in dieser Wand liegen (zusammenhängende Läufe)
  const runs = useMemo(() => {
    const out: { cable: Floor['cables'][number]; pts: { u: number; z: number; deviceId?: string }[] }[] = []
    for (const c of floor.cables) {
      let cur: { u: number; z: number; deviceId?: string }[] = []
      for (const n of c.points) {
        const u = onWall(n)
        if (u === null) {
          if (cur.length > 1) out.push({ cable: c, pts: cur })
          cur = []
        } else cur.push({ u, z: n.z, deviceId: n.deviceId })
      }
      if (cur.length > 1) out.push({ cable: c, pts: cur })
    }
    return out
  }, [floor.cables, onWall])

  if (!wall) return <div className="editor2d" ref={wrapRef} />

  const selDevice = selection?.kind === 'device' ? devicesHere.find((d) => d.id === selection.id) : undefined
  const selOpening = selection?.kind === 'opening' ? openingsHere.find((o) => o.id === selection.id) : undefined
  const selCableId = selection?.kind === 'cable' ? selection.id : null

  // Vorschau
  const target = tool === 'cable' && cursor ? cableTarget(cursor.u, cursor.z) : null
  const preview = (() => {
    if (!target) return null
    const last = draft[draft.length - 1]
    if (!last) return [target.node]
    return [last, ...routeTo(last, target.node, floor.walls)]
  })()
  const ghostDev = tool === 'device' && cursor && (!deviceType(opts.deviceTypeId).mount || deviceType(opts.deviceTypeId).mount === 'wall') ? snapFree(cursor.u, cursor.z) : null
  const ghostOpen =
    tool === 'opening' && cursor
      ? (() => {
          const def = openingDef(opts.openingType)
          const width = Math.min(def.width, L)
          return { ...def, width, offset: clamp(Math.round((cursor.u - width / 2) / g) * g, 0, L - width) }
        })()
      : null

  const cursorStyle = panning ? 'grabbing' : tool === 'select' ? 'default' : 'crosshair'
  const gridMinor = g * s >= 7
  const topLine = profile.map((p) => `${X(p.u)},${-p.h}`).join(' ')
  const wallPoly = `${topLine} ${X(L)},0 ${X(0)},0`
  const abovePoly = `${topLine} ${X(L)},${-H} ${X(0)},${-H}`

  const sideDevice = (d: (typeof devicesHere)[number]) => d.side === side

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
        onDoubleClick={finishOnDouble}
        onContextMenu={onContextMenu}
      >
        <defs>
          <pattern id="elGridMinor" width={g} height={g} patternUnits="userSpaceOnUse">
            <path d={`M ${g} 0 L 0 0 0 ${g}`} fill="none" stroke="var(--grid-minor)" strokeWidth={px(1)} />
          </pattern>
          <pattern id="elGridMajor" width={1000} height={1000} patternUnits="userSpaceOnUse" y={-H % 1000}>
            <path d="M 1000 0 L 0 0 0 1000" fill="none" stroke="var(--grid-major)" strokeWidth={px(1)} />
          </pattern>
          <pattern id="elHatch" width={90} height={90} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1={0} y1={0} x2={0} y2={90} stroke="var(--ink-soft)" strokeWidth={px(1)} opacity={0.5} />
          </pattern>
        </defs>

        <g transform={`translate(${view.tx} ${view.ty}) scale(${s})`}>
          {/* Boden- und Deckenplatte */}
          <rect x={-300} y={0} width={L + 600} height={160} fill="url(#elHatch)" style={{ pointerEvents: 'none' }} />
          {flatTop && <rect x={-300} y={-H - 160} width={L + 600} height={160} fill="url(#elHatch)" style={{ pointerEvents: 'none' }} />}

          {/* Wandfläche (Oberkante folgt der Dachschräge) */}
          <clipPath id="elWallClip">
            <polygon points={wallPoly} />
          </clipPath>
          <polygon points={wallPoly} fill="var(--paper)" stroke="var(--wall)" strokeWidth={px(2)} />
          {!flatTop && (
            <g style={{ pointerEvents: 'none' }}>
              <polygon points={abovePoly} fill="url(#elHatch)" opacity={0.55} />
              <polyline points={topLine} fill="none" stroke="#ff9f0a" strokeWidth={px(3)} strokeLinejoin="round" />
              {label('Dachschräge – dort keine Wand', L / 2, -H + px(16), 'var(--ink-soft)', 'middle', 11)}
            </g>
          )}
          {gridMinor && <rect x={0} y={-H} width={L} height={H} fill="url(#elGridMinor)" clipPath="url(#elWallClip)" style={{ pointerEvents: 'none' }} />}

          {/* Installationszonen */}
          {showZones && (
            <g style={{ pointerEvents: 'none' }} clipPath="url(#elWallClip)">
              {spans.map(([a, b], i) => {
                const x0 = Math.min(X(a), X(b))
                return <rect key={'v' + i} x={x0} y={-H} width={Math.abs(b - a)} height={H} fill="var(--ok)" opacity={0.16} />
              })}
              {bands.map((b) => (
                <g key={b.id}>
                  <rect x={0} y={-(b.center + settings.zones.width / 2)} width={L} height={settings.zones.width} fill="var(--ok)" opacity={0.2} />
                  {label(b.label, px(8), -b.center - settings.zones.width / 2 - px(9), 'var(--ok)', 'start', 11)}
                </g>
              ))}
            </g>
          )}

          {/* OKFF / Deckenhöhe */}
          <line x1={-300} y1={0} x2={L + 300} y2={0} stroke="var(--wall)" strokeWidth={px(2.5)} style={{ pointerEvents: 'none' }} />
          {label('OKFF ±0', L + px(10), 0, 'var(--ink-soft)', 'start', 11)}
          {label(`Decke ${formatLen(H, unit)}`, L + px(10), -H, 'var(--ink-soft)', 'start', 11)}

          {/* Öffnungen */}
          {openingsHere.map((o) => {
            const sel = selection?.kind === 'opening' && selection.id === o.id
            const x0 = Math.min(X(o.offset), X(o.offset + o.width))
            const top = o.sill + o.height
            return (
              <g
                key={o.id}
                style={{ cursor: tool === 'select' ? 'pointer' : undefined }}
                onPointerDown={(e) => beginElementDrag(e, { kind: 'opening', id: o.id, grab: toWall(e.clientX, e.clientY).u - o.offset }, { kind: 'opening', id: o.id })}
              >
                <rect x={x0} y={-top} width={o.width} height={o.height} fill={isGlazed(o.type) ? 'var(--accent-soft)' : 'var(--canvas)'} stroke={sel ? 'var(--accent)' : 'var(--ink)'} strokeWidth={px(sel ? 2.5 : 1.4)} />
                {isGlazed(o.type) ? (
                  <g stroke="var(--ink)" strokeWidth={px(1)} opacity={0.6} style={{ pointerEvents: 'none' }}>
                    <line x1={x0 + o.width / 2} y1={-top} x2={x0 + o.width / 2} y2={-o.sill} />
                    <line x1={x0} y1={-o.sill - o.height / 2} x2={x0 + o.width} y2={-o.sill - o.height / 2} />
                  </g>
                ) : (
                  <circle cx={x0 + (X(o.offset) < X(o.offset + o.width) ? o.width - 90 : 90)} cy={-1000} r={26} fill="var(--ink-soft)" style={{ pointerEvents: 'none' }} />
                )}
                {sel && (
                  <>
                    {dim(x0, -top - px(16), x0 + o.width, -top - px(16), formatLen(o.width, unit), 0, -px(11))}
                    {dim(x0 - px(16), -o.sill, x0 - px(16), -top, formatLen(o.height, unit), -px(30), 0)}
                    {o.sill > 0 && dim(x0 + o.width + px(16), 0, x0 + o.width + px(16), -o.sill, formatLen(o.sill, unit), px(34), 0)}
                  </>
                )}
              </g>
            )
          })}

          {/* Führungslinien (Flucht mit anderen Geräten) */}
          {(() => {
            const gd = (target?.guide ?? (ghostDev ? ghostDev.guide : null)) as Guide | null
            if (!gd) return null
            return (
              <g style={{ pointerEvents: 'none' }} stroke="var(--accent)" strokeWidth={px(1)} strokeDasharray={`${px(5)} ${px(4)}`} opacity={0.7}>
                {gd.u !== undefined && <line x1={X(gd.u)} y1={-H} x2={X(gd.u)} y2={0} />}
                {gd.z !== undefined && <line x1={0} y1={-gd.z} x2={L} y2={-gd.z} />}
              </g>
            )
          })()}

          {/* Leitungen */}
          {runs.map((r, i) => {
            const ct = cableType(r.cable.typeId)
            const sel = selCableId === r.cable.id
            const pts = r.pts.map((p) => `${X(p.u)},${-p.z}`).join(' ')
            return (
              <g key={r.cable.id + i}>
                <polyline
                  points={pts}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={14}
                  vectorEffect="non-scaling-stroke"
                  style={{ pointerEvents: tool === 'select' ? 'stroke' : 'none', cursor: 'pointer' }}
                  onPointerDown={(e) => beginElementDrag(e, null, { kind: 'cable', id: r.cable.id })}
                />
                <polyline points={pts} fill="none" stroke={ct.color} strokeWidth={sel ? 5 : 3} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }} />
                {r.pts.map((p, k) => (
                  <g key={k}>
                    <circle cx={X(p.u)} cy={-p.z} r={px(sel ? 5 : 3.5)} fill={p.deviceId ? 'var(--paper)' : ct.color} stroke={ct.color} strokeWidth={px(1.8)} style={{ pointerEvents: 'none' }} />
                    {sel && label(formatLen(p.z, unit, false), X(p.u) + px(12), -p.z - px(11), ct.color)}
                  </g>
                ))}
              </g>
            )
          })}

          {/* Geräte (Rückseite blass) */}
          {[...devicesHere].sort((a, b) => Number(sideDevice(a)) - Number(sideDevice(b))).map((d) => {
            const dt = devType(d, settings)
            const sel = selection?.kind === 'device' && selection.id === d.id
            const front = sideDevice(d)
            const k = kOf(dt)
            const cx = X(d.offset)
            const cy = -d.height
            return (
              <g
                key={d.id}
                transform={`translate(${cx} ${cy}) scale(${k})`}
                opacity={front ? 1 : 0.32}
                style={{ cursor: tool === 'select' ? 'pointer' : undefined }}
                onPointerDown={(e) => {
                  const w = toWall(e.clientX, e.clientY)
                  beginElementDrag(e, { kind: 'device', id: d.id, dx: w.u - d.offset, dz: w.z - d.height }, { kind: 'device', id: d.id })
                }}
              >
                <rect x={-dt.w / 2 - 12} y={-dt.h / 2 - 12} width={dt.w + 24} height={dt.h + 24} fill="transparent" />
                <DeviceFace dt={dt} />
                {colorBy !== 'type' && (
                  <g transform={`translate(${dt.w / 2} ${-dt.h / 2})`}>
                    <circle r={px(5) / k} fill={fillFor(d, dt, project, colorBy)} stroke="var(--paper)" strokeWidth={px(1.4) / k} />
                    {missingFor(d, dt).length > 0 && <circle r={px(8) / k} fill="none" stroke="var(--warn)" strokeWidth={px(1.5) / k} strokeDasharray={`${px(3) / k} ${px(2.5) / k}`} />}
                  </g>
                )}
                {sel && <rect x={-dt.w / 2 - 8} y={-dt.h / 2 - 8} width={dt.w + 16} height={dt.h + 16} rx={12} fill="none" stroke="var(--accent)" strokeWidth={px(2.5) / k} />}
                {!front && <rect x={-dt.w / 2} y={-dt.h / 2} width={dt.w} height={dt.h} fill="none" stroke="var(--ink-soft)" strokeDasharray={`${px(4) / k} ${px(3) / k}`} strokeWidth={px(1) / k} />}
              </g>
            )
          })}

          {showDims && <ElevationDims wall={wall} side={side} devices={devicesHere} openings={openingsHere} unit={unit} px={px} kOf={kOf} typeOf={(d) => resolveDevice(d, settings)} />}

          {/* Selbst gezeichnete Maßlinien */}
          {(floor.dims ?? [])
            .filter((m) => m.space === 'wall' && m.wallId === wall.id)
            .map((m) => (
              <FreeDim
                key={m.id}
                a={{ x: X(m.a.x), y: -m.a.y }}
                b={{ x: X(m.b.x), y: -m.b.y }}
                text={formatLen(Math.hypot(m.b.x - m.a.x, m.b.y - m.a.y), unit)}
                px={px}
                selected={selection?.kind === 'dim' && selection.id === m.id}
                onPointerDown={tool === 'select' ? (e) => beginElementDrag(e, null, { kind: 'dim', id: m.id }) : undefined}
              />
            ))}
          {tool === 'measure' && cursor && (() => {
            const r = measurePoint(cursor.u, cursor.z, shiftDown)
            const P = (q: { x: number; y: number }) => ({ x: X(q.x), y: -q.y })
            return (
              <g style={{ pointerEvents: 'none' }}>
                {measureA && <FreeDim a={P(measureA)} b={P(r.p)} text={formatLen(Math.hypot(r.p.x - measureA.x, r.p.y - measureA.y), unit)} px={px} color="var(--accent)" ghost />}
                {measureA && <circle cx={P(measureA).x} cy={P(measureA).y} r={px(4)} fill="var(--accent)" />}
                <circle cx={P(r.p).x} cy={P(r.p).y} r={px(r.kind === 'device' ? 8 : 5)} fill={r.kind === 'device' ? 'none' : 'var(--accent)'} stroke="var(--accent)" strokeWidth={px(2)} />
                {r.kind === 'device' && label('Mitte', P(r.p).x, P(r.p).y - px(16), 'var(--accent)')}
              </g>
            )
          })()}

          {/* Maße des gewählten Geräts */}
          {selDevice && (() => {
            const cx = X(selDevice.offset)
            const y = -selDevice.height
            const dt = devType(selDevice, settings)
            const k = kOf(dt)
            return (
              <g>
                {autoDimsFor(selDevice.offset, selDevice.height, dt, selDevice.id)}
                {label(`${dt.name}${selDevice.side === side ? '' : ' (Rückseite)'}`, cx, y - (dt.h * k) / 2 - px(18), 'var(--accent)')}
              </g>
            )
          })()}
          {selOpening && null}

          {/* Platzierungs-Vorschau */}
          {ghostDev && (() => {
            const dt = resolveSpec(opts.deviceTypeId, opts.spec, settings.seriesId).dt
            const k = kOf(dt)
            const cx = X(ghostDev.u)
            const cy = -ghostDev.z
            return (
              <g style={{ pointerEvents: 'none' }}>
                <g transform={`translate(${cx} ${cy}) scale(${k})`} opacity={0.65}>
                  <DeviceFace dt={dt} />
                </g>
                {autoDimsFor(ghostDev.u, ghostDev.z, dt)}
              </g>
            )
          })()}
          {ghostOpen && (
            <rect
              x={Math.min(X(ghostOpen.offset), X(ghostOpen.offset + ghostOpen.width))}
              y={-(ghostOpen.sill + ghostOpen.height)}
              width={ghostOpen.width}
              height={ghostOpen.height}
              fill="var(--accent)"
              opacity={0.3}
              style={{ pointerEvents: 'none' }}
            />
          )}

          {/* Leitungsentwurf */}
          {tool === 'cable' && (
            <g style={{ pointerEvents: 'none' }}>
              {draft.length > 0 && (
                <polyline
                  points={draft.map((p) => `${X(onWall(p) ?? 0)},${-p.z}`).join(' ')}
                  fill="none"
                  stroke={cableType(opts.cableTypeId).color}
                  strokeWidth={3}
                  vectorEffect="non-scaling-stroke"
                  strokeLinejoin="round"
                />
              )}
              {preview && (
                <polyline
                  points={preview.map((p) => `${X(onWall(p) ?? 0)},${-p.z}`).join(' ')}
                  fill="none"
                  stroke={cableType(opts.cableTypeId).color}
                  strokeWidth={3}
                  strokeDasharray="6 4"
                  vectorEffect="non-scaling-stroke"
                  opacity={0.8}
                />
              )}
              {draft.map((p, i) => (
                <circle key={i} cx={X(onWall(p) ?? 0)} cy={-p.z} r={px(4.5)} fill={cableType(opts.cableTypeId).color} />
              ))}
              {target && (
                <g>
                  <circle
                    cx={X(onWall(target.node) ?? 0)}
                    cy={-target.node.z}
                    r={px(target.device ? 11 : 6)}
                    fill={target.device ? 'none' : 'var(--accent)'}
                    stroke="var(--accent)"
                    strokeWidth={px(2.5)}
                  />
                  {(() => {
                    const tx = X(onWall(target.node) ?? 0)
                    const right = tx < L / 2
                    return label(
                      `${formatLen(target.node.z, unit)}${target.device ? ' · ' + deviceType(devicesHere.find((d) => d.id === target.device)!.typeId).name : ''}`,
                      tx + (right ? px(16) : -px(16)),
                      -target.node.z - px(16),
                      'var(--accent)',
                      right ? 'start' : 'end',
                    )
                  })()}
                </g>
              )}
            </g>
          )}
        </g>
      </svg>

      <PaneSwitch />
      <div className="wallbar glass" onPointerDown={(e) => e.stopPropagation()}>
        <WallControls />
      </div>

      <ToolOptionsBar
        mode="wall"
        cableNodes={draft.length}
        onVertical={() => undefined}
        onFinishCable={finishCable}
        onCancelCable={() => setDraft([])}
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

      <div className="status">
        <span className="hint-text">{HINTS[tool]}</span>
        {cursor && (
          <span className="coords">
            von links {formatLen(clamp(side === 1 ? cursor.u : L - cursor.u, 0, L), unit)} · Höhe {formatLen(clamp(cursor.z, 0, H), unit)}
          </span>
        )}
      </div>
    </div>
  )
}

/** Wandwahl, Blickrichtung und Zonenschalter. */
function WallControls() {
  const floor = useFloor()
  const wallId = useStore((s) => s.elevWallId)
  const side = useStore((s) => s.elevSide)
  const setSide = useStore((s) => s.setElevSide)
  const openElevation = useStore((s) => s.openElevation)
  const showZones = useStore((s) => s.showZones)
  const toggleZones = useStore((s) => s.toggleZones)
  const showDims = useStore((s) => s.showDims)
  const toggleDims = useStore((s) => s.toggleDims)
  const unit = useStore((s) => s.unit)
  const select = useStore((s) => s.select)

  return (
    <>
      <select
        className="wall-select"
        value={wallId ?? ''}
        onChange={(e) => {
          openElevation(e.target.value)
          select({ kind: 'wall', id: e.target.value })
        }}
        title="Wand wählen"
      >
        {floor.walls.map((w, i) => (
          <option key={w.id} value={w.id}>
            Wand {i + 1} · {formatLen(wallLength(w), unit)}
          </option>
        ))}
      </select>
      <div className="seg" role="tablist" title="Von welcher Seite der Wand du schaust">
        <button className={side === 1 ? 'on' : ''} onClick={() => setSide(1)}>
          Seite 1
        </button>
        <button className={side === -1 ? 'on' : ''} onClick={() => setSide(-1)}>
          Seite 2
        </button>
      </div>
      <button className={'btn small' + (showZones ? ' primary' : '')} onClick={toggleZones} title="Installationszonen nach DIN 18015-3 ein-/ausblenden">
        Zonen
      </button>
      <button className={'btn small' + (showDims ? ' primary' : '')} onClick={toggleDims} title="Bemaßung ein-/ausblenden">
        Maße
      </button>
    </>
  )
}
