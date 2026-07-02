import React from 'react'
import { Platform, Text, View, useWindowDimensions } from 'react-native'
import {
  Card,
  Container,
  Heading,
  IconArrow as UIIconArrow,
  Image,
  Lead,
  Link,
  Section,
  SectionIntro,
  fluid,
  fluidLineHeight,
  type,
  useFluidPx,
  useFluidValue,
} from '@/ui'
import { SubwooferFrontierChart } from './SubwooferFrontierChart'

// HowItWorks — methodology / "how it works" section, ported from HowItWorks.jsx.
// Builds two blocks faithfully:
//   1. HowItWorksIntro  -> .howto.howto-intro : opener h2 + lede column(s).
//   2. MethodologyHub   -> .mc : featured Subwoofers tall door + chart exhibit
//      (the SubwooferFrontierChart is a SEPARATE file; rendered here as a flagged
//      placeholder View), then the .mc-doors grid of per-stage doors.
//
// Resolved design tokens (literal values, from tokens.css):
//   ink #09080e  gray #333333  line #ececec  shape/surface #f5f5f5  white #ffffff
//   accent #0576cc  sky #3ba8e2  fg-1=ink  fg-2=gray  bg-2=shape  --radius-md 12px
//   fonts: display "Creato Display", body "Inter", mono "IBM Plex Mono"
// Section/container (home.css):
//   .section { padding-top: 96px }
//   .container { max-width: 1410px; margin: 0 auto; padding: 0 40px }  (22px mobile)
//   --ncsw-grid-gutter clamp(20px,1.7vw,32px) -> 32 here; compact -> 20.

// ---- Exact copy (verbatim from HowItWorks.jsx) ----

// HOWTO_DEFAULT_HEADING = <>See how innovation has<br/>changed everything.</>
const HOWTO_HEADING_L1 = 'See how innovation has'
const HOWTO_HEADING_L2 = 'changed everything.'

// HOWTO_DEFAULT_LEAD
const HOWTO_LEAD =
  'Around 2024, a signal processor that could carry a bit-perfect signal over USB ' +
  'and tune a system to a target curve reached $299 for the first time. Measuring ' +
  'the installed system and shaping its frequencies to a target curve decides how ' +
  'it sounds. The only two things the processor cannot change are the mechanical ' +
  'properties of the drivers and the integrity of their installation in the vehicle. ' +
  'So we design to exactly those two things. Each component is chosen against its ' +
  'mechanical limits, what it can actually play, at the level you listen, without ' +
  'distortion, settled by math and physics rather than by price. The installation is ' +
  'then held to the standard the tune depends on. The same method decides every ' +
  'stage: source, signal, front stage, amplification, subwoofer, enclosure, and the ' +
  'treatment that keeps the car quiet.'

// SUBS_BODY — copy for the featured (tall) Subwoofers door.
const SUBS_BODY =
  'Every subwoofer package is designed to a clean maximum volume. We model the ' +
  'driver, enclosure, amplifier, electrical demand, and DSP limit as one system, ' +
  'then tune the installed package so its full usable volume stays inside the ' +
  "driver's clean mechanical and thermal range. An entry package is not a lower " +
  'standard; it has a lower clean ceiling. More expensive packages buy more ' +
  'displacement, stronger motors, more thermal reserve, and lower stress at the same ' +
  'output. The method is identical at every tier: define the target, verify the ' +
  'data, compute the limit, install the package, measure it in the vehicle, and set ' +
  'the system so it is not asked to play past what it can reproduce cleanly.'

