// Mehrere Geschosse auf einem Plan: Beschriftungen lesen, Blöcke finden, Ausschnitte vorschlagen.

export interface LevelInfo {
  level: number // UG < 0, EG = 0, OG > 0, DG = 90
  name: string
}

export function levelOf(text: string): LevelInfo | null {
  const t = text.toLowerCase().replace(/\s+/g, ' ')
  let m = t.match(/(\d)\.?\s?(untergeschoss|ug)\b/)
  if (m) return { level: -Number(m[1]), name: `${m[1]}. Untergeschoss` }
  if (/kellergeschoss|\bkeller\b|\bkg\b/.test(t)) return { level: -1, name: 'Keller' }
  if (/untergeschoss|\bug\b/.test(t)) return { level: -1, name: 'Untergeschoss' }
  if (/erdgeschoss|\beg\b/.test(t)) return { level: 0, name: 'Erdgeschoss' }
  m = t.match(/(\d)\.?\s?(obergeschoss|og)\b/) ?? t.match(/\bog\s?(\d)\b/)
  if (m) {
    const n = Number(m[1])
    return { level: n, name: `${n}. Obergeschoss` }
  }
  if (/obergeschoss|\bog\b/.test(t)) return { level: 1, name: '1. Obergeschoss' }
  if (/staffelgeschoss/.test(t)) return { level: 80, name: 'Staffelgeschoss' }
  if (/dachgeschoss|\bdg\b|spitzboden|dachraum/.test(t)) return { level: 90, name: 'Dachgeschoss' }
  return null
}

export interface TextItem { str: string; x: number; y: number; w: number; h: number } // Pixel, y = Oberkante

export interface Label extends LevelInfo { x: number; y: number; h: number }

/** Fügt benachbarte Textstücke zu Zeilen zusammen und liest daraus Geschoss-Beschriftungen (größte je Geschoss). */
export function labelsFromText(items: TextItem[]): Label[] {
  const sorted = [...items].filter((i) => i.str.trim()).sort((a, b) => a.y - b.y || a.x - b.x)
  const lines: { str: string; x: number; y: number; xe: number; h: number }[] = []
  for (const it of sorted) {
    const line = lines.find((l) => Math.abs(l.y - it.y) < 0.6 * Math.max(l.h, it.h) && it.x - l.xe >= -it.h && it.x - l.xe < 3 * it.h)
    if (line) {
      line.str += ' ' + it.str.trim()
      line.xe = it.x + it.w
      line.h = Math.max(line.h, it.h)
    } else lines.push({ str: it.str.trim(), x: it.x, y: it.y, xe: it.x + it.w, h: it.h })
  }
  const best = new Map<number, Label>()
  for (const l of lines) {
    const lv = levelOf(l.str)
    if (!lv) continue
    const cur = best.get(lv.level)
    if (!cur || l.h > cur.h) best.set(lv.level, { ...lv, x: l.x, y: l.y, h: l.h })
  }
  return [...best.values()]
}

export interface Rect { x0: number; y0: number; x1: number; y1: number }
export interface Block extends Rect { name?: string; level?: number }

/** Dunkle Pixel (Tinte) -> Projektion. */
const isInk = (g: Uint8Array, i: number, thr: number) => g[i] < thr

export function inkBBox(g: Uint8Array, W: number, r: Rect, thr: number): Rect | null {
  let x0 = r.x1, y0 = r.y1, x1 = r.x0 - 1, y1 = r.y0 - 1
  for (let y = r.y0; y < r.y1; y++)
    for (let x = r.x0; x < r.x1; x++)
      if (isInk(g, y * W + x, thr)) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
  return x1 < x0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 }
}

function gaps(proj: number[], from: number, minGap: number, thr: number): [number, number][] {
  const out: [number, number][] = []
  let s = -1
  for (let i = 0; i <= proj.length; i++) {
    const empty = i < proj.length && proj[i] <= thr
    if (empty && s < 0) s = i
    if (!empty && s >= 0) {
      if (i - s >= minGap && s > 0 && i < proj.length) out.push([from + s, from + i])
      s = -1
    }
  }
  return out
}

