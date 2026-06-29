import type { ReactNode } from 'react'
import { Text } from 'react-native'
import {
  colors,
  copyMaxWidth,
  fluidLineHeight,
  fonts,
  lineHeight,
  tracking,
  type,
  useFluidPx,
} from './tokens'

// Section heading. One level by default (`h2`, the homepage section heading).
// `hero` for the hero wordmark size; `h3`/`h4` available for card titles.
//
// Single edit point for ALL headings:
//   - color           → tokens.colors.ink
//   - font            → tokens.fonts.display
//   - maxWidth        → tokens.copyMaxWidth
//   - fluid sizing    → tokens.type[level]

type Level = 'hero' | 'h2' | 'h3' | 'h4'

export function Heading({ level = 'h2', children }: { level?: Level; children: ReactNode }) {
  const fontSize = useFluidPx(type[level])
  const lh = fluidLineHeight(fontSize, lineHeight.tight)
  return (
    <Text
      style={
        {
          fontFamily: fonts.display,
          fontWeight: '800',
          fontSize,
          lineHeight: lh,
          letterSpacing: tracking.display,
          color: colors.ink,
          maxWidth: copyMaxWidth,
        } as any
      }
    >
      {children}
    </Text>
  )
}
