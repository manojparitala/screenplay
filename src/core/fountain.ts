import { uid } from './id'
import { looksLikeSceneHeading } from './scene'
import { normalizeRuns, plainText } from './text'
import { emptyTitlePage, type ScriptElement, type TextRun, type TitlePage } from './types'

/* ------------------------------------------------------------------ */
/* Inline emphasis                                                     */
/* ------------------------------------------------------------------ */

/** Parse Fountain emphasis (***bold italic***, **bold**, *italic*, _underline_) into runs. */
export function parseEmphasis(input: string): TextRun[] {
  const runs: TextRun[] = []
  const state = { bold: false, italic: false, underline: false }
  let buf = ''
  const flush = () => {
    if (!buf) return
    const r: TextRun = { text: buf }
    if (state.bold) r.bold = true
    if (state.italic) r.italic = true
    if (state.underline) r.underline = true
    runs.push(r)
    buf = ''
  }
  // Only treat a marker as emphasis if it has a matching closer later on the same line.
  const hasCloser = (from: number, marker: string) => {
    const nl = input.indexOf('\n', from)
    const end = nl === -1 ? input.length : nl
    let idx = input.indexOf(marker, from)
    while (idx !== -1 && idx < end) {
      if (input[idx - 1] !== '\\') return true
      idx = input.indexOf(marker, idx + 1)
    }
    return false
  }
  let i = 0
  while (i < input.length) {
    const c = input[i]
    if (c === '\\' && i + 1 < input.length && '*_\\('.includes(input[i + 1])) {
      buf += input[i + 1]
      i += 2
      continue
    }
    if (c === '*') {
      const n = input.startsWith('***', i) ? 3 : input.startsWith('**', i) ? 2 : 1
      const marker = '*'.repeat(n)
      const opening = n === 3 ? !(state.bold && state.italic) : n === 2 ? !state.bold : !state.italic
      if (!opening || hasCloser(i + n, marker)) {
        flush()
        if (n === 3) {
          state.bold = opening
          state.italic = opening
        } else if (n === 2) state.bold = opening
        else state.italic = opening
        i += n
        continue
      }
    }
    if (c === '_') {
      if (state.underline || hasCloser(i + 1, '_')) {
        flush()
        state.underline = !state.underline
        i++
        continue
      }
    }
    buf += c
    i++
  }
  flush()
  return normalizeRuns(runs)
}

function escapeEmphasis(text: string): string {
  return text.replace(/([\\*_])/g, '\\$1')
}

/** Serialize runs back to Fountain emphasis markup. */
export function emphasisToFountain(runs: TextRun[]): string {
  let out = ''
  for (const r of runs) {
    // Keep markers on each line so emphasis never spans a line break.
    const parts = r.text.split('\n')
    out += parts
      .map((p) => {
        if (!p) return p
        let s = escapeEmphasis(p)
        const lead = s.match(/^\s*/)![0]
        const trail = s.match(/\s*$/)![0]
        s = s.trim()
        if (!s) return p
        if (r.underline) s = `_${s}_`
        if (r.bold && r.italic) s = `***${s}***`
        else if (r.bold) s = `**${s}**`
        else if (r.italic) s = `*${s}*`
        return lead + s + trail
      })
      .join('\n')
  }
  return out
}

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

export interface FountainDocument {
  titlePage: Partial<TitlePage>
  elements: ScriptElement[]
}

const TITLE_KEYS: Record<string, keyof TitlePage> = {
  title: 'title',
  credit: 'credit',
  author: 'author',
  authors: 'author',
  source: 'source',
  'draft date': 'draftDate',
  date: 'draftDate',
  contact: 'contact',
  copyright: 'copyright',
  notes: 'notes',
}

function isUpperCue(line: string): boolean {
  const withoutExt = line.replace(/\([^)]*\)/g, '').replace(/\^\s*$/, '')
  return /\p{Lu}/u.test(withoutExt) && withoutExt === withoutExt.toUpperCase()
}

