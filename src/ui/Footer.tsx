import React from 'react'
import { Platform, Text, View } from 'react-native'
import { colors, fonts, space, tracking } from './tokens'

// Footer — dark band site footer with compound slots:
//   <Footer>
//     <Footer.Top>
//       <Footer.Brand>…</Footer.Brand>
//       <Footer.Column heading="Systems"><Footer.Link>…</Footer.Link></Footer.Column>
//       <Footer.Column heading="Read">…</Footer.Column>
//       <Footer.Column heading="Shop">…</Footer.Column>
//     </Footer.Top>
//     <Footer.Bottom>
//       <Footer.Meta>© 2026 North Coast Soundworks</Footer.Meta>
//       <Footer.Meta>MECP Certified · Cleveland OH · …</Footer.Meta>
//     </Footer.Bottom>
//   </Footer>

function Root({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ width: '100%', backgroundColor: colors.ink, marginTop: space.sectionTop }}>
      <View
        style={{
          width: '100%',
          maxWidth: space.containerMax,
          marginHorizontal: 'auto',
          paddingHorizontal: space.containerPadX,
          paddingTop: 64,
          paddingBottom: 40,
        }}
      >
        {children}
      </View>
    </View>
  )
}

// Top section: brand + columns in a responsive grid on web, stacked on native.
function Top({ children }: { children: React.ReactNode }) {
  const isWeb = Platform.OS === 'web'
  return (
    <View
      style={
        (isWeb
          ? {
              display: 'grid',
              gridTemplateColumns: '1.4fr 1fr 1fr 1fr',
              gap: 48,
              marginBottom: 48,
            }
          : { flexDirection: 'column', gap: 32, marginBottom: 32 }) as any
      }
    >
      {children}
    </View>
  )
}

function Brand({ children }: { children: React.ReactNode }) {
  return <View style={{ gap: 16 }}>{children}</View>
}

function Column({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 12 }}>
      <Text
        style={
          {
            fontFamily: fonts.mono,
            fontSize: 11,
            fontWeight: '600',
            letterSpacing: tracking.label,
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.55)',
            marginBottom: 6,
          } as any
        }
      >
        {heading}
      </Text>
      {children}
    </View>
  )
}

function Link({ children, href }: { children: React.ReactNode; href?: string }) {
  const onPress = () => {
    if (href && Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.href = href
    }
  }
  return (
    <Text
      onPress={onPress}
      style={{
        fontFamily: fonts.body,
        fontSize: 14,
        color: 'rgba(255,255,255,0.78)',
        paddingVertical: 4,
      }}
    >
      {children}
    </Text>
  )
}

function Bottom({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        paddingTop: 26,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.10)',
      }}
    >
      {children}
    </View>
  )
}

function Meta({ children }: { children: React.ReactNode }) {
  return (
    <Text
      style={
        {
          fontFamily: fonts.mono,
          fontSize: 11,
          letterSpacing: tracking.label,
          textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.55)',
        } as any
      }
    >
      {children}
    </Text>
  )
}

type FooterComponent = ((p: { children: React.ReactNode }) => React.ReactElement) & {
  Top: typeof Top
  Brand: typeof Brand
  Column: typeof Column
  Link: typeof Link
  Bottom: typeof Bottom
  Meta: typeof Meta
}

export const Footer = Root as FooterComponent
Footer.Top = Top
Footer.Brand = Brand
Footer.Column = Column
Footer.Link = Link
Footer.Bottom = Bottom
Footer.Meta = Meta
