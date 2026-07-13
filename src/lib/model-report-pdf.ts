// model-report-pdf — composes the enclosure-model report the modeler's
// "Download PDF report" button produces. Web-only (consumes live chart
// canvases); jsPDF is imported dynamically so it never weighs on the
// initial bundle.
//
// Layout: 8.5×11 (letter) landscape. Page one opens with the masthead and
// the alignment numbers flowed full-width across the top (three columns of
// label/value cells), then every chart stacks full-width, one per row, each
// under its own ruled heading. Blocks are measured before drawing and
// page-break as whole units, so nothing ever crops at a page edge. Chart
// bitmaps are downsampled before embedding to keep the file shareable.

export type ReportLegendEntry = { label: string; color: string }

export type ReportChart = {
  title: string
  caption: string
  canvas: HTMLCanvasElement
  legend: ReportLegendEntry[]
}

export type ReportData = {
  driverLabel: string
  custom: boolean
  modeSummary: string
  rows: { label: string; value: string }[]
  charts: ReportChart[]
  footnote: string
}

// 8.5×11 landscape in points.
const PAGE_W = 792
const PAGE_H = 612
const MARGIN = 44
const CONTENT_W = PAGE_W - 2 * MARGIN
const FOOTER_Y = PAGE_H - 22
const BOTTOM = FOOTER_Y - 14 // last usable y

const DATA_COLS = 3
const CELL_GAP = 24
const CELL_W = (CONTENT_W - (DATA_COLS - 1) * CELL_GAP) / DATA_COLS

const INK = '#101820'
const GRAY = '#5f6b76'
const FAINT = '#9aa4ad'
const LINE = '#e2e5e8'

// jsPDF's built-in Helvetica/Courier only cover CP1252. Characters outside
// it (″ → α …) both render as garbage AND corrupt width measurement, which
// is what makes right-aligned/wrapped text overflow the page. Transliterate
// the app's typography to safe equivalents, then strip anything else that
// isn't Latin-1 or a CP1252 punctuation extra.
const PDF_CHAR_MAP: [RegExp, string][] = [
  [/″/g, '"'],
  [/′/g, "'"],
  [/→/g, '->'],
  [/α/g, 'alpha'],
  [/Ω/g, ' ohm'],
  [/≤/g, '<='],
  [/≥/g, '>='],
]
function pdfSafe(s: string): string {
  let out = s
  for (const [re, repl] of PDF_CHAR_MAP) out = out.replace(re, repl)
  return out.replace(/[^\x20-\xFF–—‘’“”•…]/g, '')
}

// Downsample a chart canvas before embedding — the live canvases render at
// devicePixelRatio and would otherwise bloat the PDF past 20 MB.
function chartPng(canvas: HTMLCanvasElement, maxW = 1500): string {
  if (canvas.width <= maxW) return canvas.toDataURL('image/png')
  const off = document.createElement('canvas')
  off.width = maxW
  off.height = Math.round(canvas.height * (maxW / canvas.width))
  off.getContext('2d')!.drawImage(canvas, 0, 0, off.width, off.height)
  return off.toDataURL('image/png')
}

