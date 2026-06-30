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

// Section heading. The hero wordmark is an SVG (not text), so there's no
// `hero` text level — only h2 / h2sm / h3 / h4.
//
// Single edit point for ALL headings:
//   - color           → tokens.colors.ink
//   - font            → tokens.fonts.display
//   - maxWidth        → tokens.copyMaxWidth
//   - fluid sizing    → tokens.type[level]

type Level = 'h2' | 'h2sm' | 'h3' | 'h4'

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
