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

import { missingFor } from './completeness'
import { deviceType, electricDefaults } from '../config/catalog'
describe('completeness', () => {
  it('Leuchte ohne Stromkreis meldet fehlende Angaben, Schalter nicht', () => {
    const dt = deviceType('l-spot')
    const d = { id: 'x', typeId: 'l-spot', wallId: '', offset: 0, side: 1 as const, height: 2500, ...electricDefaults(dt) }
    expect(missingFor(d, dt)).toContain('circuit')
    expect(missingFor({ ...d, circuitId: 'c1' }, dt)).not.toContain('circuit')
  })
})

import { duplicateGAs, groupStats, isValidGA, nextGA, removeGroup } from './groups'
describe('groups', () => {
  const mk = (over: object) => ({ id: 'x', typeId: 'l-decke', wallId: '', offset: 0, side: 1 as const, height: 2500, ...over })
  it('Adressen: Format, Duplikate, nächste freie', () => {
    expect(isValidGA('1/0/3')).toBe(true)
    expect(isValidGA('1-0-3')).toBe(false)
    const g = [{ id: 'a', name: 'A', ga: '1/0/0' }, { id: 'b', name: 'B', ga: '1/0/0', gaStatus: '1/0/1' }]
    expect([...duplicateGAs(g)]).toEqual(['1/0/0'])
    expect(nextGA(g)).toBe('1/0/2')
  })
  it('Gruppenstatistik meldet Mischdimmung und fehlenden Sender; Löschen räumt auf', () => {
    const p = sampleProject()
    p.groups = [{ id: 'g1', name: 'Decke', ga: '1/0/0' }]
    p.scenes = [{ id: 's1', name: 'Abend', no: 1, values: { g1: 50 } }]
    p.floors[0].devices.push(mk({ id: 'a', groupIds: ['g1'], dimmable: true, dimType: 'phase', powerW: 10 }), mk({ id: 'b', groupIds: ['g1'], dimmable: false, powerW: 5 }))
    const st = groupStats(p, p.groups[0])
    expect(st.dim).toBe('mixed')
    expect(st.watts).toBe(15)
    expect(st.warnings.join()).toContain('Taster')
    removeGroup(p, 'g1')
    expect(p.groups).toHaveLength(0)
    expect(p.floors[0].devices.find((d) => d.id === 'a')?.groupIds).toBeUndefined()
    expect(p.scenes[0].values.g1).toBeUndefined()
  })
})

import { runOf, runSummary } from './runs'
import { newFloor } from './factory'
describe('Leitungswege', () => {
  it('schätzt über Steigpunkte und mehrere Geschosse; manuelle Länge gewinnt', () => {
    const p = sampleProject()
    const eg = p.floors[0]
    const keller = newFloor(p.settings, 'Keller')
    keller.walls = eg.walls.map((w) => ({ ...w, id: 'k' + w.id }))
    p.floors.unshift(keller)
    keller.devices.push({ id: 'hv1', typeId: 'hv', wallId: 'kw1', offset: 1000, side: 1, height: 1500 })
    keller.devices.push({ id: 'st0', typeId: 'steig', wallId: '', offset: 0, side: 1, height: 1250, x: 1500, y: 1500 })
    eg.devices.push({ id: 'st1', typeId: 'steig', wallId: '', offset: 0, side: 1, height: 1250, x: 1500, y: 1500 })
    eg.devices.push({ id: 'l1', typeId: 'l-decke', wallId: '', offset: 0, side: 1, height: 2465, x: 1500, y: 3500, control: 'knx' })
    const r = runOf(p, eg.devices.find((d) => d.id === 'l1')!)!
    expect(r.dist.device.id).toBe('hv1')
    expect(r.warn).toBeUndefined()
    expect(r.vert).toBe(Math.abs(p.floors[0].levelHeight + 2465 - 1500))
    expect(r.len).toBe(r.horiz + r.vert + r.extra)
    eg.devices.find((d) => d.id === 'l1')!.runLen = 9000
    expect(runOf(p, eg.devices.find((d) => d.id === 'l1')!)!.len).toBe(9000)
    expect(runSummary(p).perDist[0].runs).toBeGreaterThanOrEqual(1)
  })
})

