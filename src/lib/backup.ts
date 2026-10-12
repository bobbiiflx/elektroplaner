import { get, set, del } from 'idb-keyval'
import { exportJson } from './storage'
import type { Project } from '../types'

/** Automatische Dateisicherung in einen vom Nutzer gewählten Ordner (File System Access API, Chrome/Edge). */

interface FileH {
  kind: 'file'
  name: string
  getFile(): Promise<File>
  createWritable(): Promise<{ write(d: string): Promise<void>; close(): Promise<void> }>
}
interface DirH {
  kind: 'directory'
  name: string
  queryPermission(o: { mode: 'readwrite' }): Promise<PermissionState>
  requestPermission(o: { mode: 'readwrite' }): Promise<PermissionState>
  getFileHandle(n: string, o?: { create: boolean }): Promise<FileH>
  values(): AsyncIterable<FileH | DirH>
}

const KEY = 'ep:backupDir'
const EXT = '.elektroplaner.json'

export const backupSupported = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window

export type BackupState = 'off' | 'ok' | 'needs-permission' | 'error'

export async function getFolder(): Promise<DirH | null> {
  try {
    return (await get<DirH>(KEY)) ?? null
  } catch {
    return null
  }
}

export async function chooseFolder(): Promise<DirH | null> {
  try {
    const h = await (window as unknown as { showDirectoryPicker: (o: object) => Promise<DirH> }).showDirectoryPicker({ mode: 'readwrite', id: 'elektroplaner' })
    await set(KEY, h)
    return h
  } catch {
    return null // abgebrochen
  }
}

export async function clearFolder() {
  await del(KEY)
}

export async function folderState(h: DirH | null): Promise<BackupState> {
  if (!h) return 'off'
  try {
    return (await h.queryPermission({ mode: 'readwrite' })) === 'granted' ? 'ok' : 'needs-permission'
  } catch {
    return 'error'
  }
}

/** Muss aus einem Klick heraus aufgerufen werden. */
export async function grantFolder(h: DirH): Promise<boolean> {
  try {
    return (await h.requestPermission({ mode: 'readwrite' })) === 'granted'
  } catch {
    return false
  }
}

const safeName = (n: string) => n.replace(/[^\w\-äöüÄÖÜß ]+/g, '_').trim() || 'projekt'

async function write(h: DirH, name: string, text: string) {
  const fh = await h.getFileHandle(name, { create: true })
  const w = await fh.createWritable()
  await w.write(text)
  await w.close()
}

/** Schreibt den aktuellen Stand (immer überschrieben) und je Tag eine eigene Kopie. */
export async function writeBackup(h: DirH, project: Project, backgrounds: Record<string, string>, photos: Record<string, string>): Promise<string> {
  const text = exportJson(project, backgrounds, photos)
  const base = safeName(project.name)
  await write(h, base + EXT, text)
  const day = new Date().toISOString().slice(0, 10)
  await write(h, `${base} ${day}${EXT}`, text)
  return new Date().toISOString()
}

export interface BackupFile {
  name: string
  modified: number
  size: number
  file: File
}

export async function listBackups(h: DirH): Promise<BackupFile[]> {
  const out: BackupFile[] = []
  for await (const e of h.values()) {
    if (e.kind !== 'file' || !e.name.endsWith(EXT)) continue
    const file = await e.getFile()
    out.push({ name: e.name, modified: file.lastModified, size: file.size, file })
  }
  return out.sort((a, b) => b.modified - a.modified)
}
