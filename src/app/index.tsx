import { Platform, ScrollView, View } from 'react-native'
import Head from 'expo-router/head'
import { Reveal, colors } from '@/ui'
import { Nav } from '@/components/Nav'
import { Hero } from '@/components/Hero'
import {
  Articles,
  Calibration,
  ChangeStory,
  ClosingFinder,
  CommonQuestions,
  DemoCars,
  HowItWorksSteps,
  SystemContents,
} from '@/components/HomeStory'
import { VehicleFinder } from '@/components/VehicleFinder'
import { Brands } from '@/components/Brands'
import { Location } from '@/components/Location'
import { Footer } from '@/components/Footer'
import { JsonLd } from '@/components/JsonLd'
import { SITE } from '@/lib/site'

// Homepage. The story runs in the order a customer's questions come (see
// docs/homepage-story.md): first screen with the vehicle finder -> how we design
// -> calibration -> how it works -> demo cars -> what goes into a system ->
// common questions -> articles -> brands -> location -> the finder again.
//
// Nav is a sibling above the ScrollView, not a child of it, so the scroll
// region starts below the nav (and the scrollbar tracks only that region,
// not the full viewport height).
const outerStyle: any =
  Platform.OS === 'web'
    ? { height: '100dvh', flexDirection: 'column' }
    : { flex: 1, flexDirection: 'column' }

const TITLE = 'Vehicle-Specific Car Audio Systems in Cleveland, Ohio | North Coast Soundworks'

// Business details for machines. The local-business fields (address, phone)
// are added only once they exist in src/lib/site.ts.
const BUSINESS: Record<string, unknown> = {
  '@context': 'https://schema.org',
  '@type': SITE.address ? 'AutomotiveBusiness' : 'Organization',
  name: SITE.name,
  url: SITE.url,
  logo: `${SITE.url}/brand/NCSW-wordmark-full.svg`,
  description: SITE.description,
  areaServed: [{ '@type': 'State', name: 'Ohio' }],
  knowsAbout: ['Car audio system design', 'Car audio installation', 'DSP calibration', 'Subwoofer enclosures'],
  ...(SITE.address
    ? {
        address: {
          '@type': 'PostalAddress',
          streetAddress: SITE.address.street,
          addressLocality: SITE.address.city,
          addressRegion: SITE.address.region,
          postalCode: SITE.address.postalCode,
          addressCountry: 'US',
        },
        openingHours: SITE.openingHours,
      }
    : null),
  ...(SITE.phone ? { telephone: SITE.phone } : null),
}

export default function HomeScreen() {
  return (
    <>
      <Head>
        <title>{TITLE}</title>
        <meta name="description" content={SITE.description} />
        <link rel="canonical" href={`${SITE.url}/`} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={TITLE} />
        <meta property="og:description" content={SITE.description} />
        <meta property="og:url" content={`${SITE.url}/`} />
      </Head>
      <JsonLd data={BUSINESS} />
      <View style={outerStyle}>
        <Nav />
        <ScrollView
          style={{ flex: 1, backgroundColor: colors.white }}
          contentContainerStyle={{ flexGrow: 1 }}
        >
          <Hero />
          <Reveal>
            <ChangeStory />
          </Reveal>
          <Reveal>
            <Calibration />
          </Reveal>
          <Reveal>
            <HowItWorksSteps />
          </Reveal>
          <Reveal>
            <DemoCars />
          </Reveal>
          <Reveal>
            <SystemContents />
          </Reveal>
          <Reveal>
            <CommonQuestions />
          </Reveal>
          <Reveal>
            <Articles />
          </Reveal>
          <Reveal>
            <Brands />
          </Reveal>
          <Reveal>
            <Location />
          </Reveal>
          <Reveal>
            <ClosingFinder>
              <VehicleFinder />
            </ClosingFinder>
          </Reveal>
          <Reveal>
            <Footer />
          </Reveal>
        </ScrollView>
      </View>
    </>
  )
}
