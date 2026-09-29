import { expect, test } from '@playwright/test'

test('where pages can’t write files, scripts stay in the browser and backups are suggested', async ({ page, browserName }) => {
  // Chrome and Edge can: take their file pickers away to see what other browsers get.
  if (browserName === 'chromium') {
    await page.addInitScript(() => {
      for (const target of [window, Object.getPrototypeOf(window)]) {
        delete target.showSaveFilePicker
        delete target.showOpenFilePicker
      }
    })
  }
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Open sample script' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Open file…' })).toHaveCount(0)
  await expect(page.getByText('Use “Back up all scripts” regularly')).toBeVisible()

  await page.getByRole('button', { name: 'Open sample script' }).click()
  await expect(page.locator('.script-editor')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save to file' })).toHaveCount(0)
  await page.locator('.el-action').first().click()
  await page.keyboard.press('ControlOrMeta+s')
  await expect(page.locator('.toast', { hasText: 'Saved.' })).toBeVisible()
})
