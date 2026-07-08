import React from 'react'
import { Platform, ScrollView, View } from 'react-native'
import Head from 'expo-router/head'
import { Container, Eyebrow, Heading, Lead, colors, fluid, useFluidPx } from '@/ui'
import { SiteNav, type NavLinkItem } from '@/components/SiteNav'
import { Footer } from '@/components/Footer'
import { BoxModeler } from '@/components/BoxModeler'

// Enclosure modeler — the full driver catalog run through the Thiele/Small
// model (src/lib/driver-model.ts), interactive. Composed from the shared
// primitives; the page itself is just arrangement.

const NAV_LINKS: NavLinkItem[] = [
  ['Packages', '/#packages'],
  ['Subwoofers', '/methodology/subwoofers'],
  ['Install Types', '/'],
  ['Editorial', '/'],
  ['About', '/'],
  ['Location', '/#location'],
]
const PHONE = '(216) 555-0114'

const IS_WEB = Platform.OS === 'web'
const outerStyle: any = IS_WEB
  ? { height: '100dvh', flexDirection: 'column' }
  : { flex: 1, flexDirection: 'column' }

export default function ModelerScreen() {
  const heroTop = useFluidPx(fluid(80, 52))
  const sectionTop = useFluidPx(fluid(44, 34))
  const introGap = useFluidPx(fluid(28, 22))
  const bottomPad = useFluidPx(fluid(96, 56))

  return (
    <>
      <Head>
        <title>Enclosure Modeler — North Coast Soundworks</title>
        <meta
          name="description"
          content="Model any subwoofer in our catalog: sealed, ported, and infinite-baffle response, cone excursion against Xmax, and the alignment numbers, computed live from measured Thiele/Small parameters."
        />
      </Head>
      <View style={outerStyle}>
        <SiteNav links={NAV_LINKS} phone={PHONE} />
        <ScrollView style={{ flex: 1, backgroundColor: colors.white }} contentContainerStyle={{ flexGrow: 1 }}>
          {/* Breadcrumb */}
          <Container>
            <View style={{ paddingTop: 18, flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <Eyebrow>Home</Eyebrow>
              <Eyebrow>/</Eyebrow>
              <Eyebrow tone="accent">Enclosure modeler</Eyebrow>
            </View>
          </Container>

          {/* Hero lockup */}
          <Container>
            <View style={{ paddingTop: heroTop } as any}>
              <Heading level="h2">Every driver we evaluate,</Heading>
              <Heading level="h2">in any box you can build</Heading>
            </View>
          </Container>

          <View style={{ paddingTop: sectionTop } as any}>
            <Container>
              <View
                style={
                  {
                    borderTopWidth: 1,
                    borderTopColor: colors.ink,
                    paddingTop: 14,
                    marginBottom: introGap,
                  } as any
                }
              >
                <Eyebrow>01 / Modeler</Eyebrow>
              </View>
              <View style={{ marginBottom: introGap } as any}>
                <Lead>
                  Pick a driver, set a box, and read the same curves we read: modeled SPL response for ported,
                  sealed, and infinite-baffle alignments, cone excursion against Xmax at rated power, and the
                  numbers that decide a build — computed live from each driver's measured Thiele/Small parameters.
                </Lead>
              </View>
              <BoxModeler />
            </Container>
          </View>

          <View style={{ height: bottomPad } as any} />
          <Footer />
        </ScrollView>
      </View>
    </>
  )
}
