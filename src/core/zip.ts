/**
 * Minimal ZIP reader and writer. Used to hand over file types a host won't
 * save directly, such as Final Draft's .fdx, and for backups of the library.
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export interface ZipEntry {
  name: string
  data: Uint8Array
  date?: Date
}

function dosDateTime(d: Date): [number, number] {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2)
  const date = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  return [time, date]
}

/** An entry ready to write: `body` is `data` as stored (method 0) or deflated (method 8). */
interface Packed {
  entry: ZipEntry
  method: 0 | 8
  body: Uint8Array
}

/** A ZIP archive with every entry stored as is. */
export function zipFiles(entries: ZipEntry[]): Uint8Array {
  return assemble(entries.map((entry) => ({ entry, method: 0, body: entry.data })))
}

/** A ZIP archive with entries compressed, where the browser can compress (all current ones can). */
export async function zipFilesCompressed(entries: ZipEntry[]): Promise<Uint8Array> {
  const packed: Packed[] = []
  for (const entry of entries) {
    const deflated = await convert(entry.data, 'CompressionStream')
    packed.push(deflated && deflated.length < entry.data.length ? { entry, method: 8, body: deflated } : { entry, method: 0, body: entry.data })
  }
  return assemble(packed)
}

/** Raw deflate through the browser's own streams; null where they are missing. */
async function convert(data: Uint8Array, kind: 'CompressionStream' | 'DecompressionStream'): Promise<Uint8Array | null> {
  const Stream = (globalThis as unknown as Record<string, (new (format: string) => TransformStream<Uint8Array, Uint8Array>) | undefined>)[kind]
  if (!Stream) return null
  const stream = new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new Stream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

function assemble(entries: Packed[]): Uint8Array {
  const enc = new TextEncoder()
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0
  for (const { entry: e, method, body } of entries) {
    const name = enc.encode(e.name)
    const crc = crc32(e.data)
    const [time, date] = dosDateTime(e.date ?? new Date())
    const local = new Uint8Array(30 + name.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true) // local file header
    lv.setUint16(4, 20, true) // version needed
    lv.setUint16(6, 0x0800, true) // UTF-8 names
    lv.setUint16(8, method, true)
    lv.setUint16(10, time, true)
    lv.setUint16(12, date, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, body.length, true)
    lv.setUint32(22, e.data.length, true)
    lv.setUint16(26, name.length, true)
    lv.setUint16(28, 0, true)
    local.set(name, 30)
    locals.push(local, body)

    const central = new Uint8Array(46 + name.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true) // central directory header
    cv.setUint16(4, 20, true) // version made by
    cv.setUint16(6, 20, true) // version needed
    cv.setUint16(8, 0x0800, true)
    cv.setUint16(10, method, true)
    cv.setUint16(12, time, true)
    cv.setUint16(14, date, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, body.length, true)
    cv.setUint32(24, e.data.length, true)
    cv.setUint16(28, name.length, true)
    cv.setUint32(42, offset, true) // local header offset
    central.set(name, 46)
    centrals.push(central)
    offset += local.length + body.length
  }
  const centralSize = centrals.reduce((n, c) => n + c.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true) // end of central directory
  ev.setUint16(8, entries.length, true)
  ev.setUint16(10, entries.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)
  const parts = [...locals, ...centrals, end]
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let pos = 0
  for (const p of parts) {
    out.set(p, pos)
    pos += p.length
  }
  return out
}

/**
 * Read the files in a ZIP archive, from its central directory as unzip tools
 * do, so archives written by other tools (with data descriptors, comments or
 * folders) read too. `want` picks the files to extract by name; others are
 * skipped without being decompressed.
 */
export async function unzipFiles(zip: Uint8Array, want: (name: string) => boolean = () => true): Promise<ZipEntry[]> {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  const damaged = () => new Error('This zip file is damaged or incomplete.')
  // The directory's end record is last, before an optional comment of up to 64 KB.
  let end = -1
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 0xffff); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      end = i
      break
    }
  }
  if (end < 0) throw new Error('This isn’t a zip file.')
  const count = v.getUint16(end + 10, true)
  let at = v.getUint32(end + 16, true)
  const out: ZipEntry[] = []
  for (let i = 0; i < count; i++) {
    if (at + 46 > zip.length || v.getUint32(at, true) !== 0x02014b50) throw damaged()
    const flags = v.getUint16(at + 8, true)
    const method = v.getUint16(at + 10, true)
    const [time, date] = [v.getUint16(at + 12, true), v.getUint16(at + 14, true)]
    const crc = v.getUint32(at + 16, true)
    const packedSize = v.getUint32(at + 20, true)
    const size = v.getUint32(at + 24, true)
    const nameLength = v.getUint16(at + 28, true)
    const localAt = v.getUint32(at + 42, true)
    const name = new TextDecoder().decode(zip.subarray(at + 46, at + 46 + nameLength))
    at += 46 + nameLength + v.getUint16(at + 30, true) + v.getUint16(at + 32, true)
    if (name.endsWith('/') || !want(name)) continue
    if (flags & 1) throw new Error(`“${name}” in this zip file is protected with a password.`)
    if (localAt + 30 > zip.length || v.getUint32(localAt, true) !== 0x04034b50) throw damaged()
    const dataAt = localAt + 30 + v.getUint16(localAt + 26, true) + v.getUint16(localAt + 28, true)
    if (dataAt + packedSize > zip.length) throw damaged()
    const body = zip.subarray(dataAt, dataAt + packedSize)
    const unreadable = new Error(`“${name}” in this zip file is compressed in a way this browser can’t read. Unzip it and restore the file inside instead.`)
    let data: Uint8Array | null
    if (method === 0) data = body.slice()
    else if (method === 8 && 'DecompressionStream' in globalThis) data = await convert(body, 'DecompressionStream').catch(() => null)
    else throw unreadable
    if (!data || data.length !== size || crc32(data) !== crc) throw damaged()
    out.push({ name, data, date: fromDosDateTime(time, date) })
  }
  return out
}

function fromDosDateTime(time: number, date: number): Date {
  return new Date(1980 + (date >> 9), ((date >> 5) & 15) - 1, date & 31, time >> 11, (time >> 5) & 63, (time & 31) * 2)
}
