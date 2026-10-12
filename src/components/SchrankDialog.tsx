import { Fragment, useMemo, useState } from 'react'
import { AlertTriangle, ClipboardCopy, Download, Printer } from 'lucide-react'
import { DIM_LABEL, deviceType } from '../config/catalog'
import { downloadText } from '../lib/files'
import { roleOf } from '../lib/groups'
import { actuatorChannels, actuatorNeeds, circuitRows, toCsv, wayRows } from '../lib/schrank'
import { buildTables, num, type Cell, type Table } from '../lib/lists'
import { formatLen } from '../lib/units'
import { useStore } from '../store'
import { Modal, Segmented } from './ui'
import { NumberField } from './NumberField'
import { VAT, materialList } from '../lib/material'
import { RICHTWERT_NAME } from '../lib/priceSources'
import PriceImportDialog from './PriceImportDialog'
import { CabinetDiagram, CabinetLayout } from './CabinetViews'
import { DEFAULT_CABINET_OPTS, planCabinet } from '../lib/cabinet'

type Tab = 'circuits' | 'cabinet' | 'channels' | 'ga' | 'ways' | 'material'

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
  const [matFloor, setMatFloor] = useState('')
  const [withRuns, setWithRuns] = useState(true)
  const [importOpen, setImportOpen] = useState(false)
  const edit = useStore((s) => s.edit)
  const m = (mm: number) => formatLen(mm, unit === 'mm' ? 'm' : unit === 'cm' ? 'm' : unit)

  const data = useMemo(() => {
    if (!open) return null
    const { rows, unassigned } = circuitRows(project)
    const channels = actuatorChannels(project)
    return { rows, unassigned, channels, needs: actuatorNeeds(channels), ways: wayRows(project), mat: materialList(project, { floorId: matFloor || undefined, includeRuns: withRuns }) }
  }, [open, project, matFloor, withRuns])
  if (!open || !data) return null

  const T = buildTables(project, unit, { floorId: matFloor || undefined, runs: withRuns })
  const { circuits, needs, channels, ga, scenes, ways, material: matTable } = T
  const eur = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
  const total = T.waysTotal

  const current: { tables: { title: string; t: Table }[] } =
    tab === 'circuits'
      ? { tables: [{ title: 'Stromkreisliste', t: circuits }] }
      : tab === 'cabinet'
        ? { tables: [] }
      : tab === 'channels'
        ? { tables: [{ title: 'Aktorbedarf je Verteiler', t: needs }, { title: 'Aktorkanäle', t: channels }] }
        : tab === 'ga'
          ? { tables: [{ title: 'Gruppenadressen', t: ga }, { title: 'Szenen', t: scenes }] }
          : tab === 'ways'
            ? { tables: [{ title: `Leitungswege zum Verteiler (Summe ${m(total)})`, t: ways }] }
            : { tables: [{ title: 'Material & Kosten (netto)', t: matTable }] }

  const csv = () => current.tables.map(({ title, t }) => toCsv([[title], t.head, ...t.rows])).join('\r\n\r\n')
  const label = { circuits: 'stromkreise', cabinet: 'belegung', channels: 'aktorkanaele', ga: 'gruppenadressen', ways: 'leitungswege', material: 'material' }[tab]
  const safe = project.name.replace(/[^\w\-äöüÄÖÜß ]+/g, '_').trim() || 'projekt'

  return (
    <Modal
      title="Listen: Schaltschrank, Material, Kosten"
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
          <button
            className="btn"
            onClick={() => {
              setOpen(false)
              useStore.getState().setPrintOpen(true, true)
            }}
          >
            <Printer size={15} /> Drucken …
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
            { value: 'cabinet', label: 'Belegung & Schaltplan' },
            { value: 'channels', label: 'Aktorkanäle' },
            { value: 'ga', label: 'Gruppenadressen' },
            { value: 'ways', label: 'Leitungswege' },
            { value: 'material', label: 'Material & Kosten' },
          ]}
        />
      </div>
      {tab === 'circuits' && data.unassigned.length > 0 && (
        <p className="status-line warn">
          <AlertTriangle size={16} /> {data.unassigned.length} Geräte ohne Stromkreis sind in der Liste nicht enthalten (siehe „Offene Punkte“).
        </p>
      )}
      {tab === 'material' ? (
        <div className="schrank-table">
          <div className="mat-opts price-src">
            <select
              value={project.priceSourceId ?? 'katalog'}
              title="Preisquelle – eigene Preise (✎) überschreiben sie"
              onChange={(e) => {
                if (e.target.value === '__import') setImportOpen(true)
                else edit((p) => void (p.priceSourceId = e.target.value))
              }}
            >
              <option value="katalog">Preise: Katalog (Standard)</option>
              <option value="richtwert">Preise: {RICHTWERT_NAME}</option>
              {(project.priceSources ?? []).map((ps) => (
                <option key={ps.id} value={ps.id}>
                  Preise: {ps.name}
                </option>
              ))}
              <option value="__import">Preisliste importieren …</option>
            </select>
            {project.priceSources?.some((x) => x.id === project.priceSourceId) && (
              <button
                className="btn small danger"
                onClick={() =>
                  edit((p) => {
                    p.priceSources = (p.priceSources ?? []).filter((x) => x.id !== p.priceSourceId)
                    p.priceSourceId = 'katalog'
                  })
                }
              >
                Liste löschen
              </button>
            )}
            {Object.keys(project.prices ?? {}).length > 0 && (
              <button className="btn small" onClick={() => edit((p) => void (p.prices = {}))}>
                Eigene Preise zurücksetzen
              </button>
            )}
            <select value={matFloor} onChange={(e) => setMatFloor(e.target.value)}>
              <option value="">Alle Geschosse</option>
              {project.floors.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            <label className="check">
              <input type="checkbox" checked={withRuns} onChange={(e) => setWithRuns(e.target.checked)} /> geschätzte Zuleitungen zum Verteiler einrechnen
            </label>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Position</th>
                  <th className="r">Menge</th>
                  <th>Einheit</th>
                  <th className="r">Einzelpreis €</th>
                  <th className="r">Summe €</th>
                </tr>
              </thead>
              <tbody>
                {data.mat.lines.map((l, i) => (
                  <Fragment key={l.key}>
                    {(i === 0 || data.mat.lines[i - 1].group !== l.group) && (
                      <tr key={'g' + l.group} className="group-row">
                        <td colSpan={5}>{l.group}</td>
                      </tr>
                    )}
                    <tr title={l.note}>
                      <td>{l.name}</td>
                      <td className="r">{num(l.qty, l.unit === 'm' ? 1 : 0)}</td>
                      <td>{l.unit}</td>
                      <td className="r price-cell">
                        <NumberField
                          value={l.price}
                          decimals={2}
                          min={0}
                          suffix={l.price !== l.defaultPrice ? '✎' : undefined}
                          onCommit={(v) => edit((p) => void ((p.prices = p.prices ?? {})[l.key] = v), `price:${l.key}`)}
                        />
                      </td>
                      <td className="r">{num(l.sum, 2)}</td>
                    </tr>
                  </Fragment>
                ))}
                {data.mat.lines.length === 0 && (
                  <tr>
                    <td colSpan={5} className="muted">
                      Noch keine Positionen.
                    </td>
                  </tr>
                )}
                <tr className="sum-row">
                  <td colSpan={4}>Summe netto</td>
                  <td className="r">{eur(data.mat.net)}</td>
                </tr>
                <tr>
                  <td colSpan={4}>MwSt. {Math.round(VAT * 100)} %</td>
                  <td className="r">{eur(data.mat.net * VAT)}</td>
                </tr>
                <tr className="sum-row">
                  <td colSpan={4}>Summe brutto</td>
                  <td className="r">{eur(data.mat.net * (1 + VAT))}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="muted small">
            Preise sind Richtwerte/Netto-Preise der gewählten Quelle und lassen sich je Position anpassen (✎ = eigener Preis, hat Vorrang). „{RICHTWERT_NAME}“: Leitungen nach Shop-Preisen, Geräte geschätzt – kein Live-Abgleich. Mengen aus Zuleitungen sind geschätzt.
          </p>
        </div>
      ) : null}
      {tab === 'cabinet' && (() => {
        const co = project.cabinet ?? DEFAULT_CABINET_OPTS
        const cab = planCabinet(project, co)
        return (
          <div className="schrank-table">
            <div className="mat-opts">
              <label className="check">
                Reihenbreite
                <select value={co.rowTE} onChange={(e) => edit((p) => void (p.cabinet = { ...co, rowTE: Number(e.target.value) }))}>
                  {[12, 18, 24].map((n) => (
                    <option key={n} value={n}>{n} TE</option>
                  ))}
                </select>
              </label>
              <label className="check">
                Reserve
                <select value={co.reservePct} onChange={(e) => edit((p) => void (p.cabinet = { ...co, reservePct: Number(e.target.value) }))}>
                  {[0, 10, 20, 30, 40].map((n) => (
                    <option key={n} value={n}>{n} %</option>
                  ))}
                </select>
              </label>
            </div>
            <p className="muted small">
              {cab.rows.length} Reihe(n) × {cab.rowTE} TE = {cab.teTotal} TE · belegt {cab.teUsed} TE · Reserve {cab.teReserve} TE. Reihenklemmen: {cab.terminals.n} × N, {cab.terminals.pe} × PE, {cab.terminals.l} × L-Verteilung (inkl. Reserve).
            </p>
            <h3>Belegung der Hutschienen</h3>
            <CabinetLayout cab={cab} />
            <h3>Übersichtsschaltplan (einpolig)</h3>
            <CabinetDiagram cab={cab} />
            <p className="muted small">Richtwerte: Hauptschalter 3 TE, ÜSS 2 TE, FI 4 TE, LS 1 TE (3-polig 3 TE), KNX-Netzteil und Aktoren je 4 TE. Bitte mit dem tatsächlichen Hersteller-Sortiment abgleichen.</p>
          </div>
        )
      })()}
      {tab !== 'material' && current.tables.map(({ title, t }) => (
        <div key={title} className="schrank-table">
          <h3>{title}</h3>
          <DataTable t={t} />
        </div>
      ))}
    {importOpen && <PriceImportDialog onClose={() => setImportOpen(false)} />}
    </Modal>
  )
}
