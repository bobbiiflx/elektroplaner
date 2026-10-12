// Orthogonale Wanderkennung aus einem Graustufenbild (Heuristik, Vorschlag – kein Ersatz für Prüfung).
export interface DetectedWall {
  a: { x: number; y: number }
  b: { x: number; y: number }
  thickness: number
  kind: 'outer' | 'inner'
  gaps?: { from: number; to: number }[] // Lücken in der Wand (mm ab Punkt a) → Türen/Fenster
}

export interface DetectOpts {
  minThickness?: number // mm, dünnere Linien (Maße, Möbel, Schraffur) werden ignoriert
  maxThickness?: number // mm
  minLength?: number // mm
  maxGap?: number // mm, Lücken (Türen) werden überbrückt
  cell?: number // mm Arbeitsraster
  hatch?: number // mm: Schraffurabstand, der zu einer Fläche geschlossen wird
}

export type ClassMode = 'wall' | 'outline' | 'ignore'
export interface ColorClass {
  id: string
  name: string
  kind: 'dark' | 'color'
  rgb?: [number, number, number]
  tol: number // dark: Helligkeitsschwelle 0–255, color: Farbabstand
  mode: ClassMode // Wand (gefüllt/schraffiert) · Wand-Umriss (umrandete Fläche) · Ignorieren
  on: boolean
  custom?: boolean
}

export const DEFAULT_CLASSES: ColorClass[] = [
  { id: 'yellow', name: 'Gelb (alte Wände)', kind: 'color', rgb: [255, 225, 0], tol: 100, mode: 'ignore', on: true },
  { id: 'red', name: 'Rot (umrandet)', kind: 'color', rgb: [220, 30, 30], tol: 110, mode: 'outline', on: true },
  { id: 'dark', name: 'Schwarz / dunkel', kind: 'dark', tol: 110, mode: 'wall', on: true },
]

/** Klassen für die aus dem PDF gezeichnete Vektor-Maske (Schraffur schwarz/rot, Abbruch gelb). */
export const VECTOR_CLASSES: ColorClass[] = [
  { id: 'v-yellow', name: 'Gelb (Abbruch)', kind: 'color', rgb: [255, 255, 0], tol: 70, mode: 'ignore', on: true },
  { id: 'v-red', name: 'Rote Schraffur (Neubau)', kind: 'color', rgb: [255, 0, 0], tol: 110, mode: 'wall', on: true },
  { id: 'v-black', name: 'Schwarze Schraffur (Bestand)', kind: 'dark', tol: 140, mode: 'wall', on: true },
]

/** Pixelklassen: 1 = Wand, 2 = Umriss, 3 = ignorieren, 0 = sonst. Erste passende aktive Klasse gewinnt. */
export function classifyPixels(d: ArrayLike<number>, n: number, classes: ColorClass[]): Uint8Array {
  const cls = new Uint8Array(n)
  const act = classes.filter((c) => c.on).map((c) => ({ ...c, code: c.mode === 'wall' ? 1 : c.mode === 'outline' ? 2 : 3, t2: c.tol * c.tol }))
  for (let i = 0; i < n; i++) {
    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2]
    for (const c of act) {
      if (c.kind === 'dark') {
        if (r * 0.299 + g * 0.587 + b * 0.114 <= c.tol && Math.max(r, g, b) - Math.min(r, g, b) < 70) { cls[i] = c.code; break }
      } else if (c.rgb) {
        const dr = r - c.rgb[0], dg = g - c.rgb[1], db = b - c.rgb[2]
        if (dr * dr + dg * dg + db * db <= c.t2) { cls[i] = c.code; break }
      }
    }
  }
  return cls
}

export function otsu(gray: Uint8Array): number {
  const hist = new Array(256).fill(0)
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++
  const total = gray.length
  let sum = 0
  for (let i = 0; i < 256; i++) sum += i * hist[i]
  let sB = 0, wB = 0, best = 0, thr = 128
  for (let i = 0; i < 256; i++) {
    wB += hist[i]
    if (!wB) continue
    const wF = total - wB
    if (!wF) break
    sB += i * hist[i]
    const mB = sB / wB
    const mF = (sum - sB) / wF
    const v = wB * wF * (mB - mF) * (mB - mF)
    if (v > best) { best = v; thr = i }
  }
  return thr
}

