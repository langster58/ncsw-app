import React from 'react'
import { Platform, Text, View, useWindowDimensions } from 'react-native'

// SubwooferFrontierChart — ported from SubwooferFrontierChart.jsx (canvas value-frontier scatter).
//
// SIMPLIFICATIONS (faithful-but-simplified per task brief):
//   * The original draws on an HTML <canvas> with full interactivity (hover tooltips,
//     Size/Tier/Price filter chips + range slider, requestAnimationFrame redraws).
//     Interactivity is DEFERRED — no chips, no slider, no tooltips, no animation.
//   * The real dataset comes from `window.NCSW_SUBWOOFER_FRONTIER` (a CMS/data feed).
//     We do NOT hardcode the full dataset. Below are ~10 REPRESENTATIVE sample points
//     so the frame reads correctly; swap for live data when wired up. FLAGGED as sample.
//   * Web renders inline raw SVG (react-native-svg is not installed) via
//     React.createElement('svg'/'circle'/'path'/'line'/'text', ...).
//   * Native renders a placeholder View (aspectRatio ~16/9) + the title Text.
//
// Resolved colors carried verbatim from the source JSX constants / tokens:
const INK = '#09080E' // ink
const BLUE = '#0576CC' // accent / data — on frontier
const GRID = '#ECECEC' // axis / grid lines
const TICK = '#8A8A8E' // numeric tick labels
const AXIS = '#6B6B70' // axis title labels
const DOMINATED = 'rgba(9,8,14,0.22)' // dominated points = rgba(INK,0.22)
const MONO = "'IBM Plex Mono', monospace"

// Exact axis + legend text from source (lines 125, 129, 267-269):
const X_AXIS_LABEL = 'PRICE'
const Y_AXIS_LABEL = 'IMPACT - HC-12 = 1.00'
const LEGEND = [
  { kind: 'blue', text: 'On value frontier' },
  { kind: 'gray', text: 'Dominated' },
  { kind: 'dash', text: 'Efficient frontier' },
] as const

// ~10 REPRESENTATIVE sample points (NOT the real CMS dataset — flagged above).
// price in USD, m = impact multiple (HC-12 = 1.00). `front` marks pareto-frontier members.
type Pt = { price: number; m: number; front: boolean }
const SAMPLE: Pt[] = [
  { price: 90, m: 0.18, front: true },
  { price: 160, m: 0.32, front: true },
  { price: 240, m: 0.5, front: true },
  { price: 360, m: 0.78, front: true },
  { price: 520, m: 1.0, front: true },
  { price: 760, m: 1.55, front: true },
  { price: 1180, m: 2.6, front: true },
  { price: 1640, m: 4.0, front: true },
  { price: 300, m: 0.34, front: false },
  { price: 640, m: 0.62, front: false },
  { price: 980, m: 1.1, front: false },
  { price: 1380, m: 1.9, front: false },
]

// Plot geometry (mirrors source pad object on lines 52, fixed viewBox for SVG).
const VB_W = 720
const VB_H = 405 // ~16:9
const PAD = { top: 20, right: 16, bottom: 48, left: 52 }
const P_W = VB_W - PAD.left - PAD.right
const P_H = VB_H - PAD.top - PAD.bottom

const PRICE_TICKS = [0, 400, 800, 1200, 1600] // representative x grid
const IMPACT_TICKS = [0.1, 0.2, 0.5, 1, 2, 4] // representative log y grid (source line 110)

// Domain bounds derived from sample (source compute() pads price/impact).
const P_MIN = 0
const P_MAX = 1800
const M_MIN = Math.log10(0.1) - 0.1
const M_MAX = Math.log10(4) + 0.1

function xScale(p: number): number {
  return PAD.left + ((p - P_MIN) / (P_MAX - P_MIN)) * P_W
}
function yScale(v: number): number {
  return PAD.top + P_H - ((Math.log10(v) - M_MIN) / (M_MAX - M_MIN)) * P_H
}

// h() — thin wrapper around createElement so web-only SVG attrs are cast `as any`
// (react-native has no typings for raw 'svg'/'circle'/etc.).
function h(tag: string, props: Record<string, unknown>, ...children: unknown[]) {
  return React.createElement(tag as any, props as any, ...(children as any[]))
}