function parseTitlePage(lines: string[]): { titlePage: Partial<TitlePage>; consumed: number } {
  const titlePage: Partial<TitlePage> = {}
  if (!lines.length || !/^[A-Za-z][A-Za-z ]*:/.test(lines[0])) return { titlePage, consumed: 0 }
  const first = lines[0].match(/^([A-Za-z][A-Za-z ]*):/)
  if (!first || !(first[1].toLowerCase() in TITLE_KEYS)) return { titlePage, consumed: 0 }
  let i = 0
  let key: keyof TitlePage | null = null
  const values: Partial<Record<keyof TitlePage, string[]>> = {}
  for (; i < lines.length; i++) {
    const line = lines[i]
    if (line.trim() === '') break
    const kv = line.match(/^([A-Za-z][A-Za-z ]*):\s*(.*)$/)
    if (kv && !/^\s/.test(line)) {
      key = TITLE_KEYS[kv[1].toLowerCase()] ?? null
      if (key) {
        values[key] = values[key] ?? []
        if (kv[2].trim()) values[key]!.push(kv[2].trim())
      }
    } else if (key) {
      values[key]!.push(line.trim())
    }
  }
  for (const [k, v] of Object.entries(values) as [keyof TitlePage, string[]][]) {
    titlePage[k] = v.map((s) => plainText({ runs: parseEmphasis(s) })).join('\n')
  }
  return { titlePage, consumed: i }
}

