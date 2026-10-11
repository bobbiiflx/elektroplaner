import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../config/catalog'
import { cableLengths, nearestWall, pointOnWall, wallLength } from './geom'
import { sampleProject, elevationOf } from './factory'
import { formatLen, fromDisplay, parseNum, toDisplay } from './units'
import { ampacityOf, evaluate, voltageDropPct } from './vde'
import { checkCable, checkDevice, horizontalBands, verticalSpans } from './zones'

describe('units', () => {
  it('rechnet zwischen mm, cm und m', () => {
    expect(toDisplay(2500, 'm')).toBe(2.5)
    expect(toDisplay(2500, 'cm')).toBe(250)
    expect(fromDisplay(1.05, 'm')).toBeCloseTo(1050)
  })
  it('formatiert und parst deutsche Zahlen', () => {
    expect(formatLen(2500, 'm')).toBe('2,5 m')
    expect(formatLen(115, 'mm')).toBe('115 mm')
    expect(parseNum('2,5')).toBe(2.5)
    expect(parseNum(' 1050 ')).toBe(1050)
  })
})

describe('geometrie', () => {
  const p = sampleProject()
  const f = p.floors[0]
  it('Wandlänge und Punkt auf Wand', () => {
    expect(wallLength(f.walls[0])).toBe(5000)
    const pt = pointOnWall(f.walls[0], 1000, 1, 120)
    expect(pt.x).toBeCloseTo(2000)
    expect(pt.y).toBeCloseTo(1120) // Seite +1 der oberen Wand liegt innen (nach unten)
  })
  it('findet die nächste Wand', () => {
    const hit = nearestWall(f.walls, { x: 3000, y: 1100 }, 300)
    expect(hit?.wall.id).toBe('w1')
    expect(hit?.t).toBeCloseTo(2000)
  })
  it('Leitungslänge inkl. senkrechter Abschnitte', () => {
    const l = cableLengths(f.cables[0].points)
    expect(l.vertical).toBeCloseTo(1900 + 1150)
    expect(l.horizontal).toBeCloseTo(1680)
  })
  it('Geschosshöhen summieren sich', () => {
    const q = { ...p, floors: [f, { ...f, id: 'x' }, { ...f, id: 'y' }] }
    expect(elevationOf(q, 2)).toBe(5600)
  })
})

describe('VDE', () => {
  const vde = DEFAULT_SETTINGS.vde
  it('Spannungsfall 1,5 mm², 16 A, 20 m', () => {
    const pct = voltageDropPct(
      { lengthM: 20, fuseA: 16, crossSection: 1.5, phases: 1, method: 'B2', charac: 'B' },
      vde,
    )
    expect(pct).toBeCloseTo(3.86, 1)
  })
  it('maximale Länge und Abschaltbedingung', () => {
    const r = evaluate({ lengthM: 10, fuseA: 16, crossSection: 1.5, phases: 1, method: 'B2', charac: 'B' }, vde)
    expect(r.maxLenDropM).toBeCloseTo(15.5, 1)
    expect(r.dropOk).toBe(true)
    expect(r.loopMaxOhm).toBeCloseTo(2.875, 3)
    expect(r.ampacityOk).toBe(true)
  })
  it('B2-Belastbarkeit 5×1,5 ist für B16 zu klein', () => {
    expect(ampacityOf(1.5, 'B2', 3)).toBe(15)
    const r = evaluate({ lengthM: 5, fuseA: 16, crossSection: 1.5, phases: 3, method: 'B2', charac: 'B' }, vde)
    expect(r.ampacityOk).toBe(false)
  })
})

describe('Installationszonen', () => {
  const z = DEFAULT_SETTINGS.zones
  it('Zonenmitten', () => {
    const bands = horizontalBands(z, 2500).map((b) => b.center)
    expect(bands).toEqual([300, 1050, 1500, 2200])
  })
  it('Gerätehöhe', () => {
    expect(checkDevice(300, z, 2500).ok).toBe(true)
    expect(checkDevice(1150, z, 2500).ok).toBe(true)
    expect(checkDevice(700, z, 2500).ok).toBe(false)
  })
  it('senkrechte Zonen an Wandenden und neben Öffnungen', () => {
    const f = sampleProject().floors[0]
    const spans = verticalSpans(f.walls[2], f.openings, z)
    expect(spans.length).toBeGreaterThanOrEqual(4)
  })
  it('Beispielleitung verstößt nicht gegen die Zonen', () => {
    const f = sampleProject().floors[0]
    expect(checkCable(f.cables[0], f, z, 2500)).toEqual([])
  })
  it('schräge und freie Abschnitte werden gemeldet', () => {
    const f = sampleProject().floors[0]
    const bad = {
      ...f.cables[0],
      points: [
        { x: 1000, y: 3000, z: 300 },
        { x: 1000, y: 2000, z: 700 },
        { x: 1000, y: 1500, z: 700 },
      ],
    }
    const issues = checkCable(bad, f, z, 2500)
    expect(issues.length).toBe(2)
  })
})
