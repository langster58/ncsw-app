import { ScrollView, Platform } from 'react-native'
import { Nav } from '@/components/Nav'
import { Hero } from '@/components/Hero'

export default function HomeScreen() {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#ffffff' }}
      contentContainerStyle={{ flexGrow: 1 }}
    >
      <Nav />
      <Hero />
    </ScrollView>
  )
}
