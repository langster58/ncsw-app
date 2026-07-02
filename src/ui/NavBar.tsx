import React, { useEffect, useState } from 'react'
import { Linking, Platform, Pressable, View } from 'react-native'
import { Button } from './Button'
import { colors, fonts, space, useFluidPx } from './tokens'

// NavBar — sticky top chrome with slots for brand / menu / phone.
//   <NavBar>
//     <NavBar.Brand href="/">…</NavBar.Brand>
//     <NavBar.Menu>…link list…</NavBar.Menu>
//     <NavBar.Phone number="(216) 555-0114" />
//   </NavBar>

const HEIGHT = 56
const SCROLL_TRIGGER = 40

type NavBarProps = { children: React.ReactNode }

function Root({ children }: NavBarProps) {
  const [scrolled, setScrolled] = useState(false)
  const padX = useFluidPx(space.containerPadX)

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return
    const onScroll = () => setScrolled(window.scrollY > SCROLL_TRIGGER)
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
          backgroundColor: scrolled ? 'rgba(255,255,255,0.96)' : 'rgba(255,255,255,0.85)',
          borderBottomWidth: 1,
          borderBottomColor: scrolled ? colors.line : colors.lineSoft,
          backdropFilter: 'blur(12px)',
          transition: 'background-color 0.2s, border-color 0.2s',
          zIndex: 100,
        }
      : { backgroundColor: colors.white }

  return (
    <View style={[{ width: '100%', height: HEIGHT }, webBarStyle]}>
      <View
        style={
          {
            width: '100%',
            height: HEIGHT,
            paddingHorizontal: padX,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 24,
          } as any
        }
      >
        {children}
      </View>
    </View>
  )
}

// Brand slot — wraps a logo/text in a Pressable that links home.
function Brand({
  children,
  href = '/',
}: {
  children: React.ReactNode
  href?: string
}) {
  const go = () => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') window.location.href = href
    }
  }
  return (
    <Pressable onPress={go} accessibilityRole="link">
      {children}
    </Pressable>
  )
}

// Menu slot — flexible link list container.
function Menu({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 24 }}>{children}</View>
}

// Phone slot — platform-aware. On desktop there's nowhere to navigate to and
// no in-page action to take, so we render the phone number as plain styled
// text (wrapped in a tel: anchor — clicking still hands off to FaceTime /
// Continuity on Apple desktops, no-op elsewhere). On a phone, render an
// actual button that opens the dialer.
function Phone({ number }: { number: string }) {
  const digits = number.replace(/\D/g, '')
  const tel = `tel:+1${digits}`

  if (Platform.OS === 'web') {
    return React.createElement(
      'a',
      {
        href: tel,
        style: {
          fontFamily: fonts.body,
          fontSize: 14,
          fontWeight: 600,
          color: colors.ink,
          textDecoration: 'none',
          letterSpacing: '-0.005em',
        },
      },
      number,
    )
  }

  return (
    <Button variant="primary" onPress={() => Linking.openURL(tel)}>
      Call now
    </Button>
  )
}

type NavBarComponent = ((p: NavBarProps) => React.ReactElement) & {
  Brand: typeof Brand
  Menu: typeof Menu
  Phone: typeof Phone
}

export const NavBar = Root as NavBarComponent
NavBar.Brand = Brand
NavBar.Menu = Menu
NavBar.Phone = Phone
