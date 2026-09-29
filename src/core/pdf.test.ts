import { describe, expect, it } from 'vitest'
import { parseFountain } from './fountain'
import { drawScript, exportPdf, pageSize, pdfUnsupportedCharacters, type PdfSurface } from './pdf'
import { SAMPLE_FOUNTAIN } from './sample'
import { DEFAULT_SETTINGS, emptyTitlePage } from './types'

function recorder() {
  const calls: { text: string; x: number; y: number; page: number; script: string | null }[] = []
  let page = 1
  const surface: PdfSurface = {
    text: (span) => {
      calls.push({ text: span.text, x: span.x, y: span.y, page, script: span.script })
    },
    line: () => {},
    addPage: () => {
      page++
    },
  }
  return { calls, surface, pages: () => page }
}

/** Text of each printed line: the spans on one baseline, joined. */
function lineTexts(calls: ReturnType<typeof recorder>['calls']): string[] {
  const lines = new Map<string, string>()
  for (const c of [...calls].sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x)) {
    const key = `${c.page}:${c.y}`
    lines.set(key, (lines.get(key) ?? '') + c.text)
  }
  return [...lines.values()]
}

describe('pdf layout', () => {
  const { elements, titlePage } = parseFountain(SAMPLE_FOUNTAIN)
  const tp = { ...emptyTitlePage(), ...titlePage }

  it('draws a title page followed by numbered script pages', () => {
    const r = recorder()
    const count = drawScript(r.surface, elements, { settings: DEFAULT_SETTINGS, titlePage: tp })
    expect(count).toBe(r.pages())
    expect(r.calls.find((c) => c.page === 1 && c.text === 'THE LAST LIGHTHOUSE')).toBeTruthy()
    const heading = r.calls.find((c) => c.text === 'EXT. NORTHERN COAST - LIGHTHOUSE - DUSK')!
    expect(heading.page).toBe(2)
    expect(heading.x).toBe(108) // 1.5in left margin
    // Character cues sit 2.2in right of the margin.
    const cue = r.calls.find((c) => c.text === 'TEO')!
    expect(cue.x).toBeCloseTo(108 + 22 * 7.2)
    // Page numbers start on the second script page.
    if (count > 2) expect(r.calls.some((c) => c.page === 3 && c.text === '2.')).toBe(true)
  })

  it('omits the title page when disabled and prints scene numbers when enabled', () => {
    const r = recorder()
    drawScript(r.surface, elements, {
      settings: { ...DEFAULT_SETTINGS, includeTitlePage: false, showSceneNumbers: true },
      titlePage: tp,
    })
    expect(r.calls[0].text).not.toBe('THE LAST LIGHTHOUSE')
    expect(r.calls.filter((c) => c.text === '1').length).toBe(2)
  })

  it('limits downloaded PDFs to the Courier character set but keeps previews in Unicode', () => {
    const els = parseFountain('INT. CAFÉ - NIGHT\n\nவாலி smiles. Łukasz waves.\n').elements
    const pdf = recorder()
    drawScript(pdf.surface, els, { settings: { ...DEFAULT_SETTINGS, includeTitlePage: false }, charset: 'pdf' })
    expect(pdf.calls.map((c) => c.text)).toContain('?? smiles. Lukasz waves.')
    expect(pdf.calls.map((c) => c.text)).toContain('INT. CAFÉ - NIGHT')
    const preview = recorder()
    drawScript(preview.surface, els, { settings: { ...DEFAULT_SETTINGS, includeTitlePage: false } })
    expect(lineTexts(preview.calls)).toContain('வாலி smiles. Łukasz waves.')
    expect(pdfUnsupportedCharacters(els)).toEqual(['வா', 'லி'])
    expect(pdfUnsupportedCharacters(elements, tp)).toEqual([])
  })

  it('keeps Indian scripts when the PDF has fonts for them, as separate runs', () => {
    const els = parseFountain('INT. CAFÉ - NIGHT\n\nவாலி smiles at నాని.\n').elements
    const pdf = recorder()
    drawScript(pdf.surface, els, { settings: { ...DEFAULT_SETTINGS, includeTitlePage: false }, charset: 'pdf', keepIndic: true })
    const action = pdf.calls.filter((c) => c.y === pdf.calls.find((d) => d.text === 'வாலி')!.y)
    expect(action.map((c) => [c.text, c.script])).toEqual([
      ['வாலி', 'tamil'],
      [' smiles at ', null],
      ['నాని', 'telugu'],
      ['.', null],
    ])
    // Runs follow each other without gaps.
    expect(action[1].x).toBeGreaterThan(action[0].x)
    expect(action[2].x).toBeCloseTo(action[1].x + ' smiles at '.length * 7.2)
    expect(pdfUnsupportedCharacters(els, undefined, true)).toEqual([])
  })

  it('produces a PDF file', async () => {
    const { blob, missing } = await exportPdf(elements, { settings: DEFAULT_SETTINGS, titlePage: tp })
    const head = new TextDecoder().decode(new Uint8Array(await blob.arrayBuffer()).slice(0, 5))
    expect(head).toBe('%PDF-')
    expect(missing).toEqual([])
  })
})

