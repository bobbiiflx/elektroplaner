import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Plus, Trash2 } from 'lucide-react'
import { CIRCUIT_COLORS, DIM_LABEL, FUSE_OPTIONS, deviceType, kindOf } from '../config/catalog'
import { canJoinGroups } from '../lib/groups'
import { MISSING_LABEL, circuitStats, missingFor, openPoints, type ColorBy, type MissingKey } from '../lib/completeness'
import { useStore } from '../store'
import type { Circuit, Device, Floor, Phase } from '../types'
import { NumberField } from './NumberField'
import { GroupSelect } from './GroupsPanel'
import { Row, Section, Segmented } from './ui'

const NEW = '__new__'
const NO_CIRCUITS: Circuit[] = []

/** Auswahl eines Stromkreises mit „Neuer Stromkreis …“; liefert die ID (oder '' für keinen). */
export function CircuitSelect({ value, onChange, allowNone = true }: { value: string; onChange: (id: string) => void; allowNone?: boolean }) {
  const circuits = useStore((s) => s.project.circuits ?? NO_CIRCUITS)
  const addCircuit = useStore((s) => s.addCircuit)
  return (
    <select
      value={value}
      onChange={(e) => {
        const v = e.target.value
        if (v === NEW) onChange(addCircuit())
        else onChange(v)
      }}
    >
      {allowNone && <option value="">– nicht zugeordnet –</option>}
      {circuits.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
      <option value={NEW}>+ Neuer Stromkreis …</option>
    </select>
  )
}

/** Elektrik-Abschnitt eines Geräts: Stromkreis, Steuerung, Dimmbarkeit, Leistung. */
export function ElectricFields({ device }: { device: Device }) {
  const edit = useStore((s) => s.edit)
  const project = useStore((s) => s.project)
  const dt = deviceType(device.typeId)
  const kind = kindOf(dt)
  const circuit = (project.circuits ?? []).find((c) => c.id === device.circuitId)
  const missing = missingFor(device, dt)

  if (kind !== 'load' && kind !== 'light') return null

  const upd = (fn: (d: Device) => void, key?: string) =>
    edit((p) => {
      for (const f of p.floors) {
        const d = f.devices.find((x) => x.id === device.id)
        if (d) fn(d)
      }
    }, key)

  return (
    <Section title="Elektrik">
      <Row label="Stromkreis">
        <CircuitSelect value={device.circuitId ?? ''} onChange={(id) => upd((d) => (id ? void (d.circuitId = id) : void delete d.circuitId))} />
      </Row>
      {circuit && (
        <p className="muted small">
          <i className="cable-dot" style={{ background: circuit.color }} /> {circuit.rating} A {circuit.charac} · {circuit.phase === '3L' ? '3 Phasen' : circuit.phase}
          {circuit.rcd ? ` · ${circuit.rcd}` : ' · ohne FI'}
        </p>
      )}
      <Row label="Schaltung">
        <Segmented
          value={device.control ?? ('' as 'direct')}
          onChange={(v) => upd((d) => void (d.control = v))}
          options={[
            { value: 'direct', label: 'Direkt' },
            { value: 'knx', label: 'KNX' },
          ]}
        />
      </Row>
      {kind === 'light' && (
        <>
          <Row label="Dimmbar">
            <Segmented
              value={device.dimmable === undefined ? ('' as 'yes') : device.dimmable ? 'yes' : 'no'}
              onChange={(v) =>
                upd((d) => {
                  d.dimmable = v === 'yes'
                  if (v === 'no') delete d.dimType
                })
              }
              options={[
                { value: 'yes', label: 'Ja' },
                { value: 'no', label: 'Nein' },
              ]}
            />
          </Row>
          {device.dimmable && (
            <Row label="Dimmart">
              <select value={device.dimType ?? ''} onChange={(e) => upd((d) => (e.target.value ? void (d.dimType = e.target.value as Device['dimType']) : void delete d.dimType))}>
                <option value="">– wählen –</option>
                {(Object.keys(DIM_LABEL) as NonNullable<Device['dimType']>[]).map((k) => (
                  <option key={k} value={k}>
                    {DIM_LABEL[k]}
                  </option>
                ))}
              </select>
            </Row>
          )}
          <Row label="Leistung" hint="Richtwert, anpassen">
            <NumberField value={device.powerW ?? 0} decimals={0} suffix="W" min={0} onCommit={(v) => upd((d) => void (d.powerW = v), `pw:${device.id}`)} />
          </Row>
        </>
      )}
      {missing.length > 0 ? (
        <p className="status-line warn">
          <AlertTriangle size={16} /> Es fehlt noch: {missing.map((m) => MISSING_LABEL[m]).join(', ')}
        </p>
      ) : (
        <p className="status-line ok">
          <CheckCircle2 size={16} /> Vollständig zugeordnet
        </p>
      )}
    </Section>
  )
}

const BY_LABEL: { value: ColorBy; label: string }[] = [
  { value: 'type', label: 'Typ' },
  { value: 'circuit', label: 'Stromkreis' },
  { value: 'control', label: 'Schaltung' },
]

/** Färbung der Geräte im Plan (Typ / Stromkreis / Schaltung). */
export function ColorByControl() {
  const colorBy = useStore((s) => s.colorBy)
  const setColorBy = useStore((s) => s.setColorBy)
  return (
    <>
      <Segmented value={colorBy} onChange={setColorBy} options={BY_LABEL} />
      {colorBy === 'control' && (
        <p className="muted small">
          <i className="cable-dot" style={{ background: '#ff9f0a' }} /> direkt · <i className="cable-dot" style={{ background: '#30d158' }} /> KNX · <i className="cable-dot" style={{ background: '#8e8e93' }} /> offen
        </p>
      )}
      {colorBy !== 'type' && <p className="muted small">Gestrichelter Ring = Angaben fehlen noch.</p>}
    </>
  )
}

/** Elektro-Reiter: Darstellung, Stromkreisverwaltung, offene Punkte mit Sammelzuweisung. */
export function ElectricOverview({ floor }: { floor: Floor }) {
  void floor
  const project = useStore((s) => s.project)
  const edit = useStore((s) => s.edit)
  const addCircuit = useStore((s) => s.addCircuit)
  const setActiveFloor = useStore((s) => s.setActiveFloor)
  const select = useStore((s) => s.select)
  const setAsk = useStore((s) => s.setAsk)
  const circuits = project.circuits ?? []

  const points = useMemo(() => openPoints(project), [project])
  const [filter, setFilter] = useState<MissingKey | ''>('')
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [bulkCircuit, setBulkCircuit] = useState('')
  const [bulkGroup, setBulkGroup] = useState('')
  const shown = points.filter((p) => !filter || p.missing.includes(filter))

  const updCircuit = (id: string, fn: (c: Circuit) => void, key?: string) =>
    edit((p) => {
      const c = (p.circuits ?? []).find((x) => x.id === id)
      if (c) fn(c)
    }, key)

  const removeCircuit = (c: Circuit) => {
    const n = circuitStats(project, c.id).count
    const run = () =>
      edit((p) => {
        p.circuits = (p.circuits ?? []).filter((x) => x.id !== c.id)
        for (const f of p.floors) for (const d of f.devices) if (d.circuitId === c.id) delete d.circuitId
      })
    if (n === 0) run()
    else setAsk({ title: 'Stromkreis löschen?', message: `${n} Geräte sind „${c.name}“ zugeordnet und werden danach wieder offen.`, okLabel: 'Löschen', danger: true, onOk: run })
  }

  const bulk = (patch: Partial<Device>, only: 'any' | 'light' = 'any') =>
    edit((p) => {
      for (const f of p.floors)
        for (const d of f.devices) {
          if (!checked.has(d.id)) continue
          const k = kindOf(deviceType(d.typeId))
          if (only === 'light' ? k !== 'light' : k !== 'load' && k !== 'light') continue
          Object.assign(d, patch)
          if (patch.dimmable === false) delete d.dimType
        }
    })

  const bulkGroupAdd = (gid: string) =>
    edit((p) => {
      for (const f of p.floors)
        for (const d of f.devices) {
          if (!checked.has(d.id) || !canJoinGroups(d)) continue
          d.groupIds = d.groupIds?.includes(gid) ? d.groupIds : [...(d.groupIds ?? []), gid]
        }
    })

  const toggle = (id: string) =>
    setChecked((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const allShown = shown.length > 0 && shown.every((p) => checked.has(p.device.id))

  return (
    <>
      <Section
        title="Stromkreise"
        aside={
          <button className="btn small" onClick={() => addCircuit()}>
            <Plus size={13} /> Neu
          </button>
        }
      >
        {circuits.length === 0 && <p className="muted small">Noch keine Stromkreise. Lege welche an oder erzeuge sie direkt beim Zuordnen eines Geräts.</p>}
        {circuits.map((c) => {
          const st = circuitStats(project, c.id)
          return (
            <div key={c.id} className="circuit-row">
              <div className="circuit-head">
                <input type="color" value={c.color} title="Farbe" onChange={(e) => updCircuit(c.id, (x) => void (x.color = e.target.value), `cc:${c.id}`)} />
                <input className="text" value={c.name} onChange={(e) => updCircuit(c.id, (x) => void (x.name = e.target.value), `cn:${c.id}`)} />
                <button className="icon-btn" title="Stromkreis löschen" onClick={() => removeCircuit(c)}>
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="circuit-fields">
                <select value={c.rating} title="Nennstrom" onChange={(e) => updCircuit(c.id, (x) => void (x.rating = Number(e.target.value)))}>
                  {FUSE_OPTIONS.map((a) => (
                    <option key={a} value={a}>
                      {a} A
                    </option>
                  ))}
                </select>
                <select value={c.charac} title="Auslösecharakteristik" onChange={(e) => updCircuit(c.id, (x) => void (x.charac = e.target.value as 'B' | 'C'))}>
                  <option value="B">B</option>
                  <option value="C">C</option>
                </select>
                <select value={c.phase} title="Phase" onChange={(e) => updCircuit(c.id, (x) => void (x.phase = e.target.value as Phase))}>
                  {(['L1', 'L2', 'L3', '3L'] as Phase[]).map((p) => (
                    <option key={p} value={p}>
                      {p === '3L' ? '3 Ph.' : p}
                    </option>
                  ))}
                </select>
                <input className="text" value={c.rcd} placeholder="FI-Gruppe" title="FI / RCD" onChange={(e) => updCircuit(c.id, (x) => void (x.rcd = e.target.value), `cr:${c.id}`)} />
              </div>
              <p className="muted small">
                {st.count} {st.count === 1 ? 'Gerät' : 'Geräte'}
                {st.watts > 0 ? ` · ${st.watts} W angegeben` : ''}
              </p>
            </div>
          )
        })}
        {circuits.length > 0 && <p className="hidden-swatches" hidden>{CIRCUIT_COLORS.length}</p>}
      </Section>

      <Section
        title={`Offene Punkte (${points.length})`}
        aside={
          points.length > 0 && (
            <select value={filter} onChange={(e) => setFilter(e.target.value as MissingKey | '')} title="Filter">
              <option value="">alle</option>
              {(Object.keys(MISSING_LABEL) as MissingKey[]).map((k) => (
                <option key={k} value={k}>
                  {MISSING_LABEL[k]}
                </option>
              ))}
            </select>
          )
        }
      >
        {points.length === 0 ? (
          <p className="status-line ok">
            <CheckCircle2 size={16} /> Alle Geräte sind vollständig zugeordnet.
          </p>
        ) : (
          <>
            <label className="check small">
              <input
                type="checkbox"
                checked={allShown}
                onChange={(e) => setChecked(e.target.checked ? new Set(shown.map((p) => p.device.id)) : new Set())}
              />
              Alle {shown.length} wählen
            </label>
            <div className="open-list">
              {shown.map((p) => {
                const dt = deviceType(p.device.typeId)
                return (
                  <div key={p.device.id} className="open-row">
                    <input type="checkbox" checked={checked.has(p.device.id)} onChange={() => toggle(p.device.id)} />
                    <button
                      className="open-main"
                      onClick={() => {
                        setActiveFloor(p.floor.id)
                        select({ kind: 'device', id: p.device.id })
                      }}
                      title="Gerät anzeigen"
                    >
                      <b>{dt.name}</b>
                      <span className="muted small">
                        {p.floor.name} · fehlt: {p.missing.map((m) => MISSING_LABEL[m]).join(', ')}
                      </span>
                    </button>
                  </div>
                )
              })}
            </div>
            <div className={'bulk-bar' + (checked.size ? '' : ' off')}>
              <span className="small">{checked.size} gewählt</span>
              <div className="bulk-line">
                <CircuitSelect value={bulkCircuit} onChange={setBulkCircuit} />
                <button className="btn small" disabled={!checked.size || !bulkCircuit} onClick={() => bulk({ circuitId: bulkCircuit })}>
                  Zuweisen
                </button>
              </div>
              <div className="bulk-line">
                <span className="small muted">Schaltung</span>
                <button className="btn small" disabled={!checked.size} onClick={() => bulk({ control: 'direct' })}>
                  Direkt
                </button>
                <button className="btn small" disabled={!checked.size} onClick={() => bulk({ control: 'knx' })}>
                  KNX
                </button>
              </div>
              <div className="bulk-line">
                <GroupSelect value={bulkGroup} onChange={setBulkGroup} />
                <button className="btn small" disabled={!checked.size || !bulkGroup} onClick={() => bulkGroupAdd(bulkGroup)}>
                  In Gruppe
                </button>
              </div>
              <div className="bulk-line">
                <span className="small muted">Leuchten</span>
                <button className="btn small" disabled={!checked.size} onClick={() => bulk({ dimmable: true, dimType: 'phase' }, 'light')}>
                  dimmbar
                </button>
                <button className="btn small" disabled={!checked.size} onClick={() => bulk({ dimmable: false }, 'light')}>
                  nicht dimmbar
                </button>
              </div>
            </div>
          </>
        )}
      </Section>
    </>
  )
}
