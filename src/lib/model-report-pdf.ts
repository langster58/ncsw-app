// model-report-pdf — composes the enclosure-model report the modeler's
// "Download PDF report" button produces. Web-only (consumes live chart
// canvases); jsPDF is imported dynamically so it never weighs on the
// initial bundle.
//
// Layout: A4 portrait — masthead, driver + alignment summary, the headline
// alignment numbers as a hairline table, then each chart image with its
// legend and caption, paginated with a running footer.

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

const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN = 48
const CONTENT_W = PAGE_W - 2 * MARGIN

const INK = '#101820'
const GRAY = '#5f6b76'
const FAINT = '#9aa4ad'
const LINE = '#e2e5e8'

export async function downloadModelReport(data: ReportData): Promise<void> {
  // jspdf's "node" export condition serves an AMD build Metro can't parse
  // (it breaks the static-render pass), so target the browser ES build
  // directly via the ./dist/* subpath export.
  const { jsPDF } = await import('jspdf/dist/jspdf.es.min.js')
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  let y = MARGIN

  const ensure = (need: number) => {
    if (y + need > PAGE_H - MARGIN - 18) {
      doc.addPage()
      y = MARGIN
    }
  }

  // Masthead
  doc.setFont('courier', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(GRAY)
  doc.text('NORTH COAST SOUNDWORKS — ENCLOSURE MODELER', MARGIN, y)
  y += 22
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(INK)
  doc.text(data.driverLabel + (data.custom ? '  (custom driver)' : ''), MARGIN, y)
  y += 18
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10.5)
  doc.setTextColor(GRAY)
  doc.text(data.modeSummary, MARGIN, y)
  y += 13
  doc.setFontSize(8.5)
  doc.setTextColor(FAINT)
  doc.text(
    `Generated ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} · ncsw-app.vercel.app/modeler`,
    MARGIN,
    y,
  )
  y += 10
  doc.setDrawColor(INK)
  doc.setLineWidth(1)
  doc.line(MARGIN, y, MARGIN + CONTENT_W, y)
  y += 18

  // Alignment numbers table
  doc.setFont('courier', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(GRAY)
  doc.text('ALIGNMENT NUMBERS', MARGIN, y)
  y += 12
  for (const row of data.rows) {
    ensure(20)
    doc.setFont('courier', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(FAINT)
    doc.text(row.label.toUpperCase(), MARGIN, y + 4)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    doc.setTextColor(INK)
    // Right column starts at a fixed tab; wrap long values.
    const valueX = MARGIN + 170
    const lines = doc.splitTextToSize(row.value, CONTENT_W - 170) as string[]
    doc.text(lines, valueX, y + 4)
    const rowH = Math.max(1, lines.length) * 11 + 7
    doc.setDrawColor(LINE)
    doc.setLineWidth(0.5)
    doc.line(MARGIN, y + rowH - 4, MARGIN + CONTENT_W, y + rowH - 4)
    y += rowH
  }
  y += 14

  // Charts
  for (const chart of data.charts) {
    const ratio = chart.canvas.height / chart.canvas.width
    const imgH = CONTENT_W * ratio
    const legendH = 14
    ensure(16 + imgH + legendH + 24)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(INK)
    doc.text(chart.title, MARGIN, y)
    y += 8

    const png = chart.canvas.toDataURL('image/png')
    doc.addImage(png, 'PNG', MARGIN, y, CONTENT_W, imgH)
    y += imgH + 12

    // Legend: swatch + label, flowing left to right.
    let lx = MARGIN
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    for (const entry of chart.legend) {
      const w = doc.getTextWidth(entry.label) + 24
      if (lx + w > MARGIN + CONTENT_W) break
      doc.setFillColor(entry.color)
      doc.rect(lx, y - 5.5, 12, 3, 'F')
      doc.setTextColor(GRAY)
      doc.text(entry.label, lx + 16, y)
      lx += w + 10
    }
    y += 11

    doc.setFont('courier', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(FAINT)
    doc.text(doc.splitTextToSize(chart.caption, CONTENT_W) as string[], MARGIN, y)
    y += 22
  }

  // Footnote / disclaimer
  ensure(28)
  doc.setDrawColor(LINE)
  doc.setLineWidth(0.5)
  doc.line(MARGIN, y, MARGIN + CONTENT_W, y)
  y += 12
  doc.setFont('courier', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(FAINT)
  doc.text(doc.splitTextToSize(data.footnote, CONTENT_W) as string[], MARGIN, y)

  // Running footer with page numbers
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setFont('courier', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(FAINT)
    doc.text('NCSW enclosure model — anechoic half-space, cabin gain not included', MARGIN, PAGE_H - 24)
    doc.text(`${p} / ${pages}`, MARGIN + CONTENT_W, PAGE_H - 24, { align: 'right' })
  }

  const slug = data.driverLabel
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  doc.save(`ncsw-model-${slug || 'custom'}.pdf`)
}
