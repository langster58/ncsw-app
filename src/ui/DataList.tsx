import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import { colors, fonts, tracking, type, useFluidPx } from './tokens'

// DataList — label → value rows with hairline dividers. The standard treatment
// for a single record's read-only data: vehicle stats, component specs, the
// "Vehicle data" block. Mono uppercase label left, mono value right. Use
// `accent` to tint a value (e.g. a $0 / "verified" positive).

export type DataRow = { label: string; value: ReactNode; accent?: boolean }

export function DataList({ rows }: { rows: DataRow[] }) {
  const labelSize = useFluidPx(type.meta)
  const valueSize = useFluidPx(type.small)
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: colors.tableLineStrong }}>
      {rows.map((r, i) => (
        <View
          key={i}
          style={
            {
              flexDirection: 'row',
              justifyContent: 'space-between',
              gap: 16,
              paddingVertical: 11,
              borderBottomWidth: 1,
              borderBottomColor: colors.tableLine,
              alignItems: 'baseline',
            } as any
          }
        >
          <Text
            style={
              {
                fontFamily: fonts.mono,
                fontSize: labelSize,
                letterSpacing: tracking.wide,
                textTransform: 'uppercase',
                color: colors.gray,
              } as any
            }
          >
            {r.label}
          </Text>
          <Text
            style={
              {
                fontFamily: fonts.mono,
                fontSize: valueSize,
                fontWeight: '500',
                color: r.accent ? colors.accent : colors.tableInk,
                textAlign: 'right',
              } as any
            }
          >
            {r.value}
          </Text>
        </View>
      ))}
    </View>
  )
}