import { actuatorChannels, actuatorNeeds, circuitRows, toCsv } from './schrank'
describe('Schaltschrank-Listen', () => {
  it('Kanäle je Gruppe × Stromkreis, Aktorbedarf, Stromkreislast, CSV', () => {
    const p = sampleProject()
    const eg = p.floors[0]
    p.circuits = [{ id: 'c1', name: 'F1 Licht', rating: 16, charac: 'B', phase: 'L1', rcd: 'FI 1', color: '#fff' }]
    p.groups = [{ id: 'g1', name: 'Decke', ga: '1/0/0' }, { id: 'g2', name: 'Wand', ga: '1/0/1' }]
    eg.devices.push({ id: 'h', typeId: 'hv', wallId: 'w1', offset: 500, side: 1, height: 1500 })
    const mk = (id: string, dim: boolean, g: string, w: number) => ({ id, typeId: 'l-decke', wallId: '', offset: 0, side: 1 as const, height: 2465, x: 2000, y: 2000, control: 'knx' as const, circuitId: 'c1', groupIds: [g], dimmable: dim, dimType: dim ? ('phase' as const) : undefined, powerW: w })
    eg.devices.push(mk('a', true, 'g1', 100), mk('b', true, 'g1', 100), mk('c', false, 'g2', 4000))
    const ch = actuatorChannels(p)
    expect(ch).toHaveLength(2)
    expect(ch.find((c) => c.kind === 'dim')!.devices).toBe(2)
    expect(ch.find((c) => c.kind === 'switch')!.warn.join()).toContain('16 A')
    const needs = actuatorNeeds(ch)
    expect(needs.map((n) => n.units)).toEqual([1, 1])
    const { rows } = circuitRows(p)
    expect(rows[0].watts).toBe(4200)
    expect(rows[0].warn.join()).toContain('Nennstrom')
    expect(toCsv([['a;b', 'c"d', 1]])).toBe('"a;b";"c""d";1')
  })
})

import { materialList } from './material'
describe('Material', () => {
  it('summiert Geräte, Dosen und Leitungen; eigener Preis überschreibt', () => {
    const p = sampleProject()
    const base = materialList(p, { includeRuns: false })
    expect(base.lines.some((l) => l.key.startsWith('dev:'))).toBe(true)
    expect(base.lines.some((l) => l.key.startsWith('cab:') && l.unit === 'm' && l.qty > 4)).toBe(true)
    const key = base.lines[0].key
    p.prices = { [key]: 1000 }
    const l = materialList(p, { includeRuns: false }).lines.find((x) => x.key === key)!
    expect(l.price).toBe(1000)
    expect(l.sum).toBe(1000 * l.qty)
  })
})

import { detectWalls } from './detectWalls'
describe('detectWalls', () => {
  it('erkennt Raum mit Innenwand, überbrückt Tür, ignoriert dünne Linien', () => {
    const W = 700, H = 500, mm = 10 // 7 m x 5 m
    const g = new Uint8Array(W * H).fill(255)
    const rect = (x0: number, y0: number, x1: number, y1: number) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) g[y * W + x] = 0 }
    rect(50, 50, 650, 70) // oben 200 mm
    rect(50, 430, 650, 450) // unten
    rect(50, 50, 70, 450) // links
    rect(630, 50, 650, 450) // rechts
    rect(350, 70, 360, 430) // Innenwand 100 mm
    for (let x = 80; x < 620; x++) g[250 * W + x] = 0 // dünne Maßlinie
    for (let y = 250; y < 290; y++) for (let x = 350; x < 360; x++) g[y * W + x] = 255 // Tür in Innenwand
    const walls = detectWalls(g, W, H, mm)
    const hs = walls.filter((w) => w.a.y === w.b.y), vs = walls.filter((w) => w.a.x === w.b.x)
    expect(hs.length).toBe(2)
    expect(vs.length).toBe(3)
    expect(vs.some((w) => Math.abs(w.a.x - 3550) < 200)).toBe(true)
    const inner = vs.find((w) => Math.abs(w.a.x - 3550) < 200)!
    expect(Math.abs(inner.a.x - 3550)).toBeLessThan(60)
    expect(Math.abs(Math.abs(inner.b.y - inner.a.y) - 3600)).toBeLessThan(400)
  })
})

import { parsePriceText, matchRow, priceCandidates, parseNumber } from './priceSources'
describe('Preislisten-Import', () => {
  it('liest deutsche Zahlenformate', () => {
    expect(parseNumber('1.234,56 €')).toBe(1234.56)
    expect(parseNumber('12,50')).toBe(12.5)
    expect(parseNumber('12.50')).toBe(12.5)
  })
  it('parst CSV und Freitext und ordnet zu', () => {
    const rows = parsePriceText('Artikel;Menge;Preis\nSchuko Steckdose 2-fach;1;14,90 €\nNYM-J 3x2,5 Meterware - 1,57 €\nNYM-J 5x1,5;;1,60')
    expect(rows.map((r) => r.price)).toEqual([14.9, 1.57, 1.6])
    const c = priceCandidates()
    expect(matchRow(rows[0].name, c)?.key).toBe('dev:sd-2')
    expect(matchRow(rows[1].name, c)?.key).toBe('cab:nym-3x2.5')
    expect(matchRow(rows[2].name, c)?.key).toBe('cab:nym-5x1.5')
  })
})

