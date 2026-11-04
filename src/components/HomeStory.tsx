// The homepage story, sections 02–08, in the order a customer's questions come:
// what changed and how we design -> calibration -> how it works -> hear it in
// the demo cars -> what goes into a system -> common questions -> articles.
// Copy is the approved text in docs/homepage-story.md; edit it there first.

import React from 'react'
import { Platform, Text, View, useWindowDimensions } from 'react-native'
import {
  Container,
  Heading,
  Lead,
  Link,
  Section,
  SectionIntro,
  colors,
  fluidLineHeight,
  fonts,
  lineHeight,
  radius,
  type,
  useFluidPx,
} from '@/ui'
import { SITE, callLabel, telHref } from '@/lib/site'
import { JsonLd } from '@/components/JsonLd'

const IS_WEB = Platform.OS === 'web'

function useNarrow() {
  const { width } = useWindowDimensions()
  return width <= 760
}

// A body paragraph that can hold bold runs (Lead is the one paragraph style).
function P({ children }: { children: React.ReactNode }) {
  return <Lead>{children}</Lead>
}

function B({ children }: { children: React.ReactNode }) {
  return <Text style={{ fontWeight: '700', color: colors.ink } as any}>{children}</Text>
}

function Stack({ children, gap = 16 }: { children: React.ReactNode; gap?: number }) {
  return <View style={{ gap } as any}>{children}</View>
}

// A block with a hairline border, for steps, cars and system parts.
function Tile({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={
        {
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: radius.md,
          padding: 22,
          gap: 10,
          flex: 1,
          minWidth: 0,
        } as any
      }
    >
      {children}
    </View>
  )
}

function Grid({ cols, children }: { cols: number; children: React.ReactNode }) {
  const narrow = useNarrow()
  const n = narrow ? 1 : cols
  if (IS_WEB) {
    return (
      <View style={{ display: 'grid', gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, gap: 14 } as any}>
        {children}
      </View>
    )
  }
  return <View style={{ gap: 14 }}>{children}</View>
}

function BodyText({ children }: { children: React.ReactNode }) {
  const fontSize = useFluidPx(type.body)
  return (
    <Text
      style={
        {
          fontFamily: fonts.body,
          fontSize,
          lineHeight: fluidLineHeight(fontSize, lineHeight.body),
          color: colors.body,
        } as any
      }
    >
      {children}
    </Text>
  )
}

// ── 02 / Car audio has changed ──────────────────────────────────────────────
export function ChangeStory() {
  return (
    <Section>
      <Container>
        <View nativeID="design">
          <SectionIntro
            index="02"
            label="How we design"
            heading="Car audio has changed. So has the way we design systems."
          />
          <Stack>
            <P>
              For decades, a car audio system was a shopping list. You picked a set of front speakers at one price, an
              amplifier at another and a subwoofer at a third. They went into the car, and you got what you got. Nothing
              could correct the car around them, so spending more was the only way to try for better.
            </P>
            <P>
              Digital signal processors changed that. A processor measures how the system sounds inside the car and
              corrects it: the timing of each speaker, the balance between them, the peaks the car&apos;s interior adds
              on its own. Once that&apos;s possible, the price tag no longer decides the sound. Two things a processor
              can&apos;t change do: what each speaker can physically play, and how well it&apos;s installed.
            </P>
            <P>
              That&apos;s where we put the work. We&apos;ve done the math on every component we could use: how much
              clean output each speaker and subwoofer can produce, what each amplifier can drive, and which kinds of
              installs perform best in which kinds of vehicles. Every system we offer is built from those answers, with
              parts matched to each other and to the car, so each one does its job and none is wasted.
            </P>
            <P>
              <B>The result is more sound for the money at every price, not just at the top.</B>
            </P>
          </Stack>
        </View>
      </Container>
    </Section>
  )
}

// ── 03 / Calibration ────────────────────────────────────────────────────────
export function Calibration() {
  return (
    <Section>
      <Container>
        <SectionIntro
          index="03"
          label="Calibration"
          heading="Calibrated, not just installed."
          body="Once your system is in, we place a measurement microphone where you sit and set the processor so every speaker reaches you at the same moment and in balance with the others. It's the step that turns well-chosen parts into one system, and every car we build gets it."
          paddingBottom={0}
        />
      </Container>
    </Section>
  )
}