/** XY-Cut: trennt das Blatt an langen weißen Streifen in Blöcke (Geschosse nebeneinander/übereinander). */
export function splitByWhitespace(g: Uint8Array, W: number, H: number, opts: { minGapFrac?: number; minAreaFrac?: number; thr?: number } = {}): Rect[] {
  const thr = opts.thr ?? 190
  const minGapFrac = opts.minGapFrac ?? 0.04
  const minArea = (opts.minAreaFrac ?? 0.05) * W * H
  const out: Rect[] = []
  const rec = (r0: Rect, depth: number) => {
    const r = inkBBox(g, W, r0, thr)
    if (!r) return
    if (depth < 6) {
      const cw = r.x1 - r.x0, ch = r.y1 - r.y0
      const px = new Array(cw).fill(0), py = new Array(ch).fill(0)
      for (let y = r.y0; y < r.y1; y++)
        for (let x = r.x0; x < r.x1; x++) if (isInk(g, y * W + x, thr)) { px[x - r.x0]++; py[y - r.y0]++ }
      const gx = gaps(px, r.x0, Math.round(minGapFrac * W), ch * 0.003)
      const gy = gaps(py, r.y0, Math.round(minGapFrac * H), cw * 0.003)
      if (gx.length || gy.length) {
        const useX = gx.length && (!gy.length || Math.max(...gx.map((a) => a[1] - a[0])) / W >= Math.max(...gy.map((a) => a[1] - a[0])) / H)
        const cuts = (useX ? gx : gy) as [number, number][]
        let a = useX ? r.x0 : r.y0
        for (const [s, e] of [...cuts, [useX ? r.x1 : r.y1, 0] as [number, number]]) {
          rec(useX ? { x0: a, y0: r.y0, x1: s, y1: r.y1 } : { x0: r.x0, y0: a, x1: r.x1, y1: s }, depth + 1)
          a = e
        }
        return
      }
    }
    if ((r.x1 - r.x0) * (r.y1 - r.y0) >= minArea) out.push(r)
  }
  rec({ x0: 0, y0: 0, x1: W, y1: H }, 0)
  return out
}

const center = (r: Rect) => ({ x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 })

/** Weist Blöcken Beschriftungen zu; sortiert nach Geschossebene (unten → oben). */
export function nameBlocks(blocks: Rect[], labels: Label[]): Block[] {
  const named: Block[] = blocks.map((b) => {
    const inside = labels.filter((l) => l.x >= b.x0 - l.h && l.x <= b.x1 + l.h && l.y >= b.y0 - 4 * l.h && l.y <= b.y1 + 4 * l.h)
    const own = inside
      .map((l) => ({ l, d: Math.hypot(l.x - center(b).x, l.y - center(b).y) }))
      .sort((a, c) => c.l.h - a.l.h || a.d - c.d)[0]?.l
    return own ? { ...b, name: own.name, level: own.level } : { ...b }
  })
  // gleiche Ebene nur einmal vergeben
  const seen = new Set<number>()
  for (const b of named) {
    if (b.level === undefined) continue
    if (seen.has(b.level)) { b.name = undefined; b.level = undefined } else seen.add(b.level)
  }
  const labeled = named.filter((b) => b.level !== undefined).length
  const keep = labeled >= 2 ? named.filter((b) => b.level !== undefined) : named
  const sorted = [...keep].sort((a, b) => (a.level ?? 1000) - (b.level ?? 1000) || a.y0 - b.y0 || a.x0 - b.x0)
  let n = 0
  for (const b of sorted) if (!b.name) b.name = `Geschoss ${++n}`
  return sorted
}

export function clampRect(r: Rect, W: number, H: number): Rect {
  const c = (v: number, m: number) => Math.max(0, Math.min(m, v))
  const x0 = c(Math.min(r.x0, r.x1), W), x1 = c(Math.max(r.x0, r.x1), W)
  const y0 = c(Math.min(r.y0, r.y1), H), y1 = c(Math.max(r.y0, r.y1), H)
  return { x0, y0, x1, y1 }
}
