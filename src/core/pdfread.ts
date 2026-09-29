import type { PdfItem, PdfPage } from './pdfimport'

/** The parts of pdf.js we use (browser and Node builds share this shape). */
export interface PdfJsLike {
  getDocument(src: { data: Uint8Array; verbosity?: number; isEvalSupported?: boolean; disableFontFace?: boolean }): {
    promise: Promise<PdfDocLike>
    destroy(): Promise<void>
  }
}

interface PdfDocLike {
  numPages: number
  getPage(n: number): Promise<PdfPageLike>
}

interface PdfPageLike {
  getViewport(o: { scale: number }): { width: number; height: number }
  getOperatorList(): Promise<unknown>
  streamTextContent(): ReadableStream<{ items: unknown[] }>
  commonObjs: { get(id: string): unknown }
  cleanup(): void
}

/**
 * All the text items of a page. pdf.js's own getTextContent() loops over a
 * stream with `for await`, which Safari can't do, so read the stream here.
 */
async function textItems(page: PdfPageLike): Promise<unknown[]> {
  const reader = page.streamTextContent().getReader()
  const items: unknown[] = []
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return items
    for (const item of value.items) items.push(item)
  }
}

interface TextItemLike {
  str: string
  transform: number[]
  width: number
  height: number
  fontName: string
}

/** Extract positioned text from every page of a PDF with pdf.js. */
export async function readPdfPages(data: Uint8Array, pdfjs: PdfJsLike, onProgress?: (page: number, total: number) => void): Promise<PdfPage[]> {
  // Only the text is read, never drawn, so the PDF's fonts needn't be loaded into the page.
  const task = pdfjs.getDocument({ data, verbosity: 0, isEvalSupported: false, disableFontFace: true })
  const doc = await task.promise
  const pages: PdfPage[] = []
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const viewport = page.getViewport({ scale: 1 })
      // Loading the operator list makes the real font names (e.g. "Courier-Bold") available.
      await page.getOperatorList()
      const items: PdfItem[] = []
      for (const raw of await textItems(page)) {
        const it = raw as TextItemLike
        if (typeof it.str !== 'string' || !it.transform) continue
        let font = it.fontName
        try {
          const f = page.commonObjs.get(it.fontName) as { name?: string } | undefined
          if (f?.name) font = f.name
        } catch {
          /* font not loaded: keep the internal id */
        }
        items.push({ str: it.str, x: it.transform[4], y: it.transform[5], width: it.width, height: it.height, font })
      }
      pages.push({ width: viewport.width, height: viewport.height, items })
      page.cleanup()
      onProgress?.(i, doc.numPages)
    }
  } finally {
    await task.destroy()
  }
  return pages
}
