/**
 * Indian scripts the app lays out and prints with bundled fonts: Devanagari
 * (Hindi, Marathi and others), Tamil, Telugu, Kannada and Malayalam.
 *
 * Screenplay layout is measured in Courier cells (0.1in, a character of 12pt
 * Courier). Latin text keeps one cell per character. Text in these scripts is
 * set in Noto Sans at 1.6 cells per em, which is 11.52pt in the PDF and the
 * editor's own font size on screen (the editor's Courier Prime is 0.625em
 * wide), so it wraps the same everywhere. Their vowel signs reach well above
 * and below the line, so a line holding such text is 1¼ lines tall.
 */

export type IndicScript = 'devanagari' | 'tamil' | 'telugu' | 'kannada' | 'malayalam'

export interface ScriptInfo {
  id: IndicScript
  label: string
  /** CSS font family of the bundled font (see styles/fonts.css). */
  family: string
  /** A letter of the script, to ask the browser to load its font. */
  sample: string
  /** Average advance of a letter (vowel signs included) in em, for estimates. */
  em: number
}

export const SCRIPTS: Record<IndicScript, ScriptInfo> = {
  devanagari: { id: 'devanagari', label: 'Hindi (Devanagari)', family: 'Screenplay Devanagari', sample: 'क', em: 0.605 },
  tamil: { id: 'tamil', label: 'Tamil', family: 'Screenplay Tamil', sample: 'க', em: 1.186 },
  telugu: { id: 'telugu', label: 'Telugu', family: 'Screenplay Telugu', sample: 'క', em: 0.697 },
  kannada: { id: 'kannada', label: 'Kannada', family: 'Screenplay Kannada', sample: 'ಕ', em: 0.747 },
  malayalam: { id: 'malayalam', label: 'Malayalam', family: 'Screenplay Malayalam', sample: 'ക', em: 1.025 },
}

export const SCRIPT_IDS = Object.keys(SCRIPTS) as IndicScript[]

/** Courier cells per em of Indic text (11.52pt against Courier's 7.2pt cell). */
export const INDIC_EM_CELLS = 1.6

/** Height of a line holding Indic text, in lines. */
export const INDIC_LINE = 1.25

const INDIC_RE = /[ऀ-ॿ஀-ൿ]/

export function hasIndic(text: string): boolean {
  return INDIC_RE.test(text)
}

export function indicScriptOf(cp: number): IndicScript | null {
  if (cp < 0x0900 || cp > 0x0d7f) return null
  if (cp <= 0x097f) return 'devanagari'
  if (cp < 0x0b80) return null
  if (cp <= 0x0bff) return 'tamil'
  if (cp <= 0x0c7f) return 'telugu'
  if (cp <= 0x0cff) return 'kannada'
  return 'malayalam'
}

/** Scripts used anywhere in the given texts. */
export function scriptsIn(texts: Iterable<string>): Set<IndicScript> {
  const found = new Set<IndicScript>()
  for (const t of texts) {
    if (!hasIndic(t)) continue
    for (const s of segmentScripts(t)) if (s.script) found.add(s.script)
  }
  return found
}

export interface ScriptSegment {
  start: number
  end: number
  /** `null` for text set in Courier. */
  script: IndicScript | null
}

const ZWNJ = 0x200c
const ZWJ = 0x200d

/**
 * Split text into runs of each Indic script and runs of everything else.
 * Spaces, digits and punctuation go with Courier, as in the browser, where
 * Courier comes first in the font list; zero-width (non-)joiners stay with the
 * letters they sit between, since they change how those letters join.
 */
export function segmentScripts(text: string): ScriptSegment[] {
  const out: ScriptSegment[] = []
  for (let i = 0; i < text.length; ) {
    const cp = text.codePointAt(i)!
    const n = cp > 0xffff ? 2 : 1
    const last = out[out.length - 1]
    let script = indicScriptOf(cp)
    if (!script && (cp === ZWJ || cp === ZWNJ) && last?.script) script = last.script
    if (last && last.script === script) last.end = i + n
    else out.push({ start: i, end: i + n, script })
    i += n
  }
  return out
}

/* ------------------------------------------------------------------ */
/* Measuring                                                           */
/* ------------------------------------------------------------------ */

/** Advance width of text in one Indic script, in em. */
export type EmMeasure = (text: string, script: IndicScript) => number

/** Estimate from the number of letters; used until real font metrics are available. */
export function estimateEm(text: string, script: IndicScript): number {
  return text.replace(/[\p{M}‌‍]/gu, '').length * SCRIPTS[script].em
}

let active: EmMeasure = estimateEm

/** Use real font metrics (the browser's, or HarfBuzz's while exporting). `null` restores estimates. */
export function setEmMeasure(measure: EmMeasure | null) {
  active = measure ?? estimateEm
}

export function currentEmMeasure(): EmMeasure {
  return active
}

/**
 * Width of text in Courier cells: one per character outside the Indic
 * scripts (as for any Courier text), and the measured width of Indic runs.
 */
export function textCells(text: string, measure: EmMeasure = active): number {
  if (!hasIndic(text)) return text.length
  let cells = 0
  for (const s of segmentScripts(text)) cells += s.script ? measure(text.slice(s.start, s.end), s.script) * INDIC_EM_CELLS : s.end - s.start
  return cells
}

/** Height of a printed line holding this text, in lines. */
export function lineHeightOf(text: string): number {
  return hasIndic(text) ? INDIC_LINE : 1
}
