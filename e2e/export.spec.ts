import { readFile } from 'node:fs/promises'
import { expect, test, type FrameLocator, type Page } from '@playwright/test'

async function openSample(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Open sample script' }).click()
  await expect(page.locator('.script-editor')).toBeVisible()
}

async function exportFrom(app: Page | FrameLocator, label: string) {
  await app.getByRole('button', { name: 'Export' }).click()
  await app.getByRole('menuitem', { name: new RegExp(`^${label}`) }).click()
}

test('download names keep the title as the writer typed it', async ({ page }) => {
  await page.goto('/')
  const fountain = 'Title: Vāli: “The Return”\n\nINT. TEMPLE - DAY\n\nBells ring.\n'
  await page.getByLabel('File to import').setInputFiles({ name: 'vali.fountain', mimeType: 'text/plain', buffer: Buffer.from(fountain) })
  await expect(page.locator('.project-title')).toHaveText('Vāli: “The Return”')
  for (const [label, name] of [
    ['Fountain', 'Vāli - “The Return”.fountain'],
    ['PDF', 'Vāli - “The Return”.pdf'],
  ]) {
    const download = page.waitForEvent('download')
    await exportFrom(page, label)
    expect((await download).suggestedFilename()).toBe(name)
  }

  await page.getByRole('button', { name: 'Snapshots' }).click()
  await page.getByLabel('Snapshot name').fill('Director’s cut: v2')
  await page.getByRole('button', { name: 'Save snapshot' }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download as Fountain' }).click()
  expect((await download).suggestedFilename()).toBe('Director’s cut - v2.fountain')
})

test('the scene report opens cleanly in spreadsheets', async ({ page }) => {
  await openSample(page)
  await page.getByRole('button', { name: 'Reports', exact: true }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Scene report (CSV)' }).click()
  const file = await download
  expect(file.suggestedFilename()).toBe('The Last Lighthouse - scene report.csv')
  const bytes = await readFile(await file.path())
  // A byte-order mark so Excel reads UTF-8, and CRLF line ends.
  expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
  const lines = bytes.subarray(3).toString('utf8').split('\r\n')
  expect(lines[0]).toBe('Scene,Heading,INT/EXT,Location,Time,Page,Length (eighths),Length,Characters,Synopsis')
  expect(lines).toHaveLength(1 + 6 + 1)
  expect(lines.at(-1)).toBe('')
})

/* ------------------------------------------------------------------ */
/* Hosted on claude.ai                                                 */
/* ------------------------------------------------------------------ */

interface SavedFile {
  filename: string
  size: number
  head: string
  /** Name of the first file inside a zip. */
  inner?: string
}

/**
 * Open the app inside a frame, the way the claude.ai artifact viewer shows it,
 * with a stand-in for the viewer's downloads capability.
 */
async function openInViewer(page: Page, downloads: 'granted' | 'absent') {
  await page.route('**/viewer.html', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><body style="margin:0"><iframe src="/" style="border:0;width:100vw;height:100vh"></iframe>' }),
  )
  await page.addInitScript((mode) => {
    if (window.top === window.self) return
    const saves: SavedFile[] = []
    const api = Object.freeze({
      async save({ filename, data }: { filename: string; data: string | Blob }) {
        const bytes = new Uint8Array(await new Response(data).arrayBuffer())
        const head = String.fromCharCode(...bytes.subarray(0, 4))
        const inner = head === 'PK\x03\x04' ? new TextDecoder().decode(bytes.subarray(30, 30 + (bytes[26] | (bytes[27] << 8)))) : undefined
        saves.push({ filename, size: bytes.length, head, inner })
        return { status: 'saved' }
      },
    })
    Object.assign(window, { __saves: saves })
    Object.defineProperty(window, 'claude', { value: Object.freeze({ use: async (name: string) => (name === 'downloads' && mode === 'granted' ? api : null) }) })
  }, downloads)
  await page.goto('/viewer.html')
  const app = page.frameLocator('iframe')
  await app.getByRole('button', { name: 'Open sample script' }).click()
  await expect(app.locator('.script-editor')).toBeVisible()
  return app
}

function savedFiles(page: Page): Promise<SavedFile[]> {
  const frame = page.frames().find((f) => f !== page.mainFrame())!
  return frame.evaluate(() => (window as unknown as { __saves: SavedFile[] }).__saves)
}

test('in the claude.ai viewer, exports are saved through the viewer in file types it accepts', async ({ page }) => {
  const browserDownloads: string[] = []
  page.on('download', (d) => browserDownloads.push(d.suggestedFilename()))
  const app = await openInViewer(page, 'granted')

  // Pages in the viewer can't open the print dialog, so printing isn't offered.
  await app.getByRole('button', { name: 'Export' }).click()
  await expect(app.getByRole('menuitem', { name: /^Project backup/ })).toBeVisible()
  await expect(app.getByRole('menuitem', { name: /^Print/ })).toHaveCount(0)
  await app.getByRole('button', { name: 'Export' }).click()

  const expected: Partial<SavedFile>[] = []
  const expectSaved = async (file: Partial<SavedFile>) => {
    expected.push(file)
    await expect.poll(async () => (await savedFiles(page)).length).toBe(expected.length)
    expect((await savedFiles(page)).at(-1)).toMatchObject(file)
  }
  await exportFrom(app, 'PDF')
  await expectSaved({ filename: 'The Last Lighthouse.pdf', head: '%PDF' })
  await exportFrom(app, 'Fountain')
  await expectSaved({ filename: 'The Last Lighthouse.fountain.txt', head: 'Titl' })
  await exportFrom(app, 'Final Draft')
  await expectSaved({ filename: 'The Last Lighthouse.fdx.zip', head: 'PK\x03\x04', inner: 'The Last Lighthouse.fdx' })
  await exportFrom(app, 'Project backup')
  await expectSaved({ filename: 'The Last Lighthouse.screenplay.json', head: '{\n  ' })

  await app.getByRole('button', { name: 'Preview', exact: true }).click()
  await expect(app.getByRole('button', { name: 'Download PDF' })).toBeVisible()
  await expect(app.getByRole('button', { name: 'Print', exact: true })).toHaveCount(0)
  await app.getByRole('button', { name: 'Download PDF' }).click()
  await expectSaved({ filename: 'The Last Lighthouse.pdf', head: '%PDF' })

  await app.getByRole('button', { name: 'Reports', exact: true }).click()
  await app.getByRole('button', { name: 'Scene report (CSV)' }).click()
  await expectSaved({ filename: 'The Last Lighthouse - scene report.csv', head: '\xef\xbb\xbfS' })

  await app.getByRole('button', { name: 'Back to library' }).click()
  await app.getByRole('button', { name: 'More actions for The Last Lighthouse' }).first().click()
  await app.getByRole('button', { name: 'Download backup' }).click()
  await expectSaved({ filename: 'The Last Lighthouse.screenplay.json', head: '{\n  ' })

  expect(browserDownloads).toEqual([])
})

test('in the claude.ai viewer without the downloads capability, the writer is told the file wasn’t saved', async ({ page }) => {
  const browserDownloads: string[] = []
  page.on('download', (d) => browserDownloads.push(d.suggestedFilename()))
  const app = await openInViewer(page, 'absent')
  await exportFrom(app, 'Fountain')
  await expect(app.locator('.toast.error')).toContainText('Saving files isn’t available in this view')
  expect(browserDownloads).toEqual([])
})
