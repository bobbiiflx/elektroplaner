import { CABLE_TYPES, CATEGORY_LABEL, DEVICE_TYPES, type DeviceCategory } from '../config/catalog'
import { useStore } from '../store'
import { LenField } from './NumberField'
import { Segmented } from './ui'

interface Props {
  cableNodes: number
  onVertical: () => void
  onFinishCable: () => void
  onCancelCable: () => void
}

export function ToolOptionsBar({ cableNodes, onVertical, onFinishCable, onCancelCable }: Props) {
  const tool = useStore((s) => s.tool)
  const opts = useStore((s) => s.opts)
  const setOpts = useStore((s) => s.setOpts)
  const hasBg = useStore((s) => {
    const f = s.project.floors.find((x) => x.id === s.activeFloorId) ?? s.project.floors[0]
    return !!f.background
  })

  if (tool === 'select') return null

  const groups = (Object.keys(CATEGORY_LABEL) as DeviceCategory[]).map((c) => ({
    cat: c,
    items: DEVICE_TYPES.filter((d) => d.category === c),
  }))

  return (
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
        <Segmented
          value={opts.openingType}
          onChange={(v) => setOpts({ openingType: v })}
          options={[
            { value: 'door', label: 'Tür' },
            { value: 'window', label: 'Fenster' },
          ]}
        />
      )}

      {tool === 'device' && (
        <select value={opts.deviceTypeId} onChange={(e) => setOpts({ deviceTypeId: e.target.value })}>
          {groups.map((g) => (
            <optgroup key={g.cat} label={CATEGORY_LABEL[g.cat]}>
              {g.items.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      )}

      {tool === 'cable' && (
        <>
          <select value={opts.cableTypeId} onChange={(e) => setOpts({ cableTypeId: e.target.value })}>
            {CABLE_TYPES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <span className="opt-label">Höhe</span>
          <div className="opt-field">
            <LenField mm={opts.cableZ} onCommit={(v) => setOpts({ cableZ: v })} />
          </div>
          <button className="btn small" disabled={cableNodes < 1} onClick={onVertical} title="Neue Höhe eintragen, dann hier klicken: Leitung geht an derselben Stelle senkrecht auf diese Höhe">
            Senkrecht
          </button>
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

      {tool === 'calibrate' && (
        <span className="opt-text">
          {hasBg ? 'Zwei Punkte mit bekanntem Abstand anklicken' : 'Zuerst einen Grundriss laden'}
        </span>
      )}
    </div>
  )
}
