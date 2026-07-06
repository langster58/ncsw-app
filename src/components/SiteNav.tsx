import React, { useEffect, useRef, useState } from 'react'
import { Linking, Platform, Pressable, Text, View, useWindowDimensions } from 'react-native'
// @ts-ignore — react-dom has no bundled types here; resolves at runtime via react-native-web (web only).
import { createPortal } from 'react-dom'
import { Container, IconClose, colors, fluid, type, useFluidPx } from '@/ui'

// SiteNav — the site header, used on every page. Lifted verbatim from the
// landing nav so there is ONE nav across the app: a static (non-sticky) bar,
// solid white with a soft bottom hairline, brand flush-left, and a flush-right
// group of links + pipe + phone on desktop that collapses to a hamburger +
// full-screen portal menu at <=900px. Links and phone are props so any page
// can pass its own set.
//
// Source values (home.css / tokens.css):
//   .nav-inner .container: flex; align/justify space-between; padding 16px 0 (14 <=900)
//   .nav-link: Inter uppercase .12em 11px/600, ink -> body on hover, padding-bottom 3
//   .nav-burger: 3 x (24x2) ink bars, becomes an X while the menu is open

export type NavLinkItem = readonly [label: string, href: string]

function openHref(href: string) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.location.href = href
  } else {
    Linking.openURL(href).catch(() => {})
  }
}

// .nav-link — default ink, hover body.
function NavLink({ label, href }: { label: string; href: string }) {
  const [hovered, setHovered] = useState(false)
  const fontSize = useFluidPx(type.meta)
  const hoverProps: any =
    Platform.OS === 'web'
      ? { onHoverIn: () => setHovered(true), onHoverOut: () => setHovered(false) }
      : {}
  return (
    <Pressable onPress={() => openHref(href)} style={{ paddingBottom: 3 }} {...hoverProps}>
      <Text
        style={
          {
            fontFamily: 'Inter',
            textTransform: 'uppercase',
            letterSpacing: 1.32, // .12em * 11
            fontSize,
            fontWeight: '600',
            color: hovered ? colors.body : colors.ink,
          } as any
        }
      >
        {label}
      </Text>
    </Pressable>
  )
}

// Inert plain phone text — desktop web only. No dialer / tel: handoff worth
// offering on desktop, so it is deliberately non-interactive.
function PhoneText({ number }: { number: string }) {
  const fontSize = useFluidPx(type.meta)
  return (
    <Text style={{ fontFamily: 'Inter', fontSize, fontWeight: '600', color: colors.ink } as any}>{number}</Text>
  )
}

// Divider between the link list and the phone number — desktop web only.
function Pipe() {
  const fontSize = useFluidPx(type.meta)
  return <Text style={{ fontFamily: 'Inter', fontSize, color: colors.borderStrong } as any}>|</Text>
}

// .nav-brand img.word (height 23) — text fallback on native.
function Brand() {
  const fontSize = useFluidPx(type.h4)
  if (Platform.OS === 'web') {
    return React.createElement('img', {
      src: '/brand/NCSW-wordmark.svg',
      alt: 'North Coast Soundworks',
      style: { height: 23, width: 'auto', display: 'block' },
    })
  }
  return (
    <Text
      style={
        {
          fontFamily: 'Creato Display',
          fontSize,
          fontWeight: '800',
          letterSpacing: -0.5,
          textTransform: 'uppercase',
          color: colors.ink,
        } as any
      }
    >
      NCSW
    </Text>
  )
}

function MobileNavLink({ label, href, onNavigate }: { label: string; href: string; onNavigate: () => void }) {
  const [hovered, setHovered] = useState(false)
  const fontSize = useFluidPx(type.h2sm)
  return (
    <Pressable
      onPress={() => {
        onNavigate()
        openHref(href)
      }}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
    >
      <Text
        style={
          {
            fontFamily: 'Creato Display',
            fontWeight: '800',
            fontSize,
            color: hovered ? colors.body : colors.ink,
          } as any
        }
      >
        {label}
      </Text>
    </Pressable>
  )
}

// Full-screen hamburger menu, mobile web only. Portaled to <body> so it paints
// above everything, and positioned to start below the bar (measured height) so
// the bar + close-X stay visible.
function MobileNavMenu({
  open,
  onClose,
  navBarHeight,
  links,
}: {
  open: boolean
  onClose: () => void
  navBarHeight: number
  links: ReadonlyArray<NavLinkItem>
}) {
  const gap = useFluidPx(fluid(22, 16))

  useEffect(() => {
    if (!open || typeof document === 'undefined') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <View
      style={
        {
          position: 'fixed',
          top: navBarHeight,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 90,
          backgroundColor: colors.white,
          alignItems: 'center',
          justifyContent: 'center',
        } as any
      }
    >
      <View style={{ gap } as any}>
        {links.map(([label, href]) => (
          <MobileNavLink key={label} label={label} href={href} onNavigate={onClose} />
        ))}
      </View>
    </View>,
    document.body,
  )
}

export function SiteNav({
  links,
  phone,
  brandHref = '/',
}: {
  links: ReadonlyArray<NavLinkItem>
  phone?: string
  brandHref?: string
}) {
  const { width } = useWindowDimensions()
  const narrow = Platform.OS === 'web' && width <= 900
  const showPhoneAsText = Platform.OS === 'web' && !narrow && !!phone
  const navY = narrow ? 14 : 16

  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [navBarHeight, setNavBarHeight] = useState(0)
  const navBarRef = useRef<any>(null)

  useEffect(() => {
    if (!narrow) setMobileNavOpen(false)
  }, [narrow])

  useEffect(() => {
    if (!mobileNavOpen || !navBarRef.current || typeof navBarRef.current.getBoundingClientRect !== 'function') {
      return
    }
    setNavBarHeight(navBarRef.current.getBoundingClientRect().height)
  }, [mobileNavOpen])

  const navStyle: any = {
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
    ...(Platform.OS === 'web' ? { zIndex: 80 } : null),
  }

  return (
    <View style={navStyle} ref={navBarRef}>
      <Container>
        <View
          style={
            {
              paddingTop: navY,
              paddingBottom: navY,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 24,
            } as any
          }
        >
          <Pressable onPress={() => openHref(brandHref)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Brand />
          </Pressable>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 24 } as any}>
            {!narrow ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
                {links.map(([label, href]) => (
                  <NavLink key={label} label={label} href={href} />
                ))}
                {showPhoneAsText ? (
                  <>
                    <Pipe />
                    <PhoneText number={phone as string} />
                  </>
                ) : null}
              </View>
            ) : null}

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              {narrow ? (
                <Pressable
                  onPress={() => setMobileNavOpen((v) => !v)}
                  accessibilityRole="button"
                  accessibilityLabel={mobileNavOpen ? 'Close menu' : 'Open menu'}
                  hitSlop={8}
                >
                  {mobileNavOpen ? (
                    <IconClose size={20} color={colors.ink} />
                  ) : (
                    <View style={{ flexDirection: 'column', gap: 5 }}>
                      <View style={{ width: 24, height: 2, backgroundColor: colors.ink }} />
                      <View style={{ width: 24, height: 2, backgroundColor: colors.ink }} />
                      <View style={{ width: 24, height: 2, backgroundColor: colors.ink }} />
                    </View>
                  )}
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
      </Container>

      <MobileNavMenu
        open={narrow && mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        navBarHeight={navBarHeight}
        links={links}
      />
    </View>
  )
}
