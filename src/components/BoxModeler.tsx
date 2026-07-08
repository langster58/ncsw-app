// BoxModeler — interactive enclosure modeler for the full subwoofer catalog.
//
// Pick any driver, set a ported box volume and tuning, and read the modeled
// SPL response, cone excursion against Xmax, and the headline alignment
// numbers (EBP, sealed Qtc 0.707 box, F3/F10, subsonic filter point, port
// area, max SPL). The physics lives in src/lib/driver-model.ts; this file is
// controls + canvas rendering, built on the same fluid-canvas pattern as
// SubwooferFrontierChart (the two interactive web elements with no RN
// equivalent — <canvas> and <input type=range> — are web escape hatches, and
// native gets an honest placeholder until the native phase).
//
// Driver data is fetched anonymously from the public subwoofers collection —
// nothing here is hardcoded; a T/S correction in Directus re-models on the
// next page load.

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Platform, Text, View } from 'react-native'
import {
  DataList,
  Dropdown,
  colors,
  fluid,
  fluidNumber,
  fonts,
  radius,
  type,
  useFluidPx,
  useFluidValue,
} from '@/ui'
import { getItems } from '@/lib/directus'
import type { Subwoofers } from '@/lib/directus-schema'
import {
  Alignment,
  DerivedDriver,
  DriverTS,
  LITERS_PER_FT3,
  cornerFrequencies,
  deriveDriver,
  ebp,
  logSweep,
  maxSplAt,
  portAreaForVelocity,
  sealedBoxForQtc,
  sensitivity283,
  solveAt,
  subsonicCrossover,
  voltsFor1W,
  voltsForRated,
} from '@/lib/driver-model'

const INK = colors.ink
const GRID = colors.line
const TICK = colors.chartTick
const AXIS = colors.chartAxis
const FG_2 = colors.gray

// Series palette — the value-frontier chart hues, plus magenta for the
// Xmax limit line.
const SERIES = {
  ported: colors.chartBlue,
  sealedSame: colors.chartTeal,
  sealed707: colors.chartGold,
  ib: colors.chartOrange,
  xmax: colors.chartMagenta,
}

// Community-typical ported starting points per driver size: [ft³, Fb].
const BOX_DEFAULTS: Record<string, [number, number]> = {
  '8': [0.5, 35],
  '10': [1.0, 33],
  '12': [1.75, 32],
  '13.5': [2.0, 32],
  '15': [3.0, 31],
  '18': [5.0, 30],
  '21': [7.0, 28],
}

const FETCH_FIELDS = [
  'slug',
  'brand',
  'model',
  'driver_size',
  'fs_hz',
  'qts',
  'qes',
  'vas_l',
  'sd_cm2',
  'xmax_mm',
  'effective_xmax_mm',
  're_ohm',
  'rms_watts',
]

const DEFAULT_SLUG = 'fi-car-audio-hc-12'

type CatalogRow = Pick<
  Subwoofers,
  | 'slug'
  | 'brand'
  | 'model'
  | 'driver_size'
  | 'fs_hz'
  | 'qts'
  | 'qes'
  | 'vas_l'
  | 'sd_cm2'
  | 'xmax_mm'
  | 'effective_xmax_mm'
  | 're_ohm'
  | 'rms_watts'
>

function toDriverTS(r: CatalogRow): DriverTS | null {
  const xmax = r.effective_xmax_mm ?? r.xmax_mm
  if (!r.fs_hz || !r.qts || !r.vas_l || !r.sd_cm2 || !r.re_ohm || !r.rms_watts || !xmax) return null
  return {
    fsHz: r.fs_hz,
    qts: r.qts,
    qes: r.qes ?? r.qts,
    vasL: r.vas_l,
    sdCm2: r.sd_cm2,
    xmaxMm: xmax,
    reOhm: r.re_ohm,
    rmsWatts: r.rms_watts,
  }
}

export function BoxModeler() {
  if (Platform.OS !== 'web') return <NativePlaceholder />
  return <WebModeler />
}

