import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { unzipFiles, zipFiles } from '../src/core/zip'

async function openSample(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Open sample script' }).click()
  await expect(page.locator('.script-editor')).toBeVisible()
}

/** Type at the end of the script, and wait until the browser has saved it. */
async function typeAtEnd(page: Page, text: string) {
  await page.locator('.el-action').first().click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type(text)
  await expect(page.locator('.save-state')).toHaveText('Edited')
  await expect(page.locator('.save-state')).toHaveText('Saved')
}

async function backUp(page: Page, button = 'Back up all scripts') {
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: button }).click()
  const file = await download
  expect(file.suggestedFilename()).toMatch(/^Screenplay backup \d{4}-\d{2}-\d{2}\.zip$/)
  return file
}

test('keeps automatic snapshots, and backs up and restores the whole library', async ({ page }) => {
  await openSample(page)
  // The first change keeps the script as it was.
  await typeAtEnd(page, ' THE END.')
  await page.getByRole('button', { name: 'Snapshots' }).click()
  await expect(page.getByRole('heading', { name: 'Automatic backups' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Download automatic backup as Fountain' })).toHaveCount(1)
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Back to library' }).click()
  await expect(page.locator('.backup-panel')).toContainText('No backup yet.')
  const download = await backUp(page)
  await expect(page.locator('.backup-panel')).toContainText('Last backup just now.')
  const backup = { name: download.suggestedFilename(), mimeType: 'application/zip', buffer: await readFile(await download.path()) }
  const files = await unzipFiles(new Uint8Array(backup.buffer))
  expect(files.map((f) => f.name).sort()).toEqual([
    'README.txt',
    'The Last Lighthouse (2).fountain',
    'The Last Lighthouse (2).screenplay.json',
    'The Last Lighthouse.fountain',
    'The Last Lighthouse.screenplay.json',
  ])
  // The library holds the sample twice: the copy put there on the first visit, and the one opened above.
  const saved = files.filter((f) => f.name.endsWith('.json')).map((f) => JSON.parse(new TextDecoder().decode(f.data)))
  const edited = saved.find((s) => JSON.stringify(s.project.script).includes('THE END.'))
  expect(edited.snapshots).toHaveLength(1)
  expect(edited.snapshots[0].auto).toBe(true)

  // Lose everything, then restore it from the backup.
  for (let n = 2; n > 0; n--) {
    await page.getByRole('button', { name: 'More actions for The Last Lighthouse' }).first().click()
    await page.getByRole('button', { name: 'Delete…' }).click()
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(page.locator('.script-card')).toHaveCount(n - 1)
  }
  await page.getByLabel('Backup file to restore').setInputFiles(backup)
  await expect(page.locator('.toast', { hasText: `Restored 2 scripts from “${download.suggestedFilename()}”.` })).toBeVisible()
  await expect(page.locator('.script-card')).toHaveCount(2)
  await page.locator('.script-card').first().click()
  await expect(page.locator('.script-editor')).toContainText('THE END.')
  await page.getByRole('button', { name: 'Snapshots' }).click()
  await expect(page.getByRole('button', { name: 'Download automatic backup as Fountain' })).toHaveCount(1)
  await page.keyboard.press('Escape')

  // Restoring again changes nothing; newer work in the browser is never replaced.
  await typeAtEnd(page, ' Really.')
  await page.getByRole('button', { name: 'Back to library' }).click()
  await page.getByLabel('Backup file to restore').setInputFiles(backup)
  await expect(page.locator('.toast', { hasText: '1 script already up to date. 1 script had newer changes in this browser, which were kept' })).toBeVisible()
  await page.locator('.script-card').first().click()
  await expect(page.locator('.script-editor')).toContainText('THE END. Really.')
  await page.getByRole('button', { name: 'Snapshots' }).click()
  await expect(page.getByRole('cell', { name: `From “${download.suggestedFilename()}”` })).toBeVisible()
})

test('reminds the writer to back up after a week', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('screenplay:first-seen')) localStorage.setItem('screenplay:first-seen', String(Date.now() - 8 * 24 * 3_600_000))
  })
  await page.goto('/')
  const reminder = page.locator('.backup-reminder')
  await expect(reminder).toContainText('You haven’t backed up your scripts yet.')
  await reminder.getByRole('button', { name: 'Remind me later' }).click()
  await expect(reminder).toHaveCount(0)
  await page.reload()
  await expect(page.locator('.script-card')).toHaveCount(1)
  await expect(reminder).toHaveCount(0)

  // Once snoozing is over, backing up puts the reminder away.
  await page.evaluate(() => localStorage.removeItem('screenplay:backup-snoozed-until'))
  await page.reload()
  await backUp(page, 'Back up now')
  await expect(reminder).toHaveCount(0)
})

test('imports a script zipped up by the claude.ai viewer', async ({ page }) => {
  await page.goto('/')
  const fdx = `<?xml version="1.0" encoding="UTF-8"?>
<FinalDraft DocumentType="Script" Version="5"><Content>
<Paragraph Type="Scene Heading"><Text>INT. SUBMARINE - NIGHT</Text></Paragraph>
<Paragraph Type="Character"><Text>CAPTAIN</Text></Paragraph>
<Paragraph Type="Dialogue"><Text>Dive.</Text></Paragraph>
</Content></FinalDraft>`
  const zip = zipFiles([{ name: 'Deep Water.fdx', data: new TextEncoder().encode(fdx) }])
  await page.getByLabel('File to import').setInputFiles({ name: 'Deep Water.fdx.zip', mimeType: 'application/zip', buffer: Buffer.from(zip) })
  await expect(page.locator('.project-title')).toHaveText('Deep Water')
  await expect(page.locator('.el-dialogue')).toHaveText('Dive.')
})
