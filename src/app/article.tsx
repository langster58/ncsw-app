import React from 'react'
import { Platform, ScrollView, Text, View } from 'react-native'
import Head from 'expo-router/head'
import {
  Button,
  Byline,
  Card,
  Container,
  CtaBar,
  Eyebrow,
  FullWidthCopyContext,
  Heading,
  IconArrow,
  Image,
  Lead,
  Link,
  Prose,
  Section,
  SectionIntro,
  Shelf,
  colors,
  fluid,
  fonts,
  radius,
  space,
  type,
  useFluidPx,
  type ProseBlock,
} from '@/ui'
import { SiteNav, type NavLinkItem } from '@/components/SiteNav'
import { Footer } from '@/components/Footer'

// Article template — the editorial render pattern. Single full-width column in
// the site's standard Container (aligned with the nav and every other page):
// breadcrumb -> headline -> dek -> hero image -> byline eyebrow -> body. Copy
// fills the container. Composed from shared components. Content is a sample
// record; it will come from the Directus `articles` collection later.

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
// The article reading measure — dek + body share it. One place to tune.
const READ_MEASURE = '75%'

function useVal(anchor: number, floor: number) {
  return useFluidPx(fluid(anchor, floor))
}

// ── Sample article (stands in for a Directus `articles` record) ─────────────
const ARTICLE = {
  slug: 'sub-value-frontier',
  category: 'Methodology',
  reading_time: '8 min read',
  title: 'The Sub Value Frontier',
  author: 'Brett Combs',
  publish_date: 'June 18, 2026',
  excerpt:
    'Plot every subwoofer we carry against its installed price and a curve appears. The bend in that curve is where more money stops buying more bass you can actually hear. We build to the bend — and here is the data that decides where it is.',
}

const BODY: ProseBlock[] = [
  {
    type: 'p',
    text:
      "There are more than two hundred subwoofers we could put in your car, and the spec sheets will tell you almost nothing useful about how they rank against each other. Power ratings are marketing. Cone size is geometry, not output. The only honest comparison is the one we run ourselves: the same measurement, on the same rig, for every driver — and then the same question asked of all of them. For the money it costs to put this in a car, how much bass do you actually get?",
  },
  {
    type: 'p',
    text:
      "When you plot that — installed price on one axis, measured impact on the other — the drivers do not scatter randomly. They pile up under a curve. A handful sit right on its leading edge, and everything else falls beneath them, beaten by a driver that costs the same or less and hits the same or harder. Economists call that leading edge a Pareto frontier. We just call it the answer.",
  },
  { type: 'h', text: 'What the curve actually shows' },
  {
    type: 'p',
    text:
      "The frontier is steep at first. In the first few hundred dollars, every additional dollar buys a lot of measurable output — the curve climbs fast. Then it bends. Past the bend, the line goes nearly flat: you can keep spending, and the drivers keep getting more expensive, but the measured output barely moves. That flat stretch is where the car-audio industry makes most of its margin and delivers almost none of its value.",
  },
  { type: 'quote', text: 'Past the bend, you are paying for a number on a box, not for bass you can hear.' },
  {
    type: 'p',
    text:
      "Every package we sell is anchored to a driver on or just past that bend. It is the single decision that does the most to determine whether a system is a good buy, and it is the one most shops get wrong — either by defaulting to whatever brand pays for the endcap, or by chasing the biggest number the budget allows. We do neither. We read the curve for your cabin and your budget, and put the money where the measurement says it stops mattering.",
  },
  { type: 'h', text: 'Building to the bend' },
  {
    type: 'p',
    text:
      "Our recommendation changes with the car. A frontier driver in a compact sedan is not the frontier driver in a truck — the cabin does different work, and the curve shifts. The method is fixed; the answer is specific. What follows on every product page is that specific answer, with the arithmetic that produced it shown in the open.",
  },
  {
    type: 'list',
    items: [
      'Same measurement rig for every driver — no spec-sheet comparisons.',
      'Impact measured, not rated; price is installed, not MSRP.',
      'The selected driver is the one on the frontier for your cabin and budget.',
      'The reasoning is published on the page, not kept in the shop.',
    ],
  },
  {
    type: 'p',
    text:
      "If you want the full data set — every driver, every measurement, the rig, and the math behind the frontier line — it is on the subwoofer methodology page, and it updates as we test more. This piece is the short version. The short version is: we build to the bend, and we can show you exactly where it is.",
  },
]

const RELATED = [
  {
    cat: 'Methodology',
    read: '11 min read',
    title: 'The 10 Blind Amp Challenge',
    dek: 'Ten amplifiers, level-matched and identified by ear alone. The scores landed inside a few points of each other.',
  },
  {
    cat: 'Methodology',
    read: '6 min read',
    title: 'Why Every System Gets a DSP',
    dek: 'Premium factory systems ship with a deliberate showroom voicing. Before we add output, we flatten the curve to a target.',
  },
  {
    cat: 'Guide',
    read: '9 min read',
    title: 'Sealed, Ported, or Infinite Baffle',
    dek: 'Three enclosure topologies, what each one trades, and how the cabin decides which one wins in your car.',
  },
]

