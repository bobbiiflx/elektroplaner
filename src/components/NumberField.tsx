import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { decimalsFor, fmtNum, fromDisplay, parseNum, toDisplay } from '../lib/units'

interface NumberFieldProps {
  value: number
  onCommit: (v: number) => void
  decimals?: number
  suffix?: string
  min?: number
  max?: number
  disabled?: boolean
  placeholder?: string
}

export function NumberField({ value, onCommit, decimals = 2, suffix, min, max, disabled, placeholder }: NumberFieldProps) {
  const [text, setText] = useState(fmtNum(value, decimals))
  const focused = useRef(false)

  useEffect(() => {
    if (!focused.current) setText(fmtNum(value, decimals))
  }, [value, decimals])

  const commit = () => {
    let n = parseNum(text)
    if (!Number.isFinite(n)) {
      setText(fmtNum(value, decimals))
      return
    }
    if (min !== undefined) n = Math.max(min, n)
    if (max !== undefined) n = Math.min(max, n)
    setText(fmtNum(n, decimals))
    if (n !== value) onCommit(n)
  }

  return (
    <label className={'field-num' + (disabled ? ' disabled' : '')}>
      <input
        inputMode="decimal"
        value={text}
        disabled={disabled}
        placeholder={placeholder}
        onFocus={(e) => {
          focused.current = true
          e.currentTarget.select()
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          focused.current = false
          commit()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') {
            setText(fmtNum(value, decimals))
            e.currentTarget.blur()
          }
          e.stopPropagation()
        }}
      />
      {suffix && <span className="suffix">{suffix}</span>}
    </label>
  )
}

interface LenFieldProps {
  mm: number
  onCommit: (mm: number) => void
  min?: number
  max?: number
  disabled?: boolean
  placeholder?: string
}

/** Längenfeld: Wert intern in mm, Anzeige in der gewählten Einheit. */
export function LenField({ mm, onCommit, min, max, disabled, placeholder }: LenFieldProps) {
  const unit = useStore((s) => s.unit)
  return (
    <NumberField
      value={toDisplay(mm, unit)}
      decimals={decimalsFor(unit)}
      suffix={unit}
      min={min !== undefined ? toDisplay(min, unit) : undefined}
      max={max !== undefined ? toDisplay(max, unit) : undefined}
      disabled={disabled}
      placeholder={placeholder}
      onCommit={(v) => onCommit(fromDisplay(v, unit))}
    />
  )
}
