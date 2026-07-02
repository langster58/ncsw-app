// SubwooferFrontierChart — faithful port of SubwooferFrontierChart.jsx, built on
// React Native primitives (View/Text/Pressable) with web-only escape hatches
// for <canvas> and <input type=range> — the two interactive web elements that
// have no React Native equivalent.
//
// Source: SubwooferFrontierChart.jsx + the .vf-* rules in home.css. All values
// (colors, paddings, sizes, axis math, draw order, hit-test radius) are taken
// verbatim from the source. Data comes from window.NCSW_SUBWOOFER_FRONTIER
// (loaded via <script src="/subwoofer-frontier-data.js"> in src/app/+html.tsx).

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Platform, Pressable, Text, View } from 'react-native'
import { fluid, fluidLineHeight, fluidNumber, radius, type, useFluidPx, useFluidValue } from '@/ui'

// ── Source constants (verbatim) ─────────────────────────────────────────────
const INK = '#09080E'
const BLUE = '#0576CC'
const MAGENTA = '#E941BC'
const GRID = '#ECECEC'
const TICK = '#8A8A8E'
const AXIS = '#6B6B70'
const LINE = '#ECECEC'
const FG_2 = '#656565'
const FONT_MONO = 'IBM Plex Mono'
const FONT_BODY = 'Inter'

const SIZE_OPTIONS = ['all', '8', '10', '12', '15', '18']
const TIER_OPTIONS = ['all', 'entry', 'mid', 'upper-mid', 'reference']

// ── Helpers (verbatim from source) ──────────────────────────────────────────
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

// ── Component ───────────────────────────────────────────────────────────────
export function SubwooferFrontierChart() {
  if (Platform.OS !== 'web') return <NativePlaceholder />
  return <WebChart />
}

function NativePlaceholder() {
  const fontSize = useFluidPx(type.meta)
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
      <Text style={{ fontFamily: FONT_MONO, fontSize, color: AXIS } as any}>
        Value-frontier chart available on web
      </Text>
    </View>
  )
}

type TooltipState = {
  row: Row
  onFrontier: boolean
  left: number
  top: number
}

