// BoxModeler — interactive enclosure modeler for the full subwoofer catalog.
//
// Pick any driver — or type in custom Thiele/Small parameters — set how many
// of it share the box (each driver models a 1/N slice of the volume, port
// area, and power; N coherent cones add 20·log10(N) dB), choose an
// alignment (ported, sealed, infinite baffle), set the box, and read the
// modeled curves: SPL response, max SPL, cone excursion against Xmax, group
// delay, and port air velocity, plus the headline alignment numbers (EBP,
// Qtc/Fc, F3/F10, subsonic filter point, port length and area, max SPL).
// Every value is also typeable exactly through the full-page input modal.
// The physics lives in src/lib/driver-model.ts; this file is controls +
// canvas rendering, built on the same fluid-canvas pattern as
// SubwooferFrontierChart (the two interactive web elements with no RN
// equivalent — <canvas> and <input type=range> — are web escape hatches, and
// native gets an honest placeholder until the native phase).
//
// Driver data is fetched anonymously from the public subwoofers collection —
// nothing here is hardcoded; a T/S correction in Directus re-models on the
// next page load.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Platform, Text, View } from 'react-native'
import {
  Button,
  CONTROL_BAND,
  ControlColumn,
  DataList,
  Dropdown,
  FilterChipGroup,
  Modal,
  NumberField,
  TextField,
  ValueSlider,
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
  DriverTS,
  LITERS_PER_FT3,
  cornerFrequencies,
  deriveDriver,
  ebp,
  groupDelaySeries,
  logSweep,
  maxSplAt,
  portLengthM,
  portResonanceHz,
  portVelocitySeries,
  sealedAlignment,
  sealedBoxForQtc,
  sensitivity283,
  solveAt,
  subsonicCrossover,
  voltsForWatts,
} from '@/lib/driver-model'
import { downloadModelReport, type ReportChart } from '@/lib/model-report-pdf'
import { PORTED_KNEE_DB, designPortCount, portedDesign, sealedDesign } from '@/lib/box-design'

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
      <Text style={{ fontFamily: fonts.body, fontSize, color: AXIS } as any}>
        Enclosure modeler available on web
      </Text>
    </View>
  )
}

type CurvePoint = { f: number; y: number }
type Series = { label: string; color: string; dash: number[] | null; points: CurvePoint[] }

const SPL_FREQS = logSweep(15, 250, 90)
const LOW_FREQS = logSweep(15, 100, 70)

const INCH_M = 0.0254

type Mode = 'ported' | 'sealed' | 'ib'
const MODE_LABEL: Record<Mode, string> = { ported: 'Ported', sealed: 'Sealed', ib: 'Infinite baffle' }

const DRIVER_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8]

// Everything the controls can set: driver T/S, both boxes, port design, and
// drive power. Sliders, the port designer, and the specs modal all write
// into the same object, so typed and dragged values never fight.
type ModelInputs = DriverTS & {
  driverCount: number // identical drivers sharing the box, power split evenly
  vbFt3: number
  fbHz: number
  sealedVbFt3: number
  portCount: number
  portDiaIn: number // preference; effective size never drops below the clean-flow minimum
  driveW: number
  portShape: 'round' | 'slot'
  slotHeightIn: number
}

// Fixed port-flow ceilings — never a user control. Flared aero tubes stay
// clean to 25 m/s (founder standard 2026-07-19, the same limit the design
// bench uses); straight slots chuff past 17 m/s (5% Mach). Road-noise
// masking gives out around 30 m/s for anything.
const VEL_LIMIT: Record<'round' | 'slot', number> = { round: 25, slot: 17 }

function velocityTier(v: number, shape: 'round' | 'slot') {
  if (!Number.isFinite(v)) return { label: '—', color: colors.chartAxis }
  if (v < VEL_LIMIT[shape]) return { label: shape === 'round' ? 'clean (flared)' : 'silent', color: colors.chartTeal }
  if (v <= 30) return { label: 'masked while driving', color: colors.chartGold }
  return { label: 'audible while driving', color: colors.chartOrange }
}

// Round ports are bought, not built — standard aero/PVC diameters only.
const PORT_SIZES = [2, 3, 4, 6, 8]
const PORT_COUNTS = [1, 2, 3, 4, 5, 6]

function tsOf(i: ModelInputs): DriverTS {
  const { fsHz, qts, qes, vasL, sdCm2, xmaxMm, reOhm, rmsWatts } = i
  return { fsHz, qts, qes, vasL, sdCm2, xmaxMm, reOhm, rmsWatts }
}

function tsEquals(a: DriverTS, b: DriverTS): boolean {
  return (
    a.fsHz === b.fsHz &&
    a.qts === b.qts &&
    a.qes === b.qes &&
    a.vasL === b.vasL &&
    a.sdCm2 === b.sdCm2 &&
    a.xmaxMm === b.xmaxMm &&
    a.reOhm === b.reOhm &&
    a.rmsWatts === b.rmsWatts
  )
}

function portAreaM2(i: { portDiaIn: number; portCount: number }): number {
  const r = (i.portDiaIn * INCH_M) / 2
  return i.portCount * Math.PI * r * r
}

function defaultInputsFor(row: CatalogRow): ModelInputs {
  const ts = toDriverTS(row)!
  const def = BOX_DEFAULTS[row.driver_size ?? ''] ?? [2.0, 32]
  const s707 = sealedBoxForQtc(ts)
  const sealedVbFt3 = Math.min(8, Math.max(0.1, (s707?.vbL ?? def[0] * 0.5 * LITERS_PER_FT3) / LITERS_PER_FT3))
  return {
    ...ts,
    driverCount: 1,
    vbFt3: def[0],
    fbHz: def[1],
    sealedVbFt3: Number(sealedVbFt3.toFixed(2)),
    portCount: 1,
    portDiaIn: 4,
    driveW: ts.rmsWatts,
    portShape: 'round',
    slotHeightIn: 2,
  }
}

