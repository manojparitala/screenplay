import { expect, test, type Page } from '@playwright/test'

const NAME = 'Untitled Screenplay.screenplay.json'

/**
 * Stand-ins for the system file pickers, handing out files from the page's
 * private file system, and for the browser forgetting its permission to write
 * between visits (kept in sessionStorage, so it survives a reload).
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>
    const dir = () => navigator.storage.getDirectory()
    w.showSaveFilePicker = async (o: { suggestedName: string }) => (await dir()).getFileHandle(o.suggestedName, { create: true })
    w.showOpenFilePicker = async () => [await (await dir()).getFileHandle(sessionStorage.getItem('test:open') ?? '')]
    const handle = FileSystemHandle.prototype as unknown as Record<string, () => Promise<PermissionState>>
    handle.queryPermission = async () => (sessionStorage.getItem('test:permission') as PermissionState | null) ?? 'granted'
    handle.requestPermission = async () => {
      sessionStorage.setItem('test:permission', 'granted')
      return 'granted'
    }
  })
})

const readFile = (page: Page, name: string) =>
  page.evaluate(async (n) => {
    const handle = await (await navigator.storage.getDirectory()).getFileHandle(n)
    return (await handle.getFile()).text()
  }, name)

const writeFile = (page: Page, name: string, text: string) =>
  page.evaluate(
    async ([n, t]) => {
      const out = await (await (await navigator.storage.getDirectory()).getFileHandle(n, { create: true })).createWritable()
      await out.write(t)
      await out.close()
    },
    [name, text],
  )

/** Choose the file "Open file…" will be handed. */
const willOpen = (page: Page, name: string) => page.evaluate((n) => sessionStorage.setItem('test:open', n), name)

/** Type at the end of the script, and wait until the browser has saved it. */
async function typeAtEnd(page: Page, text: string) {
  await page.locator('.el-action').click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type(text)
  await expect(page.locator('.save-state')).toHaveText('Edited')
  await expect(page.locator('.save-state')).toHaveText('Saved')
}

const untitledCards = (page: Page) => page.locator('.script-card', { hasText: 'Untitled Screenplay' })

async function newScriptSavedToFile(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'New screenplay' }).first().click()
  await page.locator('.script-editor').click()
  await page.keyboard.type('int. kitchen - night')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Dust.')
  await page.getByRole('button', { name: 'Save to file' }).click()
  await expect(page.getByRole('button', { name: `Saving to ${NAME}` })).toBeVisible()
  await expect(page.locator('.toast', { hasText: `Saving to “${NAME}” on your computer.` })).toBeVisible()
  await expect.poll(() => readFile(page, NAME)).toContain('Dust.')
}

test('saves a script to a file and keeps the file up to date', async ({ page }) => {
  await newScriptSavedToFile(page)
  const saved = JSON.parse(await readFile(page, NAME))
  expect(saved.format).toBe('screenplay-project')
  expect(saved.project.titlePage.title).toBe('Untitled Screenplay')

  // Changes reach the file as the writer types, and Ctrl/⌘+S saves at once.
  await typeAtEnd(page, ' Written to disk.')
  await expect.poll(() => readFile(page, NAME)).toContain('Dust. Written to disk.')
  await page.keyboard.type(' Twice.')
  await page.keyboard.press('ControlOrMeta+s')
  await expect(page.locator('.toast', { hasText: `Saved to “${NAME}”.` })).toBeVisible()
  expect(await readFile(page, NAME)).toContain('Dust. Written to disk. Twice.')

  // Deleting the script from the browser leaves the file, which opens again as it was.
  await page.getByRole('button', { name: 'Back to library' }).click()
  await page.getByRole('button', { name: 'More actions for Untitled Screenplay' }).click()
  await page.getByRole('button', { name: 'Delete…' }).click()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(untitledCards(page)).toHaveCount(0)
  await willOpen(page, NAME)
  await page.getByRole('button', { name: 'Open file…' }).click()
  await expect(page.locator('.el-action')).toHaveText('Dust. Written to disk. Twice.')
  await expect(page.getByRole('button', { name: `Saving to ${NAME}` })).toBeVisible()
  await expect(page.locator('.toast', { hasText: `Opened “${NAME}”.` })).toBeVisible()

  // The writer can stop saving to the file; the script stays in the browser.
  await page.getByRole('button', { name: `Saving to ${NAME}` }).click()
  await page.getByRole('menuitem', { name: 'Stop saving to this file' }).click()
  await expect(page.getByRole('button', { name: 'Save to file' })).toBeVisible()
  await typeAtEnd(page, ' Browser only.')
  expect(await readFile(page, NAME)).not.toContain('Browser only.')
})

