import React from 'react'
import { Platform, ScrollView, Text, View, useWindowDimensions } from 'react-native'
import Head from 'expo-router/head'
import {
  Button,
  Card,
  Container,
  Eyebrow,
  Heading,
  IconArrow,
  Image,
  Lead,
  Link,
  FullWidthCopyContext,
  Shelf,
  colors,
  copyMaxWidth,
  fluid,
  fluidLineHeight,
  fonts,
  radius,
  type,
  useFluidPx,
} from '@/ui'
import { SiteNav, type NavLinkItem } from '@/components/SiteNav'
import { Footer } from '@/components/Footer'

// Article template — the editorial / blog render pattern, published as a static
// route so it can be reviewed and iterated live on Vercel (same approach as
// pdp.tsx). Content is a sample methodology piece ("The Sub Value Frontier");
// it will be parameterised from the Directus `articles` collection via
// generateStaticParams once the data lands. Every block is composed from the
// shared primitives + tokens.
//
// The presentational job of this template: render an article HEADER (kicker,
// title, dek, Brett Combs byline), a BODY of typographic blocks (paragraph,
// sub-head, pull-quote, list) interleaved with the site's data FIGURES (the
// "component set" — value-frontier scatter, labelled bars), an AUTHOR card
// (E-E-A-T), a RELATED shelf, and a CTA. Named-voice decision: NCSW publishes,
// Brett Combs is the Person author on editorial.

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

function useVal(anchor: number, floor: number) {
  return useFluidPx(fluid(anchor, floor))
}

// ── Sample article (stands in for a Directus `articles` record) ─────────────
type FigureSpec =
  | { type: 'frontier'; caption?: string }
  | { type: 'bars'; caption?: string; unit?: string; rows: [string, number, boolean][] }

type Block =
  | { k: 'p'; text: string }
  | { k: 'h'; text: string }
  | { k: 'quote'; text: string }
  | { k: 'list'; items: string[] }
  | { k: 'figure'; figure: FigureSpec }

const ARTICLE = {
  slug: 'sub-value-frontier',
  category: 'Methodology',
  title: 'The Sub Value Frontier',
  reading_time: '8 min read',
  author: 'Brett Combs',
  author_role: 'Owner & installer, North Coast Soundworks',
  publish_date: 'June 18, 2026',
  excerpt:
    'Plot every subwoofer we carry against its installed price and a curve appears. The bend in that curve is where more money stops buying more bass you can actually hear. We build to the bend — and here is the data that decides where it is.',
}

