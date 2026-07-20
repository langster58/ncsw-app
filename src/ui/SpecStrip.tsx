import { Text, View } from 'react-native'
import { colors, fonts, tracking, type, useFluidPx } from './tokens'

// SpecStrip — the automotive "at a glance" band: a wrapping row of spec cells
// (mono uppercase label, ink value, optional supporting sub-line), the format
// every car shopper knows from vehicle overview pages on Edmunds/MotorTrend.
// Here it carries vehicle + package facts instead of trim-sheet features.
// `accent` tints a value (a verified / $0 positive). Cells wrap into rows of
// ~4 on desktop and stack naturally on narrow viewports; hairlines run under
// each row so the wrapped grid stays legible without vertical rules.

export type SpecCell = { label: string; value: string; sub?: string; accent?: boolean }

export function SpecStrip({ cells }: { cells: SpecCell[] }) {
  const labelSize = useFluidPx(type.meta)
  const valueSize = useFluidPx(type.body)
  const subSize = useFluidPx(type.meta)
  return (
    <View
      style={
        {
          flexDirection: 'row',
          flexWrap: 'wrap',
          borderTopWidth: 1,
          borderTopColor: colors.tableLineStrong,
        } as any
      }
    >
      {cells.map((c) => (
        <View
          key={c.label}
          style={
            {
              flexGrow: 1,
              flexBasis: '23%',
              minWidth: 200,
              paddingVertical: 16,
              paddingRight: 28,
              borderBottomWidth: 1,
              borderBottomColor: colors.tableLine,
              gap: 5,
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
            {c.label}
          </Text>
          <Text
            style={
              {
                fontFamily: fonts.mono,
                fontSize: valueSize,
                fontWeight: '500',
                color: c.accent ? colors.accent : colors.tableInk,
              } as any
            }
          >
            {c.value}
          </Text>
          {c.sub ? (
            <Text style={{ fontFamily: fonts.mono, fontSize: subSize, color: colors.inkFaint } as any}>{c.sub}</Text>
          ) : null}
        </View>
      ))}
    </View>
  )
}
