import React, { useEffect, useState } from 'react'
import { Platform, Text, TextInput, View } from 'react-native'
import { colors, fonts, radius, tracking, type as typeScale, useFluidPx } from './tokens'

// NumberField — mono-labeled numeric input, the typed-entry sibling of the
// slider controls. Shared across platforms (RN TextInput renders a native
// <input> via react-native-web).
//
//   <NumberField label="Fs" unit="Hz" value={fs} onChange={setFs} min={10} max={120} />
//
// Editing is buffered in a local string so partial entries ("1.", "-") don't
// fight the caller; the parsed value commits on blur/submit, clamped to
// [min, max]. An invalid entry reverts to the last good value.

type Props = {
  label: string
  value: number
  onChange: (n: number) => void
  unit?: string
  min?: number
  max?: number
  width?: number
  decimals?: number // display precision when not editing (default 2, trailing zeros trimmed)
}

function format(n: number, decimals: number): string {
  return String(Number(n.toFixed(decimals)))
}

export function NumberField({ label, value, onChange, unit, min, max, width = 96, decimals = 2 }: Props) {
  const [text, setText] = useState(format(value, decimals))
  const [editing, setEditing] = useState(false)
  const [focused, setFocused] = useState(false)

  // Reflect external value changes while not editing (driver swap, reset).
  useEffect(() => {
    if (!editing) setText(format(value, decimals))
  }, [value, editing, decimals])

  const labelSize = useFluidPx(typeScale.meta)
  const inputSize = useFluidPx(typeScale.small)

  function commit() {
    setEditing(false)
    setFocused(false)
    const n = Number(text.replace(',', '.'))
    if (!Number.isFinite(n)) {
      setText(format(value, decimals))
      return
    }
    let v = n
    if (min !== undefined) v = Math.max(min, v)
    if (max !== undefined) v = Math.min(max, v)
    v = Number(v.toFixed(decimals)) // committed value always matches the displayed precision
    setText(format(v, decimals))
    if (v !== value) onChange(v)
  }

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
        {unit ? <Text style={{ color: colors.inkFaint, textTransform: 'none' } as any}> {unit}</Text> : null}
      </Text>
      <TextInput
        value={text}
        onChangeText={(t) => {
          setEditing(true)
          setText(t)
        }}
        onFocus={() => setFocused(true)}
        onBlur={commit}
        onSubmitEditing={commit}
        inputMode="decimal"
        accessibilityLabel={unit ? `${label}, ${unit}` : label}
        style={
          {
            fontFamily: fonts.mono,
            fontSize: inputSize,
            color: colors.ink,
            backgroundColor: colors.white,
            borderWidth: 1,
            borderColor: focused ? colors.accent : colors.line,
            borderRadius: radius.sm,
            paddingVertical: 8,
            paddingHorizontal: 10,
            ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null),
          } as any
        }
      />
    </View>
  )
}
