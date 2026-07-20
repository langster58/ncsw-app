import React, { useEffect, useState } from 'react'
import { ActivityIndicator, Platform, ScrollView, Text, View, useWindowDimensions } from 'react-native'
import Head from 'expo-router/head'
import { useLocalSearchParams } from 'expo-router'
import {
  Button,
  Container,
  Eyebrow,
  Heading,
  Lead,
  FullWidthCopyContext,
  Metaline,
  PriceSummary,
  SpecStrip,
  type SpecCell,
  colors,
  fonts,
  type,
  useFluidPx,
} from '@/ui'
import { SiteNav, type NavLinkItem } from '@/components/SiteNav'
import { Footer } from '@/components/Footer'
import { Band, PdpSection, PhotoSlot, SysRow, useVal } from '@/components/PdpBlocks'
import {
  fetchInstallationRows,
  fetchPackageBySku,
  fetchPackageComponents,
  fetchVehicleById,
  type InstallationRow,
  type PackageDetail,
  type ResolvedComponent,
  type VehicleDetail,
} from '@/lib/packages'

// The WIRED product-detail page: /packages/detail?sku=...&vid=...
// Renders a real package row — component slots resolved to their product
// collections, prices from the package's computed ledger, vehicle blocks from
// the vehicle row. The /pdp route remains the design comp; this page is the
// template fed by data. Copy here is generated at the grain the data supports
// (package template + vehicle-generated lines); platform-grain paragraphs
// (factory_integration) join when that wiring lands.

const NAV_LINKS: NavLinkItem[] = [
  ['Packages', '/packages'],
  ['Subwoofers', '/methodology/subwoofers'],
  ['Install Types', '/'],
  ['Editorial', '/'],
  ['About', '/'],
  ['Location', '/#location'],
]
const PHONE = '(216) 555-0114'
const IS_WEB = Platform.OS === 'web'
const outerStyle: any = IS_WEB
  ? { height: '100dvh', flexDirection: 'column' }
  : { flex: 1, flexDirection: 'column' }

const ALIGNMENT_LABEL: Record<string, string> = {
  sealed: 'Sealed', ported: 'Ported', trunk_ib: 'Trunk IB', true_ib: 'True IB',
}

function money(v: number | string | null | undefined): string {
  if (v == null) return ''
  return `$${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// Product photo that degrades to the pending-photo slot when the catalog's
// image_filename has no file behind it (the library is still being shot).
function SafeMedia({ src, alt }: { src: string | null; alt: string }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed || !IS_WEB) return <PhotoSlot label={'Product photo\npending'} />
  return (
    <View
      style={{
        aspectRatio: 4 / 3,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 8,
        backgroundColor: colors.figBg,
        overflow: 'hidden',
      }}
    >
      {React.createElement('img', {
        src,
        alt,
        onError: () => setFailed(true),
        style: { display: 'block', width: '100%', height: '100%', objectFit: 'cover' },
      })}
    </View>
  )
}

function componentTitle(c: ResolvedComponent): string {
  if (c.row?.brand || c.row?.model) return [c.row?.brand, c.row?.model].filter(Boolean).join(' ')
  if (c.collection === 'sub_enclosures' && c.row) {
    const t = String(c.row.type ?? 'sealed')
    return `${t.charAt(0).toUpperCase()}${t.slice(1)} enclosure · ${c.row.size ?? ''}"`
  }
  return c.slug
}

function componentMeta(c: ResolvedComponent): string[] {
  const bits: string[] = [c.role]
  if (c.qty > 1) bits.push(`×${c.qty}`)
  if (c.row?.rms_watts) bits.push(`${c.row.rms_watts} W RMS`)
  if (c.row?.rms_power) bits.push(`${c.row.rms_power} W`)
  if (c.row?.channels) bits.push(`${c.row.channels}-channel`)
  if (c.row?.snr) bits.push(`${c.row.snr} dB SNR`)
  if (c.row?.tier) bits.push(String(c.row.tier))
  if (c.collection === 'sub_enclosures' && c.row?.volume_cuft) bits.push(`${c.row.volume_cuft} ft³ net`)
  return bits
}

