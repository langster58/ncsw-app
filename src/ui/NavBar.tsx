import React from 'react'
import { Platform, Pressable, Text, View } from 'react-native'
import { colors, fonts, space, type, useFluidPx } from './tokens'

// NavBar — top chrome with slots for brand / menu / phone.
//   <NavBar>
//     <NavBar.Brand href="/">…</NavBar.Brand>
//     <NavBar.Menu>…link list…<NavBar.Pipe /><NavBar.Phone number="(216) 555-0114" /></NavBar.Menu>
//   </NavBar>
//
// Mirrors the landing-page nav (src/components/Nav.tsx): a STATIC first-row bar,
// not sticky/fixed. The page's ScrollView scrolls below it, so there's no
// scroll-triggered background swap and no backdrop blur — solid white, a soft
// bottom hairline, and (on web) a stacking context above the scroll region.

type NavBarProps = { children: React.ReactNode }

function Root({ children }: NavBarProps) {
  const padX = useFluidPx(space.containerPadX)

  const barStyle: any = {
    width: '100%',
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
    ...(Platform.OS === 'web' ? { zIndex: 80 } : null),
  }

  return (
    <View style={barStyle}>
      <View
        style={
          {
            width: '100%',
            paddingHorizontal: padX,
            paddingVertical: 16,
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
    <Pressable onPress={go} accessibilityRole="link" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      {children}
    </Pressable>
  )
}

// Menu slot — flexible link list container. Gap matches the landing link row.
function Menu({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>{children}</View>
}

// Divider between the link list and the phone number (landing .nav Pipe).
function Pipe() {
  const fontSize = useFluidPx(type.meta)
  return <Text style={{ fontFamily: fonts.body, fontSize, color: colors.borderStrong } as any}>|</Text>
}

// Phone slot — inert plain text, exactly as the landing renders it. There's no
// in-page action a desktop click could take (no dialer, no tel: handoff worth
// offering), so this is deliberately non-interactive: just styled text.
function Phone({ number }: { number: string }) {
  const fontSize = useFluidPx(type.meta)
  return (
    <Text
      style={
        {
          fontFamily: fonts.body,
          fontSize,
          fontWeight: '600',
          color: colors.ink,
        } as any
      }
    >
      {number}
    </Text>
  )
}

type NavBarComponent = ((p: NavBarProps) => React.ReactElement) & {
  Brand: typeof Brand
  Menu: typeof Menu
  Pipe: typeof Pipe
  Phone: typeof Phone
}

export const NavBar = Root as NavBarComponent
NavBar.Brand = Brand
NavBar.Menu = Menu
NavBar.Pipe = Pipe
NavBar.Phone = Phone
