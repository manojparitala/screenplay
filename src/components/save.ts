import { zipFiles } from '../core/zip'
import { useApp } from '../store/app'

/**
 * Handing files to the writer.
 *
 * In a normal browser tab a file is downloaded with an <a download> link.
 * Inside the claude.ai artifact viewer, pages can't start downloads or open
 * the print dialog; the viewer instead offers a `downloads` capability that
 * asks the writer to confirm each save. It accepts a fixed list of file types,
 * so a Fountain script is saved as .txt and a Final Draft file inside a .zip.
 */

interface DownloadsApi {
  save(request: { filename: string; data: string | Blob | ArrayBuffer | ArrayBufferView }): Promise<{ status: 'saved' | 'delivered' }>
}

interface ClaudeRuntime {
  use(name: string): Promise<unknown>
}

/** File types the artifact viewer will save. */
const HOST_EXTENSIONS = new Set(['gif', 'png', 'jpg', 'jpeg', 'webp', 'mp4', 'webm', 'txt', 'json', 'md', 'docx', 'pptx', 'epub', 'csv', 'ttf', 'html', 'svg', 'pdf', 'xlsx', 'zip'])

function runtime(): ClaudeRuntime | null {
  const c = (globalThis as { claude?: ClaudeRuntime }).claude
  return c && typeof c.use === 'function' ? c : null
}

/** True inside the claude.ai artifact viewer, where printing and page-started downloads are blocked. */
export function inArtifactViewer(): boolean {
  if (!runtime()) return false
  try {
    return window.top !== window.self
  } catch {
    return true
  }
}

/** Printing works everywhere except inside the artifact viewer. */
export function canPrint(): boolean {
  return !inArtifactViewer()
}

let downloads: Promise<DownloadsApi | null> | null = null

/** The viewer's downloads capability, or null outside the viewer. Call early so the first save isn't kept waiting. */
export function hostDownloads(): Promise<DownloadsApi | null> {
  if (!downloads) {
    const rt = runtime()
    downloads = rt
      ? rt.use('downloads').then(
          (ns) => (ns as DownloadsApi | null) ?? null,
          () => null,
        )
      : Promise.resolve(null)
  }
  return downloads
}

function browserDownload(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Name and contents to hand to the viewer, adapted to the file types it accepts. */
export async function hostedFile(name: string, data: Blob | string): Promise<{ filename: string; data: Blob | string }> {
  const ext = name.split('.').pop()!.toLowerCase()
  if (HOST_EXTENSIONS.has(ext)) return { filename: name, data }
  // Fountain is plain text: every Fountain app opens .txt files.
  if (typeof data === 'string' && (ext === 'fountain' || ext === 'spmd')) return { filename: `${name}.txt`, data }
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(await data.arrayBuffer())
  return { filename: `${name}.zip`, data: new Blob([zipFiles([{ name, data: bytes }]) as Uint8Array<ArrayBuffer>], { type: 'application/zip' }) }
}

/**
 * Offer a file to the writer. Resolves true when it was handed to the browser
 * (or the viewer, after the writer confirmed), false otherwise.
 */
export async function saveFile(name: string, data: Blob | string, type = 'text/plain;charset=utf-8'): Promise<boolean> {
  const { notify } = useApp.getState()
  const host = await hostDownloads()
  if (host) {
    const file = await hostedFile(name, data)
    try {
      await host.save(file)
      return true
    } catch (e) {
      const code = (e as { code?: string } | null)?.code
      if (code === 'declined') return false
      if (code === 'rate_limited') {
        notify('A save is already waiting for your answer.')
        return false
      }
      if (code === 'rejected_extension' || code === 'extension_not_enabled') {
        notify(`This page can’t save .${file.filename.split('.').pop()} files. Try another format.`, 'error')
        return false
      }
      if (code === 'too_large') {
        notify('This file is too large to save from this page.', 'error')
        return false
      }
      if (code === 'bad_request' || code === 'transform_error') {
        notify(`Saving failed: ${(e as { message?: string }).message ?? code}`, 'error')
        return false
      }
      // Not available in this view: fall back to a normal download below.
    }
  }
  if (inArtifactViewer()) {
    notify('Saving files isn’t available in this view, so the export wasn’t saved.', 'error')
    return false
  }
  browserDownload(name, typeof data === 'string' ? new Blob([data], { type }) : data)
  return true
}
