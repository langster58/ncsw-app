import React, { useEffect, useRef, useState } from 'react'
import { Linking, Platform, Pressable, Text, View, Image } from 'react-native'

// Hero. Web: two-column full-viewport grid — wordmark + tagline + call CTA on the
// left, a cycling install video on the right. Native: a simple vertical stack with
// a dark placeholder block instead of video.

const TAGLINE =
  "North Coast Soundworks is Cleveland's MECP-certified car audio specialist. " +
  'We provide factory-integrated audio system design, fabrication, and tuning.'

const HERO_VIDEOS = [
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

function Tagline() {
  return (
    <Text
      style={{
        fontFamily: 'Inter',
        fontSize: 15,
        fontWeight: '400',
        color: '#33353c',
        lineHeight: 24, // 1.6 * 15
        maxWidth: 460,
      }}
    >
      {TAGLINE}
    </Text>
  )
}

function CallCta() {
  return (
    <Pressable onPress={callShop} style={{ marginTop: 16 }}>
      <Text
        style={{
          fontFamily: 'Creato Display',
          fontSize: 12,
          fontWeight: '800',
          letterSpacing: 1.2, // 0.1em * 12
          textTransform: 'uppercase',
          color: '#09080e',
        }}
      >
        Call (216) 555-0114
      </Text>
    </Pressable>
  )
}

// Web-only cycling background video.
function CyclingVideo() {
  const ref = useRef<any>(null)
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onEnded = () => setIdx((i) => (i + 1) % HERO_VIDEOS.length)
    el.addEventListener('ended', onEnded)
    el.play?.().catch(() => {})
    return () => el.removeEventListener('ended', onEnded)
  }, [idx])

  // Use React.createElement to avoid JSX intrinsic <video> on native typings.
  return Platform.OS === 'web'
    ? (React.createElement('video', {
        ref,
        src: HERO_VIDEOS[idx],
        autoPlay: true,
        muted: true,
        loop: false,
        playsInline: true,
        style: {
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          opacity: 0.75,
        },
      }) as any)
    : null
}

export function Hero() {
  // ---- Native layout: vertical stack ----
  if (Platform.OS !== 'web') {
    return (
      <View style={{ paddingHorizontal: 24, paddingVertical: 48, gap: 24 }}>
        {/* Native wordmark: text fallback (SVG <Image> needs react-native-svg). */}
        <Text
          style={{
            fontFamily: 'Creato Display',
            fontSize: 40,
            fontWeight: '800',
            letterSpacing: -1.3,
            color: '#09080e',
          }}
        >
          NORTH COAST SOUNDWORKS
        </Text>
        <Tagline />
        <CallCta />
        <View
          style={{
            width: '100%',
            aspectRatio: 16 / 9,
            backgroundColor: '#09080e',
            borderRadius: 16,
          }}
        />
      </View>
    )
  }

  // ---- Web layout: two-column full-viewport grid ----
  const gridStyle: any = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    minHeight: '100vh',
  }

  return (
    <View style={gridStyle}>
      {/* LEFT COLUMN */}
      <View
        style={{
          borderRightWidth: 1,
          borderRightColor: '#ececec',
          paddingHorizontal: 48,
          paddingTop: 96,
          paddingBottom: 64,
          justifyContent: 'space-between',
        }}
      >
        {/* Top: spacer for nav */}
        <View style={{ height: 24 }} />

        {/* Middle: wordmark */}
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        <Image
          source={{ uri: '/brand/NCSW-wordmark-full.svg' }}
          style={{ width: '100%', height: 180 }}
          resizeMode="contain"
        />

        {/* Bottom: tagline + CTA */}
        <View>
          <Tagline />
          <CallCta />
        </View>
      </View>

      {/* RIGHT COLUMN */}
      <View style={{ position: 'relative', backgroundColor: '#09080e', overflow: 'hidden' }}>
        <CyclingVideo />
        <View style={{ position: 'absolute', bottom: 32, left: 32 }}>
          <Text
            style={{
              fontFamily: 'Creato Display',
              fontSize: 11,
              fontWeight: '700',
              letterSpacing: 1.32, // 0.12em * 11
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.4)',
            }}
          >
            Installation · Process · Craft
          </Text>
        </View>
      </View>
    </View>
  )
}
