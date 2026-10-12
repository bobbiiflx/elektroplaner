import type { ReactNode } from 'react'
import { cableType, deviceType, type DeviceCategory, type DeviceType } from '../config/catalog'
import { CABLE_IMG, DEVICE_IMG } from '../config/icons'

// ---------------------------------------------------------------------------
// Zwei Darstellungen je Gerät:
//  • Planzeichen (Grundriss): einfache Form je Kategorie, in mm skaliert → PlanSymbolShape
//  • Icon / Frontplatte (Wandansicht, Auswahlmaske): maßstäbliche Zeichnung → DeviceFace
// Alle Farben kommen aus CSS-Variablen, damit Hell/Dunkel funktioniert.
// ---------------------------------------------------------------------------

/** Planzeichen um den Nullpunkt, r = Radius in Zeicheneinheiten. */
export function PlanSymbolShape({
  cat,
  r,
  fill,
  stroke = 'var(--paper)',
  sw = 1.5,
}: {
  cat: DeviceCategory
  r: number
  fill: string
  stroke?: string
  sw?: number
}): ReactNode {
  switch (cat) {
    case 'switch':
      return <rect x={-r} y={-r} width={2 * r} height={2 * r} rx={r * 0.28} fill={fill} stroke={stroke} strokeWidth={sw} />
    case 'data':
      return <polygon points={`0,${-r * 1.15} ${r * 1.05},${r * 0.85} ${-r * 1.05},${r * 0.85}`} fill={fill} stroke={stroke} strokeWidth={sw} />
    case 'knx':
      return <polygon points={`0,${-r * 1.25} ${r * 1.25},0 0,${r * 1.25} ${-r * 1.25},0`} fill={fill} stroke={stroke} strokeWidth={sw} />
    case 'display':
      return <rect x={-r * 1.6} y={-r} width={r * 3.2} height={2 * r} rx={r * 0.25} fill={fill} stroke={stroke} strokeWidth={sw} />
    case 'iot':
      return <polygon points={`${r * 1.2},0 ${r * 0.6},${r * 1.05} ${-r * 0.6},${r * 1.05} ${-r * 1.2},0 ${-r * 0.6},${-r * 1.05} ${r * 0.6},${-r * 1.05}`} fill={fill} stroke={stroke} strokeWidth={sw} />
    case 'light':
      // klassisches Lichtauslass-Zeichen: Kreis mit Kreuz
      return (
        <g>
          <circle r={r * 1.05} fill={fill} stroke={stroke} strokeWidth={sw} />
          <path d={`M ${-r * 0.62} ${-r * 0.62} L ${r * 0.62} ${r * 0.62} M ${r * 0.62} ${-r * 0.62} L ${-r * 0.62} ${r * 0.62}`} stroke="#1d1d1f" strokeWidth={sw * 1.1} strokeLinecap="round" />
        </g>
      )
    case 'box':
      return <rect x={-r * 0.8} y={-r * 0.8} width={r * 1.6} height={r * 1.6} fill="var(--paper)" stroke={fill} strokeWidth={sw * 1.4} />
    default:
      return <circle r={r} fill={fill} stroke={stroke} strokeWidth={sw} />
  }
}

/** Kleines Planzeichen als eigenständiges SVG (für die Auswahlmaske). */
export function PlanSymbol({ typeId, size = 26 }: { typeId: string; size?: number }) {
  const dt = deviceType(typeId)
  return (
    <svg width={size} height={size} viewBox="-18 -18 36 36" aria-hidden>
      <PlanSymbolShape cat={dt.category} r={11} fill={dt.color} stroke="var(--paper)" sw={1.6} />
    </svg>
  )
}

const INK = 'var(--ink)'
const SOFT = 'var(--ink-soft)'
const FIELD = 'var(--field)'
const PLATE = 'var(--plate)'

function Plate({ w, h, r = 7, dark = false }: { w: number; h: number; r?: number; dark?: boolean }) {
  return (
    <rect
      x={-w / 2}
      y={-h / 2}
      width={w}
      height={h}
      rx={r}
      fill={dark ? '#1c1c1e' : PLATE}
      stroke={SOFT}
      strokeWidth={1.4}
      vectorEffect="non-scaling-stroke"
    />
  )
}

