import { AMPACITY } from '../config/catalog'
import type { Characteristic, InstallMethod, VdeSettings } from '../types'

export interface VdeInput {
  lengthM: number
  fuseA: number
  crossSection: number // mm²
  phases: 1 | 3
  method: InstallMethod
  charac: Characteristic
}

export interface VdeResult {
  dropPct: number
  dropOk: boolean
  maxLenDropM: number // max. Länge für den eingestellten Spannungsfall-Grenzwert
  ampacity: number | null // Iz in A
  ampacityOk: boolean
  loopOhm: number // Schleifenimpedanz bis zum Leitungsende
  loopMaxOhm: number
  loopOk: boolean
  maxLenLoopM: number // max. Länge für die Abschaltbedingung
  maxLenM: number // das strengere der beiden
}

const U0 = 230

/** Belastete Adern: einphasig = 2, dreiphasig = 3 (symmetrische Last, N unbelastet). */
export function ampacityOf(crossSection: number, method: InstallMethod, phases: 1 | 3): number | null {
  const row = AMPACITY[method]?.[crossSection]
  if (!row) return null
  return phases === 1 ? row[0] : row[1]
}

/** Spannungsfall in Prozent der Nennspannung. */
export function voltageDropPct(i: VdeInput, vde: VdeSettings): number {
  const k = vde.kappa
  const factor = i.phases === 1 ? 2 : Math.sqrt(3)
  const un = i.phases === 1 ? 230 : 400
  const du = (factor * i.lengthM * i.fuseA * vde.cosPhi) / (k * i.crossSection)
  return (du / un) * 100
}

export function evaluate(i: VdeInput, vde: VdeSettings): VdeResult {
  const k = vde.kappa
  const factor = i.phases === 1 ? 2 : Math.sqrt(3)
  const un = i.phases === 1 ? 230 : 400

  const dropPct = voltageDropPct(i, vde)
  const maxLenDropM = ((vde.dropLimitPct / 100) * un * k * i.crossSection) / (factor * i.fuseA * vde.cosPhi)

  const iz = ampacityOf(i.crossSection, i.method, i.phases)
  const ampacityOk = iz !== null && i.fuseA <= iz

  // Abschaltbedingung (vereinfacht): Zs ≤ U0 / Ia, Ia = 5·In (B) bzw. 10·In (C).
  // Schleife L + PE: 2 · L / (κ · A), PE mit gleichem Querschnitt.
  const ia = (i.charac === 'B' ? 5 : 10) * i.fuseA
  const loopMaxOhm = U0 / ia
  const loopOhm = vde.sourceImpedance + (2 * i.lengthM) / (k * i.crossSection)
  const maxLenLoopM = Math.max(0, ((loopMaxOhm - vde.sourceImpedance) * k * i.crossSection) / 2)

  return {
    dropPct,
    dropOk: dropPct <= vde.dropLimitPct,
    maxLenDropM,
    ampacity: iz,
    ampacityOk,
    loopOhm,
    loopMaxOhm,
    loopOk: loopOhm <= loopMaxOhm,
    maxLenLoopM,
    maxLenM: Math.min(maxLenDropM, maxLenLoopM),
  }
}
