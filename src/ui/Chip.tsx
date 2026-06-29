import { useState } from 'react'
import { Platform, Pressable, Text } from 'react-native'
import { colors, fonts } from './tokens'

// Chip — pill-shaped, toggleable. For filter facets, tag groups, segmented options.
//
//   <Chip selected={isOn} onPress={...}>Entry</Chip>
//   <Chip selected={false} variant="pick" onPress={...}>NCSW Pick</Chip>
//
// Source: .pkgtable Facet chips (PackagesTable.jsx). All state values verbatim
// from the source's Tailwind class strings.

type Variant = 'default' | 'pick'

type ChipProps = {
  children: React.ReactNode
  selected?: boolean
  variant?: Variant
  disabled?: boolean
  onPress?: () => void
}

export function Chip({
  children,
  selected = false,
  variant = 'default',
  disabled = false,
  onPress,
}: ChipProps) {
  const [hovered, setHovered] = useState(false)
  const [pressed, setPressed] = useState(false)
  const [focused, setFocused] = useState(false)

  const hoverProps: any =
    Platform.OS === 'web'
      ? { onHoverIn: () => setHovered(true), onHoverOut: () => setHovered(false) }
      : {}
  const focusProps: any =
    Platform.OS === 'web'
      ? { onFocus: () => setFocused(true), onBlur: () => setFocused(false) }
      : {}

  const { bg, fg, border, weight } = resolveChipColors(variant, {
    selected,
    hovered,
    pressed,
    disabled,
  })

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      onPress={disabled ? undefined : onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      {...hoverProps}
      {...focusProps}
      style={
        {
          flexDirection: 'row',
          alignItems: 'center',
          borderRadius: 100, // pill
          paddingHorizontal: 14,
          paddingVertical: 6,
          borderWidth: 1,
          borderColor: border,
          backgroundColor: bg,
          opacity: disabled ? 0.4 : 1,
          cursor: disabled ? 'not-allowed' : 'pointer',
          ...(focused && Platform.OS === 'web'
            ? { outlineWidth: 2, outlineStyle: 'solid', outlineColor: colors.focusRing, outlineOffset: 2 }
            : null),
        } as any
      }
    >
      <Text
        style={
          {
            fontFamily: fonts.body,
            fontSize: 13.5,
            fontWeight: weight,
            color: fg,
          } as any
        }
      >
        {children}
      </Text>
    </Pressable>
  )
}

function resolveChipColors(
  variant: Variant,
  state: { selected: boolean; hovered: boolean; pressed: boolean; disabled: boolean },
) {
  // selected (active) — same for both variants
  if (state.selected) {
    return {
      bg: state.pressed ? colors.accentSoftPressed : colors.accentSoft,
      fg: colors.accent,
      border: colors.accent,
      weight: '600' as const,
    }
  }
  // pick (recommended-default option, e.g. "NCSW Pick")
  if (variant === 'pick') {
    return {
      bg: state.pressed ? colors.accentSoft : state.hovered ? colors.accentSoft : colors.white,
      fg: colors.accent,
      border: state.hovered || state.pressed ? colors.accent : colors.borderStrong,
      weight: '500' as const,
    }
  }
  // default (inactive)
  return {
    bg: state.pressed
      ? colors.surfaceHoverNeutral
      : state.hovered
        ? colors.surface
        : colors.white,
    fg: state.hovered || state.pressed ? colors.ink : colors.inkSoft,
    border: state.hovered || state.pressed ? colors.inkFaint : colors.borderStrong,
    weight: '400' as const,
  }
}
