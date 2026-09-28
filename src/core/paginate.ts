import { ELEMENTS, PAGE, type ElementInfo } from './elements'
import { characterName, hasContd } from './scene'
import { lineHeightOf, type EmMeasure } from './scripts'
import { mapRunsText, normalizeRuns, plainText, sliceRuns } from './text'
import type { ElementType, ScriptElement, TextRun } from './types'
import { wrapText, type LineRange } from './wrap'

export interface PaginateOptions {
  linesPerPage: number
  /** Blank lines before scene headings. */
  sceneSpacing: 1 | 2
  /** Automatically add (CONT'D) when a character speaks again within a scene. */
  autoContd: boolean
  /** Width of Indic text (see scripts.ts); defaults to the current measure. */
  measure?: EmMeasure
}

export const DEFAULT_PAGINATE_OPTIONS: PaginateOptions = {
  linesPerPage: PAGE.linesPerPage,
  sceneSpacing: 1,
  autoContd: true,
}

export interface LayoutLine {
  type: ElementType | 'more' | 'contd'
  runs: TextRun[]
  indent: number
  width: number
  align: 'left' | 'right' | 'center'
  /** Source element; for (MORE)/(CONT'D) lines, the dialogue element being split. */
  elementIndex: number
  /** Offset of this line in the element's text, or -1 for synthesized lines. */
  offset: number
  /** Height in lines: 1, or 1.25 for a line holding Indic text. */
  height: number
  /** Set on the first line of each scene heading. */
  sceneNumber?: number
}

export interface Page {
  number: number
  /** `null` is a blank line (one line high). */
  lines: (LayoutLine | null)[]
}

export interface PageBreak {
  /** Page number that starts here (2, 3, ...). */
  page: number
  elementIndex: number
  /** Character offset inside the element where the page starts (0 = start of element). */
  offset: number
}

export interface SceneLayout {
  elementIndex: number
  number: number
  page: number
  /** Printed lines the scene occupies, including blank lines (Indic lines count 1.25). */
  lines: number
}

export interface Pagination {
  pages: Page[]
  breaks: PageBreak[]
  /** Page each element starts on (non-printing elements take the page of the next printed element). */
  elementPage: number[]
  /** Character cues that received an automatic (CONT'D). */
  contd: number[]
  scenes: SceneLayout[]
  linesPerPage: number
}

interface Block {
  index: number
  type: ElementType
  info: ElementInfo
  text: string
  runs: TextRun[]
  lines: LineRange[]
  /** Height of each line, in lines. */
  heights: number[]
  spaceBefore: number
  sceneNumber?: number
}

const CONTD = " (CONT'D)"

/** Tolerance for sums of line heights (quarter lines add up exactly, but be safe). */
const EPS = 1e-6

function lineHeights(text: string, lines: LineRange[]): number[] {
  return lines.map((r) => lineHeightOf(text.slice(r.start, r.end)))
}

function heightOf(b: Block, from = 0, to = b.lines.length): number {
  let h = 0
  for (let i = from; i < to; i++) h += b.heights[i]
  return h
}

/** Height of a block's first `n` lines. */
function headHeight(b: Block, n: number): number {
  return heightOf(b, 0, Math.min(n, b.lines.length))
}

/** How many of a block's lines, from the first, fit in `room`. */
function fitting(b: Block, room: number): number {
  let h = 0
  let n = 0
  while (n < b.lines.length && h + b.heights[n] <= room + EPS) h += b.heights[n++]
  return n
}

function buildBlocks(elements: ScriptElement[], opts: PaginateOptions, contd: number[]): Block[] {
  const blocks: Block[] = []
  let sceneNumber = 0
  let lastSpeaker = ''
  for (let index = 0; index < elements.length; index++) {
    const el = elements[index]
    const info = ELEMENTS[el.type]
    if (!info.printable) continue
    let runs = info.uppercase ? mapRunsText(el.runs, (s) => s.toUpperCase()) : el.runs.map((r) => ({ ...r }))
    runs = normalizeRuns(runs)
    let block: Block
    if (el.type === 'scene') {
      sceneNumber++
      lastSpeaker = ''
    }
    if (el.type === 'character') {
      const cue = plainText({ runs })
      const name = characterName(cue)
      if (opts.autoContd && name && name === lastSpeaker && !hasContd(cue)) {
        runs = normalizeRuns([...runs, { text: CONTD }])
        contd.push(index)
      }
      if (name) lastSpeaker = name
    }
    const text = plainText({ runs })
    const lines = wrapText(text, info.width, opts.measure)
    block = {
      index,
      type: el.type,
      info,
      text,
      runs,
      lines,
      heights: lineHeights(text, lines),
      spaceBefore: el.type === 'scene' ? opts.sceneSpacing : info.spaceBefore,
    }
    if (el.type === 'scene') block.sceneNumber = sceneNumber
    blocks.push(block)
  }
  return blocks
}

