// NCSW homepage — "10 / Location" section.
//
// Chrome uses the design system (Section, Container, SectionIntro, Eyebrow).
// Data values use the mono font directly via the fonts token (mono is just a
// type spec, not a molecule).

import React from 'react'
import { Platform, Text, View } from 'react-native'
import { Container, Eyebrow, Section, SectionIntro, colors, fonts, type, useFluidPx } from '@/ui'
import { SITE, callLabel, telHref } from '@/lib/site'

// Mono data text — small inline helper, since mono is just a font spec.
function MonoText({ children }: { children: React.ReactNode }) {
  const fontSize = useFluidPx(type.small)
  return (
    <Text style={{ fontFamily: fonts.body, fontSize, fontWeight: '500', color: colors.ink } as any}>
      {children}
    </Text>
  )
}

// The shop's facts come from src/lib/site.ts. Until the shop has an address,
// this section shows the hours and says the address is coming, with no map and
// no directions link — nothing that could send someone to the wrong place.

export function Location() {
  const address = SITE.address
  const call = telHref()
  const mapsQuery = address
    ? encodeURIComponent(`${address.street}, ${address.city}, ${address.region} ${address.postalCode}`)
    : ''
  return (
    <Section>
      <Container>
        <View nativeID="location">
          <SectionIntro
            index="10"
            label="Location"
            heading="Visit the shop."
            body={
              address
                ? 'Every build happens here, by appointment. Come sit in a demo car and hear it.'
                : 'Every build happens at our shop in the Cleveland area, by appointment. Come sit in a demo car and hear it. Our address is coming soon.'
            }
            actionLabel={address ? 'Get directions' : undefined}
            actionHref={address ? `https://maps.apple.com/?address=${mapsQuery}` : undefined}
            paddingBottom={56}
          />

          {/* Hours grid */}
          <View style={{ gap: 16, marginBottom: 56 }}>
            <Eyebrow>Hours</Eyebrow>
            <HoursGrid />
          </View>

          {address || call ? (
            <View
              style={
                (Platform.OS === 'web'
                  ? { flexDirection: 'row', flexWrap: 'wrap', gap: 64, marginBottom: 56 }
                  : { flexDirection: 'column', gap: 32, marginBottom: 56 }) as any
              }
            >
              {address ? (
                <View style={{ gap: 12 }}>
                  <Eyebrow>Location</Eyebrow>
                  <View>
                    <MonoText>{address.street}</MonoText>
                    <MonoText>{`${address.city}, ${address.region} ${address.postalCode}`}</MonoText>
                  </View>
                </View>
              ) : null}
              {call ? (
                <View style={{ gap: 12 }}>
                  <Eyebrow>{callLabel}</Eyebrow>
                  <MonoText>{SITE.phoneDisplay}</MonoText>
                </View>
              ) : null}
            </View>
          ) : null}

          {address ? (
            <View style={{ marginBottom: 56 }}>
              <MapEmbed query={mapsQuery} />
            </View>
          ) : null}
        </View>
      </Container>
    </Section>
  )
}

// Google Maps iframe for the shop address. Web only (iframes don't exist on
// native); native shows a placeholder surface until we wire a real map SDK there.
function MapEmbed({ query }: { query: string }) {
  const placeholderSize = useFluidPx(type.meta)
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
        src: `https://www.google.com/maps?q=${query}&output=embed`,
        width: '100%',
        height: '100%',
        style: { border: 0, display: 'block' },
        allowFullScreen: true,
        loading: 'lazy',
        referrerPolicy: 'strict-origin-when-cross-origin',
        title: 'North Coast Soundworks shop location',
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
      <Text style={{ fontFamily: 'IBM Plex Mono', fontSize: placeholderSize, color: colors.gray } as any}>
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
      {SITE.hours.map(([day, hours]) => (
        <View key={day} style={{ gap: 8, minWidth: isWeb ? undefined : 84 } as any}>
          <Eyebrow>{day}</Eyebrow>
          <MonoText>{hours}</MonoText>
        </View>
      ))}
    </View>
  )
}
