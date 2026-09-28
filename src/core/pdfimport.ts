import { uid } from './id'
import { looksLikeSceneHeading, characterName } from './scene'
import { hasIndic } from './scripts'
import { normalizeRuns, plainText } from './text'
import type { ScriptElement, TitlePage } from './types'

/**
 * Turn a laid-out screenplay (a PDF, or a plain-text file indented with
 * spaces) back into screenplay elements. Screenplay layout is regular enough
 * to classify each line from its indentation, capitals, bold and the lines
 * around it.
 */

/** One run of text as a PDF reader reports it. y grows upwards (PDF space). */
export interface PdfItem {
  str: string
  x: number
  y: number
  width: number
  height: number
  font: string
}

export interface PdfPage {
  width: number
  height: number
  items: PdfItem[]
}

interface Segment {
  text: string
  x: number
  end: number
}

/** A reconstructed line of the page. */
export interface LayoutTextLine {
  page: number
  y: number
  x: number
  /** Font size (PDF points, or 1 for plain text). */
  size: number
  text: string
  bold: boolean
  family: string
  segments: Segment[]
  /** Ends with a soft hyphen: the next line continues the word. */
  hyphen: boolean
}

export interface LayoutImport {
  titlePage: Partial<TitlePage>
  elements: ScriptElement[]
}

const SOFT_HYPHEN = /[­￾‐]$/

function fontFamily(font: string): string {
  const name = font.replace(/^[A-Z]{6}\+/, '')
  return name.split(/[-,]/)[0].replace(/(PSMT|MT|PS)$/, '')
}

function isBoldFont(font: string): boolean {
  return /bold|black|heavy|semibold|demi/i.test(font)
}

