import type { ReactNode } from 'react'
import { useFloor, useStore } from '../store'
import { Segmented } from './ui'

/** Umschalter links oben: Grundriss ↔ Wandansicht (Frontansicht der gewählten Wand). */
export function PaneSwitch({ children }: { children?: ReactNode }) {
  const floor = useFloor()
  const pane = useStore((s) => s.planPane)
  const selection = useStore((s) => s.selection)
  const elevWallId = useStore((s) => s.elevWallId)
  const openElevation = useStore((s) => s.openElevation)
  const closeElevation = useStore((s) => s.closeElevation)
  const showToast = useStore((s) => s.showToast)

  const candidate = (): string | undefined => {
    if (selection?.kind === 'wall') return selection.id
    if (selection?.kind === 'opening') return floor.openings.find((o) => o.id === selection.id)?.wallId
    if (selection?.kind === 'device') return floor.devices.find((d) => d.id === selection.id)?.wallId
    if (elevWallId && floor.walls.some((w) => w.id === elevWallId)) return elevWallId
    return floor.walls[0]?.id
  }

  return (
    <div className="paneswitch glass" onPointerDown={(e) => e.stopPropagation()}>
      <Segmented
        value={pane}
        onChange={(v) => {
          if (v === 'plan') return closeElevation()
          const id = candidate()
          if (!id) return showToast('Zuerst eine Wand zeichnen.')
          openElevation(id)
        }}
        options={[
          { value: 'plan', label: 'Grundriss' },
          { value: 'wall', label: 'Wandansicht', title: 'Frontansicht der gewählten Wand (E)' },
        ]}
      />
      {children}
    </div>
  )
}
