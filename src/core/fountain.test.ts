import { describe, expect, it } from 'vitest'
import { emphasisToFountain, parseEmphasis, parseFountain, toFountain } from './fountain'
import { SAMPLE_FOUNTAIN } from './sample'
import { plainText } from './text'
import type { ScriptElement } from './types'

const simplify = (els: ScriptElement[]) => els.map((e) => [e.type, plainText(e)])

describe('emphasis', () => {
  it('parses bold, italic, underline and combinations', () => {
    expect(parseEmphasis('a **b** *c* _d_ ***e***')).toEqual([
      { text: 'a ' },
      { text: 'b', bold: true },
      { text: ' ' },
      { text: 'c', italic: true },
      { text: ' ' },
      { text: 'd', underline: true },
      { text: ' ' },
      { text: 'e', bold: true, italic: true },
    ])
  })

  it('leaves unmatched markers and escapes alone', () => {
    expect(parseEmphasis('5 * 3 = 15')).toEqual([{ text: '5 * 3 = 15' }])
    expect(parseEmphasis('\\*not italic\\*')).toEqual([{ text: '*not italic*' }])
  })

  it('round-trips through serialization', () => {
    const runs = parseEmphasis('He is **very** *sure* of _it_.')
    expect(parseEmphasis(emphasisToFountain(runs))).toEqual(runs)
    const literal = [{ text: 'a ' }, { text: '5 * 3_x', italic: true }, { text: ' b' }]
    expect(parseEmphasis(emphasisToFountain(literal))).toEqual(literal)
  })
})

describe('parseFountain', () => {
  it('reads the title page', () => {
    const { titlePage } = parseFountain('Title: Big Fish\nAuthor: John August\nContact:\n    Line 1\n    Line 2\n\nINT. HOUSE - DAY\n')
    expect(titlePage).toEqual({ title: 'Big Fish', author: 'John August', contact: 'Line 1\nLine 2' })
  })

  it('detects standard elements', () => {
    const { elements } = parseFountain(`INT. HOUSE - DAY

Bob enters.

BOB
(quietly)
Hello there.
How are you?

ALICE (V.O.)
Fine.

CUT TO:

EXT. GARDEN - NIGHT

> THE END <
`)
    expect(simplify(elements)).toEqual([
      ['scene', 'INT. HOUSE - DAY'],
      ['action', 'Bob enters.'],
      ['character', 'BOB'],
      ['parenthetical', '(quietly)'],
      ['dialogue', 'Hello there.\nHow are you?'],
      ['character', 'ALICE (V.O.)'],
      ['dialogue', 'Fine.'],
      ['transition', 'CUT TO:'],
      ['scene', 'EXT. GARDEN - NIGHT'],
      ['centered', 'THE END'],
    ])
    expect(elements[0].id).toBeTruthy()
  })

  it('handles forced elements, sections, synopses, notes and boneyard', () => {
    const { elements } = parseFountain(`# Act One

.FLASHBACK
= The past returns.

!SOMETHING LOUD
continues here.

@McCLANE
Yippee.

>Fade to white.

/* removed
entirely */

[[fix this later]]
`)
    expect(simplify(elements)).toEqual([
      ['section', 'Act One'],
      ['scene', 'FLASHBACK'],
      ['action', 'SOMETHING LOUD\ncontinues here.'],
      ['character', 'McCLANE'],
      ['dialogue', 'Yippee.'],
      ['transition', 'Fade to white.'],
      ['note', 'fix this later'],
    ])
    expect(elements[1].synopsis).toBe('The past returns.')
  })

  it('strips scene numbers', () => {
    const { elements } = parseFountain('INT. HOUSE - DAY #12A#\n')
    expect(plainText(elements[0])).toBe('INT. HOUSE - DAY')
  })

  it('does not treat an all-caps line followed by a blank line as a character', () => {
    const { elements } = parseFountain('BANG!\n\nThe door flies open.\n')
    expect(simplify(elements)).toEqual([
      ['action', 'BANG!'],
      ['action', 'The door flies open.'],
    ])
  })
})

describe('toFountain', () => {
  it('round-trips the sample screenplay', () => {
    const first = parseFountain(SAMPLE_FOUNTAIN)
    const text = toFountain(first.elements, first.titlePage)
    const second = parseFountain(text)
    expect(simplify(second.elements)).toEqual(simplify(first.elements))
    expect(second.titlePage).toEqual(first.titlePage)
    expect(second.elements.map((e) => e.synopsis)).toEqual(first.elements.map((e) => e.synopsis))
  })

  it('keeps multi-line centered text and one-line transitions', () => {
    const els: ScriptElement[] = [
      { type: 'centered', runs: [{ text: 'PART I\nAFRICA\n3,000,000 YEARS AGO' }] },
      { type: 'action', runs: [{ text: 'Dust.' }] },
      { type: 'transition', runs: [{ text: 'SMASH\nCUT TO:' }] },
    ]
    const out = toFountain(els)
    expect(out).toContain('> PART I <\n> AFRICA <\n> 3,000,000 YEARS AGO <')
    expect(simplify(parseFountain(out).elements)).toEqual([
      ['centered', 'PART I\nAFRICA\n3,000,000 YEARS AGO'],
      ['action', 'Dust.'],
      ['transition', 'SMASH CUT TO:'],
    ])
  })

  it('forces ambiguous elements', () => {
    const els: ScriptElement[] = [
      { type: 'action', runs: [{ text: 'BANG' }] },
      { type: 'action', runs: [{ text: 'INT. is short for interior' }] },
      { type: 'scene', runs: [{ text: 'THE MOON' }] },
      { type: 'transition', runs: [{ text: 'fade to white' }] },
      { type: 'character', runs: [{ text: 'bob' }] },
      { type: 'dialogue', runs: [{ text: '(not a parenthetical)' }] },
    ]
    const out = toFountain(els)
    expect(out).toContain('!BANG')
    expect(out).toContain('!INT. is short')
    expect(out).toContain('.THE MOON')
    expect(out).toContain('> FADE TO WHITE')
    const back = parseFountain(out).elements
    expect(simplify(back)).toEqual([
      ['action', 'BANG'],
      ['action', 'INT. is short for interior'],
      ['scene', 'THE MOON'],
      ['transition', 'FADE TO WHITE'],
      ['character', 'BOB'],
      ['dialogue', '(not a parenthetical)'],
    ])
  })
})
