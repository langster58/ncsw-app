import type { ReactNode } from 'react'
import { ScrollView } from 'react-native'
import { fluid, useFluidPx } from './tokens'

// Shelf — a horizontal-scrolling row of cards (related systems, build logs,
// collections). A layout, not a card: pass Cards (or any fixed-width children)
// as children. The overflow is what tells the user it scrolls, so children
// should have a fixed/clamped width rather than flexing to fit.

export function Shelf({ children, gap = 18 }: { children: ReactNode; gap?: number }) {
  const g = useFluidPx(fluid(gap, Math.round(gap * 0.8)))
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: g, paddingBottom: 16, alignItems: 'stretch' } as any}
    >
      {children}
    </ScrollView>
  )
}