// The article body — a sequence of typographic blocks with one figure spliced
// in. In the wired version these come from `article.body` (Markdown) plus the
// `article.figures` JSON; the template only ever renders the resolved blocks.
const BODY: Block[] = [
  {
    k: 'p',
    text:
      "There are more than two hundred subwoofers we could put in your car, and the spec sheets will tell you almost nothing useful about how they rank against each other. Power ratings are marketing. Cone size is geometry, not output. The only honest comparison is the one we run ourselves: the same measurement, on the same rig, for every driver — and then the same question asked of all of them. For the money it costs to put this in a car, how much bass do you actually get?",
  },
  {
    k: 'p',
    text:
      "When you plot that — installed price on one axis, measured impact on the other — the drivers do not scatter randomly. They pile up under a curve. A handful sit right on its leading edge, and everything else falls somewhere beneath them, beaten by a driver that costs the same or less and hits the same or harder. Economists call that leading edge a Pareto frontier. We just call it the answer.",
  },
  { k: 'h', text: 'What the curve actually shows' },
  {
    k: 'p',
    text:
      "The frontier is steep at first. In the first few hundred dollars, every additional dollar buys a lot of measurable output — the curve climbs fast. Then it bends. Past the bend, the line goes nearly flat: you can keep spending, and the drivers keep getting more expensive, but the measured output barely moves. That flat stretch is where the car-audio industry makes most of its margin and delivers almost none of its value.",
  },
  { k: 'quote', text: 'Past the bend, you are paying for a number on a box, not for bass you can hear.' },
  {
    k: 'p',
    text:
      "The bars below are the same measurement expressed a second way — output normalized so the frontier drivers sit near the top. The highlighted bar is the one our evaluation selects for a typical sealed build in a mid-size cabin. Notice how little separates it from drivers costing twice as much, and how far it sits above the budget end.",
  },
  {
    k: 'figure',
    figure: {
      type: 'bars',
      unit: 'Measured output, normalized',
      caption: 'Six representative drivers across the price range. The highlighted bar is our sealed-build selection.',
      rows: [
        ['A', 58, false],
        ['B', 71, false],
        ['C', 79, false],
        ['D', 92, true],
        ['E', 94, false],
        ['F', 95, false],
      ],
    },
  },
  { k: 'h', text: 'Building to the bend' },
  {
    k: 'p',
    text:
      "Every package we sell is anchored to a driver on or just past that bend. It is the single decision that does the most to determine whether a system is a good buy, and it is the one most shops get wrong — either by defaulting to whatever brand pays for the endcap, or by chasing the biggest number the customer's budget allows. We do neither. We read the curve for your cabin and your budget, and we put the money where the measurement says it stops mattering.",
  },
  {
    k: 'p',
    text:
      "That is also why our recommendation changes with the car. A frontier driver in a compact sedan is not the frontier driver in a truck — the cabin does different work, and the curve shifts. The method is fixed; the answer is specific. What follows on every product page is that specific answer, with the arithmetic that produced it shown in the open.",
  },
  { k: 'list', items: [
    'Same measurement rig for every driver — no spec-sheet comparisons.',
    'Impact measured, not rated; price is installed, not MSRP.',
    'The selected driver is the one on the frontier for your cabin and budget.',
    'The reasoning is published on the page, not kept in the shop.',
  ] },
  {
    k: 'p',
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

// ── Data figures (the "component set") ──────────────────────────────────────
// Value-frontier scatter. Geometry ported from the homepage MiniFrontier, sized
// up for an in-article figure with axis labels and a legend.
const FR_POINTS: { id: number; price: number; impact: number }[] = [
  { id: 1, price: 180, impact: 24 }, { id: 2, price: 260, impact: 31 }, { id: 3, price: 340, impact: 34 },
  { id: 4, price: 430, impact: 42 }, { id: 5, price: 560, impact: 39 }, { id: 6, price: 640, impact: 48 },
  { id: 7, price: 760, impact: 45 }, { id: 8, price: 890, impact: 53 }, { id: 9, price: 1040, impact: 55 },
  { id: 10, price: 1240, impact: 56 }, { id: 11, price: 1380, impact: 58 }, { id: 12, price: 500, impact: 28 },
  { id: 13, price: 720, impact: 51 }, { id: 14, price: 980, impact: 49 },
]
function paretoFrontier(points: typeof FR_POINTS) {
  return points
    .filter((p) => !points.some((q) => q !== p && q.price <= p.price && q.impact >= p.impact && (q.price < p.price || q.impact > p.impact)))
    .sort((a, b) => a.price - b.price)
}

function FrontierFigure() {
  const frontier = paretoFrontier(FR_POINTS)
  const fids = new Set(frontier.map((p) => p.id))
  const W = 660, H = 300, padL = 44, padR = 16, padT = 18, padB = 40
  const xMin = 120, xMax = 1400, yMin = 18, yMax = 62
  const sx = (p: number) => padL + ((p - xMin) / (xMax - xMin)) * (W - padL - padR)
  const sy = (v: number) => H - padB - ((v - yMin) / (yMax - yMin)) * (H - padT - padB)
  const line = frontier.map((p, i) => (i ? 'L' : 'M') + sx(p.price).toFixed(1) + ' ' + sy(p.impact).toFixed(1)).join(' ')

  const body = IS_WEB
    ? (React.createElement(
        'svg',
        { viewBox: `0 0 ${W} ${H}`, style: { width: '100%', height: 'auto', display: 'block' } },
        ...[25, 35, 45, 55].map((t) =>
          React.createElement('line', { key: `g${t}`, x1: padL, y1: sy(t), x2: W - padR, y2: sy(t), stroke: colors.line, strokeWidth: 1 }),
        ),
        ...[25, 35, 45, 55].map((t) =>
          React.createElement('text', { key: `yl${t}`, x: padL - 8, y: sy(t) + 3, textAnchor: 'end', fontFamily: fonts.mono, fontSize: 10, fill: colors.chartAxisSoft }, String(t)),
        ),
        React.createElement('text', { x: padL, y: H - 12, fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1, fill: colors.chartAxisSoft }, 'INSTALLED PRICE →'),
        React.createElement('text', { x: 6, y: padT + 4, fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1, fill: colors.chartAxisSoft }, 'IMPACT'),
        React.createElement('path', { d: line, fill: 'none', stroke: colors.accent, strokeWidth: 1.8, strokeDasharray: '6 5' }),
        ...FR_POINTS.filter((p) => !fids.has(p.id)).map((p) =>
          React.createElement('circle', { key: `d${p.id}`, cx: sx(p.price), cy: sy(p.impact), r: 4, fill: colors.chartDotMuted }),
        ),
        ...frontier.map((p) =>
          React.createElement('circle', { key: `f${p.id}`, cx: sx(p.price), cy: sy(p.impact), r: 5, fill: colors.accent, stroke: colors.white, strokeWidth: 1.5 }),
        ),
      ) as any)
    : (
        <View style={{ width: '100%', aspectRatio: W / H, position: 'relative' }}>
          {FR_POINTS.map((p) => {
            const on = fids.has(p.id)
            const r = on ? 5 : 4
            return (
              <View
                key={p.id}
                style={{
                  position: 'absolute',
                  left: `${(sx(p.price) / W) * 100}%`,
                  top: `${(sy(p.impact) / H) * 100}%`,
                  width: r * 2, height: r * 2, marginLeft: -r, marginTop: -r, borderRadius: r,
                  backgroundColor: on ? colors.accent : colors.chartDotMuted,
                  borderWidth: on ? 1.5 : 0, borderColor: colors.white,
                }}
              />
            )
          })}
        </View>
      )

  return (
    <View style={{ backgroundColor: colors.figBg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: 20 }}>
      <View style={{ width: '100%' }}>{body}</View>
      <View style={{ flexDirection: 'row', gap: 16, marginTop: 10 } as any}>
        <LegendDot color={colors.accent} label="On frontier" />
        <LegendDot color={colors.chartDotMuted} label="Dominated" />
      </View>
    </View>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  const size = useFluidPx(type.meta)
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 } as any}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <Text style={{ fontFamily: fonts.body, textTransform: 'uppercase', letterSpacing: 0.9, fontWeight: '600', fontSize: size, color: colors.gray } as any}>
        {label}
      </Text>
    </View>
  )
}

