import { Suspense, lazy, useEffect } from 'react'
import AskDialog from './components/AskDialog'
import Editor2D from './components/Editor2D'
import ImportDialog from './components/ImportDialog'
import WallDetectDialog from './components/WallDetectDialog'
import Inspector from './components/Inspector'
import SettingsDialog from './components/SettingsDialog'
import SchrankDialog from './components/SchrankDialog'
import ToolRail, { TOOLS } from './components/ToolRail'
import TopBar from './components/TopBar'
import WallElevation from './components/WallElevation'
import SiteView from './components/SiteView'
const PrintView = lazy(() => import('./components/PrintView'))
import { useStore } from './store'

const View3D = lazy(() => import('./components/View3D'))

function Toast() {
  const toast = useStore((s) => s.toast)
  if (!toast) return null
  return <div className="toast glass">{toast}</div>
}

export default function App() {
  const ready = useStore((s) => s.ready)
  const viewMode = useStore((s) => s.viewMode)
  const planPane = useStore((s) => s.planPane)
  const printOpen = useStore((s) => s.printOpen)
  const siteMode = useStore((s) => s.siteMode)

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
      <ImportDialog />
      <WallDetectDialog />
      <SettingsDialog />
      <SchrankDialog />
      <AskDialog />
      <Toast />
    </div>
  )
}
