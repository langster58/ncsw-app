import { View, Text } from 'react-native'

// Composed from /tmp/ncsw-real-source/apps/web/src/app/page.tsx (opening Section)
// and the .ncsw-title / .ncsw-prose rules in ncsw.css. The apps/web source has no
// dedicated hero or video block, so the media area is a placeholder View (bg #09080e,
// var(--ncsw-ink)) per instruction — the real video lands in a later session.
// Web DOM -> RN primitives; em letter-spacing converted to RN points (em * fontSize).

export function Hero() {
  return (
    <View
      style={{
        width: '100%',
        maxWidth: 1410, // var(--ncsw-container-max)
        marginHorizontal: 'auto',
        paddingHorizontal: 24,
        paddingVertical: 64,
        gap: 32,
      }}
    >
      {/* Placeholder media block — real video added later */}
      <View
        style={{
          width: '100%',
          aspectRatio: 16 / 9,
          backgroundColor: '#09080e', // var(--ncsw-ink)
          borderRadius: 16, // var(--ncsw-radius-card)
        }}
      />

      {/* Title (.ncsw-title) */}
      <Text
        style={{
          color: '#09080e', // var(--ncsw-ink)
          fontSize: 44,
          fontWeight: '800',
          lineHeight: 44, // line-height: 1
          letterSpacing: -1.4, // -.032em * 44
        }}
      >
        North Coast Soundworks
      </Text>

      {/* Intro prose (.ncsw-prose.wide.muted) */}
      <Text
        style={{
          color: '#656565', // var(--ncsw-muted)
          fontSize: 17,
          lineHeight: 27, // ~1.58
          maxWidth: 640,
        }}
      >
        Factory-integrated audio system design, fabrication, and tuning. The React
        foundation preserves the current landing page&apos;s visual language while giving
        us reusable components for the rest of the site.
      </Text>
    </View>
  )
}
