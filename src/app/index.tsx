import { ScrollView } from 'react-native'
import { Nav } from '@/components/Nav'
import { Hero } from '@/components/Hero'

export default function HomeScreen() {
  return (
    <ScrollView>
      <Nav />
      <Hero />
    </ScrollView>
  )
}
