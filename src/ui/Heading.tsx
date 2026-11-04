import { useContext, type ReactNode } from 'react'
import { Text, useWindowDimensions } from 'react-native'
import { FullWidthCopyContext } from './CopyContext'
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

type Level = 'h2' | 'h2sm' | 'h3' | 'h4' | 'h5'

// `level` is the look; `as` is the heading's rank in the page outline, which is
// what search engines, LLMs and screen readers read. On web, role + aria-level
// make react-native-web render a real <h1>–<h6>. Each look has a default rank;
// pass `as` when they differ (the page's one main heading is `as={1}`).
const DEFAULT_RANK: Record<Level, 1 | 2 | 3 | 4 | 5 | 6> = { h2: 2, h2sm: 2, h3: 3, h4: 4, h5: 5 }

export function Heading({
  level = 'h2',
  as,
  children,
}: {
  level?: Level
  as?: 1 | 2 | 3 | 4 | 5 | 6
  children: ReactNode
}) {
  const fontSize = useFluidPx(type[level])
  const lh = fluidLineHeight(fontSize, lineHeight.tight)
  // The shared 60% measure is for wide screens; on a phone it would squeeze
  // copy into a narrow column, so narrow screens use the full width.
  const { width } = useWindowDimensions()
  const fullWidth = useContext(FullWidthCopyContext) || width <= 760
  const rank = as ?? DEFAULT_RANK[level]
  return (
    <Text
      {...({ role: 'heading', 'aria-level': rank } as any)}
      style={
        {
          fontFamily: fonts.display,
          fontWeight: level === 'h2' || level === 'h2sm' ? '800' : '700',
          fontSize,
          lineHeight: lh,
          letterSpacing: tracking.display,
          color: colors.ink,
          ...(fullWidth ? null : { maxWidth: copyMaxWidth }),
        } as any
      }
    >
      {children}
    </Text>
  )
}
