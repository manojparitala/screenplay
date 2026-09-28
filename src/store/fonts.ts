import { useSyncExternalStore } from 'react'
import devanagari from '../assets/fonts/NotoSansDevanagari-Regular.ttf?url'
import kannada from '../assets/fonts/NotoSansKannada-Regular.ttf?url'
import malayalam from '../assets/fonts/NotoSansMalayalam-Regular.ttf?url'
import tamil from '../assets/fonts/NotoSansTamil-Regular.ttf?url'
import telugu from '../assets/fonts/NotoSansTelugu-Regular.ttf?url'
import { estimateEm, SCRIPTS, setEmMeasure, type IndicScript } from '../core/scripts'
import type { Shaper } from '../core/shaper'

/** The bundled fonts (the same files styles/fonts.css gives the browser). */
export const FONT_URLS: Record<IndicScript, string> = { devanagari, tamil, telugu, kannada, malayalam }

/** Fetch the fonts for these scripts and start the shaping engine (for PDF export). */
export async function loadShaper(scripts: Iterable<IndicScript>): Promise<Shaper> {
  const [{ createShaper }, ...fonts] = await Promise.all([
    import('../core/shaper'),
    ...[...scripts].map(async (script) => {
      const res = await fetch(FONT_URLS[script])
      if (!res.ok) throw new Error(`The ${SCRIPTS[script].label} font could not be loaded (${res.status}).`)
      return [script, new Uint8Array(await res.arrayBuffer())] as const
    }),
  ])
  return createShaper(Object.fromEntries(fonts as (readonly [IndicScript, Uint8Array])[]))
}

/* ------------------------------------------------------------------ */
/* Measuring with the browser's fonts                                  */
/* ------------------------------------------------------------------ */

const loaded = new Set<IndicScript>()
const requested = new Set<IndicScript>()
const listeners = new Set<() => void>()
let version = 0

/** Call `fn` whenever a script's font finishes loading, since text in it then measures differently. */
export function onScriptFontLoaded(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** Changes whenever a script's font finishes loading; use it to redo layout that measured text. */
export function useScriptFontsVersion(): number {
  return useSyncExternalStore(onScriptFontLoaded, () => version)
}

function requestFont(script: IndicScript) {
  if (requested.has(script)) return
  requested.add(script)
  const { family, sample } = SCRIPTS[script]
  document.fonts.load(`100px "${family}"`, sample).then(
    () => {
      if (!document.fonts.check(`100px "${family}"`, sample)) return
      loaded.add(script)
      version++
      for (const fn of listeners) fn()
    },
    () => {},
  )
}

/**
 * Measure Indic text with the fonts the editor draws it in, so page breaks
 * match what the writer sees. Until a font has loaded, widths are estimated.
 */
export function installBrowserMeasure() {
  if (typeof document === 'undefined' || !document.fonts) return
  const ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) return
  const cache = new Map<string, number>()
  setEmMeasure((text, script) => {
    if (!loaded.has(script)) {
      requestFont(script)
      return estimateEm(text, script)
    }
    const key = `${script}\u0000${text}`
    let em = cache.get(key)
    if (em === undefined) {
      ctx.font = `100px "${SCRIPTS[script].family}"`
      em = ctx.measureText(text).width / 100
      if (cache.size > 20000) cache.clear()
      cache.set(key, em)
    }
    return em
  })
}