// ── 04 / How it works ───────────────────────────────────────────────────────
const STEPS: [title: string, text: string][] = [
  ['Find your car.', 'Enter its year, make and model to see the systems pre-engineered for it, each with its installed price.'],
  ['Choose a system.', 'Like choosing a trim level: each step up says what it adds.'],
  [
    'Call us.',
    "We'll confirm the system for your car and set a date. For some builds we'll ask you to bring the car by first, so we can plan the install together.",
  ],
  [
    'We take the time it needs.',
    "Most systems spend a few days in the shop. Custom work, like a subwoofer built into the car's floor, takes longer, and we don't rush it.",
  ],
  ['Drive away calibrated.', 'We calibrate the system in your car and walk you through it before you leave.'],
]

export function HowItWorksSteps() {
  const numSize = useFluidPx(type.h3)
  return (
    <Section>
      <Container>
        <SectionIntro index="04" label="How it works" heading="How it works" />
        <Grid cols={5}>
          {STEPS.map(([title, text], i) => (
            <Tile key={title}>
              <Text style={{ fontFamily: fonts.display, fontWeight: '800', fontSize: numSize, color: colors.accent } as any}>
                {String(i + 1)}
              </Text>
              <Heading level="h5" as={3}>
                {title}
              </Heading>
              <BodyText>{text}</BodyText>
            </Tile>
          ))}
        </Grid>
      </Container>
    </Section>
  )
}

// ── 05 / Demo cars ──────────────────────────────────────────────────────────
// Lowest system to highest, so the list reads like the ladder on a vehicle page.
const DEMO_CARS: [car: string, text: string][] = [
  [
    '2014 BMW 328i xDrive',
    'The factory speakers kept, with a processor, amplifiers and a subwoofer added. Our simplest kind of system.',
  ],
  [
    '2008 Mini Cooper S',
    'Our entry front speakers on our entry electronics, with an 18-inch subwoofer where the back seat was.',
  ],
  ['2018 Volkswagen Golf Alltrack', 'Two 18-inch subwoofers built into the cargo floor, with our top front speakers.'],
  [
    '2015 Honda CR-V',
    'Our biggest system: two 15-inch subwoofers built into the cargo floor, a second, smaller subwoofer under the passenger seat, and a lithium battery to power it.',
  ],
]

export function DemoCars() {
  const call = telHref()
  return (
    <Section>
      <Container>
        <View nativeID="demo-cars">
          <SectionIntro
            index="05"
            label="Demo cars"
            heading="Hear every level before you decide."
            body="Four demo cars live at the shop, and between them they cover the range we build:"
          />
          <Grid cols={4}>
            {DEMO_CARS.map(([car, text]) => (
              <Tile key={car}>
                <Heading level="h5" as={3}>
                  {car}
                </Heading>
                <BodyText>{text}</BodyText>
              </Tile>
            ))}
          </Grid>
          <View style={{ marginTop: 24 } as any}>
            {call ? (
              <Link variant="cta" href={call}>
                {`${callLabel} to set a time to sit in them and listen.`}
              </Link>
            ) : (
              <P>Call to set a time to sit in them and listen.</P>
            )}
          </View>
        </View>
      </Container>
    </Section>
  )
}

// ── 06 / What goes into every system ────────────────────────────────────────
const SYSTEM_PARTS: [part: string, text: string][] = [
  ['Front speakers', 'The ones you hear most, chosen for what they can play cleanly and mounted to stay that way.'],
  ['Subwoofer', 'In an enclosure built to fit your car, or built into the car itself.'],
  ['Amplifiers', 'Each one sized to the speakers it drives.'],
  ['Processor', 'The piece that makes calibration possible.'],
  [
    'Radio',
    'Keep the factory radio or replace it. Either way, steering-wheel controls, calls, cameras and chimes keep working.',
  ],
  [
    'Installation',
    "Sound treatment where the car's panels need it, and wiring built to come apart cleanly for service.",
  ],
  ['Calibration', 'Set with a measurement microphone in your car.'],
]

export function SystemContents() {
  return (
    <Section>
      <Container>
        <SectionIntro index="06" label="Every system" heading="What goes into every system" />
        <Grid cols={2}>
          {SYSTEM_PARTS.map(([part, text]) => (
            <View
              key={part}
              style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 14, paddingBottom: 6, gap: 6 } as any}
            >
              <Heading level="h5" as={3}>
                {part}
              </Heading>
              <BodyText>{text}</BodyText>
            </View>
          ))}
        </Grid>
      </Container>
    </Section>
  )
}

