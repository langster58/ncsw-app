import { ScrollView } from 'react-native'
import { Preloader, Reveal } from '@/ui'
import { Nav } from '@/components/Nav'
import { Hero } from '@/components/Hero'
import { Packages } from '@/components/Packages'
import { PackageTable } from '@/components/PackageTable'
import { HowItWorks } from '@/components/HowItWorks'
import { Collections } from '@/components/Collections'
import { Editorial } from '@/components/Editorial'
import { Location } from '@/components/Location'
import { Footer } from '@/components/Footer'

export default function HomeScreen() {
  return (
    <>
      <Preloader />
      <ScrollView
        style={{ flex: 1, backgroundColor: '#ffffff' }}
        contentContainerStyle={{ flexGrow: 1 }}
      >
        <Nav />
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
    </>
  )
}
