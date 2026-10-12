import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { mmPerPxFromScale, pageTexts, renderPage, type PdfDoc } from '../lib/pdf'
import { clampRect, inkBBox, labelsFromText, levelOf, nameBlocks, splitByWhitespace, type Rect } from '../lib/sheet'
import { useStore } from '../store'
import { NumberField } from './NumberField'
import { Modal, Row } from './ui'

export interface SheetSource {
  fileName: string
  doc?: PdfDoc
  page?: number
  /** Bilddatei (statt PDF): liefert Bild in gewünschter Größe */
  image?: (maxDim: number) => Promise<{ dataUrl: string; width: number; height: number }>
}

interface NamedRect extends Rect { name: string }
type Drag = { kind: 'new' | 'move' | 'size'; i: number; sx: number; sy: number; r0: Rect; corner?: number }

const NAMES = ['Keller', 'Erdgeschoss', '1. Obergeschoss', '2. Obergeschoss', '3. Obergeschoss', 'Dachgeschoss']

function loadImg(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const im = new Image()
    im.onload = () => res(im)
    im.onerror = () => rej(new Error('Bild konnte nicht gelesen werden'))
    im.src = url
  })
}

export default function SheetSplit({ source, onClose }: { source: SheetSource; onClose: () => void }) {
  const [prev, setPrev] = useState<{ url: string; w: number; h: number; pxPerPt?: number } | null>(null)
  const [rects, setRects] = useState<NamedRect[]>([])
  const [sel, setSel] = useState(-1)
  const [denom, setDenom] = useState(100)
  const [tight, setTight] = useState(true)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const grayRef = useRef<Uint8Array | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<Drag | null>(null)

  const detect = (gray: Uint8Array, w: number, h: number, labels: ReturnType<typeof labelsFromText>) => {
    const blocks = nameBlocks(splitByWhitespace(gray, w, h), labels)
    setRects(blocks.map((b) => ({ x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1, name: b.name ?? 'Geschoss' })))
    setNote(
      !blocks.length
        ? 'Keine Blöcke gefunden – bitte Geschosse per Ziehen markieren.'
        : labels.length
          ? `${blocks.length} Geschosse gefunden, Namen aus den Beschriftungen im PDF.`
          : `${blocks.length} Bereiche gefunden – bitte benennen.`,
    )
  }
  const labelsRef = useRef<ReturnType<typeof labelsFromText>>([])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = source.doc ? await renderPage(source.doc, source.page ?? 1, 2400) : await source.image!(2400)
        if (cancelled) return
        const im = await loadImg(r.dataUrl)
        const c = document.createElement('canvas')
        c.width = im.naturalWidth
        c.height = im.naturalHeight
        const ctx = c.getContext('2d', { willReadFrequently: true })!
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, c.width, c.height)
        ctx.drawImage(im, 0, 0)
        const d = ctx.getImageData(0, 0, c.width, c.height).data
        const gray = new Uint8Array(c.width * c.height)
        for (let i = 0; i < gray.length; i++) gray[i] = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) | 0
        grayRef.current = gray
        let labels: ReturnType<typeof labelsFromText> = []
        if (source.doc && 'pxPerPt' in r) {
          try {
            labels = labelsFromText(await pageTexts(source.doc, source.page ?? 1, (r as { pxPerPt: number }).pxPerPt))
          } catch {
            /* ohne Textebene */
          }
        }
        labelsRef.current = labels
        if (cancelled) return
        setPrev({ url: r.dataUrl, w: c.width, h: c.height, pxPerPt: 'pxPerPt' in r ? (r as { pxPerPt: number }).pxPerPt : undefined })
        detect(gray, c.width, c.height, labels)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toImg = (e: React.PointerEvent) => {
    const b = svgRef.current!.getBoundingClientRect()
    return { x: ((e.clientX - b.left) / b.width) * prev!.w, y: ((e.clientY - b.top) / b.height) * prev!.h }
  }

  const down = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!prev) return
    const p = toImg(e)
    const hs = prev.w * 0.012
    // Griff oder Rechteck getroffen?
    for (let i = rects.length - 1; i >= 0; i--) {
      const r = rects[i]
      const cs = [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]]
      const k = cs.findIndex(([x, y]) => Math.hypot(p.x - x, p.y - y) < hs * 1.6)
      if (k >= 0) {
        dragRef.current = { kind: 'size', i, sx: p.x, sy: p.y, r0: { ...r }, corner: k }
        setSel(i)
        svgRef.current!.setPointerCapture(e.pointerId)
        return
      }
    }
    for (let i = rects.length - 1; i >= 0; i--) {
      const r = rects[i]
      if (p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1) {
        dragRef.current = { kind: 'move', i, sx: p.x, sy: p.y, r0: { ...r } }
        setSel(i)
        svgRef.current!.setPointerCapture(e.pointerId)
        return
      }
    }
    const i = rects.length
    setRects((rs) => [...rs, { x0: p.x, y0: p.y, x1: p.x, y1: p.y, name: NAMES[Math.min(i, NAMES.length - 1)] }])
    dragRef.current = { kind: 'new', i, sx: p.x, sy: p.y, r0: { x0: p.x, y0: p.y, x1: p.x, y1: p.y } }
    setSel(i)
    svgRef.current!.setPointerCapture(e.pointerId)
  }
  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = dragRef.current
    if (!d || !prev) return
    const p = toImg(e)
    const dx = p.x - d.sx, dy = p.y - d.sy
    setRects((rs) =>
      rs.map((r, i) => {
        if (i !== d.i) return r
        let n: Rect
        if (d.kind === 'new') n = { x0: d.sx, y0: d.sy, x1: p.x, y1: p.y }
        else if (d.kind === 'move') n = { x0: d.r0.x0 + dx, y0: d.r0.y0 + dy, x1: d.r0.x1 + dx, y1: d.r0.y1 + dy }
        else {
          n = { ...d.r0 }
          if (d.corner === 0 || d.corner === 3) n.x0 = d.r0.x0 + dx
          if (d.corner === 1 || d.corner === 2) n.x1 = d.r0.x1 + dx
          if (d.corner === 0 || d.corner === 1) n.y0 = d.r0.y0 + dy
          if (d.corner === 2 || d.corner === 3) n.y1 = d.r0.y1 + dy
        }
        return { ...r, ...clampRect(n, prev.w, prev.h) }
      }),
    )
  }
  const up = () => {
    const d = dragRef.current
    dragRef.current = null
    if (d?.kind === 'new' && prev)
      setRects((rs) => rs.filter((r, i) => i !== d.i || ((r.x1 - r.x0) * (r.y1 - r.y0) > prev.w * prev.h * 0.01)))
  }

  const sorted = useMemo(
    () => rects.map((r, i) => ({ r, i })).sort((a, b) => (levelOf(a.r.name)?.level ?? 500 + a.i) - (levelOf(b.r.name)?.level ?? 500 + b.i)),
    [rects],
  )

  const doImport = async () => {
    if (!prev || !rects.length) return
    setBusy(true)
    setError(null)
    try {
      const big = source.doc ? await renderPage(source.doc, source.page ?? 1, 7000) : await source.image!(6000)
      const bim = await loadImg(big.dataUrl)
      const k = bim.naturalWidth / prev.w
      const sheetId = 'sh_' + Date.now().toString(36)
      const mmPerPx = source.doc && 'pxPerPt' in big ? mmPerPxFromScale((big as { pxPerPt: number }).pxPerPt, denom) : 0
      const gray = grayRef.current!
      const items: Parameters<ReturnType<typeof useStore.getState>['addSheetFloors']>[0] = []
      let guessWidth = 0
      for (const { r } of sorted) {
        const t = tight ? inkBBox(gray, prev.w, { x0: Math.floor(r.x0), y0: Math.floor(r.y0), x1: Math.ceil(r.x1), y1: Math.ceil(r.y1) }, 190) ?? r : r
        const pad = Math.round(prev.w * 0.006)
        const c = clampRect({ x0: t.x0 - pad, y0: t.y0 - pad, x1: t.x1 + pad, y1: t.y1 + pad }, prev.w, prev.h)
        const sx = Math.round(c.x0 * k), sy = Math.round(c.y0 * k)
        const sw = Math.max(8, Math.round((c.x1 - c.x0) * k)), sh = Math.max(8, Math.round((c.y1 - c.y0) * k))
        const cv = document.createElement('canvas')
        cv.width = sw
        cv.height = sh
        cv.getContext('2d')!.drawImage(bim, sx, sy, sw, sh, 0, 0, sw, sh)
        guessWidth = guessWidth || sw
        items.push({ name: r.name.trim() || 'Geschoss', dataUrl: cv.toDataURL('image/png'), bg: { width: sw, height: sh, mmPerPx, opacity: 0.7, source: `${source.fileName} · ${r.name}`, sheetId } })
      }
      const fallback = 12000 / (guessWidth || 1)
      for (const it of items) if (!it.bg.mmPerPx) it.bg.mmPerPx = fallback
      const st = useStore.getState()
      st.addSheetFloors(items)
      st.setTool('anchor')
      st.setGhostBelow(true)
      st.showToast(`${items.length} Geschosse angelegt. Maßstab einmal kalibrieren (gilt für alle), dann pro Geschoss einen Passpunkt setzen.`)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Mehrere Geschosse auf einem Blatt"
      width={900}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn primary" disabled={!rects.length || busy} onClick={doImport}>
            {busy ? 'Schneide aus …' : `${rects.length} Geschosse anlegen`}
          </button>
        </>
      }
    >
      <p className="muted small">
        Rechtecke ziehen = neuer Ausschnitt · Rechteck verschieben/Ecken ziehen = anpassen. {note}
      </p>
      {error && <p className="warn">{error}</p>}
      {!prev && !error && (
        <p className="muted center">
          <Loader2 className="spin" size={18} /> Blatt wird analysiert …
        </p>
      )}
      {prev && (
        <div className="sheet-stage" style={{ maxWidth: `${(52 * prev.w) / prev.h}vh`, marginInline: "auto" }}>
          <img src={prev.url} alt="Plan" draggable={false} />
          <svg ref={svgRef} viewBox={`0 0 ${prev.w} ${prev.h}`} onPointerDown={down} onPointerMove={move} onPointerUp={up}>
            {rects.map((r, i) => (
              <g key={i}>
                <rect x={r.x0} y={r.y0} width={r.x1 - r.x0} height={r.y1 - r.y0} fill="rgba(0,113,227,0.10)" stroke="#0071e3" strokeWidth={prev.w * (i === sel ? 0.004 : 0.002)} />
                <text x={r.x0 + prev.w * 0.006} y={r.y0 + prev.w * 0.02} fontSize={prev.w * 0.016} fill="#0062c4" fontWeight={600}>
                  {r.name}
                </text>
                {[[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]].map(([x, y], j) => (
                  <circle key={j} cx={x} cy={y} r={prev.w * 0.006} fill="#fff" stroke="#0071e3" strokeWidth={prev.w * 0.002} />
                ))}
              </g>
            ))}
          </svg>
        </div>
      )}
      {prev && (
        <>
          <div className="sheet-list">
            {sorted.map(({ r, i }) => (
              <div key={i} className={'sheet-row' + (i === sel ? ' on' : '')} onClick={() => setSel(i)}>
                <input list="sheet-names" value={r.name} onChange={(e) => setRects((rs) => rs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <button className="icon-btn" aria-label="Entfernen" onClick={() => setRects((rs) => rs.filter((_, j) => j !== i))}>
                  <X size={14} />
                </button>
              </div>
            ))}
            <datalist id="sheet-names">
              {NAMES.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </div>
          <div className="btn-row">
            <button className="btn small" onClick={() => grayRef.current && detect(grayRef.current, prev.w, prev.h, labelsRef.current)}>
              Neu erkennen
            </button>
            <button className="btn small" onClick={() => setRects([])}>
              Alle löschen
            </button>
            <label className="check">
              <input type="checkbox" checked={tight} onChange={(e) => setTight(e.target.checked)} /> Ausschnitte eng an die Zeichnung anpassen (richtet die Geschosse grob an der Außenkante aus)
            </label>
          </div>
          {source.doc && (
            <Row label="Planmaßstab" hint="Papierdruck 1 : x">
              <span className="prefix">1 :</span>
              <NumberField value={denom} decimals={0} min={1} onCommit={setDenom} />
            </Row>
          )}
        </>
      )}
    </Modal>
  )
}
