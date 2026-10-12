import { useMemo, useState } from 'react'
import { pickFile } from '../lib/files'
import { BRUTTO, matchRow, parsePriceText, priceCandidates } from '../lib/priceSources'
import { uid } from '../lib/geom'
import { useStore } from '../store'
import { Modal } from './ui'

export default function PriceImportDialog({ onClose }: { onClose: () => void }) {
  const edit = useStore((s) => s.edit)
  const showToast = useStore((s) => s.showToast)
  const [text, setText] = useState('')
  const [name, setName] = useState('Meine Preisliste')
  const [gross, setGross] = useState(true)
  const [map, setMap] = useState<Record<number, string>>({})
  const cands = useMemo(priceCandidates, [])

  const rows = useMemo(() => parsePriceText(text).map((r) => ({ ...r, auto: matchRow(r.name, cands)?.key ?? '' })), [text, cands])
  const keyOf = (i: number) => (i in map ? map[i] : rows[i].auto)
  const used = rows.map((_, i) => keyOf(i)).filter(Boolean)

  const load = async () => {
    const f = await pickFile('.csv,.txt,.tsv,text/plain,text/csv')
    if (!f) return
    setText(await f.text())
    setName(f.name.replace(/\.[^.]+$/, ''))
    setMap({})
  }

  const save = () => {
    const prices: Record<string, number> = {}
    rows.forEach((r, i) => {
      const k = keyOf(i)
      if (k) prices[k] = Math.round((gross ? r.price / BRUTTO : r.price) * 100) / 100
    })
    const id = uid('ps_')
    edit((p) => {
      ;(p.priceSources = p.priceSources ?? []).push({ id, name: name.trim() || 'Preisliste', date: new Date().toISOString(), prices })
      p.priceSourceId = id
    })
    showToast(`${Object.keys(prices).length} Preise übernommen`)
    onClose()
  }

  return (
    <Modal
      title="Preisliste importieren"
      onClose={onClose}
      width={720}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn primary" disabled={!used.length} onClick={save}>
            {used.length} Preise übernehmen
          </button>
        </>
      }
    >
      <p className="muted small">
        CSV/Text-Datei oder Merkliste/Warenkorb/Angebot hier einfügen – eine Position pro Zeile (Name und Preis, getrennt durch ; Tab oder Leerzeichen). Die Zuordnung wird vorgeschlagen und kann geändert werden.
      </p>
      <div className="btn-row">
        <button className="btn small" onClick={load}>
          Datei wählen …
        </button>
        <label className="check">
          <input type="checkbox" checked={gross} onChange={(e) => setGross(e.target.checked)} /> Preise sind brutto (inkl. 19 % MwSt.)
        </label>
      </div>
      <textarea
        className="price-text"
        rows={6}
        placeholder={'Schuko Steckdose 2-fach;14,90\nNYM-J 3x2,5 Meterware;1,97'}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setMap({})
        }}
      />
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name der Preisliste" className="price-name" />
      {rows.length > 0 && (
        <div className="table-scroll" style={{ maxHeight: 280 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Zeile</th>
                <th className="r">Preis</th>
                <th>Zuordnung</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.name}</td>
                  <td className="r">{r.price.toFixed(2).replace('.', ',')}</td>
                  <td>
                    <select value={keyOf(i)} onChange={(e) => setMap((m) => ({ ...m, [i]: e.target.value }))}>
                      <option value="">– nicht übernehmen –</option>
                      {cands.map((c) => (
                        <option key={c.key} value={c.key}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}
