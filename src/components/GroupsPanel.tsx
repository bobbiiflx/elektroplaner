import { AlertTriangle, Plus, Trash2, X } from 'lucide-react'
import { deviceType } from '../config/catalog'
import { canJoinGroups, duplicateGAs, groupMembers, groupStats, isValidGA, removeGroup } from '../lib/groups'
import { useStore } from '../store'
import type { Device, Group, Scene } from '../types'
import { NumberField } from './NumberField'
import { Row, Section } from './ui'

const NEW = '__new__'
const NO_GROUPS: Group[] = []

/** Gruppen-Zuordnung eines Geräts (Mehrfachauswahl) – nur für KNX-fähige Geräte. */
export function GroupFields({ device }: { device: Device }) {
  const groups = useStore((s) => s.project.groups ?? NO_GROUPS)
  const addGroup = useStore((s) => s.addGroup)
  const edit = useStore((s) => s.edit)
  if (!canJoinGroups(device)) return null
  const sender = deviceType(device.typeId)
  const isSender = sender.category === 'knx' || sender.category === 'switch'

  const setGroups = (fn: (ids: string[]) => string[]) =>
    edit((p) => {
      for (const f of p.floors) {
        const d = f.devices.find((x) => x.id === device.id)
        if (!d) continue
        const ids = fn(d.groupIds ?? [])
        if (ids.length) d.groupIds = ids
        else delete d.groupIds
      }
    })
  const mine = device.groupIds ?? []
  const free = groups.filter((g) => !mine.includes(g.id))

  return (
    <Section title="KNX-Gruppen">
      <p className="muted small">{isSender ? 'Sendet auf diese Gruppen.' : 'Empfängt von diesen Gruppen.'}</p>
      <div className="gchips">
        {mine.map((id) => {
          const g = groups.find((x) => x.id === id)
          if (!g) return null
          return (
            <span key={id} className="gchip">
              {g.name} <span className="muted">{g.ga}</span>
              <button className="icon-btn" title="Entfernen" onClick={() => setGroups((ids) => ids.filter((x) => x !== id))}>
                <X size={12} />
              </button>
            </span>
          )
        })}
      </div>
      <Row label="Hinzufügen">
        <select
          value=""
          onChange={(e) => {
            const v = e.target.value
            if (!v) return
            const id = v === NEW ? addGroup() : v
            setGroups((ids) => (ids.includes(id) ? ids : [...ids, id]))
          }}
        >
          <option value="">– Gruppe wählen –</option>
          {free.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name} ({g.ga})
            </option>
          ))}
          <option value={NEW}>+ Neue Gruppe …</option>
        </select>
      </Row>
    </Section>
  )
}

/** Auswahl einer Gruppe (für Sammelzuweisung). */
export function GroupSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const groups = useStore((s) => s.project.groups ?? NO_GROUPS)
  const addGroup = useStore((s) => s.addGroup)
  return (
    <select value={value} onChange={(e) => onChange(e.target.value === NEW ? addGroup() : e.target.value)}>
      <option value="">– Gruppe wählen –</option>
      {groups.map((g) => (
        <option key={g.id} value={g.id}>
          {g.name} ({g.ga})
        </option>
      ))}
      <option value={NEW}>+ Neue Gruppe …</option>
    </select>
  )
}

