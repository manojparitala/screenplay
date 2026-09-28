import { hasIndic, textCells, type EmMeasure } from './scripts'

/** A wrapped line, as [start, end) offsets into the source text (trailing spaces excluded). */
export interface LineRange {
  start: number
  end: number
}

/**
 * Greedy word wrap in Courier cells. Honours `\n` as a forced break and
 * hard-breaks words longer than the line width. Always returns at least one
 * line. Text in the Indic scripts is measured with `measure` (see scripts.ts);
 * everything else takes one cell per character.
 */
export function wrapText(text: string, width: number, measure?: EmMeasure): LineRange[] {
  const lines: LineRange[] = []
  const w = Math.max(1, width)
  const measured = hasIndic(text)
  let paraStart = 0
  while (paraStart <= text.length) {
    let paraEnd = text.indexOf('\n', paraStart)
    if (paraEnd === -1) paraEnd = text.length
    if (measured) wrapMeasured(text, paraStart, paraEnd, w, measure, lines)
    else wrapParagraph(text, paraStart, paraEnd, w, lines)
    paraStart = paraEnd + 1
  }
  return lines
}

function wrapParagraph(text: string, from: number, to: number, width: number, out: LineRange[]) {
  let lineStart = from
  // Skip leading spaces on wrapped continuation lines, but keep indentation on the first line.
  if (lineStart >= to) {
    out.push({ start: from, end: from })
    return
  }
  while (lineStart < to) {
    if (to - lineStart <= width) {
      out.push({ start: lineStart, end: trimEnd(text, lineStart, to) })
      return
    }
    // Find the last space within [lineStart, lineStart + width].
    let breakAt = -1
    for (let i = lineStart + width; i > lineStart; i--) {
      if (text[i] === ' ') {
        breakAt = i
        break
      }
    }
    let next: number
    if (breakAt === -1) {
      // Long word: hard break (or break after a hyphen if there is one).
      let hyphen = -1
      for (let i = lineStart + width - 1; i > lineStart; i--) {
        if (text[i] === '-') {
          hyphen = i
          break
        }
      }
      const end = hyphen !== -1 ? hyphen + 1 : lineStart + width
      out.push({ start: lineStart, end })
      next = end
    } else {
      out.push({ start: lineStart, end: trimEnd(text, lineStart, breakAt) })
      next = breakAt
    }
    while (next < to && text[next] === ' ') next++
    lineStart = next
  }
}

function trimEnd(text: string, start: number, end: number): number {
  let e = end
  while (e > start && text[e - 1] === ' ') e--
  return e
}


/* ------------------------------------------------------------------ */
/* Measured text                                                       */
/* ------------------------------------------------------------------ */

const EPS = 1e-6

interface Token {
  start: number
  end: number
  space: boolean
  width: number
}

let segmenter: Intl.Segmenter | null | undefined

/** Offsets after each user-perceived character of text[from, to). */
function graphemeEnds(text: string, from: number, to: number): number[] {
  if (segmenter === undefined) segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter() : null
  const slice = text.slice(from, to)
  if (segmenter) return Array.from(segmenter.segment(slice), (g) => from + g.index + g.segment.length)
  const ends: number[] = []
  const re = /\P{M}[\p{M}\u200c\u200d]*|[\p{M}\u200c\u200d]+/gu
  let m: RegExpExecArray | null
  while ((m = re.exec(slice))) ends.push(from + m.index + m[0].length)
  return ends
}

/** Wrap one paragraph whose width must be measured word by word. */
function wrapMeasured(text: string, from: number, to: number, width: number, measure: EmMeasure | undefined, out: LineRange[]) {
  if (from >= to) {
    out.push({ start: from, end: from })
    return
  }
  const cells = (a: number, b: number) => textCells(text.slice(a, b), measure)
  const tokens: Token[] = []
  for (let i = from; i < to; ) {
    const space = text[i] === ' '
    let j = i + 1
    while (j < to && (text[j] === ' ') === space) j++
    tokens.push({ start: i, end: j, space, width: space ? j - i : cells(i, j) })
    i = j
  }
  let k = 0
  let first = true
  while (k < tokens.length) {
    // Leading spaces are kept on a paragraph's first line (indentation) but not on wrapped lines.
    if (!first) while (k < tokens.length && tokens[k].space) k++
    if (k >= tokens.length) return
    first = false
    let used = 0
    let lastFit = -1
    let j = k
    for (; j < tokens.length; j++) {
      const t = tokens[j]
      if (t.space) {
        used += t.width
        continue
      }
      if (used + t.width > width + EPS) break
      used += t.width
      lastFit = j
    }
    if (lastFit >= 0) {
      out.push({ start: tokens[k].start, end: tokens[lastFit].end })
      k = lastFit + 1
      continue
    }
    // The first word doesn't fit: break inside it, after a hyphen if there is one.
    const word = tokens[j]
    const lead = used
    const ends = graphemeEnds(text, word.start, word.end)
    let cut = ends[0]
    let hyphen = -1
    for (const e of ends) {
      if (lead + cells(word.start, e) > width + EPS) break
      cut = e
      if (text[e - 1] === '-' && e < word.end) hyphen = e
    }
    if (hyphen !== -1) cut = hyphen
    out.push({ start: tokens[k].start, end: cut })
    if (cut >= word.end) {
      k = j + 1
    } else {
      tokens[j] = { start: cut, end: word.end, space: false, width: cells(cut, word.end) }
      k = j
    }
  }
}
