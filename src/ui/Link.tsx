import React, { useState } from 'react'
import { Linking, Platform, Pressable, Text, View } from 'react-native'
import { colors, fonts, tracking } from './tokens'

// Link — four variants: nav, text, door, cta. Each maps to a source pattern:
//   nav  → .nav-link  : uppercase tracked top-bar link
//   text → inline body text link, accent + underlined
//   door → .door      : uppercase + arrow ("All articles", "Continue reading")
//   cta  → .hero-call : accent underlined call-to-action
//
//   <Link variant="nav" href="/#packages">Packages</Link>
//   <Link variant="door" href="/articles" icon={<Arrow />}>All articles</Link>

type Variant = 'nav' | 'text' | 'door' | 'cta'

type LinkProps = {
  children: React.ReactNode
  variant?: Variant
  href?: string
  icon?: React.ReactNode
  onPress?: () => void
}

export function Link({ children, variant = 'text', href, icon, onPress }: LinkProps) {
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)

  const hoverProps: any =
    Platform.OS === 'web'
      ? { onHoverIn: () => setHovered(true), onHoverOut: () => setHovered(false) }
      : {}
  const focusProps: any =
    Platform.OS === 'web'
      ? { onFocus: () => setFocused(true), onBlur: () => setFocused(false) }
      : {}

  const open = () => {
    if (onPress) return onPress()
    if (!href) return
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') window.location.href = href
    } else {
      Linking.openURL(href).catch(() => {})
    }
  }

  const { fg, underline, font, size, weight, letterSpacing, transform } = resolveLink(variant, hovered)

  // On web, render a real <a href> when href is set so cmd-click / middle-click /
  // screen readers all work natively. The Pressable wraps the visual styling.
  const Inner = (
    <Pressable
      onPress={open}
      {...hoverProps}
      {...focusProps}
      style={
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 9,
          cursor: 'pointer',
          ...(focused && Platform.OS === 'web'
            ? { outlineWidth: 2, outlineStyle: 'solid', outlineColor: colors.focusRing, outlineOffset: 2 }
            : null),
        } as any
      }
    >
      <View>
        <Text
          style={
            {
              fontFamily: font,
              fontSize: size,
              fontWeight: weight,
              letterSpacing,
              textTransform: transform,
              color: fg,
              ...(underline
                ? {
                    textDecorationLine: 'underline',
                    textUnderlineOffset: 4,
                    textDecorationThickness: 1,
                  }
                : null),
            } as any
          }
        >
          {children}
        </Text>
        {/* .nav-link ::after — animated underline sweep (web only) */}
        {variant === 'nav' && Platform.OS === 'web' ? (
          <View
            style={
              {
                position: 'absolute',
                left: 0,
                bottom: -3,
                height: 1,
                width: hovered ? '100%' : 0,
                backgroundColor: colors.accent,
                transition: 'width .3s ease',
              } as any
            }
          />
        ) : null}
      </View>
      {icon ? (
        <View
          style={
            {
              transform: hovered ? [{ translateX: 2 }] : [],
            } as any
          }
        >
          {icon}
        </View>
      ) : null}
    </Pressable>
  )

  if (Platform.OS === 'web' && href) {
    // Wrap in a real <a> for native browser behavior (cmd-click, middle-click, SR).
    return React.createElement(
      'a',
      {
        href,
        style: { textDecoration: 'none', color: 'inherit', display: 'inline-flex' },
        onClick: (e: any) => {
          // Modifier clicks pass through to the browser; left-click is handled by Pressable.
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return
        },
      },
      Inner,
    )
  }
  return Inner
}

function resolveLink(variant: Variant, hovered: boolean) {
  switch (variant) {
    case 'nav':
      return {
        fg: hovered ? colors.inkSoft : colors.ink,
        underline: false,
        font: fonts.body,
        size: 11,
        weight: '600' as const,
        letterSpacing: tracking.label,
        transform: 'uppercase' as const,
      }
    case 'door':
      return {
        fg: hovered ? colors.accent : colors.ink,
        underline: false,
        font: fonts.body,
        size: 11,
        weight: '600' as const,
        letterSpacing: tracking.label,
        transform: 'uppercase' as const,
      }
    case 'cta':
      return {
        fg: hovered ? colors.ink : colors.accent,
        underline: true,
        font: fonts.body,
        size: 15,
        weight: '600' as const,
        letterSpacing: 0,
        transform: 'none' as const,
      }
    case 'text':
    default:
      return {
        fg: hovered ? colors.ink : colors.accent,
        underline: true,
        font: fonts.body,
        size: 15,
        weight: '400' as const,
        letterSpacing: 0,
        transform: 'none' as const,
      }
  }
}

