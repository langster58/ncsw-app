import { useState } from 'react'
import { Platform, Pressable, Text } from 'react-native'
import { colors, fonts, radius, tracking } from './tokens'

// Button — one size, two variants. Material Design state coverage:
//
//   enabled · hover · focus · pressed · disabled
//
//   <Button variant="primary" onPress={...}>Call now</Button>
//   <Button variant="secondary" disabled>…</Button>
//
// Variants
//   primary    — filled accent (Call Now, Show packages)
//   secondary  — outlined accent (Reset, Cancel, Nav CTA) — accent label +
//                accent border so it never reads as a disabled control.
//
// Focus is rendered as a 2px ring with 3px offset (Material 3 focus indicator)
// stacked on top of the hover-equivalent state layer, so keyboard focus is
// always visible regardless of hover.
//
// Source dimensions: .btn { min-height:36; padding:7×14; radius:8; font 10/600/uppercase/.12em }

type Variant = 'primary' | 'secondary'

type ButtonProps = {
  children: React.ReactNode
  variant?: Variant
  disabled?: boolean
  onPress?: () => void
}

export function Button({
  children,
  variant = 'secondary',
  disabled = false,
  onPress,
}: ButtonProps) {
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

  const { bg, fg, border } = resolveColors(variant, {
    hovered: hovered && !disabled,
    pressed: pressed && !disabled,
    focused: focused && !disabled,
    disabled,
  })

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      {...hoverProps}
      {...focusProps}
      style={
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 9,
          minHeight: 36,
          paddingVertical: 7,
          paddingHorizontal: 14,
          borderWidth: 1,
          borderColor: border,
          borderRadius: radius.sm,
          backgroundColor: bg,
          cursor: disabled ? 'not-allowed' : 'pointer',
          ...(focused && Platform.OS === 'web'
            ? {
                outlineWidth: 2,
                outlineStyle: 'solid',
                outlineColor: colors.focusRing,
                outlineOffset: 3,
              }
            : null),
        } as any
      }
    >
      <Text
        style={
          {
            fontFamily: fonts.body,
            fontSize: 10,
            lineHeight: 10,
            fontWeight: '600',
            letterSpacing: tracking.label,
            textTransform: 'uppercase',
            color: fg,
          } as any
        }
      >
        {children}
      </Text>
    </Pressable>
  )
}

// State layers (Material 3): focus and hover layer the same tint; pressed is
// the deepest. Disabled wins over everything else.
function resolveColors(
  variant: Variant,
  state: { hovered: boolean; pressed: boolean; focused: boolean; disabled: boolean },
) {
  if (state.disabled) {
    return { bg: colors.disabledBg, fg: colors.disabledFg, border: colors.disabledBorder }
  }

  if (variant === 'primary') {
    const bg = state.pressed
      ? colors.accentPressed
      : state.hovered || state.focused
        ? colors.accentHover
        : colors.accent
    return { bg, fg: colors.white, border: bg }
  }

  // Secondary (outlined). Accent label + accent border so it's clearly an
  // interactive control, not a disabled one.
  const bg = state.pressed
    ? colors.accentSoftPressed
    : state.hovered || state.focused
      ? colors.accentSoft
      : colors.white
  const accent = state.pressed ? colors.accentPressed : colors.accent
  return { bg, fg: accent, border: accent }
}
