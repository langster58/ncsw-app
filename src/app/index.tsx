import { Platform, ScrollView, View } from 'react-native'
import { Preloader, Reveal, colors } from '@/ui'
import { Nav } from '@/components/Nav'
import { Hero } from '@/components/Hero'
import { Packages } from '@/components/Packages'
import { PackageTable } from '@/components/PackageTable'
import { HowItWorks } from '@/components/HowItWorks'
import { Collections } from '@/components/Collections'
import { Editorial } from '@/components/Editorial'
import { Location } from '@/components/Location'
import { Footer } from '@/components/Footer'

// Nav is a sibling above the ScrollView, not a child of it, so the scroll
// region starts below the nav (and the scrollbar tracks only that region,
// not the full viewport height).
const outerStyle: any =
  Platform.OS === 'web'
    ? { height: '100dvh', flexDirection: 'column' }
    : { flex: 1, flexDirection: 'column' }

export default function HomeScreen() {
  return (
    <>
      <Preloader />
      <View style={outerStyle}>
        <Nav />
        <ScrollView
          style={{ flex: 1, backgroundColor: colors.white }}
          contentContainerStyle={{ flexGrow: 1 }}
        >
          <Hero />
          <Reveal>
            <Packages />
          </Reveal>
          <Reveal>
            <PackageTable />
          </Reveal>
          <Reveal>
            <HowItWorks />
          </Reveal>
          <Reveal>
            <Collections />
          </Reveal>
          <Reveal>
            <Editorial />
          </Reveal>
          <Reveal>
            <Location />
          </Reveal>
          <Reveal>
            <Footer />
          </Reveal>
        </ScrollView>
      </View>
    </>
  )
}