/** Lay the script out on pages exactly as it will print. */
export function paginate(elements: ScriptElement[], options: Partial<PaginateOptions> = {}): Pagination {
  const opts = { ...DEFAULT_PAGINATE_OPTIONS, ...options }
  const L = Math.max(10, opts.linesPerPage)
  const contd: number[] = []
  const blocks = buildBlocks(elements, opts, contd)

  const pages: Page[] = []
  const breaks: PageBreak[] = []
  const elementPage = new Array<number>(elements.length).fill(0)
  const scenes: SceneLayout[] = []
  let current: SceneLayout | null = null
  let cur: Page = { number: 1, lines: [] }
  pages.push(cur)
  /** Height used on the current page, in lines. */
  let used = 0

  const remaining = () => L - used
  const isFresh = () => cur.lines.every((l) => l === null || l.offset < 0)

  const newPage = () => {
    cur = { number: pages.length + 1, lines: [] }
    pages.push(cur)
    used = 0
  }

  const pushBlank = (n: number) => {
    for (let k = 0; k < n && cur.lines.length > 0 && remaining() >= 1 - EPS; k++) {
      cur.lines.push(null)
      used += 1
      if (current) current.lines++
    }
  }

  const pushLine = (line: LayoutLine) => {
    if (line.height > remaining() + EPS) newPage()
    if (line.offset >= 0 && cur.number > 1 && !breaks.some((b) => b.page === cur.number)) {
      breaks.push({ page: cur.number, elementIndex: line.elementIndex, offset: line.offset })
    }
    cur.lines.push(line)
    used += line.height
    if (current) current.lines += line.height
  }

  const lineOf = (b: Block, i: number): LayoutLine => {
    const r = b.lines[i]
    const line: LayoutLine = {
      type: b.type,
      runs: sliceRuns(b.runs, r.start, r.end),
      indent: b.info.indent,
      width: b.info.width,
      align: b.info.align,
      elementIndex: b.index,
      offset: r.start,
      height: b.heights[i],
    }
    if (i === 0 && b.sceneNumber) line.sceneNumber = b.sceneNumber
    return line
  }

  const markStart = (b: Block) => {
    if (!elementPage[b.index]) elementPage[b.index] = cur.number
  }

  const placeLines = (b: Block, from: number, to: number) => {
    for (let i = from; i < to; i++) {
      if (i === from && from === 0) {
        if (b.heights[i] > remaining() + EPS) newPage()
        markStart(b)
      }
      pushLine(lineOf(b, i))
    }
  }

  const spacing = (b: Block) => (cur.lines.length === 0 ? 0 : b.spaceBefore)

  /** Minimum lines the element after `i` needs on the same page as `blocks[i]`. */
  const keepWithNext = (i: number): number => {
    const next = blocks[i + 1]
    if (!next) return 0
    if (next.type === 'character') {
      let need = next.spaceBefore + heightOf(next)
      const after = blocks[i + 2]
      if (after && after.type === 'parenthetical') {
        need += heightOf(after)
        const d = blocks[i + 3]
        if (d && d.type === 'dialogue') need += headHeight(d, 2)
      } else if (after && after.type === 'dialogue') {
        need += headHeight(after, 2)
      }
      return need
    }
    return next.spaceBefore + headHeight(next, 2)
  }

  /** Re-wrap the text range [from, to) of a block on its own (used to split at sentence ends). */
  const subBlock = (b: Block, from: number, to: number): Block => {
    let s = from
    while (s < to && /\s/.test(b.text[s])) s++
    let e = to
    while (e > s && /\s/.test(b.text[e - 1])) e--
    const lines = e > s ? wrapText(b.text.slice(s, e), b.info.width, opts.measure).map((r) => ({ start: r.start + s, end: r.end + s })) : []
    return { ...b, lines, heights: lineHeights(b.text, lines), sceneNumber: s === 0 ? b.sceneNumber : undefined }
  }

  /** Split after the first `n` wrapped lines. */
  const lineSplit = (b: Block, n: number): [Block, Block] => [
    { ...b, lines: b.lines.slice(0, n), heights: b.heights.slice(0, n) },
    { ...b, lines: b.lines.slice(n), heights: b.heights.slice(n), sceneNumber: undefined },
  ]

  /**
   * Split a block at the latest sentence end (or forced line break) such that
   * the first part is at most `maxHeight` high (with at least `minFirst` lines
   * and `minFirstHeight` of height) and the rest has at least `minRest` lines.
   */
  const sentenceSplit = (b: Block, maxHeight: number, minFirst: number, minRest: number, minFirstHeight = 0): [Block, Block] | null => {
    if (maxHeight + EPS < Math.max(1, minFirst) || !b.lines.length) return null
    const start = b.lines[0].start
    const end = b.lines[b.lines.length - 1].end
    const cuts: number[] = []
    const re = /[.!?…]["'”’)\]]*(?=\s)|--(?=\s)|\n/g
    re.lastIndex = start
    let m: RegExpExecArray | null
    while ((m = re.exec(b.text)) && m.index < end) {
      const cut = m[0] === '\n' ? m.index : m.index + m[0].length
      if (cut > start && cut < end) cuts.push(cut)
    }
    for (let k = cuts.length - 1; k >= 0; k--) {
      const first = subBlock(b, start, cuts[k])
      if (heightOf(first) > maxHeight + EPS) continue
      if (first.lines.length < minFirst || heightOf(first) + EPS < minFirstHeight) return null
      const rest = subBlock(b, cuts[k], end)
      if (rest.lines.length < Math.max(1, minRest)) continue
      return [first, rest]
    }
    return null
  }

  /** Place a block that may break across pages, preferably at the end of a sentence. */
  const placeSplittable = (b: Block) => {
    let blk = b
    let space = spacing(b)
    for (let guard = 0; guard < 10000; guard++) {
      if (space + heightOf(blk) <= remaining() + EPS) {
        pushBlank(space)
        placeLines(blk, 0, blk.lines.length)
        return
      }
      const avail = remaining() - space
      const fresh = cur.lines.length === 0
      let parts: [Block, Block] | null = null
      if (fresh) {
        // A block longer than a page: fill most of the page, ending on a sentence if possible.
        parts = sentenceSplit(blk, avail, 1, 1, Math.max(1, avail - 12)) ?? lineSplit(blk, Math.max(1, fitting(blk, avail)))
      } else if (avail >= 2 - EPS) {
        parts = sentenceSplit(blk, avail, 2, 2)
        const n = fitting(blk, avail)
        if (!parts && blk.type === 'action' && n >= 2 && blk.lines.length - n >= 2) parts = lineSplit(blk, n)
      }
      if (parts) {
        pushBlank(space)
        placeLines(parts[0], 0, parts[0].lines.length)
        blk = parts[1]
      }
      newPage()
      space = 0
    }
  }

  const synthetic = (type: 'more' | 'contd', text: string, character: Block, elementIndex: number): LayoutLine => ({
    type,
    runs: [{ text }],
    indent: character.info.indent,
    width: character.info.width,
    align: 'left',
    elementIndex,
    offset: -1,
    height: lineHeightOf(text),
  })

  const groupHeight = (bs: Block[]) => bs.reduce((n, b) => n + heightOf(b), 0)
  const dialogueLines = (bs: Block[]) => bs.reduce((n, b) => n + (b.type === 'dialogue' ? b.lines.length : 0), 0)

  interface GroupSplit {
    before: Block[]
    after: Block[]
  }

  /** Where to break a speech that doesn't fit: returns the blocks for this page and the next. */
  const findDialogueSplit = (queue: Block[], avail: number, fresh: boolean): GroupSplit | null => {
    let used = 0
    let k = 0
    while (k < queue.length && used + heightOf(queue[k]) <= avail + EPS) used += heightOf(queue[k++])
    if (k >= queue.length) return null
    const blk = queue[k]
    const head = queue.slice(0, k)
    const tail = queue.slice(k + 1)
    const sentence: GroupSplit[] = []
    const boundary: GroupSplit[] = []
    const line: GroupSplit[] = []
    if (blk.type === 'dialogue') {
      const parts = sentenceSplit(blk, avail - used, 1, 1)
      if (parts) sentence.push({ before: [...head, parts[0]], after: [parts[1], ...tail] })
      const n = fitting(blk, avail - used)
      if (n >= 1) {
        const [a, b] = lineSplit(blk, n)
        line.push({ before: [...head, a], after: [b, ...tail] })
      }
    }
    for (let j = k; j >= 1; j--) {
      if (queue[j - 1].type === 'dialogue') boundary.push({ before: queue.slice(0, j), after: queue.slice(j) })
    }
    const valid = (o: GroupSplit) => o.after.length > 0 && o.before[o.before.length - 1].type === 'dialogue' && dialogueLines(o.before) >= 1
    const comfortable = (o: GroupSplit, remainderMin: number) =>
      dialogueLines(o.before) >= 2 && (o.after[0].lines[0].start === 0 || o.after[0].lines.length >= remainderMin)
    const pick =
      sentence.find((o) => valid(o) && comfortable(o, 1)) ??
      boundary.find((o) => valid(o) && comfortable(o, 1)) ??
      line.find((o) => valid(o) && comfortable(o, 2)) ??
      (fresh ? [...sentence, ...boundary, ...line].find(valid) : undefined)
    return pick ?? null
  }

  const placeDialogueGroup = (group: Block[]) => {
    const character = group[0]
    const cue = hasContd(character.text) ? character.text : character.text.replace(/\s*$/, '') + CONTD
    let queue = group
    let space = spacing(character)
    for (let guard = 0; queue.length && guard < 10000; guard++) {
      if (space + groupHeight(queue) <= remaining() + EPS) {
        pushBlank(space)
        for (const b of queue) placeLines(b, 0, b.lines.length)
        return
      }
      const fresh = isFresh()
      const split = findDialogueSplit(queue, remaining() - space - 1, fresh) // one line is kept for (MORE)
      if (split) {
        pushBlank(space)
        for (const b of split.before) placeLines(b, 0, b.lines.length)
        pushLine(synthetic('more', '(MORE)', character, split.before[split.before.length - 1].index))
        newPage()
        const next = split.after[0]
        // Record where the page begins in the source, then reprint the cue.
        breaks.push({ page: cur.number, elementIndex: next.index, offset: next.lines[0].start })
        pushLine(synthetic('contd', cue, character, next.index))
        queue = split.after
      } else if (fresh) {
        // Nothing sensible fits even on a fresh page: fill it and carry on.
        let room = Math.max(1, remaining())
        const rest: Block[] = []
        for (const b of queue) {
          if (room <= EPS) rest.push(b)
          else if (heightOf(b) <= room + EPS) {
            placeLines(b, 0, b.lines.length)
            room -= heightOf(b)
          } else {
            const [a, r] = lineSplit(b, Math.max(1, fitting(b, room)))
            placeLines(a, 0, a.lines.length)
            rest.push(r)
            room = 0
          }
        }
        queue = rest
        if (queue.length) newPage()
      } else {
        newPage()
      }
      space = 0
    }
  }

  let i = 0
  while (i < blocks.length) {
    const b = blocks[i]
    if (b.type === 'scene') {
      current = { elementIndex: b.index, number: b.sceneNumber ?? scenes.length + 1, page: 0, lines: 0 }
      scenes.push(current)
    }
    if (b.type === 'character') {
      let j = i + 1
      while (j < blocks.length && (blocks[j].type === 'parenthetical' || blocks[j].type === 'dialogue')) j++
      placeDialogueGroup(blocks.slice(i, j))
      i = j
      continue
    }
    if (b.type === 'scene' || b.type === 'shot' || b.type === 'transition' || b.type === 'parenthetical') {
      const need = spacing(b) + heightOf(b) + (b.type === 'transition' ? 0 : keepWithNext(i))
      if (need > remaining() + EPS && cur.lines.length > 0 && need <= L + EPS) newPage()
      if (heightOf(b) + spacing(b) > remaining() + EPS && cur.lines.length > 0) newPage()
      pushBlank(spacing(b))
      placeLines(b, 0, b.lines.length)
      if (b.type === 'scene' && current) current.page = elementPage[b.index]
      i++
      continue
    }
    placeSplittable(b)
    i++
  }

  // Drop a trailing empty page (can only happen if the last block ended exactly at a page end).
  if (pages.length > 1 && pages[pages.length - 1].lines.length === 0) pages.pop()

  // Non-printing elements inherit the page of the next printed element.
  let nextPage = pages.length
  for (let k = elements.length - 1; k >= 0; k--) {
    if (elementPage[k]) nextPage = elementPage[k]
    else elementPage[k] = nextPage
  }
  for (const s of scenes) if (!s.page) s.page = elementPage[s.elementIndex]

  return { pages, breaks, elementPage, contd, scenes, linesPerPage: L }
}

/** Scene length in eighths of a page (production convention, minimum 1/8). */
export function toEighths(lines: number, linesPerPage: number = PAGE.linesPerPage): number {
  return Math.max(1, Math.round((lines / linesPerPage) * 8))
}

export function formatEighths(eighths: number): string {
  const whole = Math.floor(eighths / 8)
  const rest = eighths % 8
  if (!whole) return `${rest}/8`
  return rest ? `${whole} ${rest}/8` : `${whole}`
}
