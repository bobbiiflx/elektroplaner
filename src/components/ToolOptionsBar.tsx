import { useStore } from '../store'
import { LenField } from './NumberField'
import { CablePicker, CablePickerButton } from './CablePicker'
import { OpeningPicker, OpeningPickerButton } from './OpeningPicker'
import { DevicePicker, DevicePickerButton } from './DevicePicker'
import { Segmented } from './ui'
import { SpecFields, mergeSpec } from './SpecFields'
import { CircuitSelect } from './ElectricPanel'

interface Props {
  cableNodes: number
  onVertical: () => void
  onFinishCable: () => void
  onCancelCable: () => void
  /** 'wall' = Wandansicht: Höhe ergibt sich aus dem Klick, kein „Senkrecht“-Knopf nötig. */
  mode?: 'plan' | 'wall'
}

export function ToolOptionsBar({ cableNodes, onVertical, onFinishCable, onCancelCable, mode = 'plan' }: Props) {
  const tool = useStore((s) => s.tool)
  const opts = useStore((s) => s.opts)
  const setOpts = useStore((s) => s.setOpts)
  const defaultSeries = useStore((s) => s.project.settings.seriesId)
  const pickerOpen = useStore((s) => s.pickerOpen)
  const hasBg = useStore((s) => {
    const f = s.project.floors.find((x) => x.id === s.activeFloorId) ?? s.project.floors[0]
    return !!f.background
  })

  if (tool === 'select') return null

  return (
    <>
    <div className="optbar glass" onPointerDown={(e) => e.stopPropagation()}>
      {tool === 'wall' && (
        <>
          <Segmented
            value={opts.wallKind}
            onChange={(v) => setOpts({ wallKind: v })}
            options={[
              { value: 'outer', label: 'Außenwand' },
              { value: 'inner', label: 'Innenwand' },
            ]}
          />
          <label className="check">
            <input type="checkbox" checked={opts.ortho} onChange={(e) => setOpts({ ortho: e.target.checked })} />
            Rechtwinklig
          </label>
        </>
      )}

      {tool === 'opening' && (
        <>
          <OpeningPickerButton />
          <span className="opt-text">Auf Wand klicken – oder in eine Lücke zwischen zwei Wänden (wird als Wand geschlossen)</span>
        </>
      )}

      {tool === 'device' && (
        <>
          <DevicePickerButton />
          <SpecFields typeId={opts.deviceTypeId} spec={opts.spec} defaultSeriesId={defaultSeries} onChange={(patch) => setOpts({ spec: mergeSpec(opts.spec, patch) })} layout="bar" />
          <label className="opt-inline" title="Neue Geräte werden diesem Stromkreis zugeordnet">
            <span className="small muted">Stromkreis</span>
            <CircuitSelect value={opts.circuitId ?? ''} onChange={(id) => setOpts({ circuitId: id || undefined })} />
          </label>
        </>
      )}

      {tool === 'measure' && (
        <>
          <label className="check" title="Rastet am Raster, an Wand- und Öffnungspunkten und immer an der Mitte von Objekten ein">
            <input type="checkbox" checked={opts.snap} onChange={(e) => setOpts({ snap: e.target.checked })} />
            Einrasten
          </label>
          <span className="opt-text">
            {opts.snap ? 'Raster · Objektmitten · Wandpunkte' : 'Frei – ohne Einrasten'} · Umschalt = waagerecht/senkrecht · Esc bricht ab
          </span>
        </>
      )}

      {tool === 'cable' && (
        <>
          <CablePickerButton />
          {mode === 'plan' && (
            <>
              <span className="opt-label">Höhe</span>
              <div className="opt-field">
                <LenField mm={opts.cableZ} onCommit={(v) => setOpts({ cableZ: v })} />
              </div>
              <button className="btn small" disabled={cableNodes < 1} onClick={onVertical} title="Neue Höhe eintragen, dann hier klicken: Leitung geht an derselben Stelle senkrecht auf diese Höhe">
                Senkrecht
              </button>
            </>
          )}
          <button className="btn small primary" disabled={cableNodes < 2} onClick={onFinishCable}>
            Fertig
          </button>
          {cableNodes > 0 && (
            <button className="btn small" onClick={onCancelCable}>
              Abbrechen
            </button>
          )}
        </>
      )}

      {tool === 'room' && (
        <>
          <Segmented
            value={opts.roomMode}
            onChange={(v) => setOpts({ roomMode: v })}
            options={[
              { value: 'auto', label: 'Automatisch', title: 'In einen geschlossenen Raum klicken' },
              { value: 'rect', label: 'Rechteck', title: 'Zwei Ecken anklicken (z. B. offene Küche)' },
              { value: 'poly', label: 'Frei', title: 'Eckpunkte anklicken, Start oder Enter schließt' },
            ]}
          />
          {opts.roomMode === 'poly' && (
            <label className="check">
              <input type="checkbox" checked={opts.ortho} onChange={(e) => setOpts({ ortho: e.target.checked })} />
              Rechtwinklig
            </label>
          )}
        </>
      )}

      {tool === 'calibrate' && (
        <span className="opt-text">
          {hasBg ? 'Zwei Punkte mit bekanntem Abstand anklicken' : 'Zuerst einen Grundriss laden'}
        </span>
      )}
    </div>
    {tool === 'opening' && pickerOpen && <OpeningPicker />}
    {tool === 'device' && pickerOpen && <DevicePicker />}
    {tool === 'cable' && pickerOpen && <CablePicker />}
    </>
  )
}