export async function downloadModelReport(raw: ReportData): Promise<void> {
  // Sanitize every string up front so all layout math downstream measures
  // what actually gets drawn.
  const data: ReportData = {
    ...raw,
    driverLabel: pdfSafe(raw.driverLabel),
    modeSummary: pdfSafe(raw.modeSummary),
    rows: raw.rows.map((r) => ({ label: pdfSafe(r.label), value: pdfSafe(r.value) })),
    charts: raw.charts.map((c) => ({
      ...c,
      title: pdfSafe(c.title),
      caption: pdfSafe(c.caption),
      legend: c.legend.map((l) => ({ ...l, label: pdfSafe(l.label) })),
    })),
    footnote: pdfSafe(raw.footnote),
  }

  // jspdf's "node" export condition serves an AMD build Metro can't parse
  // (it breaks the static-render pass), so target the browser ES build
  // directly via the ./dist/* subpath export.
  const { jsPDF } = await import('jspdf/dist/jspdf.es.min.js')
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'landscape' })
  let y = MARGIN

  const pageBreak = () => {
    doc.addPage()
    y = MARGIN
  }
  const ensure = (need: number) => {
    if (y + need > BOTTOM) pageBreak()
  }

  // ── Masthead ──
  doc.setFont('courier', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(GRAY)
  doc.text('NORTH COAST SOUNDWORKS — ENCLOSURE MODELER', MARGIN, y)
  doc.setFont('courier', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(FAINT)
  doc.text(
    `Generated ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} · ncsw-app.vercel.app/modeler`,
    PAGE_W - MARGIN,
    y,
    { align: 'right' },
  )
  y += 22
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(19)
  doc.setTextColor(INK)
  doc.text(data.driverLabel + (data.custom ? '  (custom driver)' : ''), MARGIN, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10.5)
  doc.setTextColor(GRAY)
  doc.text(data.modeSummary, PAGE_W - MARGIN, y, { align: 'right' })
  y += 10
  doc.setDrawColor(INK)
  doc.setLineWidth(1.2)
  doc.line(MARGIN, y, PAGE_W - MARGIN, y)
  y += 18

  // ── Alignment numbers, full width across the top ──
  doc.setFont('courier', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(GRAY)
  doc.text('ALIGNMENT NUMBERS', MARGIN, y)
  y += 13
  for (let i = 0; i < data.rows.length; i += DATA_COLS) {
    const cells = data.rows.slice(i, i + DATA_COLS)
    doc.setFontSize(9.5)
    const wrapped = cells.map((c) => doc.splitTextToSize(c.value, CELL_W) as string[])
    const rowH = 10 + Math.max(...wrapped.map((w) => w.length)) * 11 + 9
    ensure(rowH)
    cells.forEach((cell, j) => {
      const x = MARGIN + j * (CELL_W + CELL_GAP)
      doc.setFont('courier', 'normal')
      doc.setFontSize(7.5)
      doc.setTextColor(FAINT)
      doc.text(cell.label.toUpperCase(), x, y)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9.5)
      doc.setTextColor(INK)
      doc.text(wrapped[j], x, y + 11)
      doc.setDrawColor(LINE)
      doc.setLineWidth(0.5)
      doc.line(x, y + rowH - 6, x + CELL_W, y + rowH - 6)
    })
    y += rowH + 4
  }
  y += 12

  // ── Charts: full width, one per row, each under a ruled heading ──
  for (const chart of data.charts) {
    // Fit: full content width unless the image would run past the page
    // bottom even on a fresh page — then shrink to fit height.
    const ratio = chart.canvas.height / chart.canvas.width
    let imgW = CONTENT_W
    let imgH = imgW * ratio
    const maxImgH = BOTTOM - MARGIN - 64 // heading + legend + caption allowance
    if (imgH > maxImgH) {
      imgH = maxImgH
      imgW = imgH / ratio
    }
    doc.setFontSize(7.5)
    const captionLines = doc.splitTextToSize(chart.caption, CONTENT_W) as string[]
    const blockH = 24 + imgH + 15 + captionLines.length * 9
    ensure(blockH)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12.5)
    doc.setTextColor(INK)
    doc.text(chart.title, MARGIN, y + 4)
    doc.setDrawColor(LINE)
    doc.setLineWidth(0.5)
    doc.line(MARGIN, y + 10, PAGE_W - MARGIN, y + 10)
    y += 24

    doc.addImage(chartPng(chart.canvas), 'PNG', MARGIN, y, imgW, imgH)
    y += imgH + 10

    // Legend: swatch + label, flowing left to right.
    let lx = MARGIN
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    for (const entry of chart.legend) {
      const w = doc.getTextWidth(entry.label) + 22
      if (lx + w > PAGE_W - MARGIN) break
      doc.setFillColor(entry.color)
      doc.rect(lx, y - 5.5, 11, 3, 'F')
      doc.setTextColor(GRAY)
      doc.text(entry.label, lx + 15, y)
      lx += w + 9
    }
    y += 10
    doc.setFont('courier', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(FAINT)
    doc.text(captionLines, MARGIN, y)
    y += captionLines.length * 9 + 18
  }

  // ── Disclaimer ──
  doc.setFontSize(7.5)
  const footLines = doc.splitTextToSize(data.footnote, CONTENT_W) as string[]
  ensure(footLines.length * 9 + 14)
  doc.setDrawColor(LINE)
  doc.setLineWidth(0.5)
  doc.line(MARGIN, y, PAGE_W - MARGIN, y)
  y += 11
  doc.setFont('courier', 'normal')
  doc.setTextColor(FAINT)
  doc.text(footLines, MARGIN, y)

  // ── Running footer with page numbers ──
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setFont('courier', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(FAINT)
    doc.text('NCSW enclosure model — anechoic half-space, cabin gain not included', MARGIN, FOOTER_Y)
    doc.text(`${p} / ${pages}`, PAGE_W - MARGIN, FOOTER_Y, { align: 'right' })
  }

  const slug = data.driverLabel
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  doc.save(`ncsw-model-${slug || 'custom'}.pdf`)
}
