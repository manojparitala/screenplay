import { expect, test, type Page } from '@playwright/test'

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
    ['Beat Sheet', '.beat'],
    ['Characters', '.detail-title'],
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

test('shows page breaks for a long script', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/')
  await page.getByRole('button', { name: 'New screenplay' }).first().click()
  await page.locator('.script-editor').click()
  const scene = 'INT. HALL - DAY\n\nFootsteps echo down the hall and fade.\n\nANNA\nIs anyone there? Hello?\n\n'
  await page.evaluate((text) => navigator.clipboard.writeText(text), scene.repeat(40))
  await page.keyboard.press('ControlOrMeta+v')
  await expect(page.locator('.page-break-label').first()).toBeVisible()
  await expect(page.locator('.statusbar')).toContainText(/of [5-9]/)
})
