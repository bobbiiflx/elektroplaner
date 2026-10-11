import { create } from 'zustand'
import { produce, type Draft } from 'immer'
import type {
  Background,
  CableNode,
  Floor,
  OpeningType,
  Project,
  ProjectMeta,
  Unit,
  WallKind,
} from './types'
import { newFloor, newProject, sampleProject } from './lib/factory'
import { cableType } from './config/catalog'
import { uid } from './lib/geom'
import * as storage from './lib/storage'

export type Tool = 'select' | 'wall' | 'opening' | 'device' | 'cable' | 'calibrate'
export type ViewMode = 'split' | '2d' | '3d'

export interface AskDialog {
  title: string
  message?: string
  /** Wenn gesetzt, wird ein Textfeld mit diesem Startwert angezeigt. */
  initial?: string
  okLabel?: string
  danger?: boolean
  onOk: (value: string) => void
}

export interface Selection {
  kind: 'wall' | 'opening' | 'device' | 'cable'
  id: string
}

export interface ToolOptions {
  wallKind: WallKind
  openingType: OpeningType
  deviceTypeId: string
  cableTypeId: string
  cableZ: number
  ortho: boolean
}

interface State {
  ready: boolean
  metas: ProjectMeta[]
  project: Project
  backgrounds: Record<string, string>
  activeFloorId: string
  selection: Selection | null
  tool: Tool
  opts: ToolOptions
  unit: Unit
  viewMode: ViewMode
  showZones: boolean
  showAllFloors: boolean
  ghostWalls: boolean
  toast: string | null
  importFile: File | null
  settingsOpen: boolean
  ask: AskDialog | null
  pickerOpen: boolean
  /** Linke Fläche: Grundriss oder Frontansicht einer Wand */
  planPane: 'plan' | 'wall'
  elevWallId: string | null
  elevSide: 1 | -1
  past: Project[]
  future: Project[]
  lastEdit: { key: string; t: number } | null

  init: () => Promise<void>
  edit: (recipe: (p: Draft<Project>) => void, key?: string) => void
  undo: () => void
  redo: () => void
  setTool: (t: Tool) => void
  select: (s: Selection | null) => void
  setOpts: (o: Partial<ToolOptions>) => void
  setUnit: (u: Unit) => void
  setViewMode: (v: ViewMode) => void
  toggleZones: () => void
  toggleAllFloors: () => void
  toggleGhostWalls: () => void
  showToast: (msg: string) => void
  openImport: (f: File | null) => void
  setSettingsOpen: (v: boolean) => void
  setAsk: (a: AskDialog | null) => void
  setPickerOpen: (v: boolean) => void
  openElevation: (wallId: string) => void
  closeElevation: () => void
  setElevSide: (s: 1 | -1) => void
  /** Legt aus den Knoten eine Leitung im aktiven Geschoss an (Typ aus den Werkzeugoptionen) und wählt sie. */
  createCable: (points: CableNode[]) => void

  openProject: (id: string) => Promise<void>
  createProject: (name: string) => Promise<void>
  removeProject: (id: string) => Promise<void>
  importProjectText: (text: string) => Promise<void>

  setActiveFloor: (id: string) => void
  addFloor: () => string
  removeFloor: (id: string) => void
  setBackground: (floorId: string, dataUrl: string, bg: Background) => void
  clearBackground: (floorId: string) => void
  deleteSelection: () => void
}

const LAST_KEY = 'ep:last'
const MAX_HISTORY = 100

const initial = sampleProject()

let toastTimer: number | undefined

