import { readFileSync, writeFileSync } from 'node:fs'
import * as hb from 'harfbuzzjs'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { beforeAll, describe, expect, it } from 'vitest'
import { analyze, scenesMentioning } from './analysis'
import { parseFountain, toFountain } from './fountain'
import { paginate } from './paginate'
import { exportPdf } from './pdf'
import { parsePdfPages } from './pdfimport'
import { readPdfPages, type PdfJsLike } from './pdfread'
import { hasIndic, INDIC_LINE, lineHeightOf, segmentScripts, textCells, type EmMeasure, type IndicScript } from './scripts'
import { createShaper, type Shaper } from './shaper'
import { countWords, plainText } from './text'
import { blankGlyph, glyphPath, parseTrueType, subsetTrueType } from './ttf'
import { DEFAULT_SETTINGS, emptyTitlePage, type ScriptElement } from './types'
import { wrapText } from './wrap'

pdfjs.GlobalWorkerOptions.workerSrc = new URL('../../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url).href

const FILES: Record<IndicScript, string> = {
  devanagari: 'NotoSansDevanagari',
  tamil: 'NotoSansTamil',
  telugu: 'NotoSansTelugu',
  kannada: 'NotoSansKannada',
  malayalam: 'NotoSansMalayalam',
}

function fontFile(script: IndicScript): Uint8Array {
  return new Uint8Array(readFileSync(new URL(`../assets/fonts/${FILES[script]}-Regular.ttf`, import.meta.url)))
}

/** One em per letter or vowel sign: easy to reason about. */
const perCodePoint: EmMeasure = (text) => [...text].length

describe('Indian scripts: detecting and measuring', () => {
  it('splits text into Courier and script runs', () => {
    const runs = (t: string) => segmentScripts(t).map((s) => [t.slice(s.start, s.end), s.script])
    expect(runs('INT. வீடு - இரவு')).toEqual([
      ['INT. ', null],
      ['வீடு', 'tamil'],
      [' - ', null],
      ['இரவு', 'tamil'],
    ])
    expect(runs('हिन्दी and తెలుగు, ಕನ್ನಡ, മലയാളം.')).toEqual([
      ['हिन्दी', 'devanagari'],
      [' and ', null],
      ['తెలుగు', 'telugu'],
      [', ', null],
      ['ಕನ್ನಡ', 'kannada'],
      [', ', null],
      ['മലയാളം', 'malayalam'],
      ['.', null],
    ])
    // Zero-width joiners change how letters join, so they stay with them.
    expect(runs('ന്‍റ')).toEqual([['ന്‍റ', 'malayalam']])
    expect(hasIndic('বাংলা')).toBe(false)
  })

  it('measures Indic runs at 1.6 cells per em and everything else at a cell per character', () => {
    expect(textCells('Hello', perCodePoint)).toBe(5)
    expect(textCells('ab வீடு', perCodePoint)).toBeCloseTo(3 + 4 * 1.6)
    expect(lineHeightOf('Hello')).toBe(1)
    expect(lineHeightOf('Hello வீடு')).toBe(INDIC_LINE)
  })

  it('wraps at spaces by measured width, and breaks long words between syllables', () => {
    // Each two-letter word is 3.2 cells; spaces are Courier's one cell.
    expect(wrapText('கக கக கக', 8, perCodePoint)).toEqual([
      { start: 0, end: 5 },
      { start: 6, end: 8 },
    ])
    const word = 'கா'.repeat(10)
    const lines = wrapText(word, 7, perCodePoint)
    expect(lines.length).toBeGreaterThan(1)
    for (const l of lines) {
      expect(textCells(word.slice(l.start, l.end), perCodePoint)).toBeLessThanOrEqual(7)
      // Never split a consonant from its vowel sign.
      expect(word[l.start]).toBe('க')
    }
    expect(lines.map((l) => word.slice(l.start, l.end)).join('')).toBe(word)
  })

  it('gives lines holding Indic text 1¼ lines on the page', () => {
    const elements = parseFountain(Array.from({ length: 40 }, (_, i) => `வீடு ${i}.\n`).join('\n')).elements
    const p = paginate(elements, { measure: perCodePoint })
    for (const page of p.pages) {
      const used = page.lines.reduce((h, l) => h + (l ? l.height : 1), 0)
      expect(used).toBeLessThanOrEqual(p.linesPerPage)
      for (const l of page.lines) if (l) expect(l.height).toBe(INDIC_LINE)
    }
    // 40 one-line paragraphs, each 1.25 lines plus a blank line, don't fit on one 55-line page.
    expect(p.pages.length).toBe(2)
    expect(p.pages[0].lines.filter(Boolean).length).toBe(24)
  })
})

describe('Indian scripts: fonts', () => {
  it('subsets a font, keeping glyph ids and outlines', async () => {
    const data = fontFile('tamil')
    const font = parseTrueType(data)
    const shaper = await createShaper({ tamil: data })
    const gids = shaper.shape('கௌரவம்', 'tamil').map((g) => g.gid)
    const subset = subsetTrueType(font, gids)
    expect(subset.length).toBeLessThan(data.length / 4)
    const back = parseTrueType(subset)
    expect(back.numGlyphs).toBe(font.numGlyphs)
    const original = new hb.Font(new hb.Face(new hb.Blob(data)))
    const trimmed = new hb.Font(new hb.Face(new hb.Blob(subset)))
    for (const gid of gids) expect(trimmed.glyphExtents(gid)).toEqual(original.glyphExtents(gid))
    const unused = [...Array(font.numGlyphs).keys()].find((g) => g > 1 && !gids.includes(g) && (original.glyphExtents(g)?.width ?? 0) > 0)!
    expect(trimmed.glyphExtents(unused)?.width ?? 0).toBe(0)
  })

  it('draws glyph outlines within their bounds and finds an empty glyph', () => {
    for (const script of ['tamil', 'devanagari'] as IndicScript[]) {
      const data = fontFile(script)
      const font = parseTrueType(data)
      const hbFont = new hb.Font(new hb.Face(new hb.Blob(data)))
      expect(font.advance(blankGlyph(font))).toBe(0)
      for (let gid = 2; gid < font.numGlyphs; gid += 37) {
        const e = hbFont.glyphExtents(gid)
        const path = glyphPath(font, gid)
        if (!e || !e.width) continue
        expect(path).toMatch(/ m\n/)
        const nums = path.match(/-?\d+(\.\d+)?(?= )/g)!.map(Number)
        const xs = nums.filter((_, i) => i % 2 === 0)
        const ys = nums.filter((_, i) => i % 2 === 1)
        expect(Math.min(...xs)).toBeGreaterThanOrEqual(e.xBearing - 1)
        expect(Math.max(...xs)).toBeLessThanOrEqual(e.xBearing + e.width + 1)
        expect(Math.max(...ys)).toBeLessThanOrEqual(e.yBearing + 1)
        expect(Math.min(...ys)).toBeGreaterThanOrEqual(e.yBearing + e.height - 1)
      }
    }
  })
})

const SCRIPT = `Title: வாலி
Credit: Written by
Author: மணி ரத்னம்

INT. வீடு - இரவு

மாறன் ஜன்னலைத் திறக்கிறான். கௌரவம் பொன்னியின் செல்வன் டிக்கெட் கூடாது.

@வாலி
(மெதுவாக)
நான் உன்னைக் காதலிக்கிறேன். ஸ்ரீ க்ஷ

INT. ఇల్లు - రాత్రి

రాత్రి వీధిలో శ్రీ కృష్ణ నడుస్తున్నాడు. జ్ఞానం కార్యక్రమం స్త్రీ.

EXT. ಮನೆ - ಹಗಲು

ರಾತ್ರಿ ಮನೆಯಲ್ಲಿ ಕೃಷ್ಣ ಬರುತ್ತಾನೆ. ಸ್ತ್ರೀ ಶ್ರೀ ಜ್ಞಾನ ಕಾರ್ಯಕ್ರಮ.

EXT. വീട് - പകൽ

രാത്രി വീട്ടിൽ കൃഷ്ണൻ വരുന്നു. സ്ത്രീ ശ്രീ ജ്ഞാനം കാര്യക്രമം.

INT. कमरा - रात

रात को गली में कृष्ण चलता है। क्षत्रिय हिन्दी प्रार्थना राष्ट्र ज़िंदगी दृश्य।

MAYA
Mixed English and हिन्दी in one line.

@ராணி
${Array.from({ length: 16 }, (_, i) => `இது ஒரு நீண்ட பேச்சின் ${i + 1}வது வாக்கியம், இது பக்கங்களைத் தாண்டும்.`).join(' ')}
`

const simplify = (els: ScriptElement[]) =>
  els.filter((e) => e.type !== 'section' && e.type !== 'note').map((e) => [e.type, plainText(e).replace(/\s+/g, ' ').trim()])

describe('Indian scripts: PDF', () => {
  let shaper: Shaper
  beforeAll(async () => {
    shaper = await createShaper(Object.fromEntries((Object.keys(FILES) as IndicScript[]).map((s) => [s, fontFile(s)])))
  })

  it('embeds shaped text that reads back exactly, and imports again', async () => {
    const { elements, titlePage } = parseFountain(SCRIPT)
    const { blob, missing } = await exportPdf(elements, { settings: DEFAULT_SETTINGS, titlePage: { ...emptyTitlePage(), ...titlePage }, shaper })
    expect(missing).toEqual([])
    const bytes = new Uint8Array(await blob.arrayBuffer())
    if (process.env.INDIC_PDF_OUT) writeFileSync(process.env.INDIC_PDF_OUT, bytes)
    const pages = await readPdfPages(bytes, pdfjs as unknown as PdfJsLike)
    expect(pages.length).toBeGreaterThanOrEqual(3)
    const text = pages.map((p) => p.items.map((i) => i.str).join('')).join('\n')
    for (const phrase of ['மாறன் ஜன்னலைத் திறக்கிறான்', 'கௌரவம்', 'శ్రీ కృష్ణ', 'ಕಾರ್ಯಕ್ರಮ', 'കാര്യക്രമം', 'क्षत्रिय', 'हिन्दी']) {
      expect(text).toContain(phrase)
    }
    // No stray characters from glyphs that stand for part of a syllable.
    expect(text).not.toMatch(/[\u0000-\u0009\u000b-\u001f�]/)

    const back = parsePdfPages(pages)
    expect(back.titlePage).toMatchObject({ title: 'வாலி', credit: 'Written by', author: 'மணி ரத்னம்' })
    expect(simplify(back.elements)).toEqual(simplify(elements))
  }, 30000)

  it('keeps text in scripts it has no font for as "?"', async () => {
    const { elements } = parseFountain('INT. ঘর - রাত\n\nবাংলা வீடு.\n')
    const { missing } = await exportPdf(elements, { settings: { ...DEFAULT_SETTINGS, includeTitlePage: false }, shaper })
    expect(missing).toEqual(['ঘ', 'র', 'রা', 'ত', 'বাং', 'লা'])
  })
})

describe('Indian scripts: writing', () => {
  it('writes Fountain cues with "@", since these scripts have no capitals', () => {
    const { elements } = parseFountain('INT. வீடு - இரவு\n\n@வாலி\nவணக்கம்.\n\nMAYA\nHello.\n')
    const fountain = toFountain(elements)
    expect(fountain).toContain('@வாலி\nவணக்கம்.')
    expect(fountain).toContain('\nMAYA\nHello.')
    expect(simplify(parseFountain(fountain).elements)).toEqual(simplify(elements))
  })

  it('counts words that contain vowel signs and viramas as one', () => {
    expect(countWords('நான் உன்னைக் காதலிக்கிறேன்.')).toBe(3)
    expect(countWords('कृष्ण चलता है।')).toBe(3)
    expect(countWords('శ్రీ కృష్ణ')).toBe(2)
  })

  it('finds a name mentioned in action only as a whole word', () => {
    const { elements } = parseFountain('INT. வீடு - இரவு\n\nராம வருகிறான்.\n\nINT. தெரு - பகல்\n\nராமா காத்திருக்கிறாள்.\n')
    const scenes = analyze(elements).scenes
    expect(scenesMentioning(elements, scenes, 'ராம')).toEqual([scenes[0].id])
  })
})
