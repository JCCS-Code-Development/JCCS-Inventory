// Client-side text extraction for the "scan an invoice/receipt" order flow.
// Both engines are dynamically imported from inside these functions (never
// at module top-level) so their sizeable code — pdfjs-dist's parser and
// tesseract.js's OCR engine + WASM — only downloads once someone actually
// taps Scan, the same lazy-loading approach used for the barcode scanner.
//
// This is a free, no-account, in-browser approach (vs. a paid cloud
// document-AI API) — accurate on clean digital invoices, noticeably weaker
// on messy receipt photos or handwriting. Callers should always treat the
// result as a starting point to review, never an authoritative read.

export async function extractTextFromPdf(file) {
  const pdfjsLib = await import('pdfjs-dist')
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

  const buffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise

  let text = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    text += content.items.map((it) => it.str ?? '').join(' ') + '\n'
  }

  if (!text.trim()) {
    throw new Error('This PDF has no readable text — it may be a scanned image. Enter the items manually.')
  }
  return text
}

export async function extractTextFromImage(fileOrBlob) {
  const { recognize } = await import('tesseract.js')
  const { data } = await recognize(fileOrBlob, 'eng')
  if (!data.text.trim()) {
    throw new Error('Could not read any text from that photo. Enter the items manually.')
  }
  return data.text
}
