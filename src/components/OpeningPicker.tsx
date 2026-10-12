import { OPENING_TYPES, openingDef } from '../config/catalog'
import { useStore } from '../store'
import { formatLen } from '../lib/units'
import { OpeningIcon } from './OpeningGlyphs'

/** Auswahlmaske für Türen und Fenster – mit Icon und Standardmaßen. */
export function OpeningPicker() {
  const opts = useStore((s) => s.opts)
  const setOpts = useStore((s) => s.setOpts)
  const setPickerOpen = useStore((s) => s.setPickerOpen)
  const unit = useStore((s) => s.unit)
  return (
    <>
      <div className="picker-backdrop" onPointerDown={() => setPickerOpen(false)} />
      <div className="picker glass opening-picker" onPointerDown={(e) => e.stopPropagation()} role="dialog" aria-label="Öffnung wählen">
        <div className="picker-body">
          <div className="picker-grid">
            {OPENING_TYPES.map((d) => (
              <button
                key={d.id}
                className={'dev-card' + (opts.openingType === d.id ? ' on' : '')}
                onClick={() => {
                  setOpts({ openingType: d.id })
                  setPickerOpen(false)
                }}
              >
                <span className="dev-icon">
                  <OpeningIcon type={d.id} size={64} />
                </span>
                <span className="dev-name">{d.name}</span>
                <span className="dev-meta">
                  {formatLen(d.width, unit)} × {formatLen(d.height, unit)}
                </span>
                <span className="dev-meta">{d.hint}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="picker-foot">
          <span>Auch in Lücken zwischen zwei Wänden setzbar – der Rest wird als Wand geschlossen.</span>
        </div>
      </div>
    </>
  )
}

export function OpeningPickerButton() {
  const type = useStore((s) => s.opts.openingType)
  const open = useStore((s) => s.pickerOpen)
  const setOpen = useStore((s) => s.setPickerOpen)
  const d = openingDef(type)
  return (
    <button className={'picker-btn' + (open ? ' on' : '')} onClick={() => setOpen(!open)} title="Öffnungsart wählen">
      <OpeningIcon type={type} size={30} />
      <span className="picker-btn-name">{d.name}</span>
    </button>
  )
}