export const useStore = create<State>((set, get) => ({
  ready: false,
  metas: [],
  project: initial,
  backgrounds: {},
  activeFloorId: initial.floors[0].id,
  selection: null,
  tool: 'select',
  opts: {
    wallKind: 'outer',
    openingType: 'door',
    deviceTypeId: 'sd-1',
    cableTypeId: 'nym-3x1.5',
    cableZ: 300,
    ortho: true,
  },
  unit: 'cm',
  viewMode: 'split',
  showZones: false,
  showAllFloors: false,
  ghostWalls: false,
  toast: null,
  importFile: null,
  settingsOpen: false,
  ask: null,
  pickerOpen: false,
  planPane: 'plan',
  elevWallId: null,
  elevSide: 1,
  past: [],
  future: [],
  lastEdit: null,

  init: async () => {
    const metas = await storage.listProjects()
    let lastId: string | null = null
    try {
      lastId = localStorage.getItem(LAST_KEY)
    } catch {
      /* ignore */
    }
    const target = metas.find((m) => m.id === lastId) ?? [...metas].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
    if (target) {
      set({ metas })
      await get().openProject(target.id)
    } else {
      const p = sampleProject()
      await storage.saveProject(p)
      set({ metas: await storage.listProjects(), project: p, activeFloorId: p.floors[0].id, backgrounds: {} })
    }
    set({ ready: true })
  },

  edit: (recipe, key) => {
    const { project, past, lastEdit } = get()
    const next = produce(project, recipe)
    if (next === project) return
    const now = Date.now()
    const coalesce = !!key && !!lastEdit && lastEdit.key === key && now - lastEdit.t < 800
    set({
      project: { ...next, updatedAt: new Date().toISOString() },
      past: coalesce ? past : [...past, project].slice(-MAX_HISTORY),
      future: [],
      lastEdit: { key: key ?? '', t: now },
    })
  },

  undo: () => {
    const { past, project, future } = get()
    if (!past.length) return
    const prev = past[past.length - 1]
    set({ project: prev, past: past.slice(0, -1), future: [project, ...future], lastEdit: null })
    fixSelection()
  },

  redo: () => {
    const { past, project, future } = get()
    if (!future.length) return
    const [next, ...rest] = future
    set({ project: next, past: [...past, project], future: rest, lastEdit: null })
    fixSelection()
  },

  setTool: (t) => set((st) => ({ tool: t, pickerOpen: t === 'device' || t === 'cable' ? (st.tool !== t ? true : st.pickerOpen) : false })),
  select: (selection) => set({ selection }),
  setOpts: (o) => set((s) => ({ opts: { ...s.opts, ...o } })),
  setUnit: (unit) => set({ unit }),
  setViewMode: (viewMode) => set({ viewMode }),
  toggleZones: () => set((s) => ({ showZones: !s.showZones })),
  toggleAllFloors: () => set((s) => ({ showAllFloors: !s.showAllFloors })),
  toggleGhostWalls: () => set((s) => ({ ghostWalls: !s.ghostWalls })),
  openImport: (importFile) => set({ importFile }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setAsk: (ask) => set({ ask }),
  setPickerOpen: (pickerOpen) => set({ pickerOpen }),
  openElevation: (wallId) => set({ planPane: 'wall', elevWallId: wallId, pickerOpen: false }),
  closeElevation: () => set({ planPane: 'plan', pickerOpen: false }),
  setElevSide: (elevSide) => set({ elevSide }),
  createCable: (points) => {
    if (points.length < 2) return
    const { opts, activeFloorId } = get()
    const ct = cableType(opts.cableTypeId)
    const id = uid('c_')
    get().edit((p) => {
      const f = p.floors.find((x) => x.id === activeFloorId)
      f?.cables.push({ id, typeId: ct.id, points, fuseA: ct.defaultFuse ?? 16, method: 'B2', charac: 'B' })
    })
    set({ selection: { kind: 'cable', id } })
  },

  showToast: (msg) => {
    set({ toast: msg })
    window.clearTimeout(toastTimer)
    toastTimer = window.setTimeout(() => set({ toast: null }), 4500)
  },

  openProject: async (id) => {
    const p = await storage.loadProject(id)
    if (!p) return
    const backgrounds: Record<string, string> = {}
    for (const f of p.floors) {
      const bg = await storage.loadBackground(p.id, f.id)
      if (bg) backgrounds[f.id] = bg
    }
    try {
      localStorage.setItem(LAST_KEY, id)
    } catch {
      /* ignore */
    }
    set({
      project: p,
      backgrounds,
      activeFloorId: p.floors[0].id,
      selection: null,
      tool: 'select',
      planPane: 'plan',
      elevWallId: null,
      pickerOpen: false,
      past: [],
      future: [],
      lastEdit: null,
    })
  },

  createProject: async (name) => {
    const p = newProject(name || 'Neues Projekt')
    await storage.saveProject(p)
    set({ metas: await storage.listProjects() })
    await get().openProject(p.id)
  },

  removeProject: async (id) => {
    const metas = await storage.listProjects()
    const victim = id === get().project.id ? get().project : await storage.loadProject(id)
    if (victim) await storage.deleteProject(victim)
    const rest = metas.filter((m) => m.id !== id)
    set({ metas: rest })
    if (id === get().project.id) {
      if (rest.length) await get().openProject(rest[0].id)
      else await get().createProject('Neues Projekt')
    }
  },

  importProjectText: async (text) => {
    const { project, backgrounds } = storage.parseImport(text)
    // neue IDs vermeiden Kollisionen mit vorhandenen Projekten
    const exists = get().metas.some((m) => m.id === project.id)
    const p: Project = exists ? { ...project, id: project.id + '_i' + Date.now().toString(36), name: project.name + ' (Import)' } : project
    await storage.saveProject(p)
    for (const f of p.floors) {
      if (backgrounds[f.id]) await storage.saveBackground(p.id, f.id, backgrounds[f.id])
    }
    set({ metas: await storage.listProjects() })
    await get().openProject(p.id)
  },

  setActiveFloor: (id) => set({ activeFloorId: id, selection: null, planPane: 'plan', elevWallId: null }),

  addFloor: () => {
    const { project } = get()
    const f = newFloor(project.settings, `Geschoss ${project.floors.length + 1}`)
    get().edit((p) => {
      p.floors.push(f)
    })
    set({ activeFloorId: f.id, selection: null })
    return f.id
  },

  removeFloor: (id) => {
    const { project, activeFloorId } = get()
    if (project.floors.length <= 1) return
    const idx = project.floors.findIndex((f) => f.id === id)
    get().edit((p) => {
      p.floors = p.floors.filter((f) => f.id !== id)
    })
    void storage.deleteBackground(project.id, id)
    if (activeFloorId === id) {
      const left = get().project.floors
      set({ activeFloorId: left[Math.max(0, idx - 1)].id, selection: null })
    }
  },

  setBackground: (floorId, dataUrl, bg) => {
    const pid = get().project.id
    void storage.saveBackground(pid, floorId, dataUrl)
    set((s) => ({ backgrounds: { ...s.backgrounds, [floorId]: dataUrl } }))
    get().edit((p) => {
      const f = p.floors.find((x) => x.id === floorId)
      if (f) f.background = bg
    })
  },

  clearBackground: (floorId) => {
    const pid = get().project.id
    void storage.deleteBackground(pid, floorId)
    set((s) => {
      const b = { ...s.backgrounds }
      delete b[floorId]
      return { backgrounds: b }
    })
    get().edit((p) => {
      const f = p.floors.find((x) => x.id === floorId)
      if (f) delete f.background
    })
  },

  deleteSelection: () => {
    const { selection, activeFloorId } = get()
    if (!selection) return
    get().edit((p) => {
      const f = p.floors.find((x) => x.id === activeFloorId)
      if (!f) return
      if (selection.kind === 'wall') {
        const gone = new Set(f.devices.filter((d) => d.wallId === selection.id).map((d) => d.id))
        f.walls = f.walls.filter((w) => w.id !== selection.id)
        f.openings = f.openings.filter((o) => o.wallId !== selection.id)
        f.devices = f.devices.filter((d) => d.wallId !== selection.id)
        for (const c of f.cables) for (const n of c.points) if (n.deviceId && gone.has(n.deviceId)) delete n.deviceId
      } else if (selection.kind === 'opening') {
        f.openings = f.openings.filter((o) => o.id !== selection.id)
      } else if (selection.kind === 'device') {
        f.devices = f.devices.filter((d) => d.id !== selection.id)
        for (const c of f.cables) for (const n of c.points) if (n.deviceId === selection.id) delete n.deviceId
      } else {
        f.cables = f.cables.filter((c) => c.id !== selection.id)
      }
    })
    set({ selection: null })
  },
}))

function fixSelection() {
  const { selection, project, activeFloorId } = useStore.getState()
  const floor = project.floors.find((f) => f.id === activeFloorId)
  if (!floor) {
    useStore.setState({ activeFloorId: project.floors[0].id, selection: null })
    return
  }
  if (!selection) return
  const list =
    selection.kind === 'wall'
      ? floor.walls
      : selection.kind === 'opening'
        ? floor.openings
        : selection.kind === 'device'
          ? floor.devices
          : floor.cables
  if (!list.some((x) => x.id === selection.id)) useStore.setState({ selection: null })
}

/** Aktives Geschoss (fällt auf das erste zurück, falls die ID nicht mehr existiert). */
export function useFloor(): Floor {
  return useStore((s) => s.project.floors.find((f) => f.id === s.activeFloorId) ?? s.project.floors[0])
}

// --- automatisches Speichern ----------------------------------------------
let saveTimer: number | undefined
useStore.subscribe((s, prev) => {
  if (!s.ready) return
  if (s.project === prev.project || s.project.id !== prev.project.id) return
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(async () => {
    await storage.saveProject(useStore.getState().project)
    useStore.setState({ metas: await storage.listProjects() })
  }, 500)
})
