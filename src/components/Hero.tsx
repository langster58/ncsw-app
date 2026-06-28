import React from 'react'
import { Linking, Platform, Pressable, Text, View, Image } from 'react-native'

// Hero. Web: two-column full-viewport grid — wordmark + tagline + call CTA on the
// left, a row of install videos (all playing at once, looping) on the right.
// Native: a simple vertical stack with a dark placeholder block instead of video.

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

// Web-only: all install videos side-by-side in a row, each autoplaying,
// muted, and looping endlessly. createElement avoids JSX intrinsic <video>
// typings (no DOM JSX in the React Native type set).
function VideoRow() {
  if (Platform.OS !== 'web') return null
  return React.createElement(
    'div',
    { style: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'row' } },
    HERO_VIDEOS.map((src) =>
      React.createElement('video', {
        key: src,
        src,
        autoPlay: true,
        muted: true,
        loop: true,
        playsInline: true,
        style: {
          flex: 1,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          opacity: 0.75,
        },
      })
    )
  ) as any
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
        <VideoRow />
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
