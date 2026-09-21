import React, { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, View } from 'react-native'
import Head from 'expo-router/head'
import { Link } from 'expo-router'
import {
  Card,
  Container,
  Dropdown,
  Eyebrow,
  FilterChipGroup,
  Heading,
  Lead,
  Metaline,
  colors,
  fonts,
  fluid,
  radius,
  useFluidPx,
} from '@/ui'
import { SiteNav, type NavLinkItem } from '@/components/SiteNav'
import { Footer } from '@/components/Footer'
import {
  bodyOptions,
  cabOptions,
  engineLabel,
  engineOptions,
  fetchMakes,
  fetchModels,
  fetchPackagesForVehicle,
  fetchVehicleRows,
  fetchYears,
  narrowVehicleRows,
  powertrainLabel,
  seriesOptions,
  trimOptions,
  vehicleName,
  vehicleVariant,
  type PackageSummary,
  type Vehicle,
} from '@/lib/packages'

// PLP — the package listing experience. Vehicle-first: year -> make -> model
// -> series -> body -> cab -> trim -> engine resolves the vehicle, then the
// packages that fit it, filtered. Series and cab appear only when the model has
// them (trucks: Silverado 1500/2500HD, Ram 1500, F-250 Super Duty; SuperCab/Crew
// Cab), so a car still walks year -> make -> model -> body -> trim. Body appears
// when a model was sold in more than one shape, because a sedan and a wagon have
// different cargo dimensions — and on the pre-1990 cars, whose European engine
// variants were collapsed away, body is the only thing left separating the rows.
// Body and cab never both appear: cars have bodies, trucks have cabs. Trims are
// listed per cab because a cab is sold in only some of a model's trims. Engine
// appears only when the same trim is sold with more than one powertrain
// (Maverick hybrid vs EcoBoost, a PHEV twin of a gas trim). The NCSW Picks filter
// defaults ON: the curated offering is large by design, and the picks filter
// is what narrows it to a browsable set (two-round model). While the packages
// collection is being curated the list renders its honest empty state — the
// picker and wiring are live against Directus either way.

const NAV_LINKS: NavLinkItem[] = [
  ['Packages', '/packages'],
  ['Subwoofers', '/methodology/subwoofers'],
  ['Install Types', '/'],
  ['Editorial', '/'],
  ['About', '/'],
  ['Location', '/#location'],
]

const IS_WEB = Platform.OS === 'web'
const outerStyle: any = IS_WEB
  ? { height: '100dvh', flexDirection: 'column' }
  : { flex: 1, flexDirection: 'column' }

const TOPOLOGIES = ['all', '2-way', '2-way+', '3-way+', 'wideband', 'wideband+']
const ALIGNMENTS = ['all', 'sealed', 'ported', 'trunk_ib', 'true_ib']
const ALIGNMENT_LABEL: Record<string, string> = {
  all: 'All', sealed: 'Sealed', ported: 'Ported', trunk_ib: 'Trunk IB', true_ib: 'True IB',
}

