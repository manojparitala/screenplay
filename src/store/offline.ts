import { useApp } from './app'

/**
 * Keeping the app working offline, and installable, through a service worker
 * (built from sw/service-worker.js). Only on the app's own site: not while
 * developing, and not inside another site's frame such as the claude.ai viewer.
 */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  try {
    if (window.top !== window.self) return
  } catch {
    return
  }
  void (async () => {
    // Browsers with service workers turned off (by policy, an extension or a test) may hand back nothing.
    const reg: ServiceWorkerRegistration | undefined = await navigator.serviceWorker.register('./sw.js')
    if (!reg) return
    const offer = (worker: ServiceWorker) =>
      useApp.getState().notify('A new version of Screenplay is ready.', 'info', { label: 'Reload', run: () => void switchTo(worker) })
    // A version that arrived during an earlier visit.
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting)
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing
      worker?.addEventListener('statechange', () => {
        // The first install needs no reload; later ones replace the running version.
        if (worker.state === 'installed' && navigator.serviceWorker.controller) offer(worker)
      })
    })
    // An installed app can stay open for days: look for new versions now and then.
    setInterval(() => void reg.update().catch(() => {}), 60 * 60_000)
  })().catch((e) => console.warn('Offline use is unavailable:', e))
}

let reloading = false

/** Save, then let the new version take over and reload into it. */
async function switchTo(worker: ServiceWorker) {
  await useApp.getState().saveNow()
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return
    reloading = true
    location.reload()
  })
  worker.postMessage('skip-waiting')
}

/* ------------------------------------------------------------------ */
/* Installing                                                          */
/* ------------------------------------------------------------------ */

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let installPrompt: InstallPromptEvent | null = null
const installListeners = new Set<() => void>()

// Chrome and Edge offer installation once, soon after the page loads, so listen from the start.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    installPrompt = e as InstallPromptEvent
    installListeners.forEach((l) => l())
  })
  window.addEventListener('appinstalled', () => {
    installPrompt = null
    installListeners.forEach((l) => l())
  })
}

export function canInstall(): boolean {
  return installPrompt !== null
}

export function onInstallChange(listener: () => void): () => void {
  installListeners.add(listener)
  return () => {
    installListeners.delete(listener)
  }
}

/** Ask the browser to install the app; only from a click. */
export async function install(): Promise<void> {
  const e = installPrompt
  if (!e) return
  await e.prompt()
  await e.userChoice
  installPrompt = null
  installListeners.forEach((l) => l())
}
