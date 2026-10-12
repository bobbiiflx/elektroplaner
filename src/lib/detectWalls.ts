// Orthogonale Wanderkennung aus einem Graustufenbild (Heuristik, Vorschlag – kein Ersatz für Prüfung).
export interface DetectedWall {
  a: { x: number; y: number }
  b: { x: number; y: number }
  thickness: number
  kind: 'outer' | 'inner'
}

export interface DetectOpts {
  minThickness?: number // mm, dünnere Linien (Maße, Möbel, Schraffur) werden ignoriert
  maxThickness?: number // mm
  minLength?: number // mm
  maxGap?: number // mm, Lücken (Türen) werden überbrückt
  cell?: number // mm Arbeitsraster
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
function erode(m: Uint8Array, w: number, h: number, s: number): Uint8Array {
  const I = integral(m, w, h)
  const out = new Uint8Array(w * h)
  for (let y = 0; y + s <= h; y++)
    for (let x = 0; x + s <= w; x++) if (boxSum(I, w, x, y, x + s, y + s) === s * s) out[y * w + x] = 1
  return out
}
function dilate(m: Uint8Array, w: number, h: number, s: number): Uint8Array {
  // Gegenstück zu erode: Fenster mit Ursprung links oben wird zurück ausgebreitet
  const I = integral(m, w, h)
  const out = new Uint8Array(w * h)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - s + 1), y0 = Math.max(0, y - s + 1)
      if (boxSum(I, w, x0, y0, x + 1, y + 1) > 0) out[y * w + x] = 1
    }
  return out
}

interface Band { horiz: boolean; c: number; p0: number; p1: number; t: number }

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

export function detectWalls(gray: Uint8Array, width: number, height: number, mmPerPx: number, opts: DetectOpts = {}): DetectedWall[] {
  const minT = opts.minThickness ?? 80
  const maxT = opts.maxThickness ?? 500
  const minL = opts.minLength ?? 500
  const maxGap = opts.maxGap ?? 1300
  const cellMm = opts.cell ?? 25
  const k = Math.max(1, Math.round(cellMm / mmPerPx))
  const cmm = k * mmPerPx
  const w = Math.floor(width / k), h = Math.floor(height / k)
  if (w < 4 || h < 4) return []

  const thr = otsu(gray)
  const dark = new Uint8Array(w * h)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let c = 0
      for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) if (gray[(y * k + dy) * width + x * k + dx] <= thr) c++
      if (c * 2 > k * k) dark[y * w + x] = 1
    }

  const s = Math.max(2, Math.round(minT / cmm))
  const M = dilate(erode(dark, w, h, s), w, h, s)
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
      if (last) { last.p1 = Math.max(last.p1, b.p1) } else out.push({ ...b })
    }
    return out
  }
  const H = merge(hb), V = merge(vb)

  const toWall = (b: Band): DetectedWall => {
    const t = Math.round((b.t * cmm) / 5) * 5
    const p = (u: number, c: number) => (b.horiz ? { x: u * cmm * 1, y: c * cmm } : { x: c * cmm, y: u * cmm })
    return { a: p(b.p0, b.c), b: p(b.p1, b.c), thickness: t, kind: t >= 220 ? 'outer' : 'inner' }
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