function WebChart() {
  const plotRef = useRef<any>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const hoverRef = useRef(-1)
  const geomRef = useRef<any>(null)

  const [size, setSize] = useState('all')
  const [tier, setTier] = useState('all')
  const [price, setPrice] = useState(1670)
  const [rows, setRows] = useState<Row[]>([])
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const legendSize = useFluidPx(type.meta)

  // Pull the global dataset (<script defer> populates window.NCSW_SUBWOOFER_FRONTIER).
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
    if (!canvas || !plot) return undefined
    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined
    const dpr = window.devicePixelRatio || 1
    let raf = 0

    // Canvas drawing is imperative pixel math, invisible to CSS — so it needs
    // its own scale read straight off the viewport width every time it
    // redraws (on mount and on every resize), matching the same uniform
    // proportional formula as the rest of the fluid engine.
    function fpx(anchor: number, floor: number) {
      return fluidNumber(anchor, floor, window.innerWidth)
    }

    function currentPad() {
      return { top: fpx(20, 16), right: fpx(16, 13), bottom: fpx(48, 38), left: fpx(52, 42) }
    }

    function layout() {
      const pad = currentPad()
      const rect = plot.getBoundingClientRect()
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
        pad,
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
      const x = (p: number) => box.pad.left + ((p - pMn) / (pMx - pMn)) * box.pW
      const y = (v: number) =>
        box.pad.top + box.pH - ((Math.log10(v) - mMn) / (mMx - mMn)) * box.pH
      const frontier = pareto(filtered)
      return { pMn, pMx, mMn, mMx, x, y, frontier }
    }

    function draw() {
      const box = layout()
      const pad = box.pad
      const model = compute(box)
      geomRef.current = model
      const tickFontPx = fpx(11, 10)
      const tickFont = `${tickFontPx}px 'IBM Plex Mono', monospace`
      ctx!.clearRect(0, 0, box.width, box.height)
      if (!model) {
        ctx!.fillStyle = AXIS
        ctx!.font = `${fpx(13, 11)}px Inter, sans-serif`
        ctx!.fillText('No drivers match these filters.', pad.left, pad.top + fpx(28, 22))
        return
      }
      const { pMn, pMx, mMn, mMx, x, y, frontier } = model
      const priceSpan = pMx - pMn
      const step =
        priceSpan > 1800 ? 400 : priceSpan > 1200 ? 200 : priceSpan > 600 ? 100 : 50
      ctx!.strokeStyle = GRID
      ctx!.lineWidth = 1
      ctx!.font = tickFont
      const tickOffsetY = fpx(18, 14)
      const tickOffsetX = fpx(8, 6)
      const tickNudge = fpx(4, 3)

      for (let p = Math.ceil(pMn / step) * step; p <= pMx; p += step) {
        const px = x(p)
        ctx!.beginPath()
        ctx!.moveTo(px, pad.top)
        ctx!.lineTo(px, pad.top + box.pH)
        ctx!.stroke()
        ctx!.fillStyle = TICK
        ctx!.textAlign = 'center'
        ctx!.fillText('$' + p, px, pad.top + box.pH + tickOffsetY)
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
          ctx!.fillText(t < 1 ? String(t) : t === 1 ? '1.00' : String(t), pad.left - tickOffsetX, py + tickNudge)
        })

      ctx!.fillStyle = AXIS
      ctx!.font = tickFont
      ctx!.textAlign = 'center'
      ctx!.fillText('PRICE', pad.left + box.pW / 2, box.height - tickOffsetX)
      ctx!.save()
      ctx!.translate(fpx(13, 10), pad.top + box.pH / 2)
      ctx!.rotate(-Math.PI / 2)
      ctx!.fillText('IMPACT - HC-12 = 1.00', 0, 0)
      ctx!.restore()

      const frontierDash = fpx(4, 3)
      if (frontier.length) {
        ctx!.beginPath()
        frontier.forEach((r, i) =>
          i ? ctx!.lineTo(x(r.price), y(r.m)) : ctx!.moveTo(x(r.price), y(r.m)),
        )
        ctx!.strokeStyle = BLUE
        ctx!.lineWidth = fpx(1.5, 1.3)
        ctx!.setLineDash([frontierDash, frontierDash])
        ctx!.stroke()
        ctx!.setLineDash([])
      }

      const dotFrontierR = fpx(5.5, 4.5)
      const dotDominatedR = fpx(4, 3.2)
      const dotStrokeW = fpx(1.5, 1.3)
      filtered.forEach((r, i) => {
        if (i === hoverRef.current) return
        ctx!.beginPath()
        ctx!.arc(x(r.price), y(r.m), frontier.includes(r) ? dotFrontierR : dotDominatedR, 0, Math.PI * 2)
        ctx!.fillStyle = frontier.includes(r) ? BLUE : rgba(INK, 0.22)
        ctx!.fill()
        if (frontier.includes(r)) {
          ctx!.strokeStyle = '#fff'
          ctx!.lineWidth = dotStrokeW
          ctx!.stroke()
        }
      })

      if (hoverRef.current >= 0 && filtered[hoverRef.current]) {
        const r = filtered[hoverRef.current]
        ctx!.beginPath()
        ctx!.arc(x(r.price), y(r.m), fpx(7, 5.5), 0, Math.PI * 2)
        ctx!.fillStyle = MAGENTA
        ctx!.fill()
        ctx!.strokeStyle = '#fff'
        ctx!.lineWidth = fpx(2, 1.6)
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
      let bestDist = fpx(20, 16)
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
        const nudge = fpx(16, 13)
        const tooltipWidthEst = fpx(320, 260)
        let tx = mx + nudge
        if (tx + tooltipWidthEst > rect.width) tx = Math.max(fpx(4, 3), mx - tooltipWidthEst - nudge)
        let ty = my - fpx(44, 36)
        if (ty < 0) ty = my + nudge
        setTooltip({ row: r, onFrontier, left: tx, top: ty })
      } else {
        setTooltip(null)
      }
    }

    function onLeave() {
      hoverRef.current = -1
      setTooltip(null)
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
  const chartMinHeight = useFluidPx(fluid(480, 340))
  const controlsGap = useFluidPx(fluid(18, 14))
  const controlsMarginBottom = useFluidPx(fluid(12, 9))
  const canvasMinHeight = useFluidPx(fluid(300, 220))
  const legendGap = useFluidPx(fluid(12, 9))
  const legendMarginTop = useFluidPx(fluid(12, 9))
  const legendPaddingTop = useFluidPx(fluid(12, 9))
  const swatchSize = useFluidPx(fluid(10, 8))
  const dashSwatchWidth = useFluidPx(fluid(18, 14))

  return (
    <View
      style={
        {
          // .vf-chart: width 100%, height 100%, flex column, background white.
          // We add an explicit min-height since RN doesn't read the
          // .vf-chart CSS rule (was: clamp(360px, 68vw, 520px) — pick 480 here).
          width: '100%',
          minHeight: chartMinHeight,
          backgroundColor: '#fff',
          color: INK,
        } as any
      }
    >
      {/* .vf-controls — flex row wrap, gap 14/18, margin-bottom 12 */}
      <View
        style={
          {
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'flex-start',
            gap: controlsGap,
            marginBottom: controlsMarginBottom,
          } as any
        }
      >
        <ChipGroup label="Size" options={SIZE_OPTIONS} value={size} onChange={setSize} renderOpt={(o) => (o === 'all' ? 'All' : o + '"')} />
        <ChipGroup label="Tier" options={TIER_OPTIONS} value={tier} onChange={setTier} renderOpt={(o) => (o === 'all' ? 'All' : o)} />
        <PriceGroup priceLabel={priceLabel} price={price} setPrice={setPrice} />
      </View>

      {/* .vf-canvas-wrap — relative, flex 1, min-height 300 */}
      <View
        ref={plotRef}
        style={
          {
            position: 'relative',
            width: '100%',
            flex: 1,
            minHeight: canvasMinHeight,
          } as any
        }
      >
        {React.createElement('canvas', {
          ref: canvasRef,
          style: { display: 'block', width: '100%', height: '100%', cursor: 'crosshair' },
        })}
        {tooltip ? <Tooltip tooltip={tooltip} /> : null}
      </View>

      {/* .vf-legend — flex wrap, gap 10/12, margin-top 12, padding-top 12, top hairline */}
      <View
        style={
          {
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: legendGap,
            marginTop: legendMarginTop,
            paddingTop: legendPaddingTop,
            borderTopWidth: 1,
            borderTopColor: LINE,
          } as any
        }
      >
        <LegendItem>
          <View style={{ width: swatchSize, height: swatchSize, borderRadius: radius.pill, backgroundColor: BLUE } as any} />
          <Text style={{ fontFamily: FONT_BODY, fontSize: legendSize, color: FG_2 } as any}>On value frontier</Text>
        </LegendItem>
        <LegendItem>
          <View style={{ width: swatchSize, height: swatchSize, borderRadius: radius.pill, backgroundColor: rgba(INK, 0.22) } as any} />
          <Text style={{ fontFamily: FONT_BODY, fontSize: legendSize, color: FG_2 } as any}>Dominated</Text>
        </LegendItem>
        <LegendItem>
          <View style={{ width: dashSwatchWidth, borderTopWidth: 2, borderTopColor: BLUE, borderStyle: 'dashed' } as any} />
          <Text style={{ fontFamily: FONT_BODY, fontSize: legendSize, color: FG_2 } as any}>Efficient frontier</Text>
        </LegendItem>
      </View>
    </View>
  )
}

