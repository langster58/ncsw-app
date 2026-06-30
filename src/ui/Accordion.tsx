import React, { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { IconChevron, IconChevronUp } from './Icon'
import { colors, fonts, tracking } from './tokens'

// Accordion — compound component for stacked collapsible rows (e.g. the
// "03 / Credentials" MECP section).
//
//   <Accordion mode="single" defaultOpen={0}>
//     <Accordion.Item index="01" title="Expert Installation Technician" media={<Image src=… />}>
//       MECP's installation track runs Skilled, Advanced, Expert, Master…
//     </Accordion.Item>
//     <Accordion.Item index="02" title="Autosound Specialist">…</Accordion.Item>
//   </Accordion>
//
// Each item collapses to its header. Expanded items reveal body + optional
// media on the right (web wide / stacked on narrow). Mode "single" closes
// other items on open; "multi" allows many open at once. No motion in this
// primitive — animation belongs outside.

type Mode = 'single' | 'multi'

type AccordionContextValue = {
  isOpen: (idx: number) => boolean
  toggle: (idx: number) => void
}

const AccordionContext = React.createContext<AccordionContextValue | null>(null)

type AccordionProps = {
  children: React.ReactNode
  mode?: Mode
  defaultOpen?: number | number[]
}

type IndexedChild = { __accordionIndex?: number }

function Root({ children, mode = 'single', defaultOpen = 0 }: AccordionProps) {
  const initial = new Set(Array.isArray(defaultOpen) ? defaultOpen : [defaultOpen])
  const [openSet, setOpenSet] = useState<Set<number>>(initial)
  const ctx: AccordionContextValue = {
    isOpen: (i) => openSet.has(i),
    toggle: (i) => {
      const next = new Set(openSet)
      if (next.has(i)) {
        next.delete(i)
      } else {
        if (mode === 'single') next.clear()
        next.add(i)
      }
      setOpenSet(next)
    },
  }
  // Tag each Item with its index so it can talk to context.
  let idx = 0
  const kids = React.Children.map(children, (child) => {
    if (React.isValidElement(child) && (child.type as any) === Item) {
      const i = idx++
      return React.cloneElement(child as React.ReactElement<IndexedChild>, { __accordionIndex: i })
    }
    return child
  })
  return <AccordionContext.Provider value={ctx}>{kids}</AccordionContext.Provider>
}

type ItemProps = {
  index?: string // display index like "01"
  title: string
  media?: React.ReactNode
  children?: React.ReactNode
  __accordionIndex?: number
}

// Title row geometry: the index sits in a fixed-width column and the title
// follows after a fixed gap. Body content is offset by the same amount so its
// left edge lines up with the title's left edge — they share one flush-left.
const INDEX_COL = 24
const INDEX_GAP = 24
const TITLE_OFFSET = INDEX_COL + INDEX_GAP

function Item({ index, title, media, children, __accordionIndex = 0 }: ItemProps) {
  const ctx = React.useContext(AccordionContext)
  const [hovered, setHovered] = useState(false)
  if (!ctx) return null
  const open = ctx.isOpen(__accordionIndex)
  const hoverProps: any = { onHoverIn: () => setHovered(true), onHoverOut: () => setHovered(false) }
  const bodyIndent = index ? TITLE_OFFSET : 0
  return (
    <View
      style={{
        borderTopWidth: 1,
        borderTopColor: colors.line,
      }}
    >
      <Pressable
        onPress={() => ctx.toggle(__accordionIndex)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        {...hoverProps}
        style={{
          paddingVertical: 24,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          backgroundColor: hovered && !open ? colors.surfaceHover : 'transparent',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: INDEX_GAP, flexShrink: 1 }}>
          {index ? (
            <Text
              style={
                {
                  fontFamily: fonts.mono,
                  fontSize: 13,
                  fontWeight: '500',
                  letterSpacing: 0.52, // .04em * 13
                  color: colors.accent,
                  minWidth: INDEX_COL,
                } as any
              }
            >
              {index}
            </Text>
          ) : null}
          <Text
            style={{
              fontFamily: fonts.body,
              fontSize: 17,
              fontWeight: '700',
              color: colors.ink,
              flexShrink: 1,
            }}
          >
            {title}
          </Text>
        </View>
        {open ? <IconChevronUp size={16} color={colors.inkFaint} /> : <IconChevron size={16} color={colors.inkFaint} />}
      </Pressable>
      {open ? <ItemBody media={media} indent={bodyIndent}>{children}</ItemBody> : null}
    </View>
  )
}

function ItemBody({
  media,
  indent,
  children,
}: {
  media?: React.ReactNode
  indent: number
  children?: React.ReactNode
}) {
  const hasMedia = !!media
  return (
    <View
      style={
        ({
          paddingLeft: indent,
          paddingBottom: 32,
          ...(hasMedia
            ? {
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
                gap: 48,
                alignItems: 'start',
              }
            : null),
        } as any)
      }
    >
      <View style={{ gap: 12 }}>
        <Text
          style={{
            fontFamily: fonts.body,
            fontSize: 15,
            lineHeight: 15 * 1.6,
            color: colors.body,
          }}
        >
          {children}
        </Text>
      </View>
      {hasMedia ? <View>{media}</View> : null}
    </View>
  )
}

type AccordionComponent = ((p: AccordionProps) => React.ReactElement | null) & {
  Item: typeof Item
}

export const Accordion = Root as AccordionComponent
Accordion.Item = Item
