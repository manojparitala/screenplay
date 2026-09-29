import { expect, test, type Page } from '@playwright/test'
import { paste, watchPage } from './helpers'

async function openSample(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Open sample script' }).click()
  await expect(page.locator('.script-editor')).toBeVisible()
}

const headings = (page: Page) => page.locator('.nav-scene .heading').allTextContents()

test('every view renders the sample script without errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await openSample(page)
  for (const [tab, check] of [
    ['Cards', '.index-card'],
    ['Beats', '.beat'],
    ['Characters', '.detail-title'],
    ['Timeline', '.journeys'],
    ['Relationships', '.network svg'],
    ['Locations', '.detail-title'],
    ['Reports', '.kpi'],
    ['Title Page', '.sheet'],
    ['Notes', '.script-note'],
    ['Preview', '.sheet'],
    ['Script', '.script-editor'],
  ] as const) {
    await page.getByRole('button', { name: tab, exact: true }).click()
    await expect(page.locator(check).first()).toBeVisible()
  }
  expect(errors).toEqual([])
})

test('dragging an index card reorders the script, and undo restores it', async ({ page }) => {
  await openSample(page)
  const before = await headings(page)
  await page.getByRole('button', { name: 'Cards', exact: true }).click()
  const cards = page.locator('.index-card')
  await cards.nth(2).locator('.grip').dragTo(cards.nth(0))
  await page.getByRole('button', { name: 'Script', exact: true }).click()
  const after = await headings(page)
  expect(after[0]).toBe(before[2])
  expect(after.slice(1, 3)).toEqual(before.slice(0, 2))
  await page.locator('.script-editor').click()
  await page.keyboard.press('ControlOrMeta+z')
  expect(await headings(page)).toEqual(before)
})

test('a quick drag moves the card even before the page redraws', async ({ page }) => {
  await openSample(page)
  const before = await headings(page)
  await page.getByRole('button', { name: 'Cards', exact: true }).click()
  await expect(page.locator('.index-card')).toHaveCount(6)
  // Every drag event at once, with no time to redraw in between.
  await page.evaluate(() => {
    const cards = document.querySelectorAll('.index-card')
    const grip = cards[2].querySelector('.grip')!
    const data = new DataTransfer()
    const fire = (target: Element, type: string) => {
      const event = new DragEvent(type, { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'dataTransfer', { value: data })
      target.dispatchEvent(event)
    }
    fire(grip, 'dragstart')
    fire(cards[0], 'dragenter')
    fire(cards[0], 'dragover')
    fire(cards[0], 'drop')
    fire(grip, 'dragend')
  })
  await page.getByRole('button', { name: 'Script', exact: true }).click()
  expect((await headings(page))[0]).toBe(before[2])
})

test('renaming a character updates cues and action lines', async ({ page }) => {
  await openSample(page)
  await page.getByRole('button', { name: 'Characters', exact: true }).click()
  await page.locator('.list-item', { hasText: 'TEO' }).click()
  await page.getByRole('button', { name: 'Rename…' }).click()
  await page.getByLabel('New name').fill('Sam')
  await page.getByRole('button', { name: 'Rename everywhere' }).click()
  await expect(page.locator('.detail-title h1')).toHaveText('SAM')
  await page.getByRole('button', { name: 'Script', exact: true }).click()
  await expect(page.locator('.el-character', { hasText: /^TEO$/ })).toHaveCount(0)
  await expect(page.locator('.el-action', { hasText: 'SAM ALVES' })).toHaveCount(1)
})

test('exports Fountain, Final Draft and PDF files', async ({ page }) => {
  await openSample(page)
  for (const [label, ext] of [
    ['Fountain', '.fountain'],
    ['Final Draft', '.fdx'],
    ['PDF', '.pdf'],
  ]) {
    await page.getByRole('button', { name: 'Export' }).click()
    const download = page.waitForEvent('download')
    await page.getByRole('menuitem', { name: new RegExp(`^${label}`) }).click()
    expect((await download).suggestedFilename()).toBe(`The Last Lighthouse${ext}`)
  }
})

test('shows page breaks for a long script', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New screenplay' }).first().click()
  await page.locator('.script-editor').click()
  const scene = 'INT. HALL - DAY\n\nFootsteps echo down the hall and fade.\n\nANNA\nIs anyone there? Hello?\n\n'
  await paste(page, scene.repeat(40))
  await expect(page.locator('.page-break-label').first()).toBeVisible()
  await expect(page.locator('.statusbar')).toContainText(/of [5-9]/)
})

test('imports a Final Draft file from the library', async ({ page }) => {
  await page.goto('/')
  const fdx = `<?xml version="1.0" encoding="UTF-8"?>
<FinalDraft DocumentType="Script" Version="5"><Content>
<Paragraph Type="Scene Heading"><Text>INT. SUBMARINE - NIGHT</Text></Paragraph>
<Paragraph Type="Action"><Text>Sonar pings.</Text></Paragraph>
<Paragraph Type="Character"><Text>CAPTAIN</Text></Paragraph>
<Paragraph Type="Dialogue"><Text>Dive.</Text></Paragraph>
</Content></FinalDraft>`
  await page.getByLabel('File to import').setInputFiles({ name: 'Deep Water.fdx', mimeType: 'application/xml', buffer: Buffer.from(fdx) })
  await expect(page.locator('.project-title')).toHaveText('Deep Water')
  await expect(page.locator('.el-character')).toHaveText('CAPTAIN')
  await expect(page.locator('.el-dialogue')).toHaveText('Dive.')
})

