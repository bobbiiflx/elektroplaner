// Zuordnung der Produkt-Icons (freigestellte PNGs in src/assets/icons) zu Geräte- und Leitungstypen.
// Ohne Eintrag zeichnet die App ein vereinfachtes Ersatz-Icon. Nicht verwendete Icons liegen in
// src/assets/icons/unused (siehe manifest.json) und sind hier bewusst nicht eingebunden.
import cat from '../assets/icons/cat-kabel.png'
import disp from '../assets/icons/disp.png'
import doseAb from '../assets/icons/dose-ab.png'
import eth1 from '../assets/icons/eth-1.png'
import knxTs from '../assets/icons/knx-ts.png'
import nym3 from '../assets/icons/nym-3adrig.png'
import nym5 from '../assets/icons/nym-5adrig.png'
import rohr from '../assets/icons/rohr-flex.png'
import sd1 from '../assets/icons/sd-1.png'
import sd2 from '../assets/icons/sd-2.png'
import sd3 from '../assets/icons/sd-3.png'
import sw1 from '../assets/icons/sw-1.png'
import swJal from '../assets/icons/sw-jal.png'
import uv from '../assets/icons/uv.png'

export const DEVICE_IMG: Record<string, string> = {
  'sd-1': sd1,
  'sd-2': sd2,
  'sd-3': sd3,
  'sw-1': sw1,
  'sw-w': sw1, // Wechselschalter sieht von vorn aus wie der Ausschalter
  'sw-jal': swJal,
  'eth-1': eth1,
  'knx-ts': knxTs,
  disp,
  'dose-ab': doseAb,
  uv,
}

export const CABLE_IMG: Record<string, string> = {
  'nym-3x1.5': nym3,
  'nym-3x2.5': nym3,
  'nym-5x1.5': nym5,
  'nym-5x2.5': nym5,
  'nym-5x4': nym5,
  'nym-5x6': nym5,
  'nym-5x10': nym5,
  cat7: cat,
  'rohr-m25': rohr,
}
