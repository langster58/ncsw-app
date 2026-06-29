import React, { useState } from 'react'
import { Platform, Pressable, Text, View } from 'react-native'
import { Modal } from './Modal'
import { colors, fonts, radius, tracking } from './tokens'

// Dropdown — labeled select with mono uppercase chrome.
//
//   <Dropdown
//     label="Year"
//     value={year}
//     options={['2024','2023','2022']}
//     onChange={setYear}
//     placeholder="Select year"
//     disabled={!enabled}
//   />
//
// Web: native <select> absolutely positioned opacity:0 over the chrome.
//      Free keyboard nav, mobile picker UI, screen reader behavior.
// Native: tapping opens <Modal title={label}> with selectable rows.

type Option = string | { label: string; value: string }

type DropdownProps = {
  label: string
  value: string
  options: Option[]
  onChange: (v: string) => void
  placeholder?: string
  disabled?: boolean
}

function normalize(o: Option): { label: string; value: string } {
  return typeof o === 'string' ? { label: o, value: o } : o
}

export function Dropdown({
  label,
  value,
  options,
  onChange,
  placeholder,
  disabled = false,
}: DropdownProps) {
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [open, setOpen] = useState(false)
  const norm = options.map(normalize)
  const current = norm.find((o) => o.value === value)

  const hoverProps: any =
    Platform.OS === 'web'
      ? { onHoverIn: () => setHovered(true), onHoverOut: () => setHovered(false) }
      : {}
  const focusProps: any =
    Platform.OS === 'web'
      ? { onFocus: () => setFocused(true), onBlur: () => setFocused(false) }
      : {}

  const borderColor = disabled
    ? colors.borderStrong
    : hovered
      ? colors.inkSoft
      : colors.borderStrong

  // Shared chrome (labeled row + chevron). Web overlays a native <select>;
  // native makes the whole row pressable to open the Modal picker.
  const chrome = (
    <View
      {...hoverProps}
      {...focusProps}
      style={
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          borderRadius: radius.sm,
          borderWidth: 1,
          borderColor,
          backgroundColor: colors.white,
          paddingHorizontal: 12,
          paddingVertical: 8,
          opacity: disabled ? 0.35 : 1,
          cursor: disabled ? 'not-allowed' : 'pointer',
          ...(focused && Platform.OS === 'web'
            ? { outlineWidth: 2, outlineStyle: 'solid', outlineColor: colors.focusRing, outlineOffset: 3 }
            : null),
        } as any
      }
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 } as any}>
        <Text
          style={
            {
              fontFamily: fonts.mono,
              fontSize: 10.5,
              fontWeight: '500',
              letterSpacing: '0.07em',
              textTransform: 'uppercase',
              color: colors.inkFaint,
              flexShrink: 0,
            } as any
          }
        >
          {label}
        </Text>
        {current ? (
          <Text
            style={
              {
                fontFamily: fonts.mono,
                fontSize: 11,
                fontWeight: '600',
                color: colors.ink,
                flexShrink: 1,
              } as any
            }
            numberOfLines={1}
          >
            {current.label}
          </Text>
        ) : placeholder && !value ? null : null}
      </View>
      <Text style={{ color: colors.inkFaint, fontSize: 12 }}>⌄</Text>
    </View>
  )

  // ── Web: native <select> overlaid ─────────────────────────────────────
  if (Platform.OS === 'web') {
    return (
      <View style={{ position: 'relative' } as any}>
        {chrome}
        {React.createElement('select', {
          value: value || '',
          disabled,
          onChange: (e: any) => onChange(e.target.value),
          'aria-label': label,
          style: {
            position: 'absolute',
            inset: 0,
            opacity: 0,
            width: '100%',
            height: '100%',
            cursor: disabled ? 'not-allowed' : 'pointer',
            fontSize: 16, // prevent mobile-Safari zoom on focus
          },
          children: [
            placeholder
              ? React.createElement(
                  'option',
                  { key: '__placeholder', value: '', disabled: true },
                  placeholder,
                )
              : null,
            ...norm.map((o) =>
              React.createElement('option', { key: o.value, value: o.value }, o.label),
            ),
          ],
        })}
      </View>
    )
  }

  // ── Native: tap opens Modal picker ────────────────────────────────────
  return (
    <>
      <Pressable disabled={disabled} onPress={() => setOpen(true)}>
        {chrome}
      </Pressable>
      <Modal open={open} onClose={() => setOpen(false)} title={label}>
        <Modal.Body>
          {norm.map((o) => {
            const selected = o.value === value
            return (
              <Pressable
                key={o.value}
                onPress={() => {
                  onChange(o.value)
                  setOpen(false)
                }}
                style={{
                  paddingVertical: 14,
                  paddingHorizontal: 4,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.line,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <Text
                  style={{
                    fontFamily: fonts.body,
                    fontSize: 16,
                    color: selected ? colors.accent : colors.ink,
                    fontWeight: selected ? '600' : '400',
                  }}
                >
                  {o.label}
                </Text>
                {selected ? (
                  <Text style={{ color: colors.accent, fontSize: 16 }}>✓</Text>
                ) : null}
              </Pressable>
            )
          })}
        </Modal.Body>
      </Modal>
    </>
  )
}