export default function PackageDetailScreen() {
  const params = useLocalSearchParams<{ sku?: string; vid?: string }>()
  const sku = typeof params.sku === 'string' ? params.sku : ''
  const vid = typeof params.vid === 'string' ? params.vid : ''

  const [pkg, setPkg] = useState<PackageDetail | null>(null)
  const [components, setComponents] = useState<ResolvedComponent[]>([])
  const [vehicle, setVehicle] = useState<VehicleDetail | null>(null)
  const [install, setInstall] = useState<InstallationRow[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading')

  useEffect(() => {
    if (!sku) { setState('missing'); return }
    let live = true
    setState('loading')
    Promise.all([
      fetchPackageBySku(sku),
      vid ? fetchVehicleById(vid) : Promise.resolve(null),
      fetchInstallationRows().catch(() => []),
    ])
      .then(async ([p, v, inst]) => {
        if (!live) return
        if (!p) { setState('missing'); return }
        setPkg(p); setVehicle(v); setInstall(inst)
        const comps = await fetchPackageComponents(p)
        if (!live) return
        setComponents(comps)
        setState('ready')
      })
      .catch(() => live && setState('error'))
    return () => { live = false }
  }, [sku, vid])

  // All fluid values hoisted here — hooks must never sit inside the
  // conditional branches below (loading/ready changes the hook count).
  const { width } = useWindowDimensions()
  const narrow = width <= 900
  const gap = useVal(28, 22)
  const heroTop = useVal(80, 52)
  const priceSize = useFluidPx(type.h4)
  const metaSize = useFluidPx(type.meta)
  const smallSize = useFluidPx(type.small)
  const priceRowTop = useVal(24, 20)
  const stripTop = useVal(40, 30)
  const tableTop = useVal(26, 22)
  const installTop = useVal(120, 70)
  const installRuleGap = useVal(28, 22)
  const ctaTop = useVal(96, 56)
  const ctaPadTop = useVal(40, 34)
  const ctaPadBottom = useVal(48, 40)

  const vehicleName = vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : ''
  const title = pkg?.display_name ?? sku

  const installedN = pkg?.price_installed != null ? Number(pkg.price_installed) : null
  const partsN = pkg?.price_total != null ? Number(pkg.price_total) : null
  const laborMaterials = installedN != null && partsN != null ? installedN - partsN : null

  // ---- generated copy (package grain + vehicle grain) -----------------------
  const sub = components.find((c) => c.collection === 'subwoofers')
  const fstage = components.find((c) => c.role === 'Front stage')
  const dsp = components.find((c) => c.collection === 'dsp_processors')
  const alignmentLabel = pkg?.bass_alignment ? ALIGNMENT_LABEL[pkg.bass_alignment] ?? pkg.bass_alignment : ''

  const p1 = pkg
    ? `The ${title} is a complete, engineered ${pkg.topology ?? ''} system${vehicleName ? ` for the ${vehicleName}` : ''}: ` +
      `${sub ? componentTitle(sub) + (sub.qty > 1 ? ` ×${sub.qty}` : '') : 'the sub stage'} in a ${alignmentLabel.toLowerCase()} enclosure, ` +
      `${fstage ? `the ${componentTitle(fstage)} front stage` : 'a matched front stage'}, amplification sized to both, ` +
      `and ${dsp ? `the ${componentTitle(dsp)}` : 'DSP'} tuned in the car.`
    : ''

  let p2 = ''
  if (vehicle) {
    const sys = vehicle.branded_system_name
    const fr = String(vehicle.has_fullrange_output ?? '')
    if (sys && (fr === 'false' || fr === '0')) {
      p2 = `The ${vehicleName} carries the ${sys} factory system, which offers no full-range output — integration reconstructs the signal ahead of the DSP, and your chimes, prompts, and warnings survive. The factory unit stays in the dash.`
    } else if (sys && fr === 'option') {
      p2 = `The ${vehicleName} carries the ${sys} factory system on some trims; whether its output is full-range depends on the trim, and we verify yours at intake before a single panel comes off.`
    } else if (sys) {
      p2 = `The ${vehicleName} carries the ${sys} factory system with a usable full-range output — integration taps it directly, and the factory unit stays in the dash.`
    } else {
      p2 = `Integration works from the factory head unit — it stays in the dash, and your chimes and prompts survive.`
    }
  }

  const p3 = 'Every price on this page is computed from the live catalog — the ledger below is the current arithmetic of parts, labor, and materials, not a quote that drifts.'

  // ---- spec strip (cells render only where the data exists) -----------------
  const cells: SpecCell[] = []
  if (vehicle) {
    if (vehicle.body_style) cells.push({ label: 'Body style', value: vehicle.body_style, sub: vehicle.segment ?? undefined })
    if (vehicle.acoustic_volume_cuft) {
      const split = vehicle.passenger_volume_cuft && vehicle.luggage_volume_cuft
        ? `${vehicle.passenger_volume_cuft} cabin + ${vehicle.luggage_volume_cuft} cargo`
        : undefined
      cells.push({ label: 'Acoustic volume', value: `${vehicle.acoustic_volume_cuft} ft³`, sub: split })
    }
    if (vehicle.branded_system_name) {
      const fr = String(vehicle.has_fullrange_output ?? '')
      cells.push({ label: 'Factory system', value: vehicle.branded_system_name, sub: fr === 'false' ? 'DSP-managed · factory amp' : undefined })
      cells.push({
        label: 'Factory signal',
        value: fr === 'false' ? 'No full-range output' : fr === 'option' ? 'Trim-dependent' : 'Full-range output',
        sub: fr === 'false' ? 'reconstruction included' : fr === 'option' ? 'verified at intake' : 'direct integration',
      })
    }
    cells.push({ label: 'Head unit', value: 'Factory, retained', sub: vehicle.head_unit_replacement_supported === false ? 'replacement not supported — not needed' : undefined })
    if (vehicle.alt_price_estimate) {
      cells.push({ label: 'Charging system', value: 'Stock alternator', sub: `HO upgrade quoted ${money(vehicle.alt_price_estimate)}`, accent: true })
    }
  }
  if (pkg?.bass_alignment && sub) {
    const enc = components.find((c) => c.collection === 'sub_enclosures')
    cells.push({
      label: 'Substage',
      value: `${sub.qty}×${sub.row?.size ?? ''} ${alignmentLabel}`.replace('  ', ' '),
      sub: enc?.row?.volume_cuft ? `${enc.row.volume_cuft} ft³ enclosure` : undefined,
    })
  }

  return (
    <>
      <Head>
        <title>{`${title}${vehicleName ? ` · ${vehicleName}` : ''} — North Coast Soundworks`}</title>
        <meta name="description" content={pkg?.summary ?? 'A pre-engineered, pre-priced NCSW sound system package.'} />
      </Head>
      <View style={outerStyle}>
        <SiteNav links={NAV_LINKS} phone={PHONE} />
        <ScrollView style={{ flex: 1, backgroundColor: colors.white }} contentContainerStyle={{ flexGrow: 1 }}>
          <Container>
            <View style={{ paddingTop: 18, flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <Eyebrow>Packages</Eyebrow>
              <Eyebrow>/</Eyebrow>
              <Eyebrow tone="accent">Package detail</Eyebrow>
            </View>
          </Container>

          {state === 'loading' ? (
            <Container>
              <View style={{ paddingVertical: 120, alignItems: 'center' }}>
                <ActivityIndicator color={colors.ink} />
              </View>
            </Container>
          ) : state !== 'ready' || !pkg ? (
            <Container>
              <View style={{ paddingVertical: 80, gap: 10 }}>
                <Heading level="h3">
                  {state === 'error' ? 'The catalog could not be reached.' : 'That package is not in the current catalog.'}
                </Heading>
                <Text style={{ fontFamily: fonts.body, fontSize: smallSize, color: colors.gray, maxWidth: 560 } as any}>
                  The offering is curated continuously; a package can be superseded between visits. Pick your
                  vehicle on the packages page to see the systems currently engineered for it.
                </Text>
              </View>
            </Container>
          ) : (
            <>
              {/* Hero lockup */}
              <Container>
                <View style={{ paddingTop: heroTop } as any}>
                  <Heading level="h2">NCSW System</Heading>
                  <Heading level="h2">{`SKU ${pkg.sku}`}</Heading>
                  {vehicle ? <Heading level="h2">{`${vehicle.year} ${vehicle.make}`}</Heading> : null}
                  {vehicle ? <Heading level="h2">{[vehicle.model, vehicle.trim].filter(Boolean).join(' ')}</Heading> : null}
                </View>
              </Container>

              {/* 01 / Overview */}
              <PdpSection>
                <Band index="01" label="Overview" action={vehicle ? 'All systems for this car' : 'All packages'} actionHref="/packages" />
                <View style={{ marginBottom: gap } as any}>
                  <Heading level="h2sm">{title}</Heading>
                </View>
                <FullWidthCopyContext.Provider value={true}>
                  <Lead>{p1}</Lead>
                  {p2 ? (<><View style={{ height: 14 }} /><Lead>{p2}</Lead></>) : null}
                  <View style={{ height: 14 }} />
                  <Lead>{p3}</Lead>

                  <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'baseline', gap: 14, marginTop: priceRowTop as any }}>
                    <Eyebrow>Total installed</Eyebrow>
                    <Text style={{ fontFamily: fonts.mono, fontSize: priceSize as any, fontWeight: '500', color: colors.ink } as any}>
                      {money(installedN)}
                    </Text>
                  </View>
                </FullWidthCopyContext.Provider>

                {cells.length > 0 ? (
                  <View style={{ marginTop: stripTop as any }}>
                    <Text style={{ fontFamily: fonts.mono, fontSize: metaSize as any, letterSpacing: 0.4, textTransform: 'uppercase', color: colors.gray, marginBottom: 12 } as any}>
                      {vehicle ? 'This car, on record' : 'This system, on record'}
                    </Text>
                    <SpecStrip cells={cells} />
                  </View>
                ) : null}
              </PdpSection>

              {/* 02 / System */}
              <PdpSection>
                <Band index="02" label="System" />
                <Heading level="h2sm">System components</Heading>
                <View style={{ marginTop: 16 }}>
                  <Lead>
                    Each component below is the row our evaluation selected, read live from the catalog — the
                    prices are the ledger, and what the part costs is what the line reads.
                  </Lead>
                </View>
                <View style={{ marginTop: tableTop as any, borderTopWidth: 1, borderTopColor: colors.tableLineStrong }}>
                  {components.map((c, i) => (
                    <SysRow
                      key={c.slug}
                      media={<SafeMedia src={c.row?.image_filename ? `/images/products/${c.row.image_filename}` : null} alt={componentTitle(c)} />}
                      title={componentTitle(c)}
                      meta={<Metaline items={componentMeta(c)} />}
                      desc={c.row?.description ?? ''}
                      price={(() => {
                        const line = pkg.price_breakdown?.components?.find((l) => l.slug === c.slug)
                        return line ? money(line.unit * line.qty) : c.row?.price != null ? money(c.row.price) : undefined
                      })()}
                      priceSub={c.qty > 1 ? `${c.qty} × ${money(pkg.price_breakdown?.components?.find((l) => l.slug === c.slug)?.unit)}` : undefined}
                      last={i === components.length - 1}
                    />
                  ))}
                </View>

                {/* Installation standard */}
                {install.length > 0 ? (
                  <View style={{ marginTop: installTop as any }}>
                    <Heading level="h2sm">{install[0]?.name ?? 'Installation'}</Heading>
                    <View style={{ borderTopWidth: 1, borderTopColor: colors.ink, marginTop: 18, marginBottom: installRuleGap as any }} />
                    {install[0]?.description ? <Lead>{install[0].description}</Lead> : null}
                    <View style={{ marginTop: tableTop as any, borderTopWidth: 1, borderTopColor: colors.tableLineStrong }}>
                      {install.slice(1).map((row, i, arr) => (
                        <SysRow
                          key={row.slug}
                          media={<PhotoSlot label={'Install photo\npending'} />}
                          title={row.name}
                          desc={row.description ?? ''}
                          last={i === arr.length - 1}
                        />
                      ))}
                    </View>
                  </View>
                ) : null}

                <View style={{ marginTop: tableTop as any }}>
                  <PriceSummary
                    lines={[
                      { label: 'Components', value: money(partsN) },
                      { label: 'Installation & materials', value: money(laborMaterials) },
                    ]}
                    total={{ label: 'Total, installed & tuned', value: money(installedN) }}
                  />
                </View>
              </PdpSection>

              {/* CTA */}
              <View style={{ marginTop: ctaTop as any, borderTopWidth: 1, borderTopColor: colors.ink }}>
                <Container>
                  <View
                    style={
                      {
                        flexDirection: narrow ? 'column' : 'row',
                        justifyContent: 'space-between',
                        alignItems: narrow ? 'flex-start' : 'center',
                        gap: 28,
                        flexWrap: 'wrap',
                        paddingTop: ctaPadTop as any,
                        paddingBottom: ctaPadBottom as any,
                      } as any
                    }
                  >
                    <View>
                      <Heading level="h2sm">Schedule this install</Heading>
                      <Text style={{ fontFamily: fonts.body, fontSize: smallSize as any, color: colors.gray, marginTop: 10, maxWidth: 420 } as any}>
                        {vehicleName
                          ? `Leave the ${vehicleName} with us for two days. It comes back tuned, measured, and documented.`
                          : 'Leave the car with us for two days. It comes back tuned, measured, and documented.'}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                      <Text style={{ fontFamily: fonts.mono, fontSize: priceSize as any, color: colors.ink } as any}>{PHONE}</Text>
                      <Button variant="primary">Schedule install</Button>
                      <Button variant="secondary">Ask about this system</Button>
                    </View>
                  </View>
                </Container>
              </View>
            </>
          )}
          <Footer />
        </ScrollView>
      </View>
    </>
  )
}
