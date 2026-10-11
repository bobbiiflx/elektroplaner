import { BrickWall, Cable, DoorOpen, MousePointer2, Plug, Ruler } from 'lucide-react'
import type { ReactNode } from 'react'
import { useStore, type Tool } from '../store'

export const TOOLS: { id: Tool; label: string; key: string; icon: ReactNode }[] = [
  { id: 'select', label: 'Auswählen', key: 'V', icon: <MousePointer2 size={19} /> },
  { id: 'wall', label: 'Wand zeichnen', key: 'W', icon: <BrickWall size={19} /> },
  { id: 'opening', label: 'Tür / Fenster', key: 'O', icon: <DoorOpen size={19} /> },
  { id: 'device', label: 'Steckdose / Schalter / Dose', key: 'D', icon: <Plug size={19} /> },
  { id: 'cable', label: 'Leitung verlegen', key: 'C', icon: <Cable size={19} /> },
  { id: 'calibrate', label: 'Maßstab kalibrieren', key: 'K', icon: <Ruler size={19} /> },
]

export default function ToolRail() {
  const tool = useStore((s) => s.tool)
  const setTool = useStore((s) => s.setTool)
  return (
    <div className="toolrail glass" onPointerDown={(e) => e.stopPropagation()}>
      {TOOLS.map((t) => (
        <button
          key={t.id}
          className={'tool' + (tool === t.id ? ' on' : '')}
          title={`${t.label} (${t.key})`}
          aria-label={t.label}
          onClick={() => setTool(t.id)}
        >
          {t.icon}
        </button>
      ))}
    </div>
  )
}
