import React from 'react'
import { Linking, Platform, Text, View, useWindowDimensions } from 'react-native'
import { Button, Container, Lead, Section, colors, type, useFluidPx } from '@/ui'

// Hero — values taken verbatim from the source tokens.css / home.css:
//   .hero { padding: 64px 0 0 }
//   .container { max-width: 1410px; margin: 0 auto; padding: 0 40px }  (0 22px mobile)
//   .hero-wordmark { display:block; width:100%; max-width:760px; height:auto }
//   .hero-statement { display:grid; grid-template-columns:1fr; gap:28px; margin-top:24px }
//   .hero-lede { max-width:760px; font-size:22px; line-height:1.45; font-weight:400; color:#09080e }
//   .hero-call — the CTA below the paragraph, mobile web/tablet/native only
//   (standard heading -> copy -> CTA hero pattern). Desktop nav already
//   shows the number as plain text, so no CTA is shown here on desktop —
//   see Nav.tsx.
//   .montage { margin-top:56px }
//   .montage-grid { grid; repeat(4,1fr); gap:1px; background:#1b1b1b; overflow:hidden }  (1fr 1fr mobile)
//   .montage-cell { aspect-ratio:3/4; overflow:hidden; background:#000 }
//   .montage-cell video { object-fit:cover; filter:grayscale(.35) contrast(1.05) }
//   .montage-cell::after { linear-gradient(to top, rgba(0,0,0,.6) 0%, rgba(0,0,0,0) 42%) }

// .hero-lede content (verbatim from Hero.jsx STATEMENT).
const STATEMENT =
  "North Coast Soundworks is Cleveland's MECP-certified car audio specialist. We provide " +
  'factory-integrated audio system design, fabrication, and tuning. This work includes hands-free signal ' +
  'integration, amplifier and speaker installation, subwoofer enclosure fabrication, and ' +
  'measurement-based digital signal processor tuning.'

// MONTAGE order from Hero.jsx: audison(01), bmw(02), alfa(03), kia(04).
const MONTAGE = [
  '/video/install-audison.mp4',
  '/video/install-bmw.mp4',
  '/video/install-alfa.mp4',
  '/video/install-kia.mp4',
]

const PHONE_NUMBER = '(216) 555-0114'

function callShop() {
  const href = 'tel:+12165550114'
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.location.href = href
  } else {
    Linking.openURL(href).catch(() => {})
  }
}

// .hero-lede — uses the Lead primitive at heroLead size (22px ref) so
// body color / max-width / line-height flow from tokens.
function HeroLede() {
  return <Lead size="heroLead">{STATEMENT}</Lead>
}

// .hero-call — the CTA button, mobile web/tablet/native only. No spacing
// of its own — it's a sibling of HeroLede inside the same gapped column
// (see Hero()), not a section with its own before/after rhythm.
function HeroCta() {
  return (
    <Button onPress={callShop}>
      Call {PHONE_NUMBER}
    </Button>
  )
}

// One .montage-cell with its <video> and the ::after gradient overlay (web).
function MontageCell({ src }: { src: string }) {
  return (
    <View
      style={{
        position: 'relative',
        aspectRatio: 3 / 4,
        overflow: 'hidden',
        backgroundColor: colors.black,
      }}
    >
      {React.createElement('video', {
        src,
        autoPlay: true,
        muted: true,
        loop: true,
        playsInline: true,
        style: {
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block',
          filter: 'grayscale(.35) contrast(1.05)',
        },
      })}
      {/* .montage-cell::after */}
      <View
        style={
          {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundImage: 'linear-gradient(to top, rgba(0,0,0,.6) 0%, rgba(0,0,0,0) 42%)',
          } as any
        }
      />
    </View>
  )
}

export function Hero() {
  const { width } = useWindowDimensions()
  const isWeb = Platform.OS === 'web'
  const narrow = width <= 760
  const cols = isWeb && !narrow ? 4 : 2
  const nativeWordmarkSize = useFluidPx(type.h2)
  // Mobile web, tablet, and native — anywhere the nav doesn't show the
  // phone number (see Nav.tsx's showPhoneAsText, which is the desktop-only
  // inverse of this).
  const showCta = !isWeb || width <= 900

  // ---- Native fallback: text wordmark (SVG <Image> needs react-native-svg) ----
  const Wordmark = isWeb ? (
    <View style={{ lineHeight: 0 } as any}>
      {React.createElement('img', {
        src: '/brand/NCSW-wordmark-full.svg',
        alt: 'North Coast Soundworks',
        className: 'ncsw-hero-word', // entrance: translateY 40 -> 0 + fade (public/ncsw.css)
        style: { display: 'block', width: '45%', height: 'auto' },
      })}
    </View>
  ) : (
    <Text
      style={{
        fontFamily: 'Creato Display',
        fontSize: nativeWordmarkSize as number,
        fontWeight: '700',
        letterSpacing: -1.4,
        color: colors.ink,
      }}
    >
      NORTH COAST SOUNDWORKS
    </Text>
  )

  return (
    // .hero { padding: 64px 0 0 } — Section primitive owns the top spacing.
    <Section top={64}>
      {/* .hero > .container : wordmark + statement */}
      <Container>
        <View>{Wordmark}</View>
        <View style={{ marginTop: 24, gap: 28 }}>
          <HeroLede />
          {showCta ? <HeroCta /> : null}
        </View>
      </Container>

      {/* .montage > .container > .montage-grid */}
      <View style={{ marginTop: 56 }}>
        <Container>
          <View
            style={
              {
                display: isWeb ? 'grid' : 'flex',
                gridTemplateColumns: `repeat(${cols}, 1fr)`,
                gap: 1,
                backgroundColor: colors.mediaDark,
                overflow: 'hidden',
                ...(isWeb ? {} : { flexDirection: 'row', flexWrap: 'wrap' }),
              } as any
            }
          >
            {MONTAGE.map((src) =>
              isWeb ? (
                <MontageCell key={src} src={src} />
              ) : (
                // Native: dark placeholder cell (no web <video>), 2-up, aspect 3/4.
                <View
                  key={src}
                  style={{ width: '50%', aspectRatio: 3 / 4, backgroundColor: colors.black }}
                />
              )
            )}
          </View>
        </Container>
      </View>
    </Section>
  )
}
