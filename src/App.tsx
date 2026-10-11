import { Suspense, lazy, useEffect } from 'react'
import Editor2D from './components/Editor2D'
import ImportDialog from './components/ImportDialog'
import Inspector from './components/Inspector'
import SettingsDialog from './components/SettingsDialog'
import ToolRail, { TOOLS } from './components/ToolRail'
import TopBar from './components/TopBar'
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
      } else if (!mod && (e.key === 'Delete' || e.key === 'Backspace')) {
        if (st.selection) {
          e.preventDefault()
          st.deleteSelection()
        }
      } else if (!mod && !e.altKey) {
        const t = TOOLS.find((x) => x.key.toLowerCase() === e.key.toLowerCase())
        if (t) st.setTool(t.id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!ready) return <div className="app loading">Lade …</div>

  return (
    <div className="app">
      <TopBar />
      <div className="main">
        <div className="panes">
          {viewMode !== '3d' && (
            <div className="pane">
              <Editor2D />
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
      <SettingsDialog />
      <Toast />
    </div>
  )
}