// ── .vf-group with chip row (Size / Tier) ───────────────────────────────────
function ChipGroup({
  label,
  options,
  value,
  onChange,
  renderOpt,
}: {
  label: string
  options: string[]
  value: string
  onChange: (v: string) => void
  renderOpt: (o: string) => string
}) {
  const fontSize = useFluidPx(type.meta)
  const groupGap = useFluidPx(fluid(7, 6))
  const chipGap = useFluidPx(fluid(5, 4))
  return (
    <View style={{ flexDirection: 'column', alignItems: 'flex-start', gap: groupGap } as any}>
      <Text style={{ ...vfLabelStyle, fontSize } as any}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: chipGap } as any}>
        {options.map((opt) => (
          <VfChip key={opt} on={value === opt} onPress={() => onChange(opt)}>
            {renderOpt(opt)}
          </VfChip>
        ))}
      </View>
    </View>
  )
}

// ── .vf-group.vf-price (label + range slider) ───────────────────────────────
function PriceGroup({
  priceLabel,
  price,
  setPrice,
}: {
  priceLabel: string
  price: number
  setPrice: (n: number) => void
}) {
  const fontSize = useFluidPx(type.meta)
  const groupGap = useFluidPx(fluid(7, 6))
  const marginLeft = useFluidPx(fluid(2, 2))
  const sliderWidth = useFluidValue(170, 130)
  return (
    <View style={{ flexDirection: 'column', alignItems: 'flex-start', gap: groupGap } as any}>
      <Text style={{ ...vfLabelStyle, fontSize } as any}>
        Price <Text style={{ color: INK, textTransform: 'none', marginLeft } as any}>{priceLabel}</Text>
      </Text>
      {/* <input type=range> is the one HTML primitive with no RN-web equivalent. */}
      {React.createElement('input', {
        type: 'range',
        min: 60,
        max: 1900,
        step: 10,
        value: price,
        onChange: (e: any) => setPrice(Number(e.target.value)),
        'aria-label': 'Maximum subwoofer price',
        style: { width: sliderWidth, accentColor: BLUE },
      })}
    </View>
  )
}

