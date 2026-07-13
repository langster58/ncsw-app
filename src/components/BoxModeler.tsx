// BoxModeler — interactive enclosure modeler for the full subwoofer catalog.
//
// Pick any driver — or type in custom Thiele/Small parameters — choose an
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
  DataList,
  Dropdown,
  FilterChipGroup,
  Modal,
  NumberField,
  TextField,
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
  portAreaForVelocity,
  portLengthM,
  portVelocitySeries,
  sealedAlignment,
  sealedBoxForQtc,
  sensitivity283,
  solveAt,
  subsonicCrossover,
  voltsFor1W,
  voltsForWatts,
} from '@/lib/driver-model'
import { downloadModelReport, type ReportChart } from '@/lib/model-report-pdf'

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
const LOW_FREQS = logSweep(15, 100, 70)

const INCH_M = 0.0254

type Mode = 'ported' | 'sealed' | 'ib'
const MODE_LABEL: Record<Mode, string> = { ported: 'Ported', sealed: 'Sealed', ib: 'Infinite baffle' }

// Everything the exact-values modal can set: driver T/S, both boxes, port
// geometry, and drive power. Sliders write into the same object, so typed
// and dragged values never fight.
type ModelInputs = DriverTS & {
  vbFt3: number
  fbHz: number
  sealedVbFt3: number
  portDiaIn: number
  portCount: number
  driveW: number
}

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

function portAreaM2(i: Pick<ModelInputs, 'portDiaIn' | 'portCount'>): number {
  const r = (i.portDiaIn * INCH_M) / 2
  return i.portCount * Math.PI * r * r
}

// Community-typical port diameter per driver size.
function defaultPortDiaIn(size: string | null | undefined): number {
  const n = Number(size)
  if (!n || n <= 10) return 3
  if (n <= 13.5) return 4
  return 6
}

function defaultInputsFor(row: CatalogRow): ModelInputs {
  const ts = toDriverTS(row)!
  const def = BOX_DEFAULTS[row.driver_size ?? ''] ?? [2.0, 32]
  const s707 = sealedBoxForQtc(ts)
  const sealedVbFt3 = Math.min(8, Math.max(0.1, (s707?.vbL ?? def[0] * 0.5 * LITERS_PER_FT3) / LITERS_PER_FT3))
  return {
    ...ts,
    vbFt3: def[0],
    fbHz: def[1],
    sealedVbFt3: Number(sealedVbFt3.toFixed(2)),
    portDiaIn: defaultPortDiaIn(row.driver_size),
    portCount: 1,
    driveW: ts.rmsWatts,
  }
}

