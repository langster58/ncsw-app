import { Linking, Platform, Pressable, Text, View } from 'react-native'
import { colors, fonts, tracking, type, useFluidPx } from './tokens'

// .opener — top hairline rule + section index ("01 / Our packages") + optional
// "door" CTA on the right. Source: SectionOpener in Chrome.jsx + .opener CSS.

export function Opener({
  index,
  label,
  doorLabel,
  doorHref,
}: {
  index: string
  label: string
  doorLabel?: string
  doorHref?: string
}) {
  const idxFontSize = useFluidPx(type.meta)
  return (
    <View
      style={
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTopWidth: 1,
          borderTopColor: colors.ink,
          paddingTop: 14,
          marginBottom: 48,
          gap: 18,
        } as any
      }
    >
      {/* .opener .idx — mono uppercase, gray */}
      <Text
        style={
          {
            fontFamily: fonts.mono,
            fontSize: idxFontSize,
            fontWeight: '500',
            letterSpacing: tracking.wide,
            textTransform: 'uppercase',
            color: colors.gray,
          } as any
        }
      >
        {index} / {label}
      </Text>

      {doorLabel ? <Door label={doorLabel} href={doorHref} /> : null}
    </View>
  )
}

// .door — uppercase tracked link affordance with an arrow glyph.
function Door({ label, href }: { label: string; href?: string }) {
  const onPress = () => {
    if (!href) return
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') window.location.href = href
    } else {
      Linking.openURL(href).catch(() => {})
    }
  }
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
      <Text
        style={
          {
            fontFamily: fonts.body,
            fontSize: 11,
            fontWeight: '600',
            letterSpacing: tracking.label,
            textTransform: 'uppercase',
            color: colors.ink,
          } as any
        }
      >
        {label}
      </Text>
      <Text style={{ color: colors.ink, fontSize: 14, lineHeight: 14 }}>{'→'}</Text>
    </Pressable>
  )
}
