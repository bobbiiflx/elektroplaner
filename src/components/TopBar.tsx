import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, History, HardHat, Download, ArrowDownToLine, ArrowUpToLine, Eye, FileOutput, FolderOpen, ImageUp, Image as ImageIcon, Monitor, Moon, Pencil, Plus, Printer, Redo2, Ruler, Settings2, Sun, Table2, Trash2, Undo2 } from 'lucide-react'
import { downloadText, pickFile } from '../lib/files'
import { exportJson, addSnapshot, listSnapshots, type Snapshot } from '../lib/storage'
import { UNITS } from '../lib/units'
import { useStore } from '../store'
import { Modal, Segmented } from './ui'
import { ColorByControl } from './ElectricPanel'

function VersionsDialog({ onClose }: { onClose: () => void }) {
  const project = useStore((s) => s.project)
  const restore = useStore((s) => s.restoreSnapshot)
  const showToast = useStore((s) => s.showToast)
  const [list, setList] = useState<Snapshot[] | null>(null)
  useEffect(() => {
    void listSnapshots(project.id).then(setList)
  }, [project.id])
  const count = (p: Snapshot['project']) => p.floors.reduce((n, f) => n + f.walls.length + f.devices.length + f.cables.length, 0)
  return (
    <Modal
      title="Versionen"
      onClose={onClose}
      width={460}
      footer={
        <button
          className="btn"
          onClick={async () => {
            await addSnapshot(project, 'Manuell', 0, true)
            setList(await listSnapshots(project.id))
            showToast('Version gesichert.')
          }}
        >
          Jetzt sichern
        </button>
      }
    >
      <p className="muted small">Der Planer sichert automatisch alle 10 Minuten (die letzten 20 Stände). Die Daten liegen nur in diesem Browser.</p>
      {list && !list.length && <p className="muted">Noch keine Version vorhanden.</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 340, overflow: 'auto' }}>
        {[...(list ?? [])].reverse().map((v) => (
          <div key={v.at} className="menu-item" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div>{new Date(v.at).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}</div>
              <div className="muted small">
                {v.label} · {count(v.project)} Elemente
              </div>
            </div>
            <button
              className="btn small"
              onClick={async () => {
                await restore(v.at)
                showToast('Version wiederhergestellt.')
                onClose()
              }}
            >
              Wiederherstellen
            </button>
          </div>
        ))}
      </div>
    </Modal>
  )
}

function ProjectMenu() {
  const [versions, setVersions] = useState(false)
  const project = useStore((s) => s.project)
  const metas = useStore((s) => s.metas)
  const backgrounds = useStore((s) => s.backgrounds)
  const openProject = useStore((s) => s.openProject)
  const createProject = useStore((s) => s.createProject)
  const removeProject = useStore((s) => s.removeProject)
  const importProjectText = useStore((s) => s.importProjectText)
  const edit = useStore((s) => s.edit)
  const showToast = useStore((s) => s.showToast)
  const openImport = useStore((s) => s.openImport)
  const setAsk = useStore((s) => s.setAsk)
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
      {versions && createPortal(<VersionsDialog onClose={() => setVersions(false)} />, document.body)}
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
                  setOpen(false)
                  setAsk({
                    title: 'Projekt löschen?',
                    message: `„${m.name}“ wird endgültig gelöscht, inklusive Grundrissen.`,
                    okLabel: 'Löschen',
                    danger: true,
                    onOk: () => void removeProject(m.id),
                  })
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
              setOpen(false)
              setAsk({
                title: 'Neues Projekt',
                initial: 'Neues Projekt',
                okLabel: 'Anlegen',
                onOk: (name) => void createProject(name),
              })
            }}
          >
            <Plus size={15} /> Neues Projekt …
          </button>
          <button
            className="menu-action"
            onClick={() => {
              setOpen(false)
              setAsk({
                title: 'Projekt umbenennen',
                initial: project.name,
                okLabel: 'Umbenennen',
                onOk: (name) => name && edit((p) => void (p.name = name)),
              })
            }}
          >
            <Pencil size={15} /> Umbenennen …
          </button>
          <button
            className="menu-action"
            onClick={async () => {
              setOpen(false)
              const f = await pickFile('application/pdf,image/png,image/jpeg,image/webp')
              if (f) openImport(f)
            }}
          >
            <ImageUp size={15} /> Grundriss in dieses Geschoss laden …
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
          <button
            className="menu-action"
            onClick={() => {
              setOpen(false)
              setVersions(true)
            }}
          >
            <History size={15} /> Versionen …
          </button>
        </div>
      )}
    </div>
  )
}

function usePopover() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('pointerdown', h)
    window.addEventListener('keydown', k)
    return () => {
      window.removeEventListener('pointerdown', h)
      window.removeEventListener('keydown', k)
    }
  }, [open])
  return { open, setOpen, ref }
}

