import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Hammer, Trash2 } from 'lucide-react'
import {
  CABLE_TYPES,
  CATEGORY_LABEL,
  DEVICE_TYPES,
  FUSE_OPTIONS,
  METHOD_LABEL,
  cableType,
  deviceType,
  resolveDevice,
  type DeviceCategory,
} from '../config/catalog'
import { cableLengths, clamp, wallLength } from '../lib/geom'
import { pickFile } from '../lib/files'
import { alignToReference, riserChecks } from '../lib/stack'
import { setWallLength, syncDeviceNodes } from '../lib/link'
import { formatLen } from '../lib/units'
import { evaluate } from '../lib/vde'
import { checkCable, checkDevice } from '../lib/zones'
import { useFloor, useStore } from '../store'
import type { Cable, Device, Dimension, Floor, InstallMethod, Opening, Wall } from '../types'
import { LenField, NumberField } from './NumberField'
import { Row, Section, Segmented } from './ui'
import { OPENING_TYPES, openingDef } from '../config/catalog'
import { planChecks } from '../lib/checks'
import { loggiaNotes, rectArea, rectWidth, roofContour, roofIssues } from '../lib/roof'
import type { Dormer, Loggia, RoofPlane } from '../types'
import { OpeningIcon } from './OpeningGlyphs'
import { SpecFields } from './SpecFields'
import { ElectricFields, ElectricOverview } from './ElectricPanel'
import { GroupFields, GroupsOverview } from './GroupsPanel'
import { DistOverview, RunFields } from './DistPanel'

