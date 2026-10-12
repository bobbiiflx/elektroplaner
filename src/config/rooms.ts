import type { Project, RoomType } from '../types'

/**
 * Soll-Ausstattung je Raumart (Steckdosen = Einzel-Steckdosen, Lichtauslässe).
 * Richtwerte angelehnt an die Mindestausstattung nach DIN 18015-2; in der App je Raumart anpassbar.
 */
export const ROOM_TYPES: { id: RoomType; label: string; sockets: number; lights: number }[] = [
  { id: 'living', label: 'Wohnzimmer', sockets: 5, lights: 2 },
  { id: 'dining', label: 'Esszimmer / Essplatz', sockets: 3, lights: 1 },
  { id: 'bedroom', label: 'Schlafzimmer', sockets: 3, lights: 1 },
  { id: 'kids', label: 'Kinderzimmer', sockets: 3, lights: 1 },
  { id: 'office', label: 'Arbeitszimmer', sockets: 4, lights: 1 },
  { id: 'kitchen', label: 'Küche', sockets: 5, lights: 2 },
  { id: 'bath', label: 'Bad', sockets: 2, lights: 2 },
  { id: 'wc', label: 'WC', sockets: 1, lights: 1 },
  { id: 'hall', label: 'Flur / Diele', sockets: 1, lights: 1 },
  { id: 'utility', label: 'Hauswirtschaftsraum', sockets: 3, lights: 1 },
  { id: 'storage', label: 'Abstellraum', sockets: 1, lights: 1 },
  { id: 'cellar', label: 'Keller / Technik', sockets: 1, lights: 1 },
  { id: 'balcony', label: 'Balkon / Loggia / Terrasse', sockets: 1, lights: 1 },
  { id: 'other', label: 'Sonstiger Raum', sockets: 1, lights: 1 },
]
export function roomReq(project: Pick<Project, 'roomReq'>, t: RoomType): { sockets: number; lights: number } {
  const d = ROOM_TYPES.find((x) => x.id === t) ?? ROOM_TYPES[ROOM_TYPES.length - 1]
  return project.roomReq?.[t] ?? { sockets: d.sockets, lights: d.lights }
}
