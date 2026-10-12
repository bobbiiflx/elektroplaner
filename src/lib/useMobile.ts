import { useSyncExternalStore } from 'react'

/** Handy-Ansicht: schmaler Bildschirm (Hochformat) oder flaches Touch-Gerät (Querformat). */
const QUERY = '(max-width: 700px), (max-height: 480px) and (pointer: coarse)'

function subscribe(cb: () => void) {
  const mq = window.matchMedia(QUERY)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}
const snapshot = () => window.matchMedia(QUERY).matches

export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false)
}
