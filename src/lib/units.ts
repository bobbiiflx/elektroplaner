import type { Unit } from '../types'

export const UNITS: Unit[] = ['mm', 'cm', 'm']

export function toDisplay(mm: number, unit: Unit): number {
  return unit === 'mm' ? mm : unit === 'cm' ? mm / 10 : mm / 1000
}

export function fromDisplay(v: number, unit: Unit): number {
  return unit === 'mm' ? v : unit === 'cm' ? v * 10 : v * 1000
}

export function decimalsFor(unit: Unit): number {
  return unit === 'mm' ? 1 : unit === 'cm' ? 2 : 3
}

export function fmtNum(v: number, maxDecimals: number): string {
  if (!Number.isFinite(v)) return ''
  return v.toLocaleString('de-DE', { maximumFractionDigits: maxDecimals, useGrouping: false })
}

/** Formatiert Millimeter in der gewählten Einheit, z. B. "2,5 m" oder "2500 mm". */
export function formatLen(mm: number, unit: Unit, withUnit = true): string {
  const s = fmtNum(toDisplay(mm, unit), unit === 'm' ? 2 : decimalsFor(unit))
  return withUnit ? `${s} ${unit}` : s
}

/** Akzeptiert Komma oder Punkt als Dezimaltrenner. */
export function parseNum(text: string): number {
  const n = parseFloat(text.trim().replace(/\s/g, '').replace(',', '.'))
  return n
}

export function eur(v: number): string {
  return v.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
}
