import type { ReactNode } from 'react'
import type { OpeningType } from '../types'

interface PlanProps {
  type: OpeningType
  x: number // Offset (mm) entlang der Wand
  w: number // Breite
  t: number // Wanddicke
  sw: number // Strichstärke (Linien)
  sw2?: number // dünn
  vec?: boolean // non-scaling-stroke
}

/** Planzeichen einer Öffnung in Wandkoordinaten (x entlang, y quer, 0 = Wandachse). */
export function PlanOpening({ type, x, w, t, sw, sw2, vec }: PlanProps): ReactNode {
  const v = vec ? ({ vectorEffect: 'non-scaling-stroke' } as const) : {}
  const thin = sw2 ?? sw
  if (type === 'door')
    return (
      <>
        <line x1={x} y1={0} x2={x} y2={w} stroke="var(--ink)" strokeWidth={sw} {...v} />
        <path d={`M ${x} ${w} A ${w} ${w} 0 0 0 ${x + w} 0`} fill="none" stroke="var(--ink-soft)" strokeWidth={thin} {...v} />
      </>
    )
  if (type === 'liftSlide')
    return (
      <>
        <rect x={x} y={-t / 2} width={w} height={t} fill="none" stroke="var(--ink)" strokeWidth={sw} {...v} />
        <line x1={x} y1={-t / 6} x2={x + w * 0.58} y2={-t / 6} stroke="var(--ink)" strokeWidth={sw} {...v} />
        <line x1={x + w * 0.42} y1={t / 6} x2={x + w} y2={t / 6} stroke="var(--ink)" strokeWidth={sw} {...v} />
        <path d={`M ${x + w * 0.3} ${t * 0.9} H ${x + w * 0.7} m -${t * 0.35} -${t * 0.25} l ${t * 0.35} ${t * 0.25} l -${t * 0.35} ${t * 0.25}`} fill="none" stroke="var(--ink-soft)" strokeWidth={thin} {...v} />
      </>
    )
  if (type === 'floorWindow')
    return (
      <>
        <rect x={x} y={-t / 2} width={w} height={t} fill="none" stroke="var(--ink)" strokeWidth={sw} {...v} />
        <line x1={x} y1={-t / 6} x2={x + w} y2={-t / 6} stroke="var(--ink)" strokeWidth={sw} {...v} />
        <line x1={x} y1={t / 6} x2={x + w} y2={t / 6} stroke="var(--ink)" strokeWidth={sw} {...v} />
        <line x1={x + w / 2} y1={-t / 2} x2={x + w / 2} y2={t / 2} stroke="var(--ink)" strokeWidth={thin} {...v} />
      </>
    )
  return (
    <>
      <rect x={x} y={-t / 2} width={w} height={t} fill="none" stroke="var(--ink)" strokeWidth={sw} {...v} />
      <line x1={x} y1={0} x2={x + w} y2={0} stroke="var(--ink)" strokeWidth={sw} {...v} />
    </>
  )
}

/** Piktogramm (Ansicht von vorn) für Auswahlmaske und Optionsleiste. */
export function OpeningIcon({ type, size = 56 }: { type: OpeningType; size?: number }) {
  const ink = 'var(--ink)'
  const glass = 'var(--accent-soft)'
  const common = { stroke: ink, strokeWidth: 2, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const }
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <rect x="2" y="6" width="60" height="52" rx="3" fill="var(--wall, #d9d9de)" opacity="0.35" />
      <line x1="2" y1="58" x2="62" y2="58" {...common} strokeWidth={2.4} />
      {type === 'door' && (
        <>
          <rect x="21" y="14" width="22" height="44" fill="var(--canvas, #fff)" {...common} />
          <circle cx="39" cy="37" r="1.9" fill={ink} />
          <path d="M21 14 L43 36 M21 58 L43 36" stroke={ink} strokeWidth="1" strokeDasharray="2.5 2.5" fill="none" opacity="0.5" />
        </>
      )}
      {type === 'window' && (
        <>
          <rect x="16" y="22" width="32" height="22" fill={glass} {...common} />
          <line x1="32" y1="22" x2="32" y2="44" {...common} strokeWidth={1.4} />
          <line x1="14" y1="46" x2="50" y2="46" {...common} />
        </>
      )}
      {type === 'floorWindow' && (
        <>
          <rect x="19" y="12" width="26" height="46" fill={glass} {...common} />
          <line x1="32" y1="12" x2="32" y2="58" {...common} strokeWidth={1.4} />
          <line x1="19" y1="35" x2="45" y2="35" {...common} strokeWidth={1.4} />
        </>
      )}
      {type === 'liftSlide' && (
        <>
          <rect x="7" y="14" width="50" height="44" fill={glass} {...common} />
          <rect x="7" y="14" width="26" height="44" fill="none" {...common} strokeWidth={1.4} />
          <rect x="31" y="14" width="26" height="44" fill="none" {...common} strokeWidth={1.4} />
          <path d="M22 36 h20 m-5 -4 l5 4 l-5 4" fill="none" {...common} strokeWidth={1.6} />
        </>
      )}
    </svg>
  )
}
