import React from 'react'
import { Platform, Text, TextInput, View } from 'react-native'
import { colors, fonts, radius, tracking, type as typeScale, useFluidPx } from './tokens'

// TextField — string sibling of NumberField: mono label over a bordered
// text input, shared across platforms via RN TextInput.

type Props = {
  label: string
  value: string
  onChange: (s: string) => void
  placeholder?: string
  width?: number
}

export function TextField({ label, value, onChange, placeholder, width = 220 }: Props) {
  const [focused, setFocused] = React.useState(false)
  const labelSize = useFluidPx(typeScale.meta)
  const inputSize = useFluidPx(typeScale.small)

  return (
    <View style={{ flexDirection: 'column', gap: 6, width } as any}>
      <Text
        style={
          {
            fontFamily: fonts.mono,
            fontWeight: '600',
            fontSize: labelSize,
            color: colors.gray,
            textTransform: 'uppercase',
            letterSpacing: tracking.label,
          } as any
        }
        numberOfLines={1}
      >
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.inkFaint}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        accessibilityLabel={label}
        style={
          {
            fontFamily: fonts.mono,
            fontSize: inputSize,
            color: colors.ink,
            backgroundColor: colors.white,
            borderWidth: 1,
            borderColor: focused ? colors.accent : colors.line,
            borderRadius: radius.sm,
            minHeight: 38, // the shared control band (Dropdown, FilterTriggerButton)
            paddingVertical: 8,
            paddingHorizontal: 10,
            ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null),
          } as any
        }
      />
    </View>
  )
}
