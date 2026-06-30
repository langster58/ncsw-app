import { Text, View } from 'react-native'
import { colors, fonts } from './tokens'

// ScoreMeter — numeric value + small fill bar. Used in the package table's
// "Value Score" column. Bar fills to value/max (default max 100).
//
//   <ScoreMeter value={57} />        // 57 / 100
//   <ScoreMeter value={37} max={50}> // 37 / 50

type Props = {
  value: number
  max?: number
  width?: number
  height?: number
}

export function ScoreMeter({ value, max = 100, width = 34, height = 4 }: Props) {
  const pct = Math.max(0, Math.min(1, value / max))
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Text style={{ fontFamily: fonts.body, fontSize: 13.5, color: colors.inkSoft }}>{value}</Text>
      <View
        style={{
          width,
          height,
          borderRadius: 9999,
          backgroundColor: colors.line,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            height: '100%',
            borderRadius: 9999,
            backgroundColor: colors.accent,
            width: (`${pct * 100}%` as any),
          }}
        />
      </View>
    </View>
  )
}
