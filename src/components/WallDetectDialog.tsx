import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Pipette, X } from 'lucide-react'
import { DEFAULT_CLASSES, VECTOR_CLASSES, classifyPixels, detectWallsCls, type ClassMode, type ColorClass, type DetectedWall, type DetectOpts } from '../lib/detectWalls'
import { uid } from '../lib/geom'
import { useStore } from '../store'
import { Modal } from './ui'

interface Params { minThickness: number; maxThickness: number; minLength: number; maxGap: number; hatch: number }
const DEFAULT_PARAMS: Params = { minThickness: 80, maxThickness: 500, minLength: 500, maxGap: 1300, hatch: 150 }

// Einstellungen bleiben für das nächste Geschoss erhalten
let lastClasses: ColorClass[] = DEFAULT_CLASSES
let lastVector: ColorClass[] = VECTOR_CLASSES
let lastParams: Params = DEFAULT_PARAMS

const MODE_LABEL: Record<ClassMode, string> = { wall: 'Wand (gefüllt / schraffiert)', outline: 'Wand (umrandete Fläche)', ignore: 'Ignorieren' }
const MAX_DIM = 2600
const key = (w: DetectedWall) => [w.a.x, w.a.y, w.b.x, w.b.y].map((v) => Math.round(v / 150)).join(',')
const hex = (c: ColorClass) => (c.kind === 'dark' ? '#000' : `rgb(${c.rgb?.join(',')})`)

function Slider({ label, value, min, max, step = 1, unit, onChange }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void }) {
  return (
    <label className="wd-slider">
      <span>
        {label} <b>{value}{unit}</b>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  )
}

export default function WallDetectDialog() {
  const open = useStore((s) => s.wallDetectOpen)
  if (!open) return null
  return <Inner />
}

