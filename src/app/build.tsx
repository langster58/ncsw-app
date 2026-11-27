import React from 'react'
import { Platform, ScrollView, Text, View } from 'react-native'
import Head from 'expo-router/head'
import { useLocalSearchParams } from 'expo-router'
import { Container, Eyebrow, FullWidthCopyContext, Heading, Lead, Link, colors, fonts, radius } from '@/ui'
import { SiteNav } from '@/components/SiteNav'
import { Footer } from '@/components/Footer'
import { callLabel, telHref } from '@/lib/site'
import { BUILDS, type Build } from '@/lib/builds'

// Build documentation for a demo car: /build?car=<slug>. The homepage's demo-car
// cards open these (Brett, 2026-11-27: the demo cars link to their build
// documentation, not to the systems page). Content lives in lib/builds.ts and
// holds only what Brett has said about each car.

const IS_WEB = Platform.OS === 'web'

export default function BuildScreen() {
  const params = useLocalSearchParams<{ car?: string }>()
  const slug = typeof params.car === 'string' ? params.car : ''
  const b = BUILDS.find((x) => x.slug === slug) ?? null
  const outer: any = IS_WEB ? { height: '100dvh', flexDirection: 'column' } : { flex: 1, flexDirection: 'column' }
  const call = telHref()

  return (
    <>
      <Head>
        <title>{b ? `${b.car} build — North Coast Soundworks` : 'Builds — North Coast Soundworks'}</title>
        {b ? <meta name="description" content={b.summary} /> : null}
      </Head>
      <View style={outer}>
        <SiteNav />
        <ScrollView style={{ flex: 1, backgroundColor: colors.white }} contentContainerStyle={{ flexGrow: 1 }}>
          <Container>
            <View style={{ paddingTop: 18, flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <Link variant="text" href="/#demo-cars">Demo cars</Link>
              <Eyebrow>/</Eyebrow>
              <Eyebrow tone="accent">{b ? b.car : 'Build'}</Eyebrow>
            </View>
          </Container>

          {b ? <BuildBody b={b} /> : (
            <Container>
              <View style={{ paddingVertical: 64 }}>
                <Heading level="h2">That build isn’t here.</Heading>
                <View style={{ marginTop: 16 }}><Link variant="text" href="/#demo-cars">See the demo cars</Link></View>
              </View>
            </Container>
          )}

          {b ? (
            <Container>
              <View style={{ paddingTop: 40, paddingBottom: 72, borderTopWidth: 1, borderTopColor: colors.line, marginTop: 48, gap: 10 } as any}>
                <Heading level="h4" as={2}>Hear it at the shop</Heading>
                {call ? (
                  <Link variant="cta" href={call}>{`${callLabel} to set a time to listen.`}</Link>
                ) : (
                  <Lead>Call to set a time to sit in it and listen.</Lead>
                )}
              </View>
            </Container>
          ) : null}
          <Footer />
        </ScrollView>
      </View>
    </>
  )
}

function BuildBody({ b }: { b: Build }) {
  return (
    <>
      <Container>
        <View style={{ paddingTop: 48, gap: 14 } as any}>
          <Eyebrow>{b.status}</Eyebrow>
          <FullWidthCopyContext.Provider value={true}>
            <Heading level="h2">{b.car}</Heading>
            <Lead>{b.summary}</Lead>
          </FullWidthCopyContext.Provider>
        </View>
      </Container>

      {b.photo && IS_WEB ? (
        <Container>
          <View style={{ marginTop: 28, aspectRatio: 4 / 3, maxWidth: 900, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surface } as any}>
            {React.createElement('img', { src: b.photo, alt: b.car, style: { display: 'block', width: '100%', height: '100%', objectFit: 'cover' } })}
          </View>
        </Container>
      ) : null}

      <Container>
        <View style={{ marginTop: 48 }}>
          <Heading level="h4" as={2}>What’s in it</Heading>
          <View style={{ marginTop: 16, borderTopWidth: 1, borderTopColor: colors.ink }}>
            {b.parts.map(([what, detail]) => (
              <View key={what} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.line } as any}>
                <Text style={{ fontFamily: fonts.body, fontSize: 14, fontWeight: '600', color: colors.ink, width: 160 } as any}>{what}</Text>
                <Text style={{ fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.body, flex: 1, minWidth: 220 } as any}>{detail}</Text>
              </View>
            ))}
          </View>
        </View>
      </Container>

      {b.notes.length ? (
        <Container>
          <View style={{ marginTop: 40, gap: 12, maxWidth: 720 } as any}>
            <Heading level="h4" as={2}>How it’s built</Heading>
            {b.notes.map((n) => <Lead key={n}>{n}</Lead>)}
          </View>
        </Container>
      ) : null}
    </>
  )
}
