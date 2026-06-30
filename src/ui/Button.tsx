import { useState } from 'react'
import { Platform, Pressable, Text, View } from 'react-native'
import { colors, fonts, radius, tracking } from './tokens'

// Button — one size, two variants, standard states.
//
//   <Button variant="primary" onPress={...}>Call now</Button>
//   <Button variant="secondary" disabled>…</Button>
//
// Variants
//   primary    — filled accent (Call Now, Show packages)
//   secondary  — white outline (Reset, Cancel, Nav CTA)
//
// States (cascade from tokens.colors):
//   default · hover · pressed · focus · disabled · loading
//
// Source dimensions: .btn { min-height:36; padding:7×14; radius:8; font 10/600/uppercase/.12em }

type Variant = 'primary' | 'secondary'

type ButtonProps = {
  children: React.ReactNode
  variant?: Variant
  disabled?: boolean
  loading?: boolean
  icon?: React.ReactNode
  onPress?: () => void
}

export function Button({
  children,
  variant = 'secondary',
  disabled = false,
  loading = false,
  icon,
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

  const inert = disabled || loading
  const { bg, fg, border } = resolveColors(variant, { hovered, pressed, disabled: inert })

  return (
    <Pressable
      onPress={inert ? undefined : onPress}
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
          opacity: loading ? 0.6 : 1,
          cursor: inert ? 'not-allowed' : 'pointer',
          ...(focused && Platform.OS === 'web'
            ? { outlineWidth: 2, outlineStyle: 'solid', outlineColor: colors.focusRing, outlineOffset: 3 }
            : null),
        } as any
      }
    >
      {loading ? <Spinner color={fg} /> : null}
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
      {icon ? (
        <View
          style={
            { transform: hovered && !inert ? [{ translateX: 2 }] : [] } as any
          }
        >
          {icon}
        </View>
      ) : null}
    </Pressable>
  )
}

function resolveColors(
  variant: Variant,
  state: { hovered: boolean; pressed: boolean; disabled: boolean },
) {
  if (state.disabled) {
    return { bg: colors.disabledBg, fg: colors.disabledFg, border: colors.disabledBorder }
  }
  if (variant === 'primary') {
    // Standard primary: darken by ~5% (hover) / ~10% (pressed) of base accent.
    return {
      bg: state.pressed ? colors.accentPressed : state.hovered ? colors.accentHover : colors.accent,
      fg: colors.white,
      border: state.pressed ? colors.accentPressed : state.hovered ? colors.accentHover : colors.accent,
    }
  }
  // Standard secondary (outline): subtle bg fill on hover, slightly darker on pressed.
  return {
    bg: state.pressed ? colors.surfacePressed : state.hovered ? colors.surfaceHover : colors.white,
    fg: colors.ink,
    border: state.pressed
      ? colors.borderStrongActive
      : state.hovered
        ? colors.borderStrongHover
        : colors.borderStrong,
  }
}

function Spinner({ color }: { color: string }) {
  return (
    <View
      style={{
        width: 10,
        height: 10,
        borderRadius: 5,
        borderWidth: 2,
        borderColor: color,
        borderTopColor: 'transparent',
      }}
    />
  )
}
