import React, { useEffect, useRef, useState } from 'react'
import { Platform, Pressable, Text, View } from 'react-native'
// @ts-ignore — react-dom has no bundled types here; resolves at runtime via react-native-web (web only).
import { createPortal } from 'react-dom'
import { IconCheck, IconChevron, IconClose } from './Icon'
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
  hideLabel?: boolean // trigger shows only the value; label still voices via accessibility (for external labels)
  // Trigger shows only the label, never the chosen value: label flush left, arrow
  // at the right edge. To see the choice, open it.
  labelOnly?: boolean
  // On phones and other touch screens, open a bottom sheet instead of the
  // popover: the mobile pattern for choosing from a list (Material's modal bottom
  // sheet; Apple's sheet at its half-height "medium" resting point). It takes the
  // site's type and inset rules, which the device's own picker cannot.
  sheetOnTouch?: boolean
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
  hideLabel = false,
  labelOnly = false,
  sheetOnTouch = false,
}: DropdownProps) {
  const [hovered, setHovered] = useState(false)
  const [open, setOpen] = useState(false)
  const [anchorRect, setAnchorRect] = useState<{ top: number; left: number; width: number } | null>(null)
  const triggerRef = useRef<any>(null)
  const listRef = useRef<any>(null)
  const norm = options.map(normalize)
  const current = norm.find((o) => o.value === value)
  const isWeb = Platform.OS === 'web'

  // Touch screen or not is known only in the browser, after the first paint (the
  // page is rendered ahead of time without it).
  const [touch, setTouch] = useState(false)
  useEffect(() => {
    if (!isWeb || !sheetOnTouch || typeof window === 'undefined' || !window.matchMedia) return
    const r = requestAnimationFrame(() =>
      setTouch(window.matchMedia('(pointer: coarse)').matches || window.innerWidth <= 760),
    )
    return () => cancelAnimationFrame(r)
  }, [isWeb, sheetOnTouch])
  const useSheet = isWeb && sheetOnTouch && touch

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

  // One option. The rule under it is inset to the text (it starts and ends
  // where the text does, never edge to edge), and the last option has none.
  // Type follows the site: Inter, the body size, accent + check when selected.
  function optionRow(o: { label: string; value: string }, size: 'compact' | 'sheet', last: boolean) {
    const selected = o.value === value
    const compact = size === 'compact'
    const inset = compact ? 12 : 20
    return (
      <Pressable
        key={o.value}
        onPress={() => select(o.value)}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        // data-selected on web: what the sheet looks for to open at the current choice
        {...({ dataSet: { selected: selected ? 'true' : 'false' } } as any)}
        style={{ paddingHorizontal: inset, ...(isWeb ? { cursor: 'pointer' } : null) } as any}
      >
        <View
          style={
            {
              minHeight: compact ? 38 : 48,
              borderBottomWidth: last ? 0 : 1,
              borderBottomColor: colors.line,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            } as any
          }
        >
          <Text
            style={
              {
                fontFamily: fonts.body,
                fontSize: compact ? 13 : 15,
                color: selected ? colors.accent : colors.ink,
                fontWeight: selected ? '600' : '400',
              } as any
            }
          >
            {o.label}
          </Text>
          {selected ? <IconCheck size={14} color={colors.accent} /> : null}
        </View>
      </Pressable>
    )
  }

  // Touch screens: the bottom sheet. Opens to the selected option so a returning
  // visitor sees their choice; scrolls inside itself; tap outside or the close
  // button (or Escape) to dismiss. Body scrolling is held while it is open.
  useEffect(() => {
    if (!useSheet || !open || typeof document === 'undefined') return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const r = requestAnimationFrame(() => {
      // Scroll only the sheet's own list (scrollIntoView would also move the page).
      const list = listRef.current
      const el = list?.querySelector?.('[data-selected="true"]')
      if (list && el) list.scrollTop = el.offsetTop - list.clientHeight / 2 + el.clientHeight / 2
    })
    return () => {
      document.body.style.overflow = prev
      cancelAnimationFrame(r)
    }
  }, [useSheet, open])

  function sheet() {
    if (typeof document === 'undefined') return null
    return createPortal(
      <>
        <Pressable
          onPress={close}
          accessibilityLabel="Close"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 299, backgroundColor: 'rgba(9, 8, 14, 0.32)' } as any}
        />
        <View
          {...({ role: 'dialog', 'aria-modal': true, 'aria-label': label } as any)}
          style={
            {
              position: 'fixed',
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 300,
              maxHeight: '55vh',
              backgroundColor: colors.white,
              borderTopLeftRadius: radius.lg,
              borderTopRightRadius: radius.lg,
              boxShadow: '0 -8px 24px rgba(9, 8, 14, 0.12)',
              paddingBottom: 'env(safe-area-inset-bottom)',
            } as any
          }
        >
          <View
            style={
              {
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 20,
                paddingTop: 18,
                paddingBottom: 12,
              } as any
            }
          >
            <Text style={{ fontFamily: fonts.body, fontSize: 15, fontWeight: '700', color: colors.ink } as any}>{label}</Text>
            <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10}>
              <IconClose size={18} color={colors.ink} />
            </Pressable>
          </View>
          {React.createElement(
            'div',
            { ref: listRef, style: { overflowY: 'auto', WebkitOverflowScrolling: 'touch', flex: '1 1 auto', minHeight: 0, paddingBottom: 12 } },
            <View>{norm.map((o, i) => optionRow(o, 'sheet', i === norm.length - 1))}</View>,
          )}
        </View>
      </>,
      document.body,
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
        accessibilityHint={!current && placeholder ? placeholder : undefined}
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
        {labelOnly ? (
          <Text
            numberOfLines={1}
            style={{ fontFamily: fonts.body, fontSize: 12, fontWeight: '600', color: colors.ink, flexShrink: 1 }}
          >
            {label}
          </Text>
        ) : (
        <View
          style={
            { flexDirection: 'row', alignItems: 'center', gap: ROW_GAP, minWidth: 0, flexShrink: 1 } as any
          }
        >
          {hideLabel ? null : (
            <Text
              style={
                {
                  fontFamily: fonts.body,
                  fontSize: 11,
                  fontWeight: '600',
                  color: colors.inkFaint,
                  flexShrink: 0,
                } as any
              }
            >
              {label}
            </Text>
          )}
          {current ? (
            <Text
              numberOfLines={1}
              style={{
                fontFamily: fonts.body,
                fontSize: 12,
                fontWeight: '600',
                color: colors.ink,
                flexShrink: 1,
              }}
            >
              {current.label}
            </Text>
          ) : null}
        </View>
        )}

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
          open && useSheet
          ? sheet()
          : open && anchorRect && typeof document !== 'undefined'
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
                      // Sized to content: never narrower than the trigger, but
                      // free to grow so a compact trigger doesn't clip options.
                      width: 'max-content',
                      minWidth: anchorRect.width,
                      maxWidth: 340,
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
                    <View>{norm.map((o, i) => optionRow(o, 'compact', i === norm.length - 1))}</View>,
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
              <Modal.Body>{norm.map((o, i) => optionRow(o, 'sheet', i === norm.length - 1))}</Modal.Body>
            </Modal>
          )}
    </View>
  )
}
