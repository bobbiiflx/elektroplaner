import { AlertTriangle } from 'lucide-react'
import { deviceType } from '../config/catalog'
import { DEFAULT_RUN_PCT, DEFAULT_RUN_RESERVE, allDists, needsRun, runOf, runSummary } from '../lib/runs'
import { formatLen } from '../lib/units'
import { useStore } from '../store'
import type { Device } from '../types'
import { LenField, NumberField } from './NumberField'
import { Row, Section } from './ui'

/** Verteiler und Leitungslänge eines KNX-geschalteten Geräts. */
export function RunFields({ device }: { device: Device }) {
  const project = useStore((s) => s.project)
  const unit = useStore((s) => s.unit)
  const edit = useStore((s) => s.edit)
  if (!needsRun(device)) return null
  const dists = allDists(project)
  const run = runOf(project, device)
  const upd = (fn: (d: Device) => void, key?: string) =>
    edit((p) => {
      for (const f of p.floors) {
        const d = f.devices.find((x) => x.id === device.id)
        if (d) fn(d)
      }
    }, key)

  return (
    <Section title="Leitung zum Verteiler">
      {dists.length === 0 ? (
        <p className="status-line warn">
          <AlertTriangle size={16} /> Noch kein Verteiler gesetzt (Dosen &amp; Verteiler).
        </p>
      ) : (
        <>
          <Row label="Verteiler">
            <select value={device.distId ?? ''} onChange={(e) => upd((d) => (e.target.value ? void (d.distId = e.target.value) : void delete d.distId))}>
              <option value="">automatisch{run && !device.distId ? ` (${run.dist.name})` : ''}</option>
              {dists.map((x) => (
                <option key={x.device.id} value={x.device.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </Row>
          {run && (
            <>
              <p className="muted small">
                Geschätzt: {formatLen(run.horiz, unit)} waagerecht + {formatLen(run.vert, unit)} senkrecht + {formatLen(run.extra, unit)} Zuschlag
              </p>
              <Row label="Leitungslänge" hint={run.manual ? 'gesetzt' : 'geschätzt'}>
                <LenField mm={run.len} min={0} onCommit={(v) => upd((d) => void (d.runLen = v), `rl:${device.id}`)} />
              </Row>
              {run.manual && (
                <button className="btn small" onClick={() => upd((d) => void delete d.runLen)}>
                  Schätzung wieder verwenden
                </button>
              )}
              {run.warn && (
                <p className="status-line warn small">
                  <AlertTriangle size={14} /> {run.warn}
                </p>
              )}
            </>
          )}
        </>
      )}
    </Section>
  )
}

/** Verteiler, Steigpunkte und Leitungswege im Überblick (Geschoss-Reiter). */
export function DistOverview() {
  const project = useStore((s) => s.project)
  const unit = useStore((s) => s.unit)
  const edit = useStore((s) => s.edit)
  const addBasement = useStore((s) => s.addBasement)
  const setActiveFloor = useStore((s) => s.setActiveFloor)
  const select = useStore((s) => s.select)
  const sum = runSummary(project)
  const dists = allDists(project)
  const risers = project.floors.flatMap((f) => f.devices.filter((d) => d.typeId === 'steig').map(() => f.id))
  const hasBasement = project.floors.some((f) => f.name.toLowerCase().includes('keller'))
  const setS = (fn: (s: typeof project.settings) => void, key: string) => edit((p) => fn(p.settings), key)

  return (
    <Section title="Verteiler &amp; Leitungswege">
      {!hasBasement && (
        <div className="bulk-line">
          <button className="btn small" onClick={() => addBasement(true)}>
            Keller mit Wänden anlegen
          </button>
          <button className="btn small" onClick={() => addBasement(false)}>
            Leerer Keller
          </button>
        </div>
      )}
      <p className="muted small">
        {dists.length} Verteiler · {risers.length} Steigpunkte. Setze Verteiler und Steigpunkte über „Dosen &amp; Verteiler“.
      </p>
      {dists.map((x) => (
        <button
          key={x.device.id}
          className="open-main"
          onClick={() => {
            setActiveFloor(x.floor.id)
            select({ kind: 'device', id: x.device.id })
          }}
        >
          <b>{deviceType(x.device.typeId).name}</b>
          <span className="muted small">{x.floor.name}</span>
        </button>
      ))}

      {sum.perDist.length > 0 && (
        <table className="run-table">
          <thead>
            <tr>
              <th>Verteiler</th>
              <th>Leitungen</th>
              <th>Länge</th>
            </tr>
          </thead>
          <tbody>
            {sum.perDist.map((s) => (
              <tr key={s.dist.device.id}>
                <td>{s.dist.name}</td>
                <td>{s.runs}</td>
                <td>{formatLen(s.total, unit === 'mm' ? 'm' : unit === 'cm' ? 'm' : unit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {sum.noDist.length > 0 && (
        <p className="status-line warn small">
          <AlertTriangle size={14} /> {sum.noDist.length} KNX-Geräte ohne erreichbaren Verteiler
        </p>
      )}
      {sum.warnings.length > 0 && (
        <p className="status-line warn small">
          <AlertTriangle size={14} /> {sum.warnings.length} Leitungen ohne Steigpunkt geschätzt – Steigpunkt in beiden Geschossen setzen.
        </p>
      )}

      <Row label="Zuschlag Weg" hint="% auf Länge">
        <NumberField value={project.settings.runPct ?? DEFAULT_RUN_PCT} decimals={0} min={0} max={100} suffix="%" onCommit={(v) => setS((s) => void (s.runPct = v), 'runpct')} />
      </Row>
      <Row label="Reserve je Leitung" hint="Schleife, Abisolieren">
        <LenField mm={project.settings.runReserve ?? DEFAULT_RUN_RESERVE} min={0} onCommit={(v) => setS((s) => void (s.runReserve = v), 'runres')} />
      </Row>
    </Section>
  )
}
