// Zuordnung der Produkt-Icons (freigestellte PNGs in src/assets/icons) zu Geräte- und Leitungstypen.
// Ohne Eintrag zeichnet die App ein vereinfachtes Ersatz-Icon. Nicht verwendete Icons liegen in
// src/assets/icons/unused (siehe manifest.json) und sind hier bewusst nicht eingebunden.
import lPendel from '../assets/icons/l-pendel.png'
import lSpot from '../assets/icons/l-spot.png'
import lWand from '../assets/icons/l-wand.png'
import lAussen from '../assets/icons/l-aussen.png'
import lSchiene from '../assets/icons/l-schiene.png'
import lBild from '../assets/icons/l-bild.png'
import lRgb from '../assets/icons/l-rgb.png'
import lDecke from '../assets/icons/l-decke.png'
import lPanel from '../assets/icons/l-panel.png'
import lFeucht from '../assets/icons/l-feucht.png'
import lFeuchtQ from '../assets/icons/l-feucht-q.png'
import aDecke from '../assets/icons/a-decke.png'
import aWand from '../assets/icons/a-wand.png'
import knxBm from '../assets/icons/knx-bm.png'
import knxPm from '../assets/icons/knx-pm.png'
import dimmT from '../assets/icons/dimm-t.png'
import dimmD from '../assets/icons/dimm-d.png'
import sd4 from '../assets/icons/sd-4.png'
import sdHerd from '../assets/icons/sd-herd.png'
import pin from '../assets/icons/pin.png'
import bell from '../assets/icons/bell.png'
import ev from '../assets/icons/ev.png'
import poe from '../assets/icons/poe.png'
import kabAus from '../assets/icons/kab-aus.png'
import cam from '../assets/icons/cam.png'
import nfc from '../assets/icons/nfc.png'
import cat from '../assets/icons/cat-kabel.png'
import disp from '../assets/icons/disp.png'
import doseAb from '../assets/icons/dose-ab.png'
import eth1 from '../assets/icons/eth-1.png'
import eth2 from '../assets/icons/eth-2.png'
import knx4 from '../assets/icons/knx-4.png'
import knxBus from '../assets/icons/knx-bus.png'
import sw2 from '../assets/icons/sw-2.png'
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
  'l-pendel': lPendel,
  'l-spot': lSpot,
  'l-wand': lWand,
  'l-aussen': lAussen,
  'l-schiene': lSchiene,
  'l-bild': lBild,
  'l-rgb': lRgb,
  'l-decke': lDecke,
  'l-panel': lPanel,
  'l-feucht': lFeucht,
  'l-feucht-q': lFeuchtQ,
  'a-decke': aDecke,
  'a-wand': aWand,
  'knx-bm': knxBm,
  'knx-pm': knxPm,
  'dimm-t': dimmT,
  'dimm-d': dimmD,
  'sd-4': sd4,
  'sd-herd': sdHerd,
  'pin': pin,
  'bell': bell,
  'ev': ev,
  'poe': poe,
  'kab-aus': kabAus,
  'cam': cam,
  'nfc': nfc,
  'eth-1': eth1,
  'eth-2': eth2,
  'knx-4': knx4,
  'sw-2': sw2,
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
  knx: knxBus,
  'rohr-m25': rohr,
}
