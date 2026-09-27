import { describe, expect, it } from 'vitest'
import { formatEighths, paginate, toEighths, type LayoutLine } from './paginate'
import { parseFountain } from './fountain'
import { SAMPLE_FOUNTAIN } from './sample'
import type { ElementType, ScriptElement } from './types'

const el = (type: ElementType, text: string): ScriptElement => ({ type, runs: [{ text }] })
const text = (l: LayoutLine | null) => (l ? l.runs.map((r) => r.text).join('') : '')

describe('paginate', () => {
  it('lays out a short script on one page with standard spacing', () => {
    const p = paginate([el('scene', 'int. house - day'), el('action', 'Bob enters.'), el('character', 'bob'), el('dialogue', 'Hi.')])
    expect(p.pages).toHaveLength(1)
    expect(p.pages[0].lines.map(text)).toEqual(['INT. HOUSE - DAY', '', 'Bob enters.', '', 'BOB', 'Hi.'])
    expect(p.pages[0].lines[0]?.sceneNumber).toBe(1)
    expect(p.scenes).toEqual([{ elementIndex: 0, number: 1, page: 1, lines: 6 }])
  })

  it('skips non-printing elements', () => {
    const p = paginate([el('section', 'ACT ONE'), el('note', 'todo'), el('action', 'Hello.')])
    expect(p.pages[0].lines.map(text)).toEqual(['Hello.'])
    expect(p.elementPage).toEqual([1, 1, 1])
  })

  it('adds automatic CONT\'D when a character speaks again in a scene', () => {
    const els = [
      el('scene', 'INT. A - DAY'),
      el('character', 'ANNA'),
      el('dialogue', 'One.'),
      el('action', 'She waits.'),
      el('character', 'ANNA'),
      el('dialogue', 'Two.'),
      el('scene', 'INT. B - DAY'),
      el('character', 'ANNA'),
      el('dialogue', 'Three.'),
    ]
    const p = paginate(els)
    expect(p.contd).toEqual([4])
    expect(p.pages[0].lines.map(text)).toContain("ANNA (CONT'D)")
    expect(paginate(els, { autoContd: false }).contd).toEqual([])
  })

  it('never leaves a scene heading at the bottom of a page', () => {
    const els: ScriptElement[] = []
    for (let i = 0; i < 27; i++) els.push(el('action', `Line ${i}.`))
    // 27 actions = 53 lines; the heading plus its first action line would not fit.
    els.push(el('scene', 'EXT. FIELD - DAY'), el('action', 'Grass.'))
    const p = paginate(els)
    expect(p.pages).toHaveLength(2)
    expect(text(p.pages[1].lines[0])).toBe('EXT. FIELD - DAY')
    expect(p.breaks).toEqual([{ page: 2, elementIndex: 27, offset: 0 }])
    expect(p.elementPage[27]).toBe(2)
  })

  it('splits long dialogue across pages with (MORE) and (CONT\'D)', () => {
    const els: ScriptElement[] = []
    for (let i = 0; i < 24; i++) els.push(el('action', `Line ${i}.`))
    const speech = Array.from({ length: 12 }, (_, i) => `Sentence number ${i} is here.`).join(' ')
    els.push(el('character', 'MAREN'), el('dialogue', speech))
    const p = paginate(els)
    expect(p.pages).toHaveLength(2)
    const first = p.pages[0].lines
    expect(text(first[first.length - 1])).toBe('(MORE)')
    expect(text(p.pages[1].lines[0])).toBe("MAREN (CONT'D)")
    // The split happens at a sentence boundary.
    const lastDialogue = text(first[first.length - 2])
    expect(lastDialogue.endsWith('.')).toBe(true)
    expect(p.breaks[0].elementIndex).toBe(25)
    expect(p.breaks[0].offset).toBeGreaterThan(0)
    // All dialogue text is printed exactly once.
    const printed = p.pages
      .flatMap((pg) => pg.lines)
      .filter((l) => l?.type === 'dialogue')
      .map(text)
      .join(' ')
    expect(printed).toBe(speech)
  })

  it('never exceeds the page length', () => {
    const { elements } = parseFountain(SAMPLE_FOUNTAIN)
    const big = Array.from({ length: 20 }, () => elements).flat()
    const p = paginate(big)
    expect(p.pages.length).toBeGreaterThan(20)
    for (const page of p.pages) {
      expect(page.lines.length).toBeLessThanOrEqual(55)
      expect(page.lines[0]).not.toBeNull()
    }
    expect(p.breaks).toHaveLength(p.pages.length - 1)
  })

  it('handles a single element longer than a page', () => {
    const long = Array.from({ length: 300 }, (_, i) => `Word${i} goes on and on.`).join(' ')
    const p = paginate([el('action', long)])
    expect(p.pages.length).toBeGreaterThan(1)
    const printed = p.pages.flatMap((pg) => pg.lines).map(text).join(' ')
    expect(printed).toBe(long)
  })
})

describe('eighths', () => {
  it('converts lines to eighths of a page', () => {
    expect(toEighths(1, 56)).toBe(1)
    expect(toEighths(28, 56)).toBe(4)
    expect(toEighths(70, 56)).toBe(10)
    expect(formatEighths(3)).toBe('3/8')
    expect(formatEighths(8)).toBe('1')
    expect(formatEighths(11)).toBe('1 3/8')
  })
})