function Socket({ cx = 0, cy = 0 }: { cx?: number; cy?: number }) {
  return (
    <g transform={`translate(${cx} ${cy})`}>
      <circle r={28} fill={FIELD} stroke={SOFT} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
      <circle cx={-9.5} r={3.4} fill={INK} />
      <circle cx={9.5} r={3.4} fill={INK} />
      <rect x={-5} y={-31} width={10} height={6} rx={1.5} fill={SOFT} />
      <rect x={-5} y={25} width={10} height={6} rx={1.5} fill={SOFT} />
    </g>
  )
}

function Rocker({ cx = 0, w = 48, h = 48, mark = 'bar' }: { cx?: number; w?: number; h?: number; mark?: 'bar' | 'updown' | 'none' }) {
  return (
    <g transform={`translate(${cx} 0)`}>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={5} fill={FIELD} stroke={SOFT} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
      {mark === 'bar' && <rect x={-w * 0.22} y={-h * 0.36} width={w * 0.44} height={4} rx={2} fill={SOFT} />}
      {mark === 'updown' && (
        <>
          <polygon points={`0,${-h * 0.34} ${w * 0.2},${-h * 0.08} ${-w * 0.2},${-h * 0.08}`} fill={SOFT} />
          <polygon points={`0,${h * 0.34} ${w * 0.2},${h * 0.08} ${-w * 0.2},${h * 0.08}`} fill={SOFT} />
        </>
      )}
    </g>
  )
}

function Port({ cy = 0, w = 38, h = 26, color }: { cy?: number; w?: number; h?: number; color: string }) {
  return (
    <g transform={`translate(0 ${cy})`}>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={3} fill={INK} stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
      <rect x={-w * 0.18} y={-h / 2 - 1} width={w * 0.36} height={6} rx={1} fill={FIELD} />
      {[-3, -1, 1, 3].map((k) => (
        <rect key={k} x={k * 4.2 - 1.2} y={h * 0.05} width={2.4} height={h * 0.34} fill={color} />
      ))}
    </g>
  )
}

/**
 * Maßstäbliche Frontplatte eines Geräts, Mittelpunkt im Ursprung, Einheit mm.
 * Weichen die Maße (Serie, Größenvariante, eigene Maße) vom Katalogwert ab, wird die Zeichnung gleichmäßig skaliert.
 */
export function DeviceFace({ dt }: { dt: DeviceType }) {
  const base = deviceType(dt.id)
  if (Math.abs(dt.w - base.w) < 0.05 && Math.abs(dt.h - base.h) < 0.05) return <DeviceFaceBase dt={dt} />
  const k = Math.min(dt.w / base.w, dt.h / base.h)
  return (
    <g transform={`scale(${k})`}>
      <DeviceFaceBase dt={base} />
    </g>
  )
}

