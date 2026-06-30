// NCSW homepage — "08 / Location" section.
//
// Chrome uses the design system (Section, Container, SectionIntro, Eyebrow).
// Data values use the mono font directly via the fonts token (mono is just a
// type spec, not a molecule).

import React from 'react'
import { Platform, Text, View } from 'react-native'
import { Container, Eyebrow, Section, SectionIntro, colors, fonts } from '@/ui'

// Mono data text — small inline helper, since mono is just a font spec.
function MonoText({ children }: { children: React.ReactNode }) {
  return (
    <Text style={{ fontFamily: fonts.mono, fontSize: 14, fontWeight: '500', color: colors.ink }}>
      {children}
    </Text>
  )
}

// Copy is verbatim from the source homepage; in a real build this would come
// from Directus / a CMS.

const SHOP_ADDRESS_L1 = '4117 Mayfield Road'
const SHOP_ADDRESS_L2 = 'South Euclid, Ohio 44118'
const SHOP_PHONE = '(216) 555-0114'

type DayHours = [day: string, hours: string]
const HOURS: DayHours[] = [
  ['Mon', '9am — 5pm'],
  ['Tue', '9am — 5pm'],
  ['Wed', '9am — 5pm'],
  ['Thu', '9am — 5pm'],
  ['Fri', '9am — 5pm'],
  ['Sat', 'Closed'],
  ['Sun', 'Closed'],
]

export function Location() {
  return (
    <Section>
      <Container>
        <SectionIntro
          index="08"
          label="Location"
          heading="Visit our Cleveland shop."
          body="Every build happens here, by appointment. Stop in to talk through your vehicle and hear a reference system."
          actionLabel="Get directions"
          actionHref="https://maps.apple.com/?address=4117%20Mayfield%20Road,%20South%20Euclid,%20OH%2044118"
          paddingBottom={56}
        />

        {/* Hours grid */}
        <View style={{ gap: 16, marginBottom: 56 }}>
          <Eyebrow>Hours</Eyebrow>
          <HoursGrid />
        </View>

        {/* Location + Schedule blocks — sized to their own content with a
            fixed gap between them, not stretched across the full row width
            via equal 1fr grid tracks (which left huge empty space after the
            short text in each cell). */}
        <View
          style={
            (Platform.OS === 'web'
              ? { flexDirection: 'row', flexWrap: 'wrap', gap: 64, marginBottom: 56 }
              : { flexDirection: 'column', gap: 32, marginBottom: 56 }) as any
          }
        >
          <View style={{ gap: 12 }}>
            <Eyebrow>Location</Eyebrow>
            <View>
              <MonoText>{SHOP_ADDRESS_L1}</MonoText>
              <MonoText>{SHOP_ADDRESS_L2}</MonoText>
            </View>
          </View>
          <View style={{ gap: 12 }}>
            <Eyebrow>Schedule</Eyebrow>
            <MonoText>{SHOP_PHONE}</MonoText>
          </View>
        </View>

        <View style={{ marginBottom: 56 }}>
          <MapEmbed />
        </View>
      </Container>
    </Section>
  )
}

// Google Maps iframe — verbatim embed URL from Google Maps for the shop address.
// Web only (iframes don't exist on native); native shows a placeholder surface
// until we wire a real map SDK there.
const MAP_SRC =
  'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d199.69500286942724!2d-81.53184896443469!3d41.52086731623014!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x8830fde42c83abcd%3A0x828e1f4623ea6e6c!2s4117%20Mayfield%20Rd%2C%20South%20Euclid%2C%20OH%2044121!5e0!3m2!1sen!2sus!4v1782779605874!5m2!1sen!2sus'

function MapEmbed() {
  if (Platform.OS === 'web') {
    return React.createElement(
      'div',
      {
        style: {
          width: '100%',
          aspectRatio: '16 / 6',
          borderRadius: 16,
          overflow: 'hidden',
          border: `1px solid ${colors.line}`,
        },
      },
      React.createElement('iframe', {
        src: MAP_SRC,
        width: '100%',
        height: '100%',
        style: { border: 0, display: 'block' },
        allowFullScreen: true,
        loading: 'lazy',
        referrerPolicy: 'strict-origin-when-cross-origin',
        title: 'NCSW shop location — 4117 Mayfield Road, South Euclid, OH 44121',
      }),
    )
  }
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 16,
        aspectRatio: 16 / 6,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontFamily: 'IBM Plex Mono', fontSize: 11, color: colors.gray }}>
        Map available on web
      </Text>
    </View>
  )
}

function HoursGrid() {
  const isWeb = Platform.OS === 'web'
  return (
    // Each day sized to its own content with a fixed gap — not stretched
    // across the row as 7 equal-width grid tracks (which left huge empty
    // space after each short "9am — 5pm" / "Closed" label).
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 32 } as any}>
      {HOURS.map(([day, hours]) => (
        <View key={day} style={{ gap: 8, minWidth: isWeb ? undefined : 84 } as any}>
          <Eyebrow>{day}</Eyebrow>
          <MonoText>{hours}</MonoText>
        </View>
      ))}
    </View>
  )
}