function stripBoneyardAndNotes(src: string): string {
  // Boneyard /* ... */ is removed entirely.
  let text = src.replace(/\/\*[\s\S]*?\*\//g, '')
  // Collapse line breaks inside [[notes]] so each note sits on one line.
  text = text.replace(/\[\[([\s\S]*?)\]\]/g, (_m, body: string) => `[[${body.replace(/\s*\n\s*/g, ' ')}]]`)
  return text
}

/** Parse Fountain (https://fountain.io) into script elements. */
export function parseFountain(source: string): FountainDocument {
  const text = stripBoneyardAndNotes(source.replace(/\r\n?/g, '\n').replace(/^﻿/, ''))
  const lines = text.split('\n')
  const { titlePage, consumed } = parseTitlePage(lines)
  const body = lines.slice(consumed)
  const elements: ScriptElement[] = []
  const blank = (i: number) => i < 0 || i >= body.length || body[i].trim() === ''
  let lastScene: ScriptElement | null = null
  let inDialogue = false

  const push = (el: ScriptElement) => {
    elements.push(el)
    return el
  }
  const pushText = (type: ScriptElement['type'], raw: string) => push({ type, runs: parseEmphasis(raw) })

  let i = 0
  while (i < body.length) {
    const rawLine = body[i]
    const line = rawLine.trim()

    if (line === '') {
      // Two spaces on an otherwise empty line keep dialogue going (Fountain spec).
      if (inDialogue && rawLine === '  ' && elements.length) {
        const last = elements[elements.length - 1]
        if (last.type === 'dialogue') last.runs = normalizeRuns([...last.runs, { text: '\n' }])
        i++
        continue
      }
      inDialogue = false
      i++
      continue
    }

    // Page breaks are handled by the paginator.
    if (/^={3,}$/.test(line)) {
      i++
      continue
    }

    // Notes on their own line.
    const note = line.match(/^\[\[(.*)\]\]$/)
    if (note) {
      push({ type: 'note', runs: normalizeRuns([{ text: note[1].trim() }]) })
      i++
      continue
    }
    const inline = rawLine.replace(/\s*\[\[.*?\]\]/g, '')
    const content = inline.trim()
    if (!content) {
      i++
      continue
    }

    if (inDialogue) {
      if (/^\(.*\)$/.test(content)) {
        pushText('parenthetical', content)
      } else {
        const last = elements[elements.length - 1]
        if (last && last.type === 'dialogue') {
          last.runs = normalizeRuns([...last.runs, { text: '\n' }, ...parseEmphasis(content)])
        } else {
          pushText('dialogue', content)
        }
      }
      i++
      continue
    }

    // Sections (# Act One) and synopses (= ...).
    const section = content.match(/^(#{1,6})\s*(.*)$/)
    if (section) {
      push({ type: 'section', runs: normalizeRuns([{ text: section[2].trim() }]), level: Math.min(3, section[1].length) })
      i++
      continue
    }
    const synopsis = content.match(/^=(?!=)\s*(.*)$/)
    if (synopsis) {
      if (lastScene) lastScene.synopsis = lastScene.synopsis ? `${lastScene.synopsis}\n${synopsis[1]}` : synopsis[1]
      i++
      continue
    }

    // Centered text: > text <
    const centered = content.match(/^>\s*(.*?)\s*<$/)
    if (centered) {
      // Consecutive centered lines form one centered block.
      const last = elements[elements.length - 1]
      if (last && last.type === 'centered' && !blank(i - 1)) last.runs = normalizeRuns([...last.runs, { text: '\n' }, ...parseEmphasis(centered[1])])
      else pushText('centered', centered[1])
      i++
      continue
    }

    // Forced elements.
    if (content.startsWith('!')) {
      i = collectAction(i, content.slice(1))
      continue
    }
    if (/^\.[^.]/.test(content)) {
      lastScene = push({ type: 'scene', id: uid(), runs: parseEmphasis(stripSceneNumber(content.slice(1))) })
      i++
      continue
    }
    if (content.startsWith('>')) {
      pushText('transition', content.slice(1).trim())
      i++
      continue
    }
    if (content.startsWith('~')) {
      pushText('action', content.slice(1).trim())
      i++
      continue
    }
    if (content.startsWith('@')) {
      pushText('character', content.slice(1).trim())
      inDialogue = true
      i++
      continue
    }

    const prevBlank = blank(i - 1)
    const nextBlank = blank(i + 1)

    if (prevBlank && looksLikeSceneHeading(content)) {
      lastScene = push({ type: 'scene', id: uid(), runs: parseEmphasis(stripSceneNumber(content)) })
      i++
      continue
    }
    if (prevBlank && nextBlank && isUpperCue(content) && isTransitionText(content)) {
      pushText('transition', content)
      i++
      continue
    }
    if (prevBlank && !nextBlank && isUpperCue(content) && /\p{L}/u.test(content)) {
      pushText('character', content)
      inDialogue = true
      i++
      continue
    }

    i = collectAction(i, inline)
  }

  function collectAction(start: number, firstLine: string): number {
    const parts = [firstLine.replace(/\s+$/, '')]
    let j = start + 1
    while (j < body.length && body[j].trim() !== '') {
      const l = body[j].replace(/\s*\[\[.*?\]\]/g, '').replace(/\s+$/, '')
      if (/^\s*\[\[.*\]\]\s*$/.test(body[j])) break
      parts.push(l.startsWith('!') ? l.slice(1) : l)
      j++
    }
    const tabbed = parts.map((p) => p.replace(/\t/g, '    '))
    push({ type: 'action', runs: parseEmphasis(tabbed.join('\n')) })
    return j
  }

  return { titlePage, elements }
}

function isTransitionText(text: string): boolean {
  return /TO:$/.test(text) || /^(FADE OUT|FADE TO BLACK|CUT TO BLACK)\.?$/.test(text)
}

function stripSceneNumber(heading: string): string {
  return heading.replace(/\s*#[^#\s]*#\s*$/, '').trim()
}

/* ------------------------------------------------------------------ */
/* Serializing                                                         */
/* ------------------------------------------------------------------ */

function titlePageToFountain(tp: Partial<TitlePage>): string {
  const rows: [string, string | undefined][] = [
    ['Title', tp.title],
    ['Credit', tp.credit],
    ['Author', tp.author],
    ['Source', tp.source],
    ['Draft date', tp.draftDate],
    ['Contact', tp.contact],
    ['Copyright', tp.copyright],
    ['Notes', tp.notes],
  ]
  const out: string[] = []
  for (const [key, value] of rows) {
    if (!value || !value.trim()) continue
    const lines = value.split('\n')
    if (lines.length === 1) out.push(`${key}: ${lines[0]}`)
    else {
      out.push(`${key}:`)
      for (const l of lines) out.push(`    ${l}`)
    }
  }
  return out.join('\n')
}

function needsForcedAction(text: string): boolean {
  const first = text.split('\n')[0].trim()
  if (!first) return false
  if (/^[!@#~=.>[]/.test(first)) return true
  if (looksLikeSceneHeading(first)) return true
  if (isUpperCue(first) && /\p{L}/u.test(first)) return true
  return false
}

/** Serialize elements (and optionally a title page) to Fountain. */
export function toFountain(elements: ScriptElement[], titlePage?: Partial<TitlePage>): string {
  const blocks: string[] = []
  let group: string[] | null = null
  const flushGroup = () => {
    if (group) blocks.push(group.join('\n'))
    group = null
  }

  for (const el of elements) {
    const raw = plainText(el)
    const body = emphasisToFountain(el.runs)
    switch (el.type) {
      case 'scene': {
        flushGroup()
        const heading = stripSceneNumber(raw).toUpperCase()
        const lines = [looksLikeSceneHeading(raw) ? heading : `.${heading}`]
        if (el.synopsis?.trim()) lines.push('', ...el.synopsis.trim().split('\n').map((s) => `= ${s}`))
        if (el.notes?.trim()) lines.push('', `[[${el.notes.trim().replace(/\n+/g, ' ')}]]`)
        blocks.push(lines.join('\n'))
        break
      }
      case 'character': {
        flushGroup()
        const cue = raw.trim().toUpperCase()
        group = [/\p{L}/u.test(cue) && !looksLikeSceneHeading(cue) ? cue : `@${cue}`]
        break
      }
      case 'parenthetical':
      case 'dialogue': {
        const text = el.type === 'parenthetical' && !/^\(.*\)$/.test(raw.trim()) ? `(${body.trim()})` : body
        const lines = text.split('\n').map((l) => (l === '' ? '  ' : l))
        if (el.type === 'dialogue' && lines.some((l) => /^\(.*\)$/.test(l.trim()))) {
          // A dialogue line wrapped in parentheses would be read back as a parenthetical.
          for (let k = 0; k < lines.length; k++) if (/^\(.*\)$/.test(lines[k].trim())) lines[k] = `\\${lines[k]}`
        }
        if (group) group.push(...lines)
        else blocks.push(lines.join('\n'))
        break
      }
      case 'transition': {
        flushGroup()
        // Transitions are one line in Fountain.
        const t = body.replace(/\s*\n\s*/g, ' ').toUpperCase()
        blocks.push(isTransitionText(t.trim()) ? t : `> ${t}`)
        break
      }
      case 'centered':
        flushGroup()
        // Fountain centres line by line, so every line gets its own markers.
        blocks.push(
          body
            .split('\n')
            .map((l) => `> ${l.trim()} <`)
            .join('\n'),
        )
        break
      case 'section':
        flushGroup()
        blocks.push(`${'#'.repeat(Math.max(1, Math.min(6, el.level ?? 1)))} ${raw.replace(/\s*\n\s*/g, ' ')}`)
        break
      case 'note':
        flushGroup()
        blocks.push(`[[${raw.replace(/\n+/g, ' ')}]]`)
        break
      case 'shot':
        flushGroup()
        blocks.push(`!${body.toUpperCase()}`)
        break
      default: {
        flushGroup()
        const lines = body.split('\n').map((l) => (l === '' ? '  ' : l))
        const text = lines.join('\n')
        blocks.push(needsForcedAction(raw) ? `!${text}` : text)
      }
    }
  }
  flushGroup()

  const tp = titlePage ? titlePageToFountain(titlePage) : ''
  return (tp ? `${tp}\n\n` : '') + blocks.join('\n\n') + '\n'
}

export function newTitlePageFrom(partial: Partial<TitlePage>): TitlePage {
  return { ...emptyTitlePage(), ...partial }
}
