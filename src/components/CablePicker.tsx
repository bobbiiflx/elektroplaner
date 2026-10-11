import { CABLE_TYPES, cableType, type CableCategory } from '../config/catalog'
import { useStore } from '../store'
import { CableIcon } from './DeviceIcons'

const CABLE_GROUP: Record<CableCategory, string> = {
  power: 'Starkstrom (NYM-J)',
  data: 'Netzwerk / Daten',
  knx: 'KNX',
  conduit: 'Leerrohr',
}

/** Auswahlmaske für Leitungstypen – gleicher Aufbau wie die Geräte-Maske. */
export function CablePicker() {
  const opts = useStore((s) => s.opts)
  const setOpts = useStore((s) => s.setOpts)
  const setPickerOpen = useStore((s) => s.setPickerOpen)
  const groups = (Object.keys(CABLE_GROUP) as CableCategory[])
    .map((c) => ({ cat: c, items: CABLE_TYPES.filter((t) => t.category === c) }))
    .filter((g) => g.items.length)

  return (
    <>
      <div className="picker-backdrop" onPointerDown={() => setPickerOpen(false)} />
      <div className="picker glass" onPointerDown={(e) => e.stopPropagation()} role="dialog" aria-label="Leitung wählen">
        <div className="picker-body" style={{ paddingTop: 12 }}>
          {groups.map((g) => (
            <section key={g.cat}>
              <h4>{CABLE_GROUP[g.cat]}</h4>
              <div className="picker-grid">
                {g.items.map((t) => (
                  <button
                    key={t.id}
                    className={'dev-card' + (opts.cableTypeId === t.id ? ' on' : '')}
                    onClick={() => {
                      setOpts({ cableTypeId: t.id })
                      setPickerOpen(false)
                    }}
                  >
                    <span className="dev-icon">
                      <CableIcon typeId={t.id} size={64} />
                    </span>
                    <span className="dev-sym" title="Farbe der Leitung in Plan und 3D">
                      <i className="cable-dot" style={{ background: t.color }} />
                    </span>
                    <span className="dev-name">{t.name}</span>
                    <span className="dev-meta">
                      {t.defaultFuse ? `bis ${t.defaultFuse} A · ` : ''}
                      {t.price.toFixed(2).replace('.', ',')} €/m
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
        <div className="picker-foot">
          <span>Große Abbildung: Leitungsart</span>
          <span>Punkt: Farbe in Plan und 3D</span>
        </div>
      </div>
    </>
  )
}

export function CablePickerButton() {
  const id = useStore((s) => s.opts.cableTypeId)
  const open = useStore((s) => s.pickerOpen)
  const setOpen = useStore((s) => s.setPickerOpen)
  const ct = cableType(id)
  return (
    <button className={'picker-btn' + (open ? ' on' : '')} onClick={() => setOpen(!open)} title="Leitung wählen">
      <CableIcon typeId={id} size={30} />
      <span className="picker-btn-name">{ct.name}</span>
      <i className="cable-dot" style={{ background: ct.color }} />
    </button>
  )
}