// Labelled horizontal bars (blind-amp style).
function BarsFigure({ rows, unit }: { rows: [string, number, boolean][]; unit?: string }) {
  const labelSize = useFluidPx(type.meta)
  return (
    <View style={{ backgroundColor: colors.figBg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: 20 }}>
      {unit ? (
        <Text style={{ fontFamily: fonts.mono, fontSize: labelSize, letterSpacing: 0.5, textTransform: 'uppercase', color: colors.gray, marginBottom: 14 } as any}>
          {unit}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'column', gap: 9 } as any}>
        {rows.map(([label, w, hi]) => (
          <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 } as any}>
            <Text style={{ fontFamily: fonts.mono, fontVariant: ['tabular-nums'], fontSize: labelSize, color: colors.gray, width: 22 } as any}>{label}</Text>
            <View style={{ height: 10, backgroundColor: colors.line, flex: 1, overflow: 'hidden', borderRadius: 2 }}>
              <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${w}%`, backgroundColor: hi ? colors.accent : colors.ink }} />
            </View>
          </View>
        ))}
      </View>
    </View>
  )
}

function ArticleFigure({ figure }: { figure: FigureSpec }) {
  const capSize = useFluidPx(type.small)
  return (
    <View style={{ width: '100%', maxWidth: copyMaxWidth, marginVertical: useVal(20, 16) as any } as any}>
      {figure.type === 'frontier' ? <FrontierFigure /> : <BarsFigure rows={figure.rows} unit={figure.unit} />}
      {figure.caption ? (
        <Text style={{ fontFamily: fonts.body, fontSize: capSize, color: colors.gray, lineHeight: 20, marginTop: 12, maxWidth: 640 } as any}>
          {figure.caption}
        </Text>
      ) : null}
    </View>
  )
}

// ── Prose block renderer ────────────────────────────────────────────────────
function Prose({ blocks }: { blocks: Block[] }) {
  const pSize = useFluidPx(type.lead)
  const pLine = fluidLineHeight(pSize, 1.62)
  const quoteSize = useFluidPx(type.h3)
  const quoteLine = fluidLineHeight(quoteSize, 1.3)
  const liSize = useFluidPx(type.lead)
  const gap = useVal(22, 18)

  return (
    <View>
      {blocks.map((b, i) => {
        if (b.k === 'figure') return <ArticleFigure key={i} figure={b.figure} />
        if (b.k === 'h')
          return (
            // Heading self-constrains to copyMaxWidth (60%) — no wrapper clamp.
            <View key={i} style={{ marginTop: useVal(44, 32) as any, marginBottom: 6 } as any}>
              <Heading level="h3">{b.text}</Heading>
            </View>
          )
        if (b.k === 'quote')
          return (
            <View key={i} style={{ maxWidth: copyMaxWidth, marginVertical: useVal(34, 26) as any, borderLeftWidth: 3, borderLeftColor: colors.accent, paddingLeft: 22 } as any}>
              <Text style={{ fontFamily: fonts.display, fontSize: quoteSize, lineHeight: quoteLine, letterSpacing: -0.5, color: colors.ink } as any}>
                {b.text}
              </Text>
            </View>
          )
        if (b.k === 'list')
          return (
            <View key={i} style={{ maxWidth: copyMaxWidth, marginTop: gap, gap: 10 } as any}>
              {b.items.map((it, j) => (
                <View key={j} style={{ flexDirection: 'row', gap: 12 } as any}>
                  <Text style={{ fontFamily: fonts.mono, fontSize: liSize, color: colors.accent, lineHeight: pLine as any } as any}>—</Text>
                  <Text style={{ fontFamily: fonts.body, fontSize: liSize, color: colors.body, lineHeight: pLine as any, flex: 1 } as any}>{it}</Text>
                </View>
              ))}
            </View>
          )
        return (
          <Text key={i} style={{ fontFamily: fonts.body, fontSize: pSize, lineHeight: pLine as any, color: colors.body, maxWidth: copyMaxWidth, marginTop: gap } as any}>
            {b.text}
          </Text>
        )
      })}
    </View>
  )
}

// ── Author card (E-E-A-T anchor) ────────────────────────────────────────────
function AuthorCard() {
  const bioSize = useFluidPx(type.small)
  const { width } = useWindowDimensions()
  const narrow = width <= 900
  return (
    <View
      style={{
        flexDirection: narrow ? 'column' : 'row',
        gap: 22,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: radius.lg,
        backgroundColor: colors.white,
        padding: useVal(28, 22) as any,
      } as any}
    >
      <View style={{ flex: 1 }}>
        <Eyebrow>Written by</Eyebrow>
        <View style={{ height: 8 }} />
        <Heading level="h4">{ARTICLE.author}</Heading>
        <Text style={{ fontFamily: fonts.body, fontSize: bioSize, color: colors.body, lineHeight: 22, marginTop: 8, maxWidth: 640 } as any}>
          Brett owns and runs the bench at North Coast Soundworks in Cleveland. Every measurement, ranking, and build method
          published here comes off his own rig — the reasoning is the product, and it carries his name.
        </Text>
      </View>
    </View>
  )
}

// ── Related card ────────────────────────────────────────────────────────────
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

// ── JSON-LD (BlogPosting) ───────────────────────────────────────────────────
const LD = {
  '@context': 'https://schema.org',
  '@type': 'BlogPosting',
  headline: ARTICLE.title,
  description: ARTICLE.excerpt,
  articleSection: ARTICLE.category,
  author: { '@type': 'Person', name: ARTICLE.author },
  publisher: { '@type': 'Organization', name: 'North Coast Soundworks' },
}

export default function ArticleScreen() {
  const outer: any = IS_WEB ? { height: '100dvh', flexDirection: 'column' } : { flex: 1, flexDirection: 'column' }

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

          {/* Header — a rule with the byline flush-right (eyebrow format),
              then the full-width h2 title and lead. */}
          <Container>
            <View style={{ paddingTop: useVal(30, 22) as any } as any}>
              {/* Rule carrying the byline flush-right, in eyebrow format. */}
              <View style={{ borderTopWidth: 1, borderTopColor: colors.ink, paddingTop: 14, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' } as any}>
                <Eyebrow>{`By ${ARTICLE.author} / ${ARTICLE.publish_date}`}</Eyebrow>
              </View>
              <View style={{ height: 24 }} />
              <FullWidthCopyContext.Provider value={true}>
                <Heading level="h2">{ARTICLE.title}</Heading>
              </FullWidthCopyContext.Provider>
              <View style={{ height: 20 }} />
              <Lead>{ARTICLE.excerpt}</Lead>
            </View>
          </Container>

          {/* Hero image — POFC placeholder (landing "Source" methodology
              photo), at the content measure — replaces the old chart. */}
          <Container>
            <View style={{ marginTop: useVal(36, 28) as any, width: '100%', maxWidth: copyMaxWidth, aspectRatio: 16 / 9, borderRadius: radius.md, overflow: 'hidden', borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface } as any}>
              <Image src="/images/methodology/signal.webp" fill objectFit="cover" alt="" />
            </View>
          </Container>

          {/* Body — copy constrained to the landing's copyMaxWidth (60%). */}
          <Container>
            <View style={{ marginTop: useVal(20, 16) as any } as any}>
              <Prose blocks={BODY} />
            </View>
          </Container>

          {/* Author */}
          <Container>
            <View style={{ marginTop: useVal(56, 40) as any, maxWidth: copyMaxWidth } as any}>
              <AuthorCard />
            </View>
          </Container>

          {/* Related */}
          <Container>
            <View style={{ marginTop: useVal(72, 48) as any } as any}>
              <View style={{ borderTopWidth: 1, borderTopColor: colors.ink, paddingTop: 14, marginBottom: useVal(28, 22) as any, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' } as any}>
                <Eyebrow>Keep reading</Eyebrow>
                <Link variant="door" href="/" icon={<IconArrow size={15} />}>All articles</Link>
              </View>
              <Shelf>
                {RELATED.map((item) => (
                  <RelatedCard key={item.title} item={item} />
                ))}
              </Shelf>
            </View>
          </Container>

          {/* CTA */}
          <View style={{ marginTop: useVal(88, 56) as any, borderTopWidth: 1, borderTopColor: colors.ink }}>
            <Container>
              <View
                style={{
                  flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 28, flexWrap: 'wrap',
                  paddingTop: useVal(40, 34) as any, paddingBottom: useVal(48, 40) as any,
                } as any}
              >
                <View>
                  <Heading level="h2sm">Have a car in mind?</Heading>
                  <Text style={{ fontFamily: fonts.body, fontSize: useFluidPx(type.small) as any, color: colors.gray, marginTop: 10, maxWidth: 460 } as any}>
                    Tell us the vehicle and we'll show you where its value frontier lands — and the exact system we'd build to it.
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Text style={{ fontFamily: fonts.mono, fontSize: useFluidPx(type.h4) as any, color: colors.ink } as any}>{PHONE}</Text>
                  <Button variant="primary">Find my system</Button>
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
