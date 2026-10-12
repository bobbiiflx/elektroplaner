import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { PdfDoc } from './pdf'

type M = [number, number, number, number, number, number]
const mul = (a: M, b: M): M => [
  a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
]
const ap = (m: M, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]

const parseHex = (c: string): [number, number, number] | null => {
  const m = /^#([0-9a-f]{6})$/i.exec(c)
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export interface MaskOpts {
  scale: number // Pixel je PDF-Punkt (wie beim Rendern des Blatts)
  x: number // Ausschnitt in Pixeln dieses Renderings
  y: number
  w: number
  h: number
  ptToMm: number // Plan-mm je PDF-Punkt (Maßstab 1:x → x · 25,4/72)
}

interface St { ctm: M; fill: string; stroke: string }

/**
 * Zeichnet aus den Vektordaten eine Wand-Maske: kurze, nicht achsparallele Schraffurlinien (Länge ≈ Wanddicke · √2; schwarz oder rot) und gelbe Flächen (Abbruch) in der Reihenfolge wie im Plan. Liefert null, wenn keine Schraffur gefunden wurde.
 */
export async function renderWallMask(doc: PdfDoc, pageNo: number, o: MaskOpts): Promise<string | null> {
  const page = await doc.getPage(pageNo)
  const ol = await page.getOperatorList()
  const OPS = pdfjs.OPS
  const vp1 = page.getViewport({ scale: 1 })
  const vp = page.getViewport({ scale: o.scale })
  const vt1 = vp1.transform as unknown as M

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(o.w))
  canvas.height = Math.max(1, Math.round(o.h))
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.setTransform(vp.transform[0], vp.transform[1], vp.transform[2], vp.transform[3], vp.transform[4] - o.x, vp.transform[5] - o.y)
  ctx.lineCap = 'butt'

  let st: St = { ctm: [1, 0, 0, 1, 0, 0], fill: '#000000', stroke: '#000000' }
  const stack: St[] = []
  let pendingClip: 'evenodd' | 'nonzero' | null = null
  let drawn = 0

  const build = (d: ArrayLike<number>, path: Path2D) => {
    for (let i = 0; i < d.length; ) {
      const op = d[i]
      if (op === 0) { path.moveTo(d[i + 1], d[i + 2]); i += 3 }
      else if (op === 1) { path.lineTo(d[i + 1], d[i + 2]); i += 3 }
      else if (op === 2) { path.bezierCurveTo(d[i + 1], d[i + 2], d[i + 3], d[i + 4], d[i + 5], d[i + 6]); i += 7 }
      else if (op === 3) { path.quadraticCurveTo(d[i + 1], d[i + 2], d[i + 3], d[i + 4]); i += 5 }
      else if (op === 4) { path.closePath(); i += 1 }
      else i += 1
    }
  }
  /** Eckpunkte in Seiten-Punkten (y nach unten) */
  const pts = (d: ArrayLike<number>) => {
    const out: [number, number][] = []
    const m = mul(vt1, st.ctm)
    for (let i = 0; i < d.length; ) {
      const op = d[i]
      if (op === 0 || op === 1) { out.push(ap(m, d[i + 1], d[i + 2])); i += 3 }
      else if (op === 2) { out.push(ap(m, d[i + 5], d[i + 6])); i += 7 }
      else if (op === 3) { out.push(ap(m, d[i + 3], d[i + 4])); i += 5 }
      else i += 1
    }
    return out
  }

  const isYellow = (c: string) => {
    const r = parseHex(c)
    return !!r && r[0] > 220 && r[1] > 200 && r[2] < 150 && r[0] - r[2] > 90
  }
  const strokeColor = (c: string): string | null => {
    const r = parseHex(c)
    if (!r) return null
    if (r[0] > 150 && r[1] < 110 && r[2] < 110) return '#ff0000'
    if (Math.max(...r) - Math.min(...r) < 60 && r[0] < 200) return '#000000'
    return null
  }

  for (let i = 0; i < ol.fnArray.length; i++) {
    const f = ol.fnArray[i]
    const a = ol.argsArray[i] as unknown[]
    if (f === OPS.save) { stack.push({ ...st, ctm: [...st.ctm] as M }); ctx.save() }
    else if (f === OPS.restore) { const p = stack.pop(); if (p) { st = p; ctx.restore() } }
    else if (f === OPS.transform) { const t = a as unknown as M; st.ctm = mul(st.ctm, t); ctx.transform(t[0], t[1], t[2], t[3], t[4], t[5]) }
    else if (f === OPS.setFillRGBColor) st.fill = a[0] as string
    else if (f === OPS.setStrokeRGBColor) st.stroke = a[0] as string
    else if (f === OPS.eoClip) pendingClip = 'evenodd'
    else if (f === OPS.clip) pendingClip = 'nonzero'
    else if (f === OPS.constructPath) {
      const op = a[0] as number
      const data = (a[1] as ArrayLike<number>[])[0]
      if (!data) continue
      if (op === OPS.endPath) {
        if (pendingClip) {
          const p = new Path2D()
          build(data, p)
          ctx.clip(p, pendingClip)
          pendingClip = null
        }
        continue
      }
      pendingClip = null
      if ((op === OPS.stroke || op === OPS.closeStroke || op === OPS.fillStroke)) {
        const col = strokeColor(st.stroke)
        if (col) {
          const m = mul(vt1, st.ctm)
          const sc = Math.hypot(st.ctm[0], st.ctm[1]) || 1
          const seg = new Path2D()
          let n = 0
          // Schraffur = einzelne 2-Punkt-Striche; Möbel/Symbole sind Polylinien oder Kurven
          let nodes = 0
          for (let k = 0; k < data.length; ) { const c = data[k]; if (c === 0 || c === 1) { nodes++; k += 3 } else if (c === 2) { nodes += 9; k += 7 } else if (c === 3) { nodes += 9; k += 5 } else k += 1 }
          let cur: [number, number] | null = null
          for (let k = 0; k < data.length; ) {
            const c = data[k]
            if (c === 0) { cur = [data[k + 1], data[k + 2]]; k += 3 }
            else if (c === 1 && cur) {
              const nx: [number, number] = [data[k + 1], data[k + 2]]
              const p0 = ap(m, cur[0], cur[1]), p1 = ap(m, nx[0], nx[1])
              const ang = (Math.abs(Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) * 180) / Math.PI) % 90
              const lenMm = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) * o.ptToMm
              if (nodes === 2 && ang > 30 && ang < 60 && lenMm >= 110 && lenMm <= 800) { seg.moveTo(cur[0], cur[1]); seg.lineTo(nx[0], nx[1]); n++ }
              cur = nx; k += 3
            } else if (c === 2) { cur = [data[k + 5], data[k + 6]]; k += 7 }
            else if (c === 3) { cur = [data[k + 3], data[k + 4]]; k += 5 }
            else k += 1
          }
          if (n) {
            ctx.strokeStyle = col
            ctx.lineWidth = 2.2 / (o.scale * sc)
            ctx.stroke(seg)
            drawn += n
          }
        }
      }
      if ((op === OPS.fill || op === OPS.eoFill || op === OPS.fillStroke) && isYellow(st.fill)) {
        const p = new Path2D()
        build(data, p)
        ctx.fillStyle = '#ffff00'
        ctx.fill(p, op === OPS.eoFill ? 'evenodd' : 'nonzero')
      }
    }
  }
  page.cleanup()
  return drawn > 20 ? canvas.toDataURL('image/png') : null
}
