import type { ReactNode } from 'react'
import { View } from 'react-native'
import { space } from './tokens'

// .section — owns its top spacing only (never doubled bottom+top).
// Per the source: padding-top: 96px; padding-bottom: 0.
// Adjacent sections create their own rhythm via each one's own padding-top.

export function Section({ children }: { children: ReactNode }) {
  return <View style={{ paddingTop: space.sectionTop }}>{children}</View>
}