const LD = {
  '@context': 'https://schema.org',
  '@type': 'BlogPosting',
  headline: ARTICLE.title,
  description: ARTICLE.excerpt,
  articleSection: ARTICLE.category,
  author: { '@type': 'Person', name: ARTICLE.author },
  publisher: { '@type': 'Organization', name: 'North Coast Soundworks' },
}

function RelatedCard({ item }: { item: (typeof RELATED)[number] }) {
  const dekSize = useFluidPx(type.body)
  const metaSize = useFluidPx(type.meta)
  return (
    <View style={{ width: 360, alignSelf: 'stretch' } as any}>
      <Card href="#">
        <Card.Body>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 } as any}>
            <Text style={{ fontFamily: fonts.mono, fontSize: metaSize, letterSpacing: 0.5, textTransform: 'uppercase', color: colors.accent } as any}>{item.cat}</Text>
            <Text style={{ fontFamily: fonts.body, fontSize: metaSize, letterSpacing: 0.9, textTransform: 'uppercase', fontWeight: '600', color: colors.gray } as any}>{item.read}</Text>
          </View>
          <Heading level="h4">{item.title}</Heading>
          <Text style={{ fontFamily: fonts.body, fontSize: dekSize, color: colors.body, lineHeight: 22 } as any}>{item.dek}</Text>
        </Card.Body>
        <Card.Footer>
          <Link variant="door" icon={<IconArrow size={15} />}>Read the piece</Link>
        </Card.Footer>
      </Card>
    </View>
  )
}

export default function ArticleScreen() {
  const outer: any = IS_WEB ? { height: '100dvh', flexDirection: 'column' } : { flex: 1, flexDirection: 'column' }
  const heroTop = useVal(160, 104) // space between the eyebrow (breadcrumb) and the headline

  return (
    <>
      <Head>
        <title>{`${ARTICLE.title} — North Coast Soundworks`}</title>
        <meta name="description" content={ARTICLE.excerpt} />
        {IS_WEB ? (React.createElement('script', { type: 'application/ld+json', dangerouslySetInnerHTML: { __html: JSON.stringify(LD) } }) as any) : null}
      </Head>
      <View style={outer}>
        <SiteNav links={NAV_LINKS} phone={PHONE} />
        <ScrollView style={{ flex: 1, backgroundColor: colors.white }} contentContainerStyle={{ flexGrow: 1 }}>
          {/* Breadcrumb */}
          <Container>
            <View style={{ paddingTop: 18, flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <Eyebrow>Home</Eyebrow>
              <Eyebrow>/</Eyebrow>
              <Eyebrow>Editorial</Eyebrow>
              <Eyebrow>/</Eyebrow>
              <Eyebrow tone="accent">{ARTICLE.category}</Eyebrow>
            </View>
          </Container>

          {/* Headline + dek — full width */}
          <Container>
            <View style={{ paddingTop: heroTop } as any}>
              <FullWidthCopyContext.Provider value={true}>
                <Heading level="h2">{ARTICLE.title}</Heading>
                <View style={{ marginTop: space.blockGap, width: '100%', maxWidth: READ_MEASURE } as any}>
                  <Lead>{ARTICLE.excerpt}</Lead>
                </View>
              </FullWidthCopyContext.Provider>
            </View>
          </Container>

          {/* Hero image — full container width */}
          <Container>
            <View
              style={{ marginTop: useVal(36, 28) as any, aspectRatio: 2.4, borderRadius: radius.md, overflow: 'hidden', borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface } as any}
            >
              <Image src="/images/methodology/signal.webp" fill objectFit="cover" alt="" />
            </View>
          </Container>

          {/* Byline eyebrow — rule dividing the hero from the body */}
          <Container>
            <View
              style={{ marginTop: useVal(36, 28) as any, borderTopWidth: 1, borderTopColor: colors.ink, paddingTop: 14, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' } as any}
            >
              <Byline author={ARTICLE.author} date={ARTICLE.publish_date} />
            </View>
          </Container>

          {/* Body — paragraph text at 75% */}
          <Container>
            <View style={{ marginTop: useVal(28, 22) as any } as any}>
              <Prose blocks={BODY} measure={READ_MEASURE} />
            </View>
          </Container>

          {/* Related */}
          <Section>
            <Container>
              <SectionIntro label="Keep reading" heading="More from the workshop" actionLabel="All articles" actionHref="/" level="h2sm" />
              <Shelf>
                {RELATED.map((item) => (
                  <RelatedCard key={item.title} item={item} />
                ))}
              </Shelf>
            </Container>
          </Section>

          {/* CTA */}
          <CtaBar
            heading="Have a car in mind?"
            body="Tell us the vehicle and we'll show you where its value frontier lands — and the exact system we'd build to it."
            phone={PHONE}
            actions={<Button variant="primary">Find my system</Button>}
          />

          <Footer />
        </ScrollView>
      </View>
    </>
  )
}
