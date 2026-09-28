import { ELEMENTS, PAGE } from './elements'
import { paginate, type LayoutLine, type Pagination } from './paginate'
import { EmbeddedFont, PdfWriter, type Style } from './pdfwriter'
import { currentEmMeasure, hasIndic, INDIC_EM_CELLS, lineHeightOf, scriptsIn, segmentScripts, textCells, type EmMeasure, type IndicScript } from './scripts'
import type { Shaper } from './shaper'
import { asciiSafe, mapRunsText, toPdfCharset } from './text'
import type { ScriptElement, ScriptSettings, TitlePage } from './types'

export type { Style } from './pdfwriter'

const PT = 72
const CW = PT / PAGE.cpi // character width in points (7.2)
const LH = PT / PAGE.lpi // line height in points (12)
const LEFT = PAGE.leftIn * PT
const TOP = PAGE.topIn * PT
const RIGHT_EDGE = (PAGE.widthIn - 1) * PT
/** Baseline of a line's text, below the top of the line. */
const BASELINE = 10.2
/** Size of text in the Indic scripts: 1.6 Courier cells per em. */
export const INDIC_SIZE = CW * INDIC_EM_CELLS

/** A run of text in one font, placed on the page. Positions are in points from the top left. */
export interface TextSpan {
  text: string
  x: number
  /** Baseline. */
  y: number
  style: Style
  /** Script of the run, or `null` for Courier. */
  script: IndicScript | null
  /** Advance width as laid out. */
  width: number
}

/** Minimal drawing surface, so the same layout drives the PDF, the preview and tests. */
export interface PdfSurface {
  text(span: TextSpan): void
  line(x1: number, y1: number, x2: number, y2: number): void
  addPage(): void
}

export interface PrintOptions {
  settings: ScriptSettings
  titlePage?: TitlePage
  /**
   * `pdf` limits text to what the PDF's fonts can draw (used for downloaded
   * PDFs); `unicode` keeps every character (preview and printing, which use
   * the browser's fonts). Defaults to `unicode`.
   */
  charset?: 'pdf' | 'unicode'
  /** With `pdf`: the PDF has fonts for the Indic scripts, so keep them. */
  keepIndic?: boolean
  /** Width of Indic text; defaults to the current measure. */
  measure?: EmMeasure
}

type Clean = (text: string) => string

function cleaner(charset: PrintOptions['charset'], keepIndic = false): Clean {
  return charset === 'pdf' ? (t) => toPdfCharset(asciiSafe(t), keepIndic).text : asciiSafe
}

/** Prepare elements for printing and lay them out. */
export function paginateForPrint(
  elements: ScriptElement[],
  settings: ScriptSettings,
  charset: PrintOptions['charset'] = 'unicode',
  keepIndic = false,
  measure?: EmMeasure,
): Pagination {
  const clean = cleaner(charset, keepIndic)
  const safe = elements.map((el) => ({ ...el, runs: mapRunsText(el.runs, clean) }))
  return paginate(safe, { sceneSpacing: settings.sceneSpacing, autoContd: settings.autoContd, measure })
}

function titlePageTexts(tp: TitlePage): string[] {
  return [tp.title, tp.credit, tp.author, tp.source, tp.contact, tp.draftDate, tp.copyright]
}

function printedTexts(elements: ScriptElement[], titlePage?: TitlePage): string[] {
  const texts = elements.filter((e) => ELEMENTS[e.type].printable).flatMap((e) => e.runs.map((r) => r.text))
  if (titlePage) texts.push(...titlePageTexts(titlePage))
  return texts
}

/** Indic scripts a PDF of this script needs fonts for. */
export function pdfScripts(elements: ScriptElement[], titlePage?: TitlePage): Set<IndicScript> {
  return scriptsIn(printedTexts(elements, titlePage))
}

/** Characters a downloaded PDF can't show (they print as "?"), in order of first use. */
export function pdfUnsupportedCharacters(elements: ScriptElement[], titlePage?: TitlePage, keepIndic = false): string[] {
  const seen = new Set<string>()
  for (const t of printedTexts(elements, titlePage)) for (const ch of toPdfCharset(asciiSafe(t), keepIndic).missing) seen.add(ch)
  return [...seen]
}

/**
 * Draw text starting at x with its baseline at y, one span per script run.
 * Returns the width drawn.
 */
function drawText(s: PdfSurface, text: string, x: number, y: number, style: Style, measure?: EmMeasure): number {
  const m = measure ?? currentEmMeasure()
  let cx = x
  for (const seg of segmentScripts(text)) {
    const t = text.slice(seg.start, seg.end)
    const width = seg.script ? m(t, seg.script) * INDIC_SIZE : t.length * CW
    s.text({ text: t, x: cx, y, style, script: seg.script, width })
    cx += width
  }
  return cx - x
}

function lineCells(line: LayoutLine, measure?: EmMeasure): number {
  return line.runs.reduce((n, r) => n + textCells(r.text, measure), 0)
}

export function lineStartX(line: LayoutLine, measure?: EmMeasure): number {
  if (line.align === 'left') return LEFT + line.indent * CW
  const len = lineCells(line, measure)
  if (line.align === 'right') return LEFT + (line.indent + line.width - len) * CW
  return LEFT + (line.indent + (line.width - len) / 2) * CW
}

