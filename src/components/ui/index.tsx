import type { ChangeEvent, ReactNode } from 'react'
import { useEffect } from 'react'
import { IconX } from '../Icons'

export function Card({ children, className = '', ...rest }: { children: ReactNode; className?: string } & Record<string, unknown>) {
  return <section className={`card ${className}`} {...rest}>{children}</section>
}

export function CardHead({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="card-head">
      <div>
        <h3>{title}</h3>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {action && <div className="spacer">{action}</div>}
    </div>
  )
}

export function Stat({
  icon, label, value, hint, tone = '',
}: { icon?: ReactNode; label: string; value: string; hint?: string; tone?: '' | 'accent' | 'warm' | 'good' | 'bad' }) {
  return (
    <div className={`stat ${tone}`}>
      <div className="top">{icon}<span>{label}</span></div>
      <div className="val">{value}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  )
}

export function Field({
  label, children, hint,
}: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint && <div className="tiny faint">{hint}</div>}
    </div>
  )
}

export function TextInput({
  value, onChange, ...rest
}: { value: string; onChange: (v: string) => void } & Record<string, unknown>) {
  return (
    <input
      className="input" value={value}
      onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
      {...rest}
    />
  )
}

export function NumberInput({
  value, onChange, suffix, step = 'any', min,
}: { value: number; onChange: (v: number) => void; suffix?: string; step?: string | number; min?: number }) {
  return (
    <div className="suffixed">
      <input
        className="input" type="number" inputMode="decimal" step={step} min={min}
        value={Number.isFinite(value) ? String(value) : ''}
        onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
      />
      {suffix && <span className="suffix">{suffix}</span>}
    </div>
  )
}

export function Select<T extends string | number>({
  value, onChange, options,
}: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <select
      className="input"
      value={String(value)}
      onChange={(e) => {
        const raw = e.target.value
        const match = options.find((o) => String(o.value) === raw)
        onChange((match ? match.value : raw) as T)
      }}
    >
      {options.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
    </select>
  )
}

export function Toggle({
  checked, onChange, title, desc,
}: { checked: boolean; onChange: (v: boolean) => void; title: string; desc?: string }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="track" />
      <span className="toggle-text">
        <span className="t">{title}</span>
        {desc && <span className="d" style={{ display: 'block' }}>{desc}</span>}
      </span>
    </label>
  )
}

export function Segmented<T extends string | number>({
  value, onChange, options,
}: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="segmented" role="group">
      {options.map((o) => (
        <button
          key={String(o.value)} type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Sheet({
  title, onClose, children, action,
}: { title: string; onClose: () => void; children: ReactNode; action?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return (
    <div className="scrim" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <div className="sheet-head">
          <h2>{title}</h2>
          <div className="spacer inline">
            {action}
            <button className="btn ghost sm" onClick={onClose} aria-label="Close"><IconX size={18} /></button>
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Empty({ art, title, children }: { art: string; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="art" aria-hidden="true">{art}</div>
      <h4>{title}</h4>
      <p>{children}</p>
    </div>
  )
}

export function Bar({ value, max, warm = false }: { value: number; max: number; warm?: boolean }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return (
    <div className={`bar ${warm ? 'warm' : ''}`} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${pct}%` }} />
    </div>
  )
}