function median(values: number[]): number {
  if (!values.length) return 0
  const s = [...values].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

/* ------------------------------------------------------------------ */
/* Lines from PDF text items                                           */
/* ------------------------------------------------------------------ */

export function linesFromPdfPages(pages: PdfPage[]): { lines: LayoutTextLine[]; charWidth: number } {
  // Character width comes from Courier text; Indian scripts are set in other fonts at other widths.
  const courierLike = (it: PdfItem) => !hasIndic(it.str)
  const widths: number[] = []
  for (const p of pages)
    for (const it of p.items) {
      const t = it.str.trim()
      if (t.length >= 3 && it.width > 0 && courierLike(it)) widths.push(it.width / it.str.length)
    }
  let charWidth = median(widths) || 7.2
  const lines: LayoutTextLine[] = []

  // The script body is set in one font; web-page chrome and browser headers use others.
  // Drop those fragments before building lines, since they can share a line's height.
  // Text in Indian scripts is always kept: it is set in its own fonts next to Courier.
  const famChars = new Map<string, number>()
  for (const p of pages)
    for (const it of p.items) if (courierLike(it)) famChars.set(fontFamily(it.font), (famChars.get(fontFamily(it.font)) ?? 0) + it.str.trim().length)
  const total = [...famChars.values()].reduce((a, b) => a + b, 0)
  const [dominant, share] = [...famChars.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['', 0]
  const keep = (it: PdfItem) =>
    it.str.trim() !== '' && (!courierLike(it) || share / Math.max(1, total) < 0.6 || fontFamily(it.font) === dominant)
  const bodyWidths: number[] = []
  for (const p of pages)
    for (const it of p.items) if (keep(it) && courierLike(it) && it.str.trim().length >= 3 && it.width > 0) bodyWidths.push(it.width / it.str.length)
  charWidth = median(bodyWidths) || charWidth

  pages.forEach((page, pageIndex) => {
    const items = page.items.filter(keep).sort((a, b) => b.y - a.y || a.x - b.x)
    const rows: PdfItem[][] = []
    for (const it of items) {
      const row = rows[rows.length - 1]
      const tolerance = Math.max(1.5, (it.height || charWidth) * 0.4)
      if (row && Math.abs(row[0].y - it.y) <= tolerance) row.push(it)
      else rows.push([it])
    }
    for (const row of rows) {
      row.sort((a, b) => a.x - b.x)
      const segments: Segment[] = []
      let boldChars = 0
      let chars = 0
      const families = new Map<string, number>()
      for (const it of row) {
        const text = it.str.replace(/\s+/g, ' ')
        const n = text.replace(/\s/g, '').length
        chars += n
        if (isBoldFont(it.font)) boldChars += n
        const fam = fontFamily(it.font)
        families.set(fam, (families.get(fam) ?? 0) + n)
        const seg = segments[segments.length - 1]
        const end = it.x + it.width
        if (seg && it.x - seg.end < charWidth * 2.5) {
          const gap = it.x - seg.end
          const join = gap > charWidth * 0.3 && !seg.text.endsWith(' ') && !text.startsWith(' ') ? ' ' : ''
          seg.text += join + text
          seg.end = Math.max(seg.end, end)
        } else {
          segments.push({ text, x: it.x, end })
        }
      }
      for (const s of segments) s.text = s.text.trim()
      const kept = segments.filter((s) => s.text)
      if (!kept.length) continue
      const family = [...families.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
      const size = Math.max(...row.map((it) => it.height || 0)) || charWidth / 0.6
      lines.push(makeLine(pageIndex, row[0].y, kept, chars > 0 && boldChars / chars >= 0.5, family, size))
    }
  })
  return { lines, charWidth }
}

function makeLine(page: number, y: number, segments: Segment[], bold: boolean, family: string, size = 1): LayoutTextLine {
  let text = segments.map((s) => s.text).join(' ')
  const hyphen = SOFT_HYPHEN.test(text)
  if (hyphen) text = text.replace(SOFT_HYPHEN, '')
  // Hyphenation marks some readers leave inside words.
  text = text.replace(/[­￾]/g, '')
  return { page, y, x: segments[0].x, size, text, bold, family, segments, hyphen }
}

/* ------------------------------------------------------------------ */
/* Lines from indented plain text                                      */
/* ------------------------------------------------------------------ */

/** True when a text file looks like a laid-out screenplay (dialogue indented with spaces). */
export function looksIndented(text: string): boolean {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 20) return false
  const indented = lines.filter((l) => /^( {8,}|\t{2,})\S/.test(l)).length
  return indented / lines.length >= 0.15
}

export function linesFromText(text: string): { lines: LayoutTextLine[]; charWidth: number } {
  const lines: LayoutTextLine[] = []
  let page = 0
  let y = 0
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const parts = raw.split('\f')
    parts.forEach((part, k) => {
      if (k > 0) {
        page++
        y = 0
      }
      y -= 1
      const expanded = part.replace(/\t/g, '    ')
      if (!expanded.trim()) return
      const segments: Segment[] = []
      const re = /\S+(?: \S+)*/g
      let m: RegExpExecArray | null
      while ((m = re.exec(expanded))) segments.push({ text: m[0], x: m.index, end: m.index + m[0].length })
      // Words separated by one space belong together; wider gaps split segments.
      lines.push(makeLine(page, y, segments, false, 'text'))
    })
  }
  return { lines, charWidth: 1 }
}

/* ------------------------------------------------------------------ */
/* Classification                                                      */
/* ------------------------------------------------------------------ */

interface BodyLine {
  text: string
  col: number
  /** Vertical position in line heights (larger is higher on the page). */
  row: number
  bold: boolean
  /** Vertical distance from the previous line, in line heights. */
  gap: number
  pageBreak: boolean
  hyphen: boolean
  page: number
  /** A scene number was printed beside this line. */
  numbered: boolean
}

const SCENE_NUMBER = /^[A-Z]{0,2}\d{1,4}[A-Z]{0,3}\.?$/
const MARGIN_MARK = /^([A-Z]{0,2}\d{1,4}[A-Z]{0,3}\.?|\*+|[a-z]{1,2}\d{1,3}[a-z]?)$/
const JUNK = [
  /^\(?\s*more\s*\)?$/i,
  /^\(?\s*continued\s*\)?\s*:?$/i,
  /^\(?\s*cont(inued)?['’]?d?\s*\)?\s*:?$/i,
  /^end of (file|script)$/i,
  /^\d{1,2}\/\d{1,2}\/\d{2,4}(\s+\S+)?$/,
  /^(pages?\s.*)?(deleted|omitted|omit)\.?$/i,
]

function hasLower(t: string): boolean {
  return /\p{Ll}/u.test(t)
}

/** Letters of scripts without capitals (Tamil, Devanagari…), where any line could be a cue. */
function hasCaseless(t: string): boolean {
  return /\p{Lo}/u.test(t)
}

/** Written in capitals, as cues and headings are (text in scripts without capitals counts too). */
function isUpper(t: string): boolean {
  return /[\p{Lu}\p{Lo}]/u.test(t) && !hasLower(t)
}

function hasCased(t: string): boolean {
  return /[\p{Lu}\p{Ll}]/u.test(t)
}

/** Reads like speech or action rather than a cue or heading. */
function isProse(t: string): boolean {
  return hasLower(t) || hasCaseless(t)
}

function isCueText(t: string): boolean {
  const bare = t.replace(/\([^)]*\)/g, '').replace(/\^$/, '').trim()
  return bare.length > 0 && bare.length <= 40 && isUpper(bare) && !/[.!?:;]$/.test(bare) && !/^(INT|EXT)\b/.test(bare)
}

function cleanCue(t: string): string {
  return t
    .replace(/\(\s*cont(inued|['’]?d)?\.?\s*\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

function cleanHeading(t: string): string {
  return t
    .replace(/^\s*[A-Z]{0,2}\d{1,4}[A-Z]{0,3}\.?\s+(?=\S)/, (m) => (/^\s*(INT|EXT)/.test(m) ? m : ''))
    .replace(/\s+[A-Z]{0,2}\d{1,4}[A-Z]{0,3}\.?\s*\**$/, '')
    .replace(/\s*\*+$/, '')
    .trim()
}

function isTransition(t: string, col: number): boolean {
  if (!isUpper(t)) return false
  if (/\bTO:$/.test(t)) return col >= 25 || col <= 3
  return /^(FADE OUT|FADE TO BLACK|CUT TO BLACK|SMASH CUT|IRIS OUT)\.?$/.test(t) && col >= 25
}

/** Page geometry shared by every line: where action starts and how tall a line is. */
/** Where a line's text starts, ignoring a scene number printed in the left margin. */
function bodyX(l: LayoutTextLine): number {
  return l.segments.length > 1 && SCENE_NUMBER.test(l.segments[0].text) ? l.segments[1].x : l.x
}

function geometry(lines: LayoutTextLine[], charWidth: number) {
  const cols = new Map<number, number>()
  for (const l of lines) {
    const c = Math.round(bodyX(l) / charWidth)
    cols.set(c, (cols.get(c) ?? 0) + 1)
  }
  const threshold = lines.length * 0.08
  const common = [...cols.entries()].filter(([, n]) => n >= threshold).map(([c]) => c)
  const leftCol = common.length ? Math.min(...common) : Math.min(...cols.keys())
  const diffs: number[] = []
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].page === lines[i - 1].page) {
      const d = lines[i - 1].y - lines[i].y
      if (d > 0.01) diffs.push(d)
    }
  }
  // Screenplays are single-spaced, so a line is about one font size tall. Measured
  // spacing is used when available; the font size keeps a script whose paragraphs
  // are all one line long (every gap a blank line) from being misread.
  const fontSize = median(lines.map((l) => l.size)) || 1
  const single = diffs.filter((d) => d <= fontSize * 1.5)
  const lineHeight = median(single) || fontSize
  return { leftX: leftCol * charWidth, lineHeight }
}

/** Remove headers, footers, page numbers and other furniture repeated on many pages. */
function stripFurniture(lines: LayoutTextLine[], pageHeights: number[] | null): LayoutTextLine[] {
  const pages = new Set(lines.map((l) => l.page)).size
  const seen = new Map<string, Set<number>>()
  const norm = (t: string) => t.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim()
  for (const l of lines) {
    const k = norm(l.text)
    if (!seen.has(k)) seen.set(k, new Set())
    seen.get(k)!.add(l.page)
  }
  const pageTop = new Map<number, number>()
  const pageBottom = new Map<number, number>()
  for (const l of lines) {
    pageTop.set(l.page, Math.max(pageTop.get(l.page) ?? -Infinity, l.y))
    pageBottom.set(l.page, Math.min(pageBottom.get(l.page) ?? Infinity, l.y))
  }
  return lines.filter((l) => {
    if (JUNK.some((re) => re.test(l.text.trim()))) return false
    const repeated = (seen.get(norm(l.text))?.size ?? 0) >= Math.max(3, pages * 0.25)
    if (!repeated) return true
    // A character who speaks at the top of many pages is not a running header,
    // and neither is a scene heading (numbered in the margin, or INT./EXT.).
    if (isCueText(l.text) && !/\d/.test(l.text)) return true
    if (l.segments.length > 1 && SCENE_NUMBER.test(l.segments[0].text)) return true
    if (looksLikeSceneHeading(l.text) || /^(INT|EXT)\b/.test(l.text)) return true
    // Only lines at the very top or bottom of a page count as headers and footers,
    // so a character who speaks on every page is never mistaken for one.
    const h = pageHeights?.[l.page]
    if (h) return !(l.y > h * 0.88 || l.y < h * 0.12)
    return !(l.y === pageTop.get(l.page) || l.y === pageBottom.get(l.page))
  })
}

/**
 * Some scripts set two columns side by side (picture on the left, narration
 * on the right). Split such rows so each column reads as its own line.
 */
function splitColumns(lines: LayoutTextLine[], leftX: number, charWidth: number): LayoutTextLine[] {
  const out: LayoutTextLine[] = []
  for (const l of lines) {
    const segs = l.segments
    const cut = segs.findIndex(
      (s, k) =>
        k > 0 &&
        s.x - segs[k - 1].end > charWidth * 6 &&
        !MARGIN_MARK.test(s.text) &&
        !(k === 1 && segs[0].x < leftX - charWidth && SCENE_NUMBER.test(segs[0].text)),
    )
    if (cut <= 0) {
      out.push(l)
      continue
    }
    const left = segs.slice(0, cut)
    const right = segs.slice(cut)
    out.push({ ...l, segments: left, x: left[0].x, text: left.map((s) => s.text).join(' '), hyphen: false })
    out.push({ ...l, segments: right, x: right[0].x, text: right.map((s) => s.text).join(' ') })
  }
  return out
}

function parseTitleBlock(lines: BodyLine[]): Partial<TitlePage> {
  const tp: Partial<TitlePage> = {}
  const centered = lines.filter((l) => l.col >= 8)
  const left = lines.filter((l) => l.col < 8)
  if (!centered.length) return tp
  const texts = centered.map((l) => l.text.trim())
  // Adjacent means the next centered line sits directly below (no blank line between).
  const adjacent = (k: number) => k > 0 && centered[k - 1].page === centered[k].page && centered[k - 1].row - centered[k].row < 1.6
  const isDate = (t: string) => /\b(19|20)\d{2}\b|\bdraft\b|\brevision\b/i.test(t) && t.length < 40
  let i = 0
  const title: string[] = [texts[i++]]
  while (i < texts.length && adjacent(i) && !/^(written|screenplay|story|teleplay|by)\b/i.test(texts[i])) title.push(texts[i++])
  tp.title = title.join(' ')
  const credit: string[] = []
  while (i < texts.length && /^(written|screenplay|story|teleplay|original|by)\b/i.test(texts[i]) && credit.join(' ').length < 30) {
    credit.push(texts[i++])
    if (/\bby$/i.test(credit[credit.length - 1])) break
  }
  if (credit.length) tp.credit = credit.join(' ')
  if (i < texts.length && !isDate(texts[i])) tp.author = texts[i++]
  while (i < texts.length && adjacent(i) && !isDate(texts[i]) && /^(and|&)\s|^[A-Z][a-z]+ [A-Z]/.test(texts[i]) && !/,$/.test(texts[i])) tp.author += `\n${texts[i++]}`
  const rest = texts.slice(i)
  const source = rest.filter((t) => /^based on/i.test(t))
  if (source.length) tp.source = source.join('\n')
  const contact = [...rest.filter((t) => !/^based on/i.test(t)), ...left.map((l) => l.text.trim())]
  const date = contact.find(isDate)
  if (date) tp.draftDate = date
  const others = contact.filter((t) => t !== date)
  if (others.length) tp.contact = others.join('\n')
  return tp
}

export function classifyLayout(raw: LayoutTextLine[], charWidth: number, pageHeights: number[] | null = null): LayoutImport {
  if (!raw.length) return { titlePage: {}, elements: [] }

  // The script body is set in one font; web-page chrome and browser headers use others.
  // Lines in Indian scripts are set in their own fonts and always kept.
  const famChars = new Map<string, number>()
  for (const l of raw) if (!hasIndic(l.text)) famChars.set(l.family, (famChars.get(l.family) ?? 0) + l.text.length)
  const total = [...famChars.values()].reduce((a, b) => a + b, 0)
  const [dominant, share] = [...famChars.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['', 0]
  let lines = total && share / total >= 0.6 ? raw.filter((l) => hasIndic(l.text) || l.family === dominant) : raw
  lines = stripFurniture(lines, pageHeights)
  if (!lines.length) return { titlePage: {}, elements: [] }

  const { leftX, lineHeight } = geometry(lines, charWidth)
  const body: BodyLine[] = []
  let prev: LayoutTextLine | null = null
  for (const l of splitColumns(lines, leftX, charWidth)) {
    let segs = l.segments
    // Scene numbers and revision marks printed in the margins. A scene number
    // beside a line marks it as a scene heading.
    let numbered = false
    if (segs.length > 1 && segs[0].x < leftX - charWidth && SCENE_NUMBER.test(segs[0].text)) {
      segs = segs.slice(1)
      numbered = true
    }
    if (segs.length > 1 && MARGIN_MARK.test(segs[segs.length - 1].text) && segs[segs.length - 1].x > segs[0].x + charWidth * 30) {
      if (SCENE_NUMBER.test(segs[segs.length - 1].text)) numbered = true
      segs = segs.slice(0, -1)
    }
    const x = segs[0].x
    const col = Math.round((x - leftX) / charWidth)
    const text = l.segments === segs ? l.text : segs.map((s) => s.text).join(' ')
    // Anything well left of the text column is page chrome (sidebars, margin notes).
    if (col < -3) continue
    // Lone marks in the right margin (page ids, scene numbers, asterisks).
    if (col > 55 && MARGIN_MARK.test(text.trim())) continue
    const pageBreak = !!prev && prev.page !== l.page
    const gap = prev && !pageBreak ? (prev.y - l.y) / lineHeight : pageBreak ? 1 : 99
    body.push({ text: text.trim(), col, row: l.y / lineHeight, bold: l.bold, gap, pageBreak, hyphen: l.hyphen, page: l.page, numbered })
    prev = l
  }

  // Title page: either a whole first page without scenes, or the centered block before the first scene.
  let titlePage: Partial<TitlePage> = {}
  const isHeadingStart = (b: BodyLine) => b.col <= 3 && (b.numbered || looksLikeSceneHeading(b.text) || /^(INT|EXT)\b/.test(b.text) || SCENE_NUMBER.test(b.text))
  const firstPageLines = body.filter((b) => b.page === body[0].page)
  const pagesInBody = new Set(body.map((b) => b.page)).size
  // A title page has no scenes and no paragraphs of prose.
  const prose = (b: BodyLine) => b.col <= 3 && hasLower(b.text) && b.text.length > 45
  let start = 0
  if (pagesInBody > 1 && !firstPageLines.some(isHeadingStart) && !firstPageLines.some(prose) && firstPageLines.length <= 30) {
    titlePage = parseTitleBlock(firstPageLines)
    start = firstPageLines.length
  } else {
    let k = 0
    while (k < body.length && body[k].col >= 8 && !isHeadingStart(body[k])) k++
    if (k >= 2) {
      titlePage = parseTitleBlock(body.slice(0, k))
      start = k
    }
  }

  const elements: ScriptElement[] = []
  const last = () => elements[elements.length - 1]
  const push = (el: ScriptElement) => elements.push(el)
  const append = (el: ScriptElement, text: string, sep: string) => {
    const before = plainText(el)
    // A word hyphenated at the end of a typed line ("ter-" / "rible") is rejoined.
    if (sep === ' ' && /\p{Ll}{2}-$/u.test(before) && /^\p{Ll}/u.test(text)) {
      el.runs = normalizeRuns([{ text: before.slice(0, -1) + text }])
      return
    }
    el.runs = normalizeRuns([...el.runs, { text: sep + text }])
  }
  let state: 'none' | 'dialogue' = 'none'
  let pendingNumber = false
  let speaker = ''
  let prevHyphen = false
  let openParen = false
  let dialogueCol = -1
  /** Column of the current speech's cue. */
  let cueCol = -1

  const next = (i: number) => body[i + 1]

  for (let i = start; i < body.length; i++) {
    const b = body[i]
    const t = b.text
    const hy = prevHyphen
    prevHyphen = b.hyphen
    const sep = hy ? '' : ' '

    // A lone scene number: the next line is that scene's heading.
    if (b.col <= 3 && SCENE_NUMBER.test(t)) {
      pendingNumber = true
      state = 'none'
      continue
    }

    if (b.col <= 3 && (looksLikeSceneHeading(t) || /^(INT|EXT)\b/.test(t) || ((pendingNumber || b.numbered) && isUpper(t) && t.length <= 70))) {
      pendingNumber = false
      state = 'none'
      speaker = ''
      let heading = cleanHeading(t)
      // A heading that runs on ("INT. STATION -" / "CORRIDOR - DAY", or a numbered
      // shot description wrapped over lines) continues on the next capitalised line.
      for (let k = 0; k < 2; k++) {
        const n = next(i)
        if (!n || n.col > 3 || n.gap >= 1.6 || n.pageBreak || !isUpper(n.text) || /[.!?:]$/.test(heading) || SCENE_NUMBER.test(n.text)) break
        if (looksLikeSceneHeading(n.text) || /^(INT|EXT)\b/.test(n.text)) break
        heading = `${heading} ${cleanHeading(n.text)}`
        i++
      }
      push({ type: 'scene', id: uid(), runs: normalizeRuns([{ text: heading.toUpperCase() }]) })
      continue
    }
    pendingNumber = false

    if (isTransition(t, b.col)) {
      state = 'none'
      push({ type: 'transition', runs: [{ text: t }] })
      continue
    }

    // Inside a speech: parentheticals and dialogue lines. A blank line followed by more
    // text in the same column is a new paragraph of the same speech.
    // Without capitals to go by (Tamil, Hindi…), a new cue inside a speech is told by its indent.
    const cueAhead = isCueText(t) && (hasCased(t) || Math.abs(b.col - cueCol) <= 3) && next(i) && next(i).col >= 5 && next(i).gap < 1.6
    const newParagraph = b.gap >= 1.6 && b.gap < 2.6 && Math.abs(b.col - dialogueCol) <= 2 && isProse(t) && last()?.type === 'dialogue'
    if (state === 'dialogue' && b.col >= 5 && (b.gap < 1.6 || newParagraph) && !cueAhead) {
      if (newParagraph) {
        append(last(), t, '\n')
        prevHyphen = b.hyphen
        continue
      }
      let rest = t
      if (openParen) {
        const close = rest.indexOf(')')
        const part = close === -1 ? rest : rest.slice(0, close + 1)
        append(last(), part, sep)
        if (close !== -1) openParen = false
        rest = close === -1 ? '' : rest.slice(close + 1).trim()
      } else if (rest.startsWith('(')) {
        const close = rest.indexOf(')')
        const part = close === -1 ? rest : rest.slice(0, close + 1)
        push({ type: 'parenthetical', runs: [{ text: part }] })
        openParen = close === -1
        rest = close === -1 ? '' : rest.slice(close + 1).trim()
      }
      if (rest) {
        const l = last()
        if (l && l.type === 'dialogue') append(l, rest, sep)
        else push({ type: 'dialogue', runs: [{ text: rest }] })
        dialogueCol = b.col
      }
      continue
    }
    openParen = false

    // Character cue: capitals, indented, followed by an indented line of speech.
    const n = next(i)
    if (b.col >= 8 && isCueText(t) && n && n.col >= 5 && n.gap < 1.6 && (isProse(n.text) || n.text.startsWith('('))) {
      const cue = cleanCue(t)
      const name = characterName(cue)
      const l = last()
      const continuing = /cont/i.test(t) && name === speaker && l && (l.type === 'dialogue' || l.type === 'parenthetical')
      state = 'dialogue'
      if (!continuing) push({ type: 'character', runs: [{ text: cue }] })
      speaker = name
      cueCol = b.col
      continue
    }
    state = 'none'

    // Indented text outside dialogue: title cards, THE END, and the like.
    if (b.col >= 10) {
      const l = last()
      if (l && l.type === 'centered' && b.gap < 1.6) append(l, t, '\n')
      else push({ type: 'centered', runs: [{ text: t }] })
      continue
    }

    // Action: consecutive lines form one paragraph, even across a page break mid-sentence.
    const l = last()
    const continues =
      l && l.type === 'action' && ((!b.pageBreak && b.gap < 1.6) || (b.pageBreak && !/[.!?:"'’”)\]]$/.test(plainText(l)) && /^\p{Ll}/u.test(t)))
    if (continues) append(l, t, sep)
    else push({ type: 'action', runs: [{ text: t }] })
  }

  return { titlePage, elements: elements.filter((e) => plainText(e).trim() || e.type === 'scene') }
}

/** Parse a plain-text screenplay laid out with spaces. */
export function parseIndentedText(text: string): LayoutImport {
  const { lines, charWidth } = linesFromText(text)
  return classifyLayout(lines, charWidth)
}

/** Parse pages of text extracted from a screenplay PDF. */
export function parsePdfPages(pages: PdfPage[]): LayoutImport {
  const { lines, charWidth } = linesFromPdfPages(pages)
  return classifyLayout(
    lines,
    charWidth,
    pages.map((p) => p.height),
  )
}
