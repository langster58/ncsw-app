import type { ReactNode } from 'react'
import { View, useWindowDimensions } from 'react-native'
import { space, narrowBreakpoint } from './tokens'

// .container — max-width 1410, centered, 40px gutters (22 below narrow).
// Single edit point: src/ui/tokens.ts -> space.containerMax / containerPadX.

export function Container({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions()
  const padX = width <= narrowBreakpoint ? space.containerPadXMobile : space.containerPadX
  return (
    <View
      style={{
        width: '100%',
        maxWidth: space.containerMax,
        marginHorizontal: 'auto',
        paddingHorizontal: padX,
      }}
    >
      {children}
    </View>
  )
}
