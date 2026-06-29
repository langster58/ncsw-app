// NCSW homepage — "08 / Location" section.
//
// Chrome (Section + Container + Opener + Heading + Lead) uses the design system
// primitives. The hours grid, address/schedule blocks, and map are bespoke —
// they use Eyebrow + Mono for typography so the type system still owns it.

import { Platform, Text, View } from 'react-native'
import { Container, Eyebrow, Heading, Lead, Mono, Opener, Section, colors, space } from '@/ui'

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
        <Opener
          index="08"
          label="Location"
          doorLabel="Get directions"
          doorHref="https://maps.apple.com/?address=4117%20Mayfield%20Road,%20South%20Euclid,%20OH%2044118"
        />

        {/* Heading + lede */}
        <View style={{ gap: 16, marginBottom: 56 }}>
          <Heading level="h2sm">Visit our Cleveland shop.</Heading>
          <Lead>
            Every build happens here, by appointment. Stop in to talk through
            your vehicle and hear a reference system.
          </Lead>
        </View>

        {/* Hours grid */}
        <View style={{ gap: 16, marginBottom: 56 }}>
          <Eyebrow>Hours</Eyebrow>
          <HoursGrid />
        </View>

        {/* Location + Schedule blocks */}
        <View
          style={
            (Platform.OS === 'web'
              ? {
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 56,
                  marginBottom: 56,
                }
              : { flexDirection: 'column', gap: 32, marginBottom: 56 }) as any
          }
        >
          <View style={{ gap: 12 }}>
            <Eyebrow>Location</Eyebrow>
            <View>
              <Mono>{SHOP_ADDRESS_L1}</Mono>
              <Mono>{SHOP_ADDRESS_L2}</Mono>
            </View>
          </View>
          <View style={{ gap: 12 }}>
            <Eyebrow>Schedule</Eyebrow>
            <Mono>{SHOP_PHONE}</Mono>
          </View>
        </View>

        {/* Map placeholder — real map lives in a follow-up. Surface tint + thin
            line to indicate it's a placeholder, not the final embed. */}
        <View
          style={{
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: space.ruleHairline === 1 ? 16 : 0,
            aspectRatio: 16 / 6,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontFamily: 'IBM Plex Mono', fontSize: 11, color: colors.gray }}>
            Map embed — Apple Maps / Mapbox to follow
          </Text>
        </View>
      </Container>
    </Section>
  )
}

function HoursGrid() {
  const isWeb = Platform.OS === 'web'
  return (
    <View
      style={
        (isWeb
          ? {
              display: 'grid',
              gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
              gap: 18,
            }
          : { flexDirection: 'row', flexWrap: 'wrap', gap: 18 }) as any
      }
    >
      {HOURS.map(([day, hours]) => (
        <View key={day} style={{ gap: 8, minWidth: isWeb ? undefined : 84 } as any}>
          <Eyebrow>{day}</Eyebrow>
          <Mono>{hours}</Mono>
        </View>
      ))}
    </View>
  )
}
