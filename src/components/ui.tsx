import { X } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode, type TextareaHTMLAttributes, type InputHTMLAttributes } from 'react'
import { SCENE_COLORS, type SceneColor } from '../core/types'
import { useApp } from '../store/app'

/* ------------------------------------------------------------------ */
/* Modal                                                               */
/* ------------------------------------------------------------------ */

export function Modal(props: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const { title, onClose, children, footer, wide } = props
  const titleId = useId()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    const first = ref.current?.querySelector<HTMLElement>('input, textarea, select, button:not(.modal-close)')
    first?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      prev?.focus?.()
    }
  }, [onClose])
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref}>
        <div className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <button className="icon-btn modal-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Dropdown menu                                                       */
/* ------------------------------------------------------------------ */

export function Menu(props: { trigger: (open: boolean, toggle: () => void) => ReactNode; children: (close: () => void) => ReactNode; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <div className="menu-wrap" ref={ref}>
      {props.trigger(open, () => setOpen((o) => !o))}
      {open && (
        <div className="menu" role="menu" style={props.align === 'left' ? { left: 0, right: 'auto' } : undefined}>
          {props.children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Inputs that keep local state while focused and commit as you type    */
/* ------------------------------------------------------------------ */

function useCommittedValue(value: string, onCommit: (v: string) => void, delay: number) {
  const [local, setLocal] = useState(value)
  const focused = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef(value)
  const commitRef = useRef(onCommit)
  commitRef.current = onCommit

  useEffect(() => {
    if (!focused.current) setLocal(value)
    latest.current = value
  }, [value])

  const flush = (v: string) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    if (v !== latest.current) {
      latest.current = v
      commitRef.current(v)
    }
  }

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  return {
    value: local,
    onFocus: () => {
      focused.current = true
    },
    onBlur: () => {
      focused.current = false
      flush(local)
    },
    onChange: (v: string) => {
      setLocal(v)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => flush(v), delay)
    },
  }
}

type TextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & {
  value: string
  onCommit: (v: string) => void
}

export function LazyTextarea({ value, onCommit, onBlur, onFocus, ...rest }: TextareaProps) {
  const c = useCommittedValue(value, onCommit, 300)
  return (
    <textarea
      {...rest}
      value={c.value}
      onFocus={(e) => {
        c.onFocus()
        onFocus?.(e)
      }}
      onBlur={(e) => {
        c.onBlur()
        onBlur?.(e)
      }}
      onChange={(e) => c.onChange(e.target.value)}
    />
  )
}

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string
  onCommit: (v: string) => void
}

export function LazyInput({ value, onCommit, onBlur, onFocus, ...rest }: InputProps) {
  const c = useCommittedValue(value, onCommit, 300)
  return (
    <input
      {...rest}
      value={c.value}
      onFocus={(e) => {
        c.onFocus()
        onFocus?.(e)
      }}
      onBlur={(e) => {
        c.onBlur()
        onBlur?.(e)
      }}
      onChange={(e) => c.onChange(e.target.value)}
    />
  )
}

/* ------------------------------------------------------------------ */
/* Scene colours                                                       */
/* ------------------------------------------------------------------ */

export function colorVar(color: SceneColor | null | undefined): string | undefined {
  return color ? `var(--c-${color})` : undefined
}

export function ColorPicker(props: { value: SceneColor | null; onChange: (c: SceneColor | null) => void }) {
  return (
    <div className="color-picker" role="radiogroup" aria-label="Scene colour">
      <button
        type="button"
        className={`color-swatch none${props.value ? '' : ' selected'}`}
        aria-label="No colour"
        role="radio"
        aria-checked={!props.value}
        onClick={() => props.onChange(null)}
      />
      {SCENE_COLORS.map((c) => (
        <button
          type="button"
          key={c}
          className={`color-swatch${props.value === c ? ' selected' : ''}`}
          style={{ ['--dot' as string]: `var(--c-${c})` }}
          aria-label={c}
          role="radio"
          aria-checked={props.value === c}
          onClick={() => props.onChange(c)}
        />
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Toasts                                                              */
/* ------------------------------------------------------------------ */

export function Toasts() {
  const toasts = useApp((s) => s.toasts)
  const dismiss = useApp((s) => s.dismissToast)
  if (!toasts.length) return null
  return (
    <div className="toasts no-print" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          <p>{t.message}</p>
          {t.action && (
            <button
              className="btn small toast-action"
              onClick={() => {
                dismiss(t.id)
                t.action!.run()
              }}
            >
              {t.action.label}
            </button>
          )}
          <button className="icon-btn small" onClick={() => dismiss(t.id)} aria-label="Dismiss">
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const AVATAR_COLORS = ['--c-blue', '--c-teal', '--c-purple', '--c-orange', '--c-green', '--c-pink', '--c-red', '--c-yellow']

export function avatarColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return `var(${AVATAR_COLORS[h % AVATAR_COLORS.length]})`
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase()
}

export function timeAgo(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} hr ago`
  const d = Math.round(h / 24)
  if (d < 7) return `${d} day${d === 1 ? '' : 's'} ago`
  return new Date(ts).toLocaleDateString()
}

export function formatRuntime(pages: number): string {
  const mins = Math.round(pages)
  if (mins < 60) return `${mins} min`
  return `${Math.floor(mins / 60)} h ${mins % 60} min`
}
