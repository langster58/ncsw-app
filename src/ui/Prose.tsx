import { Text, View } from 'react-native'
import { Heading } from './Heading'
import { colors, copyMaxWidth, fluid, fluidLineHeight, fonts, type, useFluidPx } from './tokens'

// Prose — article body copy. Renders a sequence of typographic blocks with the
// site's tokens, constrained to copyMaxWidth like every other section's copy.
// Sub-heads reuse the Heading primitive (h3); quotes/lists/paragraphs use the
// shared type scale. One primitive, used by every article.

export type ProseBlock =
  | { type: 'p'; text: string }
  | { type: 'h'; text: string }
  | { type: 'quote'; text: string }
  | { type: 'list'; items: string[] }

export function Prose({ blocks }: { blocks: ProseBlock[] }) {
  const pSize = useFluidPx(type.lead)
  const pLine = fluidLineHeight(pSize, 1.62)
  const quoteSize = useFluidPx(type.h3)
  const quoteLine = fluidLineHeight(quoteSize, 1.3)
  const gap = useFluidPx(fluid(22, 18))
  const hTop = useFluidPx(fluid(44, 32))
  const quoteV = useFluidPx(fluid(34, 26))

  return (
    <View>
      {blocks.map((b, i) => {
        if (b.type === 'h')
          return (
            <View key={i} style={{ marginTop: hTop as any, marginBottom: 6 } as any}>
              <Heading level="h3">{b.text}</Heading>
            </View>
          )
        if (b.type === 'quote')
          return (
            <View
              key={i}
              style={{ maxWidth: copyMaxWidth, marginVertical: quoteV as any, borderLeftWidth: 3, borderLeftColor: colors.accent, paddingLeft: 22 } as any}
            >
              <Text style={{ fontFamily: fonts.display, fontSize: quoteSize as any, lineHeight: quoteLine as any, letterSpacing: -0.5, color: colors.ink } as any}>
                {b.text}
              </Text>
            </View>
          )
        if (b.type === 'list')
          return (
            <View key={i} style={{ maxWidth: copyMaxWidth, marginTop: gap as any, gap: 10 } as any}>
              {b.items.map((it, j) => (
                <View key={j} style={{ flexDirection: 'row', gap: 12 } as any}>
                  <Text style={{ fontFamily: fonts.mono, fontSize: pSize as any, color: colors.accent, lineHeight: pLine as any } as any}>—</Text>
                  <Text style={{ fontFamily: fonts.body, fontSize: pSize as any, color: colors.body, lineHeight: pLine as any, flex: 1 } as any}>{it}</Text>
                </View>
              ))}
            </View>
          )
        return (
          <Text
            key={i}
            style={{ fontFamily: fonts.body, fontSize: pSize as any, lineHeight: pLine as any, color: colors.body, maxWidth: copyMaxWidth, marginTop: gap as any } as any}
          >
            {b.text}
          </Text>
        )
      })}
    </View>
  )
}
