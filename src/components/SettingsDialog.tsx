import { Plus, Trash2 } from 'lucide-react'
import { DEFAULT_SERIES_ID, DEFAULT_SETTINGS, SERIES } from '../config/catalog'
import { uid } from '../lib/geom'
import { useStore } from '../store'
import type { ProjectSettings } from '../types'
import { LenField, NumberField } from './NumberField'
import { Modal, Row, Section } from './ui'

export default function SettingsDialog() {
  const open = useStore((s) => s.settingsOpen)
  const setOpen = useStore((s) => s.setSettingsOpen)
  const settings = useStore((s) => s.project.settings)
  const edit = useStore((s) => s.edit)
  if (!open) return null

  const upd = (fn: (s: ProjectSettings) => void, key?: string) => edit((p) => fn(p.settings as ProjectSettings), key)
  const zones = settings.zones

  return (
    <Modal
      title="Projekteinstellungen"
      width={560}
      onClose={() => setOpen(false)}
      footer={
        <button className="btn primary" onClick={() => setOpen(false)}>
          Fertig
        </button>
      }
    >
      <Section title="Standardmaße">
        <p className="muted small">Gelten für neu gezeichnete Wände und neue Geschosse. Bestehende Elemente ändern sich nicht.</p>
        <Row label="Wandhöhe">
          <LenField mm={settings.wallHeight} min={500} onCommit={(v) => upd((s) => void (s.wallHeight = v), 'set:wh')} />
        </Row>
        <Row label="Geschosshöhe" hint="inkl. Decke">
          <LenField mm={settings.levelHeight} min={500} onCommit={(v) => upd((s) => void (s.levelHeight = v), 'set:lh')} />
        </Row>
        <Row label="Außenwand">
          <LenField mm={settings.outerThickness} min={20} onCommit={(v) => upd((s) => void (s.outerThickness = v), 'set:ot')} />
        </Row>
        <Row label="Innenwand">
          <LenField mm={settings.innerThickness} min={20} onCommit={(v) => upd((s) => void (s.innerThickness = v), 'set:it')} />
        </Row>
        <Row label="Schalterserie" hint="Rahmenmaße">
          <select value={settings.seriesId ?? DEFAULT_SERIES_ID} onChange={(e) => upd((s) => void (s.seriesId = e.target.value), 'set:series')}>
            {SERIES.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </Row>
        <Row label="Raster" hint="Einrasten beim Zeichnen">
          <LenField mm={settings.grid} min={1} onCommit={(v) => upd((s) => void (s.grid = v), 'set:grid')} />
        </Row>
      </Section>

      <Section
        title="Installationszonen (DIN 18015-3)"
        aside={
          <button
            className="btn small"
            onClick={() => upd((s) => void (s.zones = JSON.parse(JSON.stringify(DEFAULT_SETTINGS.zones))))}
          >
            Zurücksetzen
          </button>
        }
      >
        <p className="muted small">Waagerechte Zonen. Mitte gemessen ab OKFF bzw. unter der Decke. Bitte gegen deine Normfassung prüfen.</p>
        {zones.horizontal.map((z, i) => (
          <div key={z.id} className="zone-row">
            <input
              className="text"
              value={z.label}
              onChange={(e) => upd((s) => void (s.zones.horizontal[i].label = e.target.value), `zl:${z.id}`)}
            />
            <select value={z.ref} onChange={(e) => upd((s) => void (s.zones.horizontal[i].ref = e.target.value as 'floor' | 'ceiling'))}>
              <option value="floor">ab OKFF</option>
              <option value="ceiling">unter Decke</option>
            </select>
            <LenField mm={z.center} min={0} onCommit={(v) => upd((s) => void (s.zones.horizontal[i].center = v), `zc:${z.id}`)} />
            <button className="icon-btn" title="Zone entfernen" onClick={() => upd((s) => void s.zones.horizontal.splice(i, 1))}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <button
          className="btn small"
          onClick={() => upd((s) => void s.zones.horizontal.push({ id: uid('z_'), label: 'Neue Zone', ref: 'floor', center: 900 }))}
        >
          <Plus size={14} /> Zone hinzufügen
        </button>
        <Row label="Breite waagerecht">
          <LenField mm={zones.width} min={10} onCommit={(v) => upd((s) => void (s.zones.width = v), 'set:zw')} />
        </Row>
        <Row label="Breite senkrecht">
          <LenField mm={zones.verticalWidth} min={10} onCommit={(v) => upd((s) => void (s.zones.verticalWidth = v), 'set:zvw')} />
        </Row>
        <Row label="Abstand senkrecht" hint="von Ecke / Laibung">
          <LenField mm={zones.verticalOffset} min={0} onCommit={(v) => upd((s) => void (s.zones.verticalOffset = v), 'set:zvo')} />
        </Row>
      </Section>

      <Section
        title="VDE-Berechnung"
        aside={
          <button className="btn small" onClick={() => upd((s) => void (s.vde = { ...DEFAULT_SETTINGS.vde }))}>
            Zurücksetzen
          </button>
        }
      >
        <p className="muted small">
          Grundlagen für Spannungsfall, Belastbarkeit und Abschaltbedingung (DIN VDE 0100-520/-410, DIN 18015-1). Vereinfachtes Modell, ersetzt keine
          Messung nach VDE 0100-600.
        </p>
        <Row label="Spannungsfall max.">
          <NumberField value={settings.vde.dropLimitPct} decimals={1} suffix="%" min={0.1} onCommit={(v) => upd((s) => void (s.vde.dropLimitPct = v), 'set:dl')} />
        </Row>
        <Row label="Leitfähigkeit κ" hint="Cu bei 70 °C = 48">
          <NumberField value={settings.vde.kappa} decimals={1} suffix="m/Ωmm²" min={1} onCommit={(v) => upd((s) => void (s.vde.kappa = v), 'set:k')} />
        </Row>
        <Row label="cos φ">
          <NumberField value={settings.vde.cosPhi} decimals={2} min={0.1} max={1} onCommit={(v) => upd((s) => void (s.vde.cosPhi = v), 'set:cp')} />
        </Row>
        <Row label="Netzimpedanz bis Verteiler">
          <NumberField value={settings.vde.sourceImpedance} decimals={2} suffix="Ω" min={0} onCommit={(v) => upd((s) => void (s.vde.sourceImpedance = v), 'set:zs')} />
        </Row>
      </Section>
    </Modal>
  )
}