describe('paper and page furniture', () => {
  const { elements, titlePage } = parseFountain(SAMPLE_FOUNTAIN)
  const tp = { ...emptyTitlePage(), ...titlePage }
  const long = parseFountain(Array.from({ length: 200 }, (_, i) => `INT. ROOM ${i} - DAY\n\nSomething happens here.\n`).join('\n')).elements

  it('fits 59 lines on A4 and 55 on US Letter, with the text in the same place', () => {
    const letter = recorder()
    const a4 = recorder()
    const settings = { ...DEFAULT_SETTINGS, includeTitlePage: false }
    drawScript(letter.surface, long, { settings })
    drawScript(a4.surface, long, { settings: { ...settings, paper: 'a4' } })
    expect(a4.pages()).toBeLessThan(letter.pages())
    expect(pageSize({ paper: 'a4' })).toEqual({ width: expect.closeTo(595.28, 1), height: expect.closeTo(841.89, 1) })
    // Headings start at the same left margin and the page number ends at the same right edge.
    const heading = (r: ReturnType<typeof recorder>) => r.calls.find((c) => c.text === 'INT. ROOM 0 - DAY')!
    expect(heading(a4).x).toBe(heading(letter).x)
    const pageNumber = (r: ReturnType<typeof recorder>) => r.calls.find((c) => c.text === '2.')!
    expect(pageNumber(a4).x).toBe(pageNumber(letter).x)
    // The deepest line on an A4 page sits lower than any line on a Letter page.
    const lowest = (r: ReturnType<typeof recorder>) => Math.max(...r.calls.filter((c) => c.page === 1).map((c) => c.y))
    expect(lowest(a4) - lowest(letter)).toBeCloseTo(4 * 12, 0)
  })

  it('centres the title page on the paper', () => {
    const r = recorder()
    drawScript(r.surface, elements, { settings: { ...DEFAULT_SETTINGS, paper: 'a4' }, titlePage: tp })
    const title = r.calls.find((c) => c.text === 'THE LAST LIGHTHOUSE')!
    expect(title.x + ('THE LAST LIGHTHOUSE'.length * 7.2) / 2).toBeCloseTo(pageSize({ paper: 'a4' }).width / 2)
  })

  it('prints the header after the first page and the footer on every script page', () => {
    const r = recorder()
    drawScript(r.surface, long, { settings: { ...DEFAULT_SETTINGS, header: 'LONG DAY – Blue draft', footer: '© 2026 A. Writer' }, titlePage: tp })
    const pages = r.pages()
    const on = (text: string) => [...new Set(r.calls.filter((c) => c.text === text).map((c) => c.page))]
    // Page 1 is the title page, page 2 the first script page.
    expect(on('LONG DAY - Blue draft')).toEqual(Array.from({ length: pages - 2 }, (_, i) => i + 3))
    expect(on('© 2026 A. Writer')).toEqual(Array.from({ length: pages - 1 }, (_, i) => i + 2))
    const footer = r.calls.find((c) => c.text === '© 2026 A. Writer')!
    expect(footer.y).toBeGreaterThan(740)
  })

  it('shortens a header that would run into the page number', () => {
    const r = recorder()
    drawScript(r.surface, long, { settings: { ...DEFAULT_SETTINGS, includeTitlePage: false, header: 'X'.repeat(80) } })
    const header = r.calls.find((c) => c.page === 2 && c.text.startsWith('XXX'))!
    expect(header.text).toBe('X'.repeat(47) + '...')
  })

  it('writes the page size into the PDF', async () => {
    const { blob } = await exportPdf(elements, { settings: { ...DEFAULT_SETTINGS, paper: 'a4' }, titlePage: tp })
    const pdf = new TextDecoder('latin1').decode(new Uint8Array(await blob.arrayBuffer()))
    expect(pdf).toContain('/MediaBox [0 0 595.276 841.89]')
    expect(pdf).not.toContain('/MediaBox [0 0 612 792]')
  })
})