// ── 07 / Common questions ───────────────────────────────────────────────────
// On web each answer is a native <details>: it opens on tap, and the answer's
// text is in the page whether open or closed, so search engines and LLMs read
// every one. The same list feeds the FAQ business details below.
export const QUESTIONS: [q: string, a: string][] = [
  [
    'How much does a system cost?',
    "It depends on your car and the system. Enter your year, make and model to see the installed price of every system we've engineered for it.",
  ],
  [
    'How long does an install take?',
    "Most systems spend a few days in the shop. Custom work takes longer, and we'll tell you how long when we plan it.",
  ],
  [
    'Is the work guaranteed?',
    "Yes, for as long as you own the vehicle. If something we installed stops working because of how we installed it, we fix it at no charge. Work that someone else changes afterward isn't covered. Parts carry their manufacturer's warranty, which is between you and the manufacturer. For some brands, such as Helix and Sundown, we handle the claim for you.",
  ],
  [
    "Will it affect my car's warranty?",
    "Under US law, adding an aftermarket system doesn't void your car's warranty by itself. The manufacturer would have to show that the installation caused the problem.",
  ],
  ['Can I keep my factory radio?', 'Yes, or we can replace it. Either way, everything tied to it keeps working.'],
  ['Will my phone still work?', 'Yes. Calls, voice commands and music come through the new system.'],
  ['Can I buy parts without installation?', "Yes. Call or text us with what you're looking for."],
]

function QuestionWeb({ q, a }: { q: string; a: string }) {
  const qSize = useFluidPx(type.h5)
  const aSize = useFluidPx(type.body)
  return React.createElement(
    'details',
    { style: { borderTop: `1px solid ${colors.line}`, padding: '16px 0' } },
    React.createElement(
      'summary',
      {
        style: {
          cursor: 'pointer',
          fontFamily: fonts.body,
          fontWeight: 700,
          fontSize: qSize,
          color: colors.ink,
          listStylePosition: 'inside',
        },
      },
      q,
    ),
    React.createElement(
      'p',
      {
        style: {
          margin: '12px 0 0',
          fontFamily: fonts.body,
          fontSize: aSize,
          lineHeight: 1.58,
          color: colors.body,
          maxWidth: 760,
        },
      },
      a,
    ),
  )
}

export function CommonQuestions() {
  return (
    <Section>
      <Container>
        <View nativeID="questions">
          <SectionIntro index="07" label="Questions" heading="Common questions" paddingBottom={12} />
          <View style={{ maxWidth: 900 } as any}>
            {QUESTIONS.map(([q, a]) =>
              IS_WEB ? (
                <QuestionWeb key={q} q={q} a={a} />
              ) : (
                <View key={q} style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingVertical: 16, gap: 8 }}>
                  <Heading level="h5" as={3}>
                    {q}
                  </Heading>
                  <BodyText>{a}</BodyText>
                </View>
              ),
            )}
          </View>
        </View>
      </Container>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: QUESTIONS.map(([q, a]) => ({
            '@type': 'Question',
            name: q,
            acceptedAnswer: { '@type': 'Answer', text: a },
          })),
        }}
      />
    </Section>
  )
}

// ── 08 / Articles ───────────────────────────────────────────────────────────
// Only articles that exist. Add a row here when one is published.
const ARTICLES: [title: string, dek: string, href: string][] = [
  [
    'The Sub Value Frontier',
    "Plot every subwoofer's measured output against its installed price and a curve emerges. The bend is where added spend stops buying bass you can hear. We build to the bend.",
    '/article',
  ],
]

export function Articles() {
  return (
    <Section>
      <Container>
        <View nativeID="articles">
          <SectionIntro
            index="08"
            label="Articles"
            heading="The reasoning behind our systems"
            body="Every engineering call we make comes from measurement. These write-ups walk through the tests and the data behind them."
          />
          <Grid cols={3}>
            {ARTICLES.map(([title, dek, href]) => (
              <Tile key={title}>
                <Heading level="h4" as={3}>
                  {title}
                </Heading>
                <BodyText>{dek}</BodyText>
                <Link variant="door" href={href}>
                  Read the article
                </Link>
              </Tile>
            ))}
          </Grid>
        </View>
      </Container>
    </Section>
  )
}

// ── Closing band: the finder again, for the visitor who read everything ─────
export function ClosingFinder({ children }: { children: React.ReactNode }) {
  return (
    <Section>
      <Container>
        <SectionIntro
          label="Find your car"
          heading="See what we'd build for your car."
          body={SITE.phone ? `Or ${callLabel.toLowerCase()} ${SITE.phoneDisplay ?? ''}.` : undefined}
        />
        {children}
      </Container>
    </Section>
  )
}
