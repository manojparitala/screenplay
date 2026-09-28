import { ELEMENTS, PAGE } from './elements'
import { paginate, type LayoutLine, type Pagination } from './paginate'
import { asciiSafe, mapRunsText, toPdfCharset } from './text'
import type { ScriptElement, ScriptSettings, TitlePage } from './types'

const PT = 72
const CW = PT / PAGE.cpi // character width in points (7.2)
const LH = PT / PAGE.lpi // line height in points (12)
const LEFT = PAGE.leftIn * PT
const TOP = PAGE.topIn * PT
const RIGHT_EDGE = (PAGE.widthIn - 1) * PT

type Style = 'normal' | 'bold' | 'italic' | 'bolditalic'

/** Minimal drawing surface so layout can be tested without a real PDF library. */
export interface PdfSurface {
  setFont(style: Style): void
  text(text: string, x: number, y: number): void
  line(x1: number, y1: number, x2: number, y2: number): void
  addPage(): void
}

export interface PrintOptions {
  settings: ScriptSettings
  titlePage?: TitlePage
  /**
   * `pdf` limits text to what the standard PDF Courier font can draw (used for
   * downloaded PDFs); `unicode` keeps every character (preview and printing,
   * which use the browser's fonts). Defaults to `unicode`.
   */
  charset?: 'pdf' | 'unicode'
}

type Clean = (text: string) => string

function cleaner(charset: PrintOptions['charset']): Clean {
  return charset === 'pdf' ? (t) => toPdfCharset(asciiSafe(t)).text : asciiSafe
}

/** Prepare elements for printing in Courier and lay them out. */
export function paginateForPrint(elements: ScriptElement[], settings: ScriptSettings, charset: PrintOptions['charset'] = 'unicode'): Pagination {
  const clean = cleaner(charset)
  const safe = elements.map((el) => ({ ...el, runs: mapRunsText(el.runs, clean) }))
  return paginate(safe, { sceneSpacing: settings.sceneSpacing, autoContd: settings.autoContd })
}

/** Characters a downloaded PDF can't show (they print as "?"), in order of first use. */
export function pdfUnsupportedCharacters(elements: ScriptElement[], titlePage?: TitlePage): string[] {
  const seen = new Set<string>()
  const texts = elements.filter((e) => ELEMENTS[e.type].printable).flatMap((e) => e.runs.map((r) => r.text))
  if (titlePage) texts.push(titlePage.title, titlePage.credit, titlePage.author, titlePage.source, titlePage.contact, titlePage.draftDate, titlePage.copyright)
  for (const t of texts) for (const ch of toPdfCharset(asciiSafe(t)).missing) seen.add(ch)
  return [...seen]
}

export function lineStartX(line: LayoutLine): number {
  const len = line.runs.reduce((n, r) => n + r.text.length, 0)
  if (line.align === 'right') return LEFT + (line.indent + line.width - len) * CW
  if (line.align === 'center') return LEFT + (line.indent + (line.width - len) / 2) * CW
  return LEFT + line.indent * CW
}

function drawLine(s: PdfSurface, line: LayoutLine, y: number, settings: ScriptSettings) {
  let x = lineStartX(line)
  const forceBold = line.type === 'scene' && settings.boldSceneHeadings
  for (const r of line.runs) {
    const bold = r.bold || forceBold
    s.setFont(bold && r.italic ? 'bolditalic' : bold ? 'bold' : r.italic ? 'italic' : 'normal')
    s.text(r.text, x, y)
    const w = r.text.length * CW
    if (r.underline && r.text.trim()) s.line(x, y + LH - 1.5, x + w, y + LH - 1.5)
    x += w
  }
}

export function hasTitlePage(tp?: TitlePage): tp is TitlePage {
  return !!tp && !!(tp.title.trim() || tp.author.trim())
}

export function drawTitlePage(s: PdfSurface, tp: TitlePage, clean: Clean = asciiSafe) {
  const centered = (text: string, y: number) => {
    s.text(text, (PAGE.widthIn * PT - text.length * CW) / 2, y)
  }
  let y = 3.5 * PT
  s.setFont('normal')
  for (const l of clean(tp.title.toUpperCase()).split('\n')) {
    centered(l, y)
    y += LH
  }
  y += LH * 3
  if (tp.credit.trim()) {
    centered(clean(tp.credit.trim()), y)
    y += LH * 2
  }
  for (const l of clean(tp.author).split('\n').filter((l) => l.trim())) {
    centered(l.trim(), y)
    y += LH
  }
  if (tp.source.trim()) {
    y += LH * 2
    for (const l of clean(tp.source).split('\n')) {
      centered(l.trim(), y)
      y += LH
    }
  }
  const bottom = (PAGE.heightIn - 1) * PT
  const contact = clean(tp.contact).split('\n').filter((l) => l.trim())
  contact.forEach((l, k) => s.text(l, LEFT, bottom - (contact.length - k) * LH))
  const right = [tp.draftDate, tp.copyright].map((v) => clean(v.trim())).filter(Boolean)
  right.forEach((l, k) => s.text(l, RIGHT_EDGE - l.length * CW, bottom - (right.length - k) * LH))
}

/** Draw the whole screenplay onto a surface. Returns the number of pages drawn. */
export function drawScript(s: PdfSurface, elements: ScriptElement[], opts: PrintOptions): number {
  const { settings } = opts
  const pagination = paginateForPrint(elements, settings, opts.charset)
  let first = true
  let count = 0
  if (settings.includeTitlePage && hasTitlePage(opts.titlePage)) {
    drawTitlePage(s, opts.titlePage, cleaner(opts.charset))
    first = false
    count++
  }
  for (const page of pagination.pages) {
    if (!first) s.addPage()
    first = false
    count++
    s.setFont('normal')
    if (page.number > 1) {
      const num = `${page.number}.`
      s.text(num, RIGHT_EDGE - num.length * CW, 0.5 * PT)
    }
    page.lines.forEach((line, k) => {
      if (!line) return
      const y = TOP + k * LH
      drawLine(s, line, y, settings)
      if (settings.showSceneNumbers && line.sceneNumber) {
        s.setFont('normal')
        const n = String(line.sceneNumber)
        s.text(n, LEFT - 0.35 * PT - n.length * CW, y)
        s.text(n, RIGHT_EDGE + 0.15 * PT, y)
      }
    })
  }
  return count
}

/** Render a PDF using jsPDF (loaded on demand). */
export async function exportPdf(elements: ScriptElement[], opts: PrintOptions): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'letter', compress: true })
  doc.setProperties({
    title: opts.titlePage?.title || 'Screenplay',
    author: opts.titlePage?.author || '',
    creator: 'Screenplay',
  })
  doc.setFontSize(12)
  doc.setLineWidth(0.6)
  const surface: PdfSurface = {
    setFont: (style) => doc.setFont('courier', style),
    text: (text, x, y) => {
      if (text) doc.text(text, x, y, { baseline: 'top' })
    },
    line: (x1, y1, x2, y2) => doc.line(x1, y1, x2, y2),
    addPage: () => doc.addPage('letter', 'portrait'),
  }
  drawScript(surface, elements, { ...opts, charset: 'pdf' })
  return doc.output('blob')
}