// METHOD_DOORS: [key, label, img, copy, href?]  (subwoofers omitted — featured above)
const METHOD_DOORS: [string, string, string, string, string?][] = [
  [
    'source',
    'Source',
    'signal.webp',
    'In 2023, a Samsung phone became the first to deliver a full bit-perfect signal ' +
      'from streaming platforms like Apple Music and Tidal. The same phones also ' +
      'supported audio routing for voice calls over USB, and voice search and playback ' +
      'control. Today a Samsung phone with a paid Apple Music account is the safest and ' +
      'highest fidelity solution for source for no additional cost.',
    'Methodology - Source.html',
  ],
  [
    'signal',
    'Signal',
    'dsp.webp',
    'In 2024 Zapco introduced a $299 signal processor with a full Windows tuning ' +
      'application, optical input, and aptX HD Bluetooth. Together with bit-perfect ' +
      'streaming and voice call routing over USB, the phone now feeds a modern car’s ' +
      'system directly, which lowers the cost of a custom install while raising the ' +
      'quality of playback at every price point.',
  ],
  [
    'cs',
    'Front stage',
    'front-stage.jpeg',
    'Every front stage is built around the mechanical limits of its speakers, so none ' +
      'is asked to play where it strains or distorts. The physics is public. What was ' +
      'never practical was running it across the whole component-set market, so we used ' +
      "artificial intelligence to verify each set's parameters and rank them by clean " +
      'displacement, Vd = cone area × clean excursion (Sd × Xmax).',
  ],
  [
    'amplification',
    'Amplification',
    'amplifiers.jpeg',
    'Correctly installed and matched to the system, an amplifier disappears. A modern ' +
      'Class D amp like the Fosi Audio CA30 is small, efficient, and clean, and the ' +
      'processor corrects anything you could otherwise hear, so amplification stops ' +
      'being about sound and becomes a matter of design, the right amplifier for its ' +
      'limits, sized to the driver, and fed enough current to hold its voltage under load.',
  ],
  [
    'enclosure',
    'Enclosure',
    'enclosure.webp',
    'The enclosure is a component, not a container, and we compute it rather than copy ' +
      "it from a chart. We size the box to the driver's own compliance, damping, and " +
      'resonance, Qtc = Qts·√(1 + Vas/Vb), and to how your car’s cabin ' +
      'reinforces the low end, then fabricate it to fit that one driver in that one vehicle.',
  ],
  [
    'treatment',
    'Treatment',
    'treatment.webp',
    'Sound treatment exists to keep any part of the car from being excited into an ' +
      'instrument of its own. We damp resonant metal, decouple the plastic that would ' +
      'rattle, and absorb energy inside doors and cavities. Each material is chosen on ' +
      'its measured spec rather than its brand, and placed only where the panel needs ' +
      'it, so the work is exact and nothing is wasted.',
  ],
]

// Methodology image folder maps to /images on the web build.
const doorImg = (file: string) => `/images/methodology/${file}`

// ---- IconArrow (the .door "Continue reading ›" caret) ----
// Source uses <IconArrow s={15} />. Web: inline SVG; native: a text caret.
function IconArrow({ s }: { s?: number }) {
  const size = useFluidValue(s ?? 15, (s ?? 15) * 0.8)
  if (Platform.OS === 'web') {
    return React.createElement(
      'svg',
      {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 2.2,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        style: { display: 'inline-block' },
      },
      React.createElement('polyline', { points: '9 6 15 12 9 18' })
    )
  }
  return <Text style={{ color: '#0576cc' }}>{'›'}</Text>
}

// .door — "Continue reading ›" link row (font-mono-ish accent label).
function DoorLink() {
  const fontSize = useFluidPx(type.small)
  const gap = useFluidPx(fluid(8, 6))
  const marginTop = useFluidPx(fluid(12, 9))
  return (
    <View
      style={
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap,
          marginTop,
        } as any
      }
    >
      <Text
        style={
          {
            fontFamily: 'IBM Plex Mono',
            fontSize,
            fontWeight: '600',
            letterSpacing: 0.6, // .04em * ~15px (.door uses mono caps elsewhere)
            color: '#0576cc', // var(--accent)
          } as any
        }
      >
        Continue reading{' '}
      </Text>
      <IconArrow s={15} />
    </View>
  )
}