function NativePlaceholder() {
  const fontSize = useFluidPx(type.meta)
  return (
    <View
      style={{
        width: '100%',
        aspectRatio: 16 / 9,
        backgroundColor: colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontFamily: fonts.mono, fontSize, color: AXIS } as any}>
        Enclosure modeler available on web
      </Text>
    </View>
  )
}

type CurvePoint = { f: number; y: number }
type Series = { label: string; color: string; dash: number[] | null; points: CurvePoint[] }

const SPL_FREQS = logSweep(15, 250, 90)
const EX_FREQS = logSweep(15, 100, 70)

function WebModeler() {
  const [rows, setRows] = useState<CatalogRow[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [sizeFilter, setSizeFilter] = useState('all')
  const [slug, setSlug] = useState(DEFAULT_SLUG)
  const [vbFt3, setVbFt3] = useState(1.75)
  const [fbHz, setFbHz] = useState(32)

  useEffect(() => {
    let cancelled = false
    getItems<CatalogRow>('subwoofers', {
      fields: FETCH_FIELDS,
      sort: ['brand', 'model'],
      limit: -1,
    })
      .then((data) => {
        if (cancelled) return
        setRows(data.filter((r) => toDriverTS(r) !== null))
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [])

  const sizes = useMemo(() => {
    const s = [...new Set(rows.map((r) => r.driver_size).filter(Boolean))] as string[]
    return s.sort((a, b) => Number(a) - Number(b))
  }, [rows])

  const filtered = useMemo(
    () => rows.filter((r) => sizeFilter === 'all' || r.driver_size === sizeFilter),
    [rows, sizeFilter],
  )

  const row = useMemo(
    () => filtered.find((r) => r.slug === slug) ?? filtered[0] ?? null,
    [filtered, slug],
  )

  function selectDriver(nextSlug: string, pool: CatalogRow[]) {
    const next = pool.find((r) => r.slug === nextSlug)
    setSlug(nextSlug)
    const def = BOX_DEFAULTS[next?.driver_size ?? ''] ?? [2.0, 32]
    setVbFt3(def[0])
    setFbHz(def[1])
  }

  const model = useMemo(() => {
    const ts = row ? toDriverTS(row) : null
    if (!row || !ts) return null
    const d = deriveDriver(ts)
    const vbL = vbFt3 * LITERS_PER_FT3
    const ported: Alignment & { kind: 'ported' } = { kind: 'ported', vbL, fbHz }
    const sealedSame: Alignment = { kind: 'sealed', vbL }
    const ib: Alignment = { kind: 'ib' }
    const sealed707Box = sealedBoxForQtc(ts)
    const sealed707: Alignment | null = sealed707Box ? { kind: 'sealed', vbL: sealed707Box.vbL } : null

    const eg1 = voltsFor1W(ts)
    const egR = voltsForRated(ts)
    const splSeries = (align: Alignment) => SPL_FREQS.map((f) => ({ f, y: solveAt(d, align, f, eg1).spl }))
    const exSeries = (align: Alignment) =>
      EX_FREQS.map((f) => ({ f, y: solveAt(d, align, f, egR).excursion * Math.SQRT2 * 1000 }))

    const corners = cornerFrequencies(d, ported)
    const ibCorners = cornerFrequencies(d, ib)
    const sub = subsonicCrossover(d, ported)
    const portIn2 = portAreaForVelocity(d, ported) * 1550
    const max315 = maxSplAt(d, ported, 31.5)

    return {
      d,
      ts,
      sealed707Box,
      spl: {
        ported: splSeries(ported),
        sealedSame: splSeries(sealedSame),
        sealed707: sealed707 ? splSeries(sealed707) : null,
        ib: splSeries(ib),
      },
      excursion: {
        ported: exSeries(ported),
        sealedSame: exSeries(sealedSame),
      },
      refSpl1W: ibCorners.refSpl1W,
      portedF3: corners.f3,
      portedF10: corners.f10,
      sub,
      portIn2,
      max315,
    }
  }, [row, vbFt3, fbHz])

  const labelSize = useFluidPx(type.meta)
  const controlsGap = useFluidPx(fluid(18, 14))
  const blockGap = useFluidPx(fluid(28, 20))
  const sliderWidth = useFluidValue(190, 140)
  const loadingSize = useFluidPx(type.small)

  if (loadError) {
    return (
      <StatusBox>
        <Text style={{ fontFamily: fonts.mono, fontSize: loadingSize, color: AXIS } as any}>
          Driver catalog unavailable — {loadError}
        </Text>
      </StatusBox>
    )
  }
  if (!rows.length || !row || !model) {
    return (
      <StatusBox>
        <Text style={{ fontFamily: fonts.mono, fontSize: loadingSize, color: AXIS } as any}>
          Loading driver catalog…
        </Text>
      </StatusBox>
    )
  }

  const { ts, sealed707Box } = model
  const ebpValue = ebp(ts)
  const ebpRead = ebpValue < 50 ? 'sealed-leaning' : ebpValue > 100 ? 'ported-leaning' : 'either alignment'
  const sens1W = model.refSpl1W
  const sens283 = sensitivity283(sens1W, ts.reOhm)

  const splSeries: Series[] = [
    { label: `Ported ${vbFt3.toFixed(2)} ft³ @ ${fbHz.toFixed(1)} Hz`, color: SERIES.ported, dash: null, points: model.spl.ported },
    { label: 'Sealed, same volume', color: SERIES.sealedSame, dash: [6, 4], points: model.spl.sealedSame },
    ...(model.spl.sealed707
      ? [{ label: 'Sealed Qtc 0.707', color: SERIES.sealed707, dash: [2, 3], points: model.spl.sealed707 }]
      : []),
    { label: 'Infinite baffle', color: SERIES.ib, dash: [10, 4], points: model.spl.ib },
  ]
  const exSeries: Series[] = [
    { label: 'Ported', color: SERIES.ported, dash: null, points: model.excursion.ported },
    { label: 'Sealed, same volume', color: SERIES.sealedSame, dash: [6, 4], points: model.excursion.sealedSame },
  ]

  return (
    <View style={{ width: '100%' } as any}>
      {/* Controls */}
      <View
        style={
          {
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'flex-end',
            gap: controlsGap,
            marginBottom: blockGap,
          } as any
        }
      >
        <View style={{ minWidth: 120 } as any}>
          <Dropdown
            label="Size"
            value={sizeFilter}
            options={[{ label: 'All sizes', value: 'all' }, ...sizes.map((s) => ({ label: `${s}″`, value: s }))]}
            onChange={(v) => {
              setSizeFilter(v)
              const pool = rows.filter((r) => v === 'all' || r.driver_size === v)
              if (pool.length && !pool.some((r) => r.slug === slug)) selectDriver(pool[0].slug, pool)
            }}
          />
        </View>
        <View style={{ minWidth: 320, flexShrink: 1 } as any}>
          <Dropdown
            label="Driver"
            value={row.slug}
            options={filtered.map((r) => ({ label: `${r.brand} ${r.model}`, value: r.slug }))}
            onChange={(v) => selectDriver(v, filtered)}
          />
        </View>
        <SliderGroup
          label="Ported box"
          valueLabel={`${vbFt3.toFixed(2)} ft³`}
          min={0.15}
          max={12}
          step={0.05}
          value={vbFt3}
          onChange={setVbFt3}
          width={sliderWidth}
          ariaLabel="Ported box net volume, cubic feet"
        />
        <SliderGroup
          label="Tuning"
          valueLabel={`${fbHz.toFixed(1)} Hz`}
          min={18}
          max={50}
          step={0.5}
          value={fbHz}
          onChange={setFbHz}
          width={sliderWidth}
          ariaLabel="Ported box tuning frequency, hertz"
        />
      </View>

      {/* Headline numbers */}
      <View style={{ marginBottom: blockGap } as any}>
        <DataList
          rows={[
            { label: 'Sensitivity', value: `${sens1W.toFixed(1)} dB 1W/1m · ${sens283.toFixed(1)} dB 2.83V` },
            { label: 'EBP (Fs/Qes)', value: `${Math.round(ebpValue)} — ${ebpRead}` },
            {
              label: 'Sealed for Qtc 0.707',
              value: sealed707Box
                ? `${(sealed707Box.vbL / LITERS_PER_FT3).toFixed(2)} ft³ · F3 ${Math.round(sealed707Box.fcHz)} Hz`
                : `n/a — Qts ${ts.qts.toFixed(2)} is already above 0.71`,
            },
            {
              label: 'Ported F3 / F10',
              value: `${Number.isNaN(model.portedF3) ? '—' : model.portedF3.toFixed(1)} Hz / ${Number.isNaN(model.portedF10) ? '—' : model.portedF10.toFixed(1)} Hz`,
            },
            {
              label: 'Subsonic filter',
              value: Number.isNaN(model.sub)
                ? 'Not needed — stays inside Xmax to 10 Hz at rated power'
                : `~${Math.ceil(model.sub)} Hz — exceeds Xmax below this at rated power`,
            },
            { label: 'Port area for <17 m/s', value: `${Math.round(model.portIn2)} in² at ${ts.rmsWatts.toLocaleString('en-US')} W` },
            {
              label: 'Max SPL @ 31.5 Hz',
              value: `${model.max315.spl.toFixed(1)} dB (${model.max315.displacementLimited ? 'excursion' : 'power'}-limited)`,
              accent: true,
            },
          ]}
        />
      </View>

      {/* SPL response */}
      <ChartBlock
        series={splSeries}
        xMax={250}
        yTickStep={10}
        yPad={[4, 4]}
        yUnit="dB"
        yAxisLabel="SPL — DB, 1W/1M"
        caption="Anechoic half-space SPL, 1 W / 1 m — cabin gain not included"
      />

      <View style={{ height: blockGap } as any} />

      {/* Excursion */}
      <ChartBlock
        series={exSeries}
        xMax={100}
        yTickStep={10}
        yPad={[0, 4]}
        yUnit="mm"
        yAxisLabel="EXCURSION — MM PEAK"
        yFloor={0}
        yCeil={ts.xmaxMm * 2.2}
        refLine={{ y: ts.xmaxMm, color: SERIES.xmax, label: `Xmax ${ts.xmaxMm} mm` }}
        caption={`Peak cone excursion at rated ${ts.rmsWatts.toLocaleString('en-US')} W sine input`}
      />

      <Text
        style={
          {
            fontFamily: fonts.mono,
            fontSize: labelSize,
            color: colors.inkFaint,
            marginTop: blockGap,
          } as any
        }
      >
        Lumped-element Thiele/Small model computed live from catalog parameters. Box leakage QL = 7; port and
        voice-coil inductance losses not modeled.
      </Text>
    </View>
  )
}

function StatusBox({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        width: '100%',
        minHeight: 220,
        backgroundColor: colors.figBg,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: radius.sm,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      {children}
    </View>
  )
}

// Label + native range input — the same web escape hatch the frontier chart
// uses (input[type=range] has no RN-web equivalent).
function SliderGroup({
  label,
  valueLabel,
  min,
  max,
  step,
  value,
  onChange,
  width,
  ariaLabel,
}: {
  label: string
  valueLabel: string
  min: number
  max: number
  step: number
  value: number
  onChange: (n: number) => void
  width: number
  ariaLabel: string
}) {
  const fontSize = useFluidPx(type.meta)
  const groupGap = useFluidPx(fluid(7, 6))
  return (
    <View style={{ flexDirection: 'column', alignItems: 'flex-start', gap: groupGap } as any}>
      <Text
        style={
          {
            fontFamily: fonts.mono,
            fontWeight: '600',
            fontSize,
            color: FG_2,
            textTransform: 'uppercase',
            letterSpacing: 0.88,
          } as any
        }
      >
        {label} <Text style={{ color: INK, textTransform: 'none' } as any}>{valueLabel}</Text>
      </Text>
      {React.createElement('input', {
        type: 'range',
        min,
        max,
        step,
        value,
        onChange: (e: any) => onChange(Number(e.target.value)),
        'aria-label': ariaLabel,
        style: { width, accentColor: colors.accent },
      })}
    </View>
  )
}

// ── Curve chart (canvas) ────────────────────────────────────────────────────
// Log-frequency line chart with hairline grid, mono tick labels, hover
// crosshair with per-series readout, and a legend row. Same imperative
// fluid-canvas approach as SubwooferFrontierChart.

type RefLine = { y: number; color: string; label: string }

type TooltipState = { f: number; values: { label: string; color: string; y: number }[]; left: number; top: number }

function ChartBlock({
  series,
  xMax,
  yTickStep,
  yPad,
  yUnit,
  yAxisLabel,
  yFloor,
  yCeil,
  refLine,
  caption,
}: {
  series: Series[]
  xMax: number
  yTickStep: number
  yPad: [number, number]
  yUnit: string
  yAxisLabel: string
  yFloor?: number
  yCeil?: number
  refLine?: RefLine
  caption: string
}) {
  const plotRef = useRef<any>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const hoverFreqRef = useRef<number | null>(null)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  const legendSize = useFluidPx(type.meta)
  const legendGap = useFluidPx(fluid(12, 9))
  const legendMarginTop = useFluidPx(fluid(12, 9))
  const swatchWidth = useFluidPx(fluid(18, 14))
  const chartHeight = useFluidPx(fluid(360, 240))
  const captionSize = useFluidPx(type.meta)

  useEffect(() => {
    const canvas = canvasRef.current
    const plot = plotRef.current
    if (!canvas || !plot) return undefined
    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined
    const dpr = window.devicePixelRatio || 1
    let raf = 0

    function fpx(anchor: number, floor: number) {
      return fluidNumber(anchor, floor, window.innerWidth)
    }

    const X_MIN = 15
    const allY = series.flatMap((s) => s.points.map((p) => p.y)).concat(refLine ? [refLine.y] : [])
    const yMin = yFloor ?? Math.floor((Math.min(...allY) - yPad[0]) / yTickStep) * yTickStep
    const yMaxRaw = yCeil ?? Math.max(...allY) + yPad[1]
    const yMax = yCeil ?? Math.ceil(yMaxRaw / yTickStep) * yTickStep

    function layout() {
      const pad = { top: fpx(16, 12), right: fpx(16, 13), bottom: fpx(48, 38), left: fpx(56, 44) }
      const rect = plot.getBoundingClientRect()
      const width = Math.max(50, Math.round(rect.width))
      const height = Math.max(50, Math.round(rect.height))
      canvas!.width = width * dpr
      canvas!.height = height * dpr
      canvas!.style.width = width + 'px'
      canvas!.style.height = height + 'px'
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
      return { width, height, pad, pW: width - pad.left - pad.right, pH: height - pad.top - pad.bottom }
    }

    function draw() {
      const box = layout()
      const { pad } = box
      const x = (f: number) => pad.left + (Math.log10(f / X_MIN) / Math.log10(xMax / X_MIN)) * box.pW
      const y = (v: number) => pad.top + box.pH - ((v - yMin) / (yMax - yMin)) * box.pH
      const tickFont = `${fpx(11, 10)}px 'IBM Plex Mono', monospace`
      ctx!.clearRect(0, 0, box.width, box.height)

      // grid + ticks
      ctx!.font = tickFont
      ctx!.lineWidth = 1
      const xTicks = [20, 30, 40, 60, 100, 150, 250].filter((t) => t <= xMax)
      for (const t of [15, ...xTicks]) {
        const px = x(t)
        ctx!.strokeStyle = GRID
        ctx!.beginPath()
        ctx!.moveTo(px, pad.top)
        ctx!.lineTo(px, pad.top + box.pH)
        ctx!.stroke()
        ctx!.fillStyle = TICK
        ctx!.textAlign = 'center'
        ctx!.fillText(String(t), px, pad.top + box.pH + fpx(18, 14))
      }
      for (let v = yMin; v <= yMax + 0.001; v += yTickStep) {
        const py = y(v)
        ctx!.strokeStyle = GRID
        ctx!.beginPath()
        ctx!.moveTo(pad.left, py)
        ctx!.lineTo(pad.left + box.pW, py)
        ctx!.stroke()
        ctx!.fillStyle = TICK
        ctx!.textAlign = 'right'
        ctx!.fillText(String(Math.round(v)), pad.left - fpx(8, 6), py + fpx(4, 3))
      }

      // axis labels
      ctx!.fillStyle = AXIS
      ctx!.textAlign = 'center'
      ctx!.fillText('FREQUENCY — HZ', pad.left + box.pW / 2, box.height - fpx(8, 6))
      ctx!.save()
      ctx!.translate(fpx(13, 10), pad.top + box.pH / 2)
      ctx!.rotate(-Math.PI / 2)
      ctx!.fillText(yAxisLabel, 0, 0)
      ctx!.restore()

      // reference line (Xmax)
      if (refLine) {
        ctx!.strokeStyle = refLine.color
        ctx!.lineWidth = fpx(1.5, 1.2)
        ctx!.setLineDash([fpx(4, 3), fpx(4, 3)])
        ctx!.beginPath()
        ctx!.moveTo(pad.left, y(refLine.y))
        ctx!.lineTo(pad.left + box.pW, y(refLine.y))
        ctx!.stroke()
        ctx!.setLineDash([])
      }

      // curves
      for (const s of series) {
        ctx!.strokeStyle = s.color
        ctx!.lineWidth = fpx(2, 1.6)
        ctx!.setLineDash(s.dash ? s.dash.map((v) => fpx(v, v * 0.8)) : [])
        ctx!.lineJoin = 'round'
        ctx!.beginPath()
        let started = false
        for (const p of s.points) {
          const py = y(Math.min(Math.max(p.y, yMin), yMax))
          if (!started) {
            ctx!.moveTo(x(p.f), py)
            started = true
          } else {
            ctx!.lineTo(x(p.f), py)
          }
        }
        ctx!.stroke()
        ctx!.setLineDash([])
      }

      // hover crosshair
      const hf = hoverFreqRef.current
      if (hf !== null && hf >= X_MIN && hf <= xMax) {
        const px = x(hf)
        ctx!.strokeStyle = colors.chartGridStrong
        ctx!.lineWidth = 1
        ctx!.beginPath()
        ctx!.moveTo(px, pad.top)
        ctx!.lineTo(px, pad.top + box.pH)
        ctx!.stroke()
        for (const s of series) {
          const v = sampleAt(s.points, hf)
          if (v === null || v < yMin || v > yMax) continue
          ctx!.beginPath()
          ctx!.arc(px, y(v), fpx(4, 3.2), 0, Math.PI * 2)
          ctx!.fillStyle = s.color
          ctx!.fill()
          ctx!.strokeStyle = colors.white
          ctx!.lineWidth = fpx(1.5, 1.2)
          ctx!.stroke()
        }
      }
    }

    function scheduleDraw() {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(draw)
    }

    function freqFromPx(mx: number, box: { pad: any; pW: number }) {
      const t = (mx - box.pad.left) / box.pW
      return X_MIN * Math.pow(xMax / X_MIN, t)
    }

    function onMove(e: MouseEvent) {
      const rect = canvas!.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const pad = { left: fpx(56, 44), right: fpx(16, 13) }
      const pW = rect.width - pad.left - pad.right
      if (mx < pad.left || mx > pad.left + pW) {
        onLeave()
        return
      }
      const f = freqFromPx(mx, { pad, pW })
      hoverFreqRef.current = f
      scheduleDraw()
      const values = series
        .map((s) => ({ label: s.label, color: s.color, y: sampleAt(s.points, f) }))
        .filter((v): v is { label: string; color: string; y: number } => v.y !== null)
      const nudge = fpx(16, 13)
      const estWidth = fpx(260, 210)
      let tx = mx + nudge
      if (tx + estWidth > rect.width) tx = Math.max(fpx(4, 3), mx - estWidth - nudge)
      setTooltip({ f, values, left: tx, top: Math.max(4, my - fpx(30, 24)) })
    }

    function onLeave() {
      hoverFreqRef.current = null
      setTooltip(null)
      scheduleDraw()
    }

    const ro = (window as any).ResizeObserver ? new ResizeObserver(scheduleDraw) : null
    if (ro) ro.observe(plot)
    window.addEventListener('resize', scheduleDraw)
    canvas.addEventListener('mousemove', onMove)
    canvas.addEventListener('mouseleave', onLeave)
    if ((document as any).fonts && (document as any).fonts.ready) (document as any).fonts.ready.then(scheduleDraw)
    scheduleDraw()
    return () => {
      cancelAnimationFrame(raf)
      if (ro) ro.disconnect()
      window.removeEventListener('resize', scheduleDraw)
      canvas.removeEventListener('mousemove', onMove)
      canvas.removeEventListener('mouseleave', onLeave)
    }
  }, [series, xMax, yTickStep, yPad, yFloor, yCeil, refLine, yAxisLabel])

  return (
    <View style={{ width: '100%' } as any}>
      <View ref={plotRef} style={{ position: 'relative', width: '100%', height: chartHeight } as any}>
        {React.createElement('canvas', {
          ref: canvasRef,
          style: { position: 'absolute', top: 0, left: 0, cursor: 'crosshair' },
        })}
        {tooltip ? <CurveTooltip tooltip={tooltip} yUnit={yUnit} /> : null}
      </View>
      <Text style={{ fontFamily: fonts.mono, fontSize: captionSize, color: colors.inkFaint, marginTop: 6 } as any}>
        {caption}
      </Text>
      <View
        style={
          {
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: legendGap,
            marginTop: legendMarginTop,
          } as any
        }
      >
        {series.map((s) => (
          <View key={s.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 7 } as any}>
            <View
              style={
                {
                  width: swatchWidth,
                  borderTopWidth: 2,
                  borderTopColor: s.color,
                  borderStyle: s.dash ? (s.dash[0] <= 2 ? 'dotted' : 'dashed') : 'solid',
                } as any
              }
            />
            <Text style={{ fontFamily: fonts.body, fontSize: legendSize, color: FG_2 } as any}>{s.label}</Text>
          </View>
        ))}
        {refLine ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 } as any}>
            <View style={{ width: swatchWidth, borderTopWidth: 2, borderTopColor: refLine.color, borderStyle: 'dashed' } as any} />
            <Text style={{ fontFamily: fonts.body, fontSize: legendSize, color: FG_2 } as any}>{refLine.label}</Text>
          </View>
        ) : null}
      </View>
    </View>
  )
}

