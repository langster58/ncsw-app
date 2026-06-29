import type { ReactNode } from 'react'
import { View } from 'react-native'
import { space } from './tokens'

// .section — owns its top spacing only (never doubled bottom+top).
// Per the source: padding-top: 96px; padding-bottom: 0.
// Adjacent sections create their own rhythm via each one's own padding-top.
//
// `top` overrides the default 96 (e.g. the hero uses 64 since it's the first
// block on the page).

export function Section({
  children,
  top = space.sectionTop,
}: {
  children: ReactNode
  top?: number
}) {
  return <View style={{ paddingTop: top }}>{children}</View>
}
