import { useMemo } from 'react'
import { AlertTriangle, CheckCircle2, Trash2 } from 'lucide-react'
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
import { detectWalls } from '../lib/detectWalls'
import { setWallLength, syncDeviceNodes } from '../lib/link'
import { formatLen } from '../lib/units'
import { evaluate } from '../lib/vde'
import { checkCable, checkDevice } from '../lib/zones'
import { useFloor, useStore } from '../store'
import type { Cable, Device, Dimension, Floor, InstallMethod, Opening, Wall } from '../types'
import { LenField, NumberField } from './NumberField'
import { Row, Section, Segmented } from './ui'
import { SpecFields } from './SpecFields'
import { ElectricFields, ElectricOverview } from './ElectricPanel'
import { GroupFields, GroupsOverview } from './GroupsPanel'
import { DistOverview, RunFields } from './DistPanel'

export default function Inspector() {
  const floor = useFloor()
  const selection = useStore((s) => s.selection)
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
  } else if (selection?.kind === 'dim') {
    const m = (floor.dims ?? []).find((x) => x.id === selection.id)
    body = m ? <DimPanel dim={m} /> : null
  }

  if (!body) return <FloorPanel floor={floor} />

  return (
    <div className="inspector-body">
      {body}
      <div className="section">
        <button className="btn danger block" onClick={deleteSelection}>
          <Trash2 size={15} /> Löschen
        </button>
      </div>
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
    <Section title={opening.type === 'door' ? 'Tür' : 'Fenster'}>
      <Row label="Art">
        <Segmented
          value={opening.type}
          onChange={(t) =>
            upd((o) => {
              o.type = t
              o.sill = t === 'door' ? 0 : 900
              o.height = t === 'door' ? 2135 : 1250
            })
          }
          options={[
            { value: 'door', label: 'Tür' },
            { value: 'window', label: 'Fenster' },
          ]}
        />
      </Row>
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
      if (!best || d < best.d) best = { d, type: o.type === 'door' ? 'Tür' : 'Fenster' }
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
function FloorPanel({ floor }: { floor: Floor }) {
  const edit = useStore((s) => s.edit)
  const project = useStore((s) => s.project)
  const setTool = useStore((s) => s.setTool)
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

  const bgUrl = useStore((s) => s.backgrounds[floor.id])
  const setSuggest = useStore((s) => s.setSuggest)
  const showToast = useStore((s) => s.showToast)
  const detect = async () => {
    if (!bg || !bgUrl) return
    try {
      const img = new Image()
      await new Promise<void>((res, rej) => {
        img.onload = () => res()
        img.onerror = () => rej(new Error('Bild nicht lesbar'))
        img.src = bgUrl
      })
      const c = document.createElement('canvas')
      c.width = img.naturalWidth
      c.height = img.naturalHeight
      const ctx = c.getContext('2d', { willReadFrequently: true })!
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, c.width, c.height)
      ctx.drawImage(img, 0, 0)
      const d = ctx.getImageData(0, 0, c.width, c.height).data
      const gray = new Uint8Array(c.width * c.height)
      for (let i = 0; i < gray.length; i++) gray[i] = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) | 0
      const walls = detectWalls(gray, c.width, c.height, bg.mmPerPx)
      if (!walls.length) {
        showToast('Keine Wände erkannt – Plan zu unsauber oder Maßstab prüfen')
        return
      }
      setSuggest({ floorId: floor.id, walls })
      setTool('select')
    } catch {
      showToast('Erkennung fehlgeschlagen')
    }
  }

  const tab = useStore((s) => s.inspectorTab)
  const setTab = useStore((s) => s.setInspectorTab)
  const setSchrankOpen = useStore((s) => s.setSchrankOpen)

  return (
    <div className="inspector-body">
      <div className="inspector-tabs">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'floor', label: 'Geschoss' },
            { value: 'electric', label: 'Elektro' },
            { value: 'knx', label: 'KNX' },
            { value: 'cabinet', label: 'Schrank' },
          ]}
        />
      </div>
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
        <Row label="Wandhöhe" hint="Standard">
          <LenField mm={floor.wallHeight} min={500} onCommit={(v) => upd((f) => void (f.wallHeight = v), `wh:${floor.id}`)} />
        </Row>
        <Row label="Geschosshöhe" hint="inkl. Decke">
          <LenField mm={floor.levelHeight} min={500} onCommit={(v) => upd((f) => void (f.levelHeight = v), `lh:${floor.id}`)} />
        </Row>
      </Section>

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
            <button className="btn block" onClick={detect} title="Erkennt waagerechte/senkrechte Wände als Vorschlag – nach dem Kalibrieren">
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