test('snapshots save and restore earlier drafts', async ({ page }) => {
  await openSample(page)
  await page.getByRole('button', { name: 'Snapshots' }).click()
  await page.getByLabel('Snapshot name').fill('First draft')
  await page.getByRole('button', { name: 'Save snapshot' }).click()
  await expect(page.getByRole('cell', { name: 'First draft' })).toBeVisible()
  await page.keyboard.press('Escape')
  // Change the script, then restore.
  await page.locator('.el-action').first().click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('Backspace')
  await page.keyboard.type('Gone.')
  await expect(page.locator('.script-editor > p.el')).toHaveCount(1)
  await page.getByRole('button', { name: 'Snapshots' }).click()
  await page.getByRole('row', { name: /First draft/ }).getByRole('button', { name: 'Restore' }).click()
  await page.getByRole('button', { name: 'Restore', exact: true }).last().click()
  await expect(page.locator('.nav-scene')).toHaveCount(6)
})

test('renames a location in every scene heading', async ({ page }) => {
  await openSample(page)
  await page.getByRole('button', { name: 'Locations', exact: true }).click()
  await page.locator('.list-item', { hasText: 'NORTHERN COAST - LIGHTHOUSE' }).click()
  await page.getByRole('button', { name: 'Rename…' }).click()
  await page.getByLabel('New name').fill('Cape Wrath Light')
  await page.getByRole('button', { name: 'Rename in all headings' }).click()
  await page.getByRole('button', { name: 'Script', exact: true }).click()
  await expect(page.locator('.nav-scene .heading').first()).toHaveText('EXT. CAPE WRATH LIGHT - DUSK')
  await expect(page.locator('.nav-scene .heading').nth(2)).toHaveText('EXT. CAPE WRATH LIGHT - NIGHT')
})

test('character timeline charts journeys and presence, and opens scenes', async ({ page }) => {
  await openSample(page)
  await page.getByRole('button', { name: 'Timeline', exact: true }).click()
  // Every speaking character is followed by default, each with a line.
  await expect(page.locator('.char-chip.on')).toHaveCount(4)
  await expect(page.locator('.journey-scroll .series-label')).toHaveText(['MAREN', 'TEO', 'IDA', 'YOUNG FISHERMAN'])
  // Unfollowing a character removes their line but keeps the others' colours.
  const tealBefore = await page.locator('.char-chip', { hasText: 'IDA' }).locator('.tip-key').evaluate((el) => getComputedStyle(el).backgroundColor)
  await page.locator('.char-chip', { hasText: 'TEO' }).click()
  await expect(page.locator('.journey-scroll .series-label')).toHaveCount(3)
  const tealAfter = await page.locator('.char-chip', { hasText: 'IDA' }).locator('.tip-key').evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(tealAfter).toBe(tealBefore)
  // Presence grid: Ida speaks in scenes 4 and 5 only.
  const idaRow = page.locator('.presence-row', { has: page.locator('.presence-label', { hasText: /^IDA$/ }) })
  await expect(idaRow.locator('button.presence-cell')).toHaveCount(2)
  await idaRow.locator('button.presence-cell').last().click()
  await expect(page.locator('.script-editor')).toBeVisible()
  await expect(page.locator('.statusbar')).toContainText('Scene 5 of 6')
})

test('shows a character’s journey on their profile', async ({ page }) => {
  await openSample(page)
  await page.getByRole('button', { name: 'Characters', exact: true }).click()
  await page.locator('.list-item', { hasText: 'IDA' }).click()
  await expect(page.locator('.path-place')).toHaveText(['LIGHTHOUSE - LAMP ROOM', 'HARBOR'])
})

test('relationships show who talks with whom', async ({ page }) => {
  await openSample(page)
  await page.getByRole('button', { name: 'Relationships', exact: true }).click()
  // Three talking pairs, strongest first.
  await expect(page.locator('.partner-row .partner-name')).toHaveText(['MAREN & TEO', 'MAREN & IDA', 'IDA & YOUNG FISHERMAN'])
  await expect(page.locator('.network .node')).toHaveCount(4)
  // Selecting Ida lists her conversation partners.
  await page.getByRole('button', { name: /^IDA: talks with/ }).click()
  await expect(page.locator('.network-side h3')).toHaveText('IDA talks with')
  await expect(page.locator('.network-side .partner-name')).toHaveText(['MAREN', 'YOUNG FISHERMAN'])
  // The matrix can switch between conversations and shared scenes.
  await page.getByRole('radio', { name: 'Shared scenes' }).click()
  await expect(page.locator('table.matrix td.diag').first()).toHaveText('4')
  // Scene chips open the script at that scene.
  await page.locator('.partners').last().locator('.scene-num-chip').first().click()
  await expect(page.locator('.script-editor')).toBeVisible()
})

test('imports a screenplay PDF, such as one exported from this app', async ({ page }, testInfo) => {
  const watch = watchPage(page)
  await openSample(page)
  await page.getByRole('button', { name: 'Export' }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('menuitem', { name: /^PDF/ }).click()
  const pdfPath = testInfo.outputPath('lighthouse.pdf')
  await (await download).saveAs(pdfPath)
  await page.getByRole('button', { name: 'Back to library' }).click()
  await page.getByLabel('File to import').setInputFiles(pdfPath)
  await watch.expectVisible(page.locator('.script-editor'))
  await expect(page.locator('.project-title')).toHaveText('THE LAST LIGHTHOUSE')
  await expect(page.locator('.nav-scene')).toHaveCount(6)
  await expect(page.locator('.el-character', { hasText: /^IDA \(V\.O\.\)$/ })).toHaveCount(1)
  await page.getByRole('button', { name: 'Relationships', exact: true }).click()
  await expect(page.locator('.partner-row .partner-name').first()).toHaveText('MAREN & TEO')
})