// Linear interpolation on a log-spaced curve.
function sampleAt(points: CurvePoint[], f: number): number | null {
  if (!points.length || f < points[0].f || f > points[points.length - 1].f) return null
  let lo = 0
  let hi = points.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (points[mid].f <= f) lo = mid
    else hi = mid
  }
  const a = points[lo]
  const b = points[hi]
  const t = b.f === a.f ? 0 : (f - a.f) / (b.f - a.f)
  return a.y + (b.y - a.y) * t
}

function CurveTooltip({ tooltip, yUnit }: { tooltip: TooltipState; yUnit: string }) {
  const titleSize = useFluidPx(type.small)
  const bodySize = useFluidPx(type.meta)
  return (
    <View
      pointerEvents="none"
      style={
        {
          position: 'absolute',
          left: tooltip.left,
          top: tooltip.top,
          backgroundColor: colors.white,
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: 8,
          paddingHorizontal: 13,
          paddingVertical: 10,
          zIndex: 10,
          boxShadow: '0 6px 14px rgba(9, 8, 14, 0.1)',
        } as any
      }
    >
      <Text style={{ fontFamily: fonts.mono, fontSize: titleSize, fontWeight: '600', color: INK, marginBottom: 4 } as any}>
        {tooltip.f.toFixed(1)} Hz
      </Text>
      {tooltip.values.map((v) => (
        <View key={v.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 } as any}>
          <View style={{ width: 8, height: 8, borderRadius: radius.pill, backgroundColor: v.color } as any} />
          <Text style={{ fontFamily: fonts.body, fontSize: bodySize, color: FG_2 } as any}>
            {v.label}: <Text style={{ color: INK, fontWeight: '500' } as any}>{v.y.toFixed(1)} {yUnit}</Text>
          </Text>
        </View>
      ))}
    </View>
  )
}
