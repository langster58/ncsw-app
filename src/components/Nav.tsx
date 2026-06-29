import { useState } from 'react'
import { Linking, Platform, Pressable, Text, View, useWindowDimensions } from 'react-native'
import React from 'react'

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
  const hoverProps: any =
    Platform.OS === 'web'
      ? { onHoverIn: () => setHovered(true), onHoverOut: () => setHovered(false) }
      : {}
  return (
    <Pressable onPress={() => openHref(href)} style={{ paddingBottom: 3 }} {...hoverProps}>
      <Text
        style={{
          fontFamily: 'Inter',
          textTransform: 'uppercase',
          letterSpacing: 1.32, // .12em * 11
          fontSize: 11,
          fontWeight: '600',
          color: hovered ? '#333333' : '#09080e', // :hover -> var(--fg-2)
        }}
      >
        {label}
      </Text>
    </Pressable>
  )
}

// .nav-cta — white outline button; hover -> bg #fafbfc, border #b8b8b8 (.btn:hover).
function NavCta() {
  const [hovered, setHovered] = useState(false)
  const hoverProps: any =
    Platform.OS === 'web'
      ? { onHoverIn: () => setHovered(true), onHoverOut: () => setHovered(false) }
      : {}
  return (
    <Pressable
      onPress={() => openHref('tel:+12165550114')}
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
        style={{
          fontFamily: 'Inter',
          textTransform: 'uppercase',
          letterSpacing: 1.2, // .12em * 10
          fontSize: 10,
          lineHeight: 10,
          fontWeight: '600',
          color: '#09080e',
        }}
      >
        Call now
      </Text>
      <Text style={{ fontSize: 10, lineHeight: 10, color: '#09080e' }}>→</Text>
    </Pressable>
  )
}

// .nav-brand img.word (height 23) — text fallback on native.
function Brand() {
  if (Platform.OS === 'web') {
    return React.createElement('img', {
      src: '/brand/NCSW-wordmark.svg',
      alt: 'North Coast Soundworks',
      style: { height: 23, width: 'auto', display: 'block' },
    })
  }
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
  const { width } = useWindowDimensions()
  const narrow = Platform.OS === 'web' && width <= 900
  const navY = narrow ? 14 : 16 // .nav-inner padding-y (14px <=900)

  const navStyle: any = {
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    ...(Platform.OS === 'web'
      ? { position: 'sticky', top: 0, zIndex: 80, backdropFilter: 'blur(12px)' }
      : null),
  }

  return (
    <View style={navStyle}>
      {/* .nav-inner.container */}
      <View
        style={{
          width: '100%',
          maxWidth: 1410,
          marginHorizontal: 'auto',
          paddingHorizontal: 40,
          paddingTop: navY,
          paddingBottom: navY,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 30,
        }}
      >
        {/* .nav-brand */}
        <Pressable
          onPress={() => openHref('/')}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
        >
          <Brand />
        </Pressable>

        {/* .nav-menu (hidden <=900) */}
        {!narrow ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 26 }}>
            {NAV_LINKS.map(([label, href]) => (
              <NavLink key={label} label={label} href={href} />
            ))}
          </View>
        ) : null}

        {/* right group: .nav-cta + .nav-burger (gap 14) */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          {/* .nav-cta (hidden <=900) */}
          {!narrow ? <NavCta /> : null}

          {/* .nav-burger (shown <=900) */}
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
  )
}