function GAInput({ value, onChange, placeholder, dup }: { value: string; onChange: (v: string) => void; placeholder: string; dup: Set<string> }) {
  const bad = !isValidGA(value) || (!!value.trim() && dup.has(value.trim()))
  return (
    <input
      className={'text ga' + (bad ? ' bad' : '')}
      value={value}
      placeholder={placeholder}
      title={!isValidGA(value) ? 'Format Haupt/Mittel/Unter, z. B. 1/0/3' : dup.has(value.trim()) ? 'Adresse doppelt vergeben' : placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

/** Gruppen und Szenen des Projekts. */
export function GroupsOverview() {
  const project = useStore((s) => s.project)
  const edit = useStore((s) => s.edit)
  const addGroup = useStore((s) => s.addGroup)
  const addScene = useStore((s) => s.addScene)
  const setAsk = useStore((s) => s.setAsk)
  const setActiveFloor = useStore((s) => s.setActiveFloor)
  const select = useStore((s) => s.select)
  const groups = project.groups ?? NO_GROUPS
  const scenes = project.scenes ?? []
  const dup = duplicateGAs(groups)

  const updGroup = (id: string, fn: (g: Group) => void, key?: string) =>
    edit((p) => {
      const g = (p.groups ?? []).find((x) => x.id === id)
      if (g) fn(g)
    }, key)
  const updScene = (id: string, fn: (s: Scene) => void, key?: string) =>
    edit((p) => {
      const s = (p.scenes ?? []).find((x) => x.id === id)
      if (s) fn(s)
    }, key)

  const delGroup = (g: Group) => {
    const n = groupMembers(project, g.id).length
    const run = () => edit((p) => removeGroup(p, g.id))
    if (!n) run()
    else setAsk({ title: 'Gruppe löschen?', message: `${n} Geräte sind in „${g.name}“. Sie verlieren die Zuordnung.`, okLabel: 'Löschen', danger: true, onOk: run })
  }

  return (
    <>
      <Section
        title="KNX-Gruppen"
        aside={
          <button className="btn small" onClick={() => addGroup()}>
            <Plus size={13} /> Neu
          </button>
        }
      >
        {groups.length === 0 && <p className="muted small">Noch keine Gruppen. Eine Gruppe fasst Taster und Leuchten zusammen, die gemeinsam schalten oder dimmen.</p>}
        {groups.map((g) => {
          const st = groupStats(project, g)
          const members = groupMembers(project, g.id)
          return (
            <div key={g.id} className="circuit-row">
              <div className="circuit-head">
                <input className="text" value={g.name} onChange={(e) => updGroup(g.id, (x) => void (x.name = e.target.value), `gn:${g.id}`)} />
                <button className="icon-btn" title="Gruppe löschen" onClick={() => delGroup(g)}>
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="ga-grid">
                <label>
                  <span className="small muted">Schalten</span>
                  <GAInput value={g.ga} placeholder="1/0/0" dup={dup} onChange={(v) => updGroup(g.id, (x) => void (x.ga = v), `ga:${g.id}`)} />
                </label>
                <label>
                  <span className="small muted">Status</span>
                  <GAInput value={g.gaStatus ?? ''} placeholder="1/1/0" dup={dup} onChange={(v) => updGroup(g.id, (x) => (v ? void (x.gaStatus = v) : void delete x.gaStatus), `gs:${g.id}`)} />
                </label>
                {st.dim !== 'none' && (
                  <>
                    <label>
                      <span className="small muted">Dimmen</span>
                      <GAInput value={g.gaDim ?? ''} placeholder="1/2/0" dup={dup} onChange={(v) => updGroup(g.id, (x) => (v ? void (x.gaDim = v) : void delete x.gaDim), `gd:${g.id}`)} />
                    </label>
                    <label>
                      <span className="small muted">Helligkeit</span>
                      <GAInput value={g.gaValue ?? ''} placeholder="1/3/0" dup={dup} onChange={(v) => updGroup(g.id, (x) => (v ? void (x.gaValue = v) : void delete x.gaValue), `gv:${g.id}`)} />
                    </label>
                  </>
                )}
              </div>
              <p className="muted small">
                {st.senders} Sender · {st.receivers} Empfänger
                {st.watts ? ` · ${st.watts} W` : ''}
                {st.dim === 'all' ? ' · dimmbar' : ''}
              </p>
              {members.length > 0 && (
                <div className="gchips">
                  {members.map((m) => (
                    <button
                      key={m.device.id}
                      className="gchip"
                      title="Gerät anzeigen"
                      onClick={() => {
                        setActiveFloor(m.floor.id)
                        select({ kind: 'device', id: m.device.id })
                      }}
                    >
                      {m.role === 'sender' ? '▸ ' : ''}
                      {deviceType(m.device.typeId).name}
                    </button>
                  ))}
                </div>
              )}
              {st.warnings.map((w) => (
                <p key={w} className="status-line warn small">
                  <AlertTriangle size={14} /> {w}
                </p>
              ))}
            </div>
          )
        })}
      </Section>

      <Section
        title="Szenen"
        aside={
          <button className="btn small" disabled={!groups.length} onClick={() => addScene()}>
            <Plus size={13} /> Neu
          </button>
        }
      >
        {scenes.length === 0 && <p className="muted small">{groups.length ? 'Eine Szene setzt mehrere Gruppen gleichzeitig auf feste Werte.' : 'Lege zuerst Gruppen an.'}</p>}
        {scenes.map((sc) => (
          <div key={sc.id} className="circuit-row">
            <div className="circuit-head">
              <input className="text" value={sc.name} onChange={(e) => updScene(sc.id, (x) => void (x.name = e.target.value), `sn:${sc.id}`)} />
              <NumberField value={sc.no} decimals={0} min={1} max={64} suffix="Nr." onCommit={(v) => updScene(sc.id, (x) => void (x.no = Math.round(v)), `sno:${sc.id}`)} />
              <button className="icon-btn" title="Szene löschen" onClick={() => edit((p) => void (p.scenes = (p.scenes ?? []).filter((x) => x.id !== sc.id)))}>
                <Trash2 size={14} />
              </button>
            </div>
            {groups.map((g) => {
              const v = sc.values[g.id]
              const dimmable = groupStats(project, g).dim === 'all'
              return (
                <div key={g.id} className="scene-line">
                  <span className="small">{g.name}</span>
                  {dimmable ? (
                    <div className="scene-val">
                      <NumberField value={v ?? 0} decimals={0} min={0} max={100} suffix="%" placeholder="–" onCommit={(n) => updScene(sc.id, (x) => void (x.values[g.id] = Math.round(n)), `sv:${sc.id}${g.id}`)} />
                      {v !== undefined && (
                        <button className="icon-btn" title="Unverändert" onClick={() => updScene(sc.id, (x) => void delete x.values[g.id])}>
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  ) : (
                    <select
                      value={v === undefined ? '' : v > 0 ? 'on' : 'off'}
                      onChange={(e) => updScene(sc.id, (x) => (e.target.value ? void (x.values[g.id] = e.target.value === 'on' ? 100 : 0) : void delete x.values[g.id]))}
                    >
                      <option value="">– unverändert –</option>
                      <option value="on">An</option>
                      <option value="off">Aus</option>
                    </select>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </Section>
    </>
  )
}
