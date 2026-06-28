import { useEffect, useState } from 'react'
import { Image, Linking, Platform, Pressable, Text, View } from 'react-native'

// NCSW primary nav. Fixed 56px bar; on web the border + backdrop-blur + white
// background fade in after 40px of scroll. Native renders a static white bar.

const NAV_LINKS: [string, string][] = [
  ['Packages', '/#packages'],
  ['Subwoofers', '/methodology/subwoofers'],
  ['Install Types', '/#install-types'],
  ['Editorial', '/#editorial'],
  ['About', '/#about'],
  ['Location', '/#location'],
]

function openHref(href: string) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.location.href = href
  } else {
    Linking.openURL(href).catch(() => {})
  }
}

function NavLink({ label, href }: { label: string; href: string }) {
  const [hovered, setHovered] = useState(false)
  const hoverProps: any =
    Platform.OS === 'web'
      ? { onHoverIn: () => setHovered(true), onHoverOut: () => setHovered(false) }
      : {}
  return (
    <Pressable onPress={() => openHref(href)} {...hoverProps}>
      <Text
        style={{
          fontFamily: 'Inter',
          fontSize: 12,
          fontWeight: '500',
          letterSpacing: 0.96, // 0.08em * 12
          textTransform: 'uppercase',
          color: hovered ? '#09080e' : '#656565',
        }}
      >
        {label}
      </Text>
    </Pressable>
  )
}

function Logo() {
  if (Platform.OS === 'web') {
    return (
      // eslint-disable-next-line jsx-a11y/alt-text
      <Image
        source={{ uri: '/brand/NCSW-wordmark.svg' }}
        style={{ height: 20, width: 96 }}
        resizeMode="contain"
      />
    )
  }
  // Native fallback: the SVG wordmark can't render via <Image> without
  // react-native-svg (+ transformer), which isn't installed. Use a text
  // wordmark until native SVG support is added in a later session.
  return (
    <Text
      style={{
        fontFamily: 'Creato Display',
        fontSize: 18,
        fontWeight: '800',
        letterSpacing: -0.5,
        textTransform: 'uppercase',
        color: '#09080e',
      }}
    >
      NCSW
    </Text>
  )
}

export function Nav() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return
    const onScroll = () => setScrolled(window.scrollY > 40)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const webBarStyle: any =
    Platform.OS === 'web'
      ? {
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          backgroundColor: scrolled ? 'rgba(255,255,255,0.96)' : 'transparent',
          borderBottomWidth: 1,
          borderBottomColor: scrolled ? '#ececec' : 'transparent',
          backdropFilter: scrolled ? 'blur(12px)' : 'none',
          transition: 'background-color 0.2s, border-color 0.2s',
          zIndex: 100,
        }
      : { backgroundColor: '#ffffff' }

  return (
    <View style={[{ width: '100%', height: 56 }, webBarStyle]}>
      <View
        style={{
          width: '100%',
          maxWidth: 1410,
          marginHorizontal: 'auto',
          height: 56,
          paddingHorizontal: 24,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 24,
        }}
      >
        {/* Logo wordmark */}
        <Pressable onPress={() => openHref('/')}>
          <Logo />
        </Pressable>

        {/* Primary nav links */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 24 }}>
          {NAV_LINKS.map(([label, href]) => (
            <NavLink key={label} label={label} href={href} />
          ))}
        </View>

        {/* CTA */}
        <Pressable
          onPress={() => openHref('tel:+12165550114')}
          style={{
            backgroundColor: '#09080e',
            borderRadius: 2,
            paddingVertical: 8,
            paddingHorizontal: 18,
          }}
        >
          <Text
            style={{
              fontFamily: 'Creato Display',
              fontSize: 12,
              fontWeight: '800',
              letterSpacing: 1.2, // 0.1em * 12
              textTransform: 'uppercase',
              color: '#ffffff',
            }}
          >
            Call Now
          </Text>
        </Pressable>
      </View>
    </View>
  )
}
