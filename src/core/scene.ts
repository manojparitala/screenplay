export interface SceneHeadingParts {
  /** Normalised prefix such as "INT." or "EXT." ('' if missing). */
  prefix: string
  intExt: 'INT' | 'EXT' | 'INT/EXT' | 'OTHER'
  location: string
  time: string
}

const PREFIX_RE = /^(INT\.?\s*\/\s*EXT\.?|EXT\.?\s*\/\s*INT\.?|I\s*\/\s*E\.?|INT\.|EXT\.|EST\.|INT(?=\s)|EXT(?=\s)|EST(?=\s))\s*/i

/** True when the text starts like a scene heading (used by Fountain detection). */
export function looksLikeSceneHeading(text: string): boolean {
  return /^(INT|EXT|EST|INT\.?\/EXT|EXT\.?\/INT|I\/E)[.\s]/i.test(text.trim())
}

export function parseSceneHeading(raw: string): SceneHeadingParts {
  const text = raw.trim().toUpperCase().replace(/\s+#[^#]*#\s*$/, '')
  const m = text.match(PREFIX_RE)
  let prefix = ''
  let intExt: SceneHeadingParts['intExt'] = 'OTHER'
  let rest = text
  if (m) {
    const p = m[1].replace(/\s+/g, '')
    rest = text.slice(m[0].length)
    if (/^(INT\.?\/EXT|EXT\.?\/INT|I\/E)/.test(p)) {
      intExt = 'INT/EXT'
      prefix = p.startsWith('I/E') ? 'I/E.' : p.startsWith('EXT') ? 'EXT./INT.' : 'INT./EXT.'
    } else if (p.startsWith('INT')) {
      intExt = 'INT'
      prefix = 'INT.'
    } else if (p.startsWith('EXT')) {
      intExt = 'EXT'
      prefix = 'EXT.'
    } else {
      prefix = 'EST.'
      intExt = 'EXT'
    }
  }
  let location = rest.trim()
  let time = ''
  const dash = location.match(/^(.*\S)\s+[-–—]+\s*([^-–—]*)$/)
  if (dash) {
    location = dash[1].trim()
    time = dash[2].trim()
  } else if (/\s[-–—]+$/.test(location)) {
    location = location.replace(/\s[-–—]+$/, '').trim()
  }
  return { prefix, intExt, location, time }
}

/** Character cue without extensions: "JOHN (V.O.)" -> "JOHN". */
export function characterName(cue: string): string {
  return cue
    .toUpperCase()
    .replace(/\^\s*$/, '')
    .replace(/\s*\([^)]*\)?/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The "(V.O.)"-style extensions of a character cue, excluding CONT'D. */
export function characterExtensions(cue: string): string[] {
  const out: string[] = []
  for (const m of cue.matchAll(/\(([^)]*)\)/g)) {
    const ext = m[1].trim().toUpperCase()
    if (ext && !/^CONT['’]?D$/.test(ext)) out.push(ext)
  }
  return out
}

export function hasContd(cue: string): boolean {
  return /\(\s*CONT['’]?D\s*\)/i.test(cue)
}
