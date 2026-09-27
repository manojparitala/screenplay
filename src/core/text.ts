import type { ScriptElement, TextRun } from './types'

export function plainText(el: Pick<ScriptElement, 'runs'>): string {
  let s = ''
  for (const r of el.runs) s += r.text
  return s
}

export function runsFromText(text: string): TextRun[] {
  return text ? [{ text }] : []
}

function sameStyle(a: TextRun, b: TextRun): boolean {
  return !!a.bold === !!b.bold && !!a.italic === !!b.italic && !!a.underline === !!b.underline
}

/** Merge adjacent runs with identical styling and drop empty runs. */
export function normalizeRuns(runs: TextRun[]): TextRun[] {
  const out: TextRun[] = []
  for (const r of runs) {
    if (!r.text) continue
    const last = out[out.length - 1]
    if (last && sameStyle(last, r)) last.text += r.text
    else {
      const copy: TextRun = { text: r.text }
      if (r.bold) copy.bold = true
      if (r.italic) copy.italic = true
      if (r.underline) copy.underline = true
      out.push(copy)
    }
  }
  return out
}

/** Slice styled runs by character offsets of their concatenated text. */
export function sliceRuns(runs: TextRun[], start: number, end: number): TextRun[] {
  const out: TextRun[] = []
  let pos = 0
  for (const r of runs) {
    const rEnd = pos + r.text.length
    if (rEnd > start && pos < end) {
      const s = Math.max(start, pos) - pos
      const e = Math.min(end, rEnd) - pos
      out.push({ ...r, text: r.text.slice(s, e) })
    }
    pos = rEnd
    if (pos >= end) break
  }
  return normalizeRuns(out)
}

export function mapRunsText(runs: TextRun[], fn: (s: string) => string): TextRun[] {
  return runs.map((r) => ({ ...r, text: fn(r.text) }))
}

export function countWords(text: string): number {
  const m = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)
  return m ? m.length : 0
}

/** Replace typographic characters the standard PDF Courier font can't render reliably. */
export function asciiSafe(text: string): string {
  return text
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[—]/g, '--')
    .replace(/[–]/g, '-')
    .replace(/…/g, '...')
    .replace(/ /g, ' ')
}
