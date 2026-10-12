import type { Cabinet, ModKind } from '../lib/cabinet'

const FILL: Record<ModKind, string> = {
  main: '#ff453a',
  spd: '#af52de',
  rcd: '#0a84ff',
  mcb: '#e5e5ea',
  knx: '#30d158',
  actuator: '#30d158',
  reserve: 'transparent',
}
const INK: Record<ModKind, string> = { main: '#fff', spd: '#fff', rcd: '#fff', mcb: '#1c1c1e', knx: '#fff', actuator: '#fff', reserve: '#8e8e93' }

/** Hutschienen-Belegung: Breite je Modul = Teilungseinheiten */
export function CabinetLayout({ cab, ink = '#1c1c1e' }: { cab: Cabinet; ink?: string }) {
  const TE = 22
  const H = 96
  const GAP = 26
  const W = cab.rowTE * TE + 20
  const Ht = cab.rows.length * (H + GAP) + 20
  return (
    <svg viewBox={`0 0 ${W} ${Ht}`} style={{ width: '100%', maxWidth: W * 1.7, height: 'auto', display: 'block' }} fontFamily="system-ui, sans-serif">
      {cab.rows.map((row, ri) => {
        const y = 20 + ri * (H + GAP)
        let x = 10
        return (
          <g key={ri}>
            <rect x={10} y={y + H / 2 - 4} width={cab.rowTE * TE} height={8} fill="#c7c7cc" />
            <text x={10} y={y - 4} fontSize={9} fill={ink}>
              Reihe {ri + 1} · {row.used} von {cab.rowTE} TE belegt
            </text>
            {row.modules.map((m, i) => {
              const w = m.te * TE
              const x0 = x
              x += w
              return (
                <g key={i}>
                  <rect x={x0 + 0.5} y={y} width={w - 1} height={H} rx={2} fill={FILL[m.kind]} stroke={m.kind === 'reserve' ? '#8e8e93' : '#8e8e93'} strokeWidth={0.8} strokeDasharray={m.kind === 'reserve' ? '3 3' : undefined} />
                  {m.label && (
                    <text x={x0 + w / 2} y={y + 14} fontSize={m.te > 1 ? 9 : 8} fontWeight={700} textAnchor="middle" fill={INK[m.kind]}>
                      {m.label}
                    </text>
                  )}
                  {m.sub && (
                    <text transform={`translate(${x0 + w / 2 + 3} ${y + H - 6}) rotate(-90)`} fontSize={7.5} fill={INK[m.kind]}>
                      {m.sub.length > 22 ? m.sub.slice(0, 21) + '…' : m.sub}
                    </text>
                  )}
                </g>
              )
            })}
          </g>
        )
      })}
    </svg>
  )
}

/** Einpoliger Übersichtsschaltplan: Einspeisung → Hauptschalter → FI-Gruppen → Leitungsschutzschalter */
export function CabinetDiagram({ cab, ink = '#1c1c1e' }: { cab: Cabinet; ink?: string }) {
  const CW = 46 // Breite je Abgang
  const groups = cab.groups
  const total = groups.reduce((s, g) => s + g.circuits.length, 0)
  const W = Math.max(380, total * CW + groups.length * 24 + 40)
  const H = 330
  let x = 20
  const busY = 70
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W * 1.7, height: 'auto', display: 'block' }} fontFamily="system-ui, sans-serif" stroke={ink} fill="none">
      {/* Einspeisung */}
      <text x={20} y={14} fontSize={9} fill={ink} stroke="none">Zähler / Einspeisung</text>
      <line x1={36} y1={20} x2={36} y2={34} strokeWidth={1.4} />
      <rect x={26} y={34} width={20} height={16} fill="#ff453a" stroke="none" />
      <text x={54} y={46} fontSize={8} fill={ink} stroke="none">Hauptschalter 3P 63 A</text>
      <line x1={36} y1={50} x2={36} y2={busY} strokeWidth={1.4} />
      <rect x={160} y={34} width={20} height={16} fill="#af52de" stroke="none" />
      <text x={186} y={46} fontSize={8} fill={ink} stroke="none">ÜSS Typ 2</text>
      <line x1={36} y1={busY} x2={W - 20} y2={busY} strokeWidth={1.6} />
      {groups.map((g, gi) => {
        const gx0 = x
        const gw = g.circuits.length * CW
        const cx = gx0 + gw / 2
        const hasRcd = g.name !== 'ohne FI'
        const out = (
          <g key={gi}>
            <line x1={cx} y1={busY} x2={cx} y2={busY + 18} strokeWidth={1.4} />
            {hasRcd ? (
              <>
                <rect x={cx - 24} y={busY + 18} width={48} height={20} fill="#0a84ff" stroke="none" />
                <text x={cx} y={busY + 31} fontSize={8} fontWeight={700} fill="#fff" stroke="none" textAnchor="middle">FI</text>
                <text x={cx} y={busY + 50} fontSize={8} fill={ink} stroke="none" textAnchor="middle">{g.name.length > 24 ? g.name.slice(0, 23) + '…' : g.name}</text>
              </>
            ) : (
              <text x={cx} y={busY + 34} fontSize={8} fill="#ff453a" stroke="none" textAnchor="middle">ohne FI</text>
            )}
            <line x1={cx} y1={busY + 38} x2={cx} y2={busY + 58} strokeWidth={1.4} />
            <line x1={gx0 + CW / 2} y1={busY + 58} x2={gx0 + gw - CW / 2} y2={busY + 58} strokeWidth={1.4} />
            {g.circuits.map((c, ci) => {
              const px = gx0 + ci * CW + CW / 2
              return (
                <g key={c.id}>
                  <line x1={px} y1={busY + 58} x2={px} y2={busY + 78} strokeWidth={1.2} />
                  <rect x={px - 9} y={busY + 78} width={18} height={26} fill="#e5e5ea" stroke={ink} strokeWidth={0.8} />
                  <text x={px} y={busY + 94} fontSize={7} fontWeight={700} fill={ink} stroke="none" textAnchor="middle">{c.charac}{c.rating}</text>
                  <line x1={px} y1={busY + 104} x2={px} y2={busY + 126} strokeWidth={1.2} />
                  <text transform={`translate(${px + 3} ${busY + 130}) rotate(90)`} fontSize={8} fill={ink} stroke="none">
                    {(c.phase === '3L' ? '3~ ' : c.phase + ' · ') + (c.name.length > 26 ? c.name.slice(0, 25) + '…' : c.name)}
                  </text>
                </g>
              )
            })}
          </g>
        )
        x += gw + 24
        return out
      })}
    </svg>
  )
}