// .mc-door-media — 16:9 image with the top-down dark gradient + corner label.
// .mc-door-bg { background-size:cover; background-position:center }
// .mc-door-media::before { linear-gradient(to bottom, rgba(0,0,0,.55), rgba(0,0,0,0) 60%) }
// .mc-door-label { mono 13/600; uppercase; ls .04em; #fff; text-shadow }
function DoorMedia({ img, label }: { img?: string; label: string }) {
  const isWeb = Platform.OS === 'web'
  const labelSize = useFluidPx(type.small)
  const labelTop = useFluidPx(fluid(13, 10))
  const labelLeft = useFluidPx(fluid(15, 11))
  return (
    <View
      style={{
        position: 'relative',
        aspectRatio: 16 / 9,
        overflow: 'hidden',
        backgroundColor: '#0a0b0f', // .mc-door-media background
      }}
    >
      {/* .mc-door-bg */}
      {isWeb && img
        ? React.createElement('div', {
            style: {
              position: 'absolute',
              inset: 0,
              backgroundImage: `url(${img})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            },
          })
        : null}
      {/* .mc-door-media::before — top gradient */}
      <View
        style={
          {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 1,
            backgroundImage:
              'linear-gradient(to bottom, rgba(0,0,0,.55), rgba(0,0,0,0) 60%)',
          } as any
        }
      />
      {/* .mc-door-label */}
      <Text
        style={
          {
            position: 'absolute',
            top: labelTop,
            left: labelLeft,
            zIndex: 2,
            fontFamily: 'IBM Plex Mono',
            fontSize: labelSize,
            fontWeight: '600',
            letterSpacing: 0.52, // .04em * 13px
            textTransform: 'uppercase',
            color: '#fff',
            textShadow: '0 1px 3px rgba(0,0,0,.85)',
          } as any
        }
      >
        {label}
      </Text>
    </View>
  )
}

// .mc-door — bordered white card: media on top, body (greek copy + door link).
function MethodDoor({
  label,
  img,
  copy,
}: {
  label: string
  img?: string
  copy: string
}) {
  const copySize = useFluidPx(type.small)
  const copyLineHeight = fluidLineHeight(copySize, 1.52)
  const padTop = useFluidPx(fluid(15, 12))
  const padX = useFluidPx(fluid(16, 12))
  const padBottom = useFluidPx(fluid(17, 13))
  return (
    <View
      style={{
        flex: 1,
        borderWidth: 1,
        borderColor: '#ececec', // var(--ncsw-line)
        borderRadius: 14, // .mc-door
        overflow: 'hidden',
        backgroundColor: '#fff',
      }}
    >
      <DoorMedia img={img} label={label} />
      {/* .mc-door-body { padding: 15px 16px 17px } */}
      <View style={{ paddingTop: padTop, paddingHorizontal: padX, paddingBottom: padBottom, flex: 1 } as any}>
        {/* .mc-door-greek */}
        <Text
          style={
            {
              fontFamily: 'Inter',
              fontSize: copySize,
              lineHeight: copyLineHeight,
              color: '#333333', // var(--fg-2)
            } as any
          }
        >
          {copy}
        </Text>
        <DoorLink />
      </View>
    </View>
  )
}

// HowItWorksIntro removed — SectionIntro now owns the eyebrow + heading + lede.

// MethodologyHub — .mc : featured tall Subwoofers door + chart exhibit, then
// the .mc-doors grid of per-stage doors.
function MethodologyHub() {
  const { width } = useWindowDimensions()
  const isWeb = Platform.OS === 'web'
  const gridGutter = useFluidPx(fluid(32, 20)) // --ncsw-grid-gutter, no ceiling
  const topMargin = useFluidPx(fluid(52, 36))
  const iconSize = useFluidValue(15, 12)
  // .mc-doors: 3 cols; @max 940px -> 2 cols.
  const doorCols = isWeb ? (width <= 940 ? 2 : 3) : 1

  return (
    // .mc { margin-top: 52px }
    <View style={{ marginTop: topMargin } as any}>
      {/* .mc-grid : repeat(3, minmax(0,1fr)); tall door at col 1 + chart exhibit. */}
      <View
        style={
          {
            display: isWeb ? 'grid' : 'flex',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: gridGutter,
            // 'stretch' let the shorter sibling silently inherit blank space
            // from the taller one instead of both sizing off their own fluid
            // content — that's what made the chart look height-locked. Each
            // column now sizes to its own content/aspect-ratio.
            alignItems: 'flex-start',
            ...(isWeb ? {} : { flexDirection: 'column' }),
          } as any
        }
      >
        {/* Featured Subwoofers card — built from the design-system Card primitive
            so the whole surface is the tap target and the footer takes on the
            hover tint, matching the /components reference. The image no longer
            carries a label overlay; the section heading lives inside the body
            where headings belong. */}
        <View style={(isWeb ? { gridColumn: 1 } : null) as any}>
          <Card href="/methodology/subwoofers">
            <Card.Media aspectRatio={16 / 9}>
              <Image
                src={doorImg('subwoofers.webp')}
                fill
                objectFit="cover"
                alt="Subwoofers methodology"
              />
            </Card.Media>
            <Card.Body>
              <Heading level="h4">Subwoofers</Heading>
              <Lead size="body">{SUBS_BODY}</Lead>
            </Card.Body>
            <Card.Footer>
              <Link variant="door" icon={<UIIconArrow size={iconSize} />}>
                Continue reading
              </Link>
            </Card.Footer>
          </Card>
        </View>

        {/* .mc-exhibit — the live SubwooferFrontierChart exhibit. */}
        <View
          style={
            {
              ...(isWeb ? { gridColumn: '2 / span 2' } : {}),
              width: '100%',
            } as any
          }
        >
          <SubwooferFrontierChart />
        </View>
      </View>

      {/* .mc-doors { margin-top: var(--gutter); grid repeat(3, minmax(0,1fr)) } */}
      <View
        style={
          {
            marginTop: gridGutter,
            display: isWeb ? 'grid' : 'flex',
            gridTemplateColumns: `repeat(${doorCols}, minmax(0, 1fr))`,
            gap: gridGutter,
            ...(isWeb ? {} : { flexDirection: 'column' }),
          } as any
        }
      >
        {METHOD_DOORS.map(([key, label, img, copy]) => (
          <MethodDoor key={key} label={label} img={doorImg(img)} copy={copy} />
        ))}
      </View>
    </View>
  )
}

// HowItWorks — the full methodology section: .section > .container wrapper around
// the intro opener and the methodology hub.
export function HowItWorks() {
  return (
    <Section>
      <Container>
        <SectionIntro
          index="02"
          label="Our Methodology"
          heading={`${HOWTO_HEADING_L1}\n${HOWTO_HEADING_L2}`}
          level="h2"
          body={HOWTO_LEAD}
        />
        <MethodologyHub />
      </Container>
    </Section>
  )
}
