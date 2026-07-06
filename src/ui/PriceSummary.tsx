import { Text, View } from 'react-native'
import { colors, fonts, type, useFluidPx } from './tokens'

// PriceSummary — the receipt close: subtotal lines, a short rule, then the
// total. Right-aligned by default (align="left" to left-align). Values are mono
// tabular; the total steps up in size and weight.

type Line = { label: string; value: string }

export function PriceSummary({
  lines,
  total,
  align = 'right',
}: {
  lines: Line[]
  total: Line
  align?: 'left' | 'right'
}) {
  const smallSize = useFluidPx(type.small)
  const totalLabelSize = useFluidPx(type.body)
  const totalValueSize = useFluidPx(type.h4)

  const row = {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 24,
    paddingVertical: 8,
  } as const

  return (
    <View style={{ maxWidth: 440, width: '100%', ...(align === 'right' ? { marginLeft: 'auto' } : null) } as any}>
      {lines.map((l, i) => (
        <View key={i} style={row as any}>
          <Text style={{ fontFamily: fonts.body, fontSize: smallSize, color: colors.body } as any}>{l.label}</Text>
          <Text style={{ fontFamily: fonts.mono, fontSize: smallSize, fontWeight: '500', color: colors.tableInk } as any}>
            {l.value}
          </Text>
        </View>
      ))}
      <View style={{ borderTopWidth: 1, borderTopColor: colors.tableLineStrong, marginVertical: 6 }} />
      <View style={row as any}>
        <Text style={{ fontFamily: fonts.body, fontSize: totalLabelSize, fontWeight: '600', color: colors.ink } as any}>
          {total.label}
        </Text>
        <Text style={{ fontFamily: fonts.mono, fontSize: totalValueSize, fontWeight: '500', color: colors.ink } as any}>
          {total.value}
        </Text>
      </View>
    </View>
  )
}
