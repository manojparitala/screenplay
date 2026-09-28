import { describe, expect, it } from 'vitest'
import { parseFountain } from './fountain'
import { drawScript, exportPdf, pdfUnsupportedCharacters, type PdfSurface } from './pdf'
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
