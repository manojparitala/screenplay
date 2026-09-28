import { crc32 as nodeCrc32 } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { crc32, zipFiles } from './zip'

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
