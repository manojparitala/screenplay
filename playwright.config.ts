import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    // Writers' computers use UTF-8. In the C locale, Chrome on Linux saves any
    // download whose name isn't plain ASCII as "download".
    launchOptions: { env: { ...process.env, LC_ALL: 'C.UTF-8' } },
    // The offline cache is tested on its own (offline.spec.ts); elsewhere pages load from the server.
    serviceWorkers: 'block',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 900 } } }],
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