// Integralbild-basierte Box-Operationen auf Binärraster
function integral(m: Uint8Array, w: number, h: number): Int32Array {
  const I = new Int32Array((w + 1) * (h + 1))
  for (let y = 0; y < h; y++) {
    let row = 0
    for (let x = 0; x < w; x++) {
      row += m[y * w + x]
      I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row
    }
  }
  return I
}
function boxSum(I: Int32Array, w: number, x0: number, y0: number, x1: number, y1: number) {
  return I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0]
}
function boxOp(m: Uint8Array, w: number, h: number, r: number, all: boolean): Uint8Array {
  const I = integral(m, w, h)
  const out = new Uint8Array(w * h)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), y0 = Math.max(0, y - r), x1 = Math.min(w, x + r + 1), y1 = Math.min(h, y + r + 1)
      const sum = boxSum(I, w, x0, y0, x1, y1)
      out[y * w + x] = all ? (sum === (x1 - x0) * (y1 - y0) ? 1 : 0) : sum > 0 ? 1 : 0
    }
  return out
}
const erodeSym = (m: Uint8Array, w: number, h: number, r: number) => boxOp(m, w, h, r, true)
const dilateSym = (m: Uint8Array, w: number, h: number, r: number) => boxOp(m, w, h, r, false)
const openSym = (m: Uint8Array, w: number, h: number, r: number) => dilateSym(erodeSym(m, w, h, r), w, h, r)
const closeSym = (m: Uint8Array, w: number, h: number, r: number) => erodeSym(dilateSym(m, w, h, r), w, h, r)

interface Band { horiz: boolean; c: number; p0: number; p1: number; t: number; gaps?: [number, number][] }

function runMask(m: Uint8Array, w: number, h: number, minRun: number, horiz: boolean): Uint8Array {
  const out = new Uint8Array(w * h)
  const outer = horiz ? h : w
  const inner = horiz ? w : h
  for (let o = 0; o < outer; o++) {
    let i = 0
    while (i < inner) {
      const idx = (k: number) => (horiz ? o * w + k : k * w + o)
      if (!m[idx(i)]) { i++; continue }
      let j = i
      while (j < inner && m[idx(j)]) j++
      if (j - i >= minRun) for (let k = i; k < j; k++) out[idx(k)] = 1
      i = j
    }
  }
  return out
}

function bands(mask: Uint8Array, w: number, h: number, horiz: boolean, maxT: number): Band[] {
  const seen = new Uint8Array(w * h)
  const res: Band[] = []
  const stack: number[] = []
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || seen[s]) continue
    let x0 = w, y0 = h, x1 = -1, y1 = -1, n = 0
    stack.push(s); seen[s] = 1
    while (stack.length) {
      const p = stack.pop()!
      const x = p % w, y = (p / w) | 0
      n++
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y
      if (x > 0 && mask[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack.push(p - 1) }
      if (x < w - 1 && mask[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack.push(p + 1) }
      if (y > 0 && mask[p - w] && !seen[p - w]) { seen[p - w] = 1; stack.push(p - w) }
      if (y < h - 1 && mask[p + w] && !seen[p + w]) { seen[p + w] = 1; stack.push(p + w) }
    }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1
    const thick = horiz ? bh : bw
    const len = horiz ? bw : bh
    if (thick > maxT || n < len * thick * 0.6) continue // keine Linie (Fläche/Schraffur)
    res.push(horiz
      ? { horiz, c: (y0 + y1 + 1) / 2, p0: x0, p1: x1 + 1, t: thick }
      : { horiz, c: (x0 + x1 + 1) / 2, p0: y0, p1: y1 + 1, t: thick })
  }
  return res
}

