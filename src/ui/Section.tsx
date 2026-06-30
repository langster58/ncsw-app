import type { ReactNode } from 'react'
import { View } from 'react-native'
import { space, useFluidPx } from './tokens'

// .section — owns its top spacing only (never doubled bottom+top).
// Per the source: padding-top: 96px @ 1920 anchor (fluid via tokens).
// Adjacent sections create their own rhythm via each one's own padding-top.
//
// `top` overrides the default with a raw number (e.g. the hero uses 64).

export function Section({
  children,
  top,
}: {
  children: ReactNode
  top?: number
}) {
  const fluidTop = useFluidPx(space.sectionTop)
  return <View style={{ paddingTop: top ?? fluidTop } as any}>{children}</View>
}