// ── .vf-chip ────────────────────────────────────────────────────────────────
function VfChip({
  on,
  onPress,
  children,
}: {
  on: boolean
  onPress: () => void
  children: React.ReactNode
}) {
  const [hovered, setHovered] = useState(false)
  const fontSize = useFluidPx(type.meta)
  const padY = useFluidPx(fluid(4, 3))
  const padX = useFluidPx(fluid(7, 5))
  const hoverProps: any = { onHoverIn: () => setHovered(true), onHoverOut: () => setHovered(false) }
  const bg = on ? mixAccent8 : hovered ? '#fafbfc' : '#fff'
  const border = on ? BLUE : hovered ? '#cfd3d9' : LINE
  const color = on ? BLUE : hovered ? INK : FG_2
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      {...hoverProps}
      style={
        {
          borderWidth: 1,
          borderColor: border,
          borderRadius: 5,
          backgroundColor: bg,
          paddingVertical: padY,
          paddingHorizontal: padX,
        } as any
      }
    >
      <Text style={{ fontFamily: FONT_MONO, fontSize, color, fontWeight: on ? '600' : '400' } as any}>
        {children}
      </Text>
    </Pressable>
  )
}

// ── .vf-label ───────────────────────────────────────────────────────────────
// fontSize applied dynamically at each call site via useFluidPx(type.meta) —
// kept out of this static object since it must resolve per-render.
const vfLabelStyle = {
  fontFamily: FONT_MONO,
  fontWeight: '600' as const,
  color: FG_2,
  textTransform: 'uppercase' as const,
  letterSpacing: 0.88, // .08em * 11
}

// color-mix(in srgb, #0576CC 8%, #fff) ≈ #eef5fb (precomputed)
const mixAccent8 = '#eef5fb'

// ── .vf-tooltip ─────────────────────────────────────────────────────────────
function Tooltip({ tooltip }: { tooltip: TooltipState }) {
  const r = tooltip.row
  const titleSize = useFluidPx(type.small)
  const bodySize = useFluidPx(type.meta)
  const bodyLineHeight = fluidLineHeight(bodySize, 19 / 12)
  const padX = useFluidPx(fluid(13, 10))
  const padY = useFluidPx(fluid(10, 8))
  const titleMarginBottom = useFluidPx(fluid(3, 3))
  return (
    <View
      pointerEvents="none"
      style={
        {
          position: 'absolute',
          left: tooltip.left,
          top: tooltip.top,
          backgroundColor: '#fff',
          borderWidth: 1,
          borderColor: LINE,
          borderRadius: 8,
          paddingHorizontal: padX,
          paddingVertical: padY,
          zIndex: 10,
          // box-shadow: 0 6px 14px rgba(9,8,14,.1)
          boxShadow: '0 6px 14px rgba(9, 8, 14, 0.1)',
        } as any
      }
    >
      <Text style={{ fontFamily: FONT_BODY, fontSize: titleSize, fontWeight: '600', color: INK, marginBottom: titleMarginBottom } as any}>
        {r.name} ({r.sz}")
        {r.tier !== 'untiered' ? ' · ' + r.tier : ''}
      </Text>
      <Text style={{ fontFamily: FONT_BODY, fontSize: bodySize, color: FG_2, lineHeight: bodyLineHeight } as any}>
        Impact <Text style={tipBold}>{r.m.toFixed(2)}</Text> · {money(r.price)} ·{' '}
        {tooltip.onFrontier ? <Text style={tipBold}>on frontier</Text> : 'dominated'}
      </Text>
      <Text style={{ fontFamily: FONT_BODY, fontSize: bodySize, color: FG_2, lineHeight: bodyLineHeight } as any}>
        Box <Text style={tipBold}>{r.vb} ft³</Text> · Xmax <Text style={tipBold}>{r.xm}mm{r.xp ? ' (print)' : ''}</Text>
      </Text>
      <Text style={{ fontFamily: FONT_BODY, fontSize: bodySize, color: FG_2, lineHeight: bodyLineHeight } as any}>
        RMS <Text style={tipBold}>{r.rms}W</Text> · Sens <Text style={tipBold}>{r.sens.toFixed(1)}dB 1W</Text>
      </Text>
    </View>
  )
}

const tipBold = { color: INK, fontWeight: '500' as const }

// ── Legend item ─────────────────────────────────────────────────────────────
function LegendItem({ children }: { children: React.ReactNode }) {
  const gap = useFluidPx(fluid(7, 5))
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap } as any}>{children}</View>
  )
}
