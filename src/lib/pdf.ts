import html2canvas from 'html2canvas-pro'
import { jsPDF } from 'jspdf'

// All PDFs are generated client-side (jspdf + html2canvas-pro).
// NOTE: html2canvas-pro is required because original html2canvas cannot parse
// Tailwind v4's OKLCH colors. Do not swap this dependency.

async function capture(el: HTMLElement, scale = 2): Promise<HTMLCanvasElement> {
  return html2canvas(el, {
    scale,
    useCORS: true,
    backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--color-card') || null,
    logging: false,
  })
}

function triggerDownload(pdf: jsPDF, filename: string) {
  pdf.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`)
}

/** Capture a DOM element into a single-page PDF sized to the element. */
export async function elementToPdf(el: HTMLElement, filename: string, opts?: { scale?: number }) {
  const canvas = await capture(el, opts?.scale ?? 2)
  const imgW = canvas.width
  const imgH = canvas.height
  const pdf = new jsPDF({ orientation: imgW >= imgH ? 'landscape' : 'portrait', unit: 'pt', format: [imgW, imgH] })
  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, imgW, imgH)
  triggerDownload(pdf, filename)
}

/** Capture a DOM element as a PNG data URL (for previews inside PDFs). */
export async function elementToDataUrl(el: HTMLElement, scale = 2): Promise<string> {
  const canvas = await capture(el, scale)
  return canvas.toDataURL('image/png')
}

/**
 * Bulk ID cards: capture each card element and lay them out on A4 sheets in a grid.
 * Default card size 86x54mm (CR80) with 3 columns per row.
 */
export async function cardsGridToPdf(
  els: HTMLElement[],
  filename: string,
  opts?: { cardW?: number; cardH?: number; cols?: number; landscape?: boolean },
) {
  const cardW = opts?.cardW ?? 86
  const cardH = opts?.cardH ?? 54
  const cols = opts?.cols ?? 2
  const pdf = new jsPDF({ orientation: opts?.landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const marginX = (pageW - cols * cardW) / 2
  const rows = Math.max(1, Math.floor((pageH - 20) / (cardH + 6)))
  const gapX = 6
  const gapY = 6

  for (let i = 0; i < els.length; i++) {
    const el = els[i]
    if (!el) continue
    const canvas = await capture(el, 2)
    const col = i % cols
    const row = Math.floor(i / cols) % rows
    if (i > 0 && i % (cols * rows) === 0) pdf.addPage()
    const x = marginX + col * (cardW + gapX)
    const y = 10 + row * (cardH + gapY)
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', x, y, cardW, cardH)
    pdf.setDrawColor(180)
    pdf.rect(x, y, cardW, cardH)
  }
  triggerDownload(pdf, filename)
}
