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
  // The hero statement is display-scale: light weight, tight leading. Body
  // leading (1.58) at 36px reads as gaps, not rhythm.
  const isHero = size === 'heroLead'
  const lh = fluidLineHeight(fontSize, isHero ? 1.3 : lineHeight.body)
  const fullWidth = useContext(FullWidthCopyContext)
  // The hero measure is set in `ch` (character-relative), not the shared
  // `copyMaxWidth` percentage: a % width and a fluid font-size scale on two
  // different curves, so the line breaks (the rag) drift and reflow
  // differently at every viewport. `ch` scales in lockstep with the font
  // size itself, so the same ~64 characters land per line at any size —
  // wider than the old measure, and the rag never changes shape.
  const heroMaxWidth = '64ch'
  return (
    <Text
      style={
        {
          fontFamily: fonts.body,
          fontWeight: isHero ? '300' : '400',
          fontSize,
          lineHeight: lh,
          color: colors.body,
          ...(fullWidth ? null : { maxWidth: isHero ? heroMaxWidth : copyMaxWidth }),
        } as any
      }
    >
      {children}
    </Text>
  )
}
