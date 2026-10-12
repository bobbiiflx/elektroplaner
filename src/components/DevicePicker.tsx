import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { CATEGORY_LABEL, DEVICE_TYPES, deviceType, type DeviceCategory } from '../config/catalog'
import { useStore } from '../store'
import { formatLen } from '../lib/units'
import { DeviceIcon, PlanSymbol } from './DeviceIcons'

/** Auswahlmaske für Steckdosen, Schalter, Dosen usw. – mit Icon (Frontplatte) und Planzeichen. */
export function DevicePicker() {
  const opts = useStore((s) => s.opts)
  const setOpts = useStore((s) => s.setOpts)
  const setPickerOpen = useStore((s) => s.setPickerOpen)
  const unit = useStore((s) => s.unit)
  const [cat, setCat] = useState<DeviceCategory | 'all'>('all')
  const [q, setQ] = useState('')

  const cats = Object.keys(CATEGORY_LABEL) as DeviceCategory[]
  const items = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return DEVICE_TYPES.filter((d) => (cat === 'all' || d.category === cat) && (!needle || d.name.toLowerCase().includes(needle)))
  }, [cat, q])

  const groups = cats
    .map((c) => ({ cat: c, items: items.filter((d) => d.category === c) }))
    .filter((g) => g.items.length)

  return (
    <>
      <div className="picker-backdrop" onPointerDown={() => setPickerOpen(false)} />
      <div className="picker glass" onPointerDown={(e) => e.stopPropagation()} role="dialog" aria-label="Gerät wählen">
        <div className="picker-head">
          <label className="picker-search">
            <Search size={15} />
            <input placeholder="Suchen …" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <div className="chips">
            <button className={'chip' + (cat === 'all' ? ' on' : '')} onClick={() => setCat('all')}>
              Alle
            </button>
            {cats.map((c) => (
              <button key={c} className={'chip' + (cat === c ? ' on' : '')} onClick={() => setCat(c)}>
                {CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>
        </div>

        <div className="picker-body">
          {groups.length === 0 && <p className="muted">Nichts gefunden.</p>}
          {groups.map((g) => (
            <section key={g.cat}>
              <h4>{CATEGORY_LABEL[g.cat]}</h4>
              <div className="picker-grid">
                {g.items.map((d) => (
                  <button
                    key={d.id}
                    className={'dev-card' + (opts.deviceTypeId === d.id ? ' on' : '')}
                    onClick={() => {
                      setOpts({ deviceTypeId: d.id, spec: {} })
                      setPickerOpen(false)
                    }}
                    title={`${d.name} · Standardhöhe ${formatLen(d.defaultHeight, unit)}`}
                  >
                    <span className="dev-icon">
                      <DeviceIcon typeId={d.id} size={64} />
                    </span>
                    <span className="dev-sym" title="Planzeichen im Grundriss">
                      <PlanSymbol typeId={d.id} size={24} />
                    </span>
                    <span className="dev-name">{d.name}</span>
                    <span className="dev-meta">{formatLen(d.defaultHeight, unit)} über OKFF</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="picker-foot">
          <span>Großes Bild: Ansicht an der Wand</span>
          <span>Kleines Zeichen: Planzeichen im Grundriss</span>
        </div>
      </div>
    </>
  )
}

/** Schaltfläche in der Optionsleiste: zeigt das gewählte Gerät und öffnet die Maske. */
export function DevicePickerButton() {
  const id = useStore((s) => s.opts.deviceTypeId)
  const open = useStore((s) => s.pickerOpen)
  const setOpen = useStore((s) => s.setPickerOpen)
  const dt = deviceType(id)
  return (
    <button className={'picker-btn' + (open ? ' on' : '')} onClick={() => setOpen(!open)} title="Gerät wählen">
      <DeviceIcon typeId={id} size={30} />
      <span className="picker-btn-name">{dt.name}</span>
      <PlanSymbol typeId={id} size={20} />
    </button>
  )
}
