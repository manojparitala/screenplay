import { describe, expect, it } from 'vitest'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { parseFountain } from './fountain'
import { exportPdf } from './pdf'
import { looksIndented, parseIndentedText, parsePdfPages, type PdfItem, type PdfPage } from './pdfimport'
import { readPdfPages, type PdfJsLike } from './pdfread'
import { SAMPLE_FOUNTAIN } from './sample'
import { asciiSafe, plainText } from './text'
import { DEFAULT_SETTINGS, emptyTitlePage, type ScriptElement } from './types'

pdfjs.GlobalWorkerOptions.workerSrc = new URL('../../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url).href

const simplify = (els: ScriptElement[]) =>
  els.map((e) => {
    let t = asciiSafe(plainText(e)).replace(/\s+/g, ' ').trim()
    if (['scene', 'character', 'transition', 'shot'].includes(e.type)) t = t.toUpperCase()
    return [e.type, t]
  })

describe('PDF import', () => {
  it('reads back a screenplay PDF exported by this app', async () => {
    const { elements, titlePage } = parseFountain(
      SAMPLE_FOUNTAIN +
        '\nINT. HALL - NIGHT\n\nMAREN\n' +
        Array.from({ length: 30 }, (_, i) => `This is sentence ${i} of a very long speech.`).join(' ') +
        '\n\nTHE END\n',
    )
    const settings = { ...DEFAULT_SETTINGS, showSceneNumbers: true }
    const { blob } = await exportPdf(elements, { settings, titlePage: { ...emptyTitlePage(), ...titlePage } })
    const pages = await readPdfPages(new Uint8Array(await blob.arrayBuffer()), pdfjs as unknown as PdfJsLike)
    const result = parsePdfPages(pages)

    expect(result.titlePage).toMatchObject({ title: 'THE LAST LIGHTHOUSE', credit: 'Written by', author: 'A. Screenwriter', draftDate: 'First Draft' })
    expect(result.titlePage.contact).toContain('writer@example.com')
    // Everything that prints comes back as the same element, in order. (MORE) and
    // the repeated cue on the next page are folded back into one speech.
    const printable = elements.filter((e) => e.type !== 'section' && e.type !== 'note')
    expect(simplify(result.elements)).toEqual(simplify(printable).map(([type, text]) => [type === 'centered' ? 'centered' : type, text]))
  }, 30000)

  it('uses printed scene numbers to find headings that lack INT./EXT.', async () => {
    const { elements } = parseFountain(
      Array.from({ length: 30 }, (_, i) => `.MONTAGE ${i + 1} - THE CITY WAKES\n\nTRAFFIC SURGES ACROSS THE BRIDGE.\n\nPeople hurry past.\n`).join('\n'),
    )
    const { blob } = await exportPdf(elements, { settings: { ...DEFAULT_SETTINGS, showSceneNumbers: true, includeTitlePage: false } })
    const pages = await readPdfPages(new Uint8Array(await blob.arrayBuffer()), pdfjs as unknown as PdfJsLike)
    const back = parsePdfPages(pages).elements
    expect(back.filter((e) => e.type === 'scene').map(plainText)).toEqual(elements.filter((e) => e.type === 'scene').map(plainText))
    // Capitalised action lines are still action.
    expect(back.filter((e) => e.type === 'action' && plainText(e).startsWith('TRAFFIC'))).toHaveLength(30)
  }, 30000)

  it('reads a web-page printout with a sidebar, headers and bold cues', () => {
    const item = (str: string, x: number, y: number, font = 'Menlo-Regular'): PdfItem => ({ str, x, y, width: str.length * 4.8, height: 8, font })
    const page = (n: number, body: PdfItem[]): PdfPage => ({
      width: 612,
      height: 792,
      items: [
        item('9/27/26, 7:03 PM', 535, 768, 'SFNS-Regular'),
        item(`https://example.com/script.html Page ${n} of 3`, 18, 43, 'SFNS-Regular'),
        item('Genre', 24, 700, 'ArialMT'),
        item('Action Adventure', 24, 690, 'ArialMT'),
        ...body,
      ],
    })
    let y = 740
    const at = (str: string, x: number, font?: string, gap = 1) => {
      y -= 9 * gap
      return item(str, x, y, font)
    }
    const p1 = page(1, [
      at('MY FILM', 300, 'Menlo-Bold'),
      at('by', 340),
      at('Ann Writer', 320),
      at('A1', 120, 'Menlo-Bold', 2),
      at('EXT THE STREAM - DAWN', 120, 'Menlo-Bold'),
      at('Moonwatcher reaches the shallow stream and drinks. The ter-', 120, undefined, 2),
      at('ritory is quiet.', 120),
      at('a1', 510),
      at('POOLE', 332, 'Menlo-Bold', 2),
      at('(quietly) Is anyone', 332),
      at('there?', 332),
      at('HAL', 332, 'Menlo-Bold', 2),
      at("That's true.", 332),
      at('CONTINUED', 120, 'Menlo-Bold', 2),
    ])
    y = 740
    const p2 = page(2, [
      at("HAL (cont'd)", 332, 'Menlo-Bold'),
      at('Quite true.', 332),
      at('More of the same speech.', 332, undefined, 2),
      at('12/14/65 c15e', 120, undefined, 2),
      at('C12', 120, 'Menlo-Bold', 2),
      at('POD SLOWLY EDGES', 120, 'Menlo-Bold'),
      at('OUT OF POD BAY.', 120, 'Menlo-Bold'),
      at('FADE OUT.', 450, 'Menlo-Bold', 2),
    ])
    const { titlePage, elements } = parsePdfPages([p1, p2])
    expect(titlePage).toMatchObject({ title: 'MY FILM', credit: 'by', author: 'Ann Writer' })
    expect(elements.map((e) => [e.type, plainText(e)])).toEqual([
      ['scene', 'EXT THE STREAM - DAWN'],
      ['action', 'Moonwatcher reaches the shallow stream and drinks. The territory is quiet.'],
      ['character', 'POOLE'],
      ['parenthetical', '(quietly)'],
      ['dialogue', 'Is anyone there?'],
      ['character', 'HAL'],
      ['dialogue', "That's true. Quite true.\nMore of the same speech."],
      ['scene', 'POD SLOWLY EDGES OUT OF POD BAY.'],
      ['transition', 'FADE OUT.'],
    ])
  })
})

describe('indented plain-text import', () => {
  const script = [
    '                                 BIG FISH',
    '',
    '                               Written by',
    '                               John August',
    '',
    'EXT. RIVER - DAY (1973)',
    '',
    'We\'re in a river. Clear water rushing over the stones.',
    '',
    '                         EDWARD (V.O.)',
    '               There are some fish that cannot be',
    '               caught.',
    '',
    '                         YOUNG EDWARD',
    '                    (to the fish)',
    '               Hello there.',
    '',
    '                                                    CUT TO:',
    '',
    'INT. BEDROOM - NIGHT',
    '',
    'Will sleeps.',
    ...Array.from({ length: 16 }, (_, i) => (i % 2 ? '' : `               Line ${i}.`)),
  ].join('\n')

  it('recognises an indented layout', () => {
    expect(looksIndented(script)).toBe(true)
    expect(looksIndented('INT. HOUSE - DAY\n\nBOB\nHi.\n')).toBe(false)
  })

  it('classifies elements by indentation', () => {
    const { titlePage, elements } = parseIndentedText(script)
    expect(titlePage).toMatchObject({ title: 'BIG FISH', credit: 'Written by', author: 'John August' })
    expect(elements.slice(0, 9).map((e) => [e.type, plainText(e)])).toEqual([
      ['scene', 'EXT. RIVER - DAY (1973)'],
      ['action', "We're in a river. Clear water rushing over the stones."],
      ['character', 'EDWARD (V.O.)'],
      ['dialogue', 'There are some fish that cannot be caught.'],
      ['character', 'YOUNG EDWARD'],
      ['parenthetical', '(to the fish)'],
      ['dialogue', 'Hello there.'],
      ['transition', 'CUT TO:'],
      ['scene', 'INT. BEDROOM - NIGHT'],
    ])
  })
})
