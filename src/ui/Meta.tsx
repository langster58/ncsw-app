import { Platform, Text, View } from 'react-native'
import { colors, fonts, tracking } from './tokens'

// Meta — a grid of label/value pairs (e.g. ENCLOSURE: Free-air · BEST FOR: SUV · Hatch).
// Labels are mono uppercase gray; values are mono ink.
//
//   <Meta cols={2} items={[
//     ['Subwoofer', 'Adire Kali 18 · infinite baffle'],
//     ['Front stage', 'Audiofrog GB60 · GB15 · GS8ND2'],
//   ]} />

type Item = [label: string, value: string]

type MetaProps = {
  items: Item[]
  cols?: 1 | 2 | 3 | 4
}

export function Meta({ items, cols = 2 }: MetaProps) {
  const isWeb = Platform.OS === 'web'
  return (
    <View
      style={
        isWeb
          ? ({
              display: 'grid',
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              gap: 18,
            } as any)
          : { flexDirection: 'row', flexWrap: 'wrap', gap: 18 }
      }
    >
      {items.map(([label, value]) => (
        <View
          key={label}
          style={
            isWeb
              ? undefined
              : { width: cols > 1 ? `${100 / cols - 4}%` as any : '100%' }
          }
        >
          <Text
            style={
              {
                fontFamily: fonts.mono,
                fontSize: 11,
                fontWeight: '500',
                letterSpacing: tracking.label,
                textTransform: 'uppercase',
                color: colors.gray,
                marginBottom: 6,
              } as any
            }
          >
            {label}
          </Text>
          <Text
            style={{
              fontFamily: fonts.mono,
              fontSize: 14,
              fontWeight: '500',
              color: colors.ink,
            }}
          >
            {value}
          </Text>
        </View>
      ))}
    </View>
  )
}
