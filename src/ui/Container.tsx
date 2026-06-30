import type { ReactNode } from 'react'
import { View } from 'react-native'
import { space, useFluidPx } from './tokens'

// .container — full-bleed, fluid gutters. No max-width: content scales with
// the viewport. Single edit point: src/ui/tokens.ts -> space.containerPadX.

export function Container({ children }: { children: ReactNode }) {
  const padX = useFluidPx(space.containerPadX)
  return (
    <View style={{ width: '100%', paddingHorizontal: padX } as any}>{children}</View>
  )
}
