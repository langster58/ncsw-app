import React from 'react'
import { Platform, Text } from 'react-native'
import { colors } from './tokens'

// Icon atom — one shared SVG primitive used everywhere an icon appears so
// chevrons, arrows, etc. are byte-identical wherever they show up. Add a new
// glyph by appending an entry to GLYPHS and exporting a named component.
//
// Web: <svg> with stroke="currentColor" so it inherits parent text color.
// Native: a Text glyph fallback (no react-native-svg installed yet).

type IconProps = {
  size?: number
  color?: string
}

type GlyphDef = { path: string; fallback: string }

const GLYPHS: Record<string, GlyphDef> = {
  arrow: { path: 'M5 12h13M12 6l6 6-6 6', fallback: '→' },
  chevronDown: { path: 'M6 9l6 6 6-6', fallback: '⌄' },
  chevronUp: { path: 'M18 15l-6-6-6 6', fallback: '⌃' },
  chevronRight: { path: 'M9 6l6 6-6 6', fallback: '›' },
  chevronLeft: { path: 'M15 6l-6 6 6 6', fallback: '‹' },
  close: { path: 'M6 6l12 12M18 6l-12 12', fallback: '✕' },
  check: { path: 'M5 12l5 5 9-9', fallback: '✓' },
}

function makeIcon(key: keyof typeof GLYPHS) {
  return function NamedIcon({ size = 16, color }: IconProps) {
    const g = GLYPHS[key]
    if (Platform.OS === 'web') {
      return React.createElement(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: color ?? 'currentColor',
          strokeWidth: 2,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          style: { display: 'inline-block', flexShrink: 0, verticalAlign: 'middle' },
          'aria-hidden': true,
        },
        React.createElement('path', { d: g.path }),
      )
    }
    return (
      <Text style={{ fontSize: size, lineHeight: size, color: color ?? colors.ink }}>
        {g.fallback}
      </Text>
    )
  }
}

export const IconArrow = makeIcon('arrow')
export const IconChevron = makeIcon('chevronDown')
export const IconChevronUp = makeIcon('chevronUp')
export const IconChevronRight = makeIcon('chevronRight')
export const IconChevronLeft = makeIcon('chevronLeft')
export const IconClose = makeIcon('close')
export const IconCheck = makeIcon('check')
