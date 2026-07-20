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
  fetchMakes,
  fetchModels,
  fetchPackagesForVehicle,
  fetchVehicleRows,
  fetchYears,
  type PackageSummary,
  type Vehicle,
} from '@/lib/packages'

// PLP — the package listing experience. Vehicle-first: year -> make -> model
// resolves the vehicle, then the packages that fit it, filtered. The NCSW
// Picks filter defaults ON: the curated offering is large by design, and the
// picks filter is what narrows it to a browsable set (two-round model).
// While the packages collection is being curated the list renders its honest
// empty state — the picker and wiring are live against Directus either way.

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
  const [vehicle, setVehicle] = useState<Vehicle | null>(null)
  const [show, setShow] = useState('NCSW Picks')
  const [topology, setTopology] = useState('all')
  const [alignment, setAlignment] = useState('all')
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<PackageSummary[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchYears().then(setYears).catch(() => setError('Could not reach the catalog.'))
  }, [])

  useEffect(() => {
    setMake(''); setModel(''); setVehicle(null); setItems(null); setMakes([]); setModels([])
    if (year) fetchMakes(year).then(setMakes).catch(() => setError('Could not load makes.'))
  }, [year])

  useEffect(() => {
    setModel(''); setVehicle(null); setItems(null); setModels([])
    if (year && make) fetchModels(year, make).then(setModels).catch(() => setError('Could not load models.'))
  }, [make])

  useEffect(() => {
    setVehicle(null); setItems(null)
    if (year && make && model) {
      fetchVehicleRows(year, make, model)
        .then((rows) => setVehicle(rows[0] ?? null))
        .catch(() => setError('Could not resolve that vehicle.'))
    }
  }, [model])

  useEffect(() => {
    if (!vehicle) return
    setLoading(true); setError('')
    fetchPackagesForVehicle(vehicle, {
      ncswPicksOnly: show === 'NCSW Picks',
      topology: topology === 'all' ? undefined : topology,
      bassAlignment: alignment === 'all' ? undefined : alignment,
    })
      .then(setItems)
      .catch(() => setError('Could not load packages.'))
      .finally(() => setLoading(false))
  }, [vehicle, show, topology, alignment])

  const gap = useFluidPx(fluid(20, 14))
  const padY = useFluidPx(fluid(56, 32))

  const vehicleName = vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : ''

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
                amplification, and processing matched to your vehicle's real installation
                locations and cargo space. Pick your car; the systems that belong in it are
                already designed.
              </Lead>

              {/* vehicle picker */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap, zIndex: 30 }}>
                <View style={{ minWidth: 140, flexGrow: 1 }}>
                  <Dropdown label="Year" value={year} options={years} onChange={setYear} placeholder="Select year" />
                </View>
                <View style={{ minWidth: 180, flexGrow: 2 }}>
                  <Dropdown label="Make" value={make} options={makes} onChange={setMake} placeholder="Select make" disabled={!year} />
                </View>
                <View style={{ minWidth: 200, flexGrow: 2 }}>
                  <Dropdown label="Model" value={model} options={models} onChange={setModel} placeholder="Select model" disabled={!make} />
                </View>
              </View>

              {vehicle ? (
                <View style={{ gap }}>
                  <Metaline
                    items={[
                      { text: vehicleName, tone: 'ink' },
                      ...(vehicle.body_style ? [vehicle.body_style] : []),
                      ...(vehicle.luggage_volume_cuft ? [`${vehicle.luggage_volume_cuft} ft³ cargo`] : []),
                    ]}
                  />
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

                  {loading ? (
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
                          Packages for the {vehicleName} are being engineered.
                        </Text>
                        <Text style={{ fontFamily: fonts.body, fontSize: 14, color: colors.gray }}>
                          Our catalog is curated car by car — every package is designed against this
                          vehicle's factory speaker locations and cargo dimensions, not adapted from a
                          generic kit. Check back soon, or call us and we'll spec yours first.
                        </Text>
                      </View>
                    </Card>
                  ) : null}
                </View>
              ) : (
                <Metaline items={['Select your vehicle to see the systems designed for it.']} />
              )}

              {error ? (
                <Text style={{ fontFamily: fonts.body, fontSize: 14, color: colors.accent }}>{error}</Text>
              ) : null}
            </View>
          </Container>
          <Footer />
        </ScrollView>
      </View>
    </>
  )
}
