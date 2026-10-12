import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../config/catalog'
import { cableLengths, nearestWall, pointOnWall, wallLength } from './geom'
import { sampleProject, elevationOf } from './factory'
import { formatLen, fromDisplay, parseNum, toDisplay } from './units'
import { ampacityOf, evaluate, voltageDropPct } from './vde'
import { isOrthogonal, routeTo } from './cableRoute'
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

describe('Leitungsführung (nur waagerecht/senkrecht)', () => {
  const walls = [{ id: 'w', a: { x: 0, y: 0 }, b: { x: 4000, y: 0 }, thickness: 240, kind: 'outer' as const }]
  const start = { x: 1000, y: 0, z: 300 }

  it('erzeugt bei Versatz in Höhe und Länge Knick + Steigleitung', () => {
    const target = { x: 2500, y: 0, z: 1050, deviceId: 'd1' }
    const nodes = routeTo(start, target, walls)
    expect(nodes).toHaveLength(2)
    expect(nodes[0]).toMatchObject({ x: 2500, y: 0, z: 300 })
    expect(nodes[1]).toMatchObject({ x: 2500, z: 1050, deviceId: 'd1' })
    expect(isOrthogonal([start, ...nodes], walls)).toBe(true)
  })

  it('setzt bei schrägen Zielen im Grundriss einen rechtwinkligen Knick', () => {
    const target = { x: 2000, y: 1500, z: 300 }
    const nodes = routeTo(start, target, walls)
    expect(nodes).toHaveLength(2)
    expect(isOrthogonal([start, ...nodes], walls)).toBe(true)
    expect(nodes[nodes.length - 1]).toMatchObject({ x: 2000, y: 1500, z: 300 })
  })

  it('braucht bei reinem Höhenwechsel nur einen Knoten', () => {
    expect(routeTo(start, { x: 1000, y: 0, z: 2300 }, walls)).toHaveLength(1)
  })

  it('liefert nichts, wenn das Ziel schon erreicht ist', () => {
    expect(routeTo(start, { ...start }, walls)).toHaveLength(0)
  })

  it('lässt Abschnitte parallel zu schrägen Wänden zu', () => {
    const diag = [{ id: 'd', a: { x: 0, y: 0 }, b: { x: 3000, y: 3000 }, thickness: 240, kind: 'inner' as const }]
    const nodes = routeTo({ x: 500, y: 500, z: 300 }, { x: 2000, y: 2000, z: 300 }, diag)
    expect(nodes).toHaveLength(1)
  })
})

import { autoRef, lockAxis, snapPlanPoint, snapWallPoint } from './autoDims'
import { devType, resolveSpec } from '../config/catalog'

describe('autoDims', () => {
  const wall = { id: 'w', a: { x: 0, y: 0 }, b: { x: 4000, y: 0 }, thickness: 240, kind: 'outer' as const }
  const dev = (id: string, offset: number, height: number) => ({ id, typeId: 'sd-1', wallId: 'w', offset, side: 1 as const, height })
  it('misst zur nächsten Wandkante, wenn nichts auf gleicher Höhe liegt', () => {
    expect(autoRef(wall, [dev('a', 2000, 1050)], 700, 300)).toEqual({ kind: 'wall', end: 'start', u: 0 })
    expect(autoRef(wall, [], 3500, 300)).toEqual({ kind: 'wall', end: 'end', u: 4000 })
  })
  it('misst nur zur Mitte eines Objekts auf gleicher Höhe', () => {
    expect(autoRef(wall, [dev('a', 2000, 300), dev('b', 3100, 300), dev('c', 900, 1050)], 3500, 300)).toEqual({ kind: 'device', id: 'b', u: 3100 })
    expect(autoRef(wall, [dev('a', 2000, 300)], 2000, 300, 'a')).toEqual({ kind: 'wall', end: 'start', u: 0 })
  })
  it('rastet im Grundriss an Objektmitten ein, sonst am Raster, ausgeschaltet frei', () => {
    const floor = { id: 'f', name: '', levelHeight: 2800, wallHeight: 2500, walls: [wall], openings: [], devices: [dev('a', 1000, 300)], cables: [] }
    expect(snapPlanPoint(floor, { x: 1010, y: 130 }, 60, 50, true)).toMatchObject({ kind: 'device', p: { x: 1000, y: 120 } })
    expect(snapPlanPoint(floor, { x: 2037, y: 1013 }, 60, 50, true)).toMatchObject({ kind: 'grid', p: { x: 2050, y: 1000 } })
    expect(snapPlanPoint(floor, { x: 2037, y: 1013 }, 60, 50, false)).toMatchObject({ kind: 'free', p: { x: 2037, y: 1013 } })
  })
  it('rastet in der Wandansicht an Objektmitten ein', () => {
    const r = snapWallPoint(wall, 2500, [dev('a', 1000, 300)], [], { x: 1020, y: 310 }, 40, 50, true)
    expect(r).toMatchObject({ kind: 'device', p: { x: 1000, y: 300 } })
    expect(snapWallPoint(wall, 2500, [], [], { x: 1020, y: 310 }, 40, 50, false).p).toEqual({ x: 1020, y: 310 })
  })
  it('sperrt auf eine Achse', () => {
    expect(lockAxis({ x: 0, y: 0 }, { x: 500, y: 40 })).toEqual({ x: 500, y: 0 })
  })
})

describe('Schalterserien und Dosen', () => {
  it('berechnet Rahmenbreiten aus Serie und Mittenabstand', () => {
    expect(resolveSpec('sd-1', {}, 'gira-s55').dt.w).toBeCloseTo(80.7)
    expect(resolveSpec('sd-4', { seriesId: 'bj-reflex' }).dt.w).toBe(294) // 81 + 3 · 71, wie das Datenblatt
    expect(resolveSpec('sd-2', { seriesId: 'custom', w: 160, h: 90 }).dt).toMatchObject({ w: 160, h: 90 })
  })
  it('wählt Größenvarianten und Dose', () => {
    expect(resolveSpec('disp', { sizeId: 'd10' }).dt).toMatchObject({ w: 270, h: 185 })
    const r = resolveSpec('sd-3', { boxId: 'h68-61' })
    expect(r.box).toMatchObject({ dia: 68, depth: 61, count: 3, pitch: 71 })
    expect(resolveSpec('cam').box).toBeUndefined()
    expect(devType({ id: 'x', typeId: 'sw-1', wallId: 'w', offset: 0, side: 1, height: 0 }, { seriesId: 'bj-reflex' } as never).w).toBe(81)
  })
})
