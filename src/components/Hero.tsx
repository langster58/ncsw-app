import React from 'react'
import { Linking, Platform, Pressable, Text, View, useWindowDimensions } from 'react-native'

// Hero — values taken verbatim from the source tokens.css / home.css:
//   .hero { padding: 64px 0 0 }
//   .container { max-width: 1410px; margin: 0 auto; padding: 0 40px }  (0 22px mobile)
//   .hero-wordmark { display:block; width:100%; max-width:760px; height:auto }
//   .hero-statement { display:grid; grid-template-columns:1fr; gap:28px; margin-top:24px }
//   .hero-lede { max-width:760px; font-size:22px; line-height:1.45; font-weight:400; color:#09080e }
//   .hero-call { display:none; ->inline-flex <=900px; color:#0576cc; Inter 15/600; underline }
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

function callShop() {
  const href = 'tel:+12165550114'
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.location.href = href
  } else {
    Linking.openURL(href).catch(() => {})
  }
}

// .hero-lede
function HeroLede() {
  return (
    <Text
      style={{
        maxWidth: '66.6%',
        fontFamily: 'Inter',
        fontSize: 22,
        lineHeight: 31.9, // 1.45 * 22
        fontWeight: '400',
        color: '#09080e', // var(--fg-1) -> var(--ncsw-ink)
      }}
    >
      {STATEMENT}
    </Text>
  )
}

// .hero-call (shown <=900px / on native)
function HeroCall() {
  return (
    <Pressable
      onPress={callShop}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 22 }}
    >
      <Text
        style={
          {
            fontFamily: 'Inter',
            fontWeight: '600',
            fontSize: 15,
            color: '#0576cc', // var(--accent) -> var(--ncsw-primary)
            textDecorationLine: 'underline',
            // .hero-call: text-underline-offset:4px; text-decoration-thickness:1px (web)
            textUnderlineOffset: 4,
            textDecorationThickness: 1,
          } as any
        }
      >
        Call (216) 555-0114 →
      </Text>
    </Pressable>
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
        backgroundColor: '#000',
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
  const showCall = !isWeb || width <= 900
  const cols = isWeb && !narrow ? 4 : 2
  const containerPadX = narrow ? 22 : 40

  // ---- Native fallback: text wordmark (SVG <Image> needs react-native-svg) ----
  const Wordmark = isWeb ? (
    <View style={{ lineHeight: 0 } as any}>
      {React.createElement('img', {
        src: '/brand/NCSW-wordmark-full.svg',
        alt: 'North Coast Soundworks',
        className: 'ncsw-hero-word', // entrance: translateY 40 -> 0 + fade (public/ncsw.css)
        style: { display: 'block', width: '100%', maxWidth: 760, height: 'auto' },
      })}
    </View>
  ) : (
    <Text
      style={{
        fontFamily: 'Creato Display',
        fontSize: 40,
        fontWeight: '700',
        letterSpacing: -1.4,
        color: '#09080e',
      }}
    >
      NORTH COAST SOUNDWORKS
    </Text>
  )

  const Container = ({ children }: { children: React.ReactNode }) => (
    <View
      style={{
        width: '100%',
        maxWidth: 1410,
        marginHorizontal: 'auto',
        paddingHorizontal: containerPadX,
      }}
    >
      {children}
    </View>
  )

  return (
    <View style={{ paddingTop: 64 }}>
      {/* .hero > .container : wordmark + statement */}
      <Container>
        <View>{Wordmark}</View>
        <View style={{ marginTop: 24, gap: 28 }}>
          <HeroLede />
          {showCall ? <HeroCall /> : null}
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
                backgroundColor: '#1b1b1b',
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
                  style={{ width: '50%', aspectRatio: 3 / 4, backgroundColor: '#000' }}
                />
              )
            )}
          </View>
        </Container>
      </View>
    </View>
  )
}