export default function PackagesScreen() {
  const [years, setYears] = useState<string[]>([])
  const [makes, setMakes] = useState<string[]>([])
  const [models, setModels] = useState<string[]>([])
  const [year, setYear] = useState('')
  const [make, setMake] = useState('')
  const [model, setModel] = useState('')
  const [rows, setRows] = useState<Vehicle[]>([])
  const [series, setSeries] = useState('')
  const [body, setBody] = useState('')
  const [cab, setCab] = useState('')
  const [trim, setTrim] = useState('')
  const [engine, setEngine] = useState('')
  const [show, setShow] = useState('NCSW Picks')
  const [topology, setTopology] = useState('all')
  const [alignment, setAlignment] = useState('all')
  const [result, setResult] = useState<{ key: string; list: PackageSummary[] | 'error' } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchYears().then(setYears).catch(() => setError('Could not reach the catalog.'))
  }, [])

  // Choosing a step clears every step below it. This lives in the handlers rather
  // than in effects because a selection is the only thing that changes these —
  // there is no external state to synchronise with, and doing it here means the
  // cleared steps are gone in the same commit as the new selection.
  function pickYear(v: string) {
    setYear(v); setMakes([]); setModels([]); setRows([])
    setMake(''); setModel(''); setSeries(''); setBody(''); setCab(''); setTrim(''); setEngine('')
  }
  function pickMake(v: string) {
    setMake(v); setModels([]); setRows([])
    setModel(''); setSeries(''); setBody(''); setCab(''); setTrim(''); setEngine('')
  }
  function pickModel(v: string) {
    setModel(v); setRows([])
    setSeries(''); setBody(''); setCab(''); setTrim(''); setEngine('')
  }
  function pickSeries(v: string) { setSeries(v); setBody(''); setCab(''); setTrim(''); setEngine('') }
  function pickBody(v: string) { setBody(v); setCab(''); setTrim(''); setEngine('') }
  function pickCab(v: string) { setCab(v); setTrim(''); setEngine('') }
  function pickTrim(v: string) { setTrim(v); setEngine('') }

  useEffect(() => {
    if (year) fetchMakes(year).then(setMakes).catch(() => setError('Could not load makes.'))
  }, [year])

  useEffect(() => {
    if (year && make) fetchModels(year, make).then(setModels).catch(() => setError('Could not load models.'))
  }, [year, make])

  useEffect(() => {
    if (year && make && model) {
      fetchVehicleRows(year, make, model)
        .then(setRows)
        .catch(() => setError('Could not resolve that vehicle.'))
    }
  }, [year, make, model])

  // The steps after model are derived from the rows: a step is shown only when
  // the rows offer a choice there, and a single-option trim is taken as read.
  const seriesOpts = useMemo(() => seriesOptions(rows), [rows])
  const needSeries = seriesOpts.length > 0
  // Body style — sedan vs wagon vs coupe carry different cargo dimensions, and on
  // the pre-1990 rows body is the ONLY thing separating them now that their
  // European engine variants have been collapsed away. Measured across 9,870
  // model-years: body and cab never both offer a choice, so these two steps never
  // compete (cars have bodies, trucks have cabs).
  const bodyOpts = useMemo(
    () => (needSeries && !series ? [] : bodyOptions(rows, { series: series || undefined })),
    [rows, needSeries, series],
  )
  const needBody = bodyOpts.length > 1
  const cabOpts = useMemo(
    () => (needSeries && !series) || (needBody && !body)
      ? []
      : cabOptions(rows, { series: series || undefined, body: body || undefined }),
    [rows, needSeries, series, needBody, body],
  )
  // A model sold in one cab (Maverick, Ridgeline) skips the Cab step; the
  // single cab is taken as read the way a single trim is.
  const needCab = cabOpts.length > 1
  const trimOpts = useMemo(
    () => (needSeries && !series) || (needBody && !body) || (needCab && !cab)
      ? []
      : trimOptions(rows, { series: series || undefined, body: body || undefined, cab: cab || undefined }),
    [rows, needSeries, series, needBody, body, needCab, cab],
  )
  const needTrim = trimOpts.length > 1
  const pickedTrim = needTrim ? trim : trimOpts[0] ?? ''
  // The Engine step waits on the steps before it, not on a trim being present:
  // the pre-1990 rows have no trim to offer and are told apart by engine alone,
  // and a modern vehicle with one trim still needs its hybrid/EcoBoost choice.
  const engineOpts = useMemo(
    () => (needSeries && !series) || (needBody && !body) || (needCab && !cab) || (needTrim && !trim)
      ? []
      : engineOptions(rows, {
          series: series || undefined,
          body: body || undefined,
          cab: cab || undefined,
          trim: pickedTrim || undefined,
        }),
    [rows, needSeries, series, needBody, body, needCab, cab, needTrim, trim, pickedTrim],
  )
  const needEngine = engineOpts.length > 1

  // The chosen row is not state — it is whatever the picks narrow the rows down
  // to, so it is derived. Null until every step the vehicle needs is answered.
  const vehicle = useMemo<Vehicle | null>(() => {
    if (!rows.length) return null
    if (needSeries && !series) return null
    if (needBody && !body) return null
    if (needCab && !cab) return null
    if (needTrim && !trim) return null
    if (needEngine && !engine) return null
    return narrowVehicleRows(rows, {
      series: series || undefined,
      body: body || undefined,
      cab: cab || undefined,
      trim: pickedTrim || undefined,
      engine: engine || undefined,
    })[0] ?? null
  }, [rows, series, body, cab, trim, engine, needSeries, needBody, needCab, needTrim, needEngine, pickedTrim])

  // One request is one key. Holding the answer against the key it was asked for
  // makes `items` and `loading` derived rather than flags an effect has to keep
  // in step — and it makes a slow reply for a vehicle you have already moved on
  // from inert, instead of letting it overwrite the list you are looking at.
  // A vehicle we do not build for asks nothing: the render branches on
  // substage_not_offered before it reads either of these.
  const reqKey = vehicle && !vehicle.substage_not_offered
    ? [vehicle.vehicle_id, show, topology, alignment].join('|')
    : ''
  const answered = result && result.key === reqKey ? result : null
  const items = answered && answered.list !== 'error' ? answered.list : null
  const listError = answered && answered.list === 'error' ? 'Could not load packages.' : ''
  const loading = !!reqKey && !answered

  useEffect(() => {
    if (!reqKey || !vehicle) return
    let live = true
    fetchPackagesForVehicle(vehicle, {
      ncswPicksOnly: show === 'NCSW Picks',
      topology: topology === 'all' ? undefined : topology,
      bassAlignment: alignment === 'all' ? undefined : alignment,
    })
      .then((list) => { if (live) setResult({ key: reqKey, list }) })
      .catch(() => { if (live) setResult({ key: reqKey, list: 'error' }) })
    return () => { live = false }
  }, [reqKey, vehicle, show, topology, alignment])

  const gap = useFluidPx(fluid(20, 14))
  const padY = useFluidPx(fluid(56, 32))

  const vehicleLabel = vehicle ? vehicleName(vehicle) : ''
  const variantLabel = vehicle ? vehicleVariant(vehicle) : ''

  return (
    <>
      <Head>
        <title>Packages — North Coast Soundworks</title>
        <meta name="description" content="Engineered sound system packages, built for your exact vehicle." />
      </Head>
      <View style={outerStyle}>
        <SiteNav links={NAV_LINKS} />
        <ScrollView style={{ flex: 1, backgroundColor: colors.white }} contentContainerStyle={{ flexGrow: 1 }}>
          <Container>
            <View style={{ paddingVertical: padY, gap } as any}>
              <Eyebrow>Packages</Eyebrow>
              <Heading level="h2">Built for your exact car.</Heading>
              <Lead>
                Every package is a complete, engineered system — front stage, substage,
                amplification, and processing matched to your vehicle’s real installation
                locations and cargo space. Pick your car; the systems that belong in it are
                already designed.
              </Lead>

              {/* vehicle picker */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap, zIndex: 30 }}>
                <View style={{ minWidth: 140, flexGrow: 1 }}>
                  <Dropdown label="Year" value={year} options={years} onChange={pickYear} placeholder="Select year" />
                </View>
                <View style={{ minWidth: 180, flexGrow: 2 }}>
                  <Dropdown label="Make" value={make} options={makes} onChange={pickMake} placeholder="Select make" disabled={!year} />
                </View>
                <View style={{ minWidth: 200, flexGrow: 2 }}>
                  <Dropdown label="Model" value={model} options={models} onChange={pickModel} placeholder="Select model" disabled={!make} />
                </View>
                {needSeries ? (
                  <View style={{ minWidth: 140, flexGrow: 1 }}>
                    <Dropdown label="Series" value={series} options={seriesOpts} onChange={pickSeries} placeholder="Select series" />
                  </View>
                ) : null}
                {needBody ? (
                  <View style={{ minWidth: 160, flexGrow: 1 }}>
                    <Dropdown label="Body" value={body} options={bodyOpts} onChange={pickBody} placeholder="Select body" disabled={needSeries && !series} />
                  </View>
                ) : null}
                {needCab ? (
                  <View style={{ minWidth: 160, flexGrow: 1 }}>
                    <Dropdown label="Cab" value={cab} options={cabOpts} onChange={pickCab} placeholder="Select cab" disabled={needBody && !body} />
                  </View>
                ) : null}
                {needTrim ? (
                  <View style={{ minWidth: 160, flexGrow: 1 }}>
                    <Dropdown label="Trim" value={trim} options={trimOpts} onChange={pickTrim} placeholder="Select trim" disabled={needCab && !cab} />
                  </View>
                ) : null}
                {needEngine ? (
                  <View style={{ minWidth: 160, flexGrow: 1 }}>
                    <Dropdown
                      label="Engine"
                      value={engine}
                      options={engineOpts.map((e) => ({ label: engineLabel(e), value: e }))}
                      onChange={setEngine}
                      placeholder="Select engine"
                      disabled={needTrim && !trim}
                    />
                  </View>
                ) : null}
              </View>

              {vehicle ? (
                <View style={{ gap }}>
                  <Metaline
                    items={[
                      { text: vehicleLabel, tone: 'ink' },
                      ...(variantLabel ? [variantLabel] : []),
                      ...(vehicle.powertrain && vehicle.powertrain !== 'ICE' ? [powertrainLabel(vehicle.powertrain)] : []),
                      ...(vehicle.body_style ? [vehicle.body_style] : []),
                      ...(vehicle.luggage_volume_cuft ? [`${vehicle.luggage_volume_cuft} ft³ cargo`] : []),
                    ]}
                  />
                  {vehicle.substage_not_offered ? null : (
                    <>
                      <FilterChipGroup
                        label="Show"
                        value={show}
                        options={['NCSW Picks', 'All packages']}
                        pick="NCSW Picks"
                        onChange={setShow}
                      />
                      <FilterChipGroup label="Topology" value={topology} options={TOPOLOGIES} onChange={setTopology}
                        renderOption={(o) => (o === 'all' ? 'All' : o)} />
                      <FilterChipGroup label="Bass" value={alignment} options={ALIGNMENTS} onChange={setAlignment}
                        renderOption={(o) => ALIGNMENT_LABEL[o] ?? o} />
                    </>
                  )}

                  {vehicle.substage_not_offered ? (
                    <Card>
                      <View style={{ gap: 8 }}>
                        <Text style={{ fontFamily: fonts.display, fontSize: 18, color: colors.ink }}>
                          We don’t install substages in the {vehicleLabel}.
                        </Text>
                        <Text style={{ fontFamily: fonts.body, fontSize: 14, color: colors.gray }}>
                          {vehicle.substage_not_offered_reason ??
                            'There is no space in this truck for a full-frame subwoofer enclosure, and we do not sell shallow-driver stages.'}
                        </Text>
                      </View>
                    </Card>
                  ) : loading ? (
                    <ActivityIndicator color={colors.ink} />
                  ) : items && items.length > 0 ? (
                    <View style={{ gap }}>
                      {items.map((p) => (
                        <Link
                          key={p.sku ?? p.id}
                          href={`/packages/detail?sku=${encodeURIComponent(p.sku ?? String(p.id))}&vid=${encodeURIComponent(vehicle.vehicle_id)}` as any}
                          asChild
                        >
                          <Pressable>
                            <Card>
                              <View style={{ gap: 6 }}>
                                <Text style={{ fontFamily: fonts.display, fontSize: 18, color: colors.ink }}>
                                  {p.display_name ?? p.sku}
                                </Text>
                                <Metaline
                                  items={[p.topology, p.bass_alignment ? ALIGNMENT_LABEL[p.bass_alignment] : null,
                                    p.price_installed != null ? `$${Number(p.price_installed).toLocaleString()} installed` : null]
                                    .filter(Boolean) as string[]}
                                />
                                {p.summary ? (
                                  <Text style={{ fontFamily: fonts.body, fontSize: 14, color: colors.gray }}>{p.summary}</Text>
                                ) : null}
                              </View>
                            </Card>
                          </Pressable>
                        </Link>
                      ))}
                    </View>
                  ) : items ? (
                    <Card>
                      <View style={{ gap: 8 }}>
                        <Text style={{ fontFamily: fonts.display, fontSize: 18, color: colors.ink }}>
                          Packages for the {vehicleLabel} are being engineered.
                        </Text>
                        <Text style={{ fontFamily: fonts.body, fontSize: 14, color: colors.gray }}>
                          Our catalog is curated car by car — every package is designed against this
                          vehicle’s factory speaker locations and cargo dimensions, not adapted from a
                          generic kit. Check back soon, or call us and we’ll spec yours first.
                        </Text>
                      </View>
                    </Card>
                  ) : null}
                </View>
              ) : (
                <Metaline items={['Select your vehicle to see the systems designed for it.']} />
              )}

              {error || listError ? (
                <Text style={{ fontFamily: fonts.body, fontSize: 14, color: colors.accent }}>{error || listError}</Text>
              ) : null}
            </View>
          </Container>
          <Footer />
        </ScrollView>
      </View>
    </>
  )
}