function DeviceFaceBase({ dt }: { dt: DeviceType }) {
  const { w, h } = dt
  switch (dt.id) {
    case 'sd-1':
      return (
        <g>
          <Plate w={w} h={h} />
          <Socket />
        </g>
      )
    case 'sd-2':
      return (
        <g>
          <Plate w={w} h={h} />
          <Socket cx={-36} />
          <Socket cx={36} />
        </g>
      )
    case 'sd-3':
      return (
        <g>
          <Plate w={w} h={h} />
          <Socket cx={-72} />
          <Socket />
          <Socket cx={72} />
        </g>
      )
    case 'sd-herd':
      return (
        <g>
          <Plate w={w} h={h} />
          <circle r={29} fill={FIELD} stroke={dt.color} strokeWidth={2.4} vectorEffect="non-scaling-stroke" />
          {[
            [0, 0],
            [-12, -12],
            [12, -12],
            [-12, 12],
            [12, 12],
          ].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={3.6} fill={i === 0 ? dt.color : INK} />
          ))}
        </g>
      )
    case 'sd-4':
      return (
        <g>
          <Plate w={w} h={h} />
          <Socket cx={-111} />
          <Socket cx={-37} />
          <Socket cx={37} />
          <Socket cx={111} />
        </g>
      )
    case 'poe':
      return (
        <g>
          <Plate w={w} h={h} />
          <Port color={dt.color} />
          <text y={31} textAnchor="middle" fontSize={11} fontWeight={700} fill={dt.color}>
            PoE
          </text>
        </g>
      )
    case 'kab-aus':
      return (
        <g>
          <Plate w={w} h={h} />
          <rect x={-26} y={-8} width={52} height={22} rx={3} fill="#1c1c1e" />
          <rect x={-26} y={-24} width={52} height={10} rx={3} fill={FIELD} stroke={SOFT} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        </g>
      )
    case 'pin':
      return (
        <g>
          <Plate w={w} h={h} />
          {[0, 1, 2, 3].flatMap((r) => [0, 1, 2].map((c) => <rect key={`${r}${c}`} x={-26 + c * 19} y={-30 + r * 15.5} width={14} height={11} rx={2.5} fill={FIELD} stroke={SOFT} strokeWidth={0.9} vectorEffect="non-scaling-stroke" />))}
        </g>
      )
    case 'nfc':
      return (
        <g>
          <Plate w={w} h={h} r={9} dark />
          <rect x={-w / 2 + 8} y={-h / 2 + 8} width={w - 16} height={h - 16} rx={6} fill="none" stroke={dt.color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
          {[10, 18, 26].map((r) => (
            <path key={r} d={`M ${-r * 0.8} ${-4 - r * 0.45} A ${r} ${r} 0 0 1 ${r * 0.8} ${-4 - r * 0.45}`} fill="none" stroke={dt.color} strokeWidth={2.4} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          ))}
          <rect x={-9} y={6} width={18} height={14} rx={3} fill="none" stroke={dt.color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
        </g>
      )
    case 'bell':
      return (
        <g>
          <Plate w={w} h={h} r={9} />
          <rect x={-24} y={-h / 2 + 8} width={48} height={64} rx={7} fill="#1c1c1e" />
          <circle cx={0} cy={-h / 2 + 28} r={9} fill="#2c4f78" stroke={SOFT} strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <circle cx={0} cy={h / 2 - 26} r={14} fill="none" stroke={dt.color} strokeWidth={3} vectorEffect="non-scaling-stroke" />
        </g>
      )
    case 'cam':
      return (
        <g>
          <circle r={44} fill={PLATE} stroke={SOFT} strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
          <circle r={30} fill="#1c1c1e" />
          <circle r={14} fill="#2c4f78" />
          <circle cx={-5} cy={-5} r={4} fill="#fff" opacity={0.7} />
        </g>
      )
    case 'ev':
      return (
        <g>
          <Plate w={w} h={h} r={30} />
          <rect x={-w / 2 + 40} y={-h / 2 + 70} width={w - 80} height={260} rx={18} fill="#1c1c1e" />
          <circle cx={0} cy={-h / 2 + 400} r={60} fill="none" stroke={dt.color} strokeWidth={8} vectorEffect="non-scaling-stroke" />
          <circle cx={0} cy={h / 2 - 280} r={80} fill={FIELD} stroke={SOFT} strokeWidth={2} vectorEffect="non-scaling-stroke" />
        </g>
      )
    case 'l-spot':
      return (
        <g>
          <circle r={w / 2} fill={PLATE} stroke={SOFT} strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
          <circle r={w * 0.33} fill="#fff7d6" stroke={dt.color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
        </g>
      )
    case 'l-pendel':
      return (
        <g>
          <line x1={0} y1={-h / 2} x2={0} y2={-h * 0.12} stroke={INK} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          <path d={`M ${-w * 0.22} ${-h * 0.12} L ${w * 0.22} ${-h * 0.12} L ${w * 0.5} ${h * 0.4} L ${-w * 0.5} ${h * 0.4} Z`} fill="#b08d57" stroke={INK} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
          <ellipse cx={0} cy={h * 0.4} rx={w * 0.5} ry={h * 0.05} fill="#fff7d6" />
        </g>
      )
    case 'l-kron':
      return (
        <g stroke={INK} strokeWidth={1.3} vectorEffect="non-scaling-stroke">
          <line x1={0} y1={-h / 2} x2={0} y2={-h * 0.1} />
          <path d={`M ${-w * 0.45} ${-h * 0.05} Q 0 ${h * 0.45} ${w * 0.45} ${-h * 0.05}`} fill="none" />
          {[-0.42, -0.2, 0, 0.2, 0.42].map((k) => (
            <g key={k}>
              <line x1={w * k} y1={-h * 0.05 + Math.abs(k) * 0} x2={w * k} y2={-h * 0.22} />
              <ellipse cx={w * k} cy={-h * 0.28} rx={w * 0.025} ry={h * 0.07} fill="#fff7d6" />
            </g>
          ))}
        </g>
      )
    case 'l-schiene':
      return (
        <g>
          <rect x={-w / 2} y={-h * 0.4} width={w} height={h * 0.2} rx={h * 0.06} fill={PLATE} stroke={SOFT} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
          {[-0.25, 0.25].map((k) => (
            <path key={k} d={`M ${w * k - w * 0.05} ${-h * 0.2} L ${w * k + w * 0.05} ${-h * 0.2} L ${w * k + w * 0.07} ${h * 0.4} L ${w * k - w * 0.07} ${h * 0.4} Z`} fill="#8e8e93" stroke={INK} strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
        </g>
      )
    case 'l-vent':
      return (
        <g stroke={INK} strokeWidth={1.2} vectorEffect="non-scaling-stroke">
          {[0, 90, 180, 270].map((a) => (
            <ellipse key={a} cx={w * 0.27} cy={0} rx={w * 0.25} ry={w * 0.06} transform={`rotate(${a + 20})`} fill="#a9784a" />
          ))}
          <circle r={w * 0.1} fill="#fff7d6" />
        </g>
      )
    case 'l-band':
      return (
        <g>
          <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={h * 0.3} fill="#fff7d6" stroke={dt.color} strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
          {[-0.4, -0.2, 0, 0.2, 0.4].map((k) => (
            <circle key={k} cx={w * k} cy={0} r={h * 0.18} fill={dt.color} />
          ))}
        </g>
      )
    case 'l-rgb':
      return (
        <g>
          <rect x={-w * 0.22} y={h * 0.22} width={w * 0.44} height={h * 0.26} rx={3} fill="#8e8e93" />
          <circle cx={0} cy={-h * 0.08} r={w * 0.5} fill="#f4f4f6" stroke={SOFT} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
          <path d={`M 0 ${-h * 0.08} L ${w * 0.5} ${-h * 0.08} A ${w * 0.5} ${w * 0.5} 0 0 1 ${w * 0.25} ${-h * 0.08 + w * 0.43} Z`} fill="#ff453a" opacity={0.85} />
          <path d={`M 0 ${-h * 0.08} L ${w * 0.25} ${-h * 0.08 + w * 0.43} A ${w * 0.5} ${w * 0.5} 0 0 1 ${-w * 0.25} ${-h * 0.08 + w * 0.43} Z`} fill="#30d158" opacity={0.85} />
          <path d={`M 0 ${-h * 0.08} L ${-w * 0.25} ${-h * 0.08 + w * 0.43} A ${w * 0.5} ${w * 0.5} 0 0 1 ${-w * 0.5} ${-h * 0.08} Z`} fill="#0a84ff" opacity={0.85} />
        </g>
      )
    case 'l-wand':
      return (
        <g>
          <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={w * 0.12} fill="#3a3a3c" stroke={INK} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
          <rect x={-w * 0.32} y={-h * 0.4} width={w * 0.64} height={h * 0.16} fill="#fff7d6" />
          <rect x={-w * 0.32} y={h * 0.24} width={w * 0.64} height={h * 0.16} fill="#fff7d6" />
        </g>
      )
    case 'l-bild':
      return (
        <g>
          <rect x={-w / 2} y={-h / 2} width={w} height={h * 0.55} rx={h * 0.25} fill="#b8b8bd" stroke={SOFT} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
          <rect x={-w * 0.35} y={h * 0.15} width={w * 0.7} height={h * 0.35} fill="#fff7d6" opacity={0.7} />
        </g>
      )
    case 'l-not':
      return (
        <g>
          <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={h * 0.1} fill="#1f9d55" stroke={INK} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
          <path d={`M ${-w * 0.36} 0 L ${-w * 0.16} ${-h * 0.25} L ${-w * 0.16} ${-h * 0.1} L ${w * 0.02} ${-h * 0.1} L ${w * 0.02} ${h * 0.1} L ${-w * 0.16} ${h * 0.1} L ${-w * 0.16} ${h * 0.25} Z`} fill="#fff" />
          <circle cx={w * 0.2} cy={-h * 0.22} r={h * 0.07} fill="#fff" />
          <path d={`M ${w * 0.2} ${-h * 0.12} L ${w * 0.3} ${h * 0.3} M ${w * 0.2} ${-h * 0.05} L ${w * 0.08} ${h * 0.15} M ${w * 0.2} ${-h * 0.02} L ${w * 0.34} ${h * 0.08}`} stroke="#fff" strokeWidth={3} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </g>
      )
    case 'l-aussen':
      return (
        <g>
          <rect x={-w * 0.36} y={h * 0.38} width={w * 0.72} height={h * 0.1} rx={4} fill="#3a3a3c" />
          <rect x={-w * 0.32} y={-h * 0.45} width={w * 0.64} height={h * 0.85} rx={w * 0.1} fill="#fff7d6" fillOpacity={0.55} stroke={INK} strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
          <rect x={-w * 0.36} y={-h * 0.5} width={w * 0.72} height={h * 0.07} rx={4} fill="#3a3a3c" />
        </g>
      )
    case 'sw-1':
      return (
        <g>
          <Plate w={w} h={h} />
          <Rocker />
        </g>
      )
    case 'sw-w':
      return (
        <g>
          <Plate w={w} h={h} />
          <Rocker mark="updown" />
        </g>
      )
    case 'sw-2':
      return (
        <g>
          <Plate w={w} h={h} />
          <Rocker cx={-13} w={23} />
          <Rocker cx={13} w={23} />
        </g>
      )
    case 'sw-jal':
      return (
        <g>
          <Plate w={w} h={h} />
          <rect x={-22} y={-24} width={44} height={48} rx={5} fill={FIELD} stroke={SOFT} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
          <polygon points="0,-17 11,-4 -11,-4" fill={dt.color} />
          <polygon points="0,17 11,4 -11,4" fill={dt.color} />
        </g>
      )
    case 'eth-1':
      return (
        <g>
          <Plate w={w} h={h} />
          <Port color={dt.color} />
        </g>
      )
    case 'eth-2':
      return (
        <g>
          <Plate w={w} h={h} />
          <Port cy={-20} w={34} h={24} color={dt.color} />
          <Port cy={20} w={34} h={24} color={dt.color} />
        </g>
      )
    case 'knx-4':
      return (
        <g>
          <Plate w={w} h={h} />
          {[-1, 1].flatMap((i) =>
            [-1, 1].map((j) => (
              <g key={`${i}${j}`}>
                <rect x={i * 17 - 14} y={j * 17 - 14} width={28} height={28} rx={4} fill={FIELD} stroke={SOFT} strokeWidth={1.1} vectorEffect="non-scaling-stroke" />
                <circle cx={i * 17} cy={j * 17} r={3} fill={dt.color} />
              </g>
            )),
          )}
        </g>
      )
    case 'knx-ts':
      return (
        <g>
          <Plate w={w} h={h} />
          <circle r={27} fill="#1c1c1e" stroke={dt.color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
          <text y={2} textAnchor="middle" dominantBaseline="central" fontSize={19} fontWeight={600} fill="#fff" style={{ pointerEvents: 'none' }}>
            21°
          </text>
          <rect x={-8} y={14} width={16} height={2.4} rx={1.2} fill={dt.color} />
        </g>
      )
    case 'disp':
      return (
        <g>
          <Plate w={w} h={h} r={9} dark />
          <rect x={-w / 2 + 10} y={-h / 2 + 10} width={w - 20} height={h - 20} rx={4} fill="#2c2c2e" />
          {[-62, -22, 18, 58].map((x) => (
            <rect key={x} x={x - 14} y={-26} width={28} height={28} rx={6} fill={dt.color} opacity={0.85} />
          ))}
          <rect x={-w / 2 + 22} y={14} width={w - 44} height={5} rx={2.5} fill="#8e8e93" />
          <rect x={-w / 2 + 22} y={26} width={(w - 44) * 0.55} height={5} rx={2.5} fill="#636366" />
        </g>
      )
    case 'dose-ab':
      return (
        <g>
          <circle r={34} fill={FIELD} stroke={SOFT} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
          <line x1={-14} y1={-14} x2={14} y2={14} stroke={SOFT} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
          <line x1={14} y1={-14} x2={-14} y2={14} stroke={SOFT} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
          {[-1, 1].flatMap((i) => [-1, 1].map((j) => <circle key={`${i}${j}`} cx={i * 24} cy={j * 24} r={3} fill={INK} />))}
        </g>
      )
    case 'uv':
      return (
        <g>
          <Plate w={w} h={h} r={10} />
          <rect x={-w / 2 + 24} y={-h / 2 + 24} width={w - 48} height={h - 48} rx={6} fill={FIELD} stroke={SOFT} strokeWidth={1.1} vectorEffect="non-scaling-stroke" />
          {[0, 1, 2, 3].map((r) => (
            <g key={r}>
              <rect x={-w / 2 + 40} y={-h / 2 + 50 + r * 128} width={w - 80} height={70} rx={4} fill="none" stroke={SOFT} strokeWidth={1} vectorEffect="non-scaling-stroke" />
              {Array.from({ length: 8 }).map((_, k) => (
                <rect key={k} x={-w / 2 + 52 + k * 36} y={-h / 2 + 62 + r * 128} width={22} height={46} rx={2} fill={SOFT} opacity={0.55} />
              ))}
            </g>
          ))}
        </g>
      )
    default:
      return <Plate w={w} h={h} />
  }
}

/** Icon eines Geräts: Produktbild, falls vorhanden, sonst gezeichnete Frontplatte. Passt sich in ein Quadrat ein. */
export function DeviceIcon({ typeId, size = 56 }: { typeId: string; size?: number }) {
  const img = DEVICE_IMG[typeId]
  if (img) return <img src={img} width={size} height={size} alt="" draggable={false} style={{ objectFit: 'contain' }} />
  const dt = deviceType(typeId)
  const pad = 8
  const vw = dt.w + pad * 2
  const vh = dt.h + pad * 2
  return (
    <svg width={size} height={size} viewBox={`${-vw / 2} ${-vh / 2} ${vw} ${vh}`} aria-hidden style={{ overflow: 'visible' }}>
      <DeviceFace dt={dt} />
    </svg>
  )
}

/** Icon eines Leitungstyps: Produktbild oder ein farbiger Leitungsstrich als Ersatz. */
export function CableIcon({ typeId, size = 56 }: { typeId: string; size?: number }) {
  const img = CABLE_IMG[typeId]
  if (img) return <img src={img} width={size} height={size} alt="" draggable={false} style={{ objectFit: 'contain' }} />
  const ct = cableType(typeId)
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <path d="M8 46 C 22 46, 22 18, 36 18 S 50 30, 56 18" fill="none" stroke={ct.color} strokeWidth={7} strokeLinecap="round" />
      <path d="M8 46 C 22 46, 22 18, 36 18 S 50 30, 56 18" fill="none" stroke="#fff" strokeOpacity={0.35} strokeWidth={2} strokeLinecap="round" />
    </svg>
  )
}
