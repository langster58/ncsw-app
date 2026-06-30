import { Pressable, Text, View } from 'react-native'
import { colors, fonts, radius, tracking } from './tokens'

// FilterTriggerButton — outline-style button that opens a filter sheet.
// Shows a small accent-colored badge with the current number of active filters.
//
//   <FilterTriggerButton activeCount={3} onPress={() => setSheet(true)} />

type Props = {
  label?: string
  activeCount?: number
  onPress: () => void
}

export function FilterTriggerButton({ label = 'Sort & Filter', activeCount = 0, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderRadius: radius.sm,
        borderWidth: 1,
        borderColor: colors.borderStrong,
        backgroundColor: colors.white,
        paddingHorizontal: 14,
        paddingVertical: 8,
        minHeight: 38,
      }}
    >
      {/* mini hamburger */}
      <View style={{ gap: 3 }}>
        <View style={{ width: 16, height: 2, backgroundColor: colors.inkSoft }} />
        <View style={{ width: 12, height: 2, backgroundColor: colors.inkSoft, alignSelf: 'center' }} />
        <View style={{ width: 8, height: 2, backgroundColor: colors.inkSoft, alignSelf: 'center' }} />
      </View>
      <Text
        style={
          {
            fontFamily: fonts.mono,
            fontSize: 11.5,
            fontWeight: '500',
            letterSpacing: tracking.label,
            textTransform: 'uppercase',
            color: colors.ink,
          } as any
        }
      >
        {label}
      </Text>
      {activeCount > 0 ? (
        <View
          style={{
            minWidth: 16,
            height: 16,
            paddingHorizontal: 4,
            borderRadius: 9999,
            backgroundColor: colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontFamily: fonts.mono, fontSize: 10, fontWeight: '600', color: colors.white }}>
            {activeCount}
          </Text>
        </View>
      ) : null}
    </Pressable>
  )
}
