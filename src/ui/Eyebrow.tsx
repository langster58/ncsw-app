import type { ReactNode } from 'react'
import { Text } from 'react-native'
import { colors, fonts, tracking, type, useFluidPx } from './tokens'

// Small uppercase mono label — section indices ("01 / Our packages"),
// kickers, card metadata labels.

type Tone = 'gray' | 'accent' | 'ink'

export function Eyebrow({ tone = 'gray', children }: { tone?: Tone; children: ReactNode }) {
  const fontSize = useFluidPx(type.meta)
  const color = tone === 'accent' ? colors.accent : tone === 'ink' ? colors.ink : colors.gray
  return (
    <Text
      style={
        {
          fontFamily: fonts.mono,
          fontSize,
          fontWeight: '500',
          letterSpacing: tracking.label,
          textTransform: 'uppercase',
          color,
        } as any
      }
    >
      {children}
    </Text>
  )
}
