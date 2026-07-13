// model-report-pdf — composes the enclosure-model report the modeler's
// "Download PDF report" button produces. Web-only (consumes live chart
// canvases); jsPDF is imported dynamically so it never weighs on the
// initial bundle.
//
// Layout: one 11×17 (tabloid) landscape sheet — masthead band across the
// top, the headline alignment numbers and disclaimer down the left column,
// and every chart in a two-column grid on the right. Overflow (never in
// practice) continues the grid on a second sheet.

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

// 11×17 landscape in points.
const PAGE_W = 1224
const PAGE_H = 792
const MARGIN = 48
const LEFT_W = 300 // alignment-numbers column
const GUTTER = 28
const GRID_X = MARGIN + LEFT_W + GUTTER
const GRID_W = PAGE_W - MARGIN - GRID_X
const COL_GAP = 22
const COL_W = (GRID_W - COL_GAP) / 2

const INK = '#101820'
const GRAY = '#5f6b76'
const FAINT = '#9aa4ad'
const LINE = '#e2e5e8'

export async function downloadModelReport(data: ReportData): Promise<void> {
  // jspdf's "node" export condition serves an AMD build Metro can't parse
  // (it breaks the static-render pass), so target the browser ES build
  // directly via the ./dist/* subpath export.
  const { jsPDF } = await import('jspdf/dist/jspdf.es.min.js')
  const doc = new jsPDF({ unit: 'pt', format: 'tabloid', orientation: 'landscape' })

  // ── Header band ──
  let y = MARGIN
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
  y += 24
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.setTextColor(INK)
  doc.text(data.driverLabel + (data.custom ? '  (custom driver)' : ''), MARGIN, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(GRAY)
  doc.text(data.modeSummary, PAGE_W - MARGIN, y, { align: 'right' })
  y += 12
  doc.setDrawColor(INK)
  doc.setLineWidth(1.2)
  doc.line(MARGIN, y, PAGE_W - MARGIN, y)
  const bodyTop = y + 22

  // ── Left column: alignment numbers + disclaimer ──
  y = bodyTop
  doc.setFont('courier', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(GRAY)
  doc.text('ALIGNMENT NUMBERS', MARGIN, y)
  y += 14
  for (const row of data.rows) {
    doc.setFont('courier', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(FAINT)
    doc.text(row.label.toUpperCase(), MARGIN, y)
    y += 11
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(INK)
    const lines = doc.splitTextToSize(row.value, LEFT_W) as string[]
    doc.text(lines, MARGIN, y)
    y += lines.length * 12 + 5
    doc.setDrawColor(LINE)
    doc.setLineWidth(0.5)
    doc.line(MARGIN, y - 3, MARGIN + LEFT_W, y - 3)
    y += 10
  }
  y += 8
  doc.setFont('courier', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(FAINT)
  doc.text(doc.splitTextToSize(data.footnote, LEFT_W) as string[], MARGIN, y)

  // ── Right area: charts in a two-column grid ──
  // Measure each block first so grid rows sit on a shared baseline.
  const measure = (chart: ReportChart) => {
    doc.setFontSize(7.5)
    const captionLines = (doc.splitTextToSize(chart.caption, COL_W) as string[]).length
    const imgH = COL_W * (chart.canvas.height / chart.canvas.width)
    return 14 + imgH + 16 + captionLines * 9 + 8
  }

  const drawChart = (chart: ReportChart, x: number, top: number) => {
    let cy = top
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(INK)
    doc.text(chart.title, x, cy)
    cy += 8
    const imgH = COL_W * (chart.canvas.height / chart.canvas.width)
    doc.addImage(chart.canvas.toDataURL('image/png'), 'PNG', x, cy, COL_W, imgH)
    cy += imgH + 11
    // Legend: swatch + label, flowing left to right within the column.
    let lx = x
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    for (const entry of chart.legend) {
      const w = doc.getTextWidth(entry.label) + 22
      if (lx + w > x + COL_W) break
      doc.setFillColor(entry.color)
      doc.rect(lx, cy - 5, 11, 3, 'F')
      doc.setTextColor(GRAY)
      doc.text(entry.label, lx + 15, cy)
      lx += w + 9
    }
    cy += 10
    doc.setFont('courier', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(FAINT)
    doc.text(doc.splitTextToSize(chart.caption, COL_W) as string[], x, cy)
  }

  let gy = bodyTop
  for (let i = 0; i < data.charts.length; i += 2) {
    const rowCharts = data.charts.slice(i, i + 2)
    const rowH = Math.max(...rowCharts.map(measure))
    if (gy + rowH > PAGE_H - MARGIN - 18) {
      doc.addPage()
      gy = MARGIN
    }
    rowCharts.forEach((chart, j) => drawChart(chart, GRID_X + j * (COL_W + COL_GAP), gy + 10))
    gy += rowH + 14
  }

  // ── Running footer with page numbers ──
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setFont('courier', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(FAINT)
    doc.text('NCSW enclosure model — anechoic half-space, cabin gain not included', MARGIN, PAGE_H - 22)
    doc.text(`${p} / ${pages}`, PAGE_W - MARGIN, PAGE_H - 22, { align: 'right' })
  }

  const slug = data.driverLabel
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  doc.save(`ncsw-model-${slug || 'custom'}.pdf`)
}
