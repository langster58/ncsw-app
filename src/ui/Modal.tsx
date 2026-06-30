import React, { useEffect } from 'react'
// @ts-ignore — react-dom has no bundled types here; resolves at runtime via react-native-web (web only).
import { createPortal } from 'react-dom'
import { BackHandler, Platform, Pressable, Text, View } from 'react-native'
import { colors, fonts, space, tracking, type as typeScale, useFluidPx } from './tokens'

// Full-screen modal primitive (100vw × 100vh). Portal'd to document.body on
// web so it escapes transformed ancestors and pins to the viewport. Native
// renders as a top-layer absolute overlay.
//
// Composition:
//   <Modal open onClose={...} title="Sort & Filter">
//     <Modal.Body>...</Modal.Body>
//     <Modal.Footer>...</Modal.Footer>
//   </Modal>
//
// No animation logic lives in this file — that's intentional. Wrap children
// in an animation primitive at the call site if/when motion is added.

const SCRIM = 'rgba(16,24,29,0.42)' // source scrim color

type ModalProps = {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
}

function ModalRoot({ open, onClose, title, children }: ModalProps) {
  // Web: ESC closes, body scroll locks while open.
  useEffect(() => {
    if (Platform.OS !== 'web' || !open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (typeof document !== 'undefined') {
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      document.addEventListener('keydown', onKey)
      return () => {
        document.body.style.overflow = prev
        document.removeEventListener('keydown', onKey)
      }
    }
  }, [open, onClose])

  // Native: hardware back closes.
  useEffect(() => {
    if (Platform.OS === 'web' || !open) return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose()
      return true
    })
    return () => sub.remove()
  }, [open, onClose])

  if (!open) return null

  const panel = (
    <>
      {/* Backdrop — tap/click closes */}
      <Pressable
        onPress={onClose}
        style={{ position: 'absolute', inset: 0, backgroundColor: SCRIM } as any}
      />
      {/* Panel — full screen */}
      <View
        style={
          {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: colors.white,
            flexDirection: 'column',
          } as any
        }
      >
        {title ? <ModalHeader title={title} onClose={onClose} /> : null}
        {children}
      </View>
    </>
  )

  if (Platform.OS === 'web') {
    if (typeof document === 'undefined') return null
    return createPortal(
      React.createElement(
        'div',
        { style: { position: 'fixed', inset: 0, zIndex: 200 } },
        panel,
      ),
      document.body,
    )
  }

  // Native: top-layer absolute overlay.
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 200 } as any}>
      {panel}
    </View>
  )
}

// Implicit header: title + close ✕. Whole bar is the close surface.
function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  const titleSize = useFluidPx(typeScale.meta)
  const padX = useFluidPx(space.containerPadX)
  return (
    <Pressable
      onPress={onClose}
      style={
        {
          height: 56,
          paddingHorizontal: padX,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottomWidth: 1,
          borderBottomColor: colors.line,
        } as any
      }
    >
      <Text
        style={
          {
            fontFamily: fonts.mono,
            fontSize: titleSize,
            fontWeight: '600',
            letterSpacing: tracking.label,
            textTransform: 'uppercase',
            color: colors.ink,
          } as any
        }
      >
        {title}
      </Text>
      <Text style={{ color: colors.ink, fontSize: 18 }}>✕</Text>
    </Pressable>
  )
}

// Scrollable middle slot.
function ModalBody({ children }: { children: React.ReactNode }) {
  const padX = useFluidPx(space.containerPadX)
  if (Platform.OS === 'web') {
    return React.createElement(
      'div',
      { style: { flex: 1, minHeight: 0, overflowY: 'auto' } },
      <View style={{ paddingHorizontal: padX, paddingVertical: 16 } as any}>{children}</View>,
    )
  }
  return (
    <View style={{ flex: 1, paddingHorizontal: padX, paddingVertical: 16 } as any}>
      {children}
    </View>
  )
}

// Sticky bottom slot for action buttons.
function ModalFooter({ children }: { children: React.ReactNode }) {
  const padX = useFluidPx(space.containerPadX)
  return (
    <View
      style={
        {
          paddingHorizontal: padX,
          paddingVertical: 12,
          borderTopWidth: 1,
          borderTopColor: colors.line,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 8,
        } as any
      }
    >
      {children}
    </View>
  )
}

// Compound API: Modal + Modal.Body + Modal.Footer.
type ModalComponent = ((p: ModalProps) => React.ReactElement | null) & {
  Body: typeof ModalBody
  Footer: typeof ModalFooter
}

export const Modal = ModalRoot as ModalComponent
Modal.Body = ModalBody
Modal.Footer = ModalFooter
