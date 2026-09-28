import { describe, expect, it } from 'vitest'
import { toPdfCharset } from './text'

describe('toPdfCharset', () => {
  it('keeps everything Windows-1252 can show', () => {
    const s = 'Café naïve Zoë Ñandú ß Œuvre €5 £3 ¥7 ™ “quotes” — …'
    expect(toPdfCharset(s)).toEqual({ text: s, missing: [] })
  })

  it('drops accents the font lacks and maps special letters', () => {
    expect(toPdfCharset('Łódź Ğöz Ő ő İstanbul ı Đ').text).toBe('Lódz Göz O o Istanbul i D')
    // Decomposed accents (e + combining acute) are composed first.
    expect(toPdfCharset('Café').text).toBe('Café')
  })

  it('replaces each unsupported character with one "?" and reports it', () => {
    const r = toPdfCharset('வாலி: How are you? 🎬 東京')
    expect(r.text).toBe('??: How are you? ? ??')
    expect(r.missing).toEqual(['வா', 'லி', '🎬', '東', '京'])
  })

  it('keeps line breaks', () => {
    expect(toPdfCharset('one\ntwo').text).toBe('one\ntwo')
  })
})