function Inner() {
  const close = () => useStore.getState().setWallDetectOpen(false)
  const floorId = useStore((s) => s.activeFloorId)
  const floor = useStore((s) => s.project.floors.find((f) => f.id === s.activeFloorId)!)
  const url = useStore((s) => s.backgrounds[s.activeFloorId])
  const maskSrc = useStore((s) => s.backgrounds[s.activeFloorId + '~mask'])
  const edit = useStore((s) => s.edit)
  const showToast = useStore((s) => s.showToast)
  const bg = floor.background

  const [useVec, setUseVec] = useState(!!maskSrc)
  const [classesR, setClassesR] = useState<ColorClass[]>(lastClasses)
  const [classesV, setClassesV] = useState<ColorClass[]>(lastVector)
  const classes = useVec ? classesV : classesR
  const setClasses = useVec ? setClassesV : setClassesR
  const [params, setParams] = useState<Params>(lastParams)
  const [showMask, setShowMask] = useState(false)
  const [pick, setPick] = useState(false)
  const [walls, setWalls] = useState<DetectedWall[]>([])
  const [off, setOff] = useState<Set<string>>(new Set())
  const [replace, setReplace] = useState(false)
  const [maskUrl, setMaskUrl] = useState('')
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [view, setView] = useState<{ x: number; y: number; w: number; h: number } | null>(null)

  const data = useRef<{ rgba: Uint8ClampedArray; w: number; h: number; mm: number } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const panRef = useRef<{ sx: number; sy: number; v: { x: number; y: number; w: number; h: number }; moved: boolean } | null>(null)

  const full = bg ? { w: bg.width * bg.mmPerPx, h: bg.height * bg.mmPerPx } : { w: 1, h: 1 }

  // Bild laden (auf Analyse-Auflösung verkleinert)
  useEffect(() => {
    if (!bg || !url) return
    let cancelled = false
    const im = new Image()
    im.onload = () => {
      if (cancelled) return
      const k = Math.min(1, MAX_DIM / Math.max(im.naturalWidth, im.naturalHeight))
      const w = Math.round(im.naturalWidth * k), h = Math.round(im.naturalHeight * k)
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      const ctx = c.getContext('2d', { willReadFrequently: true })!
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, w, h)
      ctx.drawImage(im, 0, 0, w, h)
      data.current = { rgba: ctx.getImageData(0, 0, w, h).data, w, h, mm: (bg.width * bg.mmPerPx) / w }
      setView({ x: 0, y: 0, w: bg.width * bg.mmPerPx, h: bg.height * bg.mmPerPx })
      setBusy(false)
      setClasses((c) => [...c])
    }
    im.onerror = () => setError('Bild konnte nicht gelesen werden')
    im.src = useVec && maskSrc ? maskSrc : url
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, maskSrc, useVec])

  // Erkennung (entprellt)
  useEffect(() => {
    if (useVec) lastVector = classes
    else lastClasses = classes
    lastParams = params
    const d = data.current
    if (!d) return
    const t = setTimeout(() => {
      const cls = classifyPixels(d.rgba, d.w * d.h, classes)
      const opts: DetectOpts = { ...params }
      setWalls(detectWallsCls(cls, d.w, d.h, d.mm, opts))
      if (showMask) {
        const c = document.createElement('canvas')
        c.width = d.w
        c.height = d.h
        const ctx = c.getContext('2d')!
        const img = ctx.createImageData(d.w, d.h)
        const col = [[0, 0, 0, 0], [0, 113, 227, 150], [255, 45, 85, 150], [255, 204, 0, 110]]
        for (let i = 0; i < cls.length; i++) {
          const v = col[cls[i]]
          img.data[i * 4] = v[0]; img.data[i * 4 + 1] = v[1]; img.data[i * 4 + 2] = v[2]; img.data[i * 4 + 3] = v[3]
        }
        ctx.putImageData(img, 0, 0)
        setMaskUrl(c.toDataURL('image/png'))
      } else setMaskUrl('')
    }, 150)
    return () => clearTimeout(t)
  }, [classes, params, showMask, busy, useVec])

  const active = useMemo(() => walls.filter((w) => !off.has(key(w))), [walls, off])
  const setClass = (id: string, patch: Partial<ColorClass>) => setClasses((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  const setP = (patch: Partial<Params>) => setParams((p) => ({ ...p, ...patch }))
  const toggle = (w: DetectedWall) =>
    setOff((o) => {
      const n = new Set(o)
      const k = key(w)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n
    })

  const toPlan = (e: { clientX: number; clientY: number }) => {
    const b = svgRef.current!.getBoundingClientRect()
    const v = view!
    return { x: v.x + ((e.clientX - b.left) / b.width) * v.w, y: v.y + ((e.clientY - b.top) / b.height) * v.h }
  }

  const sample = (p: { x: number; y: number }) => {
    const d = data.current
    if (!d) return
    const px = Math.round(p.x / d.mm), py = Math.round(p.y / d.mm)
    let r = 0, g = 0, b = 0, n = 0
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const x = px + dx, y = py + dy
        if (x < 0 || y < 0 || x >= d.w || y >= d.h) continue
        const i = (y * d.w + x) * 4
        r += d.rgba[i]; g += d.rgba[i + 1]; b += d.rgba[i + 2]; n++
      }
    if (!n) return
    const rgb: [number, number, number] = [Math.round(r / n), Math.round(g / n), Math.round(b / n)]
    const nc: ColorClass = { id: uid('cc_'), name: `Muster ${rgb.join(',')}`, kind: 'color', rgb, tol: 45, mode: 'wall', on: true, custom: true }
    setClasses((cs) => [nc, ...cs])
    setPick(false)
    showToast('Muster hinzugefügt – Modus und Toleranz rechts einstellen.')
  }

  const onDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!view) return
    panRef.current = { sx: e.clientX, sy: e.clientY, v: view, moved: false }
    svgRef.current!.setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = panRef.current
    if (!p) return
    const b = svgRef.current!.getBoundingClientRect()
    const dx = e.clientX - p.sx, dy = e.clientY - p.sy
    if (Math.abs(dx) + Math.abs(dy) > 4) p.moved = true
    if (p.moved) setView({ ...p.v, x: p.v.x - (dx / b.width) * p.v.w, y: p.v.y - (dy / b.height) * p.v.h })
  }
  const onUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = panRef.current
    panRef.current = null
    if (p && !p.moved && pick) sample(toPlan(e))
  }
  const onWheel = (e: React.WheelEvent) => {
    if (!view) return
    const f = e.deltaY > 0 ? 1.15 : 1 / 1.15
    const c = toPlan(e)
    setView({ x: c.x - (c.x - view.x) * f, y: c.y - (c.y - view.y) * f, w: view.w * f, h: view.h * f })
  }
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const h = (e: WheelEvent) => e.preventDefault()
    el.addEventListener('wheel', h, { passive: false })
    return () => el.removeEventListener('wheel', h)
  }, [busy])

  const accept = () => {
    if (!bg || !active.length) return
    const ox = bg.x ?? 0, oy = bg.y ?? 0
    edit((p) => {
      const f = p.floors.find((x) => x.id === floorId)
      if (!f) return
      if (replace) {
        f.walls = []
        f.openings = []
      }
      for (const w of active) {
        const id = uid('w_')
        f.walls.push({ id, a: { x: Math.round(w.a.x + ox), y: Math.round(w.a.y + oy) }, b: { x: Math.round(w.b.x + ox), y: Math.round(w.b.y + oy) }, thickness: w.thickness, kind: w.kind })
        // Lücken in der Schraffur → Türen (innen) bzw. Fenster (außen)
        for (const g of w.gaps ?? []) {
          const win = w.kind === 'outer'
          f.openings.push({ id: uid('o_'), wallId: id, type: win ? 'window' : 'door', offset: Math.round(g.from), width: Math.round(g.to - g.from), height: win ? 1350 : 2010, sill: win ? 900 : 0 })
        }
      }
    })
    const nOp = active.reduce((n, w) => n + (w.gaps?.length ?? 0), 0)
    showToast(`${active.length} Wände${nOp ? ` und ${nOp} Öffnungen` : ''} übernommen`)
    close()
  }

  if (!bg || !url)
    return (
      <Modal title="Wände erkennen" width={420} onClose={close}>
        <p className="muted">Zuerst einen Grundriss laden und den Maßstab kalibrieren.</p>
      </Modal>
    )

  const sw = Math.max(view?.w ?? 1, 1) / 900 // mm pro Bildschirmpixel (ungefähr)

  return (
    <Modal
      title="Wände erkennen"
      width={1180}
      onClose={close}
      footer={
        <>
          <label className="check" style={{ marginRight: 'auto' }}>
            <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} /> vorhandene Wände dieses Geschosses ersetzen
          </label>
          <button className="btn" onClick={close}>
            Abbrechen
          </button>
          <button className="btn primary" disabled={!active.length} onClick={accept}>
            {active.length} Wände übernehmen
          </button>
        </>
      }
    >
      <div className="wd">
        <div className="wd-stage">
          {busy ? (
            <p className="muted center" style={{ padding: 40 }}>
              <Loader2 className="spin" size={18} /> Plan wird geladen …
            </p>
          ) : (
            <svg
              ref={svgRef}
              viewBox={view ? `${view.x} ${view.y} ${view.w} ${view.h}` : '0 0 1 1'}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onWheel={onWheel}
              style={{ cursor: pick ? 'crosshair' : 'grab' }}
            >
              <rect x={0} y={0} width={full.w} height={full.h} fill="#fff" />
              <image href={url} x={0} y={0} width={full.w} height={full.h} opacity={showMask ? 0.5 : 0.85} preserveAspectRatio="none" />
              {showMask && maskUrl && <image href={maskUrl} x={0} y={0} width={full.w} height={full.h} preserveAspectRatio="none" style={{ pointerEvents: 'none' }} />}
              {walls.map((w, i) => {
                const on = !off.has(key(w))
                return (
                  <g key={i} onClick={() => !pick && toggle(w)} style={{ cursor: 'pointer' }}>
                    <line x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y} stroke={on ? '#34c759' : '#8e8e93'} strokeWidth={Math.max(w.thickness, sw * 6)} opacity={showMask ? 0.15 : on ? 0.55 : 0.3} />
                    <line x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y} stroke={on ? '#1d8a3a' : '#636368'} strokeWidth={sw * 1.5} strokeDasharray={on ? undefined : `${sw * 5} ${sw * 4}`} />
                  </g>
                )
              })}
            </svg>
          )}
          <div className="wd-hint">Mausrad = Zoom · ziehen = verschieben · Wand anklicken = an/abwählen</div>
        </div>

        <div className="wd-side">
          {maskSrc && (
            <label className="check" style={{ marginBottom: 8 }}>
              <input type="checkbox" checked={useVec} onChange={(e) => { setBusy(true); setUseVec(e.target.checked) }} /> <b>Vektor-Maske aus dem PDF</b> (Schraffur &amp; Abbruch exakt, empfohlen)
            </label>
          )}
          <h4>Farben</h4>
          {classes.map((c) => (
            <div key={c.id} className={'wd-class' + (c.on ? '' : ' off')}>
              <div className="wd-class-head">
                <input type="checkbox" checked={c.on} onChange={(e) => setClass(c.id, { on: e.target.checked })} />
                <span className="wd-sw" style={{ background: hex(c) }} />
                <span className="wd-name">{c.name}</span>
                {c.custom && (
                  <button className="icon-btn" aria-label="Muster entfernen" onClick={() => setClasses((cs) => cs.filter((x) => x.id !== c.id))}>
                    <X size={14} />
                  </button>
                )}
              </div>
              <select value={c.mode} onChange={(e) => setClass(c.id, { mode: e.target.value as ClassMode })}>
                {(Object.keys(MODE_LABEL) as ClassMode[]).map((m) => (
                  <option key={m} value={m}>
                    {MODE_LABEL[m]}
                  </option>
                ))}
              </select>
              <Slider label={c.kind === 'dark' ? 'Helligkeit bis' : 'Farbtoleranz'} value={c.tol} min={c.kind === 'dark' ? 10 : 5} max={c.kind === 'dark' ? 250 : 220} onChange={(v) => setClass(c.id, { tol: v })} />
            </div>
          ))}
          <div className="btn-row">
            <button className={'btn small' + (pick ? ' primary' : '')} onClick={() => setPick((v) => !v)}>
              <Pipette size={14} style={{ verticalAlign: -2 }} /> Muster aus Plan aufnehmen
            </button>
            <button className="btn small" onClick={() => setClasses(useVec ? VECTOR_CLASSES : DEFAULT_CLASSES)}>
              Zurücksetzen
            </button>
          </div>
          {pick && <p className="muted small">Jetzt im Plan auf eine Wandfläche bzw. Schraffurlinie klicken.</p>}
          <label className="check">
            <input type="checkbox" checked={showMask} onChange={(e) => setShowMask(e.target.checked)} /> Farbmaske zeigen (blau = Wand, rot = Umriss, gelb = ignoriert)
          </label>

          <h4>Geometrie</h4>
          <Slider label="Mindestdicke" value={params.minThickness} min={30} max={300} step={10} unit=" mm" onChange={(v) => setP({ minThickness: v })} />
          <Slider label="Höchstdicke" value={params.maxThickness} min={150} max={1000} step={10} unit=" mm" onChange={(v) => setP({ maxThickness: v })} />
          <Slider label="Mindestlänge" value={params.minLength} min={200} max={3000} step={50} unit=" mm" onChange={(v) => setP({ minLength: v })} />
          <Slider label="Lücken überbrücken (Türen)" value={params.maxGap} min={0} max={3000} step={50} unit=" mm" onChange={(v) => setP({ maxGap: v })} />
          <Slider label="Schraffurabstand schließen" value={params.hatch} min={50} max={500} step={10} unit=" mm" onChange={(v) => setP({ hatch: v })} />

          <h4>
            Erkannte Wände ({active.length}/{walls.length})
          </h4>
          <div className="btn-row">
            <button className="btn small" onClick={() => setOff(new Set())}>
              Alle
            </button>
            <button className="btn small" onClick={() => setOff(new Set(walls.map(key)))}>
              Keine
            </button>
            <button className="btn small" onClick={() => setOff(new Set(walls.filter((w) => !off.has(key(w))).map(key)))}>
              Umkehren
            </button>
          </div>
          <div className="wd-list">
            {walls.map((w, i) => (
              <label key={i} className="check">
                <input type="checkbox" checked={!off.has(key(w))} onChange={() => toggle(w)} />
                {w.a.y === w.b.y ? '↔' : '↕'} {(Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) / 1000).toFixed(2).replace('.', ',')} m · {Math.round(w.thickness / 10)} cm
              </label>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  )
}
