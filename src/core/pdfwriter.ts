import { blankGlyph, glyphPath, parseTrueType, subsetTrueType, type TrueTypeFont } from './ttf'

/**
 * A small PDF writer for screenplay pages: text in the standard Courier fonts,
 * text in embedded TrueType fonts drawn glyph by glyph (as positioned by a
 * shaping engine, which complex scripts such as Tamil or Devanagari need), and
 * lines. Coordinates are in points from the top-left corner of the page.
 */

export type Style = 'normal' | 'bold' | 'italic' | 'bolditalic'

/** US Letter, in points. */
const LETTER = { width: 612, height: 792 }

const COURIER: Record<Style, { name: string; resource: string }> = {
  normal: { name: 'Courier', resource: 'F1' },
  bold: { name: 'Courier-Bold', resource: 'F2' },
  italic: { name: 'Courier-Oblique', resource: 'F3' },
  bolditalic: { name: 'Courier-BoldOblique', resource: 'F4' },
}

/** Windows-1252 bytes for the characters above Latin-1's control range. */
const CP1252: Record<string, number> = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8a, '‹': 0x8b,
  'Œ': 0x8c, 'Ž': 0x8e, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99,
  'š': 0x9a, '›': 0x9b, 'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f,
}

/** A PDF literal string of text in WinAnsiEncoding ("?" for anything else). */
function winAnsiLiteral(text: string): string {
  let out = '('
  for (const ch of text) {
    const c = ch.codePointAt(0)!
    const b = (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) ? c : (CP1252[ch] ?? 0x3f)
    if (b === 0x28 || b === 0x29 || b === 0x5c) out += '\\' + String.fromCharCode(b)
    else if (b < 0x20 || b > 0x7e) out += '\\' + b.toString(8).padStart(3, '0')
    else out += String.fromCharCode(b)
  }
  return out + ')'
}

/** A PDF text string: plain when ASCII, UTF-16 otherwise. */
function textString(text: string): string {
  if (/^[\x20-\x7e]*$/.test(text)) return '(' + text.replace(/[\\()]/g, (c) => '\\' + c) + ')'
  let hex = 'FEFF'
  for (let i = 0; i < text.length; i++) hex += text.charCodeAt(i).toString(16).padStart(4, '0')
  return `<${hex.toUpperCase()}>`
}

function num(n: number): string {
  const r = Math.round(n * 1000) / 1000
  return Object.is(r, -0) ? '0' : String(r)
}

function hex4(n: number): string {
  return n.toString(16).padStart(4, '0').toUpperCase()
}

function utf16Hex(text: string): string {
  let hex = ''
  for (let i = 0; i < text.length; i++) hex += hex4(text.charCodeAt(i))
  return hex
}

/** A glyph placed by the shaping engine, in font units. */
export interface PlacedGlyph {
  gid: number
  /** Advance after the glyph. */
  ax: number
  /** Offset of the glyph from the pen position. */
  dx: number
  dy: number
  /**
   * The text of the cluster (syllable) this glyph begins, or '' for the other
   * glyphs of a cluster. A cluster's glyphs may be reordered, as when a vowel
   * sign is drawn before its consonant.
   */
  text: string
}

/**
 * An embedded TrueType font.
 *
 * Text extraction (copying, searching, re-importing) reads glyphs in order and
 * expects each to stand for its own characters and to be as wide as it
 * looks, which shaped scripts don't do: a syllable's glyphs may be reordered,
 * and readers such as pdf.js treat any glyph whose text holds a combining
 * mark as having no width. So each cluster is written as:
 *
 * - one visible glyph carrying the cluster's first letter and its whole width;
 * - an invisible, zero-width glyph carrying the rest of its text;
 * - its other glyphs, painted as shapes that no reader mistakes for text.
 *
 * Every distinct (glyph, text, width) gets its own character id, mapped to the
 * glyph by CIDToGIDMap and to its text by the ToUnicode map.
 */
export class EmbeddedFont {
  readonly font: TrueTypeFont
  readonly resource: string
  private ids = new Map<string, number>()
  readonly gids: number[] = [0]
  readonly texts: string[] = ['']
  readonly widths: number[] = [0]
  /** Outline shapes in use: resource name → glyph and whether it is emboldened. */
  readonly shapes = new Map<string, { gid: number; bold: boolean }>()

  /** A glyph that draws nothing. */
  readonly blank: number

  constructor(data: Uint8Array, resource: string) {
    this.font = parseTrueType(data)
    this.resource = resource
    this.blank = blankGlyph(this.font)
  }

