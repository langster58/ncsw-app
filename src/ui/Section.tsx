import type { ReactNode } from 'react'
import { View } from 'react-native'
import { space, useFluidPx } from './tokens'

// .section — owns its top spacing only (never doubled bottom+top).
// Per the source: padding-top: 96px @ 1920 anchor (fluid via tokens).
// Adjacent sections create their own rhythm via each one's own padding-top.
//
// `top` overrides the default with a raw number (e.g. the hero uses 64).
// `style` lets a caller add things like backgroundColor (e.g. a dark-band
// section like the footer) without a separate wrapping View.

export function Section({
  children,
  top,
  style,
}: {
  children: ReactNode
  top?: number
  style?: object
}) {
  const fluidTop = useFluidPx(space.sectionTop)
  return <View style={{ paddingTop: top ?? fluidTop, ...style } as any}>{children}</View>
}
