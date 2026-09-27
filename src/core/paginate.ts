import { ELEMENTS, PAGE, type ElementInfo } from './elements'
import { characterName, hasContd } from './scene'
import { mapRunsText, normalizeRuns, plainText, sliceRuns } from './text'
import type { ElementType, ScriptElement, TextRun } from './types'
import { endsSentence, wrapText, type LineRange } from './wrap'

export interface PaginateOptions {
  linesPerPage: number
  /** Blank lines before scene headings. */
  sceneSpacing: 1 | 2
  /** Automatically add (CONT'D) when a character speaks again within a scene. */
  autoContd: boolean
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
  /** Set on the first line of each scene heading. */
  sceneNumber?: number
}

export interface Page {
  number: number
  /** `null` is a blank line. */
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
  /** Printed lines the scene occupies, including blank lines. */
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
  spaceBefore: number
  sceneNumber?: number
}

const CONTD = " (CONT'D)"

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
    block = {
      index,
      type: el.type,
      info,
      text,
      runs,
      lines: wrapText(text, info.width),
      spaceBefore: el.type === 'scene' ? opts.sceneSpacing : info.spaceBefore,
    }
    if (el.type === 'scene') block.sceneNumber = sceneNumber
    blocks.push(block)
  }
  return blocks
}

interface GroupLine {
  block: Block
  line: number
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

  const remaining = () => L - cur.lines.length
  const isFresh = () => cur.lines.every((l) => l === null || l.offset < 0)

  const newPage = () => {
    cur = { number: pages.length + 1, lines: [] }
    pages.push(cur)
  }

  const pushBlank = (n: number) => {
    for (let k = 0; k < n && cur.lines.length > 0 && remaining() > 0; k++) {
      cur.lines.push(null)
      if (current) current.lines++
    }
  }

  const pushLine = (line: LayoutLine) => {
    if (remaining() <= 0) newPage()
    if (line.offset >= 0 && cur.number > 1 && !breaks.some((b) => b.page === cur.number)) {
      breaks.push({ page: cur.number, elementIndex: line.elementIndex, offset: line.offset })
    }
    cur.lines.push(line)
    if (current) current.lines++
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
        if (remaining() <= 0) newPage()
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
      let need = next.spaceBefore + next.lines.length
      const after = blocks[i + 2]
      if (after && after.type === 'parenthetical') {
        need += after.lines.length
        const d = blocks[i + 3]
        if (d && d.type === 'dialogue') need += Math.min(2, d.lines.length)
      } else if (after && after.type === 'dialogue') {
        need += Math.min(2, after.lines.length)
      }
      return need
    }
    return next.spaceBefore + Math.min(2, next.lines.length)
  }

  /** Place a block that may break across pages at a sentence (or, failing that, line) boundary. */
  const placeSplittable = (b: Block) => {
    let from = 0
    let first = true
    while (from < b.lines.length) {
      const left = b.lines.length - from
      const space = first ? spacing(b) : 0
      if (space + left <= remaining()) {
        pushBlank(space)
        placeLines(b, from, b.lines.length)
        return
      }
      const avail = remaining() - space
      const fresh = cur.lines.length === 0
      let k = -1
      if (fresh) {
        k = avail
        for (let c = avail; c >= Math.max(2, avail - 8); c--) {
          if (endsSentence(b.text, b.lines[from + c - 1])) {
            k = c
            break
          }
        }
      } else if (avail >= 2 && left - avail >= 1) {
        for (let c = Math.min(avail, left - 2); c >= 2; c--) {
          if (endsSentence(b.text, b.lines[from + c - 1])) {
            k = c
            break
          }
        }
        if (k === -1 && left - avail >= 2 && b.type === 'action') k = avail
      }
      if (k > 0) {
        pushBlank(space)
        placeLines(b, from, from + k)
        from += k
        newPage()
      } else {
        newPage()
      }
      first = false
    }
  }

  const placeDialogueGroup = (group: Block[]) => {
    const character = group[0]
    let gl: GroupLine[] = []
    for (const b of group) for (let i = 0; i < b.lines.length; i++) gl.push({ block: b, line: i })
    let space = spacing(character)
    let guard = 0
    while (gl.length > 0 && guard++ < 10000) {
      if (space + gl.length <= remaining()) {
        pushBlank(space)
        placeGroupLines(gl)
        return
      }
      const avail = remaining() - space - 1 // keep one line for (MORE)
      const fresh = isFresh()
      const s = findDialogueSplit(gl, avail, fresh)
      if (s > 0) {
        pushBlank(space)
        placeGroupLines(gl.slice(0, s))
        const splitBlock = gl[s - 1].block
        pushLine({
          type: 'more',
          runs: [{ text: '(MORE)' }],
          indent: character.info.indent,
          width: character.info.width,
          align: 'left',
          elementIndex: splitBlock.index,
          offset: -1,
        })
        newPage()
        const next = gl[s]
        // Record where the page begins in the source, then reprint the cue.
        breaks.push({ page: cur.number, elementIndex: next.block.index, offset: next.block.lines[next.line].start })
        const cue = hasContd(character.text) ? character.text : character.text.replace(/\s*$/, '') + CONTD
        pushLine({
          type: 'contd',
          runs: [{ text: cue }],
          indent: character.info.indent,
          width: character.info.width,
          align: 'left',
          elementIndex: next.block.index,
          offset: -1,
        })
        gl = gl.slice(s)
        space = 0
      } else if (!fresh) {
        newPage()
        space = 0
      } else {
        // Nothing sensible fits even on a fresh page: fill it and carry on.
        const take = Math.max(1, remaining())
        placeGroupLines(gl.slice(0, take))
        gl = gl.slice(take)
        if (gl.length) newPage()
      }
    }
  }

  const placeGroupLines = (gl: GroupLine[]) => {
    for (const { block, line } of gl) {
      if (line === 0) {
        if (remaining() <= 0) newPage()
        markStart(block)
      }
      pushLine(lineOf(block, line))
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
      const need = spacing(b) + b.lines.length + (b.type === 'transition' ? 0 : keepWithNext(i))
      if (need > remaining() && cur.lines.length > 0 && need <= L) newPage()
      if (b.lines.length + spacing(b) > remaining() && cur.lines.length > 0) newPage()
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

  function findDialogueSplit(gl: GroupLine[], avail: number, fresh: boolean): number {
    const max = Math.min(avail, gl.length - 1)
    const dialogueBefore = (s: number) => gl.slice(0, s).filter((g) => g.block.type === 'dialogue').length
    const valid = (s: number) => gl[s - 1].block.type === 'dialogue' && dialogueBefore(s) >= 1
    const boundary = (s: number) =>
      gl[s].block !== gl[s - 1].block || endsSentence(gl[s - 1].block.text, gl[s - 1].block.lines[gl[s - 1].line])
    const comfortable = (s: number) =>
      dialogueBefore(s) >= 2 && (gl.length - s >= 2 || gl[s].block !== gl[s - 1].block)
    for (let s = max; s >= 1; s--) if (valid(s) && boundary(s) && comfortable(s)) return s
    for (let s = max; s >= 1; s--) if (valid(s) && comfortable(s)) return s
    if (fresh) for (let s = max; s >= 1; s--) if (valid(s)) return s
    return -1
  }
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
