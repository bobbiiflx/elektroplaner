import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Download, FolderOpen, Pencil, Plus, Redo2, Settings2, Trash2, Undo2, Upload } from 'lucide-react'
import { downloadText, pickFile } from '../lib/files'
import { exportJson } from '../lib/storage'
import { UNITS } from '../lib/units'
import { useStore } from '../store'
import { Segmented } from './ui'

function ProjectMenu() {
  const project = useStore((s) => s.project)
  const metas = useStore((s) => s.metas)
  const backgrounds = useStore((s) => s.backgrounds)
  const openProject = useStore((s) => s.openProject)
  const createProject = useStore((s) => s.createProject)
  const removeProject = useStore((s) => s.removeProject)
  const importProjectText = useStore((s) => s.importProjectText)
  const edit = useStore((s) => s.edit)
  const showToast = useStore((s) => s.showToast)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const h = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', h)
    return () => window.removeEventListener('pointerdown', h)
  }, [open])

  const sorted = [...metas].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  return (
    <div className="menu-wrap" ref={ref}>
      <button className="project-btn" onClick={() => setOpen((o) => !o)}>
        <span className="project-name">{project.name}</span>
        <ChevronDown size={16} />
      </button>
      {open && (
        <div className="menu glass">
          <div className="menu-title">Projekte</div>
          {sorted.map((m) => (
            <div key={m.id} className="menu-item">
              <button
                className="menu-main"
                onClick={() => {
                  void openProject(m.id)
                  setOpen(false)
                }}
              >
                <span className="check-slot">{m.id === project.id && <Check size={14} />}</span>
                {m.id === project.id ? project.name : m.name}
              </button>
              <button
                className="icon-btn"
                title="Projekt löschen"
                onClick={() => {
                  if (confirm(`Projekt „${m.name}“ endgültig löschen?`)) void removeProject(m.id)
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <div className="menu-sep" />
          <button
            className="menu-action"
            onClick={() => {
              const name = prompt('Name des neuen Projekts', 'Neues Projekt')
              if (name !== null) void createProject(name.trim())
              setOpen(false)
            }}
          >
            <Plus size={15} /> Neues Projekt …
          </button>
          <button
            className="menu-action"
            onClick={() => {
              const name = prompt('Projekt umbenennen', project.name)
              if (name && name.trim()) edit((p) => void (p.name = name.trim()))
              setOpen(false)
            }}
          >
            <Pencil size={15} /> Umbenennen …
          </button>
          <button
            className="menu-action"
            onClick={() => {
              const safe = project.name.replace(/[^\w\-äöüÄÖÜß ]+/g, '_').trim() || 'projekt'
              downloadText(`${safe}.elektroplaner.json`, exportJson(project, backgrounds))
              setOpen(false)
            }}
          >
            <Download size={15} /> Exportieren (JSON)
          </button>
          <button
            className="menu-action"
            onClick={async () => {
              setOpen(false)
              const f = await pickFile('.json,application/json')
              if (!f) return
              try {
                await importProjectText(await f.text())
                showToast('Projekt importiert.')
              } catch (e) {
                showToast(e instanceof Error ? e.message : 'Import fehlgeschlagen')
              }
            }}
          >
            <FolderOpen size={15} /> Importieren …
          </button>
        </div>
      )}
    </div>
  )
}

export default function TopBar() {
  const project = useStore((s) => s.project)
  const activeFloorId = useStore((s) => s.activeFloorId)
  const setActiveFloor = useStore((s) => s.setActiveFloor)
  const addFloor = useStore((s) => s.addFloor)
  const unit = useStore((s) => s.unit)
  const setUnit = useStore((s) => s.setUnit)
  const viewMode = useStore((s) => s.viewMode)
  const setViewMode = useStore((s) => s.setViewMode)
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)
  const openImport = useStore((s) => s.openImport)

  return (
    <header className="topbar glass">
      <ProjectMenu />

      <nav className="floors" aria-label="Geschosse">
        {project.floors.map((f) => (
          <button key={f.id} className={'floor-tab' + (f.id === activeFloorId ? ' on' : '')} onClick={() => setActiveFloor(f.id)}>
            {f.name}
          </button>
        ))}
        <button className="floor-add" title="Geschoss hinzufügen" onClick={() => addFloor()}>
          <Plus size={15} />
        </button>
      </nav>

      <div className="spacer" />

      <button
        className="btn small"
        onClick={async () => {
          const f = await pickFile('application/pdf,image/png,image/jpeg,image/webp')
          if (f) openImport(f)
        }}
      >
        <Upload size={14} /> Grundriss
      </button>

      <Segmented
        value={unit}
        onChange={setUnit}
        options={UNITS.map((u) => ({ value: u, label: u }))}
      />
      <Segmented
        value={viewMode}
        onChange={setViewMode}
        options={[
          { value: '2d', label: '2D' },
          { value: 'split', label: 'Geteilt' },
          { value: '3d', label: '3D' },
        ]}
      />

      <div className="btn-group">
        <button className="icon-btn" title="Rückgängig (⌘Z)" disabled={!canUndo} onClick={undo}>
          <Undo2 size={17} />
        </button>
        <button className="icon-btn" title="Wiederholen (⇧⌘Z)" disabled={!canRedo} onClick={redo}>
          <Redo2 size={17} />
        </button>
        <button className="icon-btn" title="Projekteinstellungen" onClick={() => setSettingsOpen(true)}>
          <Settings2 size={17} />
        </button>
      </div>
    </header>
  )
}
