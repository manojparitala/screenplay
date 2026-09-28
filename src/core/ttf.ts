/**
 * Just enough TrueType to embed a font in a PDF: the metrics a PDF font
 * descriptor needs, glyph advances, and a subset that keeps only the glyphs a
 * document uses. Glyph ids are kept (unused glyphs become empty), so shaped
 * glyph ids can be written to the PDF as they are.
 */

export interface TrueTypeFont {
  data: Uint8Array
  tables: Map<string, { offset: number; length: number }>
  unitsPerEm: number
  numGlyphs: number
  bbox: [number, number, number, number]
  ascent: number
  descent: number
  capHeight: number
  postscriptName: string
  /** Advance width of a glyph in font units. */
  advance(gid: number): number
}

function view(data: Uint8Array): DataView {
  return new DataView(data.buffer, data.byteOffset, data.byteLength)
}

function table(font: { tables: TrueTypeFont['tables'] }, tag: string) {
  const t = font.tables.get(tag)
  if (!t) throw new Error(`The font has no ${tag} table.`)
  return t
}

function readName(data: Uint8Array, offset: number, id: number): string {
  const v = view(data)
  const count = v.getUint16(offset + 2)
  const strings = offset + v.getUint16(offset + 4)
  for (let i = 0; i < count; i++) {
    const r = offset + 6 + i * 12
    const platform = v.getUint16(r)
    const nameId = v.getUint16(r + 6)
    if (nameId !== id) continue
    const length = v.getUint16(r + 8)
    const start = strings + v.getUint16(r + 10)
    const bytes = data.subarray(start, start + length)
    if (platform === 3 || platform === 0) {
      let s = ''
      for (let k = 0; k + 1 < bytes.length; k += 2) s += String.fromCharCode((bytes[k] << 8) | bytes[k + 1])
      return s
    }
    return String.fromCharCode(...bytes)
  }
  return ''
}