test('asks for permission again after the browser forgets it', async ({ page }) => {
  await newScriptSavedToFile(page)
  // A later visit, when the browser no longer lets the page write to the file.
  await page.evaluate(() => sessionStorage.setItem('test:permission', 'prompt'))
  await page.reload()
  await expect(page.getByRole('button', { name: /not saving/ })).toBeVisible()
  await expect(page.locator('.toast', { hasText: `To keep saving to “${NAME}”` })).toBeVisible()
  await typeAtEnd(page, ' Later.')
  expect(await readFile(page, NAME)).not.toContain('Later.')
  // Ctrl/⌘+S asks; once allowed, the file catches up.
  await page.keyboard.press('ControlOrMeta+s')
  await expect(page.getByRole('button', { name: `Saving to ${NAME}` })).toBeVisible()
  await expect.poll(() => readFile(page, NAME)).toContain('Dust. Later.')
})

test('opening a file never loses the newer of the two versions', async ({ page }) => {
  await newScriptSavedToFile(page)
  await page.getByRole('button', { name: 'Back to library' }).click()

  // The file changed elsewhere (say, on another computer): opening it brings the change in,
  // and the browser's older version is kept as a snapshot.
  const edited = JSON.parse(await readFile(page, NAME))
  edited.project.script[1].runs = [{ text: 'Dust, from the laptop.' }]
  edited.project.updatedAt = Date.now()
  await writeFile(page, NAME, JSON.stringify(edited))
  await willOpen(page, NAME)
  await page.getByRole('button', { name: 'Open file…' }).click()
  await expect(page.locator('.el-action')).toHaveText('Dust, from the laptop.')
  await page.getByRole('button', { name: 'Snapshots' }).click()
  await expect(page.getByRole('cell', { name: `Before opening “${NAME}”`, exact: false })).toBeVisible()
  await page.keyboard.press('Escape')

  // The browser has newer work than the file: it is kept and written to the file,
  // and the file's older version becomes a snapshot.
  await page.getByRole('button', { name: `Saving to ${NAME}` }).click()
  await page.getByRole('menuitem', { name: 'Stop saving to this file' }).click()
  await typeAtEnd(page, ' Swept.')
  await page.getByRole('button', { name: 'Back to library' }).click()
  await page.getByRole('button', { name: 'Open file…' }).click()
  await expect(page.locator('.toast', { hasText: 'This browser had newer changes' })).toContainText('and saved to the file')
  await expect(page.locator('.el-action')).toHaveText('Dust, from the laptop. Swept.')
  await expect.poll(() => readFile(page, NAME)).toContain('Dust, from the laptop. Swept.')
  await page.getByRole('button', { name: 'Snapshots' }).click()
  await expect(page.getByRole('cell', { name: `From “${NAME}”`, exact: false })).toBeVisible()
})

test('opens other kinds of file as new scripts and leaves them unchanged', async ({ page }) => {
  await page.goto('/')
  const fountain = 'Title: Harbour\n\nINT. HARBOUR - DAY\n\nGulls.\n'
  await writeFile(page, 'Harbour.fountain', fountain)
  await willOpen(page, 'Harbour.fountain')
  await page.getByRole('button', { name: 'Open file…' }).click()
  await expect(page.locator('.project-title')).toHaveText('Harbour')
  // Not linked: the Fountain file is never overwritten with the app's own format.
  await expect(page.getByRole('button', { name: 'Save to file' })).toBeVisible()
  await typeAtEnd(page, ' More gulls.')
  expect(await readFile(page, 'Harbour.fountain')).toBe(fountain)

  // JSON that isn't a script is refused, and left alone too.
  await page.getByRole('button', { name: 'Back to library' }).click()
  const other = '{"name":"my-app","version":"1.0.0"}'
  await writeFile(page, 'package.json', other)
  await willOpen(page, 'package.json')
  await page.getByRole('button', { name: 'Open file…' }).click()
  await expect(page.locator('.toast.error')).toContainText('isn’t a screenplay backup')
  await expect(page.locator('.script-card', { hasText: 'Harbour' })).toHaveCount(1)
  await expect(untitledCards(page)).toHaveCount(0)
  expect(await readFile(page, 'package.json')).toBe(other)
})
