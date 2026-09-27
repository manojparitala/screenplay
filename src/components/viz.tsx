import { useEffect, useRef, useState, type FocusEvent, type PointerEvent, type ReactNode, type RefObject } from 'react'

interface Tip {
  x: number
  y: number
  content: ReactNode
}

/** One hover/focus tooltip shared by every chart on a page. */
export function useTooltip() {
  const [tip, setTip] = useState<Tip | null>(null)
  const bind = (content: ReactNode) => ({
    onPointerMove: (e: PointerEvent) => setTip({ x: e.clientX, y: e.clientY, content }),
    onPointerLeave: () => setTip(null),
    onFocus: (e: FocusEvent) => {
      const r = (e.currentTarget as Element).getBoundingClientRect()
      setTip({ x: r.right, y: r.bottom, content })
    },
    onBlur: () => setTip(null),
  })
  const node = tip ? (
    <div
      className="viz-tooltip"
      style={{ left: Math.max(8, Math.min(tip.x + 14, window.innerWidth - 270)), top: Math.min(tip.y + 14, window.innerHeight - 110) }}
      role="tooltip"
    >
      {tip.content}
    </div>
  ) : null
  return { bind, node, hide: () => setTip(null) }
}

/** Width of an element, kept up to date as it resizes. */
export function useWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver((entries) => setWidth(Math.floor(entries[0].contentRect.width)))
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  return [ref, width]
}

/** Categorical series colours (fixed order; see styles/app.css .viz-root). */
export const SERIES = Array.from({ length: 8 }, (_, i) => `var(--series-${i + 1})`)

/** Sequential ramp, low → high. */
export const RAMP = Array.from({ length: 4 }, (_, i) => `var(--ramp-${i + 1})`)
