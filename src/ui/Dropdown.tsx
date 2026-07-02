import React, { useEffect, useRef, useState } from 'react'
import { Platform, Pressable, Text, View } from 'react-native'
// @ts-ignore — react-dom has no bundled types here; resolves at runtime via react-native-web (web only).
import { createPortal } from 'react-dom'
import { IconCheck, IconChevron } from './Icon'
import { Modal } from './Modal'
import { colors, fonts, radius } from './tokens'

// Dropdown — labeled select with a single tap surface.
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
// The picker opens differently per platform:
//   - Web: a compact popover anchored directly under the trigger, the way
//     any desktop select/combobox behaves. A full-screen takeover for
//     picking one value out of a short list reads as broken on a pointer-
//     driven surface with plenty of room right below the control.
//   - Native: our Modal primitive as a full-screen sheet — the standard,
//     expected pattern for a picker on a phone.
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
  const [anchorRect, setAnchorRect] = useState<{ top: number; left: number; width: number } | null>(null)
  const triggerRef = useRef<any>(null)
  const listRef = useRef<any>(null)
  const norm = options.map(normalize)
  const current = norm.find((o) => o.value === value)
  const isWeb = Platform.OS === 'web'

  const hoverProps: any = { onHoverIn: () => setHovered(true), onHoverOut: () => setHovered(false) }
  const borderColor = disabled ? colors.borderStrong : hovered ? colors.inkSoft : colors.borderStrong

  const close = () => setOpen(false)
  const select = (v: string) => {
    onChange(v)
    close()
  }

  // Every React Native View is `position:relative; z-index:0` by default,
  // which makes each one its own local stacking context — a z-index set
  // deep inside this component only wins against its own siblings, not
  // against unrelated DOM elsewhere on the page (like table rows rendered
  // after this control). Portaling straight to <body>, the same technique
  // Modal already uses, is what actually guarantees this paints on top of
  // everything. That means it's no longer nested under the trigger for
  // position:absolute, so its screen position is measured explicitly.
  useEffect(() => {
    if (!isWeb || !open || !triggerRef.current || typeof triggerRef.current.getBoundingClientRect !== 'function') {
      return
    }
    const r = triggerRef.current.getBoundingClientRect()
    setAnchorRect({ top: r.bottom, left: r.left, width: r.width })
  }, [isWeb, open])

  // Web-only: Escape closes the popover, and so does scrolling anything
  // OTHER than the option list itself — a position:fixed panel doesn't
  // track the trigger as the page (or any scrollable ancestor) scrolls, so
  // closing avoids it drifting away from the control it's anchored to.
  // Scroll events don't bubble but do have a capture phase starting at
  // window, so a capture listener there fires for the list's own internal
  // scroll too; without filtering that out, scrolling the option list
  // closed it immediately, which is a real bug and not what a listbox
  // should do. Modal already has its own ESC handling for the native
  // full-screen sheet, so this only needs to exist here.
  useEffect(() => {
    if (!isWeb || !open || typeof document === 'undefined') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    const onScroll = (e: Event) => {
      if (listRef.current && e.target && listRef.current.contains(e.target)) return
      close()
    }
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [isWeb, open])

  function optionRow(o: { label: string; value: string }, size: 'compact' | 'comfortable') {
    const selected = o.value === value
    const compact = size === 'compact'
    return (
      <Pressable
        key={o.value}
        onPress={() => select(o.value)}
        style={
          {
            paddingVertical: compact ? 9 : 14,
            paddingHorizontal: compact ? 10 : 4,
            borderBottomWidth: 1,
            borderBottomColor: colors.line,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            ...(compact && isWeb ? { cursor: 'pointer' } : null),
          } as any
        }
      >
        <Text
          style={
            {
              fontFamily: fonts.body,
              fontSize: compact ? 14 : 16,
              color: selected ? colors.accent : colors.ink,
              fontWeight: selected ? '600' : '400',
            } as any
          }
        >
          {o.label}
        </Text>
        {selected ? <IconCheck size={compact ? 14 : 16} color={colors.accent} /> : null}
      </Pressable>
    )
  }

  return (
    <View style={{ position: 'relative' } as any}>
      <Pressable
        ref={triggerRef}
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

      {isWeb
        ? // Compact popover, anchored directly under the trigger — standard
          // desktop select/combobox behavior, portaled to <body> so it
          // always paints above the rest of the page (see the comment on
          // the measuring effect above for why).
          open && anchorRect && typeof document !== 'undefined'
          ? createPortal(
              <>
                <Pressable
                  onPress={close}
                  style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 299 } as any}
                />
                <View
                  style={
                    {
                      position: 'fixed',
                      top: anchorRect.top + 4,
                      left: anchorRect.left,
                      width: anchorRect.width,
                      zIndex: 300,
                      backgroundColor: colors.white,
                      borderWidth: 1,
                      borderColor: colors.line,
                      borderRadius: radius.sm,
                      maxHeight: 260,
                      overflow: 'hidden',
                      boxShadow: '0 8px 24px rgba(9, 8, 14, 0.14)',
                    } as any
                  }
                >
                  {React.createElement(
                    'div',
                    { ref: listRef, style: { maxHeight: 260, overflowY: 'auto' } },
                    <View style={{ paddingHorizontal: 4 } as any}>
                      {norm.map((o) => optionRow(o, 'compact'))}
                    </View>,
                  )}
                </View>
              </>,
              document.body,
            )
          : null
        : // Native: full-screen sheet via Modal — the standard picker pattern
          // on a phone.
          (
            <Modal open={open} onClose={close} title={label}>
              <Modal.Body>{norm.map((o) => optionRow(o, 'comfortable'))}</Modal.Body>
            </Modal>
          )}
    </View>
  )
}
