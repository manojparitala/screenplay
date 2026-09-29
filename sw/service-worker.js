/*
 * Screenplay's service worker. It keeps the whole app in the browser's cache,
 * so it starts at once and works offline, as an installed app or in a tab.
 * A new version installs alongside the old one and takes over when the writer
 * chooses to reload. The build fills in VERSION and FILES (see vite.config.ts).
 */

const VERSION = '__VERSION__'
const FILES = __FILES__
const PREFIX = 'screenplay-'
const CACHE = PREFIX + VERSION

self.addEventListener('install', (event) => {
  // Bypass the HTTP cache, so this version's files are what gets kept.
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key)
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE)
      const navigate = request.mode === 'navigate'
      const hit = await cache.match(request, { ignoreSearch: navigate })
      if (hit) return hit
      // Every page of the app is index.html (scripts are addressed after the #).
      if (navigate) {
        const page = await cache.match('index.html')
        if (page) return page
      }
      return fetch(request)
    })(),
  )
})
