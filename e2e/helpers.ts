import { expect, type Locator, type Page } from '@playwright/test'

/**
 * Paste text into the focused editor, as the browser does on Ctrl/⌘+V. The
 * system clipboard can't be used here: only Chromium lets tests write to it.
 */
export async function paste(page: Page, text: string) {
  await page.evaluate((t) => {
    const data = new DataTransfer()
    data.setData('text/plain', t)
    const target = document.activeElement ?? document.body
    target.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
  }, text)
}

/**
 * Keep what the page reports going wrong, so a test that waits in vain can
 * say why: the messages on screen and the errors in the console.
 */
export function watchPage(page: Page) {
  const problems: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`)
  })
  page.on('pageerror', (e) => problems.push(`uncaught: ${e.message}`))
  return {
    async expectVisible(locator: Locator, timeout = 20_000) {
      try {
        await expect(locator).toBeVisible({ timeout })
      } catch (e) {
        const toasts = await page.locator('.toast').allTextContents()
        throw new Error(`${(e as Error).message}\n\nMessages shown: ${JSON.stringify(toasts)}\nConsole:\n${problems.join('\n') || '(nothing)'}`)
      }
    },
  }
}
