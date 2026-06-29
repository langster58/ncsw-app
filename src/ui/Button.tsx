import { useState } from 'react'
import { Platform, Pressable, Text, View } from 'react-native'
import { colors, fonts, radius, tracking } from './tokens'

// Button — three variants, all standard states.
//
//   <Button variant="primary" size="md" onPress={...}>Call now</Button>
//   <Button variant="secondary" icon={<Arrow />} disabled loading>…</Button>
//
// Source: .btn / .nav-cta / .btn-primary in home.css. All shape/state values
// come from the source CSS verbatim.

type Variant = 'primary' | 'secondary' | 'ghost'
type Size = 'md' | 'lg'

type ButtonProps = {
  children: React.ReactNode
  variant?: Variant
  size?: Size
  disabled?: boolean
  loading?: boolean
  icon?: React.ReactNode
  onPress?: () => void
}

const SIZE_MAP: Record<Size, { minHeight: number; paddingVertical: number; paddingHorizontal: number; fontSize: number }> = {
  md: { minHeight: 36, paddingVertical: 7, paddingHorizontal: 14, fontSize: 10 }, // .btn default
  lg: { minHeight: 48, paddingVertical: 12, paddingHorizontal: 20, fontSize: 12 },
}

export function Button({
  children,
  variant = 'secondary',
  size = 'md',
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
  const sz = SIZE_MAP[size]
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
          minHeight: sz.minHeight,
          paddingVertical: sz.paddingVertical,
          paddingHorizontal: sz.paddingHorizontal,
          borderWidth: variant === 'ghost' ? 0 : 1,
          borderColor: border,
          borderRadius: radius.sm,
          backgroundColor: bg,
          opacity: loading ? 0.6 : 1,
          cursor: inert ? 'not-allowed' : 'pointer',
          // web-only focus ring
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
            fontSize: sz.fontSize,
            lineHeight: sz.fontSize,
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
            {
              // Source: icon translateX(2) on hover.
              transform: hovered && !inert ? [{ translateX: 2 }] : [],
            } as any
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
    return {
      bg: state.pressed ? colors.accentPressed : state.hovered ? colors.accentHover : colors.accent,
      fg: colors.white,
      border: state.pressed ? colors.accentPressed : state.hovered ? colors.accentHover : colors.accent,
    }
  }
  if (variant === 'ghost') {
    return {
      bg: 'transparent',
      fg: state.pressed ? colors.gray : state.hovered ? colors.accent : colors.ink,
      border: 'transparent',
    }
  }
  // secondary (outline) — source .btn default
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

// Tiny spinner — non-animated dot in v1 (animation lives outside the primitive).
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
