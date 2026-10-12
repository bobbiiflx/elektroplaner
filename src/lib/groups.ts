import { deviceType, kindOf } from '../config/catalog'
import type { Device, Floor, Group, Project } from '../types'

export type Role = 'sender' | 'receiver'

/** Sender = Taster/Sensoren, Empfänger = Leuchten und Lasten. */
export function roleOf(d: Device): Role | null {
  const k = kindOf(deviceType(d.typeId))
  if (k === 'sensor') return 'sender'
  if (k === 'light' || k === 'load') return 'receiver'
  return null
}

/** Kann das Gerät überhaupt in KNX-Gruppen sein? (KNX-Last/-Leuchte oder KNX-Sensor/-Taster) */
export function canJoinGroups(d: Device): boolean {
  const dt = deviceType(d.typeId)
  const k = kindOf(dt)
  if (k === 'sensor') return dt.category === 'knx' || dt.category === 'switch'
  if (k === 'light' || k === 'load') return d.control === 'knx'
  return false
}

export interface Member {
  device: Device
  floor: Floor
  role: Role
}

export function groupMembers(project: Project, gid: string): Member[] {
  const out: Member[] = []
  for (const floor of project.floors)
    for (const device of floor.devices) {
      if (!device.groupIds?.includes(gid)) continue
      const role = roleOf(device)
      if (role) out.push({ device, floor, role })
    }
  return out
}

export interface GroupStats {
  senders: number
  receivers: number
  watts: number
  /** none = keine Leuchte dimmbar, all = alle Leuchten dimmbar, mixed = gemischt */
  dim: 'none' | 'all' | 'mixed'
  warnings: string[]
}

export function groupStats(project: Project, g: Group): GroupStats {
  const ms = groupMembers(project, g.id)
  const rec = ms.filter((m) => m.role === 'receiver')
  const lights = rec.filter((m) => kindOf(deviceType(m.device.typeId)) === 'light')
  const dimN = lights.filter((m) => m.device.dimmable).length
  const dim: GroupStats['dim'] = dimN === 0 ? 'none' : dimN === lights.length ? 'all' : 'mixed'
  const types = new Set(lights.filter((m) => m.device.dimmable).map((m) => m.device.dimType ?? '?'))
  const warnings: string[] = []
  if (!ms.some((m) => m.role === 'sender')) warnings.push('Kein Taster oder Sensor zugeordnet')
  if (!rec.length) warnings.push('Keine Leuchte oder Last zugeordnet')
  if (dim === 'mixed') warnings.push('Gemischt dimmbar und nicht dimmbar – Dimmen betrifft nur einen Teil')
  if (types.size > 1) warnings.push('Verschiedene Dimmarten in einer Gruppe')
  if (!g.ga.trim()) warnings.push('Gruppenadresse fehlt')
  return { senders: ms.length - rec.length, receivers: rec.length, watts: rec.reduce((s, m) => s + (m.device.powerW ?? 0), 0), dim, warnings }
}

const GA_RE = /^\d{1,2}\/\d{1,2}\/\d{1,3}$/
export const isValidGA = (s: string) => !s.trim() || GA_RE.test(s.trim())

/** Alle vergebenen Gruppenadressen (Schalten/Dimmen/Wert/Status). */
export function allGAs(groups: Group[]): string[] {
  return groups.flatMap((g) => [g.ga, g.gaDim, g.gaValue, g.gaStatus]).filter((x): x is string => !!x && !!x.trim()).map((x) => x.trim())
}

/** Doppelt vergebene Gruppenadressen. */
export function duplicateGAs(groups: Group[]): Set<string> {
  const seen = new Set<string>()
  const dup = new Set<string>()
  for (const a of allGAs(groups)) (seen.has(a) ? dup : seen).add(a)
  return dup
}

/** Nächste freie Adresse im Schema Haupt/Mittel/n (Standard 1/0/n). */
export function nextGA(groups: Group[], main = 1, mid = 0): string {
  const used = new Set(allGAs(groups))
  for (let n = 0; n < 256; n++) {
    const a = `${main}/${mid}/${n}`
    if (!used.has(a)) return a
  }
  return ''
}

/** Entfernt Gruppe aus allen Geräten und Szenen. */
export function removeGroup(p: Project, id: string) {
  p.groups = (p.groups ?? []).filter((g) => g.id !== id)
  for (const f of p.floors)
    for (const d of f.devices)
      if (d.groupIds?.includes(id)) {
        d.groupIds = d.groupIds.filter((x) => x !== id)
        if (!d.groupIds.length) delete d.groupIds
      }
  for (const sc of p.scenes ?? []) delete sc.values[id]
}
