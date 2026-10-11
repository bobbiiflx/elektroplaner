import type { ReactNode } from 'react'
import { X } from 'lucide-react'

interface SegOption<T extends string> {
  value: T
  label: ReactNode
  title?: string
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: SegOption<T>[]
  onChange: (v: T) => void
}) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === value}
          className={o.value === value ? 'on' : ''}
          title={o.title}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  width = 520,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: number
}) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" style={{ width }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Schließen">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

export function Row({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="row">
      <div className="row-label">
        {label}
        {hint && <span className="hint">{hint}</span>}
      </div>
      <div className="row-ctl">{children}</div>
    </div>
  )
}

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="section">
      <div className="section-head">
        <h3>{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  )
}
