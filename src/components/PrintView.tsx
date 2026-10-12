import { useMemo, useState } from 'react'
import { ArrowLeft, Printer } from 'lucide-react'
import { METHOD_LABEL, cableType, deviceType, devType, resolveDevice, type DeviceType } from '../config/catalog'
import { useFloor, useStore } from '../store'
import type { Cable, Device, Floor, ProjectSettings, Wall, ZoneSettings } from '../types'
import { boundsOf, cableLengths, clamp, projectOnWall, wallAngleDeg, wallLength } from '../lib/geom'
import { formatLen } from '../lib/units'
import { horizontalBands, verticalSpans } from '../lib/zones'
import { DeviceFace, PlanSymbolShape } from './DeviceIcons'
import { ElevationDims, FreeDim, PlanDims } from './dims'
import { Segmented } from './ui'

type Paper = 'A4' | 'A3'
const SHEET: Record<Paper, { w: number; h: number }> = { A4: { w: 297, h: 210 }, A3: { w: 420, h: 297 } }
const MARGIN = 10 // mm
const TITLE_H = 14 // mm Schriftfeld
const NICE = [5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 125, 150, 200, 250, 300, 400, 500, 750, 1000]
const MM_PER_PX = 25.4 / 96
const ROW_H = 6.4 // mm Tabellenzeile

interface Opts {
  paper: Paper
  plan: boolean
  walls: boolean
  list: boolean
  zones: boolean
  dims: boolean
}

type Row = { nr: string; pos: string; size: string; detail: string; checks: string[] }

type Page =
  | { kind: 'plan' }
  | { kind: 'wall'; wall: Wall; wi: number; side: 1 | -1; rows: Row[]; first: boolean; part: number }
  | { kind: 'cables'; rows: Row[]; part: number }

const pickScale = (fits: (n: number) => boolean) => NICE.find(fits) ?? NICE[NICE.length - 1]

const LEGEND_W = 58
const planScale = (floor: Floor, areaW: number, areaH: number) => {
  const b = boundsOf(floor.walls.flatMap((w) => [w.a, w.b])) ?? { minX: 0, minY: 0, maxX: 1000, maxY: 1000 }
  const padMm = 12
  const aw = areaW - LEGEND_W - 4
  const w0 = b.maxX - b.minX
  const h0 = b.maxY - b.minY
  return { b, padMm, w0, h0, N: pickScale((n) => w0 / n + 2 * padMm <= aw && h0 / n + 2 * padMm <= areaH) }
}
const WALL_M = { mL: 12, mR: 24, mT: 10, mB: 16 }
const wallScale = (L: number, H: number, areaW: number, drawH: number) =>
  pickScale((n) => L / n + WALL_M.mL + WALL_M.mR <= areaW && (H + 320) / n + WALL_M.mT + WALL_M.mB <= drawH)

/** Zusammenhängende Leitungsläufe einer Wand in Wandkoordinaten. */
function wallRuns(floor: Floor, wall: Wall) {
  const out: { cable: Cable; pts: { u: number; z: number; deviceId?: string }[] }[] = []
  for (const c of floor.cables) {
    let cur: { u: number; z: number; deviceId?: string }[] = []
    for (const n of c.points) {
      const r = projectOnWall(wall, n)
      if (r.dist <= wall.thickness / 2 + 80) cur.push({ u: r.t, z: n.z, deviceId: n.deviceId })
      else {
        if (cur.length > 1) out.push({ cable: c, pts: cur })
        cur = []
      }
    }
    if (cur.length > 1) out.push({ cable: c, pts: cur })
  }
  return out
}

function nodeLabel(floor: Floor, deviceId: string | undefined, unit: Parameters<typeof formatLen>[1]) {
  const d = deviceId ? floor.devices.find((x) => x.id === deviceId) : undefined
  if (!d) return 'Leitungsende / Verteiler'
  const wi = floor.walls.findIndex((w) => w.id === d.wallId) + 1
  return `${deviceType(d.typeId).name} (W${wi}, ${formatLen(d.height, unit)})`
}

function chunk<T>(arr: T[], first: number, rest: number): T[][] {
  const out: T[][] = []
  let i = 0
  let cap = first
  while (i < arr.length || out.length === 0) {
    out.push(arr.slice(i, i + cap))
    i += cap
    cap = rest
  }
  return out
}

const Check = ({ label }: { label: string }) => (
  <span className="pv-check">
    <i /> {label}
  </span>
)

