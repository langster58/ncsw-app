import React, { useState } from 'react'
import { Linking, Platform, Pressable, Text, View, useWindowDimensions } from 'react-native'
import { Container, type, useFluidPx } from '@/ui'

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

// .nav-cta — white outline button; hover -> bg #fafbfc, border #b8b8b8 (.btn:hover).
// Shown on mobile web (<=900) and native, where tapping can actually open
// the dialer. Desktop renders PhoneText instead — see above. Label is the
// number itself (not "Call now") so it reads the same as PhoneText and
// there's exactly one visual form of the phone number on the page instead
// of two competing ones.
function CallButton({ number }: { number: string }) {
  const [hovered, setHovered] = useState(false)
  const fontSize = useFluidPx(type.meta)
  const digits = number.replace(/\D/g, '')
  const hoverProps: any =
    Platform.OS === 'web'
      ? { onHoverIn: () => setHovered(true), onHoverOut: () => setHovered(false) }
      : {}
  return (
    <Pressable
      onPress={() => openHref(`tel:+1${digits}`)}
      {...hoverProps}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 9,
        minHeight: 36,
        borderWidth: 1,
        borderColor: hovered ? '#b8b8b8' : '#dcdcdc',
        borderRadius: 8, // var(--radius-sm)
        backgroundColor: hovered ? '#fafbfc' : '#ffffff',
        paddingVertical: 7,
        paddingHorizontal: 14,
      }}
    >
      <Text
        style={
          {
            fontFamily: 'Inter',
            fontSize,
            lineHeight: fontSize,
            fontWeight: '600',
            color: '#09080e',
          } as any
        }
      >
        {number}
      </Text>
      <Text style={{ fontSize, lineHeight: fontSize, color: '#09080e' } as any}>→</Text>
    </Pressable>
  )
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

// Nav's horizontal gutter comes entirely from <Container> — the same
// primitive every other section uses. No hand-rolled padX/useFluidPx here.
export function Nav() {
  const { width } = useWindowDimensions()
  // Web-only breakpoint that collapses the link list into a hamburger.
  const narrow = Platform.OS === 'web' && width <= 900
  // Anywhere tapping can actually open the dialer: mobile web, and native
  // (which has no "desktop" — it's always the compact chrome). Only true
  // desktop web renders the phone number as inert text instead.
  const showCallButton = narrow || Platform.OS !== 'web'
  const showPhoneAsText = Platform.OS === 'web' && !narrow
  const navY = narrow ? 14 : 16

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
    <View style={navStyle}>
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

            {/* .nav-cta + .nav-burger */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              {showCallButton ? <CallButton number={PHONE_NUMBER} /> : null}
              {narrow ? (
                <View style={{ flexDirection: 'column', gap: 5 }}>
                  <View style={{ width: 24, height: 2, backgroundColor: '#09080e' }} />
                  <View style={{ width: 24, height: 2, backgroundColor: '#09080e' }} />
                  <View style={{ width: 24, height: 2, backgroundColor: '#09080e' }} />
                </View>
              ) : null}
            </View>
          </View>
        </View>
      </Container>
    </View>
  )
}
