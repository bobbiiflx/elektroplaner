import type { Floor, Opening, Wall, Device, Vec2 } from '../types'
import { cableType, type DeviceType, type ResolvedDevice } from '../config/catalog'
import { cableLengths, dist, wallAngleDeg, wallLength } from '../lib/geom'
import { formatLen } from '../lib/units'
import type { Unit } from '../types'

/** `px(n)` rechnet eine Größe in Bildschirm-/Papierpixeln in Modell-Millimeter um. */
export type PxFn = (n: number) => number

const DIM_COLOR = 'var(--dim, var(--accent))'

function Txt({ text, x, y, px, color = DIM_COLOR, anchor = 'middle', size = 11, flip = false, rotate = 0 }: {
  text: string
  x: number
  y: number
  px: PxFn
  color?: string
  anchor?: 'start' | 'middle' | 'end'
  size?: number
  flip?: boolean
  rotate?: number
}) {
  const rot = rotate + (flip ? 180 : 0)
  return (
    <text
      x={x}
      y={y}
      transform={rot ? `rotate(${rot} ${x} ${y})` : undefined}
      fontSize={px(size)}
      textAnchor={anchor}
      dominantBaseline="central"
      fill={color}
      stroke="var(--paper)"
      strokeWidth={px(3)}
      style={{ paintOrder: 'stroke', pointerEvents: 'none', fontWeight: 600 }}
    >
      {text}
    </text>
  )
}

/** Maßlinie mit Endstrichen und Text. Horizontal oder vertikal. */
export function Dim({ x1, y1, x2, y2, text, px, color = DIM_COLOR, textDx = 0, textDy = 0, flip = false, showText = true, rotateText = 0 }: {
  x1: number
  y1: number
  x2: number
  y2: number
  text: string
  px: PxFn
  color?: string
  textDx?: number
  textDy?: number
  flip?: boolean
  showText?: boolean
  rotateText?: number
}) {
  const t = px(4)
  const horiz = Math.abs(y1 - y2) < 1e-6
  return (
    <g stroke={color} strokeWidth={px(1)} fill="none" style={{ pointerEvents: 'none' }}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} />
      {horiz ? (
        <>
          <line x1={x1} y1={y1 - t} x2={x1} y2={y1 + t} />
          <line x1={x2} y1={y2 - t} x2={x2} y2={y2 + t} />
        </>
      ) : (
        <>
          <line x1={x1 - t} y1={y1} x2={x1 + t} y2={y1} />
          <line x1={x2 - t} y1={y2} x2={x2 + t} y2={y2} />
        </>
      )}
      {showText && <Txt text={text} x={(x1 + x2) / 2 + textDx} y={(y1 + y2) / 2 + textDy} px={px} color={color} flip={flip} rotate={rotateText} />}
    </g>
  )
}

function centroid(floor: Floor) {
  let x = 0
  let y = 0
  let n = 0
  for (const w of floor.walls) {
    x += w.a.x + w.b.x
    y += w.a.y + w.b.y
    n += 2
  }
  return n ? { x: x / n, y: y / n } : { x: 0, y: 0 }
}