function Sheet({ paper, title, scale, project, floorName, nr, total, children }: { paper: Paper; title: string; scale?: number; project: string; floorName: string; nr: number; total: number; children: React.ReactNode }) {
  const { w, h } = SHEET[paper]
  return (
    <section className="pv-sheet" style={{ width: `${w}mm`, height: `${h}mm`, padding: `${MARGIN}mm` }}>
      <div className="pv-body" style={{ height: `${h - 2 * MARGIN - TITLE_H}mm` }}>
        {children}
      </div>
      <footer className="pv-title" style={{ height: `${TITLE_H}mm` }}>
        <div>
          <b>{project}</b>
          <span>{floorName}</span>
        </div>
        <div className="pv-main">{title}</div>
        <div className="pv-meta">
          {scale ? <span>M 1:{scale}</span> : null}
          <span>{paper}</span>
          <span>{new Date().toLocaleDateString('de-DE')}</span>
          <span>
            Seite {nr}/{total}
          </span>
        </div>
      </footer>
    </section>
  )
}

function PlanPage({ floor, opts, unit, areaW, areaH }: { floor: Floor; opts: Opts; unit: 'mm' | 'cm' | 'm'; areaW: number; areaH: number }) {
  const legendW = LEGEND_W
  const { b, padMm, w0, h0, N } = planScale(floor, areaW, areaH)
  const px = (n: number) => n * MM_PER_PX * N
  const pad = padMm * N
  const vb = { x: b.minX - pad, y: b.minY - pad, w: w0 + 2 * pad, h: h0 + 2 * pad }
  const symR = 2.2 * N

  const devCounts = new Map<string, number>()
  for (const d of floor.devices) devCounts.set(d.typeId, (devCounts.get(d.typeId) ?? 0) + 1)
  const cabLen = new Map<string, number>()
  for (const c of floor.cables) cabLen.set(c.typeId, (cabLen.get(c.typeId) ?? 0) + cableLengths(c.points).total)

  const facePos = (d: Device) => {
    const w = floor.walls.find((x) => x.id === d.wallId)
    if (!w) return null
    const L = wallLength(w)
    const dx = (w.b.x - w.a.x) / L
    const dy = (w.b.y - w.a.y) / L
    const nx = -dy
    const ny = dx
    return { x: w.a.x + dx * d.offset + nx * d.side * w.thickness / 2, y: w.a.y + dy * d.offset + ny * d.side * w.thickness / 2 }
  }

  return (
    <div style={{ display: 'flex', gap: '4mm', height: '100%' }}>
      <svg width={`${vb.w / N}mm`} height={`${vb.h / N}mm`} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} style={{ flex: 'none' }}>
        {floor.walls.map((w) => (
          <line key={w.id} x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y} stroke="var(--wall)" strokeWidth={w.thickness} strokeLinecap="square" />
        ))}
        {floor.openings.map((o) => {
          const w = floor.walls.find((x) => x.id === o.wallId)
          if (!w) return null
          const t = w.thickness
          return (
            <g key={o.id} transform={`translate(${w.a.x} ${w.a.y}) rotate(${wallAngleDeg(w)})`}>
              <rect x={o.offset} y={-t / 2 - 2} width={o.width} height={t + 4} fill="var(--paper)" />
              {o.type === 'door' ? (
                <>
                  <line x1={o.offset} y1={0} x2={o.offset} y2={o.width} stroke="var(--ink)" strokeWidth={px(1)} />
                  <path d={`M ${o.offset} ${o.width} A ${o.width} ${o.width} 0 0 0 ${o.offset + o.width} 0`} fill="none" stroke="var(--ink-soft)" strokeWidth={px(0.8)} />
                </>
              ) : (
                <>
                  <rect x={o.offset} y={-t / 2} width={o.width} height={t} fill="none" stroke="var(--ink)" strokeWidth={px(1)} />
                  <line x1={o.offset} y1={0} x2={o.offset + o.width} y2={0} stroke="var(--ink)" strokeWidth={px(1)} />
                </>
              )}
            </g>
          )
        })}
        {floor.cables.map((c) => (
          <polyline key={c.id} points={c.points.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={cableType(c.typeId).color} strokeWidth={px(1.6)} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {floor.devices.map((d) => {
          const p = facePos(d)
          if (!p) return null
          const dt = deviceType(d.typeId)
          return (
            <g key={d.id} transform={`translate(${p.x} ${p.y})`}>
              <PlanSymbolShape cat={dt.category} r={symR} fill={dt.color} stroke="var(--paper)" sw={px(0.8)} />
            </g>
          )
        })}
        {opts.dims && <PlanDims floor={floor} unit={unit} px={px} color="#0a4a9a" />}
        {opts.dims &&
          (floor.dims ?? [])
            .filter((m) => m.space === 'plan')
            .map((m) => <FreeDim key={m.id} a={m.a} b={m.b} text={formatLen(Math.hypot(m.b.x - m.a.x, m.b.y - m.a.y), unit)} px={px} color="#0a4a9a" />)}
        {floor.walls.map((w, i) => {
          const L = wallLength(w)
          if (L < 300) return null
          const mx = (w.a.x + w.b.x) / 2
          const my = (w.a.y + w.b.y) / 2
          const c = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }
          const nx = -(w.b.y - w.a.y) / L
          const ny = (w.b.x - w.a.x) / L
          const sgn = (mx - c.x) * nx + (my - c.y) * ny >= 0 ? -1 : 1 // nach innen
          const off = w.thickness / 2 + px(9)
          return (
            <text key={w.id} x={mx + nx * sgn * off} y={my + ny * sgn * off} fontSize={px(10)} fontWeight={700} textAnchor="middle" dominantBaseline="central" fill="var(--ink)">
              W{i + 1}
            </text>
          )
        })}
      </svg>
      <aside className="pv-legend" style={{ width: `${legendW}mm` }}>
        <h4>Geräte</h4>
        {[...devCounts].map(([id, n]) => {
          const dt = deviceType(id)
          return (
            <div key={id} className="pv-leg-row">
              <svg width="5mm" height="5mm" viewBox="-18 -18 36 36">
                <PlanSymbolShape cat={dt.category} r={11} fill={dt.color} stroke="var(--paper)" sw={1.4} />
              </svg>
              <span>{dt.name}</span>
              <b>{n}×</b>
            </div>
          )
        })}
        {!devCounts.size && <div className="pv-muted">keine</div>}
        <h4>Leitungen</h4>
        {[...cabLen].map(([id, l]) => {
          const ct = cableType(id)
          return (
            <div key={id} className="pv-leg-row">
              <i className="pv-line" style={{ background: ct.color }} />
              <span>{ct.name}</span>
              <b>{formatLen(l, 'm')}</b>
            </div>
          )
        })}
        {!cabLen.size && <div className="pv-muted">keine</div>}
        <h4>Hinweis</h4>
        <div className="pv-muted">Maße in {unit}. W1, W2 … verweisen auf die Wandansichten.</div>
      </aside>
    </div>
  )
}

function WallPage({ floor, wall, wi, side, rows, first, opts, unit, areaW, areaH, zones, settings }: { floor: Floor; wall: Wall; wi: number; side: 1 | -1; rows: Row[]; first: boolean; opts: Opts; unit: 'mm' | 'cm' | 'm'; areaW: number; areaH: number; zones: ZoneSettings; settings: ProjectSettings }) {
  const L = wallLength(wall)
  const H = wall.height ?? floor.wallHeight
  const { mL, mR, mT, mB } = WALL_M
  const N = wallScale(L, H, areaW, areaH * 0.6)
  const px = (n: number) => n * MM_PER_PX * N
  const X = (u: number) => (side === 1 ? u : L - u)
  const devicesHere = floor.devices.filter((d) => d.wallId === wall.id)
  const openingsHere = floor.openings.filter((o) => o.wallId === wall.id)
  const kOf = (dt: DeviceType) => clamp((5 * N) / Math.max(dt.w, dt.h), 1, 4)
  const front = devicesHere.filter((d) => d.side === side).sort((a, b) => X(a.offset) - X(b.offset))
  const back = devicesHere.filter((d) => d.side !== side)
  const runs = wallRuns(floor, wall)
  const bands = horizontalBands(zones, H)
  const spans = verticalSpans(wall, openingsHere, zones)
  const vb = { x: -mL * N, y: -(H + 160) - mT * N, w: L + (mL + mR) * N, h: H + 320 + (mT + mB) * N }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '3mm' }}>
      {first && (
        <svg width={`${vb.w / N}mm`} height={`${vb.h / N}mm`} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} style={{ flex: 'none' }}>
          <defs>
            <pattern id={`pvh${wi}${side}`} width={90} height={90} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1={0} y1={0} x2={0} y2={90} stroke="var(--ink-soft)" strokeWidth={px(0.8)} opacity={0.6} />
            </pattern>
          </defs>
          <rect x={-300} y={0} width={L + 600} height={160} fill={`url(#pvh${wi}${side})`} />
          <rect x={-300} y={-H - 160} width={L + 600} height={160} fill={`url(#pvh${wi}${side})`} />
          <rect x={0} y={-H} width={L} height={H} fill="var(--paper)" stroke="var(--wall)" strokeWidth={px(1.2)} />
          {opts.zones && (
            <g>
              {spans.map(([a, b], i) => (
                <rect key={'v' + i} x={Math.min(X(a), X(b))} y={-H} width={Math.abs(b - a)} height={H} fill="var(--ok)" opacity={0.14} />
              ))}
              {bands.map((bd) => (
                <rect key={bd.id} x={0} y={-(bd.center + zones.width / 2)} width={L} height={zones.width} fill="var(--ok)" opacity={0.18} />
              ))}
            </g>
          )}
          <line x1={-300} y1={0} x2={L + 300} y2={0} stroke="var(--wall)" strokeWidth={px(1.6)} />
          <text x={L + px(5)} y={0} fontSize={px(9)} dominantBaseline="central" fill="var(--ink-soft)">
            OKFF ±0
          </text>
          <text x={L + px(5)} y={-H} fontSize={px(9)} dominantBaseline="central" fill="var(--ink-soft)">
            Decke {formatLen(H, unit)}
          </text>
          {openingsHere.map((o) => {
            const x0 = Math.min(X(o.offset), X(o.offset + o.width))
            const top = o.sill + o.height
            return (
              <g key={o.id}>
                <rect x={x0} y={-top} width={o.width} height={o.height} fill="var(--canvas)" stroke="var(--ink)" strokeWidth={px(1)} />
                {o.type === 'window' && (
                  <g stroke="var(--ink-soft)" strokeWidth={px(0.7)}>
                    <line x1={x0 + o.width / 2} y1={-top} x2={x0 + o.width / 2} y2={-o.sill} />
                    <line x1={x0} y1={-o.sill - o.height / 2} x2={x0 + o.width} y2={-o.sill - o.height / 2} />
                  </g>
                )}
              </g>
            )
          })}
          {runs.map((r, i) => (
            <polyline key={r.cable.id + i} points={r.pts.map((p) => `${X(p.u)},${-p.z}`).join(' ')} fill="none" stroke={cableType(r.cable.typeId).color} strokeWidth={px(1.6)} strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {[...back, ...front].map((d) => {
            const dt = devType(d, settings)
            const k = kOf(dt)
            const isFront = d.side === side
            return (
              <g key={d.id} transform={`translate(${X(d.offset)} ${-d.height}) scale(${k})`} opacity={isFront ? 1 : 0.3}>
                <DeviceFace dt={dt} />
              </g>
            )
          })}
          {front.map((d, i) => {
            const dt = devType(d, settings)
            const y = -d.height - (dt.h * kOf(dt)) / 2 - px(6)
            return (
              <g key={'n' + d.id}>
                <circle cx={X(d.offset)} cy={y} r={px(4.2)} fill="var(--paper)" stroke="var(--ink)" strokeWidth={px(0.8)} />
                <text x={X(d.offset)} y={y} fontSize={px(6.4)} fontWeight={700} textAnchor="middle" dominantBaseline="central" fill="var(--ink)">
                  {i + 1}
                </text>
              </g>
            )
          })}
          {opts.dims && <ElevationDims wall={wall} H={H} side={side} devices={devicesHere} openings={openingsHere} unit={unit} px={px} kOf={kOf} typeOf={(d) => resolveDevice(d, settings)} color="#0a4a9a" />}
          {opts.dims &&
            (floor.dims ?? [])
              .filter((m) => m.space === 'wall' && m.wallId === wall.id)
              .map((m) => (
                <FreeDim key={m.id} a={{ x: X(m.a.x), y: -m.a.y }} b={{ x: X(m.b.x), y: -m.b.y }} text={formatLen(Math.hypot(m.b.x - m.a.x, m.b.y - m.a.y), unit)} px={px} color="#0a4a9a" />
              ))}
        </svg>
      )}
      <table className="pv-table">
        <thead>
          <tr>
            <th style={{ width: '10mm' }}>Nr.</th>
            <th>Position</th>
            <th style={{ width: '26mm' }}>Maß</th>
            <th>Bezeichnung / Ziel</th>
            <th style={{ width: '92mm' }}>Erledigt</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{r.nr}</td>
              <td>{r.pos}</td>
              <td>{r.size}</td>
              <td>{r.detail}</td>
              <td>
                {r.checks.map((c) => (
                  <Check key={c} label={c} />
                ))}
              </td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={5} className="pv-muted">
                Keine Geräte oder Leitungen auf dieser Wandseite.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function CablesPage({ rows }: { rows: Row[] }) {
  return (
    <table className="pv-table">
      <thead>
        <tr>
          <th style={{ width: '10mm' }}>Nr.</th>
          <th style={{ width: '48mm' }}>Leitung</th>
          <th style={{ width: '30mm' }}>Länge</th>
          <th>Von → Nach</th>
          <th style={{ width: '90mm' }}>Erledigt / Prüfung</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td>{r.nr}</td>
            <td>{r.pos}</td>
            <td>{r.size}</td>
            <td>{r.detail}</td>
            <td>
              {r.checks.map((c) => (
                <Check key={c} label={c} />
              ))}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function PrintView() {
  const floor = useFloor()
  const project = useStore((s) => s.project)
  const unit = useStore((s) => s.unit)
  const showZones = useStore((s) => s.showZones)
  const showDims = useStore((s) => s.showDims)
  const setPrintOpen = useStore((s) => s.setPrintOpen)
  const [opts, setOpts] = useState<Opts>({ paper: 'A4', plan: true, walls: true, list: true, zones: showZones, dims: showDims })

  const { w: SW, h: SH } = SHEET[opts.paper]
  const areaW = SW - 2 * MARGIN
  const areaH = SH - 2 * MARGIN - TITLE_H
  const zones = project.settings.zones

  const pages = useMemo<Page[]>(() => {
    const out: Page[] = []
    if (opts.plan) out.push({ kind: 'plan' })
    if (opts.walls) {
      floor.walls.forEach((wall, wi) => {
        const L = wallLength(wall)
        const devs = floor.devices.filter((d) => d.wallId === wall.id)
        const runs = wallRuns(floor, wall)
        const hasOpen = floor.openings.some((o) => o.wallId === wall.id)
        if (!devs.length && !runs.length && !hasOpen) return
        const sides: (1 | -1)[] = []
        if (devs.some((d) => d.side === 1) || (!devs.length && (runs.length || hasOpen))) sides.push(1)
        if (devs.some((d) => d.side === -1)) sides.push(-1)
        if (!sides.length) sides.push(1)
        for (const side of sides) {
          const front = devs.filter((d) => d.side === side).sort((a, b) => (side === 1 ? a.offset - b.offset : b.offset - a.offset))
          const rows: Row[] = front.map((d, i) => {
            const rd = resolveDevice(d, project.settings)
            const fromLeft = side === 1 ? d.offset : L - d.offset
            return {
              nr: String(i + 1),
              pos: `${formatLen(fromLeft, unit)} von links`,
              size: `H ${formatLen(d.height, unit)}`,
              detail: `${rd.dt.name} · ${Math.round(rd.dt.w * 10) / 10} × ${Math.round(rd.dt.h * 10) / 10} mm${rd.box ? ` · ${rd.box.count > 1 ? rd.box.count + '× ' : ''}Dose Ø${rd.box.dia}×${rd.box.depth}` : ''}`,
              checks: ['Dose gesetzt', 'Gerät montiert', 'Funktion geprüft'],
            }
          })
          const seen = new Set<string>()
          for (const r of runs) {
            if (seen.has(r.cable.id)) continue
            seen.add(r.cable.id)
            const ci = floor.cables.findIndex((c) => c.id === r.cable.id) + 1
            const ct = cableType(r.cable.typeId)
            const a = r.cable.points[0]
            const z = r.cable.points[r.cable.points.length - 1]
            rows.push({
              nr: `L${ci}`,
              pos: `${formatLen(Math.min(...r.pts.map((p) => (side === 1 ? p.u : L - p.u))), unit)} – ${formatLen(Math.max(...r.pts.map((p) => (side === 1 ? p.u : L - p.u))), unit)}`,
              size: formatLen(cableLengths(r.cable.points).total, unit),
              detail: `${ct.name}: ${nodeLabel(floor, a.deviceId, unit)} → ${nodeLabel(floor, z.deviceId, unit)}`,
              checks: ['gezogen', 'aufgelegt'],
            })
          }
          const cap1 = Math.max(2, Math.floor((areaH * 0.4 - 8) / ROW_H))
          const capN = Math.max(4, Math.floor((areaH - 8) / ROW_H))
          chunk(rows, cap1, capN).forEach((rs, part) => out.push({ kind: 'wall', wall, wi, side, rows: rs, first: part === 0, part }))
        }
      })
    }
    if (opts.list && floor.cables.length) {
      const rows: Row[] = floor.cables.map((c, i) => {
        const ct = cableType(c.typeId)
        const len = cableLengths(c.points)
        const a = c.points[0]
        const z = c.points[c.points.length - 1]
        return {
          nr: `L${i + 1}`,
          pos: `${ct.name} · ${c.fuseA} A ${c.charac} · ${c.method}`,
          size: `${formatLen(len.total, unit)}`,
          detail: `${nodeLabel(floor, a.deviceId, unit)} → ${nodeLabel(floor, z.deviceId, unit)}`,
          checks: ['gezogen', 'aufgelegt', 'Isolation', 'Durchgang'],
        }
      })
      const capN = Math.max(4, Math.floor((areaH - 14) / ROW_H))
      chunk(rows, capN, capN).forEach((rs, part) => out.push({ kind: 'cables', rows: rs, part }))
    }
    return out
  }, [floor, project.settings, opts.plan, opts.walls, opts.list, areaH, unit])

  const set = (o: Partial<Opts>) => setOpts((v) => ({ ...v, ...o }))
  const tog = (k: 'plan' | 'walls' | 'list' | 'zones' | 'dims', label: string) => (
    <label className="pv-opt">
      <input type="checkbox" checked={opts[k]} onChange={(e) => set({ [k]: e.target.checked })} /> {label}
    </label>
  )

  return (
    <div className="printview">
      <style>{`@page { size: ${opts.paper} landscape; margin: 0 }`}</style>
      <div className="pv-bar">
        <button className="btn small" onClick={() => setPrintOpen(false)}>
          <ArrowLeft size={14} /> Zurück
        </button>
        <b>Druckansicht</b>
        <Segmented value={opts.paper} onChange={(paper) => set({ paper })} options={[{ value: 'A4', label: 'A4' }, { value: 'A3', label: 'A3' }]} />
        {tog('plan', 'Grundriss')}
        {tog('walls', 'Wandansichten + Checklisten')}
        {tog('list', 'Leitungsliste')}
        {tog('dims', 'Maße')}
        {tog('zones', 'Zonen')}
        <div className="spacer" />
        <span className="pv-muted">{pages.length} Seiten</span>
        <button className="btn small primary" onClick={() => window.print()}>
          <Printer size={14} /> Drucken / als PDF sichern
        </button>
      </div>
      <div className="pv-pages">
        {pages.map((p, i) => {
          const common = { paper: opts.paper, project: project.name, floorName: floor.name, nr: i + 1, total: pages.length }
          if (p.kind === 'plan')
            return (
              <Sheet key={i} {...common} title="Grundriss mit Bemaßung" scale={planScale(floor, areaW, areaH).N}>
                <PlanPage floor={floor} opts={opts} unit={unit} areaW={areaW} areaH={areaH} />
              </Sheet>
            )
          if (p.kind === 'wall')
            return (
              <Sheet key={i} {...common} scale={p.first ? wallScale(wallLength(p.wall), p.wall.height ?? floor.wallHeight, areaW, areaH * 0.6) : undefined} title={`Wand ${p.wi + 1} · Seite ${p.side === 1 ? 1 : 2} · ${formatLen(wallLength(p.wall), unit)}${p.part ? ' (Forts.)' : ''}`}>
                <WallPage floor={floor} wall={p.wall} wi={p.wi} side={p.side} rows={p.rows} first={p.first} opts={opts} unit={unit} areaW={areaW} areaH={areaH} zones={zones} settings={project.settings} />
              </Sheet>
            )
          return (
            <Sheet key={i} {...common} title={`Leitungsliste & Prüfprotokoll${p.part ? ' (Forts.)' : ''}`}>
              <CablesPage rows={p.rows} />
              <p className="pv-muted" style={{ marginTop: '3mm' }}>
                Verlegeart: {Object.entries(METHOD_LABEL).map(([k, v]) => `${k} = ${v.split('–')[1]?.trim()}`).join(' · ')}
              </p>
            </Sheet>
          )
        })}
        {!pages.length && <p className="pv-muted" style={{ padding: 40 }}>Nichts zu drucken – bitte mindestens einen Umfang wählen.</p>}
      </div>
    </div>
  )
}
