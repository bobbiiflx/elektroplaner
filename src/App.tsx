import { Suspense, lazy, useEffect, useState } from 'react'
import { Box, HardHat, Map as MapIcon, SlidersHorizontal, X } from 'lucide-react'
import { useIsMobile } from './lib/useMobile'
import AskDialog from './components/AskDialog'
import Editor2D from './components/Editor2D'
import Inspector from './components/Inspector'
import SettingsDialog from './components/SettingsDialog'
import ToolRail, { TOOLS } from './components/ToolRail'
import TopBar from './components/TopBar'
import WallElevation from './components/WallElevation'
import SiteView from './components/SiteView'
const PrintView = lazy(() => import('./components/PrintView'))
// Selten genutzte Dialoge (u. a. PDF-Bibliothek) werden erst beim Öffnen geladen
const ImportDialog = lazy(() => import('./components/ImportDialog'))
const WallDetectDialog = lazy(() => import('./components/WallDetectDialog'))
const SchrankDialog = lazy(() => import('./components/SchrankDialog'))
import { useStore } from './store'

const View3D = lazy(() => import('./components/View3D'))

function Toast() {
  const toast = useStore((s) => s.toast)
  if (!toast) return null
  return <div className="toast glass">{toast}</div>
}

/** Handy-Ansicht: ein Bereich auf einmal (Grundriss, 3D oder Details) mit Leiste unten. */
function MobileShell() {
  const [tab, setTab] = useState<'plan' | '3d' | 'details'>('plan')
  const planPane = useStore((s) => s.planPane)
  const selection = useStore((s) => s.selection)
  const select = useStore((s) => s.select)
  const setSite = useStore((s) => s.setSiteMode)
  const sheet = tab === 'plan' && !!selection
  return (
    <div className="app mobile">
      <TopBar compact />
      <div className="m-body">
        <div className="m-pane" style={{ display: tab === 'plan' ? 'block' : 'none' }}>
          <div style={{ display: planPane === 'plan' ? 'contents' : 'none' }}>
            <Editor2D />
          </div>
          {planPane === 'wall' && <WallElevation />}
          <ToolRail />
        </div>
        {tab === '3d' && (
          <div className="m-pane">
            <Suspense fallback={<div className="loading">3D wird geladen …</div>}>
              <View3D />
            </Suspense>
          </div>
        )}
        {tab === 'details' && (
          <aside className="inspector m-full">
            <Inspector />
          </aside>
        )}
        {sheet && (
          <aside className="inspector m-sheet">
            <div className="m-sheet-head">
              <span className="m-grip" />
              <button className="icon-btn" aria-label="Schließen" onClick={() => select(null)}>
                <X size={18} />
              </button>
            </div>
            <Inspector />
          </aside>
        )}
      </div>
      <nav className="m-nav glass">
        <button className={tab === 'plan' ? 'on' : ''} onClick={() => setTab('plan')}>
          <MapIcon size={20} />
          <span>Grundriss</span>
        </button>
        <button className={tab === '3d' ? 'on' : ''} onClick={() => setTab('3d')}>
          <Box size={20} />
          <span>3D</span>
        </button>
        <button className={tab === 'details' ? 'on' : ''} onClick={() => setTab('details')}>
          <SlidersHorizontal size={20} />
          <span>Details</span>
        </button>
        <button onClick={() => setSite(true)}>
          <HardHat size={20} />
          <span>Baustelle</span>
        </button>
      </nav>
      <Suspense fallback={null}>
        <SchrankHost />
      </Suspense>
      <SettingsDialog />
      <AskDialog />
      <Toast />
    </div>
  )
}

function SchrankHost() {
  const schrankOpen = useStore((s) => s.schrankOpen)
  return schrankOpen ? <SchrankDialog /> : null
}

export default function App() {
  const mobile = useIsMobile()
  const ready = useStore((s) => s.ready)
  const viewMode = useStore((s) => s.viewMode)
  const planPane = useStore((s) => s.planPane)
  const printOpen = useStore((s) => s.printOpen)
  const siteMode = useStore((s) => s.siteMode)
  const importOpen = useStore((s) => !!s.importFile)
  const wallDetectOpen = useStore((s) => s.wallDetectOpen)
  const schrankOpen = useStore((s) => s.schrankOpen)

  useEffect(() => {
    void useStore.getState().init()
  }, [])

  // Globale Tastenkürzel
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) return
      const st = useStore.getState()
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) st.redo()
        else st.undo()
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        st.redo()
      } else if (mod && e.key.toLowerCase() === 'c' && (st.selection || st.multi.length)) {
        e.preventDefault()
        st.copySel()
      } else if (mod && e.key.toLowerCase() === 'v' && st.clip) {
        e.preventDefault()
        st.pasteSel()
      } else if (!mod && (e.key === 'Delete' || e.key === 'Backspace')) {
        if (st.multi.length) {
          e.preventDefault()
          st.deleteMulti()
        } else if (st.selection) {
          e.preventDefault()
          st.deleteSelection()
        }
      } else if (!mod && !e.altKey && e.key.toLowerCase() === 'e') {
        const sel = st.selection
        const fl = st.project.floors.find((f) => f.id === st.activeFloorId) ?? st.project.floors[0]
        const wid =
          sel?.kind === 'wall'
            ? sel.id
            : sel?.kind === 'opening'
              ? fl.openings.find((o) => o.id === sel.id)?.wallId
              : sel?.kind === 'device'
                ? fl.devices.find((d) => d.id === sel.id)?.wallId
                : (st.elevWallId ?? fl.walls[0]?.id)
        if (st.planPane === 'wall') st.closeElevation()
        else if (wid) st.openElevation(wid)
      } else if (!mod && !e.altKey) {
        const t = TOOLS.find((x) => x.key.toLowerCase() === e.key.toLowerCase())
        if (t) st.setTool(t.id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!ready) return <div className="app loading">Lade …</div>
  if (printOpen)
    return (
      <Suspense fallback={<div className="app loading">Druckansicht wird vorbereitet …</div>}>
        <PrintView />
      </Suspense>
    )

  if (siteMode) return <SiteView />
  if (mobile) return <MobileShell />

  return (
    <div className="app">
      <TopBar />
      <div className="main">
        <div className="panes">
          {viewMode !== '3d' && (
            <div className="pane">
              {/* Der Grundriss bleibt eingehängt (Ansicht & Zustand bleiben erhalten), solange die Wandansicht offen ist */}
              <div style={{ display: planPane === 'plan' ? 'contents' : 'none' }}>
                <Editor2D />
              </div>
              {planPane === 'wall' && <WallElevation />}
              <ToolRail />
            </div>
          )}
          {viewMode !== '2d' && (
            <div className="pane">
              <Suspense fallback={<div className="loading">3D wird geladen …</div>}>
                <View3D />
              </Suspense>
            </div>
          )}
        </div>
        <aside className="inspector">
          <Inspector />
        </aside>
      </div>
      <Suspense fallback={null}>
        {importOpen && <ImportDialog />}
        {wallDetectOpen && <WallDetectDialog />}
        {schrankOpen && <SchrankDialog />}
      </Suspense>
      <SettingsDialog />
      <AskDialog />
      <Toast />
    </div>
  )
}