/** „Ansicht“ (Auge): Layout, Einheit, Anzeige, Färbung und Erscheinungsbild an einer Stelle. */
function ViewMenu() {
  const { open, setOpen, ref } = usePopover()
  const unit = useStore((s) => s.unit)
  const setUnit = useStore((s) => s.setUnit)
  const viewMode = useStore((s) => s.viewMode)
  const setViewMode = useStore((s) => s.setViewMode)
  const showDims = useStore((s) => s.showDims)
  const toggleDims = useStore((s) => s.toggleDims)
  const showBackground = useStore((s) => s.showBackground)
  const toggleBackground = useStore((s) => s.toggleBackground)
  const ghostBelow = useStore((s) => s.ghostBelow)
  const ghostAbove = useStore((s) => s.ghostAbove)
  const setGhostBelow = useStore((s) => s.setGhostBelow)
  const setGhostAbove = useStore((s) => s.setGhostAbove)
  const hasBackground = useStore((s) => Object.keys(s.backgrounds).some((k) => !k.includes('~')))
  const theme = useStore((s) => s.theme)
  const setTheme = useStore((s) => s.setTheme)
  return (
    <div className="menu-wrap" ref={ref}>
      <button className={'btn small' + (open ? ' on' : '')} onClick={() => setOpen(!open)} title="Ansicht">
        <Eye size={15} /> Ansicht <ChevronDown size={13} />
      </button>
      {open && (
        <div className="menu glass menu-right view-menu">
          <div className="menu-block">
            <div className="menu-title">Fenster</div>
            <Segmented
              value={viewMode}
              onChange={setViewMode}
              options={[
                { value: '2d', label: '2D' },
                { value: 'split', label: 'Geteilt' },
                { value: '3d', label: '3D' },
              ]}
            />
          </div>
          <div className="menu-block">
            <div className="menu-title">Maßeinheit</div>
            <Segmented value={unit} onChange={setUnit} options={UNITS.map((u) => ({ value: u, label: u }))} />
          </div>
          <div className="menu-block">
            <div className="menu-title">Anzeige im Plan</div>
            <div className="toggle-row">
              <button className={'toggle-btn' + (showDims ? ' on' : '')} aria-pressed={showDims} onClick={toggleDims} title="Bemaßung im Plan ein-/ausblenden">
                <Ruler size={16} /> Bemaßung
              </button>
              <button
                className={'toggle-btn' + (showBackground && hasBackground ? ' on' : '')}
                aria-pressed={showBackground}
                disabled={!hasBackground}
                onClick={toggleBackground}
                title={hasBackground ? 'Importierten PDF-/Bild-Grundriss im Plan ein-/ausblenden' : 'Noch kein Grundriss importiert'}
              >
                <ImageIcon size={16} /> Grundriss
              </button>
            </div>
            <div className="toggle-row">
              <button className={'toggle-btn' + (ghostBelow ? ' on' : '')} aria-pressed={ghostBelow} onClick={() => setGhostBelow(!ghostBelow)} title="Wände des Geschosses darunter als Hilfslinien (violett)">
                <ArrowDownToLine size={16} /> Geschoss unten
              </button>
              <button className={'toggle-btn' + (ghostAbove ? ' on' : '')} aria-pressed={ghostAbove} onClick={() => setGhostAbove(!ghostAbove)} title="Wände des Geschosses darüber als Hilfslinien (türkis)">
                <ArrowUpToLine size={16} /> Geschoss oben
              </button>
            </div>
            <ColorByControl />
          </div>
          <div className="menu-block">
            <div className="menu-title">Erscheinungsbild</div>
            <Segmented
              value={theme}
              onChange={setTheme}
              options={[
                { value: 'system', label: <Monitor size={14} />, title: 'Wie Browser / System' },
                { value: 'light', label: <Sun size={14} />, title: 'Hell' },
                { value: 'dark', label: <Moon size={14} />, title: 'Dunkel' },
              ]}
            />
            <p className="muted small">{theme === 'system' ? 'Folgt dem Browser' : theme === 'light' ? 'Immer hell' : 'Immer dunkel'}</p>
          </div>
        </div>
      )}
    </div>
  )
}

/** „Ausgabe“: Druckansicht und Schaltschrank-Listen. */
function OutputMenu() {
  const { open, setOpen, ref } = usePopover()
  const setPrintOpen = useStore((s) => s.setPrintOpen)
  const setSchrankOpen = useStore((s) => s.setSchrankOpen)
  return (
    <div className="menu-wrap" ref={ref}>
      <button className={'btn small' + (open ? ' on' : '')} onClick={() => setOpen(!open)} title="Ausgabe">
        <FileOutput size={15} /> Ausgabe <ChevronDown size={13} />
      </button>
      {open && (
        <div className="menu glass menu-right">
          <button
            className="menu-action"
            onClick={() => {
              setOpen(false)
              setPrintOpen(true)
            }}
          >
            <Printer size={15} /> Druckansicht (Pläne, Maße, Checklisten)
          </button>
          <button
            className="menu-action"
            onClick={() => {
              setOpen(false)
              useStore.getState().setSiteMode(true)
            }}
          >
            <HardHat size={15} /> Baustellen-Modus (abhaken)
          </button>
          <button
            className="menu-action"
            onClick={() => {
              setOpen(false)
              setSchrankOpen(true)
            }}
          >
            <Table2 size={15} /> Listen (Schaltschrank, Material, Kosten)
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
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)

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

      <ViewMenu />
      <OutputMenu />
      <span className="vsep" />

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
