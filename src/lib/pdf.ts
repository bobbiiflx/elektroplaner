import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export type PdfDoc = pdfjs.PDFDocumentProxy

export interface RenderedPage {
  dataUrl: string
  width: number
  height: number
  /** Skalierungsfaktor Pixel pro PDF-Punkt (1 pt = 1/72 Zoll) */
  pxPerPt: number
}

export async function openPdf(file: File): Promise<PdfDoc> {
  const data = await file.arrayBuffer()
  return pdfjs.getDocument({ data }).promise
}

export async function renderPage(doc: PdfDoc, pageNo: number, maxDim: number): Promise<RenderedPage> {
  const page = await doc.getPage(pageNo)
  const base = page.getViewport({ scale: 1 })
  const pxPerPt = maxDim / Math.max(base.width, base.height)
  const viewport = page.getViewport({ scale: pxPerPt })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas nicht verfügbar')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvas, canvasContext: ctx, viewport }).promise
  const dataUrl = canvas.toDataURL('image/png')
  page.cleanup()
  return { dataUrl, width: canvas.width, height: canvas.height, pxPerPt }
}

/** mm im Plan pro Pixel, wenn die Seite im Maßstab 1:denominator gedruckt wurde. */
export function mmPerPxFromScale(pxPerPt: number, denominator: number): number {
  const paperMmPerPx = 25.4 / 72 / pxPerPt
  return paperMmPerPx * denominator
}

export async function imageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => reject(new Error('Bild konnte nicht gelesen werden'))
    img.src = dataUrl
  })
}

/** Liest ein Bild und verkleinert es bei Bedarf auf maxDim (längste Kante). */
export async function loadImage(file: File, maxDim: number): Promise<{ dataUrl: string; width: number; height: number }> {
  const raw = await readFileAsDataUrl(file)
  const { width, height } = await imageSize(raw)
  const k = Math.min(1, maxDim / Math.max(width, height))
  if (k >= 1) return { dataUrl: raw, width, height }
  const img = new Image()
  await new Promise<void>((res, rej) => {
    img.onload = () => res()
    img.onerror = () => rej(new Error('Bild konnte nicht gelesen werden'))
    img.src = raw
  })
  const w = Math.round(width * k)
  const h = Math.round(height * k)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas nicht verfügbar')
  ctx.drawImage(img, 0, 0, w, h)
  const jpeg = file.type === 'image/jpeg'
  return { dataUrl: canvas.toDataURL(jpeg ? 'image/jpeg' : 'image/png', 0.92), width: w, height: h }
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

/** Textstücke der Seite in Pixelkoordinaten des mit pxPerPt gerenderten Bildes (nur bei PDFs mit Textebene). */
export async function pageTexts(doc: PdfDoc, pageNo: number, pxPerPt: number): Promise<{ str: string; x: number; y: number; w: number; h: number }[]> {
  const page = await doc.getPage(pageNo)
  const viewport = page.getViewport({ scale: pxPerPt })
  const content = await page.getTextContent()
  const out: { str: string; x: number; y: number; w: number; h: number }[] = []
  for (const it of content.items) {
    if (!('str' in it) || !it.str.trim()) continue
    const t = pdfjs.Util.transform(viewport.transform, it.transform)
    const h = Math.hypot(t[2], t[3])
    out.push({ str: it.str, x: t[4], y: t[5] - h, w: it.width * pxPerPt, h })
  }
  page.cleanup()
  return out
}
