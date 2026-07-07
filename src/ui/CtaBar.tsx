import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import { Container } from './Container'
import { Heading } from './Heading'
import { colors, fluid, fonts, type, useFluidPx } from './tokens'

// CtaBar — the shared bottom call-to-action band: ink top rule, heading + blurb
// on the left, phone + action buttons on the right. Used by the PDP and article
// templates so the closing CTA reads identically across the site.

export function CtaBar({
  heading,
  body,
  phone,
  actions,
}: {
  heading: string
  body?: string
  phone?: string
  actions?: ReactNode
}) {
  const top = useFluidPx(fluid(96, 56))
  const padT = useFluidPx(fluid(40, 34))
  const padB = useFluidPx(fluid(48, 40))
  const bodySize = useFluidPx(type.small)
  const phoneSize = useFluidPx(type.h4)
  return (
    <View style={{ marginTop: top as any, borderTopWidth: 1, borderTopColor: colors.ink } as any}>
      <Container>
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 28, flexWrap: 'wrap', paddingTop: padT as any, paddingBottom: padB as any } as any}
        >
          <View>
            <Heading level="h2sm">{heading}</Heading>
            {body ? (
              <Text style={{ fontFamily: fonts.body, fontSize: bodySize as any, color: colors.gray, marginTop: 10, maxWidth: 460 } as any}>
                {body}
              </Text>
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center', flexWrap: 'wrap' } as any}>
            {phone ? (
              <Text style={{ fontFamily: fonts.mono, fontSize: phoneSize as any, color: colors.ink } as any}>{phone}</Text>
            ) : null}
            {actions}
          </View>
        </View>
      </Container>
    </View>
  )
}