  /** Character id for a glyph standing for `text`, advancing `width` thousandths of an em. */
  cid(gid: number, text: string, width: number): number {
    const key = `${gid}\u0000${text}\u0000${width}`
    let id = this.ids.get(key)
    if (id === undefined) {
      id = this.gids.length
      if (id > 0xffff) throw new Error('Too many different glyphs for one PDF font.')
      this.gids.push(gid)
      this.texts.push(text)
      this.widths.push(width)
      this.ids.set(key, id)
    }
    return id
  }

  /** Resource name of a glyph's outline, drawn as a shape. */
  shape(gid: number, bold: boolean): string {
    const name = `${this.resource}G${gid}${bold ? 'B' : ''}`
    this.shapes.set(name, { gid, bold })
    return name
  }
}

export interface PdfInfo {
  title?: string
  author?: string
  creator?: string
}

export class PdfWriter {
  private pages: string[][] = []
  private fonts: EmbeddedFont[] = []
  private info: PdfInfo
  /** Page size in points. */
  readonly width: number
  readonly height: number

  constructor(info: PdfInfo = {}, size: { width: number; height: number } = LETTER) {
    this.info = info
    this.width = size.width
    this.height = size.height
  }

  get pageCount(): number {
    return this.pages.length
  }

  addPage() {
    this.pages.push([])
  }

  private get ops(): string[] {
    if (!this.pages.length) this.addPage()
    return this.pages[this.pages.length - 1]
  }

  /** Text in standard Courier, with its baseline at y. */
  courier(text: string, x: number, y: number, size: number, style: Style = 'normal') {
    if (!text) return
    this.ops.push(`BT /${COURIER[style].resource} ${num(size)} Tf 1 0 0 1 ${num(x)} ${num(this.height - y)} Tm ${winAnsiLiteral(text)} Tj ET`)
  }

  embed(data: Uint8Array): EmbeddedFont {
    const font = new EmbeddedFont(data, `E${this.fonts.length + 1}`)
    this.fonts.push(font)
    return font
  }

  /**
   * Shaped glyphs in an embedded font, starting at x with the baseline at y.
   * Bold and italic are drawn by thickening and slanting the regular font.
   */
  glyphs(font: EmbeddedFont, run: PlacedGlyph[], x: number, y: number, size: number, style: Style = 'normal') {
    if (!run.length) return
    const upem = font.font.unitsPerEm
    const scale = size / upem
    const bold = style === 'bold' || style === 'bolditalic'
    const skew = style === 'italic' || style === 'bolditalic' ? 0.2 : 0
    const pens: number[] = []
    let pen = 0
    for (const g of run) {
      pens.push(pen)
      pen += g.ax
    }
    const floating = (g: PlacedGlyph) => g.ax === 0 && (g.dx !== 0 || g.dy !== 0)
    // Clusters, and the glyph of each that is written as text.
    const clusters: number[][] = []
    run.forEach((g, i) => {
      if (g.text || !clusters.length) clusters.push([i])
      else clusters[clusters.length - 1].push(i)
    })
    const carriers = clusters.map((c) => c.find((i) => !floating(run[i])) ?? c[0])
    const text = clusters.map((c) => c.map((i) => run[i].text).join(''))
    // Positions in thousandths of an em, rounded so widths add up exactly.
    const at = (i: number) => Math.round(((pens[i] + run[i].dx) * 1000) / upem)
    const end = Math.round((pen * 1000) / upem)

    const ops = this.ops
    ops.push('q BT', `/${font.resource} ${num(size)} Tf`)
    if (bold) ops.push(`2 Tr ${num(size / 30)} w`)
    ops.push(`1 0 ${skew} 1 ${num(x + (at(carriers[0]) * size) / 1000)} ${num(this.height - y)} Tm`)
    let parts = ''
    let rise = 0
    carriers.forEach((i, k) => {
      const g = run[i]
      if (g.dy !== rise) {
        if (parts) ops.push(`[${parts}] TJ`)
        parts = ''
        rise = g.dy
        ops.push(`${num(rise * scale)} Ts`)
      }
      // The glyph's width reaches to the next cluster's glyph, so readers see no gaps.
      const next = k + 1 < carriers.length ? at(carriers[k + 1]) : end
      const width = Math.max(0, next - at(i))
      const t = text[k] || '\u2060'
      const cp = t.codePointAt(0)!
      const first = /\p{M}/u.test(String.fromCodePoint(cp)) ? t : String.fromCodePoint(cp)
      parts += `<${hex4(font.cid(g.gid, first, width))}>`
      if (t.length > first.length) parts += `<${hex4(font.cid(font.blank, t.slice(first.length), 0))}>`
      if (next - at(i) !== width) parts += ` ${width - (next - at(i))} `
    })
    if (parts) ops.push(`[${parts}] TJ`)
    ops.push('ET')
    // The clusters' other glyphs, as shapes.
    clusters.forEach((c, k) => {
      for (const i of c) {
        if (i === carriers[k]) continue
        const g = run[i]
        const gx = x + (pens[i] + g.dx) * scale
        const gy = this.height - y + g.dy * scale
        ops.push(`q ${num(scale)} 0 ${num(skew * scale)} ${num(scale)} ${num(gx)} ${num(gy)} cm /${font.shape(g.gid, bold)} Do Q`)
      }
    })
    ops.push('Q')
  }