import { levelOf, labelsFromText, splitByWhitespace, nameBlocks } from './sheet'
import { translateFloor, riserChecks } from './stack'
describe('Blatt mit mehreren Geschossen', () => {
  it('erkennt Geschossnamen', () => {
    expect(levelOf('Grundriss Erdgeschoss M 1:100')?.level).toBe(0)
    expect(levelOf('1.OG')?.level).toBe(1)
    expect(levelOf('2. Obergeschoss')?.level).toBe(2)
    expect(levelOf('Kellergeschoss')?.level).toBe(-1)
    expect(levelOf('Dachgeschoss')?.level).toBe(90)
    expect(levelOf('Schnitt A-A')).toBeNull()
  })
  it('teilt Blatt in Blöcke und benennt sie', () => {
    const W = 600, H = 300
    const g = new Uint8Array(W * H).fill(255)
    const box = (x0: number, y0: number, x1: number, y1: number) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (x < x0 + 4 || x >= x1 - 4 || y < y0 + 4 || y >= y1 - 4) g[y * W + x] = 0 }
    box(20, 60, 180, 260); box(220, 60, 380, 260); box(420, 60, 580, 260)
    const blocks = splitByWhitespace(g, W, H)
    expect(blocks.length).toBe(3)
    const labels = labelsFromText([
      { str: 'Obergeschoss', x: 230, y: 30, w: 100, h: 14 },
      { str: 'Erdgeschoss', x: 430, y: 30, w: 100, h: 14 },
      { str: 'Keller', x: 30, y: 30, w: 50, h: 14 },
    ])
    const named = nameBlocks(blocks, labels)
    expect(named.map((b) => b.name)).toEqual(['Keller', 'Erdgeschoss', '1. Obergeschoss'])
    expect(named[0].x0).toBeLessThan(30)
  })
  it('verschiebt Geschosse und prüft Durchführungen', () => {
    const mk = (id: string, x: number): any => ({ id, name: id, levelHeight: 2800, wallHeight: 2500, walls: [], openings: [], cables: [], devices: [{ id: 'r' + id, typeId: 'steig', wallId: '', offset: 0, side: 1, height: 0, x, y: 1000 }] })
    const p: any = { floors: [mk('EG', 1000), mk('OG', 1800)] }
    expect(riserChecks(p).length).toBe(1)
    translateFloor(p.floors[1], -800, 0)
    expect(p.floors[1].devices[0].x).toBe(1000)
    expect(riserChecks(p).length).toBe(0)
  })
})

import { detectWallsRGBA } from './detectWalls'
describe('detectWalls Farbe', () => {
  it('schraffiert + rot umrandet = Wand, gelb = ignoriert', () => {
    const W = 800, H = 500, mm = 10
    const d = new Uint8ClampedArray(W * H * 4).fill(255)
    const px = (x: number, y: number, c: [number, number, number]) => { const i = (y * W + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2] }
    const fill = (x0: number, y0: number, x1: number, y1: number, c: [number, number, number]) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) px(x, y, c) }
    const outline = (x0: number, y0: number, x1: number, y1: number, c: [number, number, number]) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (x < x0 + 2 || x >= x1 - 2 || y < y0 + 2 || y >= y1 - 2) px(x, y, c) }
    fill(50, 50, 750, 70, [0, 0, 0]) // schwarz
    for (let y = 430; y < 450; y++) for (let x = 50; x < 750; x++) if ((x + y) % 8 < 2) px(x, y, [0, 0, 0]) // schraffiert
    outline(50, 70, 70, 430, [220, 0, 0]) // rot umrandet, innen weiß
    fill(730, 70, 750, 430, [255, 230, 0]) // gelb (alte Wand)
    outline(730, 70, 750, 430, [0, 0, 0])
    const walls = detectWallsRGBA(d, W, H, mm)
    const hs = walls.filter((w) => w.a.y === w.b.y), vs = walls.filter((w) => w.a.x === w.b.x)
    expect(hs.length).toBe(2)
    expect(vs.length).toBe(1)
    expect(vs[0].a.x).toBeLessThan(1000)
  })
})
