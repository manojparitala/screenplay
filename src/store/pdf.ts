import { parsePdfPages, type LayoutImport } from '../core/pdfimport'
import { readPdfPages, type PdfJsLike } from '../core/pdfread'

/** Read a screenplay PDF in the browser. pdf.js is loaded only when needed. */
export async function importPdf(data: ArrayBuffer): Promise<LayoutImport> {
  // The legacy build carries polyfills; the modern one needs very recent browsers.
  const [pdfjs, worker] = await Promise.all([import('pdfjs-dist/legacy/build/pdf.mjs'), import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')])
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const pages = await readPdfPages(new Uint8Array(data), pdfjs as unknown as PdfJsLike)
  const result = parsePdfPages(pages)
  if (!result.elements.length) {
    throw new Error('No text was found in this PDF. If it is a scan, it needs text recognition (OCR) before it can be imported.')
  }
  return result
}
