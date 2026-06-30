import { useContext, type ReactNode } from 'react'
import { Text } from 'react-native'
import { FullWidthCopyContext } from './CopyContext'
import {
  colors,
  copyMaxWidth,
  fluidLineHeight,
  fonts,
  lineHeight,
  type,
  useFluidPx,
} from './tokens'

// Section lede / body paragraph. One component for all paragraph copy.
// Single edit point for ALL body copy:
//   - color     → tokens.colors.body
//   - font      → tokens.fonts.body
//   - maxWidth  → tokens.copyMaxWidth (skipped when inside a bounded
//                  container like Card.Body — see FullWidthCopyContext)
//   - size      → tokens.type.lead | .body

type Size = 'heroLead' | 'lead' | 'body'

export function Lead({ size = 'lead', children }: { size?: Size; children: ReactNode }) {
  const fontSize = useFluidPx(type[size])
  const lh = fluidLineHeight(fontSize, lineHeight.body)
  const fullWidth = useContext(FullWidthCopyContext)
  return (
    <Text
      style={
        {
          fontFamily: fonts.body,
          fontSize,
          lineHeight: lh,
          color: colors.body,
          ...(fullWidth ? null : { maxWidth: copyMaxWidth }),
        } as any
      }
    >
      {children}
    </Text>
  )
}
