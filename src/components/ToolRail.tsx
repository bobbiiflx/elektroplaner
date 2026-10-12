import { BrickWall, Cable, DoorOpen, Hammer, MousePointer2, Plug, Ruler, ScanSearch, Scaling } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useStore, type Tool } from '../store'

export const TOOLS: { id: Tool; label: string; key: string; icon: ReactNode; group?: 'build' }[] = [
  { id: 'select', label: 'Auswählen', key: 'V', icon: <MousePointer2 size={19} /> },
  { id: 'wall', label: 'Wand zeichnen', key: 'W', icon: <BrickWall size={19} />, group: 'build' },
  { id: 'opening', label: 'Tür / Fenster / Hebe-Schiebetür', key: 'O', icon: <DoorOpen size={19} />, group: 'build' },
  { id: 'device', label: 'Steckdose / Schalter / Dose', key: 'D', icon: <Plug size={19} /> },
  { id: 'cable', label: 'Leitung verlegen', key: 'C', icon: <Cable size={19} /> },
  { id: 'measure', label: 'Lineal – Maße zeichnen', key: 'M', icon: <Ruler size={19} /> },
  { id: 'calibrate', label: 'Maßstab kalibrieren', key: 'K', icon: <Scaling size={19} /> },
]

export default function ToolRail() {
  const tool = useStore((s) => s.tool)
  const setTool = useStore((s) => s.setTool)
  const setWallDetectOpen = useStore((s) => s.setWallDetectOpen)
  const [open, setOpen] = useState(false)

  const build = TOOLS.filter((t) => t.group === 'build')
  const buildActive = build.some((t) => t.id === tool)
  const btn = (t: (typeof TOOLS)[number]) => (
    <button key={t.id} className={'tool' + (tool === t.id ? ' on' : '')} title={`${t.label} (${t.key})`} aria-label={t.label} onClick={() => setTool(t.id)}>
      {t.icon}
    </button>
  )

  return (
    <div className="toolrail glass" onPointerDown={(e) => e.stopPropagation()}>
      {TOOLS.filter((t) => !t.group && t.id === 'select').map(btn)}

      <div className="tool-group">
        <button className={'tool' + (buildActive ? ' on' : open ? ' open' : '')} title="Bauen: Wände, Türen, Fenster" aria-label="Bauen" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <Hammer size={19} />
        </button>
        {open && (
          <>
            <div className="flyout-backdrop" onPointerDown={() => setOpen(false)} />
            <div className="flyout glass" role="menu">
              {build.map((t) => (
                <button
                  key={t.id}
                  role="menuitem"
                  className={'flyout-item' + (tool === t.id ? ' on' : '')}
                  onClick={() => {
                    setTool(t.id)
                    setOpen(false)
                  }}
                >
                  {t.icon}
                  <span>{t.label}</span>
                  <kbd>{t.key}</kbd>
                </button>
              ))}
              <button
                role="menuitem"
                className="flyout-item"
                onClick={() => {
                  setWallDetectOpen(true)
                  setOpen(false)
                }}
              >
                <ScanSearch size={19} />
                <span>Wände erkennen (aus Plan)</span>
              </button>
            </div>
          </>
        )}
      </div>

      {TOOLS.filter((t) => !t.group && t.id !== 'select').map(btn)}
    </div>
  )
}
