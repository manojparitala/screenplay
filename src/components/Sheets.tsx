import type { PdfSurface, Style, TextSpan } from '../core/pdf'
import { SCRIPTS } from '../core/scripts'

interface SheetRule {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface SheetData {
  spans: TextSpan[]
  rules: SheetRule[]
}

/**
 * Records the calls the PDF exporter makes, so the on-screen preview is drawn
 * from exactly the same layout as the downloaded PDF.
 */
export function recordSheets(draw: (surface: PdfSurface) => void): SheetData[] {
  const sheets: SheetData[] = [{ spans: [], rules: [] }]
  draw({
    text: (span) => {
      if (span.text) sheets[sheets.length - 1].spans.push(span)
    },
    line: (x1, y1, x2, y2) => sheets[sheets.length - 1].rules.push({ x1, y1, x2, y2 }),
    addPage: () => sheets.push({ spans: [], rules: [] }),
  })
  return sheets
}

const isBold = (s: Style) => s === 'bold' || s === 'bolditalic'
const isItalic = (s: Style) => s === 'italic' || s === 'bolditalic'

/**
 * One printed page. It is drawn as SVG in points, so every run sits on the
 * same baseline and at the same position as in the PDF. Courier runs are
 * stretched to the PDF's character width, since Courier Prime is a little wider.
 */
export function Sheet({ data, label }: { data: SheetData; label: string }) {
  return (
    <svg className="sheet" viewBox="0 0 612 792" role="img" aria-label={label} xmlSpace="preserve">
      {data.spans.map((t, i) =>
        t.script ? (
          <text
            key={i}
            x={t.x}
            y={t.y}
            className="sheet-indic"
            style={{ fontFamily: `"${SCRIPTS[t.script].family}"` }}
            fontWeight={isBold(t.style) ? 700 : undefined}
            fontStyle={isItalic(t.style) ? 'italic' : undefined}
          >
            {t.text}
          </text>
        ) : (
          <text
            key={i}
            x={t.x}
            y={t.y}
            textLength={t.width}
            lengthAdjust="spacing"
            fontWeight={isBold(t.style) ? 700 : undefined}
            fontStyle={isItalic(t.style) ? 'italic' : undefined}
          >
            {t.text}
          </text>
        ),
      )}
      {data.rules.map((r, i) => (
        <line key={`r${i}`} x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2} />
      ))}
    </svg>
  )
}