function drawLine(s: PdfSurface, line: LayoutLine, top: number, settings: ScriptSettings, measure?: EmMeasure) {
  let x = lineStartX(line, measure)
  const y = top + BASELINE
  const forceBold = line.type === 'scene' && settings.boldSceneHeadings
  for (const r of line.runs) {
    const bold = r.bold || forceBold
    const w = drawText(s, r.text, x, y, bold && r.italic ? 'bolditalic' : bold ? 'bold' : r.italic ? 'italic' : 'normal', measure)
    if (r.underline && r.text.trim()) {
      const uy = y + (hasIndic(r.text) ? 1.6 : 0.3)
      s.line(x, uy, x + w, uy)
    }
    x += w
  }
}

export function hasTitlePage(tp?: TitlePage): tp is TitlePage {
  return !!tp && !!(tp.title.trim() || tp.author.trim())
}

export function drawTitlePage(s: PdfSurface, tp: TitlePage, clean: Clean = asciiSafe, measure?: EmMeasure) {
  const width = (text: string) => textCells(text, measure) * CW
  let top = 3.5 * PT
  const centered = (text: string) => {
    drawText(s, text, (PAGE.widthIn * PT - width(text)) / 2, top + BASELINE, 'normal', measure)
    top += LH * lineHeightOf(text)
  }
  for (const l of clean(tp.title.toUpperCase()).split('\n')) centered(l)
  top += LH * 3
  if (tp.credit.trim()) {
    centered(clean(tp.credit.trim()))
    top += LH
  }
  for (const l of clean(tp.author).split('\n').filter((l) => l.trim())) centered(l.trim())
  if (tp.source.trim()) {
    top += LH * 2
    for (const l of clean(tp.source).split('\n')) centered(l.trim())
  }
  // Contact details bottom left, draft date and copyright bottom right, stacked up from the bottom margin.
  const bottom = (PAGE.heightIn - 1) * PT
  const stack = (lines: string[], x: (l: string) => number) => {
    let t = bottom - lines.reduce((h, l) => h + LH * lineHeightOf(l), 0)
    for (const l of lines) {
      drawText(s, l, x(l), t + BASELINE, 'normal', measure)
      t += LH * lineHeightOf(l)
    }
  }
  stack(
    clean(tp.contact)
      .split('\n')
      .filter((l) => l.trim()),
    () => LEFT,
  )
  stack(
    [tp.draftDate, tp.copyright].map((v) => clean(v.trim())).filter(Boolean),
    (l) => RIGHT_EDGE - width(l),
  )
}

/** Draw the whole screenplay onto a surface. Returns the number of pages drawn. */
export function drawScript(s: PdfSurface, elements: ScriptElement[], opts: PrintOptions): number {
  const { settings, measure } = opts
  const pagination = paginateForPrint(elements, settings, opts.charset, opts.keepIndic, measure)
  let first = true
  let count = 0
  if (settings.includeTitlePage && hasTitlePage(opts.titlePage)) {
    drawTitlePage(s, opts.titlePage, cleaner(opts.charset, opts.keepIndic), measure)
    first = false
    count++
  }
  for (const page of pagination.pages) {
    if (!first) s.addPage()
    first = false
    count++
    if (page.number > 1) {
      const num = `${page.number}.`
      drawText(s, num, RIGHT_EDGE - num.length * CW, 0.5 * PT + BASELINE, 'normal')
    }
    let top = TOP
    for (const line of page.lines) {
      if (!line) {
        top += LH
        continue
      }
      drawLine(s, line, top, settings, measure)
      if (settings.showSceneNumbers && line.sceneNumber) {
        const n = String(line.sceneNumber)
        drawText(s, n, LEFT - 0.35 * PT - n.length * CW, top + BASELINE, 'normal')
        drawText(s, n, RIGHT_EDGE + 0.15 * PT, top + BASELINE, 'normal')
      }
      top += LH * line.height
    }
  }
  return count
}

export interface PdfExport {
  blob: Blob
  /** Characters drawn as "?" because no font in the PDF has them. */
  missing: string[]
}

/**
 * Render a PDF. Latin text uses the standard Courier fonts; text in the Indic
 * scripts is shaped by `shaper` and drawn with its embedded fonts. Without a
 * shaper, those scripts print as "?".
 */
export async function exportPdf(elements: ScriptElement[], opts: PrintOptions & { shaper?: Shaper | null }): Promise<PdfExport> {
  const { shaper } = opts
  const writer = new PdfWriter({
    title: opts.titlePage?.title || 'Screenplay',
    author: opts.titlePage?.author || '',
    creator: 'Screenplay',
  })
  const fonts = new Map<IndicScript, EmbeddedFont>()
  const surface: PdfSurface = {
    text: (span) => {
      if (!span.text) return
      if (span.script && shaper) {
        let font = fonts.get(span.script)
        if (!font) fonts.set(span.script, (font = writer.embed(shaper.fontData(span.script))))
        writer.glyphs(font, shaper.shape(span.text, span.script), span.x, span.y, INDIC_SIZE, span.style)
      } else {
        writer.courier(span.text, span.x, span.y, 12, span.style)
      }
    },
    line: (x1, y1, x2, y2) => writer.line(x1, y1, x2, y2, 0.6),
    addPage: () => writer.addPage(),
  }
  writer.addPage()
  drawScript(surface, elements, { ...opts, charset: 'pdf', keepIndic: !!shaper, measure: shaper?.measure })
  const bytes = await writer.output()
  const titlePage = opts.settings.includeTitlePage ? opts.titlePage : undefined
  return {
    blob: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }),
    missing: pdfUnsupportedCharacters(elements, titlePage, !!shaper),
  }
}
