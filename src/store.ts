import { create } from 'zustand'
import { produce, type Draft } from 'immer'
import type {
  Group,
  Background,
  CableNode,
  Circuit,
  Floor,
  OpeningType,
  Project,
  ProjectMeta,
  Unit,
  WallKind,
} from './types'
import { newFloor, newProject, sampleProject } from './lib/factory'
import { CIRCUIT_COLORS, cableType, type DeviceSpec } from './config/catalog'
import type { ColorBy } from './lib/completeness'
import { nextGA } from './lib/groups'
import { uid } from './lib/geom'
import type { DetectedWall } from './lib/detectWalls'
import * as storage from './lib/storage'

export type Tool = 'select' | 'wall' | 'opening' | 'device' | 'cable' | 'measure' | 'calibrate' | 'anchor'
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
  kind: 'wall' | 'opening' | 'device' | 'cable' | 'dim'
  id: string
}

export interface ToolOptions {
  wallKind: WallKind
  openingType: OpeningType
  deviceTypeId: string
  cableTypeId: string
  cableZ: number
  ortho: boolean
  snap: boolean // Lineal: am Raster / an Objektmitten einrasten
  spec: DeviceSpec // gewählte Serie / Größe / Dose für neu gesetzte Geräte
  circuitId?: string // aktiver Stromkreis: neue Geräte werden ihm zugewiesen
}

interface State {
  ready: boolean
  metas: ProjectMeta[]
  project: Project
  backgrounds: Record<string, string>
  wallDetectOpen: boolean
  setWallDetectOpen: (v: boolean) => void
  ghostBelow: boolean
  setGhostBelow: (v: boolean) => void
  addSheetFloors: (items: { name: string; dataUrl: string; bg: Background; mask?: string | null }[]) => string[]
  setMask: (floorId: string, dataUrl: string | null) => void
  suggest: { floorId: string; walls: (DetectedWall & { id: string })[] } | null
  setSuggest: (v: { floorId: string; walls: DetectedWall[] } | null) => void
  dropSuggestion: (id: string) => void
  acceptSuggestion: () => void
  activeFloorId: string
  selection: Selection | null
  tool: Tool
  opts: ToolOptions
  unit: Unit
  viewMode: ViewMode
  showZones: boolean
  showDims: boolean
  colorBy: ColorBy
  printOpen: boolean
  schrankOpen: boolean
  printLists: boolean
  inspectorTab: 'floor' | 'electric' | 'knx' | 'cabinet'
  theme: 'system' | 'light' | 'dark'
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
  toggleDims: () => void
  setColorBy: (c: ColorBy) => void
  setSchrankOpen: (v: boolean) => void
  setInspectorTab: (t: 'floor' | 'electric' | 'knx' | 'cabinet') => void
  setTheme: (t: 'system' | 'light' | 'dark') => void
  addCircuit: (partial?: Partial<Circuit>) => string
  addGroup: (partial?: Partial<Group>) => string
  addScene: () => string
  setPrintOpen: (v: boolean, lists?: boolean) => void
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
  /** Legt ein Geschoss unter dem untersten an (Keller), optional mit den Wänden des bisher untersten Geschosses. */
  addBasement: (copyWalls: boolean) => string
  removeFloor: (id: string) => void
  setBackground: (floorId: string, dataUrl: string, bg: Background) => void
  clearBackground: (floorId: string) => void
  deleteSelection: () => void
}

const LAST_KEY = 'ep:last'
const MAX_HISTORY = 100

