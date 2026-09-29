import { expect, test, type Page } from '@playwright/test'
import { paste } from './helpers'

const elements = (page: Page) =>
  page.locator('.script-editor > p.el').evaluateAll((els) =>
    els.map((el) => [el.className.match(/el-(\w+)/)?.[1] ?? '', (el.textContent ?? '').replace(/ /g, ' ')]),
  )

async function newScript(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'New screenplay' }).first().click()
  await expect(page.locator('.script-editor')).toBeVisible()
  await page.locator('.script-editor').click()
}

test('writes a scene with Enter and Tab moving between elements', async ({ page }) => {
  await newScript(page)
  // New scripts start on a scene heading with prefix suggestions.
  await expect(page.locator('.ac-menu')).toBeVisible()
  await page.keyboard.type('int. kitchen - night')
  await page.keyboard.press('Enter') // → action
  await page.keyboard.type('Rain hammers the window.')
  await page.keyboard.press('Enter') // → action
  await page.keyboard.press('Tab') // → character
  await page.keyboard.type('maren')
  await page.keyboard.press('Tab') // → parenthetical with ()
  await page.keyboard.type('quietly')
  await page.keyboard.press('Enter') // → dialogue
  await page.keyboard.type('Storms don’t wait.')
  await page.keyboard.press('Enter') // → action
  await page.keyboard.press('Tab') // → character
  await page.keyboard.type('m')
  // Autocomplete offers the existing character.
  await expect(page.locator('.ac-item').first()).toHaveText('MAREN')
  await page.keyboard.press('Enter') // accept suggestion
  await page.keyboard.press('Enter') // → dialogue
  await page.keyboard.type('Again.')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab') // empty character → transition
  await page.keyboard.type('cut to:')

  expect(await elements(page)).toEqual([
    ['scene', 'int. kitchen - night'],
    ['action', 'Rain hammers the window.'],
    ['character', 'maren'],
    ['parenthetical', '(quietly)'],
    ['dialogue', 'Storms don’t wait.'],
    ['character', 'MAREN'],
    ['dialogue', 'Again.'],
    ['transition', 'cut to:'],
  ])
  // Displayed in capitals, with an automatic (CONT'D) for the second speech.
  await expect(page.locator('.el-scene').first()).toHaveCSS('text-transform', 'uppercase')
  await expect(page.locator('.auto-contd')).toHaveCount(1)
  // Navigator and status bar pick up the scene.
  await expect(page.locator('.nav-scene .heading').first()).toHaveText('INT. KITCHEN - NIGHT')
  await expect(page.locator('.statusbar')).toContainText('Transition')
})

test('smart typing turns "int. " into a scene heading and "(" into a parenthetical', async ({ page }) => {
  await newScript(page)
  await page.keyboard.type('EXT. FIELD - DAY')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Grass.')
  await page.keyboard.press('Enter')
  await page.keyboard.type('int. barn - day')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Tab')
  await page.keyboard.type('Bob')
  await page.keyboard.press('Escape') // hide suggestions
  await page.keyboard.press('Enter')
  await page.keyboard.type('(')
  await page.keyboard.type('beat)')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Hi.')
  expect(await elements(page)).toEqual([
    ['scene', 'EXT. FIELD - DAY'],
    ['action', 'Grass.'],
    ['scene', 'int. barn - day'],
    ['character', 'Bob'],
    ['parenthetical', '(beat)'],
    ['dialogue', 'Hi.'],
  ])
})

test('element shortcuts, undo and persistence across reloads', async ({ page }) => {
  await newScript(page)
  await page.keyboard.type('INT. ROOM - DAY')
  await page.keyboard.press('Enter')
  await page.keyboard.type('A note to self')
  await page.keyboard.press('Alt+0')
  expect((await elements(page))[1][0]).toBe('note')
  await page.keyboard.press('ControlOrMeta+z')
  expect((await elements(page))[1][0]).toBe('action')
  await expect(page.locator('.save-state')).toHaveText('Saved', { timeout: 5000 })
  await page.reload()
  await expect(page.locator('.script-editor')).toBeVisible()
  expect(await elements(page)).toEqual([
    ['scene', 'INT. ROOM - DAY'],
    ['action', 'A note to self'],
  ])
})

test('pastes Fountain text as formatted elements', async ({ page }) => {
  await newScript(page)
  await paste(page, 'INT. LAB - NIGHT\n\nSparks fly.\n\nDR. VOSS\n(grinning)\nIt lives!\n')
  expect(await elements(page)).toEqual([
    ['scene', 'INT. LAB - NIGHT'],
    ['action', 'Sparks fly.'],
    ['character', 'DR. VOSS'],
    ['parenthetical', '(grinning)'],
    ['dialogue', 'It lives!'],
  ])
})

test('find and replace', async ({ page }) => {
  await newScript(page)
  await page.keyboard.type('INT. ROOM - DAY')
  await page.keyboard.press('Enter')
  await page.keyboard.type('The cat sat. The cat left.')
  await page.keyboard.press('ControlOrMeta+f')
  await page.getByLabel('Find', { exact: true }).fill('cat')
  await expect(page.locator('.findbar .count')).toHaveText('– of 2')
  await expect(page.locator('.search-match')).toHaveCount(2)
  await page.getByLabel('Replace with').fill('dog')
  await page.getByRole('button', { name: 'Replace all' }).click()
  expect((await elements(page))[1][1]).toBe('The dog sat. The dog left.')
})