/** Wandlängen, Öffnungsketten (Maßketten) und Leitungslängen im Grundriss. */
export function PlanDims({ floor, unit, px, color = DIM_COLOR, cables = true }: { floor: Floor; unit: Unit; px: PxFn; color?: string; cables?: boolean }) {
  const c = centroid(floor)
  return (
    <g style={{ pointerEvents: 'none' }}>
      {floor.walls.map((w) => {
        const L = wallLength(w)
        if (L < 150) return null
        const ang = wallAngleDeg(w)
        // „außen“ = von der Gebäudemitte weg
        const midx = (w.a.x + w.b.x) / 2
        const midy = (w.a.y + w.b.y) / 2
        const nx = -(w.b.y - w.a.y) / L
        const ny = (w.b.x - w.a.x) / L
        const sgn = (midx - c.x) * nx + (midy - c.y) * ny >= 0 ? 1 : -1
        const flip = ang > 90 || ang < -90
        const ops = floor.openings.filter((o) => o.wallId === w.id).sort((a, b) => a.offset - b.offset)
        const y1 = sgn * (w.thickness / 2 + px(16))
        const y2 = sgn * (w.thickness / 2 + px(16) + (ops.length ? px(18) : 0))
        const stops = [0, ...ops.flatMap((o) => [o.offset, o.offset + o.width]), L].map((v) => Math.min(L, Math.max(0, v)))
        const segs: [number, number][] = []
        for (let i = 1; i < stops.length; i++) if (stops[i] - stops[i - 1] > 1) segs.push([stops[i - 1], stops[i]])
        const k = 1 / px(1) // Pixel pro mm
        return (
          <g key={w.id} transform={`translate(${w.a.x} ${w.a.y}) rotate(${ang})`}>
            {ops.length > 0 &&
              segs.map(([a, b], i) => (
                <Dim key={i} x1={a} y1={y1} x2={b} y2={y1} text={formatLen(b - a, unit, false)} px={px} color={color} textDy={sgn * -px(0)} flip={flip} showText={(b - a) * k > 34} />
              ))}
            <Dim x1={0} y1={y2} x2={L} y2={y2} text={formatLen(L, unit)} px={px} color={color} flip={flip} />
          </g>
        )
      })}
      {cables &&
        floor.cables.map((cab) => {
          if (cab.points.length < 2) return null
          let bi = 0
          let bl = 0
          for (let i = 1; i < cab.points.length; i++) {
            const l = dist(cab.points[i - 1], cab.points[i])
            if (l > bl) {
              bl = l
              bi = i
            }
          }
          if (bl < 300) return null
          const a = cab.points[bi - 1]
          const b = cab.points[bi]
          const ct = cableType(cab.typeId)
          return <Txt key={cab.id} text={formatLen(cableLengths(cab.points).total, unit)} x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - px(9)} px={px} color={ct.color} size={10} />
        })}
    </g>
  )
}

