import { describe, expect, it } from 'vitest'
import { wrapText } from './wrap'

const lines = (text: string, width: number) => wrapText(text, width).map((r) => text.slice(r.start, r.end))

describe('wrapText', () => {
  it('returns one empty line for empty text', () => {
    expect(lines('', 10)).toEqual([''])
  })

  it('wraps on spaces', () => {
    expect(lines('the quick brown fox jumps', 10)).toEqual(['the quick', 'brown fox', 'jumps'])
  })

  it('fits text exactly at the width', () => {
    expect(lines('abcde fghij', 11)).toEqual(['abcde fghij'])
    expect(lines('abcde fghij', 10)).toEqual(['abcde', 'fghij'])
  })

  it('hard-breaks long words', () => {
    expect(lines('abcdefghijkl', 5)).toEqual(['abcde', 'fghij', 'kl'])
  })

  it('prefers breaking after hyphens inside long words', () => {
    expect(lines('super-long-word', 8)).toEqual(['super-', 'long-', 'word'])
  })

  it('honours forced line breaks', () => {
    expect(lines('one\ntwo three\n\nfour', 20)).toEqual(['one', 'two three', '', 'four'])
  })

  it('offsets map back to the source text', () => {
    const text = 'Hello there, general Kenobi.'
    for (const r of wrapText(text, 12)) {
      expect(r.start).toBeLessThanOrEqual(r.end)
      expect(text.slice(r.start, r.end).startsWith(' ')).toBe(false)
    }
  })
})
