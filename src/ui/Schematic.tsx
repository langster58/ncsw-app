import type { ReactNode } from 'react'
import { Text, View, useWindowDimensions } from 'react-native'
import { colors, fluid, fonts, narrowBreakpoint, radius, tracking, type, useFluidPx } from './tokens'

// Schematic — a system diagram paired with a numbered legend. The diagram is
// caller-supplied (an SVG top-down drawing, generated per topology); this
// component frames it in a surface box and renders the numbered-badge legend
// that keys to the diagram's callouts. Two columns on wide, stacked on narrow.

export type SchematicNode = { n: number; name: string; loc?: string }

export function Schematic({ diagram, legend }: { diagram: ReactNode; legend: SchematicNode[] }) {
  const { width } = useWindowDimensions()
  const narrow = width <= narrowBreakpoint
  const gap = useFluidPx(fluid(28, 24))
  const framePad = useFluidPx(fluid(16, 14))
  const nameSize = useFluidPx(type.small)
  const metaSize = useFluidPx(type.meta)

  const colBase: any = narrow ? { width: '100%' } : { flexShrink: 1 }

  return (
    <View style={{ flexDirection: narrow ? 'column' : 'row', gap, alignItems: 'flex-start' } as any}>
      <View
        style={
          {
            ...colBase,
            ...(narrow ? null : { flexGrow: 1.5, flexBasis: 0 }),
            backgroundColor: colors.figBg,
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: radius.md,
            padding: framePad,
          } as any
        }
      >
        {diagram}
      </View>

      <View
        style={
          {
            ...colBase,
            ...(narrow ? null : { flexGrow: 1, flexBasis: 0 }),
            borderTopWidth: 1,
            borderTopColor: colors.tableLineStrong,
          } as any
        }
      >
        {legend.map((item) => (
          <View
            key={item.n}
            style={
              {
                flexDirection: 'row',
                gap: 14,
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderBottomColor: colors.tableLine,
                alignItems: 'baseline',
              } as any
            }
          >
            <View
              style={{
                width: 20,
                height: 20,
                borderRadius: 10,
                backgroundColor: colors.ink,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontFamily: fonts.mono, fontSize: metaSize, fontWeight: '500', color: colors.white } as any}>
                {item.n}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: fonts.body, fontSize: nameSize, fontWeight: '600', color: colors.tableInk } as any}>
                {item.name}
              </Text>
              {item.loc ? (
                <Text
                  style={
                    {
                      fontFamily: fonts.mono,
                      fontSize: metaSize,
                      letterSpacing: tracking.wide,
                      textTransform: 'uppercase',
                      color: colors.gray,
                      marginTop: 2,
                    } as any
                  }
                >
                  {item.loc}
                </Text>
              ) : null}
            </View>
          </View>
        ))}
      </View>
    </View>
  )
}