/** Maßketten, Höhenkoten und Öffnungsmaße der Wandansicht. */
export function ElevationDims({ wall, side, devices, openings, unit, px, kOf, typeOf, color = DIM_COLOR }: {
  wall: Wall
  side: 1 | -1
  devices: Device[]
  openings: Opening[]
  unit: Unit
  px: PxFn
  kOf: (dt: DeviceType) => number
  typeOf: (d: Device) => ResolvedDevice
  color?: string
}) {
  const L = wallLength(wall)
  const X = (u: number) => (side === 1 ? u : L - u)
  const k = 1 / px(1)
  const front = devices.filter((d) => d.side === side)

  // Maßkette unter dem Boden: Wandanfang, Öffnungskanten, Gerätemitten, Wandende
  const stopSet = new Set<number>([0, L])
  for (const o of openings) {
    stopSet.add(Math.round(X(o.offset)))
    stopSet.add(Math.round(X(o.offset + o.width)))
  }
  for (const d of front) stopSet.add(Math.round(X(d.offset)))
  const stops = [...stopSet].filter((v) => v >= 0 && v <= L).sort((a, b) => a - b)
  const yChain = 160 + px(20)
  const yTotal = yChain + px(20)

  // Höhenkoten (links)
  const heights: { z: number; x: number }[] = []
  for (const d of front) {
    const dt = typeOf(d).dt
    const hk = Math.round(d.height)
    const x = X(d.offset) - (dt.w * kOf(dt)) / 2
    const ex = heights.find((h) => Math.abs(h.z - hk) < 5)
    if (ex) ex.x = Math.min(ex.x, x)
    else heights.push({ z: hk, x })
  }

  return (
    <g style={{ pointerEvents: 'none' }}>
      {stops.slice(1).map((b, i) => {
        const a = stops[i]
        return <Dim key={i} x1={a} y1={yChain} x2={b} y2={yChain} text={formatLen(b - a, unit, false)} px={px} color={color} showText={(b - a) * k > 34} />
      })}
      <Dim x1={0} y1={yTotal} x2={L} y2={yTotal} text={formatLen(L, unit)} px={px} color={color} />

      {front.map((d) => {
        const box = typeOf(d).box
        if (!box) return null
        return (
          <g key={'box' + d.id} fill="none" stroke={color} strokeWidth={px(0.8)} strokeDasharray={`${px(3)} ${px(2.5)}`} opacity={0.75}>
            {Array.from({ length: box.count }, (_, i) => (
              <circle key={i} cx={X(d.offset) + (i - (box.count - 1) / 2) * box.pitch} cy={-d.height} r={box.dia / 2} />
            ))}
          </g>
        )
      })}

      {heights.map((h) => (
        <g key={h.z}>
          <line x1={-px(6)} y1={-h.z} x2={h.x} y2={-h.z} stroke={color} strokeWidth={px(0.8)} strokeDasharray={`${px(3)} ${px(3)}`} opacity={0.55} />
          <Txt text={formatLen(h.z, unit, false)} x={-px(10)} y={-h.z} px={px} color={color} anchor="end" size={10} />
        </g>
      ))}

      {openings.map((o) => {
        const x0 = Math.min(X(o.offset), X(o.offset + o.width))
        const top = o.sill + o.height
        return (
          <g key={o.id}>
            <Dim x1={x0} y1={-top - px(10)} x2={x0 + o.width} y2={-top - px(10)} text={formatLen(o.width, unit, false)} px={px} color={color} textDy={-px(9)} showText={o.width * k > 30} />
            <Dim x1={x0 + o.width + px(10)} y1={-top} x2={x0 + o.width + px(10)} y2={-o.sill} text={formatLen(o.height, unit, false)} px={px} color={color} textDx={px(16)} />
            {o.sill > 0 && <Dim x1={x0 - px(10)} y1={0} x2={x0 - px(10)} y2={-o.sill} text={formatLen(o.sill, unit, false)} px={px} color={color} textDx={-px(16)} />}
          </g>
        )
      })}
    </g>
  )
}

/** Frei gezeichnete Maßlinie zwischen zwei Punkten (beliebige Richtung) mit Endstrichen, Länge als Text. */
export function FreeDim({ a, b, text, px, color = DIM_COLOR, selected = false, ghost = false, onPointerDown }: {
  a: Vec2
  b: Vec2
  text: string
  px: PxFn
  color?: string
  selected?: boolean
  ghost?: boolean
  onPointerDown?: (e: React.PointerEvent) => void
}) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  const nx = -uy
  const ny = ux
  const t = px(5)
  const ang = (Math.atan2(dy, dx) * 180) / Math.PI
  const flip = ang > 90 || ang < -90
  const mx = (a.x + b.x) / 2 + nx * px(11) * (flip ? -1 : 1)
  const my = (a.y + b.y) / 2 + ny * px(11) * (flip ? -1 : 1)
  const col = selected ? 'var(--accent)' : color
  return (
    <g fill="none" stroke={col} strokeWidth={px(selected ? 2 : 1.2)} opacity={ghost ? 0.8 : 1} strokeDasharray={ghost ? `${px(5)} ${px(3)}` : undefined}>
      {onPointerDown && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={px(14)} style={{ cursor: 'pointer' }} onPointerDown={onPointerDown} />}
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} style={{ pointerEvents: 'none' }} />
      <g style={{ pointerEvents: 'none' }} strokeDasharray="none">
        <line x1={a.x - nx * t} y1={a.y - ny * t} x2={a.x + nx * t} y2={a.y + ny * t} />
        <line x1={b.x - nx * t} y1={b.y - ny * t} x2={b.x + nx * t} y2={b.y + ny * t} />
      </g>
      <Txt text={text} x={mx} y={my} px={px} color={col} rotate={ang} flip={flip} />
    </g>
  )
}
