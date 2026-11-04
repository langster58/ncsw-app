import React from 'react'
import { Linking, Platform, View, useWindowDimensions } from 'react-native'
import { Button, Container, FullWidthCopyContext, Heading, Lead, Section, colors } from '@/ui'
import { VehicleFinder } from '@/components/VehicleFinder'
import { SITE, callLabel, telHref } from '@/lib/site'

// Hero — the homepage's first screen. Order, top to bottom:
//   the page's one main heading (h1) ->
//   the trust sentence and the method sentence -> the vehicle finder ->
//   Call or text (only once the shop has a number, see src/lib/site.ts) ->
//   the install montage.
// Copy is the approved first screen in docs/homepage-story.md.
// Layout values from the source home.css:
//   .hero { padding: 64px 0 0 }
//   .montage { margin-top:32px } (source 56)
//   .montage-grid { grid; repeat(4,1fr); gap:1px; background:#1b1b1b; overflow:hidden }  (1fr 1fr mobile)
//   .montage-cell { aspect-ratio:3/4; overflow:hidden; background:#000 }
//   .montage-cell video { object-fit:cover; filter:grayscale(.35) contrast(1.05) }
//   .montage-cell::after { linear-gradient(to top, rgba(0,0,0,.6) 0%, rgba(0,0,0,0) 42%) }

const HEADING = 'Car audio systems pre-engineered for your make and model.'
const STATEMENT =
  "North Coast Soundworks is Cleveland's MECP-certified car audio specialist. We score every speaker, " +
  'subwoofer and amplifier we could build with on what it can actually play, then design each system so ' +
  'every part is matched to the others and to the vehicle.'

// Stock footage of the kind of work (not a specific NCSW build).
// MONTAGE order from Hero.jsx: audison(01), bmw(02), alfa(03), kia(04).
const MONTAGE = [
  '/video/install-audison.mp4',
  '/video/install-bmw.mp4',
  '/video/install-alfa.mp4',
  '/video/install-kia.mp4',
]

function callShop() {
  const href = telHref()
  if (!href) return
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.location.href = href
  } else {
    Linking.openURL(href).catch(() => {})
  }
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
        // Decorative: stock footage of the kind of work, not content to read.
        'aria-hidden': true,
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

  return (
    // .hero { padding: 64px 0 0 } — Section primitive owns the top spacing.
    <Section top={64}>
      <Container>
        {/* On a phone the heading and statement use the full width; the shared
            60% measure is for wide screens. */}
        <FullWidthCopyContext.Provider value={narrow}>
          <View style={{ gap: 20 } as any}>
            <Heading level="h2" as={1}>
              {HEADING}
            </Heading>
            <Lead size="heroLead">{STATEMENT}</Lead>
          </View>
        </FullWidthCopyContext.Provider>
        <View style={{ marginTop: 36, gap: 18 } as any}>
          <VehicleFinder nativeID="find" />
          {SITE.phone ? (
            <View style={{ alignSelf: 'flex-start' } as any}>
              <Button onPress={callShop}>{`${callLabel} ${SITE.phoneDisplay ?? ''}`.trim()}</Button>
            </View>
          ) : null}
        </View>
      </Container>

      {/* .montage > .container > .montage-grid — 32 below the finder row
          (the source's 56 left too much air once the finder sat above it) */}
      <View style={{ marginTop: 32 }}>
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
