import { useMemo, useState } from 'react'
import { Check, HardHat, X } from 'lucide-react'
import { cableType, deviceType } from '../config/catalog'
import { boundsOf, cableLengths, wallAngleDeg } from '../lib/geom'
import { planPoint } from '../lib/runs'
import { formatLen } from '../lib/units'
import { useStore } from '../store'
import type { Floor } from '../types'
import { PlanOpening } from './OpeningGlyphs'
import { PlanSymbolShape } from './DeviceIcons'

type Item = { id: string; kind: 'device' | 'cable'; title: string; sub: string }

function itemsOf(floor: Floor, unit: 'mm' | 'cm' | 'm'): Item[] {
  const out: Item[] = []
  floor.cables.forEach((c, i) => {
    const ct = cableType(c.typeId)
    const dn = (idx: number) => {
      const id = c.points[idx]?.deviceId
      const d = id ? floor.devices.find((x) => x.id === id) : null
      return d ? deviceType(d.typeId).name : 'Punkt'
    }
    out.push({ id: c.id, kind: 'cable', title: `L${i + 1} · ${ct.name}`, sub: `${dn(0)} → ${dn(c.points.length - 1)} · ${formatLen(cableLengths(c.points).total, unit)}` })
  })
  for (const d of floor.devices) {
    if (d.typeId === 'steig') continue
    const dt = deviceType(d.typeId)
    const wi = floor.walls.findIndex((w) => w.id === d.wallId) + 1
    out.push({ id: d.id, kind: 'device', title: dt.name, sub: `${wi ? `Wand ${wi} · ` : ''}Höhe ${formatLen(d.height, unit)}` })
  }
  return out
}

