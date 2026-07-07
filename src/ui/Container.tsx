import type { ReactNode } from 'react'
import { View } from 'react-native'
import { containerMax, space, useFluidPx } from './tokens'

// .container — caps at containerMax and centers, with fluid gutters inside.
// One shared measure for every page. Single edit points:
// src/ui/tokens.ts -> containerMax (width) and space.containerPadX (gutters).
// `alignSelf: 'center'` centers the capped box on both web and native (the
// default column stretch is what would otherwise pin it left).

// `max` overrides the default containerMax — e.g. an article body that wants a
// narrower centered measure than the full-bleed 1680.
export function Container({ children, max }: { children: ReactNode; max?: number }) {
  const padX = useFluidPx(space.containerPadX)
  return (
    <View
      style={
        {
          width: '100%',
          maxWidth: max ?? containerMax,
          alignSelf: 'center',
          paddingHorizontal: padX,
        } as any
      }
    >
      {children}
    </View>
  )
}
