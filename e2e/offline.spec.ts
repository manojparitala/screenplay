import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { extname, join, normalize } from 'node:path'
import { expect, test } from '@playwright/test'
import { watchPage } from './helpers'

test.use({ serviceWorkers: 'allow' })

const TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.wasm': 'application/wasm',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
}

/** Serve the built app from a server of our own, so the test can take it away. */
async function serveApp(): Promise<{ url: string; stop: () => Promise<void> }> {
  const root = join(import.meta.dirname, '..', 'dist')
  const server: Server = createServer((req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '')
    let file = join(root, path)
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html')
    if (!file.startsWith(root) || !existsSync(file)) {
      res.writeHead(404).end()
      return
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
    createReadStream(file).pipe(res)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}/`,
    stop: () =>
      new Promise((resolve) => {
        server.closeAllConnections()
        server.close(() => resolve())
      }),
  }
}

test('can be installed, and keeps working once the site is out of reach', async ({ page }) => {
  const watch = watchPage(page)
  const site = await serveApp()
  await page.goto(site.url)
  // What browsers need to offer installing the app.
  const manifest = await (await page.request.get(`${site.url}manifest.webmanifest`)).json()
  expect(manifest).toMatchObject({ name: 'Screenplay', display: 'standalone', start_url: './' })
  for (const icon of manifest.icons) {
    const res = await page.request.get(`${site.url}${icon.src}`)
    expect(res.headers()['content-type']).toBe('image/png')
  }

  // Wait until the service worker has kept the app and looks after the page.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
    if (!navigator.serviceWorker.controller) await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }))
  })
  await site.stop()
  await page.reload()
  // Truly unreachable: anything the app didn't keep can't be fetched.
  expect(await page.evaluate(() => fetch('./never-kept.txt').then(() => 'fetched', () => 'failed'))).toBe('failed')
  await page.getByRole('button', { name: 'Open sample script' }).click()
  await expect(page.locator('.script-editor')).toBeVisible()

  // Writing in Tamil and exporting a PDF: the fonts and the shaping engine were kept too.
  await page.locator('.el-action').first().click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type(' வாலி')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export' }).click()
  await page.getByRole('menuitem', { name: /^PDF/ }).click()
  const pdf = await download
  expect(pdf.suggestedFilename()).toBe('The Last Lighthouse.pdf')
  await expect(page.locator('.toast.error')).toHaveCount(0)

  // Reading a PDF too (the PDF reader and its worker).
  await page.getByRole('button', { name: 'Back to library' }).click()
  const bytes = await (await import('node:fs/promises')).readFile(await pdf.path())
  await page.getByLabel('File to import').setInputFiles({ name: 'Offline.pdf', mimeType: 'application/pdf', buffer: bytes })
  await watch.expectVisible(page.locator('.toast', { hasText: 'Imported “The Last Lighthouse”.' }))
  await expect(page.locator('.script-editor')).toContainText('வாலி')
})
