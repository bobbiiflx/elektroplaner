import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { Modal } from './ui'

/** Ersetzt prompt()/confirm(), die in eingebetteten Ansichten nicht verfügbar sind. */
export default function AskDialog() {
  const ask = useStore((s) => s.ask)
  const setAsk = useStore((s) => s.setAsk)
  const [value, setValue] = useState('')
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (ask) {
      setValue(ask.initial ?? '')
      setTimeout(() => input.current?.select(), 30)
    }
  }, [ask])

  if (!ask) return null
  const close = () => setAsk(null)
  const ok = () => {
    const a = ask
    close()
    a.onOk(value.trim())
  }

  return (
    <Modal
      title={ask.title}
      width={400}
      onClose={close}
      footer={
        <>
          <button className="btn" onClick={close}>
            Abbrechen
          </button>
          <button className={'btn ' + (ask.danger ? 'danger' : 'primary')} onClick={ok}>
            {ask.okLabel ?? 'OK'}
          </button>
        </>
      }
    >
      {ask.message && <p className="muted">{ask.message}</p>}
      {ask.initial !== undefined && (
        <input
          ref={input}
          className="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') ok()
            if (e.key === 'Escape') close()
            e.stopPropagation()
          }}
        />
      )}
    </Modal>
  )
}