function WebModeler() {
  const [rows, setRows] = useState<CatalogRow[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [slug, setSlug] = useState(DEFAULT_SLUG)
  const [mode, setMode] = useState<Mode>('ported')
  const [inputs, setInputs] = useState<ModelInputs | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [custom, setCustom] = useState(false)
  const [customName, setCustomName] = useState('Custom driver')
  const [pdfBusy, setPdfBusy] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)

  // Live chart canvases, registered by ChartBlock, consumed by PDF export.
  const chartCanvases = useRef<Record<string, HTMLCanvasElement | null>>({})
  const registerCanvas = useCallback((id: string, c: HTMLCanvasElement | null) => {
    chartCanvases.current[id] = c
  }, [])

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

  const row = useMemo(() => rows.find((r) => r.slug === slug) ?? rows[0] ?? null, [rows, slug])

  // Catalog grouped into families: model names carry no size (a driver always
  // has a size; it lives in driver_size), so brand+model is the family and
  // the sizes within it feed the Size dropdown. Exact-duplicate rows (same
  // family and size) collapse to the first.
  const families = useMemo(() => {
    const map = new Map<string, CatalogRow[]>()
    for (const r of rows) {
      const key = `${r.brand} ${r.model}`
      const list = map.get(key)
      if (!list) map.set(key, [r])
      else if (!list.some((x) => x.driver_size === r.driver_size)) list.push(r)
    }
    for (const list of map.values()) list.sort((a, b) => Number(a.driver_size) - Number(b.driver_size))
    return map
  }, [rows])
  const familyKey = row ? `${row.brand} ${row.model}` : ''
  const familyRows = families.get(familyKey) ?? []

  // Seed the input set once the catalog resolves the first driver.
  useEffect(() => {
    if (row && !inputs) setInputs(defaultInputsFor(row))
  }, [row, inputs])

  // Driver switches re-seed the box defaults, scaled to the current driver
  // count so the per-driver alignment carries over.
  function selectDriver(nextSlug: string) {
    const next = rows.find((r) => r.slug === nextSlug)
    setSlug(nextSlug)
    setCustom(false)
    if (next)
      setInputs((prev) => {
        const base = defaultInputsFor(next)
        const n = prev?.driverCount ?? 1
        return {
          ...base,
          driverCount: n,
          vbFt3: Number((base.vbFt3 * n).toFixed(2)),
          sealedVbFt3: Number((base.sealedVbFt3 * n).toFixed(2)),
          driveW: base.driveW * n,
        }
      })
  }

  const patch = (p: Partial<ModelInputs>) => setInputs((prev) => (prev ? { ...prev, ...p } : prev))

  // Changing the count scales box volumes and drive power with it, so the
  // per-driver alignment — and every curve shape — holds while output scales.
  const setDriverCount = (n: number) =>
    setInputs((prev) => {
      if (!prev || n === prev.driverCount) return prev
      const r = n / prev.driverCount
      return {
        ...prev,
        driverCount: n,
        vbFt3: Number((prev.vbFt3 * r).toFixed(2)),
        sealedVbFt3: Number((prev.sealedVbFt3 * r).toFixed(2)),
        driveW: Math.round(prev.driveW * r),
      }
    })

  const model = useMemo(() => {
    if (!inputs) return null
    const ts = tsOf(inputs)
    const d = deriveDriver(ts)
    // N identical drivers share the box: each sees a 1/N slice of the volume
    // and port area at 1/N of the input power, and N coherent cones sum to
    // +20·log10(N) dB over the per-driver SPL. Excursion and port velocity
    // are per-driver/per-slice quantities and need no gain term.
    const n = inputs.driverCount
    const gainN = 20 * Math.log10(n)
    const vbLTotal = inputs.vbFt3 * LITERS_PER_FT3
    const vbL = vbLTotal / n
    const sealedVbL = (inputs.sealedVbFt3 * LITERS_PER_FT3) / n
    const ported: Alignment & { kind: 'ported' } = { kind: 'ported', vbL, fbHz: inputs.fbHz }
    const sealedSame: Alignment = { kind: 'sealed', vbL }
    const sealedUser: Alignment = { kind: 'sealed', vbL: sealedVbL }
    const ib: Alignment = { kind: 'ib' }
    const sealed707Box = sealedBoxForQtc(ts)
    const sealed707: Alignment | null = sealed707Box ? { kind: 'sealed', vbL: sealed707Box.vbL } : null
    const active: Alignment = mode === 'ported' ? ported : mode === 'sealed' ? sealedUser : ib
    const sealedNums = sealedAlignment(ts, sealedVbL)

    const eg1 = voltsForWatts(ts, 1 / n) // 1 W total, split across the drivers
    const egD = voltsForWatts(ts, inputs.driveW / n)
    const splPoints = (align: Alignment) =>
      SPL_FREQS.map((f) => ({ f, y: solveAt(d, align, f, eg1).spl + gainN }))
    const exPoints = (align: Alignment) =>
      LOW_FREQS.map((f) => ({ f, y: solveAt(d, align, f, egD).excursion * Math.SQRT2 * 1000 }))

    // One lineup drives both the SPL and group-delay charts, so their
    // legends and colors always agree.
    const lineup: { label: string; color: string; dash: number[] | null; align: Alignment }[] =
      mode === 'ported'
        ? [
            {
              label: `Ported ${inputs.vbFt3.toFixed(2)} ft³ @ ${inputs.fbHz.toFixed(1)} Hz`,
              color: SERIES.ported,
              dash: null,
              align: ported,
            },
            { label: 'Sealed, same volume', color: SERIES.sealedSame, dash: [6, 4], align: sealedSame },
            ...(sealed707
              ? [{ label: 'Sealed Qtc 0.707', color: SERIES.sealed707, dash: [2, 3] as number[], align: sealed707 }]
              : []),
            { label: 'Infinite baffle', color: SERIES.ib, dash: [10, 4], align: ib },
          ]
        : mode === 'sealed'
          ? [
              {
                label: `Sealed ${inputs.sealedVbFt3.toFixed(2)} ft³ · Qtc ${sealedNums.qtc.toFixed(2)}`,
                color: SERIES.sealedSame,
                dash: null,
                align: sealedUser,
              },
              ...(sealed707
                ? [{ label: 'Sealed Qtc 0.707', color: SERIES.sealed707, dash: [2, 3] as number[], align: sealed707 }]
                : []),
              { label: 'Infinite baffle', color: SERIES.ib, dash: [10, 4], align: ib },
            ]
          : [
              { label: 'Infinite baffle', color: SERIES.ib, dash: null, align: ib },
              ...(sealed707
                ? [{ label: 'Sealed Qtc 0.707', color: SERIES.sealed707, dash: [2, 3] as number[], align: sealed707 }]
                : []),
            ]

    const spl: Series[] = lineup.map((e) => ({ label: e.label, color: e.color, dash: e.dash, points: splPoints(e.align) }))
    const groupDelay: Series[] = lineup.map((e) => ({
      label: e.label,
      color: e.color,
      dash: e.dash,
      points: groupDelaySeries(d, e.align, SPL_FREQS, eg1),
    }))

    const modeColor = mode === 'ported' ? SERIES.ported : mode === 'sealed' ? SERIES.sealedSame : SERIES.ib
    const excursion: Series[] =
      mode === 'ported'
        ? [
            { label: 'Ported', color: SERIES.ported, dash: null, points: exPoints(ported) },
            { label: 'Sealed, same volume', color: SERIES.sealedSame, dash: [6, 4], points: exPoints(sealedSame) },
          ]
        : mode === 'sealed'
          ? [
              { label: 'Sealed', color: SERIES.sealedSame, dash: null, points: exPoints(sealedUser) },
              { label: 'Infinite baffle', color: SERIES.ib, dash: [10, 4], points: exPoints(ib) },
            ]
          : [{ label: 'Infinite baffle', color: SERIES.ib, dash: null, points: exPoints(ib) }]

    const maxSpl: Series[] = [
      {
        label: `${MODE_LABEL[mode]} — ${Math.round(inputs.driveW).toLocaleString('en-US')} W, Xmax-limited`,
        color: modeColor,
        dash: null,
        points: LOW_FREQS.map((f) => ({ f, y: maxSplAt(d, active, f, inputs.driveW / n).spl + gainN })),
      },
    ]

    // Port design — velocity is never a user input. Port area comes from the
    // ratified displacement basis (founder ruling via the design bench): the
    // driver's full swept volume at the tuning frequency, Sd·Xmax·ω, held
    // under the per-shape flow ceiling. That sizes for music program and
    // matches what NCSW actually installs; the continuous-sine worst case is
    // reported alongside, not sized for. Round ports snap UP to the smallest
    // standard aero size that covers the requirement — you buy a port, you
    // don't turn one. Slots are cut to the solved width exactly.
    let solvedDiaIn = NaN
    let solvedWidthIn = NaN
    let effDiaIn = NaN
    let effWidthIn = NaN
    let minDiaIn = NaN // smallest standard size with clean flow at this count
    let autoSizeShort = false // even the largest standard size can't hold clean flow
    let dispVelPeak = NaN // music-program (displacement-basis) peak velocity
    let area = 0
    if (mode === 'ported') {
      const dispFlow = n * d.sd * d.xmax * 2 * Math.PI * inputs.fbHz
      const areaNeeded = dispFlow / VEL_LIMIT[inputs.portShape]
      if (inputs.portShape === 'round') {
        solvedDiaIn = (2 * Math.sqrt(areaNeeded / (inputs.portCount * Math.PI))) / INCH_M
        const chosen = PORT_SIZES.find((s) => s >= solvedDiaIn)
        autoSizeShort = !chosen
        minDiaIn = chosen ?? NaN
        // The user's size pick holds unless it would run loud — the clean-flow
        // minimum is a floor, never a suggestion.
        effDiaIn = Math.max(inputs.portDiaIn, chosen ?? PORT_SIZES[PORT_SIZES.length - 1])
        area = portAreaM2({ portDiaIn: effDiaIn, portCount: inputs.portCount })
      } else {
        solvedWidthIn = areaNeeded / (inputs.slotHeightIn * INCH_M) / INCH_M
        effWidthIn = solvedWidthIn
        area = areaNeeded
      }
      if (area > 0) dispVelPeak = dispFlow / area
    }
    const portCountEff = inputs.portShape === 'round' ? inputs.portCount : 1
    const portLabel =
      inputs.portShape === 'round'
        ? `${portCountEff} × ${Number(effDiaIn.toFixed(2))}″ round`
        : `slot ${Number(effWidthIn.toFixed(1))}″ × ${Number(inputs.slotHeightIn.toFixed(1))}″`
    const portLenIn =
      mode === 'ported' && area > 0 ? portLengthM(vbLTotal, inputs.fbHz, area, portCountEff) / INCH_M : NaN
    const portResHz = portResonanceHz(portLenIn * INCH_M)
    const portDisplacementFt3 =
      Number.isFinite(portLenIn) && portLenIn > 0 ? (area * portLenIn * INCH_M * 1000) / LITERS_PER_FT3 : NaN
    const portVelocity: Series[] =
      mode === 'ported' && area > 0
        ? [
            {
              label: `${portLabel} @ ${Math.round(inputs.driveW).toLocaleString('en-US')} W`,
              color: SERIES.ported,
              dash: null,
              points: portVelocitySeries(d, ported, area / n, LOW_FREQS, egD),
            },
          ]
        : []
    const portVelPeak = portVelocity.length ? Math.max(...portVelocity[0].points.map((p) => p.y)) : NaN

    const corners = cornerFrequencies(d, active)
    const ibCorners = cornerFrequencies(d, ib)

    return {
      d,
      ts,
      sealed707Box,
      sealedNums,
      spl,
      groupDelay,
      excursion,
      maxSpl,
      portVelocity,
      portVelPeak,
      dispVelPeak,
      portAreaIn2: area * 1550,
      portLenIn,
      portResHz,
      portDisplacementFt3,
      portLabel,
      solvedDiaIn,
      solvedWidthIn,
      effDiaIn,
      minDiaIn,
      autoSizeShort,
      refSpl1W: ibCorners.refSpl1W,
      f3: corners.f3,
      f10: corners.f10,
      sub: mode === 'ported' ? subsonicCrossover(d, ported, inputs.driveW / n) : NaN,
      max315: (() => {
        const m = maxSplAt(d, active, 31.5, inputs.driveW / n)
        return { ...m, spl: m.spl + gainN }
      })(),
    }
  }, [inputs, mode])

  // NCSW design bench — the founder-ruled design point for this driver
  // (ported = the -1 dB knee of score vs volume, sealed = the argmax box),
  // swept live from the same methodology as the scoring pipeline. Computed
  // per single driver; the UI scales volumes by driver count.
  const bench = useMemo(() => {
    if (!inputs || !model) return null
    const ts = tsOf(inputs)
    return {
      ported: portedDesign(ts, model.refSpl1W),
      sealed: sealedDesign(ts, model.refSpl1W, custom ? null : (row?.driver_size ?? null)),
    }
  }, [inputs, model, custom, row])

  // Apply the bench design to the controls: volume (× drivers), tuning, and
  // the solved aero-tube count. Everything downstream recalculates.
  function applyNcswDesign() {
    if (!bench || !inputs) return
    const nDrv = inputs.driverCount
    if (mode === 'ported' && bench.ported) {
      patch({
        vbFt3: Number((bench.ported.vbFt3 * nDrv).toFixed(2)),
        fbHz: Number(bench.ported.fbHz.toFixed(1)),
        portShape: 'round',
        portCount: Math.min(PORT_COUNTS[PORT_COUNTS.length - 1], designPortCount(tsOf(inputs), bench.ported.fbHz, nDrv)),
        portDiaIn: 4, // NCSW standard bore preference; clean-flow floor may bump it
      })
    } else if (mode === 'sealed' && bench.sealed) {
      patch({ sealedVbFt3: Number((bench.sealed.vbFt3 * nDrv).toFixed(2)) })
    }
  }

  const labelSize = useFluidPx(type.meta)
  const sectionSize = useFluidPx(type.h5)
  const controlsGap = useFluidPx(fluid(16, 12)) // within a group of controls that hang together
  const blockGap = useFluidPx(fluid(28, 20))
  const sliderWidth = useFluidValue(150, 116)
  const loadingSize = useFluidPx(type.small)
  // Label line height + gap — offsets the unlabeled buttons to the shared
  // content band so they center with the controls. Numeric (useFluidPx can
  // return a CSS string on web); tracks the type.meta range.
  const labelBand = Math.round(useFluidValue(13, 11) * 1.2) + 7

  // Dropdowns size to their longest entry (11px mono ≈ 6.6px/char, plus
  // trigger padding and chevron).
  // Trigger width tracks the catalog's typical name length, capped tight —
  // the popover sizes to its own content, so a compact trigger clips nothing.
  const driverWidth = useMemo(() => {
    let chars = 12
    for (const key of families.keys()) chars = Math.max(chars, key.length)
    return Math.min(240, Math.round(chars * 6.6) + 54)
  }, [families])

  if (loadError) {
    return (
      <StatusBox>
        <Text style={{ fontFamily: fonts.body, fontSize: loadingSize, color: AXIS } as any}>
          Driver catalog unavailable — {loadError}
        </Text>
      </StatusBox>
    )
  }
  if (!rows.length || !row || !model) {
    return (
      <StatusBox>
        <Text style={{ fontFamily: fonts.body, fontSize: loadingSize, color: AXIS } as any}>
          Loading driver catalog…
        </Text>
      </StatusBox>
    )
  }

  const { ts, sealed707Box, sealedNums } = model
  const inp = inputs!
  const catalogTs = toDriverTS(row)
  const driverLabel = custom
    ? customName.trim() || 'Custom driver'
    : `${row.brand} ${row.model}${row.driver_size ? ` ${row.driver_size}″` : ''}`
  const nDrv = inp.driverCount
  const systemLabel = nDrv > 1 ? `${nDrv} × ${driverLabel}` : driverLabel
  const ebpValue = ebp(ts)
  const ebpRead = ebpValue < 50 ? 'sealed-leaning' : ebpValue > 100 ? 'ported-leaning' : 'either alignment'
  const sens1W = model.refSpl1W
  const sens283 = sensitivity283(sens1W, ts.reOhm)
  const wattsLabel = `${Math.round(inp.driveW).toLocaleString('en-US')} W`
  const f3f10 = `${Number.isNaN(model.f3) ? '—' : model.f3.toFixed(1)} Hz / ${Number.isNaN(model.f10) ? '—' : model.f10.toFixed(1)} Hz`
  const splCaption =
    nDrv > 1
      ? `Anechoic half-space SPL, ${nDrv} drivers at 1 W total / 1 m — cabin gain not included`
      : 'Anechoic half-space SPL, 1 W / 1 m — cabin gain not included'
  const excursionCaption =
    nDrv > 1
      ? `Peak cone excursion per driver, ${wattsLabel} total sine input`
      : `Peak cone excursion at ${wattsLabel} sine input`

  const s707Row = {
    label: 'Sealed for Qtc 0.707',
    value: sealed707Box
      ? `${((sealed707Box.vbL * nDrv) / LITERS_PER_FT3).toFixed(2)} ft³ · F3 ${Math.round(sealed707Box.fcHz)} Hz`
      : `n/a — Qts ${ts.qts.toFixed(2)} is already above 0.71`,
  }
  const headlineRows = [
    {
      label: 'Sensitivity',
      value: `${sens1W.toFixed(1)} dB 1W/1m · ${sens283.toFixed(1)} dB 2.83V${nDrv > 1 ? ' — per driver' : ''}`,
    },
    { label: 'EBP (Fs/Qes)', value: `${Math.round(ebpValue)} — ${ebpRead}` },
    ...(mode === 'sealed'
      ? [
          {
            label: 'This sealed box',
            value: `Qtc ${sealedNums.qtc.toFixed(2)} · Fc ${Math.round(sealedNums.fcHz)} Hz · α ${sealedNums.alpha.toFixed(2)}`,
          },
        ]
      : []),
    ...(mode !== 'ib' ? [s707Row] : []),
    { label: `${MODE_LABEL[mode]} F3 / F10`, value: f3f10 },
    ...(mode === 'ported'
      ? [
          {
            label: 'Subsonic filter',
            value: Number.isNaN(model.sub)
              ? `Not needed — stays inside Xmax to 10 Hz at ${wattsLabel}`
              : `~${Math.ceil(model.sub)} Hz — exceeds Xmax below this at ${wattsLabel}`,
          },
        ]
      : []),
    {
      label: 'Max SPL @ 31.5 Hz',
      value: `${model.max315.spl.toFixed(1)} dB (${model.max315.displacementLimited ? 'excursion' : 'power'}-limited) at ${wattsLabel}`,
      accent: true,
    },
  ]

  // Shared ruled-section label (Alignment numbers, Port designer).
  const sectionLabelStyle = {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: sectionSize,
    letterSpacing: -0.2,
    color: INK,
  } as any

  // Port designer results — every row here is calculated, not entered.
  const tier = velocityTier(model.dispVelPeak, inp.portShape)
  const lenOk = Number.isFinite(model.portLenIn) && model.portLenIn > 0
  const portRows =
    mode === 'ported'
      ? [
          inp.portShape === 'round'
            ? {
                label: 'Port size',
                value: model.autoSizeShort
                  ? `needs ${model.solvedDiaIn.toFixed(2)}″ each for clean flow — over ${PORT_SIZES[PORT_SIZES.length - 1]}″; add ports`
                  : inp.portDiaIn < model.minDiaIn
                    ? `${inp.portCount} × ${model.effDiaIn}″ aero — ${inp.portDiaIn}″ runs loud here; bumped to the smallest clean size (needs ${model.solvedDiaIn.toFixed(2)}″ each)`
                    : model.effDiaIn > model.minDiaIn
                      ? `${inp.portCount} × ${model.effDiaIn}″ aero — larger than needed; ${model.minDiaIn}″ is the smallest clean size`
                      : `${inp.portCount} × ${model.effDiaIn}″ aero — smallest standard size with clean flow (needs ${model.solvedDiaIn.toFixed(2)}″ each)`,
                accent: model.autoSizeShort,
              }
            : {
                label: 'Slot width',
                value: Number.isFinite(model.solvedWidthIn)
                  ? `${model.solvedWidthIn.toFixed(1)}″ — calculated to stay silent (under ${VEL_LIMIT.slot} m/s) at ${wattsLabel}`
                  : '—',
              },
          {
            label: 'Port area',
            value: `${Math.round(model.portAreaIn2)} in²${inp.portShape === 'round' && inp.portCount > 1 ? ` across ${inp.portCount} ports` : ''}`,
          },
          {
            label: 'Port length',
            value: lenOk
              ? `${model.portLenIn.toFixed(1)}″ — calculated to hold ${inp.fbHz.toFixed(1)} Hz`
              : 'n/a — area too large for this tuning; reduce area or raise tuning',
          },
          ...(lenOk
            ? [
                {
                  label: 'Port resonance',
                  value: `${Math.round(model.portResHz)} Hz${model.portResHz < 150 ? ' — low; will color the passband' : ''}`,
                },
                {
                  label: 'Displacement',
                  value: `${model.portDisplacementFt3.toFixed(2)} ft³ — add to gross box volume`,
                },
              ]
            : []),
          {
            label: 'Port velocity',
            value: `${Number.isFinite(model.dispVelPeak) ? model.dispVelPeak.toFixed(1) : '—'} m/s on music program — ${tier.label}`,
          },
          {
            label: 'Sine worst case',
            value: `${Number.isFinite(model.portVelPeak) ? model.portVelPeak.toFixed(1) : '—'} m/s at ${wattsLabel} continuous — test tones only; music never gets there`,
          },
        ]
      : []

  // Design-bench chart data: score vs TOTAL net volume, dB relative to the
  // driver's own best, with the design point and the current box marked.
  const benchDesign = mode === 'ported' ? bench?.ported : mode === 'sealed' ? bench?.sealed : null
  const benchVb = benchDesign ? Number((benchDesign.vbFt3 * nDrv).toFixed(2)) : NaN
  const benchFb = mode === 'ported' && bench?.ported ? bench.ported.fbHz : NaN
  const benchSeries: Series[] = benchDesign
    ? [
        {
          label:
            mode === 'ported'
              ? 'Score vs volume — best musical tune at each volume, rated power'
              : 'Score vs volume — sealed composite, rated power',
          color: mode === 'ported' ? SERIES.ported : SERIES.sealedSame,
          dash: null,
          points: benchDesign.curve.map((p) => ({ f: Number((p.vbFt3 * nDrv).toFixed(3)), y: p.relDb })),
        },
      ]
    : []
  const benchMarkers = benchDesign
    ? [
        {
          x: benchVb,
          color: colors.accent,
          label: `NCSW design — ${benchVb.toFixed(2)} ft³${Number.isFinite(benchFb) ? ` @ ${benchFb.toFixed(1)} Hz` : ''}`,
        },
        {
          x: mode === 'ported' ? inp.vbFt3 : inp.sealedVbFt3,
          color: AXIS,
          label: `Your box — ${(mode === 'ported' ? inp.vbFt3 : inp.sealedVbFt3).toFixed(2)} ft³`,
        },
      ]
    : []
  const benchCaption =
    mode === 'ported'
      ? `NCSW design bench: score vs net volume at rated power, best musical tune at each step. The design point is the knee — the smallest box within ${PORTED_KNEE_DB} dB of the flat top; volume past it buys tenths of a dB.`
      : 'NCSW design bench: sealed composite score vs net volume at rated power. The design point is the best-scoring box — the volume the driver wants, before the vehicle has a say.'

  async function handleDownloadPdf() {
    if (pdfBusy || !model) return
    setPdfError(null)
    setPdfBusy(true)
    try {
      const legendOf = (s: Series[]) => s.map((x) => ({ label: x.label, color: x.color }))
      const defs = [
        {
          id: 'spl',
          title: 'SPL response',
          caption: splCaption,
          legend: legendOf(model.spl),
        },
        {
          id: 'maxspl',
          title: 'Max SPL',
          caption: `Maximum SPL at ${wattsLabel}: power-limited, capped where peak excursion hits Xmax ${ts.xmaxMm} mm`,
          legend: legendOf(model.maxSpl),
        },
        {
          id: 'excursion',
          title: 'Cone excursion',
          caption: excursionCaption,
          legend: [...legendOf(model.excursion), { label: `Xmax ${ts.xmaxMm} mm`, color: SERIES.xmax }],
        },
        {
          id: 'gd',
          title: 'Group delay',
          caption: 'Group delay — time smear of the alignment; ported peaks near tuning',
          legend: legendOf(model.groupDelay),
        },
        ...(benchDesign
          ? [
              {
                id: 'bench',
                title: 'NCSW design bench',
                caption: benchCaption,
                legend: [
                  ...benchSeries.map((s) => ({ label: s.label, color: s.color })),
                  ...benchMarkers.map((m) => ({ label: m.label, color: m.color })),
                ],
              },
            ]
          : []),
        ...(mode === 'ported'
          ? [
              {
                id: 'portvel',
                title: 'Port air velocity',
                caption: `Peak port air velocity on continuous sine at ${wattsLabel} through ${model.portLabel} — the worst case; music program runs far lower`,
                legend: [
                  ...legendOf(model.portVelocity),
                  {
                    label: `${VEL_LIMIT[inp.portShape]} m/s — ${inp.portShape === 'round' ? 'clean flared flow below' : 'silent below'}`,
                    color: SERIES.sealed707,
                  },
                  { label: '30 m/s — audible while driving', color: SERIES.ib },
                ],
              },
            ]
          : []),
      ]
      const charts: ReportChart[] = []
      for (const def of defs) {
        const canvas = chartCanvases.current[def.id]
        if (canvas) charts.push({ title: def.title, caption: def.caption, canvas, legend: def.legend })
      }
      const modeSummary =
        mode === 'ported'
          ? `Ported — ${inp.vbFt3.toFixed(2)} ft³ net @ ${inp.fbHz.toFixed(1)} Hz · ${model.portLabel} · ${wattsLabel} input`
          : mode === 'sealed'
            ? `Sealed — ${inp.sealedVbFt3.toFixed(2)} ft³ · Qtc ${sealedNums.qtc.toFixed(2)} · ${wattsLabel} input`
            : `Infinite baffle · ${wattsLabel} input`
      await downloadModelReport({
        driverLabel: systemLabel,
        custom,
        modeSummary,
        rows: [...headlineRows, ...portRows].map((r) => ({ label: r.label, value: r.value })),
        charts,
        footnote: `Lumped-element Thiele/Small model computed live from ${custom ? 'user-entered' : 'catalog'} parameters. Box leakage QL = 7; port compression and voice-coil inductance losses not modeled. Port length assumes round flared-free ends (0.732 D end correction).`,
      })
    } catch (e) {
      setPdfError(e instanceof Error ? e.message : String(e))
    } finally {
      setPdfBusy(false)
    }
  }

  return (
    <View style={{ width: '100%' } as any}>
      {/* Controls — one row: labels share the top line, content centers in
          the band below. [driver + specs] · gap · [size · alignment · box] ·
          spacer · [download] */}
      <View style={{ marginBottom: blockGap } as any}>
        <View
          style={
            {
              flexDirection: 'row',
              flexWrap: 'wrap',
              alignItems: 'flex-start',
              gap: controlsGap,
            } as any
          }
        >
            <ControlColumn label="Driver" width={driverWidth}>
              <Dropdown
                hideLabel
                label="Driver"
                value={custom ? '' : familyKey}
                options={[...families.keys()].map((k) => ({ label: k, value: k }))}
                onChange={(k) => {
                  const list = families.get(k)
                  if (!list?.length) return
                  // Hold the current size across families when it exists there.
                  const match = list.find((r) => r.driver_size === row.driver_size) ?? list[0]
                  selectDriver(match.slug)
                }}
              />
            </ControlColumn>
            <ControlColumn label="Size" width={72}>
              <Dropdown
                hideLabel
                label="Driver size, inches"
                value={custom ? '' : (row.driver_size ?? '')}
                options={familyRows.map((r) => ({ label: `${r.driver_size}″`, value: r.driver_size ?? '' }))}
                onChange={(s) => {
                  const match = familyRows.find((r) => r.driver_size === s)
                  if (match) selectDriver(match.slug)
                }}
              />
            </ControlColumn>
            <ControlColumn label="Drivers" width={70}>
              <Dropdown
                hideLabel
                label="Drivers"
                value={String(inp.driverCount)}
                options={DRIVER_COUNTS.map((c) => ({ label: String(c), value: String(c) }))}
                onChange={(v) => setDriverCount(Number(v))}
              />
            </ControlColumn>
            {mode !== 'ib' && benchDesign ? (
              <View style={{ marginTop: labelBand, height: CONTROL_BAND, justifyContent: 'center' } as any}>
                <Button size="control" variant="primary" onPress={applyNcswDesign}>
                  Optimize
                </Button>
              </View>
            ) : null}
            <FilterChipGroup
              dense
              label="Alignment"
              value={mode}
              options={['ported', 'sealed', 'ib']}
              onChange={(v) => setMode(v as Mode)}
              renderOption={(o) => MODE_LABEL[o as Mode]}
            />
            {mode === 'ported' ? (
              <>
                <SliderGroup
                  label="Enclosure"
                  unit="ft³"
                  min={0.15}
                  max={12 * inp.driverCount}
                  step={0.05}
                  value={inp.vbFt3}
                  onChange={(v) => patch({ vbFt3: v })}
                  width={sliderWidth}
                  ariaLabel="Ported enclosure net volume, cubic feet"
                />
                <SliderGroup
                  label="Tuning"
                  unit="Hz"
                  min={18}
                  max={50}
                  step={0.5}
                  value={inp.fbHz}
                  onChange={(v) => patch({ fbHz: v })}
                  width={sliderWidth}
                  ariaLabel="Ported box tuning frequency, hertz"
                  decimals={1}
                />
              </>
            ) : null}
            {mode === 'sealed' ? (
              <SliderGroup
                label="Enclosure"
                unit="ft³"
                min={0.1}
                max={8 * inp.driverCount}
                step={0.05}
                value={inp.sealedVbFt3}
                onChange={(v) => patch({ sealedVbFt3: v })}
                width={sliderWidth}
                ariaLabel="Sealed enclosure net volume, cubic feet"
              />
            ) : null}
            <View style={{ marginTop: labelBand, height: CONTROL_BAND, justifyContent: 'center' } as any}>
              <Button size="control" onPress={() => setModalOpen(true)}>
                Enter driver specs
              </Button>
            </View>
            <View style={{ marginTop: labelBand, height: CONTROL_BAND, justifyContent: 'center' } as any}>
              <Button size="control" onPress={handleDownloadPdf} disabled={pdfBusy}>
                {pdfBusy ? 'Preparing PDF…' : 'Download PDF'}
              </Button>
            </View>
        </View>

        {custom || pdfError ? (
          <View style={{ marginTop: controlsGap, gap: 6 } as any}>
            {custom ? (
              <Text style={{ fontFamily: fonts.body, fontSize: labelSize, color: colors.accent } as any}>
                Modeling “{driverLabel}” — a custom driver, not in the NCSW catalog. Adjust it with “Enter
                driver specs”; pick a library driver to return.
              </Text>
            ) : null}
            {pdfError ? (
              <Text style={{ fontFamily: fonts.body, fontSize: labelSize, color: colors.accent } as any}>
                PDF export failed — {pdfError}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>

      {/* Alignment numbers — the driver-in-this-box figures, above the port
          hardware. */}
      <View style={{ marginBottom: blockGap } as any}>
        <View style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 12, marginBottom: 10 } as any}>
          <Text style={sectionLabelStyle}>Alignment numbers</Text>
        </View>
        <DataList rows={headlineRows} />
      </View>

      {/* Port designer — ported alignment only. Inputs are fields; length,
          resonance, displacement, and velocity are always calculated. */}
      {mode === 'ported' ? (
        <View style={{ marginBottom: blockGap } as any}>
          <View
            style={
              {
                flexDirection: 'row',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                borderTopWidth: 1,
                borderTopColor: colors.line,
                paddingTop: 12,
              } as any
            }
          >
            <Text style={sectionLabelStyle}>Port designer</Text>
            {Number.isFinite(model.dispVelPeak) ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 } as any}>
                <View style={{ width: 10, height: 10, borderRadius: radius.pill, backgroundColor: tier.color } as any} />
                <Text style={{ fontFamily: fonts.body, fontWeight: '600', fontVariant: ['tabular-nums'], fontSize: labelSize, color: INK } as any}>
                  {Math.round(model.dispVelPeak)} m/s — {tier.label}
                </Text>
              </View>
            ) : null}
          </View>
          <Text
            style={
              { fontFamily: fonts.body, fontSize: labelSize, color: colors.inkFaint, marginTop: 8, marginBottom: controlsGap } as any
            }
          >
            {inp.portShape === 'round'
              ? `Flared aero tubes, sized for music program (under ${VEL_LIMIT.round} m/s) and cut to hold ${inp.fbHz.toFixed(1)} Hz — pick the count and size; undersized picks are bumped up automatically.`
              : `A straight slot, sized to stay silent on music program (under ${VEL_LIMIT.slot} m/s) and cut to hold ${inp.fbHz.toFixed(1)} Hz — pick the height; width and length are calculated.`}
          </Text>

          <View
            style={
              { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: controlsGap, marginBottom: controlsGap } as any
            }
          >
            <FilterChipGroup
              dense
              label="Shape"
              value={inp.portShape}
              options={['round', 'slot']}
              renderOption={(o) => (o === 'round' ? 'Round' : 'Slot')}
              onChange={(v) => patch({ portShape: v as ModelInputs['portShape'] })}
            />
            <NumberField
              label="At power"
              unit="W"
              value={inp.driveW}
              onChange={(v) => patch({ driveW: v })}
              min={1}
              max={20000}
              decimals={0}
              width={96}
            />
            {inp.portShape === 'round' ? (
              <>
                <ControlColumn label="Ports" width={70}>
                  <Dropdown
                    hideLabel
                    label="Ports"
                    value={String(inp.portCount)}
                    options={PORT_COUNTS.map((c) => ({ label: String(c), value: String(c) }))}
                    onChange={(v) => patch({ portCount: Number(v) })}
                  />
                </ControlColumn>
                <ControlColumn label="Diameter" width={84}>
                  <Dropdown
                    hideLabel
                    label="Port diameter, inches"
                    value={String(Number.isFinite(model.effDiaIn) ? model.effDiaIn : inp.portDiaIn)}
                    options={PORT_SIZES.map((s) => ({ label: `${s}″`, value: String(s) }))}
                    onChange={(v) => patch({ portDiaIn: Number(v) })}
                  />
                </ControlColumn>
              </>
            ) : (
              <NumberField
                label="Height"
                unit="in"
                value={inp.slotHeightIn}
                onChange={(v) => patch({ slotHeightIn: v })}
                min={0.5}
                max={8}
                decimals={2}
                width={88}
              />
            )}
          </View>

          <DataList rows={portRows} />
        </View>
      ) : null}

      {/* Design bench — score vs volume, the knee (ported) / argmax (sealed) */}
      {benchDesign && benchSeries[0].points.length > 1 ? (
        <>
          <ChartBlock
            exportId="bench"
            registerCanvas={registerCanvas}
            series={benchSeries}
            xMin={benchSeries[0].points[0].f}
            xMax={benchSeries[0].points[benchSeries[0].points.length - 1].f}
            xTicks={[0.3, 0.5, 1, 2, 3, 5, 8, 15, 30, 60].filter(
              (t) => t > benchSeries[0].points[0].f && t <= benchSeries[0].points[benchSeries[0].points.length - 1].f,
            )}
            xAxisLabel="NET VOLUME — FT³"
            xUnit="ft³"
            xDecimals={2}
            xMarkers={benchMarkers}
            yTickStep={1}
            yPad={[0, 0.5]}
            yFloor={-6}
            yUnit="dB"
            yAxisLabel="SCORE — DB VS BEST"
            refLines={
              mode === 'ported'
                ? [{ y: -PORTED_KNEE_DB, color: SERIES.sealed707, label: `−${PORTED_KNEE_DB} dB — knee window` }]
                : []
            }
            caption={benchCaption}
          />
          <View style={{ height: blockGap } as any} />
        </>
      ) : null}

      {/* SPL response */}
      <ChartBlock
        exportId="spl"
        registerCanvas={registerCanvas}
        series={model.spl}
        xMax={250}
        yTickStep={10}
        yPad={[4, 4]}
        yUnit="dB"
        yAxisLabel="SPL — DB, 1W/1M"
        caption={splCaption}
      />

      <View style={{ height: blockGap } as any} />

      {/* Max SPL */}
      <ChartBlock
        exportId="maxspl"
        registerCanvas={registerCanvas}
        series={model.maxSpl}
        xMax={100}
        yTickStep={10}
        yPad={[4, 4]}
        yUnit="dB"
        yAxisLabel="MAX SPL — DB @ 1M"
        caption={`Maximum SPL at ${wattsLabel}: power-limited, capped where peak excursion hits Xmax ${ts.xmaxMm} mm`}
      />

      <View style={{ height: blockGap } as any} />

      {/* Excursion */}
      <ChartBlock
        exportId="excursion"
        registerCanvas={registerCanvas}
        series={model.excursion}
        xMax={100}
        yTickStep={10}
        yPad={[0, 4]}
        yUnit="mm"
        yAxisLabel="EXCURSION — MM PEAK"
        yFloor={0}
        yCeil={ts.xmaxMm * 2.2}
        refLines={[{ y: ts.xmaxMm, color: SERIES.xmax, label: `Xmax ${ts.xmaxMm} mm` }]}
        caption={excursionCaption}
      />

      <View style={{ height: blockGap } as any} />

      {/* Group delay */}
      <ChartBlock
        exportId="gd"
        registerCanvas={registerCanvas}
        series={model.groupDelay}
        xMax={250}
        yTickStep={5}
        yPad={[0, 2]}
        yUnit="ms"
        yAxisLabel="GROUP DELAY — MS"
        yFloor={0}
        caption="Group delay — time smear of the alignment; ported peaks near tuning, sealed and IB stay low"
      />

      {mode === 'ported' && model.portVelocity.length ? (
        <>
          <View style={{ height: blockGap } as any} />
          <ChartBlock
            exportId="portvel"
            registerCanvas={registerCanvas}
            series={model.portVelocity}
            xMax={100}
            yTickStep={5}
            yPad={[0, 3]}
            yUnit="m/s"
            yAxisLabel="PORT AIR VELOCITY — M/S"
            yFloor={0}
            refLines={[
              {
                y: VEL_LIMIT[inp.portShape],
                color: SERIES.sealed707,
                label: `${VEL_LIMIT[inp.portShape]} m/s — ${inp.portShape === 'round' ? 'clean flared flow below' : 'silent below'}`,
              },
              { y: 30, color: SERIES.ib, label: '30 m/s — audible while driving' },
            ]}
            caption={`Peak port air velocity on continuous sine at ${wattsLabel} through ${model.portLabel} — the worst case; music program runs far lower`}
          />
        </>
      ) : null}

      <Text
        style={
          {
            fontFamily: fonts.body,
            fontSize: labelSize,
            color: colors.inkFaint,
            marginTop: blockGap,
          } as any
        }
      >
        Lumped-element Thiele/Small model computed live from catalog parameters. Box leakage QL = 7; port
        compression and voice-coil inductance losses not modeled. Port length uses the free-end correction
        (0.732 D, WinISD's convention) for round and slot ports — a slot sharing box walls builds slightly
        shorter in practice.
      </Text>

      {modalOpen ? (
        <ExactValuesModal
          initial={inp}
          catalogTs={catalogTs}
          initialName={custom ? customName : `${row.brand} ${row.model}`}
          onApply={(next, name) => {
            setInputs(next)
            const isCustom = catalogTs ? !tsEquals(tsOf(next), catalogTs) : true
            setCustom(isCustom)
            if (isCustom) setCustomName(name.trim() || 'Custom driver')
            setModalOpen(false)
          }}
          onClose={() => setModalOpen(false)}
        />
      ) : null}
    </View>
  )
}

