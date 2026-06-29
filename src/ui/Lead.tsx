import type { ReactNode } from 'react'
import { Text } from 'react-native'
import { colors, copyMaxWidth, fonts, lineHeight, type, useFluidPx } from './tokens'

// Section lede / body paragraph. One component for all paragraph copy.
// Single edit point for ALL body copy:
//   - color     → tokens.colors.body
//   - font      → tokens.fonts.body
//   - maxWidth  → tokens.copyMaxWidth
//   - size      → tokens.type.lead | .body

type Size = 'lead' | 'body'

export function Lead({ size = 'lead', children }: { size?: Size; children: ReactNode }) {
  const fontSize = useFluidPx(type[size])
  return (
    <Text
      style={
        {
          fontFamily: fonts.body,
          fontSize,
          lineHeight: lineHeight.body,
          color: colors.body,
          maxWidth: copyMaxWidth,
        } as any
      }
    >
      {children}
    </Text>
  )
}
