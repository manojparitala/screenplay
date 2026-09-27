import { describe, expect, it } from 'vitest'
import { parseFountain } from './fountain'
import { drawScript, exportPdf, type PdfSurface } from './pdf'
import { SAMPLE_FOUNTAIN } from './sample'
import { DEFAULT_SETTINGS, emptyTitlePage } from './types'

function recorder() {
  const calls: { text: string; x: number; y: number; page: number }[] = []
  let page = 1
  const surface: PdfSurface = {
    setFont: () => {},
    text: (text, x, y) => calls.push({ text, x, y, page }),
    line: () => {},
    addPage: () => {
      page++
    },
  }
  return { calls, surface, pages: () => page }
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

  it('produces a PDF blob with jsPDF', async () => {
    const blob = await exportPdf(elements, { settings: DEFAULT_SETTINGS, titlePage: tp })
    const head = new TextDecoder().decode(new Uint8Array(await blob.arrayBuffer()).slice(0, 5))
    expect(head).toBe('%PDF-')
  })
})
