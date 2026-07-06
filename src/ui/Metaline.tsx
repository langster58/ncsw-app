import React from 'react'
import { Text, View } from 'react-native'
import { colors, fonts, tracking, type, useFluidPx } from './tokens'

// Metaline — a single line of static metadata: mono uppercase items separated
// by middots (e.g. "Performance tier · Sealed alignment · In stock · SKU …").
// This is the site's standard treatment for static metadata; pill/chip shapes
// are reserved for interactive filter controls, never for read-only metadata.

type Tone = 'default' | 'ink' | 'accent'
type Item = string | { text: string; tone?: Tone }

function toneColor(tone: Tone) {
  return tone === 'accent' ? colors.accent : tone === 'ink' ? colors.ink : colors.gray
}

export function Metaline({ items }: { items: Item[] }) {
  const fontSize = useFluidPx(type.meta)
  const base = {
    fontFamily: fonts.mono,
    fontSize,
    fontWeight: '500',
    letterSpacing: tracking.wide,
    textTransform: 'uppercase',
  } as const

  const norm = items.map((it) => (typeof it === 'string' ? { text: it, tone: 'default' as Tone } : it))

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
      {norm.map((it, i) => (
        <React.Fragment key={i}>
          {i > 0 ? (
            <Text style={{ ...base, color: colors.inkFaint, paddingHorizontal: 6 } as any}>·</Text>
          ) : null}
          <Text style={{ ...base, color: toneColor(it.tone ?? 'default') } as any}>{it.text}</Text>
        </React.Fragment>
      ))}
    </View>
  )
}
