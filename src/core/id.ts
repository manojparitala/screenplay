/** Short random id. Works in non-secure contexts where crypto.randomUUID is unavailable. */
export function uid(): string {
  const bytes = new Uint8Array(9)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 14)
}
