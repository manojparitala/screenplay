import { deflateRawSync, crc32 as nodeCrc32 } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { crc32, unzipFiles, zipFiles, zipFilesCompressed } from './zip'

/** Read a stored ZIP back using its central directory, as unzip tools do. */
function readZip(zip: Uint8Array) {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  const endAt = zip.length - 22
  expect(v.getUint32(endAt, true)).toBe(0x06054b50)
  const count = v.getUint16(endAt + 10, true)
  let at = v.getUint32(endAt + 16, true)
  const files: { name: string; data: Uint8Array; crc: number; utf8: boolean }[] = []
  for (let i = 0; i < count; i++) {
    expect(v.getUint32(at, true)).toBe(0x02014b50)
    const crc = v.getUint32(at + 16, true)
    const size = v.getUint32(at + 20, true)
    const nameLen = v.getUint16(at + 28, true)
    const localAt = v.getUint32(at + 42, true)
    const name = new TextDecoder().decode(zip.slice(at + 46, at + 46 + nameLen))
    expect(v.getUint32(localAt, true)).toBe(0x04034b50)
    const dataAt = localAt + 30 + v.getUint16(localAt + 26, true) + v.getUint16(localAt + 28, true)
    files.push({ name, data: zip.slice(dataAt, dataAt + size), crc, utf8: (v.getUint16(at + 8, true) & 0x0800) !== 0 })
    at += 46 + nameLen + v.getUint16(at + 30, true) + v.getUint16(at + 32, true)
  }
  return files
}

describe('zip', () => {
  it('computes standard CRC-32', () => {
    const data = new TextEncoder().encode('The quick brown fox jumps over the lazy dog')
    expect(crc32(data)).toBe(0x414fa339)
    expect(crc32(data)).toBe(nodeCrc32(data))
  })

  it('writes a readable archive with UTF-8 names', () => {
    const a = new TextEncoder().encode('<?xml version="1.0"?><FinalDraft/>')
    const b = new TextEncoder().encode('Café “Noir”')
    const zip = zipFiles([
      { name: 'Script.fdx', data: a },
      { name: 'Café.txt', data: b },
    ])
    const files = readZip(zip)
    expect(files.map((f) => f.name)).toEqual(['Script.fdx', 'Café.txt'])
    expect(files[0].data).toEqual(a)
    expect(files[1].data).toEqual(b)
    for (const f of files) {
      expect(f.crc).toBe(nodeCrc32(f.data))
      expect(f.utf8).toBe(true)
    }
  })
})

/**
 * An archive the way streaming zip tools write one: a folder entry, sizes in a
 * data descriptor after each file instead of its header, and a comment at the end.
 */
function streamedZip(files: { name: string; text: string }[], comment: string): Uint8Array {
  const parts: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const f of [{ name: 'scripts/', text: '' }, ...files]) {
    const name = Buffer.from(f.name)
    const data = Buffer.from(f.text)
    const folder = f.name.endsWith('/')
    const body = folder ? Buffer.alloc(0) : deflateRawSync(data)
    const crc = nodeCrc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0808, 6) // UTF-8 names, sizes in a data descriptor
    local.writeUInt16LE(folder ? 0 : 8, 8)
    local.writeUInt16LE(name.length, 26)
    const descriptor = Buffer.alloc(16)
    descriptor.writeUInt32LE(0x08074b50, 0)
    descriptor.writeUInt32LE(crc, 4)
    descriptor.writeUInt32LE(body.length, 8)
    descriptor.writeUInt32LE(data.length, 12)
    parts.push(local, name, body, descriptor)
    const c = Buffer.alloc(46)
    c.writeUInt32LE(0x02014b50, 0)
    c.writeUInt16LE(0x0808, 8)
    c.writeUInt16LE(folder ? 0 : 8, 10)
    c.writeUInt32LE(crc, 16)
    c.writeUInt32LE(body.length, 20)
    c.writeUInt32LE(data.length, 24)
    c.writeUInt16LE(name.length, 28)
    c.writeUInt32LE(offset, 42)
    central.push(c, name)
    offset += 30 + name.length + body.length + 16
  }
  const dir = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(files.length + 1, 8)
  end.writeUInt16LE(files.length + 1, 10)
  end.writeUInt32LE(dir.length, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(Buffer.byteLength(comment), 20)
  return new Uint8Array(Buffer.concat([...parts, dir, end, Buffer.from(comment)]))
}

describe('unzip', () => {
  const text = (e: { data: Uint8Array }) => new TextDecoder().decode(e.data)

  it('reads back what it writes, compressed or not', async () => {
    const script = new TextEncoder().encode('INT. HOUSE - DAY\n\n'.repeat(500))
    const noise = crypto.getRandomValues(new Uint8Array(2000))
    const entries = [
      { name: 'Café “Noir”.fountain', data: script },
      { name: 'noise.bin', data: noise },
    ]
    const packed = await zipFilesCompressed(entries)
    // The script shrinks; data that doesn't compress is stored as it is.
    expect(packed.length).toBeLessThan(script.length / 10 + noise.length + 500)
    const view = new DataView(packed.buffer)
    expect(view.getUint16(8, true)).toBe(8)
    for (const zip of [packed, zipFiles(entries)]) {
      const files = await unzipFiles(zip)
      expect(files.map((f) => f.name)).toEqual(['Café “Noir”.fountain', 'noise.bin'])
      expect(files[0].data).toEqual(script)
      expect(files[1].data).toEqual(noise)
    }
  })

  it('reads archives from other zip tools, and only the files asked for', async () => {
    const zip = streamedZip(
      [
        { name: 'scripts/Dune.screenplay.json', text: '{"a":1}' },
        { name: 'scripts/notes.txt', text: 'ignore me' },
      ],
      'Made by some other tool',
    )
    const files = await unzipFiles(zip, (name) => name.endsWith('.json'))
    expect(files.map((f) => [f.name, text(f)])).toEqual([['scripts/Dune.screenplay.json', '{"a":1}']])
  })

  it('refuses damaged archives and other files', async () => {
    const zip = zipFiles([{ name: 'a.txt', data: new TextEncoder().encode('hello there') }])
    const broken = zip.slice()
    broken[31 + 'a.txt'.length] ^= 0xff // flip bits in the file's data
    await expect(unzipFiles(broken)).rejects.toThrow('damaged')
    await expect(unzipFiles(zip.slice(0, zip.length - 30))).rejects.toThrow()
    await expect(unzipFiles(new TextEncoder().encode('INT. HOUSE - DAY'))).rejects.toThrow('isn’t a zip file')
  })
})
