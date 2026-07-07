import React from 'react'
import { Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native'
import Head from 'expo-router/head'
import {
  Button,
  Card,
  Container,
  DataList,
  Eyebrow,
  Heading,
  IconArrow,
  Lead,
  Link,
  FullWidthCopyContext,
  Metaline,
  PriceSummary,
  Schematic,
  Shelf,
  colors,
  fluid,
  fonts,
  radius,
  type,
  useFluidPx,
} from '@/ui'
import { SiteNav, type NavLinkItem } from '@/components/SiteNav'
import { Footer } from '@/components/Footer'
import { assetUrl } from '@/lib/directus'

// PDP — the product-detail template, published as a static route so it can be
// reviewed and iterated live on Vercel. Content is the sample GTI package
// (matching the design comp); it will be parameterised from Directus via
// generateStaticParams once the packages data lands. Every block is composed
// from the shared primitives (SiteNav, Container, Heading, Lead, Metaline,
// DataList, PriceSummary, Card, Shelf, Schematic, Button, Footer).

const NAV_LINKS: NavLinkItem[] = [
  ['Packages', '/#packages'],
  ['Subwoofers', '/methodology/subwoofers'],
  ['Install Types', '/'],
  ['Editorial', '/'],
  ['About', '/'],
  ['Location', '/#location'],
]
const PHONE = '(216) 555-0114'

const IS_WEB = Platform.OS === 'web'
const VEHICLE_IMG = assetUrl('66c5d91d-dd1d-4728-bf9d-ce1dee32aff0', { width: 1200, format: 'webp' })
const BUILD_IMG = '/images/build-golf-alltrack.jpg'

const outerStyle: any = IS_WEB
  ? { height: '100dvh', flexDirection: 'column' }
  : { flex: 1, flexDirection: 'column' }

function useVal(anchor: number, floor: number) {
  return useFluidPx(fluid(anchor, floor))
}

function WebImg({ src, alt, style }: { src: string; alt: string; style: any }) {
  if (IS_WEB) return React.createElement('img', { src, alt, style: { display: 'block', ...style } })
  return <View style={[{ backgroundColor: colors.figBg }, style]} />
}

// Section wrapper — the PDP's tighter rhythm (44px top vs the landing's 96).
function PdpSection({ children }: { children: React.ReactNode }) {
  const top = useVal(44, 34)
  return (
    <View style={{ paddingTop: top } as any}>
      <Container>{children}</Container>
    </View>
  )
}

// Band — the numbered eyebrow row with the top ink rule and an optional door.
function Band({ index, label, action, actionHref }: { index: string; label: string; action?: string; actionHref?: string }) {
  const mb = useVal(96, 72)
  return (
    <View
      style={
        {
          borderTopWidth: 1,
          borderTopColor: colors.ink,
          paddingTop: 14,
          marginBottom: mb,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 18,
        } as any
      }
    >
      <Eyebrow>{`${index} / ${label}`}</Eyebrow>
      {action ? (
        <Link variant="door" href={actionHref} icon={<IconArrow size={15} />}>
          {action}
        </Link>
      ) : null}
    </View>
  )
}

// PhotoSlot — dashed placeholder for pending product / install photography.
function PhotoSlot({ label }: { label: string }) {
  const size = useFluidPx(type.meta)
  return (
    <View
      style={{
        aspectRatio: 4 / 3,
        borderWidth: 1,
        borderColor: colors.borderStrong,
        borderStyle: 'dashed',
        borderRadius: radius.sm,
        backgroundColor: colors.figBg,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 12,
      }}
    >
      <Text
        style={
          {
            fontFamily: fonts.mono,
            fontSize: size,
            letterSpacing: 0.4,
            textTransform: 'uppercase',
            color: colors.inkFaint,
            textAlign: 'center',
            lineHeight: 18,
          } as any
        }
      >
        {label}
      </Text>
    </View>
  )
}

// Real product photo, framed like the slot (contain, since products are cutouts).
function ProductMedia({ src, alt }: { src: string; alt: string }) {
  return (
    <View
      style={{
        aspectRatio: 4 / 3,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: radius.sm,
        backgroundColor: colors.figBg,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 14,
      }}
    >
      <WebImg src={src} alt={alt} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
    </View>
  )
}

// A component / install line-item row: media + (title, metaline, desc, door) + price.
function SysRow({
  media,
  title,
  meta,
  desc,
  doorLabel,
  price,
  priceSub,
  priceAccent,
  last,
}: {
  media: React.ReactNode
  title: string
  meta?: React.ReactNode
  desc: string
  doorLabel?: string
  price: string
  priceSub?: string
  priceAccent?: boolean
  last?: boolean
}) {
  const { width } = useWindowDimensions()
  const narrow = width <= 900
  const gap = useVal(28, 22)
  const py = useVal(24, 20)
  const descSize = useFluidPx(type.small)
  const priceSize = useFluidPx(type.small)
  const subSize = useFluidPx(type.meta)

  return (
    <View
      style={
        {
          flexDirection: narrow ? 'column' : 'row',
          gap,
          paddingVertical: py,
          borderBottomWidth: last ? 0 : 1,
          borderBottomColor: colors.tableLine,
          alignItems: narrow ? 'stretch' : 'flex-start',
        } as any
      }
    >
      <View style={{ width: narrow ? '100%' : '34%', maxWidth: narrow ? 460 : 480 } as any}>{media}</View>
      <View style={{ flex: 1 }}>
        <Heading level="h4">{title}</Heading>
        {meta ? <View style={{ marginTop: 6 }}>{meta}</View> : null}
        <Text style={{ fontFamily: fonts.body, fontSize: descSize, color: colors.body, marginTop: 8, maxWidth: 620 } as any}>
          {desc}
        </Text>
        {doorLabel ? (
          <View style={{ marginTop: 12, alignSelf: 'flex-start' }}>
            <Link variant="door" icon={<IconArrow size={15} />}>
              {doorLabel}
            </Link>
          </View>
        ) : null}
      </View>
      <View style={{ minWidth: 96, alignItems: narrow ? 'flex-start' : 'flex-end' }}>
        <Text
          style={
            { fontFamily: fonts.mono, fontSize: priceSize, fontWeight: '500', color: priceAccent ? colors.accent : colors.tableInk } as any
          }
        >
          {price}
        </Text>
        {priceSub ? (
          <Text style={{ fontFamily: fonts.mono, fontSize: subSize, color: colors.gray, marginTop: 3 } as any}>{priceSub}</Text>
        ) : null}
      </View>
    </View>
  )
}

const SCHEMATIC_IMG = '/images/schematics/sedan-two-way.webp'

// Legend keyed to the callouts on the schematic image (1–6).
const SCHEMATIC_LEGEND = [
  { n: 1, name: 'Factory head unit — retained', loc: 'Dash · Harman Kardon source' },
  { n: 2, name: 'SounDigital 800.5 EVO', loc: 'Under driver seat · front amplification' },
  { n: 3, name: 'Helix DSP MINI MK2', loc: 'Console · signal reconstruction' },
  { n: 4, name: 'Fi HC-15 · sealed enclosure', loc: 'Cargo bay · fabricated enclosure' },
  { n: 5, name: 'Audison Voce II tweeters', loc: 'Front pillars' },
  { n: 6, name: 'Audison Voce II midbass', loc: 'Front doors' },
]

const RELATED = [
  { rel: 'Below this system', title: 'Essentials Prefab Sealed 12', sum: 'Same HC-15 in a prefab box, mid front stage, phone-tuned DSP.', price: '$3,140 installed', img: '/images/pattern-floor.png' },
  { rel: 'Below this system', title: 'Essentials Sealed 10', sum: 'A sealed 10 for the driver who wants the front stage first.', price: '$2,480 installed', img: '/images/pattern-frontstage.png' },
  { rel: 'Above this system', title: 'Reference Ported 12', sum: 'The 12W7AE in a tuned ported build. More output, at the cost of the cargo floor.', price: '$5,390 installed', img: '/images/pattern-floor.png' },
  { rel: 'NCSW Pick', title: 'Cargo Infinite Baffle 15', sum: 'The value-calculation winner for this chassis. The cargo floor becomes the enclosure.', price: '$4,890 installed', img: '/images/pattern-reference.png' },
  { rel: 'Above this system', title: 'Reference Sealed 13', sum: 'The 13.5-inch W7 in a fabricated sealed build. The ceiling of this topology.', price: '$6,120 installed', img: '/images/pattern-floor.png' },
]

function RelatedCard({ item }: { item: (typeof RELATED)[number] }) {
  const summarySize = useFluidPx(type.lead)
  const priceSize = useFluidPx(type.body)
  return (
    <View style={{ width: 340, alignSelf: 'stretch' } as any}>
      <Card href="#">
        <Card.Media aspectRatio={16 / 11}>
          <WebImg src={item.img} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <Card.MediaTag>{item.rel}</Card.MediaTag>
        </Card.Media>
        <Card.Body>
          <Heading level="h4">{item.title}</Heading>
          <Text style={{ fontFamily: fonts.body, fontSize: summarySize, color: colors.body } as any}>{item.sum}</Text>
          <Text style={{ fontFamily: fonts.mono, fontSize: priceSize, fontWeight: '500', color: colors.ink } as any}>{item.price}</Text>
        </Card.Body>
        <Card.Footer>
          <Link variant="door" icon={<IconArrow size={15} />}>
            View system
          </Link>
        </Card.Footer>
      </Card>
    </View>
  )
}

export default function PdpScreen() {
  const { width } = useWindowDimensions()
  const narrow = width <= 900
  const gap = useVal(28, 22)
  const heroTop = useVal(44, 34)
  const bigGap = useVal(160, 90)
  // Precomputed so nothing calls a hook inside a .map() below.
  const smallSize = useFluidPx(type.small)
  const upgPy = useVal(18, 16)

  return (
    <>
      <Head>
        <title>2026 Volkswagen Golf GTI Autobahn · Performance Sealed 12 — North Coast Soundworks</title>
        <meta
          name="description"
          content="A pre-engineered, pre-priced SQ system for the 2026 Golf GTI Autobahn: sealed 12, reference front stage, measured tune. Installed & tuned, $4,270."
        />
      </Head>
      <View style={outerStyle}>
        <SiteNav links={NAV_LINKS} phone={PHONE} />
        <ScrollView style={{ flex: 1, backgroundColor: colors.white }} contentContainerStyle={{ flexGrow: 1 }}>
          {/* Breadcrumb */}
          <Container>
            <View style={{ paddingTop: 18, flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <Eyebrow>Home</Eyebrow>
              <Eyebrow>/</Eyebrow>
              <Eyebrow tone="accent">Package detail</Eyebrow>
            </View>
          </Container>

          {/* Hero lockup */}
          <Container>
            <View style={{ paddingTop: heroTop } as any}>
              <Heading level="h2">NCSW System</Heading>
              <Heading level="h2">SKU GTI-P12S-26A</Heading>
              <Heading level="h2">2026 Volkswagen</Heading>
              <Heading level="h2">Golf GTI Autobahn</Heading>
            </View>
          </Container>

          {/* 01 / Overview */}
          <PdpSection>
            <Band index="01" label="Overview" action="All GTI systems" actionHref="#" />
            <View style={{ marginBottom: gap } as any}>
              <Heading level="h2sm">Performance Sealed 12</Heading>
            </View>
            <View style={{ flexDirection: narrow ? 'column' : 'row', gap, alignItems: 'flex-start' }}>
              <View style={{ flex: narrow ? undefined : 1.5, width: narrow ? '100%' : undefined } as any}>
                <FullWidthCopyContext.Provider value={true}>
                <Lead>
                  The Performance Sealed 12 pairs the highest-impact sealed 12 in our evaluation with a reference two-way front
                  stage, in a hatch whose 111 ft³ cabin does real work for it. The Fi HC-15 loads into a sealed box that keeps the
                  cargo floor usable; extension comes from the alignment and from cabin gain below 80 Hz, not from brute power.
                </Lead>
                <View style={{ height: 14 }} />
                <Lead>
                  The trade is output ceiling. A ported build in this bay would play louder above tuning, but it costs the full
                  cargo floor and gives up the transient control this front stage deserves. At 500 W continuous the sub stage stays
                  inside the stock charging system's envelope, which is why this package carries no electrical line items at all.
                </Lead>
                <View style={{ height: 14 }} />
                <Lead>
                  The one component this GTI forces is the processor. The Harman Kardon amplifier hands off a fragmented,
                  pre-equalized signal; the DSP MINI MK2 is specified for its ADEP.3 input stage, which reconstructs it cleanly.
                  Trims with a full-range factory output qualify for a simpler processor and a $300–350 savings; we verify yours
                  before you book.
                </Lead>

                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'baseline', gap: 14, marginTop: useVal(24, 20) as any }}>
                  <Eyebrow>Total installed</Eyebrow>
                  <Text style={{ fontFamily: fonts.mono, fontSize: useFluidPx(type.h4) as any, fontWeight: '500', color: colors.ink } as any}>
                    $4,270
                  </Text>
                </View>

                <View style={{ marginTop: useVal(22, 18) as any }}>
                  <Text style={{ fontFamily: fonts.mono, fontSize: useFluidPx(type.meta) as any, letterSpacing: 0.4, textTransform: 'uppercase', color: colors.gray, marginBottom: 12 } as any}>
                    Vehicle data
                  </Text>
                  <DataList
                    rows={[
                      { label: 'Acoustic volume', value: '111 ft³' },
                      { label: 'Cabin / cargo', value: '91 + 20 ft³' },
                      { label: 'Head unit', value: 'Factory, retained' },
                      { label: 'Factory signal', value: 'Fragmented (HK) → reconstruction included' },
                      { label: 'Charging system', value: 'Stock verified for this system', accent: true },
                      { label: 'Install type', value: 'Hatch · fabricated sealed' },
                    ]}
                  />
                </View>
                </FullWidthCopyContext.Provider>
              </View>

              <View style={{ flex: narrow ? undefined : 1, width: narrow ? '100%' : undefined } as any}>
                <View style={{ borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.figBg }}>
                  <WebImg src={VEHICLE_IMG} alt="2026 Volkswagen Golf GTI" style={{ width: '100%', aspectRatio: 16 / 10, objectFit: 'cover' }} />
                </View>
              </View>
            </View>
          </PdpSection>

          {/* 02 / System */}
          <PdpSection>
            <Band index="02" label="System" />
            <Heading level="h2sm">System components</Heading>
            <View style={{ marginTop: 16, maxWidth: '60%' as any }}>
              <Lead>
                Seven components, each the one our evaluation selected for this cabin and this signal path. The prices are the
                ledger: what the part costs is what the line reads, and the install that follows is itemized the same way.
              </Lead>
            </View>

            <View style={{ marginTop: useVal(26, 22) as any, borderTopWidth: 1, borderTopColor: colors.tableLineStrong }}>
              <SysRow
                media={<ProductMedia src="/images/products/fi-hc15.webp" alt="Fi Car Audio HC-15" />}
                title="Fi Car Audio HC-15"
                meta={<Metaline items={['Sub stage', '15″', 'Upper-mid tier', { text: 'Impact 2.975', tone: 'ink' }]} />}
                desc="A 2,500 W upper-mid 15 chosen for this cabin: enough cone area and excursion to load the sealed box the hatch allows, with the alignment tuned to use cabin gain below 80 Hz rather than raw power."
                doorLabel="Read the full evaluation"
                price="$675.00"
              />
              <SysRow
                media={<ProductMedia src="/images/products/helix-dsp-mini-mk2.png" alt="Helix DSP MINI MK2" />}
                title="Helix DSP MINI MK2"
                meta={<Metaline items={['Signal', 'Reference tier', '64-bit / 96 kHz', '103 dB SNR']} />}
                desc="The best signal quality in our lineup. Its ADEP.3 input stage de-equalizes and reconstructs the Harman Kardon's fragmented output, the reason it is specified for this trim. Calls, navigation, and chimes are retained."
                doorLabel="Processor comparison"
                price="$599.00"
              />
              <SysRow
                media={<ProductMedia src="/images/products/audison-voce-ii.webp" alt="Audison Voce II AVK 6.2A" />}
                title="Audison Voce II AVK 6.2A"
                meta={<Metaline items={['Front stage', 'Reference tier', 'Two-way', 'Impact 47.6']} />}
                desc="Reference two-way set in the factory door and pillar locations: no custom pods, no cut dash. It carries the image height and center fill the factory system never had, and it is the component this budget protects."
                doorLabel="Front-stage evaluation"
                price="$1,000.00"
              />
              <SysRow
                media={<ProductMedia src="/images/products/helix-ci5.webp" alt="Helix Ci5 front sub" />}
                title="Helix Ci5 S200FM-D2 front sub"
                meta={<Metaline items={['Front sub', 'Under-seat sealed baffle included']} />}
                desc="Midbass arrives from in front of you, where the factory system never puts it. The under-seat sealed baffle is fabricated as part of this package, closing the gap between the door midwoofers and the sub stage."
                price="$250.00"
              />
              <SysRow
                media={<ProductMedia src="/images/products/ct-1000-1d.webp" alt="CT Sounds CT-1000.1D" />}
                title="CT Sounds CT-1000.1D"
                meta={<Metaline items={['Sub amplification', '1,000 W @ 1Ω', 'Class D', '93 dB SNR']} />}
                desc="Sized by rule, not by upsell: 1,000 W is 1.0× the HC-15's continuous rating, inside our R1 pairing window. Enough headroom that the amp never runs compressed; not so much that the electrical system pays for watts the driver cannot use."
                price="$159.99"
              />
              <SysRow
                media={<ProductMedia src="/images/products/soundigital-800-5.png" alt="SounDigital 800.5 EVO" />}
                title="SounDigital 800.5 EVO 6.0"
                meta={<Metaline items={['Front amplification', '5-channel', '800 W', '103.9 dB SNR']} />}
                desc="One chassis drives the entire front stage and the front sub: four channels to the Voce II set, the fifth to the Ci5. Fewer amplifiers means fewer power runs, fewer failure points, and one less hour of install labor."
                price="$239.00"
                last
              />
            </View>

            {/* Installation break */}
            <View style={{ marginTop: bigGap } as any}>
              <Heading level="h2sm">Installation</Heading>
              <View style={{ borderTopWidth: 1, borderTopColor: colors.ink, marginTop: 18, marginBottom: useVal(28, 22) as any }} />
              <View style={{ maxWidth: '60%' as any }}>
                <Lead>
                  An install is billed by the hour, so the plan is where your money is saved. Every system we sell is
                  bench-configured before the car arrives: crossover points, alignment targets, and gain structure are set from this
                  package's spec, then verified by measurement in the vehicle.
                </Lead>
                <View style={{ height: 14 }} />
                <Lead>
                  Wire runs follow the factory harness paths documented for this chassis. The enclosure is built to the driver's
                  alignment before install day. Nothing on this list is discovered in the bay; it is executed there.
                </Lead>
              </View>

              <View style={{ marginTop: useVal(26, 22) as any, borderTopWidth: 1, borderTopColor: colors.tableLineStrong }}>
                <SysRow
                  media={
                    <View style={{ aspectRatio: 4 / 3, borderRadius: radius.sm, overflow: 'hidden', borderWidth: 1, borderColor: colors.line }}>
                      <WebImg src={BUILD_IMG} alt="NCSW fabricated enclosure install in a Golf cargo bay" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </View>
                  }
                  title="Base system install"
                  desc="Power and signal runs along factory harness paths, amplifier and processor mounting, factory head-unit integration, front-stage swap in the factory locations, sub wiring, measured tune, and road test. This is the line every package carries."
                  price="6 hr"
                  priceSub="$600"
                />
                <SysRow
                  media={<PhotoSlot label={'Install photo\nEnclosure fabrication'} />}
                  title="Sealed enclosure fabrication"
                  desc="Built to the HC-15's alignment, sized to the hatch floor so the cargo cover still closes. Materials are on the ledger: void-free plywood, automotive carpet, terminal hardware."
                  price="6 hr"
                  priceSub="$600 + $96 materials"
                />
                <SysRow
                  media={<PhotoSlot label={'Install photo\nAmplifier rack'} />}
                  title="Additional amplifier"
                  desc="The second amplifier adds one hour: mounting, a fused power branch, signal, and ground. Running the front stage and front sub from one five-channel chassis is what keeps this line at one hour instead of two."
                  price="1 hr"
                  priceSub="$100"
                />
                <SysRow
                  media={<PhotoSlot label={'Install photo\nTreatment & wiring'} />}
                  title="Treatment, wiring, consumables"
                  desc="CLD damping on the door skins and hatch floor where the hardware mounts, a fused 4 AWG OFC power run, OFC speaker wire throughout, and the enclosure finish. Quantities are itemized in the system ledger above."
                  price="$156.76"
                  priceSub="materials"
                />
                <SysRow
                  media={<PhotoSlot label={'Install photo\nElectrical'} />}
                  title="Electrical"
                  desc="No upgrades required: the system's 1,000 W draw is verified against the stock alternator and battery. When a build needs more, the BIG3, alternator, and battery lines appear here, priced the same way."
                  price="$0.00"
                  priceAccent
                  last
                />
              </View>

              <View style={{ marginTop: useVal(26, 22) as any }}>
                <PriceSummary
                  lines={[
                    { label: 'Components', value: '$2,716.99' },
                    { label: 'Installation', value: '$1,552.76' },
                  ]}
                  total={{ label: 'Total, installed & tuned', value: '$4,270' }}
                />
                <View style={{ alignItems: 'flex-end', marginTop: 14 }}>
                  <Button variant="secondary">Download spec sheet (PDF)</Button>
                </View>
              </View>
            </View>
          </PdpSection>

          {/* 03 / Schematic */}
          <PdpSection>
            <Band index="03" label="Schematic" />
            <Heading level="h2sm">System layout</Heading>
            <View style={{ marginTop: 16, maxWidth: '60%' as any, marginBottom: useVal(26, 22) as any }}>
              <Lead>
                The same line items, placed. Power runs solid, signal dashed, speaker leads gray; the numbers key to the list beside
                the drawing. Most NCSW systems share one of a small set of layouts, and this is the single-sub hatch topology.
              </Lead>
            </View>
            <Schematic
              diagram={<WebImg src={SCHEMATIC_IMG} alt="Top-down schematic of the system in the vehicle" style={{ width: '100%', height: 'auto' }} />}
              legend={SCHEMATIC_LEGEND}
            />
          </PdpSection>

          {/* 04 / NCSW pick */}
          <PdpSection>
            <Band index="04" label="NCSW pick" />
            <Card layout="split" href="#">
              <Card.Media aspectRatio={16 / 11}>
                <WebImg src={BUILD_IMG} alt="2018 VW Golf Alltrack infinite-baffle build in the bay" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <Card.MediaTag>NCSW Pick · Generated image pending</Card.MediaTag>
              </Card.Media>
              <Card.Body>
                <Metaline items={['2026 Golf GTI', 'Cargo Infinite Baffle build']} />
                <Heading level="h3">The system we'd build in this GTI</Heading>
                <Lead>
                  Our value calculation ranks the Cargo Infinite Baffle above every boxed build in this chassis. There is no
                  enclosure to fabricate: a single reference 15 mounts to a baffle in the cargo floor and fires through it, using the
                  space behind the seats as its back chamber. The box line item disappears, and the money it would have cost moves
                  into the driver.
                </Lead>
                <DataList
                  rows={[
                    { label: 'System', value: 'Cargo IB 15 · reference front stage' },
                    { label: 'Total installed', value: '$4,890' },
                    { label: 'Impact per dollar', value: '1.9× this system' },
                  ]}
                />
              </Card.Body>
              <Card.Footer>
                <Link variant="door" icon={<IconArrow size={15} />}>
                  See the IB build
                </Link>
              </Card.Footer>
            </Card>
          </PdpSection>

          {/* 05 / Upgrades */}
          <PdpSection>
            <Band index="05" label="Upgrades" />
            <Heading level="h2sm">What more buys</Heading>
            <View style={{ marginTop: 16, maxWidth: '60%' as any, marginBottom: useVal(24, 20) as any }}>
              <Lead>
                A system this resolved will reveal the cabin it plays in. The upgrades below are the ones whose measured return
                justifies their line item; each is quoted for this vehicle, and none is required for the system above to perform as
                described.
              </Lead>
            </View>
            <View style={{ borderTopWidth: 1, borderTopColor: colors.tableLineStrong }}>
              {[
                ['Full-vehicle CLD treatment', 'Doors, floor, hatch, and roof instead of mount points only. Panel resonance drops, and with it the noise floor the front stage plays over. The roof requires a headliner drop, which is most of the cost.', '+ $695'],
                ['Acoustic absorption package', 'Closed-cell foam and hydrophobic melamine in the doors and pillars. Where CLD stops panels from ringing, absorption stops the reflections that smear the image.', '+ $240'],
                ['Integrated enclosure', 'The sealed enclosure fabricated into the spare-wheel well and side walls, carpet-matched, with the load floor flat above it. Same alignment, invisible install, full cargo bay.', '+ $900'],
              ].map(([title, desc, price], i, arr) => (
                <View
                  key={title}
                  style={
                    {
                      flexDirection: 'row',
                      gap: 18,
                      paddingVertical: upgPy,
                      borderBottomWidth: i === arr.length - 1 ? 0 : 1,
                      borderBottomColor: colors.tableLine,
                      justifyContent: 'space-between',
                    } as any
                  }
                >
                  <View style={{ flex: 1 }}>
                    <Heading level="h4">{title}</Heading>
                    <Text style={{ fontFamily: fonts.body, fontSize: smallSize, color: colors.body, marginTop: 6, maxWidth: 620 } as any}>
                      {desc}
                    </Text>
                  </View>
                  <Text style={{ fontFamily: fonts.mono, fontSize: smallSize, fontWeight: '500', color: colors.tableInk } as any}>
                    {price}
                  </Text>
                </View>
              ))}
            </View>
          </PdpSection>

          {/* 06 / Related shelf */}
          <PdpSection>
            <Band index="06" label="Systems you may also like" action="All systems for this GTI" actionHref="#" />
            <Shelf>
              {RELATED.map((item) => (
                <RelatedCard key={item.title} item={item} />
              ))}
            </Shelf>
          </PdpSection>

          {/* CTA */}
          <View style={{ marginTop: useVal(96, 56) as any, borderTopWidth: 1, borderTopColor: colors.ink }}>
            <Container>
              <View
                style={
                  {
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 28,
                    flexWrap: 'wrap',
                    paddingTop: useVal(40, 34) as any,
                    paddingBottom: useVal(48, 40) as any,
                  } as any
                }
              >
                <View>
                  <Heading level="h2sm">Schedule this install</Heading>
                  <Text style={{ fontFamily: fonts.body, fontSize: useFluidPx(type.small) as any, color: colors.gray, marginTop: 10, maxWidth: 420 } as any}>
                    Leave the GTI with us for two days. It comes back tuned, measured, and documented, with the measurement file.
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Text style={{ fontFamily: fonts.mono, fontSize: useFluidPx(type.h4) as any, color: colors.ink } as any}>{PHONE}</Text>
                  <Button variant="primary">Schedule install</Button>
                  <Button variant="secondary">Ask about this system</Button>
                </View>
              </View>
            </Container>
          </View>

          <Footer />
        </ScrollView>
      </View>
    </>
  )
}