export function parseTrueType(data: Uint8Array): TrueTypeFont {
  const v = view(data)
  const version = v.getUint32(0)
  if (version !== 0x00010000 && version !== 0x74727565) throw new Error('Only TrueType fonts can be embedded.')
  const tables = new Map<string, { offset: number; length: number }>()
  const count = v.getUint16(4)
  for (let i = 0; i < count; i++) {
    const r = 12 + i * 16
    const tag = String.fromCharCode(data[r], data[r + 1], data[r + 2], data[r + 3])
    tables.set(tag, { offset: v.getUint32(r + 8), length: v.getUint32(r + 12) })
  }
  const font = { tables }
  const head = table(font, 'head').offset
  const hhea = table(font, 'hhea').offset
  const maxp = table(font, 'maxp').offset
  const hmtx = table(font, 'hmtx').offset
  const os2 = tables.get('OS/2')
  const name = tables.get('name')
  const numberOfHMetrics = v.getUint16(hhea + 34)
  const ascent = v.getInt16(hhea + 4)
  const descent = v.getInt16(hhea + 6)
  let capHeight = ascent
  if (os2 && os2.length >= 90 && v.getUint16(os2.offset) >= 2) capHeight = v.getInt16(os2.offset + 88)
  const postscriptName = (name ? readName(data, name.offset, 6) : '').replace(/[^\x21-\x7e]|[[\](){}<>/%#]/g, '') || 'Font'
  return {
    data,
    tables,
    unitsPerEm: v.getUint16(head + 18),
    numGlyphs: v.getUint16(maxp + 4),
    bbox: [v.getInt16(head + 36), v.getInt16(head + 38), v.getInt16(head + 40), v.getInt16(head + 42)],
    ascent,
    descent,
    capHeight,
    postscriptName,
    advance(gid: number) {
      const i = Math.min(gid, numberOfHMetrics - 1)
      return v.getUint16(hmtx + i * 4)
    },
  }
}

/** Byte range of each glyph in the glyf table. */
function glyphRanges(font: TrueTypeFont): Array<[number, number]> {
  const v = view(font.data)
  const longOffsets = v.getInt16(table(font, 'head').offset + 50) === 1
  const loca = table(font, 'loca').offset
  const glyf = table(font, 'glyf').offset
  const ranges: Array<[number, number]> = []
  const at = (i: number) => (longOffsets ? v.getUint32(loca + i * 4) : v.getUint16(loca + i * 2) * 2)
  for (let i = 0; i < font.numGlyphs; i++) ranges.push([glyf + at(i), glyf + at(i + 1)])
  return ranges
}

/** Glyphs a composite glyph is built from. */
function components(font: TrueTypeFont, range: [number, number]): number[] {
  const [start, end] = range
  if (end - start < 10) return []
  const v = view(font.data)
  if (v.getInt16(start) >= 0) return []
  const out: number[] = []
  let p = start + 10
  for (;;) {
    const flags = v.getUint16(p)
    out.push(v.getUint16(p + 2))
    p += 4 + (flags & 0x0001 ? 4 : 2)
    if (flags & 0x0008) p += 2
    else if (flags & 0x0040) p += 4
    else if (flags & 0x0080) p += 8
    if (!(flags & 0x0020) || p >= end) break
  }
  return out
}

function checksum(bytes: Uint8Array): number {
  const padded = bytes.length % 4 ? new Uint8Array(bytes.length + 4 - (bytes.length % 4)) : bytes
  if (padded !== bytes) padded.set(bytes)
  const v = view(padded)
  let sum = 0
  for (let i = 0; i < padded.length; i += 4) sum = (sum + v.getUint32(i)) >>> 0
  return sum
}

/**
 * Tables kept in a subset: what a PDF viewer needs to draw glyphs by id, plus
 * cmap, name and post (without glyph names), which stricter font loaders expect.
 */
const KEEP_TABLES = ['OS/2', 'cmap', 'cvt ', 'fpgm', 'glyf', 'head', 'hhea', 'hmtx', 'loca', 'maxp', 'name', 'post', 'prep']

/**
 * A copy of the font holding only the given glyphs (and the glyphs they are
 * built from). Glyph ids are unchanged.
 */
export function subsetTrueType(font: TrueTypeFont, glyphs: Iterable<number>): Uint8Array {
  const ranges = glyphRanges(font)
  const keep = new Set<number>([0])
  const queue = [...glyphs]
  while (queue.length) {
    const gid = queue.pop()!
    if (gid < 0 || gid >= font.numGlyphs || keep.has(gid)) continue
    keep.add(gid)
    queue.push(...components(font, ranges[gid]))
  }

  // glyf and loca (long offsets), with unused glyphs left empty.
  let size = 0
  for (const gid of keep) size += (ranges[gid][1] - ranges[gid][0] + 3) & ~3
  const glyf = new Uint8Array(size)
  const loca = new Uint8Array((font.numGlyphs + 1) * 4)
  const lv = view(loca)
  let pos = 0
  for (let gid = 0; gid < font.numGlyphs; gid++) {
    lv.setUint32(gid * 4, pos)
    if (!keep.has(gid)) continue
    const [a, b] = ranges[gid]
    glyf.set(font.data.subarray(a, b), pos)
    pos += (b - a + 3) & ~3
  }
  lv.setUint32(font.numGlyphs * 4, pos)

  const out = new Map<string, Uint8Array>()
  for (const tag of KEEP_TABLES) {
    const t = font.tables.get(tag)
    if (!t) continue
    out.set(tag, font.data.slice(t.offset, t.offset + t.length))
  }
  out.set('glyf', glyf)
  out.set('loca', loca)
  const post = out.get('post')
  if (post && post.length >= 32) {
    const slim = post.slice(0, 32)
    view(slim).setUint32(0, 0x00030000) // version 3: no glyph names
    out.set('post', slim)
  }
  const head = out.get('head')!
  view(head).setUint32(8, 0) // checkSumAdjustment, set below
  view(head).setInt16(50, 1) // long loca offsets

  const tags = [...out.keys()].sort()
  const n = tags.length
  let entrySelector = 0
  while (2 ** (entrySelector + 1) <= n) entrySelector++
  const searchRange = 2 ** entrySelector * 16
  let offset = 12 + n * 16
  const total = tags.reduce((sum, tag) => sum + ((out.get(tag)!.length + 3) & ~3), offset)
  const file = new Uint8Array(total)
  const fv = view(file)
  fv.setUint32(0, 0x00010000)
  fv.setUint16(4, n)
  fv.setUint16(6, searchRange)
  fv.setUint16(8, entrySelector)
  fv.setUint16(10, n * 16 - searchRange)
  tags.forEach((tag, i) => {
    const bytes = out.get(tag)!
    const r = 12 + i * 16
    for (let k = 0; k < 4; k++) file[r + k] = tag.charCodeAt(k)
    fv.setUint32(r + 4, checksum(bytes))
    fv.setUint32(r + 8, offset)
    fv.setUint32(r + 12, bytes.length)
    file.set(bytes, offset)
    offset += (bytes.length + 3) & ~3
  })
  const headOffset = fv.getUint32(12 + tags.indexOf('head') * 16 + 8)
  fv.setUint32(headOffset + 8, (0xb1b0afba - checksum(file)) >>> 0)
  return file
}

/* ------------------------------------------------------------------ */
/* Outlines                                                            */
/* ------------------------------------------------------------------ */

type Point = { x: number; y: number; on: boolean }

/** Points of each contour of a glyph, in font units, with composite glyphs resolved. */
function contours(font: TrueTypeFont, ranges: Array<[number, number]>, gid: number, depth = 0): Point[][] {
  const [start, end] = ranges[gid] ?? [0, 0]
  if (end - start < 10 || depth > 8) return []
  const v = view(font.data)
  const count = v.getInt16(start)
  if (count < 0) {
    const out: Point[][] = []
    let p = start + 10
    for (;;) {
      const flags = v.getUint16(p)
      const component = v.getUint16(p + 2)
      p += 4
      let dx = 0
      let dy = 0
      if (flags & 0x0001) {
        if (flags & 0x0002) [dx, dy] = [v.getInt16(p), v.getInt16(p + 2)]
        p += 4
      } else {
        if (flags & 0x0002) [dx, dy] = [v.getInt8(p), v.getInt8(p + 1)]
        p += 2
      }
      let [a, b, c, d] = [1, 0, 0, 1]
      const f2dot14 = (o: number) => v.getInt16(o) / 16384
      if (flags & 0x0008) {
        a = d = f2dot14(p)
        p += 2
      } else if (flags & 0x0040) {
        a = f2dot14(p)
        d = f2dot14(p + 2)
        p += 4
      } else if (flags & 0x0080) {
        a = f2dot14(p)
        b = f2dot14(p + 2)
        c = f2dot14(p + 4)
        d = f2dot14(p + 6)
        p += 8
      }
      for (const contour of contours(font, ranges, component, depth + 1)) {
        out.push(contour.map((pt) => ({ x: a * pt.x + c * pt.y + dx, y: b * pt.x + d * pt.y + dy, on: pt.on })))
      }
      if (!(flags & 0x0020)) break
    }
    return out
  }
  const ends: number[] = []
  for (let i = 0; i < count; i++) ends.push(v.getUint16(start + 10 + i * 2))
  const n = count ? ends[count - 1] + 1 : 0
  let p = start + 10 + count * 2
  p += 2 + v.getUint16(p) // skip instructions
  const flags: number[] = []
  while (flags.length < n) {
    const f = font.data[p++]
    flags.push(f)
    if (f & 0x08) {
      const repeat = font.data[p++]
      for (let k = 0; k < repeat; k++) flags.push(f)
    }
  }
  const coords = (short: number, same: number) => {
    const out: number[] = []
    let value = 0
    for (const f of flags) {
      if (f & short) {
        const delta = font.data[p++]
        value += f & same ? delta : -delta
      } else if (!(f & same)) {
        value += v.getInt16(p)
        p += 2
      }
      out.push(value)
    }
    return out
  }
  const xs = coords(0x02, 0x10)
  const ys = coords(0x04, 0x20)
  const out: Point[][] = []
  let from = 0
  for (const e of ends) {
    const contour: Point[] = []
    for (let i = from; i <= e; i++) contour.push({ x: xs[i], y: ys[i], on: !!(flags[i] & 0x01) })
    out.push(contour)
    from = e + 1
  }
  return out
}

/**
 * A glyph's outline as PDF path operators, in font units (filled with the
 * nonzero rule, as TrueType is). Quadratic curves become cubic ones.
 */
export function glyphPath(font: TrueTypeFont, gid: number): string {
  const r = (n: number) => String(Math.round(n * 100) / 100)
  let path = ''
  for (const pts of contours(font, glyphRanges(font), gid)) {
    if (pts.length < 2) continue
    // Start on an on-curve point (or between two off-curve ones).
    let first = pts.findIndex((p) => p.on)
    let start: Point
    if (first === -1) {
      start = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2, on: true }
      first = 0
    } else start = pts[first]
    path += `${r(start.x)} ${r(start.y)} m\n`
    let cur = start
    let ctrl: Point | null = null
    const quad = (c: Point, to: Point) => {
      const c1x = cur.x + ((c.x - cur.x) * 2) / 3
      const c1y = cur.y + ((c.y - cur.y) * 2) / 3
      const c2x = to.x + ((c.x - to.x) * 2) / 3
      const c2y = to.y + ((c.y - to.y) * 2) / 3
      path += `${r(c1x)} ${r(c1y)} ${r(c2x)} ${r(c2y)} ${r(to.x)} ${r(to.y)} c\n`
      cur = to
    }
    for (let k = 1; k <= pts.length; k++) {
      const pt = pts[(first + k) % pts.length]
      if (pt.on) {
        if (ctrl) quad(ctrl, pt)
        else if (pt !== start || k < pts.length) {
          path += `${r(pt.x)} ${r(pt.y)} l\n`
          cur = pt
        }
        ctrl = null
      } else if (ctrl) {
        quad(ctrl, { x: (ctrl.x + pt.x) / 2, y: (ctrl.y + pt.y) / 2, on: true })
        ctrl = pt
      } else ctrl = pt
    }
    if (ctrl) quad(ctrl, start)
    path += 'h\n'
  }
  return path
}

/** A glyph that draws nothing (other than .notdef), or 0 if the font has none. */
export function blankGlyph(font: TrueTypeFont): number {
  const ranges = glyphRanges(font)
  for (let gid = 1; gid < ranges.length; gid++) if (ranges[gid][1] === ranges[gid][0]) return gid
  return 0
}