type Theme = 'system' | 'light' | 'dark'
function readTheme(): Theme {
  try {
    const t = localStorage.getItem('ep:theme')
    if (t === 'light' || t === 'dark') return t
  } catch {
    /* ignore */
  }
  return 'system'
}
// Ein umgebendes Fenster (z. B. der Artefakt-Viewer) kann selbst data-theme setzen; das merken wir uns,
// damit „System“ dessen Wahl respektiert statt sie zu löschen.
let hostTheme: string | null = typeof document !== 'undefined' ? document.documentElement.getAttribute('data-theme') : null
let own = false
if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
  new MutationObserver(() => {
    if (!own) hostTheme = document.documentElement.getAttribute('data-theme')
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
}
function applyTheme(t: Theme) {
  const el = document.documentElement
  own = true
  const v = t === 'system' ? hostTheme : t
  if (v) el.setAttribute('data-theme', v)
  else el.removeAttribute('data-theme')
  setTimeout(() => (own = false), 0)
}
applyTheme(readTheme())

const initial = sampleProject()

let toastTimer: number | undefined

export const useStore = create<State>((set, get) => ({
  ready: false,
  metas: [],
  project: initial,
  backgrounds: {},
  suggest: null,
  wallDetectOpen: false,
  setWallDetectOpen: (v) => set({ wallDetectOpen: v }),
  ghostBelow: false,
  setGhostBelow: (v) => set({ ghostBelow: v }),
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
    snap: true,
    spec: {},
  },
  unit: 'cm',
  viewMode: 'split',
  showZones: false,
  showDims: true,
  colorBy: 'type',
  printOpen: false,
  schrankOpen: false,
  printLists: false,
  inspectorTab: 'floor',
  theme: readTheme(),
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

  setTool: (t) => set((st) => ({ tool: t, pickerOpen: t === 'device' || t === 'cable' || t === 'opening' ? (st.tool !== t ? true : st.pickerOpen) : false })),
  select: (selection) => set({ selection }),
  setOpts: (o) => set((s) => ({ opts: { ...s.opts, ...o } })),
  setUnit: (unit) => set({ unit }),
  setViewMode: (viewMode) => set({ viewMode }),
  toggleZones: () => set((s) => ({ showZones: !s.showZones })),
  toggleDims: () => set((s) => ({ showDims: !s.showDims })),
  setColorBy: (colorBy) => set({ colorBy }),
  setSchrankOpen: (schrankOpen) => set({ schrankOpen }),
  setInspectorTab: (inspectorTab) => set({ inspectorTab }),
  setTheme: (theme) => {
    applyTheme(theme)
    try {
      localStorage.setItem('ep:theme', theme)
    } catch {
      /* ignore */
    }
    set({ theme })
  },
  addCircuit: (partial) => {
    const id = uid('c_')
    get().edit((p) => {
      p.circuits = p.circuits ?? []
      const n = p.circuits.length
      p.circuits.push({
        id,
        name: `Stromkreis ${n + 1}`,
        rating: 16,
        charac: 'B',
        phase: (['L1', 'L2', 'L3'] as const)[n % 3],
        rcd: 'FI 1 · 30 mA',
        color: CIRCUIT_COLORS[n % CIRCUIT_COLORS.length],
        ...partial,
      })
    })
    return id
  },
  addGroup: (partial) => {
    const id = uid('g_')
    get().edit((p) => {
      p.groups = p.groups ?? []
      p.groups.push({ id, name: `Gruppe ${p.groups.length + 1}`, ga: nextGA(p.groups), ...partial })
    })
    return id
  },
  addScene: () => {
    const id = uid('s_')
    get().edit((p) => {
      p.scenes = p.scenes ?? []
      const used = new Set(p.scenes.map((x) => x.no))
      let no = 1
      while (used.has(no)) no++
      p.scenes.push({ id, name: `Szene ${no}`, no, values: {} })
    })
    return id
  },
  setPrintOpen: (printOpen, lists) => set({ printOpen, printLists: !!lists }),
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
      const mk = await storage.loadBackground(p.id, f.id + '~mask')
      if (mk) backgrounds[f.id + '~mask'] = mk
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
      if (backgrounds[f.id + '~mask']) await storage.saveBackground(p.id, f.id + '~mask', backgrounds[f.id + '~mask'])
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

  addBasement: (copyWalls) => {
    const { project } = get()
    const f = newFloor(project.settings, 'Keller')
    const above = project.floors[0]
    if (copyWalls && above)
      f.walls = above.walls.map((w) => ({ ...w, id: uid('w_'), a: { ...w.a }, b: { ...w.b } }))
    get().edit((p) => {
      p.floors.unshift(f)
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
    void storage.deleteBackground(project.id, id + '~mask')
    if (activeFloorId === id) {
      const left = get().project.floors
      set({ activeFloorId: left[Math.max(0, idx - 1)].id, selection: null })
    }
  },

  setSuggest: (v) => set({ suggest: v ? { floorId: v.floorId, walls: v.walls.map((w) => ({ ...w, id: uid('w_') })) } : null }),
  dropSuggestion: (id) =>
    set((s) => (s.suggest ? { suggest: { ...s.suggest, walls: s.suggest.walls.filter((w) => w.id !== id) } } : {})),
  acceptSuggestion: () => {
    const sg = get().suggest
    if (!sg) return
    get().edit((p) => {
      const f = p.floors.find((x) => x.id === sg.floorId)
      if (f) for (const w of sg.walls) f.walls.push({ id: w.id, a: w.a, b: w.b, thickness: w.thickness, kind: w.kind })
    })
    set({ suggest: null })
    get().showToast(`${sg.walls.length} Wände übernommen`)
  },

  addSheetFloors: (items) => {
    const st = get()
    const pid = st.project.id
    const active = st.project.floors.find((f) => f.id === st.activeFloorId)
    const reuse = !!active && !active.walls.length && !active.devices.length && !active.cables.length && !active.background
    const ids: string[] = []
    const fresh = items.map((it, i) => {
      if (i === 0 && reuse && active) { ids.push(active.id); return null }
      const f = newFloor(st.project.settings, it.name)
      f.background = it.bg
      ids.push(f.id)
      return f
    })
    get().edit((p) => {
      items.forEach((it, i) => {
        const f = fresh[i]
        if (f) p.floors.push(f)
        else {
          const ex = p.floors.find((x) => x.id === ids[i])
          if (ex) { ex.name = it.name; ex.background = it.bg }
        }
      })
    })
    const bgs = { ...get().backgrounds }
    items.forEach((it, i) => {
      bgs[ids[i]] = it.dataUrl
      void storage.saveBackground(pid, ids[i], it.dataUrl)
      if (it.mask) {
        bgs[ids[i] + '~mask'] = it.mask
        void storage.saveBackground(pid, ids[i] + '~mask', it.mask)
      }
    })
    set({ backgrounds: bgs, activeFloorId: ids[0], selection: null })
    return ids
  },

  setMask: (floorId, dataUrl) => {
    const pid = get().project.id
    if (dataUrl) {
      void storage.saveBackground(pid, floorId + '~mask', dataUrl)
      set((s) => ({ backgrounds: { ...s.backgrounds, [floorId + '~mask']: dataUrl } }))
    } else {
      void storage.deleteBackground(pid, floorId + '~mask')
      set((s) => {
        const b = { ...s.backgrounds }
        delete b[floorId + '~mask']
        return { backgrounds: b }
      })
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
    void storage.deleteBackground(pid, floorId + '~mask')
    set((s) => {
      const b = { ...s.backgrounds }
      delete b[floorId]
      delete b[floorId + '~mask']
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
      } else if (selection.kind === 'dim') {
        f.dims = (f.dims ?? []).filter((d) => d.id !== selection.id)
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
