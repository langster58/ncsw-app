// SubwooferFrontierChart — faithful port of SubwooferFrontierChart.jsx.
//
// The source uses HTML5 canvas + window.NCSW_SUBWOOFER_FRONTIER (248 rows).
// We load the same data file via <script src="/subwoofer-frontier-data.js"> in
// src/app/+html.tsx; this component reads window.NCSW_SUBWOOFER_FRONTIER
// exactly like the source.
//
// Web: canvas implementation ported 1:1 (axis math, draw order, hover hit-test,
// chips + price slider + tooltip).
// Native: placeholder (canvas isn't available without react-native-skia).

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Platform, Text, View } from 'react-native'

// ── Source constants (verbatim from SubwooferFrontierChart.jsx) ─────────────
const INK = '#09080E'
const BLUE = '#0576CC'
const MAGENTA = '#E941BC'
const GRID = '#ECECEC'
const TICK = '#8A8A8E'
const AXIS = '#6B6B70'

const SIZE_OPTIONS = ['all', '8', '10', '12', '15', '18']
const TIER_OPTIONS = ['all', 'entry', 'mid', 'upper-mid', 'reference']

// ── Source helpers (verbatim) ───────────────────────────────────────────────
type Row = {
  name: string
  sz: string
  tier: string
  price: number
  m: number
  vb: number
  xm: number
  xp: boolean
  rms: number
  sens: number
}

function rgba(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16)
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')'
}

function pareto(rows: Row[]): Row[] {
  return rows
    .filter(
      (r) =>
        !rows.some(
          (q) =>
            q !== r &&
            q.price <= r.price &&
            q.m >= r.m &&
            (q.price < r.price || q.m > r.m),
        ),
    )
    .sort((a, b) => a.price - b.price)
}

function money(n: number) {
  return '$' + Math.round(n).toLocaleString('en-US')
}

declare global {
  interface Window {
    NCSW_SUBWOOFER_FRONTIER?: Row[]
  }
}

export function SubwooferFrontierChart() {
  if (Platform.OS !== 'web') return <NativePlaceholder />
  return <WebChart />
}

function NativePlaceholder() {
  return (
    <View
      style={{
        width: '100%',
        aspectRatio: 16 / 9,
        backgroundColor: '#f5f5f5',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontFamily: 'IBM Plex Mono', fontSize: 11, color: AXIS }}>
        Value-frontier chart available on web
      </Text>
    </View>
  )
}

