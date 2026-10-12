import { cableType, deviceType } from '../config/catalog'
import type { Project } from '../types'
import { cableLengths } from './geom'
import { loggiaNotes, roofIssues } from './roof'
import { evaluate } from './vde'
import { roomIssues } from './rooms'

export type Selectable = { kind: 'device' | 'cable'; id: string }
export interface PlanCheck {
  level: 'warn' | 'info'
  text: string
  floorId?: string
  target?: Selectable
}

const hasRcd30 = (rcd: string) => /30\s*mA/i.test(rcd)

/** Projektweite Prüfungen (vereinfacht, ersetzt keine Prüfung nach VDE 0100 durch eine Elektrofachkraft). */
export function planChecks(project: Project): PlanCheck[] {
  const out: PlanCheck[] = []
  const circuits = project.circuits ?? []

  // Stromkreise: FI/RCD, Überlast
  for (const c of circuits) {
    let sockets = 0
    let watts = 0
    let count = 0
    for (const f of project.floors)
      for (const d of f.devices)
        if (d.circuitId === c.id) {
          count++
          watts += d.powerW ?? 0
          if (deviceType(d.typeId).category === 'power') sockets++
        }
    if (!count) continue
    if (!c.rcd.trim()) out.push({ level: 'warn', text: `${c.name}: kein FI/RCD zugeordnet (Steckdosen ≤ 20 A brauchen RCD ≤ 30 mA)` })
    else if (sockets && !hasRcd30(c.rcd)) out.push({ level: 'warn', text: `${c.name}: Steckdosen ohne RCD 30 mA (${c.rcd})` })
    if (watts > c.rating * 230) out.push({ level: 'warn', text: `${c.name}: Summenleistung ${Math.round(watts)} W übersteigt ${c.rating} A (${c.rating * 230} W)` })
  }

  for (const i of roomIssues(project)) out.push({ level: 'warn', text: i.text, floorId: i.floorId })

  for (const f of project.floors) {
    // Dachschräge
    for (const i of roofIssues(f)) out.push({ level: 'warn', text: `${f.name}: ${i.text}`, floorId: f.id, target: { kind: i.kind, id: i.id } })

    // Loggia: RCD 30 mA am Stromkreis
    for (const n of loggiaNotes(f)) {
      const d = f.devices.find((x) => x.id === n.id)
      const c = d?.circuitId ? circuits.find((x) => x.id === d.circuitId) : undefined
      if (d && !(c && hasRcd30(c.rcd))) out.push({ level: 'warn', text: `${f.name}: Gerät in der Loggia ohne Stromkreis mit RCD 30 mA`, floorId: f.id, target: { kind: 'device', id: d.id } })
    }

    // Leitungen: Spannungsfall, Strombelastbarkeit, Abschaltbedingung
    for (const cb of f.cables) {
      const ct = cableType(cb.typeId)
      if (ct.category !== 'power' || !ct.crossSection || !ct.phases) continue
      const r = evaluate(
        { lengthM: cableLengths(cb.points).total / 1000, fuseA: cb.fuseA, crossSection: ct.crossSection, phases: ct.phases, method: cb.method, charac: cb.charac },
        project.settings.vde,
      )
      const t = { kind: 'cable' as const, id: cb.id }
      if (!r.ampacityOk) out.push({ level: 'warn', text: `${f.name}: ${ct.name} – Sicherung ${cb.fuseA} A über der Strombelastbarkeit`, floorId: f.id, target: t })
      if (!r.dropOk) out.push({ level: 'warn', text: `${f.name}: ${ct.name} – Spannungsfall ${r.dropPct.toFixed(1).replace('.', ',')} %`, floorId: f.id, target: t })
      if (!r.loopOk) out.push({ level: 'warn', text: `${f.name}: ${ct.name} – Abschaltbedingung nicht erfüllt (max. ${r.maxLenLoopM.toFixed(0)} m)`, floorId: f.id, target: t })
    }
  }
  return out
}
