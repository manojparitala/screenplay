import type { CSSProperties } from 'react'
import type { PdfSurface } from '../core/pdf'

type Style = 'normal' | 'bold' | 'italic' | 'bolditalic'

interface SheetText {
  text: string
  x: number
  y: number
  style: Style
}

interface SheetRule {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface SheetData {
  texts: SheetText[]
  rules: SheetRule[]
}

/**
 * Records the calls the PDF exporter makes, so the on-screen preview is drawn
 * from exactly the same layout as the downloaded PDF.
 */
export function recordSheets(draw: (surface: PdfSurface) => void): SheetData[] {
  const sheets: SheetData[] = [{ texts: [], rules: [] }]
  let style: Style = 'normal'
  draw({
    setFont: (s) => {
      style = s
    },
    text: (text, x, y) => {
      if (text) sheets[sheets.length - 1].texts.push({ text, x, y, style })
    },
    line: (x1, y1, x2, y2) => sheets[sheets.length - 1].rules.push({ x1, y1, x2, y2 }),
    addPage: () => sheets.push({ texts: [], rules: [] }),
  })
  return sheets
}

const pt = (v: number) => `calc(var(--sheet-scale, 1) * ${v}pt)`

export function Sheet({ data, label }: { data: SheetData; label: string }) {
  return (
    <div className="sheet" aria-label={label} role="img">
      {data.texts.map((t, i) => {
        const style: CSSProperties = { left: pt(t.x), top: pt(t.y) }
        if (t.style === 'bold' || t.style === 'bolditalic') style.fontWeight = 700
        if (t.style === 'italic' || t.style === 'bolditalic') style.fontStyle = 'italic'
        return (
          <span key={i} className="sheet-line" style={style}>
            {t.text}
          </span>
        )
      })}
      {data.rules.map((r, i) => (
        <span
          key={`r${i}`}
          style={{ position: 'absolute', left: pt(r.x1), top: pt(r.y1), width: pt(r.x2 - r.x1), borderTop: '0.6pt solid currentColor' }}
        />
      ))}
    </div>
  )
}