function WebChart() {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const plotRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const tooltipRef = useRef<HTMLDivElement | null>(null)
  const hoverRef = useRef(-1)
  const geomRef = useRef<any>(null)

  const [size, setSize] = useState('all')
  const [tier, setTier] = useState('all')
  const [price, setPrice] = useState(1670)
  const [rows, setRows] = useState<Row[]>([])

  // Pull the global dataset. <script defer> may not have populated window yet
  // at first render; poll briefly until it does (max ~4s).
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.NCSW_SUBWOOFER_FRONTIER && window.NCSW_SUBWOOFER_FRONTIER.length) {
      setRows(window.NCSW_SUBWOOFER_FRONTIER)
      return
    }
    let n = 0
    const id = window.setInterval(() => {
      n++
      if (window.NCSW_SUBWOOFER_FRONTIER && window.NCSW_SUBWOOFER_FRONTIER.length) {
        setRows(window.NCSW_SUBWOOFER_FRONTIER)
        window.clearInterval(id)
      } else if (n > 40) {
        window.clearInterval(id)
      }
    }, 100)
    return () => window.clearInterval(id)
  }, [])

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (size === 'all' || r.sz === size) &&
          (tier === 'all' || r.tier === tier) &&
          r.price >= 60 &&
          r.price <= price &&
          r.m != null,
      ),
    [rows, size, tier, price],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    const plot = plotRef.current
    const tip = tooltipRef.current
    if (!canvas || !plot || !tip) return undefined
    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined
    const dpr = window.devicePixelRatio || 1
    const pad = { top: 20, right: 16, bottom: 48, left: 52 }
    let raf = 0

    function layout() {
      const rect = plot!.getBoundingClientRect()
      const width = Math.max(320, Math.round(rect.width))
      const height = Math.max(300, Math.round(rect.height))
      canvas!.width = width * dpr
      canvas!.height = height * dpr
      canvas!.style.width = width + 'px'
      canvas!.style.height = height + 'px'
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
      return {
        width,
        height,
        pW: width - pad.left - pad.right,
        pH: height - pad.top - pad.bottom,
      }
    }

    function compute(box: ReturnType<typeof layout>) {
      if (!filtered.length) return null
      const prices = filtered.map((r) => r.price)
      const impacts = filtered.map((r) => Math.log10(r.m))
      const pMn = Math.max(0, Math.min(...prices) - 60)
      const pMx = Math.max(...prices) + 100
      const mMn = Math.min(...impacts) - 0.1
      const mMx = Math.max(...impacts) + 0.1
      const x = (p: number) => pad.left + ((p - pMn) / (pMx - pMn)) * box.pW
      const y = (v: number) =>
        pad.top + box.pH - ((Math.log10(v) - mMn) / (mMx - mMn)) * box.pH
      const frontier = pareto(filtered)
      return { pMn, pMx, mMn, mMx, x, y, frontier }
    }

    function draw() {
      const box = layout()
      const model = compute(box)
      geomRef.current = model
      ctx!.clearRect(0, 0, box.width, box.height)
      if (!model) {
        ctx!.fillStyle = AXIS
        ctx!.font = '13px Inter, sans-serif'
        ctx!.fillText('No drivers match these filters.', pad.left, pad.top + 28)
        return
      }
      const { pMn, pMx, mMn, mMx, x, y, frontier } = model
      const priceSpan = pMx - pMn
      const step =
        priceSpan > 1800 ? 400 : priceSpan > 1200 ? 200 : priceSpan > 600 ? 100 : 50
      ctx!.strokeStyle = GRID
      ctx!.lineWidth = 1
      ctx!.font = "11px 'IBM Plex Mono', monospace"

      for (let p = Math.ceil(pMn / step) * step; p <= pMx; p += step) {
        const px = x(p)
        ctx!.beginPath()
        ctx!.moveTo(px, pad.top)
        ctx!.lineTo(px, pad.top + box.pH)
        ctx!.stroke()
        ctx!.fillStyle = TICK
        ctx!.textAlign = 'center'
        ctx!.fillText('$' + p, px, pad.top + box.pH + 18)
      }

      ;[0.05, 0.1, 0.2, 0.5, 1, 2, 4, 8]
        .filter((t) => Math.log10(t) >= mMn && Math.log10(t) <= mMx)
        .forEach((t) => {
          const py = y(t)
          ctx!.strokeStyle = t === 1 ? '#D8D8DC' : GRID
          ctx!.beginPath()
          ctx!.moveTo(pad.left, py)
          ctx!.lineTo(pad.left + box.pW, py)
          ctx!.stroke()
          ctx!.fillStyle = TICK
          ctx!.textAlign = 'right'
          ctx!.fillText(t < 1 ? String(t) : t === 1 ? '1.00' : String(t), pad.left - 8, py + 4)
        })

      ctx!.fillStyle = AXIS
      ctx!.font = "11px 'IBM Plex Mono', monospace"
      ctx!.textAlign = 'center'
      ctx!.fillText('PRICE', pad.left + box.pW / 2, box.height - 8)
      ctx!.save()
      ctx!.translate(13, pad.top + box.pH / 2)
      ctx!.rotate(-Math.PI / 2)
      ctx!.fillText('IMPACT - HC-12 = 1.00', 0, 0)
      ctx!.restore()

      if (frontier.length) {
        ctx!.beginPath()
        frontier.forEach((r, i) =>
          i ? ctx!.lineTo(x(r.price), y(r.m)) : ctx!.moveTo(x(r.price), y(r.m)),
        )
        ctx!.strokeStyle = BLUE
        ctx!.lineWidth = 1.5
        ctx!.setLineDash([4, 4])
        ctx!.stroke()
        ctx!.setLineDash([])
      }

      filtered.forEach((r, i) => {
        if (i === hoverRef.current) return
        ctx!.beginPath()
        ctx!.arc(x(r.price), y(r.m), frontier.includes(r) ? 5.5 : 4, 0, Math.PI * 2)
        ctx!.fillStyle = frontier.includes(r) ? BLUE : rgba(INK, 0.22)
        ctx!.fill()
        if (frontier.includes(r)) {
          ctx!.strokeStyle = '#fff'
          ctx!.lineWidth = 1.5
          ctx!.stroke()
        }
      })

      if (hoverRef.current >= 0 && filtered[hoverRef.current]) {
        const r = filtered[hoverRef.current]
        ctx!.beginPath()
        ctx!.arc(x(r.price), y(r.m), 7, 0, Math.PI * 2)
        ctx!.fillStyle = MAGENTA
        ctx!.fill()
        ctx!.strokeStyle = '#fff'
        ctx!.lineWidth = 2
        ctx!.stroke()
      }
    }

    function scheduleDraw() {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(draw)
    }

    function onMove(e: MouseEvent) {
      const model = geomRef.current
      if (!model) return
      const rect = canvas!.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      let best = -1
      let bestDist = 20
      filtered.forEach((row, i) => {
        const d = Math.hypot(mx - model.x(row.price), my - model.y(row.m))
        if (d < bestDist) {
          bestDist = d
          best = i
        }
      })
      if (best !== hoverRef.current) {
        hoverRef.current = best
        draw()
      }
      if (best >= 0) {
        const r = filtered[best]
        const onFrontier = model.frontier.includes(r)
        tip!.innerHTML =
          '<div class="vf-tip-name">' +
          r.name +
          ' (' +
          r.sz +
          '")' +
          (r.tier !== 'untiered' ? ' · ' + r.tier : '') +
          '</div>' +
          '<div class="vf-tip-row">Impact <b>' +
          r.m.toFixed(2) +
          '</b> · ' +
          money(r.price) +
          ' · ' +
          (onFrontier ? '<b>on frontier</b>' : 'dominated') +
          '</div>' +
          '<div class="vf-tip-row">Box <b>' +
          r.vb +
          ' ft³</b> · Xmax <b>' +
          r.xm +
          'mm' +
          (r.xp ? ' (print)' : '') +
          '</b></div>' +
          '<div class="vf-tip-row">RMS <b>' +
          r.rms +
          'W</b> · Sens <b>' +
          r.sens.toFixed(1) +
          'dB 1W</b></div>'
        tip!.classList.add('on')
        let tx = mx + 16
        if (tx + 320 > rect.width) tx = Math.max(4, mx - 330)
        let ty = my - 44
        if (ty < 0) ty = my + 16
        tip!.style.left = tx + 'px'
        tip!.style.top = ty + 'px'
      } else {
        tip!.classList.remove('on')
      }
    }

    function onLeave() {
      hoverRef.current = -1
      tip!.classList.remove('on')
      draw()
    }

    const ro = (window as any).ResizeObserver ? new ResizeObserver(scheduleDraw) : null
    if (ro) ro.observe(plot)
    window.addEventListener('resize', scheduleDraw)
    canvas.addEventListener('mousemove', onMove)
    canvas.addEventListener('mouseleave', onLeave)
    if ((document as any).fonts && (document as any).fonts.ready)
      (document as any).fonts.ready.then(scheduleDraw)
    scheduleDraw()
    return () => {
      cancelAnimationFrame(raf)
      if (ro) ro.disconnect()
      window.removeEventListener('resize', scheduleDraw)
      canvas.removeEventListener('mousemove', onMove)
      canvas.removeEventListener('mouseleave', onLeave)
    }
  }, [filtered])

  const priceLabel = '≤ $' + price.toLocaleString('en-US')

  return React.createElement(
    'div',
    { className: 'vf-chart', ref: rootRef, 'aria-label': 'Subwoofer value frontier chart' },
    React.createElement(
      'div',
      { className: 'vf-controls' },
      React.createElement(
        'div',
        { className: 'vf-group' },
        React.createElement('span', { className: 'vf-label' }, 'Size'),
        React.createElement(
          'div',
          { className: 'vf-chips' },
          SIZE_OPTIONS.map((opt) =>
            React.createElement(
              'button',
              {
                key: opt,
                type: 'button',
                className: 'vf-chip' + (size === opt ? ' on' : ''),
                'aria-pressed': size === opt,
                onClick: () => setSize(opt),
              },
              opt === 'all' ? 'All' : opt + '"',
            ),
          ),
        ),
      ),
      React.createElement(
        'div',
        { className: 'vf-group' },
        React.createElement('span', { className: 'vf-label' }, 'Tier'),
        React.createElement(
          'div',
          { className: 'vf-chips' },
          TIER_OPTIONS.map((opt) =>
            React.createElement(
              'button',
              {
                key: opt,
                type: 'button',
                className: 'vf-chip' + (tier === opt ? ' on' : ''),
                'aria-pressed': tier === opt,
                onClick: () => setTier(opt),
              },
              opt === 'all' ? 'All' : opt,
            ),
          ),
        ),
      ),
      React.createElement(
        'div',
        { className: 'vf-group vf-price' },
        React.createElement(
          'label',
          { className: 'vf-label', htmlFor: 'vf-price' },
          'Price ',
          React.createElement('span', null, priceLabel),
        ),
        React.createElement('input', {
          id: 'vf-price',
          type: 'range',
          min: 60,
          max: 1900,
          value: price,
          step: 10,
          onChange: (e: any) => setPrice(Number(e.target.value)),
          'aria-label': 'Maximum subwoofer price',
        }),
      ),
    ),
    React.createElement(
      'div',
      { className: 'vf-canvas-wrap', ref: plotRef },
      React.createElement('canvas', { className: 'vf-canvas', ref: canvasRef }),
      React.createElement('div', { className: 'vf-tooltip', ref: tooltipRef }),
    ),
    React.createElement(
      'div',
      { className: 'vf-legend' },
      React.createElement(
        'span',
        null,
        React.createElement('i', { className: 'vf-dot vf-dot-blue' }),
        'On value frontier',
      ),
      React.createElement(
        'span',
        null,
        React.createElement('i', { className: 'vf-dot vf-dot-gray' }),
        'Dominated',
      ),
      React.createElement(
        'span',
        null,
        React.createElement('i', { className: 'vf-dash' }),
        'Efficient frontier',
      ),
    ),
  )
}
