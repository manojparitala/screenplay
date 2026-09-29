import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { defineConfig, type Plugin } from 'vite'

/**
 * Write the service worker after the build, listing every file of the app for
 * it to keep offline. Its version is a hash of those files, so any change to
 * the app changes sw.js, which is how browsers notice a new version.
 */
function serviceWorker(): Plugin {
  let outDir = ''
  let root = ''
  return {
    name: 'screenplay-service-worker',
    apply: 'build',
    configResolved(config) {
      root = config.root
      outDir = resolve(config.root, config.build.outDir)
    },
    closeBundle() {
      const files = readdirSync(outDir, { recursive: true, withFileTypes: true })
        .filter((d) => d.isFile())
        .map((d) => relative(outDir, join(d.parentPath, d.name)).split(sep).join('/'))
        .filter((f) => f !== 'sw.js')
        .sort()
      const hash = createHash('sha256')
      for (const f of files) hash.update(f).update(readFileSync(join(outDir, f)))
      const source = readFileSync(join(root, 'sw/service-worker.js'), 'utf8')
        .replace('__VERSION__', hash.digest('hex').slice(0, 16))
        .replace('__FILES__', JSON.stringify(files))
      writeFileSync(join(outDir, 'sw.js'), source)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), serviceWorker()],
  // Relative, so the same build works from any folder: GitHub Pages, a claude.ai artifact, or a local preview.
  base: './',
  build: { chunkSizeWarningLimit: 800 },
})
