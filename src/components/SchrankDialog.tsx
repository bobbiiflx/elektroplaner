import { useMemo, useState } from 'react'
import { AlertTriangle, ClipboardCopy, Download } from 'lucide-react'
import { DIM_LABEL, deviceType } from '../config/catalog'
import { downloadText } from '../lib/files'
import { roleOf } from '../lib/groups'
import { actuatorChannels, actuatorNeeds, circuitRows, toCsv, wayRows } from '../lib/schrank'
import { formatLen } from '../lib/units'
import { useStore } from '../store'
import { Modal, Segmented } from './ui'

type Tab = 'circuits' | 'channels' | 'ga' | 'ways'
type Cell = string | number
interface Table {
  head: string[]
  rows: Cell[][]
  warn?: (string | undefined)[]
}

const num = (n: number, d = 0) => n.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d })

function DataTable({ t }: { t: Table }) {
  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            {t.head.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {t.rows.map((r, i) => (
            <tr key={i} className={t.warn?.[i] ? 'warn-row' : ''} title={t.warn?.[i]}>
              {r.map((c, j) => (
                <td key={j}>{c}</td>
              ))}
            </tr>
          ))}
          {t.rows.length === 0 && (
            <tr>
              <td colSpan={t.head.length} className="muted">
                Noch keine Einträge.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

export default function SchrankDialog() {
  const open = useStore((s) => s.schrankOpen)
  const setOpen = useStore((s) => s.setSchrankOpen)
  const project = useStore((s) => s.project)
  const unit = useStore((s) => s.unit)
  const showToast = useStore((s) => s.showToast)
  const [tab, setTab] = useState<Tab>('circuits')
  const m = (mm: number) => formatLen(mm, unit === 'mm' ? 'm' : unit === 'cm' ? 'm' : unit)

  const data = useMemo(() => {
    if (!open) return null
    const { rows, unassigned } = circuitRows(project)
    const channels = actuatorChannels(project)
    return { rows, unassigned, channels, needs: actuatorNeeds(channels), ways: wayRows(project) }
  }, [open, project])
  if (!open || !data) return null

  const circuits: Table = {
    head: ['Nr.', 'Stromkreis', 'LS', 'Phase', 'FI-Gruppe', 'Geräte', 'davon KNX', 'Leistung W', 'Strom A', 'Geschosse', 'Hinweis'],
    rows: data.rows.map((r, i) => [i + 1, r.circuit.name, `${r.circuit.charac}${r.circuit.rating}`, r.circuit.phase === '3L' ? '3 Ph.' : r.circuit.phase, r.circuit.rcd || '–', r.devices.length, r.knx, num(r.watts), num(r.amps, 1), r.floors.join(', ') || '–', r.warn.join(' · ')]),
    warn: data.rows.map((r) => (r.warn.length ? r.warn.join(' · ') : undefined)),
  }
  const channels: Table = {
    head: ['Verteiler', 'Gruppe', 'GA', 'Art', 'Stromkreis', 'Geräte', 'Last W', 'Hinweis'],
    rows: data.channels.map((c) => [c.dist?.name ?? '–', c.groupName, c.ga, c.kind === 'switch' ? 'Schalten' : `Dimmen ${c.dimType ? DIM_LABEL[c.dimType as keyof typeof DIM_LABEL] : ''}`, c.circuitName, c.devices, num(c.watts), c.warn.join(' · ')]),
    warn: data.channels.map((c) => (c.warn.length ? c.warn.join(' · ') : undefined)),
  }
  const needs: Table = {
    head: ['Verteiler', 'Aktor / Kanalart', 'Kanäle', 'Geräte (Stück)'],
    rows: data.needs.map((n) => [n.dist, n.label, n.channels, n.units ?? 'nach Dimmart wählen']),
  }
  const groups = project.groups ?? []
  const ga: Table = {
    head: ['Gruppe', 'Schalten', 'Dimmen', 'Helligkeit', 'Status', 'Sender', 'Empfänger'],
    rows: groups.map((g) => {
      const mem = project.floors.flatMap((f) => f.devices.filter((d) => d.groupIds?.includes(g.id)))
      const names = (role: 'sender' | 'receiver') => mem.filter((d) => roleOf(d) === role).map((d) => deviceType(d.typeId).name)
      return [g.name, g.ga, g.gaDim ?? '', g.gaValue ?? '', g.gaStatus ?? '', names('sender').join(', ') || '–', `${names('receiver').length}`]
    }),
  }
  const scenes: Table = {
    head: ['Szene', 'Nr.', ...groups.map((g) => g.name)],
    rows: (project.scenes ?? []).map((sc) => [sc.name, sc.no, ...groups.map((g) => (sc.values[g.id] === undefined ? '–' : `${sc.values[g.id]} %`))]),
  }
  const ways: Table = {
    head: ['Verteiler', 'Gerät', 'Geschoss', 'Gruppen', 'Länge', 'Angabe'],
    rows: data.ways.map((w) => [w.distName, deviceType(w.device.typeId).name, w.floor.name, w.groups.join(', ') || '–', m(w.len), w.manual ? 'gesetzt' : 'geschätzt']),
    warn: data.ways.map((w) => w.warn),
  }
  const total = data.ways.reduce((s, w) => s + w.len, 0)

  const current: { tables: { title: string; t: Table }[] } =
    tab === 'circuits'
      ? { tables: [{ title: 'Stromkreisliste', t: circuits }] }
      : tab === 'channels'
        ? { tables: [{ title: 'Aktorbedarf je Verteiler', t: needs }, { title: 'Aktorkanäle', t: channels }] }
        : tab === 'ga'
          ? { tables: [{ title: 'Gruppenadressen', t: ga }, { title: 'Szenen', t: scenes }] }
          : { tables: [{ title: `Leitungswege zum Verteiler (Summe ${m(total)})`, t: ways }] }

  const csv = () => current.tables.map(({ title, t }) => toCsv([[title], t.head, ...t.rows])).join('\r\n\r\n')
  const label = { circuits: 'stromkreise', channels: 'aktorkanaele', ga: 'gruppenadressen', ways: 'leitungswege' }[tab]
  const safe = project.name.replace(/[^\w\-äöüÄÖÜß ]+/g, '_').trim() || 'projekt'

  return (
    <Modal
      title="Schaltschrank-Listen"
      width={1100}
      onClose={() => setOpen(false)}
      footer={
        <>
          <button
            className="btn"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(csv().replace(/;/g, '\t'))
                showToast('Tabelle kopiert – in Excel einfügen.')
              } catch {
                showToast('Kopieren nicht möglich – bitte „CSV laden“ nutzen.')
              }
            }}
          >
            <ClipboardCopy size={15} /> Kopieren
          </button>
          <button className="btn" onClick={() => downloadText(`${safe}-${label}.csv`, '﻿' + csv())}>
            <Download size={15} /> CSV laden
          </button>
          <button className="btn primary" onClick={() => setOpen(false)}>
            Fertig
          </button>
        </>
      }
    >
      <div className="schrank-tabs">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'circuits', label: 'Stromkreise' },
            { value: 'channels', label: 'Aktorkanäle' },
            { value: 'ga', label: 'Gruppenadressen' },
            { value: 'ways', label: 'Leitungswege' },
          ]}
        />
      </div>
      {tab === 'circuits' && data.unassigned.length > 0 && (
        <p className="status-line warn">
          <AlertTriangle size={16} /> {data.unassigned.length} Geräte ohne Stromkreis sind in der Liste nicht enthalten (siehe „Offene Punkte“).
        </p>
      )}
      {current.tables.map(({ title, t }) => (
        <div key={title} className="schrank-table">
          <h3>{title}</h3>
          <DataTable t={t} />
        </div>
      ))}
    </Modal>
  )
}
