import React, { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, View } from 'react-native'
import Head from 'expo-router/head'
import { Link, useLocalSearchParams } from 'expo-router'
import {
  Card,
  Container,
  Dropdown,
  Eyebrow,
  Heading,
  Lead,
  Metaline,
  Modal,
  colors,
  fonts,
  fluid,
  radius,
  useFluidPx,
} from '@/ui'
import { SiteNav } from '@/components/SiteNav'
import { Footer } from '@/components/Footer'
import {
  bodyOptions,
  cabOptions,
  engineLabel,
  engineOptions,
  fetchAudioOptions,
  fetchMakes,
  fetchModels,
  fetchPackagesForVehicle,
  fetchDspPrices,
  fetchSystemFit,
  installedForSystem,
  fetchVehicleRows,
  fetchYears,
  narrowVehicleRows,
  powertrainLabel,
  seriesOptions,
  trimOptions,
  vehicleName,
  vehicleVariant,
  type AudioOption,
  type SystemFit,
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

const IS_WEB = Platform.OS === 'web'
const outerStyle: any = IS_WEB
  ? { height: '100dvh', flexDirection: 'column' }
  : { flex: 1, flexDirection: 'column' }

const ALIGNMENT_LABEL: Record<string, string> = {
  sealed: 'sealed box', ported: 'ported box', trunk_ib: 'no box', true_ib: 'no box',
}

// What each system is, in the customer's words (systems.id -> copy). A car
// page lists systems, one card each; the speaker, bass and DSP choices are made
// on the system's own page (Brett, 2026-11-27: one system with choices).
const SYSTEM_COPY: Record<number, { name: string; blurb: string }> = {
  1: { name: 'Two-way system', blurb: '6.5 in speakers in the front doors, tweeters up front, subwoofers in the trunk.' },
  2: { name: 'Under-seat system', blurb: '8 in woofers under the front seats, 4 in speakers in the doors, tweeters up front, subwoofers in the trunk.' },
  3: { name: 'Two-way with a front sub', blurb: 'The two-way system plus a 10 in sub under a front seat, so the bass sits up front with the music.' },
  4: { name: 'Two-way with two front subs', blurb: 'The two-way system plus two 8 in subs through the floor under the front seats, for centered bass up front.' },
  5: { name: 'Two-way with two sealed front subs', blurb: 'The two-way system plus two 8 in subs in sealed boxes under the front seats, no cutting into the floor.' },
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
  const [result, setResult] = useState<{ key: string; list: PackageSummary[] | 'error' } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchYears().then(setYears).catch(() => setError('Could not reach the catalog.'))
  }, [])

  // Arriving from the homepage's vehicle finder (/packages?year=&make=&model=):
  // start with that vehicle chosen. Applied a frame after the first paint, because
  // the page is rendered ahead of time without a query string and the first
  // render has to match it. The effects below then load makes, models and rows.
  const params = useLocalSearchParams<{ year?: string; make?: string; model?: string }>()
  const qYear = typeof params.year === 'string' ? params.year : ''
  const qMake = typeof params.make === 'string' ? params.make : ''
  const qModel = typeof params.model === 'string' ? params.model : ''
  useEffect(() => {
    if (!qYear) return
    const r = requestAnimationFrame(() => {
      setYear(qYear)
      if (qMake) setMake(qMake)
      if (qMake && qModel) setModel(qModel)
    })
    return () => cancelAnimationFrame(r)
  }, [qYear, qMake, qModel])

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

  // ---- factory audio -------------------------------------------------------
  // Not an identity step: by the time it is asked the vehicle is already
  // resolved, so it narrows nothing. It asks how THIS owner's car was equipped,
  // which is not in the VIN and is not sold by any data vendor — the owner is
  // the only source. Same request-key pattern as the package fetch above.
  const audioKey = vehicle ? vehicle.vehicle_id : ''
  const [audio, setAudio] = useState<{ key: string; list: AudioOption[] } | null>(null)
  // The pick and the open help both carry the vehicle they belong to, so they
  // fall away on their own when the vehicle changes. No reset effect.
  const [audioPick, setAudioPick] = useState({ key: '', label: '' })
  const [helpFor, setHelpFor] = useState('')
  useEffect(() => {
    if (!audioKey) return
    let live = true
    fetchAudioOptions(audioKey)
      .then((list) => { if (live) setAudio({ key: audioKey, list }) })
      .catch(() => { if (live) setAudio({ key: audioKey, list: [] }) })
    return () => { live = false }
  }, [audioKey])
  const audioOpts = audio && audio.key === audioKey ? audio.list : []
  // Hidden, not greyed, when the car only ever had one system: the condition is
  // permanent for this vehicle, and a disabled control would imply the customer
  // has something left to do. (Nielsen: disable when temporary, hide when not.)
  const needAudio = audioOpts.length > 1
  const picked = audioPick.key === audioKey ? audioPick.label : ''
  const chosenAudio = audioOpts.find((o) => o.label === picked) ?? null
  const helpOpen = helpFor === audioKey && audioKey !== ''

  // The car's factory system decides each build's DSP. When the choices cannot
  // be read, a car that only ever had one system (one picker label) answers
  // from that system.
  const singleSystemId = vehicle && vehicle.factory_audio_system && !(vehicle.branded_system_name ?? '').includes('|')
    ? vehicle.factory_audio_system
    : ''
  const [sysFit, setSysFit] = useState<{ key: string; fit: SystemFit | null } | null>(null)
  useEffect(() => {
    if (!singleSystemId) return
    let live = true
    fetchSystemFit(singleSystemId)
      .then((fit) => { if (live) setSysFit({ key: singleSystemId, fit }) })
      .catch(() => { if (live) setSysFit({ key: singleSystemId, fit: null }) })
    return () => { live = false }
  }, [singleSystemId])
  const singleFit = singleSystemId && sysFit?.key === singleSystemId ? sysFit.fit : null
  // The system that decides each build's DSP: the owner's choice, the car's only
  // system, or none yet (then every build shows its own DSP and price).
  const fit: SystemFit | null = chosenAudio?.fit ?? (audioOpts.length === 1 ? audioOpts[0].fit : audioOpts.length ? null : singleFit)
  const [dspPrices, setDspPrices] = useState<Record<string, number>>({})
  useEffect(() => {
    let live = true
    fetchDspPrices().then((p) => { if (live) setDspPrices(p) }).catch(() => {})
    return () => { live = false }
  }, [])

  // ---- rear seat -----------------------------------------------------------
  // Where a folding rear seat was an option on the trim, only the owner knows
  // whether theirs folds, and that decides the trunk installations (trunk IB and
  // baffle sealed need the opening behind a folding seat). Same keyed-pick
  // pattern as the factory system.
  const needSeat = !!vehicle && vehicle.vehicle_category === 'trunk' && vehicle.body_style !== 'Convertible'
    && vehicle.rear_seat_fold === 'varies'
  const [seatPick, setSeatPick] = useState({ key: '', value: '' })
  const seat = needSeat && seatPick.key === audioKey ? seatPick.value : ''
  const carForFit = useMemo(
    () => (vehicle && seat ? { ...vehicle, rear_seat_fold: seat } : vehicle),
    [vehicle, seat],
  )

  // One request is one key. Holding the answer against the key it was asked for
  // makes `items` and `loading` derived rather than flags an effect has to keep
  // in step — and it makes a slow reply for a vehicle you have already moved on
  // from inert, instead of letting it overwrite the list you are looking at.
  // A vehicle we do not build for asks nothing: the render branches on
  // substage_not_offered before it reads either of these.
  const reqKey = vehicle && !vehicle.substage_not_offered
    ? [vehicle.vehicle_id, seat].join('|')
    : ''
  const answered = result && result.key === reqKey ? result : null
  const items = answered && answered.list !== 'error' ? answered.list : null
  const listError = answered && answered.list === 'error' ? 'Could not load packages.' : ''
  const loading = !!reqKey && !answered

  useEffect(() => {
    if (!reqKey || !carForFit) return
    let live = true
    fetchPackagesForVehicle(carForFit)
      .then((list) => { if (live) setResult({ key: reqKey, list }) })
      .catch(() => { if (live) setResult({ key: reqKey, list: 'error' }) })
    return () => { live = false }
  }, [reqKey, carForFit])


  // One card per system: its lowest installed price for this car, the variant
  // that price belongs to (the card opens it), and how many choices it holds.
  const systems = useMemo(() => {
    const by = new Map<number | null, PackageSummary[]>()
    for (const p of items ?? []) {
      const k = p.system ?? null
      by.set(k, [...(by.get(k) ?? []), p])
    }
    const price = (p: PackageSummary) => Number(installedForSystem(p, fit, dspPrices) ?? p.price_installed ?? Infinity)
    return [...by.entries()].map(([system, list]) => {
      const cheapest = list.reduce((a, b) => (price(b) < price(a) ? b : a))
      const basses = [...new Set(list.map((p) =>
        `${p.bass_name ?? ''}${p.bass_alignment && ALIGNMENT_LABEL[p.bass_alignment] ? `, ${ALIGNMENT_LABEL[p.bass_alignment]}` : ''}`))]
      return {
        system, cheapest, from: price(cheapest), basses,
        fronts: new Set(list.map((p) => p.front_name)).size,
        dsps: new Set(list.map((p) => p.dsp_name)).size,
      }
    }).sort((a, b) => a.from - b.from)
  }, [items, fit, dspPrices])

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
        <SiteNav />
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

              {/* Factory audio. Not an identity step — the vehicle is already
                  resolved by the row above; this asks how THIS car was equipped,
                  which only its owner can answer. Sits on its own line with the
                  help trigger beside it, because it is the one question that
                  needs instructions. */}
              {needAudio ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap, zIndex: 25 }}>
                  <View style={{ minWidth: 240, flexGrow: 1, maxWidth: 420 }}>
                    <Dropdown
                      label="Factory sound system"
                      value={picked}
                      options={audioOpts.map((o) => ({ label: o.label, value: o.label }))}
                      onChange={(v) => setAudioPick({ key: audioKey, label: v })}
                      placeholder="Select system"
                    />
                  </View>
                  <Pressable
                    onPress={() => setHelpFor(audioKey)}
                    accessibilityRole="button"
                    accessibilityLabel="How do I tell which sound system I have?"
                    // 44px minimum touch target, and the label carries the icon:
                    // a bare glyph is discoverable only to someone already looking
                    // for it, and this is the one control the answer depends on.
                    style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10 }}
                  >
                    <Text style={{ fontFamily: fonts.body, fontSize: 15, color: colors.accent }}>?</Text>
                    <Text style={{ fontFamily: fonts.body, fontSize: 15, color: colors.accent, textDecorationLine: 'underline' }}>
                      How do I tell?
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              {needSeat ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap, zIndex: 24 }}>
                  <View style={{ minWidth: 240, flexGrow: 1, maxWidth: 420 }}>
                    <Dropdown
                      label="Does your rear seat fold down?"
                      value={seat}
                      options={[{ label: 'Yes, it folds down', value: 'folds' }, { label: 'No, it doesn’t fold', value: 'fixed' }]}
                      onChange={(v) => setSeatPick({ key: audioKey, value: v })}
                      placeholder="Select"
                    />
                  </View>
                </View>
              ) : null}

              <Modal open={helpOpen} onClose={() => setHelpFor('')} title="Which sound system is in your car?">
                <Modal.Body>
                  <Text style={{ fontFamily: fonts.body, fontSize: 15, lineHeight: 23, color: colors.gray, marginBottom: 18 }}>
                    {vehicleLabel ? `A ${vehicleLabel} could be ordered with more than one factory system, and they are not interchangeable. Find yours below, then choose it above.` : ''}
                  </Text>
                  {audioOpts.map((o) => (
                    <View key={o.label} style={{ marginBottom: 20 }}>
                      <Text style={{ fontFamily: fonts.display, fontSize: 16, color: colors.ink, marginBottom: 6 }}>
                        {o.label}
                      </Text>
                      <Text style={{ fontFamily: fonts.body, fontSize: 15, lineHeight: 23, color: colors.gray }}>
                        {o.picker_help ?? 'Look for the system name on the speaker grilles, and on the face of the radio. If there is no name anywhere, the car has the standard system.'}
                      </Text>
                    </View>
                  ))}
                </Modal.Body>
              </Modal>

              {vehicle ? (
                <View style={{ gap }}>
                  <Metaline
                    items={[
                      { text: vehicleLabel, tone: 'ink' },
                      ...(variantLabel ? [variantLabel] : []),
                      ...(vehicle.powertrain && vehicle.powertrain !== 'ICE' ? [powertrainLabel(vehicle.powertrain)] : []),
                      ...(vehicle.body_style ? [vehicle.body_style] : []),
                      ...(vehicle.luggage_volume_cuft ? [`${vehicle.luggage_volume_cuft} ft³ cargo`] : []),
                      // Once the owner has answered, say what their answer means
                      // for the install. Until then the vehicle rolls up to
                      // `option` and we say nothing rather than guess.
                      ...(chosenAudio && (chosenAudio.has_fullrange === 'true' || chosenAudio.has_fullrange === 'false')
                        ? [chosenAudio.has_fullrange === 'false'
                            ? `${chosenAudio.label} · signal reconstructed ahead of the DSP`
                            : `${chosenAudio.label} · full-range output, tapped directly`]
                        : []),
                    ]}
                  />
                  {vehicle.substage_not_offered ? (
                    <Card>
                      <Card.Body gap={8}>
                        <Text style={{ fontFamily: fonts.display, fontSize: 18, color: colors.ink }}>
                          We don’t install substages in the {vehicleLabel}.
                        </Text>
                        <Text style={{ fontFamily: fonts.body, fontSize: 14, color: colors.gray }}>
                          {vehicle.substage_not_offered_reason ??
                            'There is no space in this truck for a full-frame subwoofer enclosure, and we do not sell shallow-driver stages.'}
                        </Text>
                      </Card.Body>
                    </Card>
                  ) : needAudio && !chosenAudio ? (
                    // The car's factory system decides the DSP and head unit
                    // choices, so a system is not shown until the owner says
                    // which one the car has.
                    <Card>
                      <Card.Body><Text style={{ fontFamily: fonts.body, fontSize: 14, color: colors.gray }}>
                        Choose your factory sound system above to see the systems for your {vehicleLabel}.
                      </Text></Card.Body>
                    </Card>
                  ) : needSeat && !seat ? (
                    // Whether the seat folds decides how the bass can go in the
                    // trunk, so the list waits for the answer.
                    <Card>
                      <Card.Body><Text style={{ fontFamily: fonts.body, fontSize: 14, color: colors.gray }}>
                        Tell us whether your rear seat folds down to see the systems for your {vehicleLabel}.
                      </Text></Card.Body>
                    </Card>
                  ) : loading ? (
                    <ActivityIndicator color={colors.ink} />
                  ) : systems.length > 0 ? (
                    <View style={{ gap }}>
                      {systems.map((g) => {
                        const copy = g.system != null ? SYSTEM_COPY[g.system] : undefined
                        const p = g.cheapest
                        const counts = [
                          g.fronts > 1 ? `${g.fronts} front speaker choices` : null,
                          g.basses.length > 1 ? `${g.basses.length} bass choices` : null,
                          g.dsps > 1 ? `${g.dsps} DSP choices` : null,
                        ].filter(Boolean) as string[]
                        return (
                          <Link
                            key={g.system ?? p.id}
                            href={`/packages/detail?sku=${encodeURIComponent(p.sku ?? String(p.id))}&vid=${encodeURIComponent(vehicle.vehicle_id)}${fit?.id ? `&sys=${encodeURIComponent(fit.id)}` : ''}${seat ? `&seat=${seat}` : ''}` as any}
                            asChild
                          >
                            <Pressable>
                              <Card>
                                <Card.Body gap={8}>
                                  <Text style={{ fontFamily: fonts.display, fontSize: 20, color: colors.ink }}>
                                    {copy?.name ?? `System ${g.system ?? ''}`}
                                  </Text>
                                  <Metaline items={[`from $${g.from.toLocaleString()} installed`, ...counts]} />
                                  {copy ? (
                                    <Text style={{ fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.gray }}>{copy.blurb}</Text>
                                  ) : null}
                                  <Text style={{ fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.gray }}>
                                    Bass: {g.basses.join('; ')}
                                  </Text>
                                </Card.Body>
                              </Card>
                            </Pressable>
                          </Link>
                        )
                      })}
                    </View>
                  ) : items ? (
                    <Card>
                      <Card.Body gap={8}>
                        <Text style={{ fontFamily: fonts.display, fontSize: 18, color: colors.ink }}>
                          Packages for the {vehicleLabel} are being engineered.
                        </Text>
                        <Text style={{ fontFamily: fonts.body, fontSize: 14, color: colors.gray }}>
                          Our catalog is curated car by car — every package is designed against this
                          vehicle’s factory speaker locations and cargo dimensions, not adapted from a
                          generic kit. Check back soon, or call us and we’ll spec yours first.
                        </Text>
                      </Card.Body>
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
