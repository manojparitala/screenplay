import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { watchPage } from './helpers'

const SCRIPT = `Title: வாலி
Author: மணி ரத்னம்

INT. வீடு - இரவு

மாறன் ஜன்னலைத் திறக்கிறான். மழை பெய்கிறது, தெரு விளக்குகள் மின்னுகின்றன.

@வாலி
(மெதுவாக)
நான் உன்னைக் காதலிக்கிறேன்.

INT. ఇల్లు - రాత్రి

రాత్రి వీధిలో శ్రీ కృష్ణ నడుస్తున్నాడు.

EXT. ಮನೆ - ಹಗಲು

ರಾತ್ರಿ ಮನೆಯಲ್ಲಿ ಕೃಷ್ಣ ಬರುತ್ತಾನೆ.

EXT. വീട് - പകൽ

രാത്രി വീട്ടിൽ കൃഷ്ണൻ വരുന്നു.

INT. कमरा - रात

MAYA
मैं तुमसे प्यार करता हूँ। Really.
`

async function importScript(page: Page) {
  await page.goto('/')
  await page.getByLabel('File to import').setInputFiles({ name: 'vali.fountain', mimeType: 'text/plain', buffer: Buffer.from(SCRIPT) })
  await expect(page.locator('.project-title')).toHaveText('வாலி')
  // The bundled fonts load as soon as the editor shows text in their scripts.
  await page.waitForFunction(() =>
    ['Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Devanagari'].every((s) => document.fonts.check(`16px "Screenplay ${s}"`, s === 'Tamil' ? 'க' : s === 'Telugu' ? 'క' : s === 'Kannada' ? 'ಕ' : s === 'Malayalam' ? 'ക' : 'क')),
  )
}

test('writes in Tamil, Telugu, Kannada, Malayalam and Hindi with the bundled fonts', async ({ page }) => {
  await importScript(page)
  await expect(page.locator('.nav-scene')).toHaveCount(5)
  await expect(page.locator('.el-character').first()).toHaveText('வாலி')
  // Character tracking reads names in scripts without capitals.
  await page.getByRole('button', { name: 'Characters', exact: true }).click()
  await expect(page.locator('.detail-title h1')).toHaveText(/வாலி|MAYA/)

  // The preview lays the page out like the PDF, with the same fonts.
  await page.getByRole('button', { name: 'Preview', exact: true }).click()
  const tamil = page.locator('.sheet .sheet-indic', { hasText: 'மாறன்' })
  await expect(tamil).toHaveCount(1)
  const family = await tamil.evaluate((el) => getComputedStyle(el).fontFamily)
  expect(family).toContain('Screenplay Tamil')
  // Each script run is its own <text>; put the page's lines back together by baseline.
  const lines = await page.locator('.sheet').nth(1).evaluate((svg) => {
    const rows = new Map<number, { x: number; text: string }[]>()
    for (const t of svg.querySelectorAll('text')) {
      const y = Number(t.getAttribute('y'))
      rows.set(y, [...(rows.get(y) ?? []), { x: Number(t.getAttribute('x')), text: t.textContent ?? '' }])
    }
    return [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, r]) => r.sort((a, b) => a.x - b.x).map((p) => p.text).join(''))
  })
  expect(lines).toContain('INT. வீடு - இரவு')
  expect(lines).toContain('मैं तुमसे प्यार करता हूँ। Really.')
  // The long action line wraps onto as many lines in the preview as in the editor.
  const previewCount = lines.filter((l) => /மாறன்|மழை|தெரு|விளக்குகள்|மின்னுகின்றன/.test(l)).length
  await page.getByRole('button', { name: 'Script', exact: true }).click()
  const editorCount = await page.locator('.el-action').first().evaluate((el) => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)))
  expect(previewCount).toBe(2)
  expect(editorCount).toBe(previewCount)
})

test('exports a PDF with shaped Indian scripts that imports back', async ({ page }, testInfo) => {
  const watch = watchPage(page)
  await importScript(page)
  await page.getByRole('button', { name: 'Export' }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('menuitem', { name: /^PDF/ }).click()
  const file = await download
  expect(file.suggestedFilename()).toBe('வாலி.pdf')
  const path = testInfo.outputPath('vali.pdf')
  await file.saveAs(path)
  const pdf = (await readFile(path)).toString('latin1')
  expect(pdf.startsWith('%PDF-')).toBe(true)
  for (const font of ['NotoSansTamil', 'NotoSansTelugu', 'NotoSansKannada', 'NotoSansMalayalam', 'NotoSansDevanagari']) expect(pdf).toContain(font)
  // No warning: every character could be drawn.
  await expect(page.locator('.toast.error')).toHaveCount(0)

  await page.getByRole('button', { name: 'Back to library' }).click()
  await page.getByLabel('File to import').setInputFiles(path)
  await watch.expectVisible(page.locator('.script-editor'))
  await expect(page.locator('.project-title')).toHaveText('வாலி')
  await expect(page.locator('.nav-scene .heading')).toHaveText(['INT. வீடு - இரவு', 'INT. ఇల్లు - రాత్రి', 'EXT. ಮನೆ - ಹಗಲು', 'EXT. വീട് - പകൽ', 'INT. कमरा - रात'])
  await expect(page.locator('.el-character')).toHaveText(['வாலி', 'MAYA'])
  await expect(page.locator('.el-dialogue').last()).toHaveText('मैं तुमसे प्यार करता हूँ। Really.')
})
