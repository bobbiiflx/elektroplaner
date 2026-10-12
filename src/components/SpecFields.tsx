import type { ReactNode } from 'react'
import { BOX_PRESETS, DEFAULT_BOX_ID, SERIES, deviceType, resolveSpec, seriesById, type DeviceSpec } from '../config/catalog'
import { LenField } from './NumberField'
import { Row } from './ui'

interface Props {
  typeId: string
  spec: DeviceSpec
  defaultSeriesId?: string
  /** Änderungen als Teilobjekt; Schlüssel mit undefined werden entfernt. */
  onChange: (patch: Partial<DeviceSpec>) => void
  /** 'bar' = kompakt in der Optionsleiste, 'panel' = Zeilen im Inspektor */
  layout: 'bar' | 'panel'
}

/** Auswahl von Schalterserie bzw. Größe und Unterputzdose – jeweils mit „Eigene Maße“. */
export function SpecFields({ typeId, spec, defaultSeriesId, onChange, layout }: Props) {
  const dt = deviceType(typeId)
  const cur = resolveSpec(typeId, spec, defaultSeriesId)
  const wrap = (label: string, hint: string | undefined, node: ReactNode) =>
    layout === 'panel' ? (
      <Row label={label} hint={hint}>
        {node}
      </Row>
    ) : (
      <span className="spec-field" title={hint ? `${label} – ${hint}` : label}>
        <span className="opt-label">{label}</span>
        {node}
      </span>
    )

  const out: ReactNode[] = []

  if (dt.gangs) {
    const val = spec.seriesId ?? ''
    out.push(
      <span key="series" style={{ display: 'contents' }}>
        {wrap(
          'Serie',
          'Rahmenmaß',
          <div className="spec-ctl">
            <select
              value={val}
              onChange={(e) => {
                const v = e.target.value
                if (v === 'custom') onChange({ seriesId: 'custom', w: spec.w ?? Math.round(cur.dt.w), h: spec.h ?? Math.round(cur.dt.h) })
                else onChange({ seriesId: v || undefined, w: undefined, h: undefined })
              }}
            >
              <option value="">Projektstandard · {seriesById(defaultSeriesId).name}</option>
              {SERIES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              <option value="custom">Eigene Maße …</option>
            </select>
          </div>,
        )}
        {val === 'custom' &&
          wrap(
            'Breite × Höhe',
            undefined,
            <div className="spec-ctl pair">
              <LenField mm={spec.w ?? cur.dt.w} min={10} onCommit={(v) => onChange({ w: v })} />
              <LenField mm={spec.h ?? cur.dt.h} min={10} onCommit={(v) => onChange({ h: v })} />
            </div>,
          )}
        {layout === 'panel' && <p className="muted small spec-note">{cur.sizeLabel}{cur.series && !cur.series.verified ? ' · Richtwert, im Datenblatt prüfen' : ''}</p>}
      </span>,
    )
  } else if (dt.sizes) {
    const defId = dt.sizes.find((x) => x.w === dt.w && x.h === dt.h)?.id ?? dt.sizes[0].id
    const val = spec.sizeId ?? defId
    out.push(
      <span key="size" style={{ display: 'contents' }}>
        {wrap(
          'Größe',
          'Richtwerte',
          <div className="spec-ctl">
            <select
              value={val}
              onChange={(e) => {
                const v = e.target.value
                if (v === 'custom') onChange({ sizeId: 'custom', w: spec.w ?? Math.round(cur.dt.w), h: spec.h ?? Math.round(cur.dt.h) })
                else onChange({ sizeId: v, w: undefined, h: undefined })
              }}
            >
              {dt.sizes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
              <option value="custom">Eigene Maße …</option>
            </select>
          </div>,
        )}
        {val === 'custom' &&
          wrap(
            'Breite × Höhe',
            undefined,
            <div className="spec-ctl pair">
              <LenField mm={spec.w ?? cur.dt.w} min={10} onCommit={(v) => onChange({ w: v })} />
              <LenField mm={spec.h ?? cur.dt.h} min={10} onCommit={(v) => onChange({ h: v })} />
            </div>,
          )}
      </span>,
    )
  }

  if (dt.box) {
    const val = spec.boxId ?? DEFAULT_BOX_ID
    out.push(
      <span key="box" style={{ display: 'contents' }}>
        {wrap(
          'UP-Dose',
          cur.box && cur.box.count > 1 ? `${cur.box.count} Dosen, Mittenabstand ${cur.box.pitch} mm` : undefined,
          <div className="spec-ctl">
            <select
              value={val}
              onChange={(e) => {
                const v = e.target.value
                if (v === 'custom') onChange({ boxId: 'custom', boxDia: spec.boxDia ?? cur.box?.dia ?? 60, boxDepth: spec.boxDepth ?? cur.box?.depth ?? 47 })
                else onChange({ boxId: v, boxDia: undefined, boxDepth: undefined })
              }}
            >
              {BOX_PRESETS.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
              <option value="custom">Eigene Dose …</option>
            </select>
          </div>,
        )}
        {val === 'custom' &&
          wrap(
            'Ø × Tiefe',
            undefined,
            <div className="spec-ctl pair">
              <LenField mm={spec.boxDia ?? 60} min={10} onCommit={(v) => onChange({ boxDia: v })} />
              <LenField mm={spec.boxDepth ?? 47} min={10} onCommit={(v) => onChange({ boxDepth: v })} />
            </div>,
          )}
        {layout === 'panel' && cur.box && (
          <p className="muted small spec-note">
            {cur.box.count > 1 ? `${cur.box.count} × ` : ''}Ø {cur.box.dia} × {cur.box.depth} mm · Bohrkrone Ø {cur.box.drill} mm
            {cur.box.count > 1 ? ` · Mittenabstand ${cur.box.pitch} mm` : ''}
          </p>
        )}
      </span>,
    )
  }

  if (!out.length) return null
  return <>{out}</>
}

/** Teiländerung in ein Spec-Objekt einarbeiten (undefined entfernt den Schlüssel). */
export function mergeSpec<T extends DeviceSpec>(spec: T, patch: Partial<DeviceSpec>): T {
  const next: Record<string, unknown> = { ...spec }
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete next[k]
    else next[k] = v
  }
  return next as T
}