function WebChart() {
  const gridLines: unknown[] = []

  // Vertical price grid + $ tick labels (mono).
  PRICE_TICKS.forEach((p, i) => {
    const px = xScale(p)
    gridLines.push(
      h('line', {
        key: `vx${i}`,
        x1: px,
        y1: PAD.top,
        x2: px,
        y2: PAD.top + P_H,
        stroke: GRID,
        strokeWidth: 1,
      }),
    )
    gridLines.push(
      h(
        'text',
        {
          key: `vt${i}`,
          x: px,
          y: PAD.top + P_H + 18,
          fill: TICK,
          fontSize: 11,
          fontFamily: MONO,
          textAnchor: 'middle',
        },
        `$${p}`,
      ),
    )
  })

  // Horizontal impact grid (log) + tick labels (mono). m===1 gets a darker line.
  IMPACT_TICKS.forEach((t, i) => {
    const py = yScale(t)
    gridLines.push(
      h('line', {
        key: `hy${i}`,
        x1: PAD.left,
        y1: py,
        x2: PAD.left + P_W,
        y2: py,
        stroke: t === 1 ? '#D8D8DC' : GRID,
        strokeWidth: 1,
      }),
    )
    gridLines.push(
      h(
        'text',
        {
          key: `ht${i}`,
          x: PAD.left - 8,
          y: py + 4,
          fill: TICK,
          fontSize: 11,
          fontFamily: MONO,
          textAnchor: 'end',
        },
        t === 1 ? '1.00' : String(t),
      ),
    )
  })

  // Dashed efficient-frontier polyline (source lines 132-140), accent blue.
  const frontierPts = SAMPLE.filter((p) => p.front).sort((a, b) => a.price - b.price)
  const frontierPath = frontierPts
    .map((p, i) => `${i ? 'L' : 'M'}${xScale(p.price).toFixed(1)} ${yScale(p.m).toFixed(1)}`)
    .join(' ')

  // Plotted points: dominated first (gray), frontier on top (blue w/ white ring).
  const dots: unknown[] = []
  SAMPLE.forEach((p, i) => {
    const cx = xScale(p.price)
    const cy = yScale(p.m)
    dots.push(
      h('circle', {
        key: `c${i}`,
        cx,
        cy,
        r: p.front ? 5.5 : 4,
        fill: p.front ? BLUE : DOMINATED,
        stroke: p.front ? '#ffffff' : 'none',
        strokeWidth: p.front ? 1.5 : 0,
      }),
    )
  })

  return h(
    'svg',
    {
      viewBox: `0 0 ${VB_W} ${VB_H}`,
      width: '100%',
      height: 'auto',
      role: 'img',
      'aria-label': 'Subwoofer value frontier chart',
      style: { display: 'block', maxWidth: '100%' },
    },
    ...gridLines,
    h('path', {
      key: 'frontier',
      d: frontierPath,
      fill: 'none',
      stroke: BLUE,
      strokeWidth: 1.5,
      strokeDasharray: '4 4',
    }),
    ...dots,
    // X axis title (centered, mono).
    h(
      'text',
      {
        key: 'xlabel',
        x: PAD.left + P_W / 2,
        y: VB_H - 8,
        fill: AXIS,
        fontSize: 11,
        fontFamily: MONO,
        textAnchor: 'middle',
      },
      X_AXIS_LABEL,
    ),
    // Y axis title (rotated -90deg, mono).
    h(
      'text',
      {
        key: 'ylabel',
        x: 13,
        y: PAD.top + P_H / 2,
        fill: AXIS,
        fontSize: 11,
        fontFamily: MONO,
        textAnchor: 'middle',
        transform: `rotate(-90 13 ${PAD.top + P_H / 2})`,
      },
      Y_AXIS_LABEL,
    ),
  )
}

export function SubwooferFrontierChart() {
  useWindowDimensions() // re-render on resize; SVG itself is fluid (width 100%).

  if (Platform.OS !== 'web') {
    // Native chart DEFERRED — placeholder tile + title only.
    return (
      <View>
        <Text
          style={{
            fontFamily: 'IBM Plex Mono',
            fontSize: 11,
            letterSpacing: 0.6,
            color: AXIS,
            marginBottom: 8,
          }}
        >
          SUBWOOFER VALUE FRONTIER
        </Text>
        <View
          style={{
            width: '100%',
            aspectRatio: 16 / 9,
            backgroundColor: '#f5f5f5',
            borderRadius: 6,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontFamily: 'Inter', fontSize: 14, color: TICK }}>
            Interactive chart available on web
          </Text>
        </View>
      </View>
    )
  }

  return (
    <View style={{ width: '100%' }}>
      <WebChart />
      {/* Legend — exact text from source lines 267-269. */}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 14 as any,
          marginTop: 8,
        }}
      >
        {LEGEND.map((item) => (
          <View
            key={item.text}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6 as any }}
          >
            {item.kind === 'dash' ? (
              <View style={{ width: 14, height: 0, borderTopWidth: 1.5, borderTopColor: BLUE, borderStyle: 'dashed' }} />
            ) : (
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: item.kind === 'blue' ? BLUE : DOMINATED,
                }}
              />
            )}
            <Text
              style={{
                fontFamily: 'Inter',
                fontSize: 11,
                color: INK,
                textTransform: 'uppercase' as const,
                letterSpacing: 0.6,
              }}
            >
              {item.text}
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}