function WebModeler() {
  const [rows, setRows] = useState<CatalogRow[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [sizeFilter, setSizeFilter] = useState('all')
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

  // Seed the input set once the catalog resolves the first driver.
  useEffect(() => {
    if (row && !inputs) setInputs(defaultInputsFor(row))
  }, [row, inputs])

  function selectDriver(nextSlug: string, pool: CatalogRow[]) {
    const next = pool.find((r) => r.slug === nextSlug)
    setSlug(nextSlug)
    setCustom(false)
    if (next) setInputs(defaultInputsFor(next))
  }

  const patch = (p: Partial<ModelInputs>) => setInputs((prev) => (prev ? { ...prev, ...p } : prev))

  const model = useMemo(() => {
    if (!inputs) return null
    const ts = tsOf(inputs)
    const d = deriveDriver(ts)
    const vbL = inputs.vbFt3 * LITERS_PER_FT3
    const sealedVbL = inputs.sealedVbFt3 * LITERS_PER_FT3
    const ported: Alignment & { kind: 'ported' } = { kind: 'ported', vbL, fbHz: inputs.fbHz }
    const sealedSame: Alignment = { kind: 'sealed', vbL }
    const sealedUser: Alignment = { kind: 'sealed', vbL: sealedVbL }
    const ib: Alignment = { kind: 'ib' }
    const sealed707Box = sealedBoxForQtc(ts)
    const sealed707: Alignment | null = sealed707Box ? { kind: 'sealed', vbL: sealed707Box.vbL } : null
    const active: Alignment = mode === 'ported' ? ported : mode === 'sealed' ? sealedUser : ib
    const sealedNums = sealedAlignment(ts, sealedVbL)

    const eg1 = voltsFor1W(ts)
    const egD = voltsForWatts(ts, inputs.driveW)
    const splPoints = (align: Alignment) => SPL_FREQS.map((f) => ({ f, y: solveAt(d, align, f, eg1).spl }))
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
        points: LOW_FREQS.map((f) => ({ f, y: maxSplAt(d, active, f, inputs.driveW).spl })),
      },
    ]

    // Ported-only port physics.
    const area = portAreaM2(inputs)
    const portLenIn = mode === 'ported' ? portLengthM(vbL, inputs.fbHz, area, inputs.portCount) / INCH_M : NaN
    const portVelocity: Series[] =
      mode === 'ported'
        ? [
            {
              label: `${inputs.portCount} × ${inputs.portDiaIn}″ port @ ${Math.round(inputs.driveW).toLocaleString('en-US')} W`,
              color: SERIES.ported,
              dash: null,
              points: portVelocitySeries(d, ported, area, LOW_FREQS, egD),
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
      portAreaIn2: area * 1550,
      portLenIn,
      refSpl1W: ibCorners.refSpl1W,
      f3: corners.f3,
      f10: corners.f10,
      sub: mode === 'ported' ? subsonicCrossover(d, ported, inputs.driveW) : NaN,
      portIn2Rec: mode === 'ported' ? portAreaForVelocity(d, ported, 17, inputs.driveW) * 1550 : NaN,
      max315: maxSplAt(d, active, 31.5, inputs.driveW),
    }
  }, [inputs, mode])

  const labelSize = useFluidPx(type.meta)
  const controlsGap = useFluidPx(fluid(16, 12)) // within a group of controls that hang together
  const groupGap = useFluidPx(fluid(40, 26)) // between control groups
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

  const { ts, sealed707Box, sealedNums } = model
  const inp = inputs!
  const catalogTs = toDriverTS(row)
  const driverLabel = custom ? customName.trim() || 'Custom driver' : `${row.brand} ${row.model}`
  const ebpValue = ebp(ts)
  const ebpRead = ebpValue < 50 ? 'sealed-leaning' : ebpValue > 100 ? 'ported-leaning' : 'either alignment'
  const sens1W = model.refSpl1W
  const sens283 = sensitivity283(sens1W, ts.reOhm)
  const wattsLabel = `${Math.round(inp.driveW).toLocaleString('en-US')} W`
  const f3f10 = `${Number.isNaN(model.f3) ? '—' : model.f3.toFixed(1)} Hz / ${Number.isNaN(model.f10) ? '—' : model.f10.toFixed(1)} Hz`

  const s707Row = {
    label: 'Sealed for Qtc 0.707',
    value: sealed707Box
      ? `${(sealed707Box.vbL / LITERS_PER_FT3).toFixed(2)} ft³ · F3 ${Math.round(sealed707Box.fcHz)} Hz`
      : `n/a — Qts ${ts.qts.toFixed(2)} is already above 0.71`,
  }
  const headlineRows = [
    { label: 'Sensitivity', value: `${sens1W.toFixed(1)} dB 1W/1m · ${sens283.toFixed(1)} dB 2.83V` },
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
          {
            label: 'Port',
            value:
              !Number.isFinite(model.portLenIn) || model.portLenIn <= 0
                ? `${inp.portCount} × ${inp.portDiaIn}″ — n/a, area too large for this tuning`
                : `${inp.portCount} × ${inp.portDiaIn}″ (${Math.round(model.portAreaIn2)} in²) → ${model.portLenIn.toFixed(1)}″ long · peak ${model.portVelPeak.toFixed(1)} m/s${model.portVelPeak > 17 ? ' — chuffing risk' : ''}`,
          },
          {
            label: 'Port area for <17 m/s',
            value: `${Math.round(model.portIn2Rec)} in² at ${wattsLabel}`,
          },
        ]
      : []),
    {
      label: 'Max SPL @ 31.5 Hz',
      value: `${model.max315.spl.toFixed(1)} dB (${model.max315.displacementLimited ? 'excursion' : 'power'}-limited) at ${wattsLabel}`,
      accent: true,
    },
  ]

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
          caption: 'Anechoic half-space SPL, 1 W / 1 m — cabin gain not included',
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
          caption: `Peak cone excursion at ${wattsLabel} sine input`,
          legend: [...legendOf(model.excursion), { label: `Xmax ${ts.xmaxMm} mm`, color: SERIES.xmax }],
        },
        {
          id: 'gd',
          title: 'Group delay',
          caption: 'Group delay — time smear of the alignment; ported peaks near tuning',
          legend: legendOf(model.groupDelay),
        },
        ...(mode === 'ported'
          ? [
              {
                id: 'portvel',
                title: 'Port air velocity',
                caption: `Peak port air velocity at ${wattsLabel} through ${inp.portCount} × ${inp.portDiaIn}″ round port${inp.portCount > 1 ? 's' : ''}`,
                legend: [
                  ...legendOf(model.portVelocity),
                  { label: '17 m/s chuffing threshold', color: SERIES.xmax },
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
          ? `Ported — ${inp.vbFt3.toFixed(2)} ft³ net @ ${inp.fbHz.toFixed(1)} Hz · ${inp.portCount} × ${inp.portDiaIn}″ port${inp.portCount > 1 ? 's' : ''} · ${wattsLabel} input`
          : mode === 'sealed'
            ? `Sealed — ${inp.sealedVbFt3.toFixed(2)} ft³ · Qtc ${sealedNums.qtc.toFixed(2)} · ${wattsLabel} input`
            : `Infinite baffle · ${wattsLabel} input`
      await downloadModelReport({
        driverLabel,
        custom,
        modeSummary,
        rows: headlineRows.map((r) => ({ label: r.label, value: r.value })),
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
      {/* Controls — [driver + specs] · gap · [size · alignment · box] · spacer · [download] */}
      <View style={{ marginBottom: blockGap } as any}>
        <View
          style={
            {
              flexDirection: 'row',
              flexWrap: 'wrap',
              alignItems: 'flex-end',
              columnGap: groupGap,
              rowGap: controlsGap,
            } as any
          }
        >
          {/* Driver group: library picker + the not-in-our-library path */}
          <View
            style={
              { flexDirection: 'row', alignItems: 'flex-end', gap: controlsGap, flexShrink: 1, minWidth: 0 } as any
            }
          >
            <View style={{ minWidth: 300, flexShrink: 1 } as any}>
              <Dropdown
                label="Driver"
                value={custom ? '' : row.slug}
                options={filtered.map((r) => ({ label: `${r.brand} ${r.model}`, value: r.slug }))}
                onChange={(v) => selectDriver(v, filtered)}
              />
            </View>
            <View style={{ paddingBottom: 1 } as any}>
              <Button onPress={() => setModalOpen(true)}>Enter driver specs</Button>
            </View>
          </View>

          {/* Model group: filter + alignment + box controls */}
          <View
            style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: controlsGap } as any}
          >
            <View style={{ minWidth: 120 } as any}>
              <Dropdown
                label="Size"
                value={sizeFilter}
                options={[{ label: 'All sizes', value: 'all' }, ...sizes.map((s) => ({ label: `${s}″`, value: s }))]}
                onChange={(v) => {
                  setSizeFilter(v)
                  const pool = rows.filter((r) => v === 'all' || r.driver_size === v)
                  if (!custom && pool.length && !pool.some((r) => r.slug === slug)) selectDriver(pool[0].slug, pool)
                }}
              />
            </View>
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
                  label="Ported box"
                  unit="ft³"
                  min={0.15}
                  max={12}
                  step={0.05}
                  value={inp.vbFt3}
                  onChange={(v) => patch({ vbFt3: v })}
                  width={sliderWidth}
                  ariaLabel="Ported box net volume, cubic feet"
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
                label="Sealed box"
                unit="ft³"
                min={0.1}
                max={8}
                step={0.05}
                value={inp.sealedVbFt3}
                onChange={(v) => patch({ sealedVbFt3: v })}
                width={sliderWidth}
                ariaLabel="Sealed box net volume, cubic feet"
              />
            ) : null}
          </View>

          {/* Flush right */}
          <View style={{ marginLeft: 'auto', paddingBottom: 1 } as any}>
            <Button onPress={handleDownloadPdf} disabled={pdfBusy}>
              {pdfBusy ? 'Preparing PDF…' : 'Download PDF report'}
            </Button>
          </View>
        </View>

        {custom || pdfError ? (
          <View style={{ marginTop: controlsGap, gap: 6 } as any}>
            {custom ? (
              <Text style={{ fontFamily: fonts.mono, fontSize: labelSize, color: colors.accent } as any}>
                Modeling “{driverLabel}” — a custom driver, not in the NCSW catalog. Adjust it with “Enter
                driver specs”; pick a library driver to return.
              </Text>
            ) : null}
            {pdfError ? (
              <Text style={{ fontFamily: fonts.mono, fontSize: labelSize, color: colors.accent } as any}>
                PDF export failed — {pdfError}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>

      {/* Headline numbers */}
      <View style={{ marginBottom: blockGap } as any}>
        <DataList rows={headlineRows} />
      </View>

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
        caption="Anechoic half-space SPL, 1 W / 1 m — cabin gain not included"
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
        refLine={{ y: ts.xmaxMm, color: SERIES.xmax, label: `Xmax ${ts.xmaxMm} mm` }}
        caption={`Peak cone excursion at ${wattsLabel} sine input`}
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
            refLine={{ y: 17, color: SERIES.xmax, label: '17 m/s chuffing threshold' }}
            caption={`Peak port air velocity at ${wattsLabel} through ${inp.portCount} × ${inp.portDiaIn}″ round port${inp.portCount > 1 ? 's' : ''}`}
          />
        </>
      ) : null}

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
        Lumped-element Thiele/Small model computed live from catalog parameters. Box leakage QL = 7; port
        compression and voice-coil inductance losses not modeled. Port length assumes round flared-free ends
        (0.732 D end correction).
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
  const sealedDraft = sealedAlignment(draftTs, draft.sealedVbFt3 * LITERS_PER_FT3)
  const areaDraft = portAreaM2(draft)
  const portLenDraftIn = portLengthM(draft.vbFt3 * LITERS_PER_FT3, draft.fbHz, areaDraft, draft.portCount) / INCH_M
  const draftEdited = catalogTs ? !tsEquals(draftTs, catalogTs) : false

  const sectionStyle = {
    fontFamily: fonts.mono,
    fontWeight: '600',
    fontSize: sectionSize,
    color: FG_2,
    textTransform: 'uppercase',
    letterSpacing: 0.88,
    marginBottom: 10,
  } as any
  const derivedStyle = {
    fontFamily: fonts.mono,
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
              <NumberField label="Ported vol" unit="ft³" value={draft.vbFt3} onChange={set('vbFt3')} min={0.05} max={30} />
              <NumberField label="Tuning" unit="Hz" value={draft.fbHz} onChange={set('fbHz')} min={15} max={60} decimals={1} />
              <NumberField label="Sealed vol" unit="ft³" value={draft.sealedVbFt3} onChange={set('sealedVbFt3')} min={0.05} max={30} />
            </View>
            <Text style={derivedStyle}>
              Ported {`${(draft.vbFt3 * LITERS_PER_FT3).toFixed(0)} L`} · Sealed{' '}
              {`${(draft.sealedVbFt3 * LITERS_PER_FT3).toFixed(0)} L → Qtc ${sealedDraft.qtc.toFixed(2)}, Fc ${Math.round(sealedDraft.fcHz)} Hz`}
            </Text>
          </View>

          <View>
            <Text style={sectionStyle}>Port</Text>
            <View style={rowStyle}>
              <NumberField label="Diameter" unit="in" value={draft.portDiaIn} onChange={set('portDiaIn')} min={1} max={10} />
              <NumberField label="Ports" value={draft.portCount} onChange={set('portCount')} min={1} max={8} decimals={0} />
            </View>
            <Text style={derivedStyle}>
              {`${Math.round(areaDraft * 1550)} in² total → `}
              {Number.isFinite(portLenDraftIn) && portLenDraftIn > 0
                ? `${portLenDraftIn.toFixed(1)}″ long for ${draft.fbHz.toFixed(1)} Hz in the ported box`
                : 'no physical length lands this tuning — reduce area or raise tuning'}
            </Text>
          </View>

          <View>
            <Text style={sectionStyle}>Signal</Text>
            <View style={rowStyle}>
              <NumberField label="Input power" unit="W" value={draft.driveW} onChange={set('driveW')} min={1} max={20000} decimals={0} width={120} />
            </View>
            <Text style={derivedStyle}>
              {`${Math.sqrt(draft.driveW * draft.reOhm).toFixed(1)} V RMS into Re — drives the excursion, port-velocity, and max-SPL curves`}
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

// Label over a range input paired with a typeable value field — drag and the
// field tracks live; type and the model follows on commit. The range input is
// the same web escape hatch the frontier chart uses (no RN-web equivalent).
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
            fontFamily: fonts.mono,
            fontWeight: '600',
            fontSize,
            color: FG_2,
            textTransform: 'uppercase',
            letterSpacing: 0.88,
          } as any
        }
      >
        {label} <Text style={{ color: colors.inkFaint, textTransform: 'none' } as any}>{unit}</Text>
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 } as any}>
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
        <NumberField
          compact
          label={ariaLabel}
          value={value}
          onChange={onChange}
          min={min}
          max={max}
          decimals={decimals}
          width={64}
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
  exportId,
  registerCanvas,
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
