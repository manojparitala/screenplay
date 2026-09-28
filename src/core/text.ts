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

/* ------------------------------------------------------------------ */
/* Characters the standard PDF fonts can draw                          */
/* ------------------------------------------------------------------ */

/** Windows-1252 characters outside Latin-1 that the standard PDF fonts include. */
const CP1252_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'

/** Letters that don't decompose into a base letter plus accents. */
const LETTER_FALLBACK: Record<string, string> = {
  Ł: 'L', ł: 'l', Đ: 'D', đ: 'd', Ħ: 'H', ħ: 'h', ı: 'i', Ŀ: 'L', ŀ: 'l', Ŋ: 'N', ŋ: 'n', Ŧ: 'T', ŧ: 't', ĸ: 'k',
  Ǥ: 'G', ǥ: 'g', Ɨ: 'I', ɨ: 'i', Ƶ: 'Z', ƶ: 'z', Ø: 'O', ø: 'o', Æ: 'AE', æ: 'ae', Œ: 'OE', œ: 'oe', ß: 'ss',
  Þ: 'Th', þ: 'th', Ð: 'D', ð: 'd', ʼ: "'", ʻ: "'", '‐': '-', '‑': '-', '‒': '-', '―': '-',
  '−': '-', '′': "'", '″': '"', '\t': ' ',
}

function inPdfCharset(ch: string): boolean {
  const c = ch.codePointAt(0)!
  return c === 0x0a || (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || CP1252_EXTRA.includes(ch)
}

/**
 * Rewrite text for the standard PDF fonts (Windows-1252). Accented letters
 * outside that set lose their accents (ő → o, Ł → L); anything else that
 * can't be drawn, such as Tamil, CJK or emoji, becomes "?" (one per
 * character), so the rest of the line still prints correctly.
 */
export function toPdfCharset(text: string): { text: string; missing: string[] } {
  let out = ''
  const missing: string[] = []
  for (const cluster of text.match(/\P{M}\p{M}*|\p{M}+/gu) ?? []) {
    if ([...cluster].every(inPdfCharset)) {
      out += cluster
      continue
    }
    const composed = cluster.normalize('NFC')
    if ([...composed].every(inPdfCharset)) {
      out += composed
      continue
    }
    const base = [...cluster.normalize('NFD').replace(/\p{M}/gu, '')].map((c) => (inPdfCharset(c) ? c : LETTER_FALLBACK[c]))
    if (base.length && base.every((c) => c !== undefined)) {
      out += base.join('')
      continue
    }
    out += '?'
    missing.push(cluster)
  }
  return { text: out, missing }
}