  line(x1: number, y1: number, x2: number, y2: number, width = 0.6) {
    this.ops.push(`${num(width)} w ${num(x1)} ${num(this.height - y1)} m ${num(x2)} ${num(this.height - y2)} l S`)
  }

  async output(): Promise<Uint8Array> {
    const objects: (Uint8Array | null)[] = []
    const enc = new TextEncoder()
    const reserve = () => {
      objects.push(null)
      return objects.length
    }
    const set = (n: number, body: string | Uint8Array) => {
      objects[n - 1] = typeof body === 'string' ? latin1(body) : body
    }
    const stream = async (dict: string, data: Uint8Array, compress = true): Promise<Uint8Array> => {
      const packed = compress ? await deflate(data) : null
      const body = packed ?? data
      const head = latin1(`<< ${dict}${packed ? ' /Filter /FlateDecode' : ''} /Length ${body.length} >>\nstream\n`)
      return concat([head, body, latin1('\nendstream')])
    }

    const catalog = reserve()
    const pagesRoot = reserve()
    const infoObj = reserve()
    const courier: Record<string, number> = {}
    for (const style of Object.keys(COURIER) as Style[]) {
      const n = reserve()
      courier[COURIER[style].resource] = n
      set(n, `<< /Type /Font /Subtype /Type1 /BaseFont /${COURIER[style].name} /Encoding /WinAnsiEncoding >>`)
    }

    const fontRefs: string[] = Object.entries(courier).map(([r, n]) => `/${r} ${n} 0 R`)
    for (const f of this.fonts) {
      if (f.gids.length <= 1) continue
      const t = f.font
      const scale = 1000 / t.unitsPerEm
      const tag = subsetTag(f)
      const baseFont = `${tag}+${t.postscriptName}`
      const type0 = reserve()
      const cidFont = reserve()
      const descriptor = reserve()
      const file = reserve()
      const toUnicode = reserve()
      const cidMap = reserve()
      const widths = f.widths.slice(1)
      set(
        type0,
        `<< /Type /Font /Subtype /Type0 /BaseFont /${baseFont} /Encoding /Identity-H /DescendantFonts [${cidFont} 0 R] /ToUnicode ${toUnicode} 0 R >>`,
      )
      set(
        cidFont,
        `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${baseFont} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> ` +
          `/FontDescriptor ${descriptor} 0 R /DW 1000 /W [1 [${widths.join(' ')}]] /CIDToGIDMap ${cidMap} 0 R >>`,
      )
      set(
        descriptor,
        `<< /Type /FontDescriptor /FontName /${baseFont} /Flags 4 /FontBBox [${t.bbox.map((v) => Math.round(v * scale)).join(' ')}] ` +
          `/ItalicAngle 0 /Ascent ${Math.round(t.ascent * scale)} /Descent ${Math.round(t.descent * scale)} /CapHeight ${Math.round(t.capHeight * scale)} ` +
          `/StemV 80 /FontFile2 ${file} 0 R >>`,
      )
      const subset = subsetTrueType(t, f.gids)
      set(file, await stream(`/Length1 ${subset.length}`, subset))
      set(toUnicode, await stream('', latin1(toUnicodeCMap(f.texts))))
      const map = new Uint8Array(f.gids.length * 2)
      f.gids.forEach((gid, cid) => {
        map[cid * 2] = gid >> 8
        map[cid * 2 + 1] = gid & 0xff
      })
      set(cidMap, await stream('', map))
      fontRefs.push(`/${f.resource} ${type0} 0 R`)
    }
    const shapeRefs: string[] = []
    for (const f of this.fonts) {
      const [x0, y0, x1, y1] = f.font.bbox
      const pad = f.font.unitsPerEm / 20
      for (const [name, { gid, bold }] of f.shapes) {
        const n = reserve()
        const paint = bold ? `${num(f.font.unitsPerEm / 30)} w 1 j\n${glyphPath(f.font, gid)}B` : `${glyphPath(f.font, gid)}f`
        set(n, await stream(`/Type /XObject /Subtype /Form /BBox [${x0 - pad} ${y0 - pad} ${x1 + pad} ${y1 + pad}] /Resources << >>`, latin1(paint)))
        shapeRefs.push(`/${name} ${n} 0 R`)
      }
    }

    const resources = reserve()
    set(
      resources,
      `<< /Font << ${fontRefs.join(' ')} >>${shapeRefs.length ? ` /XObject << ${shapeRefs.join(' ')} >>` : ''} /ProcSet [/PDF /Text] >>`,
    )

    if (!this.pages.length) this.addPage()
    const kids: number[] = []
    for (const ops of this.pages) {
      const page = reserve()
      const content = reserve()
      kids.push(page)
      set(page, `<< /Type /Page /Parent ${pagesRoot} 0 R /MediaBox [0 0 ${num(this.width)} ${num(this.height)}] /Resources ${resources} 0 R /Contents ${content} 0 R >>`)
      set(content, await stream('', latin1(ops.join('\n'))))
    }
    set(pagesRoot, `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`)
    set(catalog, `<< /Type /Catalog /Pages ${pagesRoot} 0 R /ViewerPreferences << /DisplayDocTitle true >> >>`)
    const info = [`/Producer (Screenplay)`, `/CreationDate (${pdfDate(new Date())})`]
    if (this.info.title) info.push(`/Title ${textString(this.info.title)}`)
    if (this.info.author) info.push(`/Author ${textString(this.info.author)}`)
    if (this.info.creator) info.push(`/Creator ${textString(this.info.creator)}`)
    set(infoObj, `<< ${info.join(' ')} >>`)

    // Header, objects, cross-reference table, trailer.
    const chunks: Uint8Array[] = [latin1('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n')]
    let offset = chunks[0].length
    const offsets: number[] = []
    objects.forEach((body, i) => {
      const obj = concat([latin1(`${i + 1} 0 obj\n`), body ?? latin1('null'), latin1('\nendobj\n')])
      offsets.push(offset)
      chunks.push(obj)
      offset += obj.length
    })
    let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
    for (const o of offsets) xref += `${String(o).padStart(10, '0')} 00000 n \n`
    xref += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${infoObj} 0 R >>\nstartxref\n${offset}\n%%EOF\n`
    chunks.push(enc.encode(xref))
    return concat(chunks)
  }
}

/** Six capital letters naming a font subset, derived from the glyphs it holds. */
function subsetTag(f: EmbeddedFont): string {
  let h = 2166136261
  for (const g of f.gids) h = Math.imul(h ^ g, 16777619) >>> 0
  h = Math.imul(h ^ f.resource.charCodeAt(1), 16777619) >>> 0
  let tag = ''
  for (let i = 0; i < 6; i++) {
    tag += String.fromCharCode(65 + (h % 26))
    h = Math.floor(h / 26) + i * 7919
  }
  return tag
}

function toUnicodeCMap(texts: string[]): string {
  const entries = texts.map((t, cid) => `<${hex4(cid)}> <${utf16Hex(t)}>`).slice(1)
  let body = ''
  for (let i = 0; i < entries.length; i += 100) {
    const chunk = entries.slice(i, i + 100)
    body += `${chunk.length} beginbfchar\n${chunk.join('\n')}\nendbfchar\n`
  }
  return (
    '/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n' +
    '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n' +
    '/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n' +
    '1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n' +
    body +
    'endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend\n'
  )
}

function pdfDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `D:${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
}

/** Bytes of a string whose characters are all below 256. */
function latin1(s: string): Uint8Array {
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff
  return out
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let pos = 0
  for (const p of parts) {
    out.set(p, pos)
    pos += p.length
  }
  return out
}

async function deflate(data: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === 'undefined' || data.length < 64) return null
  try {
    const stream = new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new CompressionStream('deflate'))
    return new Uint8Array(await new Response(stream).arrayBuffer())
  } catch {
    return null
  }
}

