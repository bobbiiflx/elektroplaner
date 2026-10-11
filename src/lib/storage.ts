import { get, set, del } from 'idb-keyval'
import type { Project, ProjectMeta } from '../types'

const INDEX_KEY = 'ep:index'
const projKey = (id: string) => `ep:proj:${id}`
const bgKey = (pid: string, fid: string) => `ep:bg:${pid}:${fid}`

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    console.warn('Speicherzugriff fehlgeschlagen', e)
    return fallback
  }
}

export async function listProjects(): Promise<ProjectMeta[]> {
  return safe(async () => (await get<ProjectMeta[]>(INDEX_KEY)) ?? [], [])
}

async function writeIndex(metas: ProjectMeta[]) {
  await set(INDEX_KEY, metas)
}

export async function saveProject(p: Project): Promise<void> {
  await safe(async () => {
    await set(projKey(p.id), p)
    const metas = (await get<ProjectMeta[]>(INDEX_KEY)) ?? []
    const meta: ProjectMeta = { id: p.id, name: p.name, updatedAt: p.updatedAt }
    const i = metas.findIndex((m) => m.id === p.id)
    if (i >= 0) metas[i] = meta
    else metas.push(meta)
    await writeIndex(metas)
  }, undefined)
}

export async function loadProject(id: string): Promise<Project | null> {
  return safe(async () => (await get<Project>(projKey(id))) ?? null, null)
}

export async function saveBackground(pid: string, fid: string, dataUrl: string): Promise<void> {
  await safe(() => set(bgKey(pid, fid), dataUrl), undefined)
}

export async function loadBackground(pid: string, fid: string): Promise<string | null> {
  return safe(async () => (await get<string>(bgKey(pid, fid))) ?? null, null)
}

export async function deleteBackground(pid: string, fid: string): Promise<void> {
  await safe(() => del(bgKey(pid, fid)), undefined)
}

export async function deleteProject(p: Project): Promise<void> {
  await safe(async () => {
    await del(projKey(p.id))
    for (const f of p.floors) await del(bgKey(p.id, f.id))
    const metas = ((await get<ProjectMeta[]>(INDEX_KEY)) ?? []).filter((m) => m.id !== p.id)
    await writeIndex(metas)
  }, undefined)
}

// --- Export / Import -------------------------------------------------------

interface ExportFile {
  app: 'elektroplaner'
  version: 1
  project: Project
  backgrounds: Record<string, string>
}

export function exportJson(project: Project, backgrounds: Record<string, string>): string {
  const bg: Record<string, string> = {}
  for (const f of project.floors) if (backgrounds[f.id]) bg[f.id] = backgrounds[f.id]
  const file: ExportFile = { app: 'elektroplaner', version: 1, project, backgrounds: bg }
  return JSON.stringify(file)
}

export function parseImport(text: string): { project: Project; backgrounds: Record<string, string> } {
  const data = JSON.parse(text) as Partial<ExportFile>
  if (data.app !== 'elektroplaner' || !data.project || !Array.isArray(data.project.floors)) {
    throw new Error('Keine gültige Elektroplaner-Datei')
  }
  return { project: data.project, backgrounds: data.backgrounds ?? {} }
}