/** Baustellen-Modus: Lesemodus (kein Bearbeiten), Leitungen und Geräte abhaken, Fortschritt je Geschoss. */
export default function SiteView() {
  const project = useStore((s) => s.project)
  const unit = useStore((s) => s.unit)
  const activeId = useStore((s) => s.activeFloorId)
  const setActive = useStore((s) => s.setActiveFloor)
  const setSite = useStore((s) => s.setSiteMode)
  const toggle = useStore((s) => s.toggleDone)
  const [onlyOpen, setOnlyOpen] = useState(false)
  const [focus, setFocus] = useState<string | null>(null)
  const done = project.done ?? {}
  const notes = project.notes ?? {}
  const photos = useStore((s) => s.photos)
  const floor = project.floors.find((f) => f.id === activeId) ?? project.floors[0]

  const all = useMemo(() => project.floors.map((f) => itemsOf(f, unit)), [project.floors, unit])
  const items = all[project.floors.indexOf(floor)] ?? []
  const stat = (list: Item[]) => ({ n: list.length, d: list.filter((i) => done[i.id]).length })
  const tot = stat(all.flat())
  const cur = stat(items)
  const pct = (s: { n: number; d: number }) => (s.n ? Math.round((s.d / s.n) * 100) : 0)

  const b = boundsOf(floor.walls.flatMap((w) => [w.a, w.b])) ?? { minX: 0, minY: 0, maxX: 5000, maxY: 4000 }
  const pad = 500
  const vb = { x: b.minX - pad, y: b.minY - pad, w: b.maxX - b.minX + 2 * pad, h: b.maxY - b.minY + 2 * pad }
  const u = Math.max(vb.w, vb.h) / 700 // 1 „Pixel“ in mm
  const shown = onlyOpen ? items.filter((i) => !done[i.id]) : items

  return (
    <div className="site">
      <header className="site-head">
        <HardHat size={20} />
        <div className="site-title">
          <b>{project.name}</b>
          <span>
            {tot.d} von {tot.n} erledigt · {pct(tot)} %
          </span>
        </div>
        <button className="btn small" onClick={() => setSite(false)}>
          <X size={14} /> Beenden
        </button>
      </header>
      <div className="site-bar">
        <div className="site-bar-fill" style={{ width: pct(tot) + '%' }} />
      </div>
      <nav className="site-floors">
        {project.floors.map((f, i) => {
          const s = stat(all[i])
          return (
            <button key={f.id} className={'floor-tab' + (f.id === floor.id ? ' active' : '')} onClick={() => (setActive(f.id), setFocus(null))}>
              {f.name} <small>{s.d}/{s.n}</small>
            </button>
          )
        })}
      </nav>
      <div className="site-body">
        <svg className="site-plan" viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}>
          {floor.walls.map((w) => (
            <line key={w.id} x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y} stroke="var(--wall)" strokeWidth={w.thickness} strokeLinecap="square" />
          ))}
          {floor.openings.map((o) => {
            const w = floor.walls.find((x) => x.id === o.wallId)
            if (!w) return null
            return (
              <g key={o.id} transform={`translate(${w.a.x} ${w.a.y}) rotate(${wallAngleDeg(w)})`}>
                <rect x={o.offset} y={-w.thickness / 2 - 2} width={o.width} height={w.thickness + 4} fill="var(--paper)" />
                <PlanOpening type={o.type} x={o.offset} w={o.width} t={w.thickness} sw={u * 1.2} sw2={u} />
              </g>
            )
          })}
          {floor.cables.map((c) => {
            const d = done[c.id]
            return (
              <polyline
                key={c.id}
                points={c.points.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke={d ? '#30d158' : '#ff9f0a'}
                strokeWidth={u * (focus === c.id ? 5 : 3)}
                strokeDasharray={d ? undefined : `${u * 8} ${u * 5}`}
                strokeLinejoin="round"
                strokeLinecap="round"
                onClick={() => setFocus(c.id)}
              />
            )
          })}
          {floor.devices.map((d) => {
            const p = planPoint(floor, d)
            if (!p || d.typeId === 'steig') return null
            const dt = deviceType(d.typeId)
            const ok = done[d.id]
            return (
              <g key={d.id} transform={`translate(${p.x} ${p.y})`} onClick={() => setFocus(d.id)}>
                <PlanSymbolShape cat={dt.category} r={u * (focus === d.id ? 14 : 10)} fill={ok ? '#30d158' : dt.color} stroke="var(--paper)" sw={u * 1.4} />
                {ok && <circle r={u * 4} fill="#fff" />}
              </g>
            )
          })}
        </svg>
        <section className="site-list">
          <div className="site-list-head">
            <b>
              {floor.name}: {cur.d} von {cur.n} · {pct(cur)} %
            </b>
            <label className="check">
              <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} /> nur offene
            </label>
          </div>
          {shown.length === 0 && <p className="muted">{items.length ? 'Alles erledigt 🎉' : 'In diesem Geschoss gibt es noch nichts zu tun.'}</p>}
          {shown.map((i) => (
            <button key={i.id} className={'site-item' + (done[i.id] ? ' done' : '') + (focus === i.id ? ' focus' : '')} onClick={() => setFocus(i.id)}>
              <span
                className="site-check"
                role="checkbox"
                aria-checked={!!done[i.id]}
                onClick={(e) => {
                  e.stopPropagation()
                  toggle(i.id)
                  setFocus(i.id)
                }}
              >
                {done[i.id] && <Check size={18} />}
              </span>
              <span className="site-item-text">
                <b>{i.title}</b>
                <small>{i.sub}</small>
                {notes[i.id]?.text && <span className="site-note">{notes[i.id].text}</span>}
                {!!notes[i.id]?.photos.length && (
                  <span className="site-thumbs">
                    {notes[i.id].photos.map((id) => (photos[id] ? <img key={id} src={photos[id]} alt="Foto" onClick={(e) => (e.stopPropagation(), window.open(photos[id], '_blank'))} /> : null))}
                  </span>
                )}
              </span>
            </button>
          ))}
        </section>
      </div>
    </div>
  )
}
