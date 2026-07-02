import React, { useEffect, useRef, useState } from 'react'
import { Linking, Platform, Pressable, Text, View, useWindowDimensions } from 'react-native'
// @ts-ignore — react-dom has no bundled types here; resolves at runtime via react-native-web (web only).
import { createPortal } from 'react-dom'
import { Container, IconClose, fluid, type, useFluidPx } from '@/ui'

// Nav — values taken verbatim from the source home.css / tokens.css:
//   .nav { position:sticky; top:0; z-index:80; background:rgba(255,255,255,.85);
//          backdrop-filter:blur(12px); border-bottom:1px solid #f0f0f0 }
//   .nav-inner(.container) { display:flex; align-items:center; justify-content:space-between;
//          gap:30px; padding:16px 0; max-width:1410px; margin:0 auto; padding-x:40px } (14px y, <=900)
//   .nav-brand { display:flex; align-items:center; gap:12px } ; img.word { height:23px; width:auto }
//   .nav-menu { display:flex; gap:26px; align-items:center } (display:none <=900)
//   .nav-link { Inter; uppercase; letter-spacing:.12em; font-size:11px; weight:600;
//          color:#09080e; padding-bottom:3px } :hover { color:#333333 }
//   .nav-cta (.btn) { inline-flex; center; gap:9px; min-height:36px; border:1px solid #dcdcdc;
//          border-radius:8px; background:#fff; color:#09080e; padding:7px 14px; Inter;
//          uppercase; letter-spacing:.12em; font-size:10px; line-height:1; weight:600 } (none <=900)
//   .nav-burger { display:none; flex-direction:column; gap:5px } span { width:24px; height:2px;
//          background:#09080e } (display:flex <=900)

const NAV_LINKS: [string, string][] = [
  ['Packages', '/#packages'],
  ['Subwoofers', '/methodology/subwoofers'],
  ['Install Types', '/'],
  ['Editorial', '/'],
  ['About', '/'],
  ['Location', '/#location'],
]

const PHONE_NUMBER = '(216) 555-0114'

function openHref(href: string) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.location.href = href
  } else {
    Linking.openURL(href).catch(() => {})
  }
}

// .nav-link — default ink, hover gray.
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
            color: hovered ? '#333333' : '#09080e', // :hover -> var(--fg-2)
          } as any
        }
      >
        {label}
      </Text>
    </Pressable>
  )
}

// Plain phone-number text — desktop web only. There's no in-page action a
// desktop click could take (no dialer, no tel: handoff worth offering), so
// this is deliberately inert: no href, no press handling, just text.
function PhoneText({ number }: { number: string }) {
  const fontSize = useFluidPx(type.meta)
  return (
    <Text
      style={
        {
          fontFamily: 'Inter',
          fontSize,
          fontWeight: '600',
          color: '#09080e',
        } as any
      }
    >
      {number}
    </Text>
  )
}

// Divider between the link list and the phone number — desktop web only.
function Pipe() {
  const fontSize = useFluidPx(type.meta)
  return <Text style={{ fontFamily: 'Inter', fontSize, color: '#dcdcdc' } as any}>|</Text>
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
          color: '#09080e',
        } as any
      }
    >
      NCSW
    </Text>
  )
}

// type.h2sm — the same size SectionIntro defaults to for every section
// heading on the page (Editorial, Collections, etc. all use it unmodified),
// so this reads as the same "heading" register as the rest of the site
// rather than a smaller, bespoke nav-link size.
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
            color: hovered ? '#333333' : '#09080e',
          } as any
        }
      >
        {label}
      </Text>
    </Pressable>
  )
}

