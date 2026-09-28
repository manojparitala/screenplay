import type { PlacedGlyph } from './pdfwriter'
import type { EmMeasure, IndicScript } from './scripts'

/**
 * Text shaping with HarfBuzz, the engine browsers use: it picks the glyphs
 * for conjuncts and vowel signs, reorders them and positions marks, which the
 * PDF needs because PDF fonts only draw glyphs where they are told to.
 */
export interface Shaper {
  /** Glyphs for text in one script, in drawing order, in font units. */
  shape(text: string, script: IndicScript): PlacedGlyph[]
  /** Advance width of text in one script, in em. */
  measure: EmMeasure
  /** The font file used for a script. */
  fontData(script: IndicScript): Uint8Array
}

export async function createShaper(fonts: Partial<Record<IndicScript, Uint8Array>>): Promise<Shaper> {
  const hb = await import('harfbuzzjs')
  const faces = new Map<IndicScript, { font: InstanceType<typeof hb.Font>; upem: number; data: Uint8Array }>()
  for (const [script, data] of Object.entries(fonts) as [IndicScript, Uint8Array][]) {
    const face = new hb.Face(new hb.Blob(data))
    faces.set(script, { font: new hb.Font(face), upem: face.upem, data })
  }
  const buffer = new hb.Buffer()
  const cache = new Map<string, PlacedGlyph[]>()

  const face = (script: IndicScript) => {
    const f = faces.get(script)
    if (!f) throw new Error(`No font loaded for ${script}.`)
    return f
  }

  const shape = (text: string, script: IndicScript): PlacedGlyph[] => {
    const key = `${script}\u0000${text}`
    const hit = cache.get(key)
    if (hit) return hit
    const { font } = face(script)
    buffer.clearContents()
    buffer.addText(text)
    buffer.guessSegmentProperties()
    hb.shape(font, buffer)
    const infos = buffer.getGlyphInfos()
    const positions = buffer.getGlyphPositions()
    // Glyphs of one cluster (a syllable, after reordering) share its first
    // character's offset; the first glyph drawn carries the cluster's text.
    const starts = [...new Set(infos.map((g) => g.cluster))].sort((a, b) => a - b)
    const endOf = new Map(starts.map((s, k) => [s, starts[k + 1] ?? text.length]))
    const seen = new Set<number>()
    const glyphs = infos.map((g, i) => {
      const first = !seen.has(g.cluster)
      seen.add(g.cluster)
      const p = positions[i]
      return { gid: g.codepoint, ax: p.xAdvance, dx: p.xOffset, dy: p.yOffset, text: first ? text.slice(g.cluster, endOf.get(g.cluster)) : '' }
    })
    if (cache.size > 50000) cache.clear()
    cache.set(key, glyphs)
    return glyphs
  }

  return {
    shape,
    measure: (text, script) => shape(text, script).reduce((w, g) => w + g.ax, 0) / face(script).upem,
    fontData: (script) => face(script).data,
  }
}