function MultiPanel() {
  const multi = useStore((s) => s.multi)
  const clip = useStore((s) => s.clip)
  const floors = useStore((s) => s.project.floors)
  const activeId = useStore((s) => s.activeFloorId)
  const copySel = useStore((s) => s.copySel)
  const pasteSel = useStore((s) => s.pasteSel)
  const copyTo = useStore((s) => s.copyTo)
  const deleteMulti = useStore((s) => s.deleteMulti)
  const setMulti = useStore((s) => s.setMulti)
  const n = (k: string) => multi.filter((m) => m.kind === k).length
  const parts = [
    [n('wall'), 'Wände'],
    [n('opening'), 'Öffnungen'],
    [n('device'), 'Geräte'],
    [n('cable'), 'Leitungen'],
    [n('roof') + n('dormer') + n('loggia'), 'Dach/Loggia'],
  ]
    .filter(([c]) => (c as number) > 0)
    .map(([c, l]) => `${c} ${l}`)
  return (
    <Section title={`${multi.length} Elemente gewählt`}>
      <p className="muted small">{parts.join(' · ') || '–'}</p>
      <div className="btn-row">
        <button className="btn" onClick={copySel}>Kopieren (Strg+C)</button>
        <button className="btn" disabled={!clip} onClick={() => pasteSel()}>Einfügen (Strg+V)</button>
      </div>
      {floors.length > 1 && (
        <Row label="Kopieren nach">
          <select
            className="text"
            value=""
            onChange={(e) => {
              if (e.target.value) copyTo(e.target.value)
            }}
          >
            <option value="">Geschoss wählen …</option>
            {floors.filter((f) => f.id !== activeId).map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </Row>
      )}
      <div className="btn-row">
        <button className="btn danger" onClick={deleteMulti}>Löschen</button>
        <button className="btn" onClick={() => setMulti([])}>Auswahl aufheben</button>
      </div>
      <p className="muted small">Auswahl: Umschalt gedrückt halten und im Plan einen Rahmen aufziehen. Wandmontierte Geräte und Öffnungen wandern mit ihren Wänden. Beim Einfügen im selben Geschoss um 50 cm versetzt.</p>
    </Section>
  )
}

export default function Inspector() {
  const floor = useFloor()
  const selection = useStore((s) => s.selection)
  const multiCount = useStore((s) => s.multi.length)
  const deleteSelection = useStore((s) => s.deleteSelection)

  let body
  if (selection?.kind === 'wall') {
    const w = floor.walls.find((x) => x.id === selection.id)
    body = w ? <WallPanel wall={w} floor={floor} /> : null
  } else if (selection?.kind === 'opening') {
    const o = floor.openings.find((x) => x.id === selection.id)
    body = o ? <OpeningPanel opening={o} floor={floor} /> : null
  } else if (selection?.kind === 'device') {
    const d = floor.devices.find((x) => x.id === selection.id)
    body = d ? <DevicePanel device={d} floor={floor} /> : null
  } else if (selection?.kind === 'cable') {
    const c = floor.cables.find((x) => x.id === selection.id)
    body = c ? <CablePanel cable={c} floor={floor} /> : null
  } else if (selection?.kind === 'roof') {
    const r = (floor.roofs ?? []).find((x) => x.id === selection.id)
    body = r ? <RoofPanel roof={r} floor={floor} /> : null
  } else if (selection?.kind === 'dormer') {
    const d = (floor.dormers ?? []).find((x) => x.id === selection.id)
    body = d ? <DormerPanel dormer={d} floor={floor} /> : null
  } else if (selection?.kind === 'loggia') {
    const l = (floor.loggias ?? []).find((x) => x.id === selection.id)
    body = l ? <LoggiaPanel loggia={l} /> : null
  } else if (selection?.kind === 'dim') {
    const m = (floor.dims ?? []).find((x) => x.id === selection.id)
    body = m ? <DimPanel dim={m} /> : null
  }

  if (multiCount > 1 || (multiCount === 1 && !body))
    return (
      <div className="inspector-body">
        <InspectorTabs />
        <MultiPanel />
      </div>
    )
  if (!body) return <FloorPanel floor={floor} />

  const buildKind = selection?.kind === 'roof' || selection?.kind === 'dormer' || selection?.kind === 'loggia'
  return (
    <div className="inspector-body">
      <InspectorTabs />
      {body}
      <div className="section">
        <button className="btn danger block" onClick={deleteSelection}>
          <Trash2 size={15} /> Löschen
        </button>
      </div>
      {buildKind && <BuildSections floor={floor} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
function useEditFloor() {
  const edit = useStore((s) => s.edit)
  const floorId = useFloor().id
  return (recipe: (f: Floor) => void, key?: string) =>
    edit((p) => {
      const f = p.floors.find((x) => x.id === floorId)
      if (f) recipe(f as Floor)
    }, key)
}

function WallPanel({ wall, floor }: { wall: Wall; floor: Floor }) {
  const editFloor = useEditFloor()
  const settings = useStore((s) => s.project.settings)
  const openElevation = useStore((s) => s.openElevation)
  const L = wallLength(wall)
  const upd = (fn: (w: Wall) => void, key?: string) =>
    editFloor((f) => {
      const w = f.walls.find((x) => x.id === wall.id)
      if (w) fn(w)
    }, key)
  const nOpen = floor.openings.filter((o) => o.wallId === wall.id).length
  const nDev = floor.devices.filter((d) => d.wallId === wall.id).length

  return (
    <>
      <Section title="Wand">
        <Row label="Art">
          <Segmented
            value={wall.kind}
            onChange={(k) =>
              upd((w) => {
                w.kind = k
                w.thickness = k === 'outer' ? settings.outerThickness : settings.innerThickness
              })
            }
            options={[
              { value: 'outer', label: 'Außen' },
              { value: 'inner', label: 'Innen' },
            ]}
          />
        </Row>
        <Row label="Länge">
          <LenField mm={L} min={10} onCommit={(v) => editFloor((f) => setWallLength(f, wall.id, v), `len:${wall.id}`)} />
        </Row>
        <Row label="Dicke">
          <LenField mm={wall.thickness} min={20} onCommit={(v) => upd((w) => void (w.thickness = v), `th:${wall.id}`)} />
        </Row>
        <Row label="Höhe" hint={wall.height === undefined ? 'wie Geschoss' : undefined}>
          <LenField mm={wall.height ?? floor.wallHeight} min={500} onCommit={(v) => upd((w) => void (w.height = v), `h:${wall.id}`)} />
          {wall.height !== undefined && (
            <button className="btn small" onClick={() => upd((w) => void delete w.height)}>
              Standard
            </button>
          )}
        </Row>
      </Section>
      <Section title="Auf dieser Wand">
        <p className="muted">
          {nOpen} {nOpen === 1 ? 'Öffnung' : 'Öffnungen'} · {nDev} {nDev === 1 ? 'Gerät' : 'Geräte'}
        </p>
        <button className="btn small" onClick={() => openElevation(wall.id)} title="Frontansicht dieser Wand zum Einzeichnen (E)">
          Wandansicht öffnen
        </button>
      </Section>
    </>
  )
}

function OpeningPanel({ opening, floor }: { opening: Opening; floor: Floor }) {
  const editFloor = useEditFloor()
  const wall = floor.walls.find((w) => w.id === opening.wallId)
  const L = wall ? wallLength(wall) : 0
  const upd = (fn: (o: Opening) => void, key?: string) =>
    editFloor((f) => {
      const o = f.openings.find((x) => x.id === opening.id)
      if (o) fn(o)
    }, key)
  const key = (k: string) => `${k}:${opening.id}`
  return (
    <Section title={openingDef(opening.type).name}>
      <div className="op-types">
          {OPENING_TYPES.map((d) => (
            <button
              key={d.id}
              className={'op-type' + (opening.type === d.id ? ' on' : '')}
              title={d.name}
              onClick={() =>
                upd((o) => {
                  o.type = d.id
                  o.sill = d.sill
                  o.height = d.height
                })
              }
            >
              <OpeningIcon type={d.id} size={34} />
              <span>{d.name}</span>
            </button>
          ))}
      </div>
      <Row label="Breite">
        <LenField mm={opening.width} min={100} onCommit={(v) => upd((o) => void (o.width = v), key('w'))} />
      </Row>
      <Row label="Höhe">
        <LenField mm={opening.height} min={100} onCommit={(v) => upd((o) => void (o.height = v), key('h'))} />
      </Row>
      <Row label="Brüstung" hint="über OKFF">
        <LenField mm={opening.sill} min={0} onCommit={(v) => upd((o) => void (o.sill = v), key('s'))} />
      </Row>
      <Row label="Abstand Wandanfang">
        <LenField mm={opening.offset} min={0} max={Math.max(0, L - opening.width)} onCommit={(v) => upd((o) => void (o.offset = v), key('o'))} />
      </Row>
      <Row label="Abstand Wandende">
        <LenField
          mm={Math.max(0, L - opening.offset - opening.width)}
          min={0}
          onCommit={(v) => upd((o) => void (o.offset = clamp(L - o.width - v, 0, Math.max(0, L - o.width))), key('o'))}
        />
      </Row>
    </Section>
  )
}

function DevicePanel({ device, floor }: { device: Device; floor: Floor }) {
  const editFloor = useEditFloor()
  const zones = useStore((s) => s.project.settings.zones)
  const unit = useStore((s) => s.unit)
  const settings = useStore((s) => s.project.settings)
  const resolved = resolveDevice(device, settings)
  const dt = resolved.dt
  const wall = floor.walls.find((w) => w.id === device.wallId)
  const L = wall ? wallLength(wall) : 0
  const wallH = wall?.height ?? floor.wallHeight
  const zone = checkDevice(device.height, zones, wallH)
  const upd = (fn: (d: Device) => void, key?: string) =>
    editFloor((f) => {
      const d = f.devices.find((x) => x.id === device.id)
      if (!d) return
      fn(d)
      syncDeviceNodes(f, d.id)
    }, key)
  const key = (k: string) => `${k}:${device.id}`

  const nearestOpening = useMemo(() => {
    let best: { d: number; type: string } | null = null
    for (const o of floor.openings.filter((x) => x.wallId === device.wallId)) {
      const d = device.offset < o.offset ? o.offset - device.offset : device.offset > o.offset + o.width ? device.offset - (o.offset + o.width) : 0
      if (!best || d < best.d) best = { d, type: openingDef(o.type).name }
    }
    return best
  }, [floor.openings, device.wallId, device.offset])

  const groups = (Object.keys(CATEGORY_LABEL) as DeviceCategory[]).map((c) => ({
    cat: c,
    items: DEVICE_TYPES.filter((d) => d.category === c),
  }))

  return (
    <>
      <Section title="Gerät">
        <Row label="Typ">
          <select value={device.typeId} onChange={(e) =>
              upd((d) => {
                d.typeId = e.target.value
                delete d.seriesId
                delete d.sizeId
                delete d.w
                delete d.h
                delete d.boxId
                delete d.boxDia
                delete d.boxDepth
              })
            }
          >
            {groups.map((g) => (
              <optgroup key={g.cat} label={CATEGORY_LABEL[g.cat]}>
                {g.items.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Row>
        {wall ? (
          <>
            <Row label="Höhe" hint="Mitte über OKFF">
              <LenField mm={device.height} min={0} onCommit={(v) => upd((d) => void (d.height = v), key('h'))} />
            </Row>
            <Row label="Abstand Wandanfang" hint="bis Mitte">
              <LenField mm={device.offset} min={0} max={L} onCommit={(v) => upd((d) => void (d.offset = v), key('o'))} />
            </Row>
            <Row label="Abstand Wandende" hint="bis Mitte">
              <LenField mm={Math.max(0, L - device.offset)} min={0} onCommit={(v) => upd((d) => void (d.offset = clamp(L - v, 0, L)), key('o'))} />
            </Row>
            <Row label="Wandseite">
              <Segmented
                value={device.side === 1 ? 'a' : 'b'}
                onChange={(v) => upd((d) => void (d.side = v === 'a' ? 1 : -1))}
                options={[
                  { value: 'a', label: 'Seite A' },
                  { value: 'b', label: 'Seite B' },
                ]}
              />
            </Row>
          </>
        ) : (
          <>
            <Row label="Position X">
              <LenField mm={device.x ?? 0} onCommit={(v) => upd((d) => void (d.x = v), key('x'))} />
            </Row>
            <Row label="Position Y">
              <LenField mm={device.y ?? 0} onCommit={(v) => upd((d) => void (d.y = v), key('y'))} />
            </Row>
            <Row label="Einbauhöhe" hint="Mitte über OKFF">
              <LenField mm={device.height} min={0} onCommit={(v) => upd((d) => void (d.height = v), key('h'))} />
            </Row>
          </>
        )}
        <SpecFields
          typeId={device.typeId}
          spec={device}
          defaultSeriesId={settings.seriesId}
          layout="panel"
          onChange={(patch) =>
            upd((d) => {
              for (const [k, v] of Object.entries(patch)) {
                if (v === undefined) delete (d as unknown as Record<string, unknown>)[k]
                else (d as unknown as Record<string, unknown>)[k] = v
              }
            }, key('spec'))
          }
        />
        {nearestOpening && (
          <p className="muted small">
            Nächste Öffnung ({nearestOpening.type}): {formatLen(nearestOpening.d, unit)}
          </p>
        )}
      </Section>
      <ElectricFields device={device} />
      <GroupFields device={device} />
      <RunFields device={device} />
      {wall && (
      <Section title="Installationszone">
        {zone.ok ? (
          <p className="status-line ok">
            <CheckCircle2 size={16} /> In Zone „{zone.band?.label}“
          </p>
        ) : (
          <p className="status-line warn">
            <AlertTriangle size={16} /> Außerhalb der Zonen. Nächste: {zone.nearest?.label} (Mitte {formatLen(zone.delta ?? 0, unit)} entfernt)
          </p>
        )}
        <p className="muted small">
          {dt.name} · Platte {formatLen(dt.w, 'mm')} × {formatLen(dt.h, 'mm')}
        </p>
      </Section>
      )}
    </>
  )
}

function RoofPanel({ roof, floor }: { roof: RoofPlane; floor: Floor }) {
  const editFloor = useEditFloor()
  const unit = useStore((s) => s.unit)
  const upd = (fn: (r: RoofPlane) => void, key?: string) =>
    editFloor((f) => {
      const r = (f.roofs ?? []).find((x) => x.id === roof.id)
      if (r) fn(r)
    }, key)
  const key = (k: string) => `${k}:${roof.id}`
  const c1 = roofContour(roof, 1000, floor.wallHeight)
  const c2 = roofContour(roof, 2000, floor.wallHeight)
  const cap = roofContour(roof, floor.wallHeight, floor.wallHeight)
  return (
    <Section title="Dachschräge">
      <Row label="Kniestock" hint="Höhe an der Linie">
        <LenField mm={roof.knee} min={0} max={floor.wallHeight - 100} onCommit={(v) => upd((r) => void (r.knee = v), key('k'))} />
      </Row>
      <Row label="Neigung">
        <NumberField value={roof.angle} decimals={1} suffix="°" min={5} max={85} onCommit={(v) => upd((r) => void (r.angle = v), key('a'))} />
      </Row>
      <Row label="Anstieg zur Seite">
        <button className="btn small" onClick={() => upd((r) => void (r.side = (r.side === 1 ? -1 : 1) as 1 | -1))}>
          Seite wechseln
        </button>
      </Row>
      <p className="muted small">
        {c1 ? <>1-m-Linie: {formatLen(c1.dist, unit)} von der Linie · </> : roof.knee >= 1000 ? <>Kniestock ≥ 1 m · </> : null}
        {c2 ? <>2-m-Linie: {formatLen(c2.dist, unit)} · </> : null}
        {cap ? <>First ({formatLen(floor.wallHeight, unit)}) nach {formatLen(cap.dist, unit)}</> : null}
      </p>
      <p className="muted small">Obergrenze ist die Wandhöhe des Geschosses (Firsthöhe). Wände unter der Schräge werden automatisch schräg abgeschnitten; darüber ist keine Wand.</p>
    </Section>
  )
}

function DormerPanel({ dormer, floor }: { dormer: Dormer; floor: Floor }) {
  const editFloor = useEditFloor()
  const unit = useStore((s) => s.unit)
  const upd = (fn: (d: Dormer) => void, key?: string) =>
    editFloor((f) => {
      const d = (f.dormers ?? []).find((x) => x.id === dormer.id)
      if (d) fn(d)
    }, key)
  const key = (k: string) => `${k}:${dormer.id}`
  return (
    <Section title="Gaube">
      <Row label="Lichte Höhe" hint="unter Gaubendecke">
        <LenField mm={dormer.height} min={1500} max={floor.wallHeight} onCommit={(v) => upd((d) => void (d.height = v), key('h'))} />
      </Row>
      <Row label="Tiefe" hint="in den Raum">
        <LenField mm={dormer.depth} min={300} onCommit={(v) => upd((d) => void (d.depth = v), key('d'))} />
      </Row>
      <Row label="Breite">
        <b>{formatLen(rectWidth(dormer), unit)}</b>
      </Row>
      <Row label="Seite">
        <button className="btn small" onClick={() => upd((d) => void (d.side = (d.side === 1 ? -1 : 1) as 1 | -1))}>
          Seite wechseln
        </button>
      </Row>
      <p className="muted small">Im Rechteck wird die Dachschräge bis zur lichten Höhe angehoben. Die Wände der Gaube (Front, Wangen) zeichnest du wie normale Wände auf den Rand; Fenster setzt du in die Frontwand. Maximal bis zur Firsthöhe des Geschosses ({formatLen(floor.wallHeight, unit)}).</p>
    </Section>
  )
}

function LoggiaPanel({ loggia }: { loggia: Loggia }) {
  const editFloor = useEditFloor()
  const unit = useStore((s) => s.unit)
  const upd = (fn: (l: Loggia, f: Floor) => void, key?: string) =>
    editFloor((f) => {
      const l = (f.loggias ?? []).find((x) => x.id === loggia.id)
      if (l) fn(l, f)
    }, key)
  const key = (k: string) => `${k}:${loggia.id}`
  return (
    <Section title="Loggia">
      <Row label="Fläche">
        <b>{rectArea(loggia).toFixed(2).replace('.', ',')} m²</b>
      </Row>
      <Row label="Tiefe">
        <LenField mm={loggia.depth} min={500} onCommit={(v) => upd((l) => void (l.depth = v), key('d'))} />
      </Row>
      <Row label="Brüstung" hint="Höhe">
        <LenField
          mm={loggia.parapet}
          min={300}
          onCommit={(v) =>
            upd((l, f) => {
              l.parapet = v
              const w = f.walls.find((x) => x.id === l.parapetWallId)
              if (w) w.height = v
            }, key('p'))
          }
        />
      </Row>
      <Row label="Seite">
        <button className="btn small" onClick={() => upd((l) => void (l.side = (l.side === 1 ? -1 : 1) as 1 | -1))}>
          Seite wechseln
        </button>
      </Row>
      <p className="muted small">Außenbereich: Geräte hier müssen spritzwassergeschützt sein (mind. IP44) und an einem Stromkreis mit RCD 30 mA hängen. Die Länge der offenen Seite: {formatLen(rectWidth(loggia), unit)}.</p>
    </Section>
  )
}

function LoggiaWarnings({ floor }: { floor: Floor }) {
  const notes = useMemo(() => loggiaNotes(floor), [floor])
  const select = useStore((s) => s.select)
  if (!notes.length) return null
  return (
    <Section title="Loggia – Außenbereich">
      <p className="small" style={{ color: 'var(--warn, #c77c0a)' }}>
        {notes.length} Gerät{notes.length === 1 ? '' : 'e'} im Außenbereich:
      </p>
      {notes.slice(0, 8).map((n) => (
        <button key={n.id} className="btn small block" style={{ textAlign: 'left', marginBottom: 4 }} onClick={() => select({ kind: 'device', id: n.id })}>
          Gerät {n.text}
        </button>
      ))}
    </Section>
  )
}

function RoofWarnings({ floor }: { floor: Floor }) {
  const issues = useMemo(() => roofIssues(floor), [floor])
  const select = useStore((s) => s.select)
  if (!issues.length) return null
  return (
    <Section title="Dachschräge – Prüfung">
      <p className="small" style={{ color: 'var(--warn, #c77c0a)' }}>
        {issues.length} Element{issues.length === 1 ? '' : 'e'} über der Dachschräge (dort ist keine Wand):
      </p>
      {issues.slice(0, 8).map((i) => (
        <button key={i.id} className="btn small block" style={{ textAlign: 'left', marginBottom: 4 }} onClick={() => select({ kind: i.kind, id: i.id })}>
          {i.kind === 'device' ? 'Gerät' : 'Leitung'}: {i.text}
        </button>
      ))}
    </Section>
  )
}

function DimPanel({ dim }: { dim: Dimension }) {
  const unit = useStore((s) => s.unit)
  const dx = Math.abs(dim.b.x - dim.a.x)
  const dy = Math.abs(dim.b.y - dim.a.y)
  return (
    <Section title="Maßlinie">
      <Row label="Länge">
        <b>{formatLen(Math.hypot(dx, dy), unit)}</b>
      </Row>
      <Row label={dim.space === 'plan' ? 'Δ x / Δ y' : 'Δ Breite / Δ Höhe'}>
        <span className="muted">
          {formatLen(dx, unit, false)} / {formatLen(dy, unit)}
        </span>
      </Row>
      <p className="muted small">{dim.space === 'plan' ? 'Gezeichnet im Grundriss.' : 'Gezeichnet in der Wandansicht.'}</p>
    </Section>
  )
}

function CablePanel({ cable, floor }: { cable: Cable; floor: Floor }) {
  const editFloor = useEditFloor()
  const settings = useStore((s) => s.project.settings)
  const unit = useStore((s) => s.unit)
  const ct = cableType(cable.typeId)
  const len = useMemo(() => cableLengths(cable.points), [cable.points])
  const upd = (fn: (c: Cable) => void, key?: string) =>
    editFloor((f) => {
      const c = f.cables.find((x) => x.id === cable.id)
      if (c) fn(c)
    }, key)

  const isPower = ct.category === 'power' && ct.crossSection && ct.phases
  const vde = isPower
    ? evaluate(
        {
          lengthM: len.total / 1000,
          fuseA: cable.fuseA,
          crossSection: ct.crossSection!,
          phases: ct.phases!,
          method: cable.method,
          charac: cable.charac,
        },
        settings.vde,
      )
    : null
  const issues = useMemo(
    () => checkCable(cable, floor, settings.zones, settings.wallHeight),
    [cable, floor, settings.zones, settings.wallHeight],
  )
  const fm = (v: number, d = 1) => v.toFixed(d).replace('.', ',')

  return (
    <>
      <Section title="Leitung">
        <Row label="Typ">
          <select
            value={cable.typeId}
            onChange={(e) =>
              upd((c) => {
                const t = cableType(e.target.value)
                c.typeId = t.id
                if (t.defaultFuse) c.fuseA = t.defaultFuse
              })
            }
          >
            {CABLE_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Row>
        <Row label="Länge" hint="gesamt">
          <b>{formatLen(len.total, unit)}</b>
        </Row>
        <p className="muted small">
          waagerecht {formatLen(len.horizontal, unit)} · senkrecht {formatLen(len.vertical, unit)}
        </p>
      </Section>

      {isPower && vde && (
        <Section title="VDE-Prüfung">
          <Row label="Sicherung">
            <select value={cable.fuseA} onChange={(e) => upd((c) => void (c.fuseA = Number(e.target.value)))}>
              {FUSE_OPTIONS.map((a) => (
                <option key={a} value={a}>
                  {a} A
                </option>
              ))}
            </select>
            <Segmented
              value={cable.charac}
              onChange={(v) => upd((c) => void (c.charac = v))}
              options={[
                { value: 'B', label: 'B' },
                { value: 'C', label: 'C' },
              ]}
            />
          </Row>
          <Row label="Verlegeart">
            <select value={cable.method} onChange={(e) => upd((c) => void (c.method = e.target.value as InstallMethod))}>
              {(Object.keys(METHOD_LABEL) as InstallMethod[]).map((m) => (
                <option key={m} value={m}>
                  {METHOD_LABEL[m]}
                </option>
              ))}
            </select>
          </Row>
          <Check ok={vde.ampacityOk} text={`Belastbarkeit ${vde.ampacity !== null ? fm(vde.ampacity, 1) : '?'} A ${vde.ampacityOk ? '≥' : '<'} Sicherung ${cable.fuseA} A`} />
          <Check ok={vde.dropOk} text={`Spannungsfall ${fm(vde.dropPct, 2)} % (max. ${fm(settings.vde.dropLimitPct, 1)} %)`} />
          <Check ok={vde.loopOk} text={`Abschaltbedingung: Zs ${fm(vde.loopOhm, 2)} Ω ${vde.loopOk ? '≤' : '>'} ${fm(vde.loopMaxOhm, 2)} Ω`} />
          <p className="muted small">
            Max. Länge für diesen Querschnitt und diese Sicherung: <b>{fm(vde.maxLenM)} m</b> (Spannungsfall {fm(vde.maxLenDropM)} m, Abschaltung {fm(vde.maxLenLoopM)} m).
            Spannungsfall gilt für diese Leitung allein, vor dem Verteiler kommt noch Anteil dazu.
          </p>
        </Section>
      )}

      <Section title="Zonenprüfung (DIN 18015-3)">
        {issues.length === 0 ? (
          <Check ok text="Alle Abschnitte liegen in Installationszonen" />
        ) : (
          issues.map((i, k) => <Check key={k} ok={false} text={`Abschnitt ${i.segment}: ${i.message}`} />)
        )}
      </Section>

      <Section title="Punkte">
        <div className="nodes">
          {cable.points.map((n, i) => {
            const dev = n.deviceId ? floor.devices.find((d) => d.id === n.deviceId) : undefined
            return (
              <div key={i} className="node-row">
                <span className="node-idx">{i + 1}</span>
                <div className="node-main">
                  <LenField mm={n.z} onCommit={(v) => upd((c) => void (c.points[i].z = v), `z:${cable.id}:${i}`)} disabled={!!dev} />
                  <span className="muted small">{dev ? deviceType(dev.typeId).name : `x ${formatLen(n.x, unit, false)} · y ${formatLen(n.y, unit, false)}`}</span>
                </div>
                <button
                  className="icon-btn"
                  title="Punkt entfernen"
                  disabled={cable.points.length <= 2}
                  onClick={() => upd((c) => void c.points.splice(i, 1))}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )
          })}
        </div>
      </Section>
    </>
  )
}

function Check({ ok, text }: { ok: boolean; text: string }) {
  return (
    <p className={'status-line ' + (ok ? 'ok' : 'warn')}>
      {ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />} {text}
    </p>
  )
}

// ---------------------------------------------------------------------------
/** Dachschrägen, Gauben, Loggia: Listen mit „zeichnen“-Knöpfen und Prüfhinweisen (im Bau-Tab und neben der Auswahl) */
function BuildSections({ floor }: { floor: Floor }) {
  const setTool = useStore((s) => s.setTool)
  const select = useStore((s) => s.select)
  return (
    <>
      <Section title="Dachschrägen">
        {(floor.roofs ?? []).length === 0 && <p className="muted small">Für Dachgeschosse: Linie ziehen, an der die Schräge beginnt (Kniestock), dann die Neigung einstellen. Wände werden schräg abgeschnitten, über der Schräge ist keine Wand.</p>}
        {(floor.roofs ?? []).map((r, i) => (
          <button key={r.id} className="btn small block" style={{ textAlign: 'left', marginBottom: 4 }} onClick={() => select({ kind: 'roof', id: r.id })}>
            Dachschräge {i + 1} · Kniestock {Math.round(r.knee / 10)} cm · {Math.round(r.angle)}°
          </button>
        ))}
        <button className="btn block" onClick={() => setTool('roof')}>
          Dachschräge zeichnen
        </button>
      </Section>
      <Section title="Gauben">
        {(floor.dormers ?? []).length === 0 && <p className="muted small">Gaube: Front-Linie und Tiefe aufziehen – die Dachschräge wird dort bis zur Gaubenhöhe angehoben.</p>}
        {(floor.dormers ?? []).map((d, i) => (
          <button key={d.id} className="btn small block" style={{ textAlign: 'left', marginBottom: 4 }} onClick={() => select({ kind: 'dormer', id: d.id })}>
            Gaube {i + 1} · {Math.round(rectWidth(d) / 10)} × {Math.round(d.depth / 10)} cm · {Math.round(d.height / 10)} cm hoch
          </button>
        ))}
        <button className="btn block" onClick={() => setTool('dormer')}>
          Gaube zeichnen
        </button>
      </Section>
      <Section title="Loggia / Balkon">
        {(floor.loggias ?? []).length === 0 && <p className="muted small">Offene Seite und Tiefe aufziehen – die Brüstung wird ergänzt, Geräte dort werden als Außenbereich geprüft.</p>}
        {(floor.loggias ?? []).map((l, i) => (
          <button key={l.id} className="btn small block" style={{ textAlign: 'left', marginBottom: 4 }} onClick={() => select({ kind: 'loggia', id: l.id })}>
            Loggia {i + 1} · {rectArea(l).toFixed(1).replace('.', ',')} m²
          </button>
        ))}
        <button className="btn block" onClick={() => setTool('loggia')}>
          Loggia zeichnen
        </button>
      </Section>
      <RoofWarnings floor={floor} />
      <LoggiaWarnings floor={floor} />
    </>
  )
}

/** Projektweite Planprüfung (Schaltschrank-Tab) */
function PlanChecks() {
  const project = useStore((s) => s.project)
  const setActiveFloor = useStore((s) => s.setActiveFloor)
  const select = useStore((s) => s.select)
  const list = useMemo(() => planChecks(project), [project])
  return (
    <Section title={`Planprüfung${list.length ? ` · ${list.length}` : ''}`}>
      {!list.length && <p className="muted small">Keine Auffälligkeiten (FI, Überlast, Spannungsfall, Dachschräge).</p>}
      {list.map((c, i) => (
        <button
          key={i}
          className="warn-item"
          style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 0, padding: '4px 0', cursor: c.target ? 'pointer' : 'default', color: 'var(--warn, #b45309)', font: 'inherit', fontSize: 12 }}
          onClick={() => {
            if (c.floorId) setActiveFloor(c.floorId)
            if (c.target) select(c.target)
          }}
        >
          ⚠ {c.text}
        </button>
      ))}
      <p className="muted small">Vereinfachte Prüfung – ersetzt keine Abnahme nach VDE 0100 durch eine Elektrofachkraft.</p>
    </Section>
  )
}

/** Tab-Leiste: Elektro · KNX · Schrank, Bau als Symbol. Ein Klick beendet die Auswahl und zeigt den Tab. */
function InspectorTabs() {
  const tab = useStore((s) => s.inspectorTab)
  const setTab = useStore((s) => s.setInspectorTab)
  const select = useStore((s) => s.select)
  const go = (t: typeof tab) => {
    select(null)
    useStore.getState().setPickerOpen(false)
    // Bau-Werkzeug beenden, wenn man zu den Elektro-Tabs wechselt
    const st = useStore.getState()
    if (t !== 'floor' && ['wall', 'opening', 'roof', 'dormer', 'loggia'].includes(st.tool)) st.setTool('select')
    setTab(t)
  }
  return (
    <div className="inspector-tabs">
      <Segmented
        value={tab}
        onChange={go}
        options={[
          { value: 'electric', label: 'Elektro' },
          { value: 'knx', label: 'KNX' },
          { value: 'cabinet', label: 'Schrank' },
        ]}
      />
      <button className={'tab-icon' + (tab === 'floor' ? ' on' : '')} title="Bau: Geschoss, Grundriss, Dachschrägen, Gauben, Loggia" aria-label="Bau" aria-pressed={tab === 'floor'} onClick={() => go('floor')}>
        <Hammer size={16} />
      </button>
    </div>
  )
}

function FloorPanel({ floor }: { floor: Floor }) {
  const edit = useStore((s) => s.edit)
  const project = useStore((s) => s.project)
  const setTool = useStore((s) => s.setTool)
  const select = useStore((s) => s.select)
  const openImport = useStore((s) => s.openImport)
  const clearBackground = useStore((s) => s.clearBackground)
  const removeFloor = useStore((s) => s.removeFloor)
  const setAsk = useStore((s) => s.setAsk)
  const unit = useStore((s) => s.unit)
  const upd = (fn: (f: Floor) => void, key?: string) =>
    edit((p) => {
      const f = p.floors.find((x) => x.id === floor.id)
      if (f) fn(f as Floor)
    }, key)

  const bg = floor.background
  const byType = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of floor.cables) m.set(c.typeId, (m.get(c.typeId) ?? 0) + cableLengths(c.points).total)
    return [...m.entries()]
  }, [floor.cables])

  const chooseFile = async () => {
    const f = await pickFile('application/pdf,image/png,image/jpeg,image/webp')
    if (f) openImport(f)
  }

  const ghostBelow = useStore((s) => s.ghostBelow)
  const setGhostBelow = useStore((s) => s.setGhostBelow)
  const setActiveFloor = useStore((s) => s.setActiveFloor)
  const [refSel, setRefSel] = useState('')
  const refId = refSel || project.floors.find((f) => f.anchor && f.id !== floor.id)?.id || project.floors[0].id
  const stackIssues = useMemo(() => riserChecks(project), [project])
  const noAnchor = project.floors.filter((f) => !f.anchor).length
  const bgUrl = useStore((s) => s.backgrounds[floor.id])
  const setSuggest = useStore((s) => s.setSuggest)
  const showToast = useStore((s) => s.showToast)
  const setWallDetectOpen = useStore((s) => s.setWallDetectOpen)

  const tab = useStore((s) => s.inspectorTab)
  const setTab = useStore((s) => s.setInspectorTab)
  const setSchrankOpen = useStore((s) => s.setSchrankOpen)

  return (
    <div className="inspector-body">
      <InspectorTabs />
      {tab !== 'floor' && <RoofWarnings floor={floor} />}
      {tab !== 'floor' && <LoggiaWarnings floor={floor} />}
      {tab === 'cabinet' && <PlanChecks />}
      {tab === 'floor' && (
      <>
      <Section title="Geschoss">
        <Row label="Name">
          <input
            className="text"
            value={floor.name}
            onChange={(e) => upd((f) => void (f.name = e.target.value), `name:${floor.id}`)}
          />
        </Row>
        <Row label="Wandhöhe" hint={(floor.roofs?.length ?? 0) > 0 ? '= Firsthöhe' : 'Standard'}>
          <LenField mm={floor.wallHeight} min={500} onCommit={(v) => upd((f) => void (f.wallHeight = v), `wh:${floor.id}`)} />
        </Row>
        <Row label="Geschosshöhe" hint="inkl. Decke">
          <LenField mm={floor.levelHeight} min={500} onCommit={(v) => upd((f) => void (f.levelHeight = v), `lh:${floor.id}`)} />
        </Row>
      </Section>

      <BuildSections floor={floor} />

      {project.floors.length > 1 && (
        <Section title="Geschosse stapeln">
          <p className="muted small">
            Pro Geschoss denselben Bezugspunkt anklicken (Außenecke, Treppenhaus, Schacht). „Ausrichten“ verschiebt dann alle Geschosse so, dass die Punkte übereinanderliegen.
          </p>
          <div className="btn-row">
            <button className="btn small" onClick={() => setTool('anchor')}>
              {floor.anchor ? 'Passpunkt neu setzen' : 'Passpunkt setzen'}
            </button>
            {floor.anchor && (
              <button className="btn small" onClick={() => upd((f) => void (f.anchor = undefined), `anc:${floor.id}`)}>
                Entfernen
              </button>
            )}
          </div>
          <Row label="Bezugsgeschoss">
            <select value={refId} onChange={(e) => setRefSel(e.target.value)}>
              {project.floors.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                  {f.anchor ? '' : ' (kein Passpunkt)'}
                </option>
              ))}
            </select>
          </Row>
          <button
            className="btn block"
            disabled={!project.floors.find((f) => f.id === refId)?.anchor}
            onClick={() => {
              let n = 0
              edit((p) => void (n = alignToReference(p as typeof project, refId)))
              showToast(n ? `${n} Geschosse ausgerichtet` : 'Nichts zu verschieben (Passpunkte fehlen oder liegen schon deckungsgleich)')
            }}
          >
            Alle Geschosse ausrichten
          </button>
          <label className="check">
            <input type="checkbox" checked={ghostBelow} onChange={(e) => setGhostBelow(e.target.checked)} /> Geschoss darunter als Schatten zeigen
          </label>
          {noAnchor > 0 && <p className="muted small">{noAnchor} Geschoss(e) ohne Passpunkt – Durchführungs-Prüfung ist nur bei ausgerichteten Geschossen aussagekräftig.</p>}
          {stackIssues.length > 0 ? (
            stackIssues.map((i, k) => (
              <p key={k} className="status-line warn" style={{ cursor: 'pointer' }} onClick={() => setActiveFloor(i.floorId)}>
                <AlertTriangle size={16} /> {i.text}
              </p>
            ))
          ) : (
            <p className="muted small">
              <CheckCircle2 size={14} style={{ verticalAlign: -2 }} /> Keine Auffälligkeiten bei den Steigpunkten.
            </p>
          )}
        </Section>
      )}

      <Section title="Grundriss">
        {bg ? (
          <>
            <p className="muted small">
              {bg.source}
              <br />
              Maßstab: 1 Pixel = {bg.mmPerPx.toFixed(2).replace('.', ',')} mm
            </p>
            <Row label="Deckkraft">
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={bg.opacity}
                onChange={(e) => upd((f) => void (f.background && (f.background.opacity = Number(e.target.value))), `op:${floor.id}`)}
              />
            </Row>
            <div className="btn-row">
              <button className="btn small" onClick={() => setTool('calibrate')}>
                Neu kalibrieren
              </button>
              <button className="btn small" onClick={chooseFile}>
                Ersetzen
              </button>
              <button className="btn small danger" onClick={() => clearBackground(floor.id)}>
                Entfernen
              </button>
            </div>
            <button className="btn block" onClick={() => setWallDetectOpen(true)} title="Erkennt waagerechte/senkrechte Wände (schwarz, schraffiert, rot umrandet; gelb wird ignoriert) als Vorschlag – nach dem Kalibrieren">
              Wände erkennen
            </button>
          </>
        ) : (
          <>
            <p className="muted small">PDF (auch mehrseitig) oder Bild (PNG/JPG) laden und danach den Maßstab kalibrieren.</p>
            <button className="btn primary block" onClick={chooseFile}>
              Grundriss laden
            </button>
          </>
        )}
      </Section>

      <Section title="Übersicht">
        <p className="muted small">
          {floor.walls.length} Wände · {floor.openings.length} Öffnungen · {floor.devices.length} Geräte · {floor.cables.length} Leitungen
        </p>
        {byType.map(([id, len]) => (
          <div key={id} className="legend-item">
            <span className="dot" style={{ background: cableType(id).color }} />
            <span>{cableType(id).name}</span>
            <span className="muted">{formatLen(len, unit === 'mm' ? 'm' : unit === 'cm' ? 'm' : unit)}</span>
          </div>
        ))}
      </Section>

      {project.floors.length > 1 && (
        <div className="section">
          <button className="btn danger block" onClick={() =>
              setAsk({
                title: 'Geschoss löschen?',
                message: `„${floor.name}“ mit allen Wänden, Geräten und Leitungen wird gelöscht.`,
                okLabel: 'Löschen',
                danger: true,
                onOk: () => removeFloor(floor.id),
              })
            }>
            <Trash2 size={15} /> Geschoss löschen
          </button>
        </div>
      )}
      </>
      )}
      {tab === 'electric' && <ElectricOverview floor={floor} />}
      {tab === 'knx' && <GroupsOverview />}
      {tab === 'cabinet' && (
        <>
          <DistOverview />
          <div className="section">
            <button className="btn primary block" onClick={() => setSchrankOpen(true)}>
              Schaltschrank-Listen öffnen
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export { NumberField }