// Full-screen menu opened by the hamburger, mobile web only. Portaled to
// <body> (same technique as Modal/Dropdown) so it always paints above the
// rest of the page. Positioned to start right below the nav bar (measured
// via navBarHeight) rather than covering it, so the bar — and the
// hamburger, now an X — stays visible and tappable to close.
function MobileNavMenu({
  open,
  onClose,
  navBarHeight,
}: {
  open: boolean
  onClose: () => void
  navBarHeight: number
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
          backgroundColor: '#ffffff',
          alignItems: 'center',
          justifyContent: 'center',
        } as any
      }
    >
      {/* No alignItems override here: RN's default 'stretch' on a
          column makes every link's box match the width of the widest
          one (the column itself auto-sizes to that same width), and
          text default-aligns left within its own box — exactly "align
          left, centered as a group by the longest link's width." */}
      <View style={{ gap } as any}>
        {NAV_LINKS.map(([label, href]) => (
          <MobileNavLink key={label} label={label} href={href} onNavigate={onClose} />
        ))}
      </View>
    </View>,
    document.body,
  )
}

// Nav's horizontal gutter comes entirely from <Container> — the same
// primitive every other section uses. No hand-rolled padX/useFluidPx here.
export function Nav() {
  const { width } = useWindowDimensions()
  // Web-only breakpoint that collapses the link list into a hamburger.
  const narrow = Platform.OS === 'web' && width <= 900
  // Desktop web only. Mobile web/tablet/native don't get a call affordance
  // in the nav at all — that lives below the Hero paragraph instead (see
  // Hero.tsx), as a standard heading/copy/CTA layout.
  const showPhoneAsText = Platform.OS === 'web' && !narrow
  const navY = narrow ? 14 : 16

  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [navBarHeight, setNavBarHeight] = useState(0)
  const navBarRef = useRef<any>(null)

  // Not narrow anymore (viewport widened past the breakpoint) — don't leave
  // the full-screen menu mounted with the desktop link row now also showing.
  useEffect(() => {
    if (!narrow) setMobileNavOpen(false)
  }, [narrow])

  useEffect(() => {
    if (!mobileNavOpen || !navBarRef.current || typeof navBarRef.current.getBoundingClientRect !== 'function') {
      return
    }
    setNavBarHeight(navBarRef.current.getBoundingClientRect().height)
  }, [mobileNavOpen])

  // Sits as the first row of the page's flex column (see app/index.tsx);
  // the ScrollView below it is what scrolls. No sticky positioning needed,
  // and the scrolled-state background swap (which depended on window.scrollY)
  // is gone since the window no longer scrolls.
  const navStyle: any = {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
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
          {/* .nav-brand — flush left */}
          <Pressable
            onPress={() => openHref('/')}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
          >
            <Brand />
          </Pressable>

          {/* Everything but the brand lives in one flush-right group, so
              justifyContent:'space-between' only ever sees two real slots
              (brand, this) — with the menu and the button/burger as two
              separate items, space-between spread THEM apart too, leaving
              a gap after the phone number instead of hugging the edge. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 24 } as any}>
            {/* .nav-menu (hidden <=900) — desktop web appends a pipe + the
                plain-text phone number after the links. */}
            {!narrow ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
                {NAV_LINKS.map(([label, href]) => (
                  <NavLink key={label} label={label} href={href} />
                ))}
                {showPhoneAsText ? (
                  <>
                    <Pipe />
                    <PhoneText number={PHONE_NUMBER} />
                  </>
                ) : null}
              </View>
            ) : null}

            {/* .nav-burger — becomes an X in the same spot while the
                full-screen menu is open, so the tap target that opened it
                is also what closes it. */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              {narrow ? (
                <Pressable
                  onPress={() => setMobileNavOpen((v) => !v)}
                  accessibilityRole="button"
                  accessibilityLabel={mobileNavOpen ? 'Close menu' : 'Open menu'}
                  hitSlop={8}
                >
                  {mobileNavOpen ? (
                    <IconClose size={20} color="#09080e" />
                  ) : (
                    <View style={{ flexDirection: 'column', gap: 5 }}>
                      <View style={{ width: 24, height: 2, backgroundColor: '#09080e' }} />
                      <View style={{ width: 24, height: 2, backgroundColor: '#09080e' }} />
                      <View style={{ width: 24, height: 2, backgroundColor: '#09080e' }} />
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
      />
    </View>
  )
}
