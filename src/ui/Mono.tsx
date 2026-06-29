import { Text } from 'react-native'
import { colors, fonts, type, useFluidPx } from './tokens'

// Mono — IBM Plex Mono text for data values: prices, phone numbers, addresses,
// hours, spec values, table cells. Regular case (not uppercase — that's <Eyebrow>).
//
//   <Mono>$1,690</Mono>
//   <Mono size="md" tone="ink">(216) 555-0114</Mono>
//   <Mono size="lg">Adire Kali 18 · infinite baffle</Mono>
//
// Source: --font-mono is described as "measured data only (prices, counts,
// specs, coords)" in tokens.css.

type Size = 'sm' | 'md' | 'lg'
type Tone = 'ink' | 'gray' | 'accent'
type Weight = '400' | '500' | '600'

type MonoProps = {
  children: React.ReactNode
  size?: Size
  tone?: Tone
  weight?: Weight
}

const SIZE_TO_TOKEN: Record<Size, keyof typeof type> = {
  sm: 'meta', // 11 — small spec labels in cells, footer fine print
  md: 'body', // 14–15 — phone, address, table cell values, hours
  lg: 'lead', // 17 — card meta values
}

const TONE_TO_COLOR: Record<Tone, string> = {
  ink: colors.ink,
  gray: colors.gray,
  accent: colors.accent,
}

export function Mono({
  children,
  size = 'md',
  tone = 'ink',
  weight = '500',
}: MonoProps) {
  const fontSize = useFluidPx(type[SIZE_TO_TOKEN[size]])
  return (
    <Text
      style={
        {
          fontFamily: fonts.mono,
          fontSize,
          fontWeight: weight,
          color: TONE_TO_COLOR[tone],
        } as any
      }
    >
      {children}
    </Text>
  )
}
