import React, { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { IconCheck, IconChevron } from './Icon'
import { Modal } from './Modal'
import { colors, fonts, radius } from './tokens'

// Dropdown — labeled select with a single tap surface. The picker that opens
// uses our Modal primitive on BOTH web and native so the opened UI conforms to
// the rest of the application's styles (no browser-native dropdown).
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
// Layout:
//   [  padding-x  ][ label  value ][ … chevron ][  padding-x  ]
//   padding-right of the chevron === padding-left of the label, so the entire
//   row is symmetrically padded.

const PAD_X = 12 // identical left and right
const ROW_GAP = 6 // label ↔ value

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
  const [open, setOpen] = useState(false)
  const norm = options.map(normalize)
  const current = norm.find((o) => o.value === value)

  const hoverProps: any = { onHoverIn: () => setHovered(true), onHoverOut: () => setHovered(false) }
  const borderColor = disabled ? colors.borderStrong : hovered ? colors.inkSoft : colors.borderStrong

  return (
    <>
      <Pressable
        disabled={disabled}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label}${current ? `: ${current.label}` : ''}`}
        {...hoverProps}
        style={
          {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: PAD_X,
            paddingVertical: 8,
            borderRadius: radius.sm,
            borderWidth: 1,
            borderColor,
            backgroundColor: colors.white,
            opacity: disabled ? 0.35 : 1,
            cursor: disabled ? 'not-allowed' : 'pointer',
            minHeight: 38,
          } as any
        }
      >
        {/* label + value group */}
        <View
          style={
            { flexDirection: 'row', alignItems: 'center', gap: ROW_GAP, minWidth: 0, flexShrink: 1 } as any
          }
        >
          <Text
            style={
              {
                fontFamily: fonts.mono,
                fontSize: 10.5,
                fontWeight: '500',
                letterSpacing: 0.735, // .07em * 10.5
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
              numberOfLines={1}
              style={{
                fontFamily: fonts.mono,
                fontSize: 11,
                fontWeight: '600',
                color: colors.ink,
                flexShrink: 1,
              }}
            >
              {current.label}
            </Text>
          ) : placeholder ? (
            <Text
              numberOfLines={1}
              style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.inkFaint, flexShrink: 1 }}
            >
              {placeholder}
            </Text>
          ) : null}
        </View>

        {/* chevron — vertically centered; right padding === left padding via paddingHorizontal */}
        <View style={{ alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <IconChevron size={14} color={colors.inkFaint} />
        </View>
      </Pressable>

      {/* Picker — Modal-based on both web and native. */}
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
                {selected ? <IconCheck size={16} color={colors.accent} /> : null}
              </Pressable>
            )
          })}
        </Modal.Body>
      </Modal>
    </>
  )
}