// ── Exact-values modal ──────────────────────────────────────────────────────
// Full-page modal with typed fields for everything the model consumes:
// driver T/S (editable — a WinISD-style custom-driver editor), both
// enclosures, port geometry, and drive power. Edits buffer in a draft and
// commit on Apply.

function ExactValuesModal({
  initial,
  catalogTs,
  initialName,
  onApply,
  onClose,
}: {
  initial: ModelInputs
  catalogTs: DriverTS | null
  initialName: string
  onApply: (next: ModelInputs, name: string) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<ModelInputs>(initial)
  const [name, setName] = useState(initialName)
  const set = (k: keyof ModelInputs) => (v: number) => setDraft((prev) => ({ ...prev, [k]: v }))

  const sectionSize = useFluidPx(type.meta)
  const derivedSize = useFluidPx(type.meta)
  const fieldGap = useFluidPx(fluid(14, 10))
  const sectionGap = useFluidPx(fluid(26, 18))

  // Live-derived readouts so typed values can be sanity-checked before Apply.
  const draftTs = tsOf(draft)
  const sealedDraft = sealedAlignment(draftTs, (draft.sealedVbFt3 * LITERS_PER_FT3) / draft.driverCount)
  const draftEdited = catalogTs ? !tsEquals(draftTs, catalogTs) : false

  const sectionStyle = {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: sectionSize,
    letterSpacing: -0.2,
    color: INK,
    marginBottom: 10,
  } as any
  const derivedStyle = {
    fontFamily: fonts.body,
    fontSize: derivedSize,
    color: colors.inkFaint,
    marginTop: 10,
  } as any
  const rowStyle = { flexDirection: 'row', flexWrap: 'wrap', gap: fieldGap } as any

  return (
    <Modal open onClose={onClose} title={`Driver specs — ${initialName}`}>
      <Modal.Body>
        <View style={{ gap: sectionGap, maxWidth: 760 } as any}>
          <View>
            <Text style={sectionStyle}>Driver — Thiele/Small</Text>
            <View style={{ marginBottom: fieldGap } as any}>
              <TextField label="Driver name" value={name} onChange={setName} placeholder="Brand + model" />
            </View>
            <View style={rowStyle}>
              <NumberField label="Fs" unit="Hz" value={draft.fsHz} onChange={set('fsHz')} min={10} max={120} />
              <NumberField label="Qts" value={draft.qts} onChange={set('qts')} min={0.2} max={1.5} decimals={3} />
              <NumberField label="Qes" value={draft.qes} onChange={set('qes')} min={0.2} max={2} decimals={3} />
              <NumberField label="Vas" unit="L" value={draft.vasL} onChange={set('vasL')} min={1} max={1000} />
              <NumberField label="Sd" unit="cm²" value={draft.sdCm2} onChange={set('sdCm2')} min={50} max={4000} />
              <NumberField label="Xmax" unit="mm" value={draft.xmaxMm} onChange={set('xmaxMm')} min={2} max={50} />
              <NumberField label="Re" unit="Ω" value={draft.reOhm} onChange={set('reOhm')} min={0.5} max={16} />
              <NumberField label="Rated" unit="W" value={draft.rmsWatts} onChange={set('rmsWatts')} min={50} max={10000} decimals={0} />
            </View>
            <Text style={derivedStyle}>
              {draftEdited
                ? 'Differs from the catalog record — will model as a custom driver.'
                : 'Matches the catalog record.'}{' '}
              Only parameters the model consumes are shown; Le is not modeled.
            </Text>
          </View>

          <View>
            <Text style={sectionStyle}>Enclosure</Text>
            <View style={rowStyle}>
              <NumberField label="Drivers" value={draft.driverCount} onChange={set('driverCount')} min={1} max={8} decimals={0} width={80} />
              <NumberField label="Ported vol" unit="ft³" value={draft.vbFt3} onChange={set('vbFt3')} min={0.05} max={100} />
              <NumberField label="Tuning" unit="Hz" value={draft.fbHz} onChange={set('fbHz')} min={15} max={60} decimals={1} />
              <NumberField label="Sealed vol" unit="ft³" value={draft.sealedVbFt3} onChange={set('sealedVbFt3')} min={0.05} max={100} />
            </View>
            <Text style={derivedStyle}>
              {draft.driverCount > 1 ? `${draft.driverCount} drivers sharing each box · ` : ''}Ported{' '}
              {`${(draft.vbFt3 * LITERS_PER_FT3).toFixed(0)} L`} · Sealed{' '}
              {`${(draft.sealedVbFt3 * LITERS_PER_FT3).toFixed(0)} L → Qtc ${sealedDraft.qtc.toFixed(2)}, Fc ${Math.round(sealedDraft.fcHz)} Hz`}
            </Text>
          </View>

          <View>
            <Text style={sectionStyle}>Signal</Text>
            <View style={rowStyle}>
              <NumberField label="Input power" unit="W" value={draft.driveW} onChange={set('driveW')} min={1} max={20000} decimals={0} width={120} />
            </View>
            <Text style={derivedStyle}>
              {draft.driverCount > 1
                ? `${Math.round(draft.driveW / draft.driverCount)} W per driver — ${Math.sqrt((draft.driveW / draft.driverCount) * draft.reOhm).toFixed(1)} V RMS into each Re — drives the excursion, port-velocity, and max-SPL curves`
                : `${Math.sqrt(draft.driveW * draft.reOhm).toFixed(1)} V RMS into Re — drives the excursion, port-velocity, and max-SPL curves`}
            </Text>
          </View>
        </View>
      </Modal.Body>
      <Modal.Footer>
        {catalogTs && draftEdited ? (
          <Button onPress={() => setDraft((prev) => ({ ...prev, ...catalogTs }))}>Reset driver to catalog</Button>
        ) : null}
        <Button onPress={onClose}>Cancel</Button>
        <Button variant="primary" onPress={() => onApply(draft, name)}>
          Apply
        </Button>
      </Modal.Footer>
    </Modal>
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

// Label over a ValueSlider paired with a typeable value field — drag and the
// field tracks live; type and the model follows on commit.
function SliderGroup({
  label,
  unit,
  min,
  max,
  step,
  value,
  onChange,
  width,
  ariaLabel,
  decimals = 2,
}: {
  label: string
  unit: string
  min: number
  max: number
  step: number
  value: number
  onChange: (n: number) => void
  width: number
  ariaLabel: string
  decimals?: number
}) {
  const fontSize = useFluidPx(type.meta)
  const groupGap = useFluidPx(fluid(7, 6))
  return (
    <View style={{ flexDirection: 'column', alignItems: 'flex-start', gap: groupGap } as any}>
      <Text
        style={
          {
            fontFamily: fonts.body,
            fontWeight: '600',
            fontSize,
            color: FG_2,
          } as any
        }
      >
        {label} <Text style={{ color: colors.inkFaint, textTransform: 'none' } as any}>{unit}</Text>
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: CONTROL_BAND } as any}>
        <ValueSlider min={min} max={max} step={step} value={value} onChange={onChange} width={width} ariaLabel={ariaLabel} />
        <NumberField
          compact
          label={ariaLabel}
          value={value}
          onChange={onChange}
          min={min}
          max={max}
          decimals={decimals}
          width={60}
        />
      </View>
    </View>
  )
}

// ── Curve chart (canvas) ────────────────────────────────────────────────────
// Log-frequency line chart with hairline grid, mono tick labels, hover
// crosshair with per-series readout, and a legend row. Same imperative
// fluid-canvas approach as SubwooferFrontierChart.

type RefLine = { y: number; color: string; label: string }

type TooltipState = { f: number; values: { label: string; color: string; y: number }[]; left: number; top: number }

type XMarker = { x: number; color: string; label: string }

function ChartBlock({
  series,
  xMax,
  xMin = 15,
  xTicks = [20, 30, 40, 60, 100, 150, 250],
  xAxisLabel = 'FREQUENCY — HZ',
  xUnit = 'Hz',
  xDecimals = 1,
  xMarkers,
  yTickStep,
  yPad,
  yUnit,
  yAxisLabel,
  yFloor,
  yCeil,
  refLines,
  caption,
  exportId,
  registerCanvas,
}: {
  series: Series[]
  xMax: number
  xMin?: number
  xTicks?: number[]
  xAxisLabel?: string
  xUnit?: string
  xDecimals?: number
  xMarkers?: XMarker[]
  yTickStep: number
  yPad: [number, number]
  yUnit: string
  yAxisLabel: string
  yFloor?: number
  yCeil?: number
  refLines?: RefLine[]
  caption: string
  exportId?: string
  registerCanvas?: (id: string, c: HTMLCanvasElement | null) => void
}) {
  const plotRef = useRef<any>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const hoverFreqRef = useRef<number | null>(null)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  // Expose the live canvas for PDF export; the element is stable across
  // redraws so registering on mount is enough.
  useEffect(() => {
    if (!exportId || !registerCanvas) return undefined
    registerCanvas(exportId, canvasRef.current)
    return () => registerCanvas(exportId, null)
  }, [exportId, registerCanvas])

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

    const X_MIN = xMin
    const allY = series.flatMap((s) => s.points.map((p) => p.y)).concat((refLines ?? []).map((rl) => rl.y))
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
      const tickFont = `600 ${fpx(11, 10)}px 'Inter', sans-serif`
      ctx!.clearRect(0, 0, box.width, box.height)

      // grid + ticks
      ctx!.font = tickFont
      ctx!.lineWidth = 1
      const ticks = xTicks.filter((t) => t > X_MIN && t <= xMax)
      for (const t of [X_MIN, ...ticks]) {
        const px = x(t)
        ctx!.strokeStyle = GRID
        ctx!.beginPath()
        ctx!.moveTo(px, pad.top)
        ctx!.lineTo(px, pad.top + box.pH)
        ctx!.stroke()
        ctx!.fillStyle = TICK
        ctx!.textAlign = 'center'
        ctx!.fillText(t >= 10 || Number.isInteger(t) ? String(Math.round(t * 10) / 10) : t.toFixed(1), px, pad.top + box.pH + fpx(18, 14))
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
      ctx!.fillText(xAxisLabel, pad.left + box.pW / 2, box.height - fpx(8, 6))
      ctx!.save()
      ctx!.translate(fpx(13, 10), pad.top + box.pH / 2)
      ctx!.rotate(-Math.PI / 2)
      ctx!.fillText(yAxisLabel, 0, 0)
      ctx!.restore()

      // reference lines (Xmax, velocity thresholds)
      for (const rl of refLines ?? []) {
        ctx!.strokeStyle = rl.color
        ctx!.lineWidth = fpx(1.5, 1.2)
        ctx!.setLineDash([fpx(4, 3), fpx(4, 3)])
        ctx!.beginPath()
        ctx!.moveTo(pad.left, y(rl.y))
        ctx!.lineTo(pad.left + box.pW, y(rl.y))
        ctx!.stroke()
        ctx!.setLineDash([])
      }

      // vertical markers (design point, current box)
      for (const m of xMarkers ?? []) {
        if (m.x < X_MIN || m.x > xMax) continue
        ctx!.strokeStyle = m.color
        ctx!.lineWidth = fpx(1.5, 1.2)
        ctx!.setLineDash([fpx(4, 3), fpx(4, 3)])
        ctx!.beginPath()
        ctx!.moveTo(x(m.x), pad.top)
        ctx!.lineTo(x(m.x), pad.top + box.pH)
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
  }, [series, xMax, xMin, xTicks, xAxisLabel, xMarkers, yTickStep, yPad, yFloor, yCeil, refLines, yAxisLabel])

  return (
    <View style={{ width: '100%' } as any}>
      <View ref={plotRef} style={{ position: 'relative', width: '100%', height: chartHeight } as any}>
        {React.createElement('canvas', {
          ref: canvasRef,
          style: { position: 'absolute', top: 0, left: 0, cursor: 'crosshair' },
        })}
        {tooltip ? <CurveTooltip tooltip={tooltip} yUnit={yUnit} xUnit={xUnit} xDecimals={xDecimals} /> : null}
      </View>
      <Text style={{ fontFamily: fonts.body, fontSize: captionSize, color: colors.inkFaint, marginTop: 6 } as any}>
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
        {(refLines ?? []).map((rl) => (
          <View key={rl.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 7 } as any}>
            <View style={{ width: swatchWidth, borderTopWidth: 2, borderTopColor: rl.color, borderStyle: 'dashed' } as any} />
            <Text style={{ fontFamily: fonts.body, fontSize: legendSize, color: FG_2 } as any}>{rl.label}</Text>
          </View>
        ))}
        {(xMarkers ?? []).map((m) => (
          <View key={m.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 7 } as any}>
            <View style={{ width: swatchWidth, borderTopWidth: 2, borderTopColor: m.color, borderStyle: 'dashed' } as any} />
            <Text style={{ fontFamily: fonts.body, fontSize: legendSize, color: FG_2 } as any}>{m.label}</Text>
          </View>
        ))}
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

function CurveTooltip({
  tooltip,
  yUnit,
  xUnit = 'Hz',
  xDecimals = 1,
}: {
  tooltip: TooltipState
  yUnit: string
  xUnit?: string
  xDecimals?: number
}) {
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
      <Text style={{ fontFamily: fonts.body, fontSize: titleSize, fontWeight: '600', fontVariant: ['tabular-nums'], color: INK, marginBottom: 4 } as any}>
        {tooltip.f.toFixed(xDecimals)} {xUnit}
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