/** Graustufen-Variante (nur schwarze Wände). */
export function detectWalls(gray: Uint8Array, width: number, height: number, mmPerPx: number, opts: DetectOpts = {}): DetectedWall[] {
  const thr = otsu(gray)
  const cls = new Uint8Array(gray.length)
  for (let i = 0; i < gray.length; i++) if (gray[i] <= thr) cls[i] = 1
  return detectWallsCls(cls, width, height, mmPerPx, opts)
}

/** Farbige Pläne: schwarz/schraffiert und rot umrandete Flächen = Wände, gelbe Flächen = alte Wände (ignoriert). */
export function detectWallsRGBA(rgba: ArrayLike<number>, width: number, height: number, mmPerPx: number, opts: DetectOpts = {}, classes: ColorClass[] = DEFAULT_CLASSES): DetectedWall[] {
  return detectWallsCls(classifyPixels(rgba, width * height, classes), width, height, mmPerPx, opts)
}

export function detectWallsCls(cls: Uint8Array, width: number, height: number, mmPerPx: number, opts: DetectOpts = {}): DetectedWall[] {
  const minT = opts.minThickness ?? 80
  const maxT = opts.maxThickness ?? 500
  const minL = opts.minLength ?? 500
  const maxGap = opts.maxGap ?? 1300
  const cellMm = opts.cell ?? 25
  const k = Math.max(1, Math.round(cellMm / mmPerPx))
  const cmm = k * mmPerPx
  const w = Math.floor(width / k), h = Math.floor(height / k)
  if (w < 4 || h < 4) return []

  const solid = new Uint8Array(w * h), ink = new Uint8Array(w * h), red = new Uint8Array(w * h), yel = new Uint8Array(w * h)
  const area = k * k
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let c1 = 0, c2 = 0, c3 = 0
      for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) {
        const v = cls[(y * k + dy) * width + x * k + dx]
        if (v === 1) c1++
        else if (v === 2) c2++
        else if (v === 3) c3++
      }
      const i = y * w + x
      if (c1 * 2 > area) solid[i] = 1
      if (c1 >= area * 0.15) ink[i] = 1 // auch Schraffur
      if (c2 >= area * 0.08) red[i] = 1
      if (c3 * 4 > area) yel[i] = 1
    }

  const rOpen = Math.max(1, Math.floor(minT / cmm / 2))
  const rClose = Math.max(2, Math.round((opts.hatch ?? 150) / 2 / cmm))
  // schwarze / schraffierte Wände: Schraffur schließen, dünne Linien öffnen, gelbe Flächen ausnehmen
  const hatched = closeSym(ink, w, h, rClose)
  for (let i = 0; i < hatched.length; i++) if (solid[i]) hatched[i] = 1
  const yellowFill = closeSym(yel, w, h, rClose)
  for (let i = 0; i < hatched.length; i++) if (yellowFill[i] && !solid[i]) hatched[i] = 0
  const dark = openSym(hatched, w, h, rOpen)

  // rot umrandete Flächen: Konturen schließen, umschlossene dünne Flächen = Wand
  const redC = closeSym(red, w, h, 1)
  let M = dark
  if (redC.some((v) => v)) {
    const comp = new Int32Array(w * h).fill(-1)
    const compNotRed = new Uint8Array(w * h)
    for (let i = 0; i < compNotRed.length; i++) compNotRed[i] = redC[i] ? 0 : 1
    const core = erodeSym(compNotRed, w, h, Math.max(2, Math.ceil(maxT / cmm / 2)))
    const bad: boolean[] = []
    const stack: number[] = []
    let n = 0
    for (let s0 = 0; s0 < w * h; s0++) {
      if (!compNotRed[s0] || comp[s0] >= 0) continue
      let isBad = false
      let cnt = 0
      stack.push(s0)
      comp[s0] = n
      while (stack.length) {
        const p = stack.pop()!
        cnt++
        const x = p % w, y = (p / w) | 0
        if (core[p] || x === 0 || y === 0 || x === w - 1 || y === h - 1) isBad = true
        if (x > 0 && compNotRed[p - 1] && comp[p - 1] < 0) { comp[p - 1] = n; stack.push(p - 1) }
        if (x < w - 1 && compNotRed[p + 1] && comp[p + 1] < 0) { comp[p + 1] = n; stack.push(p + 1) }
        if (y > 0 && compNotRed[p - w] && comp[p - w] < 0) { comp[p - w] = n; stack.push(p - w) }
        if (y < h - 1 && compNotRed[p + w] && comp[p + w] < 0) { comp[p + w] = n; stack.push(p + w) }
      }
      bad[n] = isBad || cnt < 4
      n++
    }
    const redWalls = new Uint8Array(w * h)
    for (let i = 0; i < redWalls.length; i++) if (redC[i] || (comp[i] >= 0 && !bad[comp[i]])) redWalls[i] = 1
    const redOpen = openSym(redWalls, w, h, rOpen)
    M = new Uint8Array(dark)
    for (let i = 0; i < M.length; i++) if (redOpen[i]) M[i] = 1
  }

  const minRun = Math.max(3, Math.round(minL / cmm))
  const maxTc = Math.round(maxT / cmm)
  const hb = bands(runMask(M, w, h, minRun, true), w, h, true, maxTc)
  const vb = bands(runMask(M, w, h, minRun, false), w, h, false, maxTc)

  // Lücken (Türen) überbrücken: kollineare Bänder gleicher Stärke verbinden
  const merge = (list: Band[]): Band[] => {
    const sorted = [...list].sort((a, b) => a.c - b.c || a.p0 - b.p0)
    const out: Band[] = []
    for (const b of sorted) {
      const last = out.find((o) => Math.abs(o.c - b.c) * cmm <= 50 && Math.abs(o.t - b.t) * cmm <= 60 && b.p0 - o.p1 <= maxGap / cmm && b.p0 >= o.p0)
      if (last) {
        if (b.p0 > last.p1) (last.gaps ??= []).push([last.p1, b.p0])
        last.p1 = Math.max(last.p1, b.p1)
      } else out.push({ ...b })
    }
    return out
  }
  const H = merge(hb), V = merge(vb)

  const toWall = (b: Band): DetectedWall => {
    const t = Math.round((b.t * cmm) / 5) * 5
    const p = (u: number, c: number) => (b.horiz ? { x: u * cmm * 1, y: c * cmm } : { x: c * cmm, y: u * cmm })
    const gaps = (b.gaps ?? []).map(([g0, g1]) => ({ from: (g0 - b.p0) * cmm, to: (g1 - b.p0) * cmm })).filter((g) => g.to - g.from >= 600)
    return { a: p(b.p0, b.c), b: p(b.p1, b.c), thickness: t, kind: t >= 220 ? 'outer' : 'inner', gaps }
  }
  const walls = [...H.map(toWall), ...V.map(toWall)]

  // Endpunkte an der Mittellinie querender Wände einrasten lassen
  const hw = walls.slice(0, H.length), vw = walls.slice(H.length)
  const snap = (own: DetectedWall, horiz: boolean, others: DetectedWall[]) => {
    for (const end of ['a', 'b'] as const) {
      const pt = own[end]
      for (const o of others) {
        const oc = horiz ? o.a.x : o.a.y // andere Wand ist senkrecht: konstante Koordinate
        const along = horiz ? pt.x : pt.y
        const oMin = horiz ? Math.min(o.a.y, o.b.y) : Math.min(o.a.x, o.b.x)
        const oMax = horiz ? Math.max(o.a.y, o.b.y) : Math.max(o.a.x, o.b.x)
        const cross = horiz ? pt.y : pt.x
        if (Math.abs(along - oc) <= o.thickness / 2 + 2 * cmm && cross >= oMin - o.thickness && cross <= oMax + o.thickness) {
          if (horiz) pt.x = oc; else pt.y = oc
          break
        }
      }
    }
  }
  hw.forEach((w0) => snap(w0, true, vw))
  vw.forEach((w0) => snap(w0, false, hw))
  return walls.filter((w0) => Math.hypot(w0.b.x - w0.a.x, w0.b.y - w0.a.y) >= minL)
}
