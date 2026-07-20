import React from 'react'
import { Platform, Text, View, useWindowDimensions } from 'react-native'
import {
  Container,
  Eyebrow,
  Heading,
  IconArrow,
  Link,
  colors,
  fluid,
  fonts,
  radius,
  type,
  useFluidPx,
} from '@/ui'

// Shared building blocks of the product-detail template — used by the /pdp
// design comp and the wired /packages/detail route. Extracted from pdp.tsx so
// the comp and the live template render from the same parts.

const IS_WEB = Platform.OS === 'web'

export function useVal(anchor: number, floor: number) {
  return useFluidPx(fluid(anchor, floor))
}

export function WebImg({ src, alt, style }: { src: string; alt: string; style: any }) {
  if (IS_WEB) return React.createElement('img', { src, alt, style: { display: 'block', ...style } })
  return <View style={[{ backgroundColor: colors.figBg }, style]} />
}

// Section wrapper — the PDP's tighter rhythm (44px top vs the landing's 96).
export function PdpSection({ children }: { children: React.ReactNode }) {
  const top = useVal(44, 34)
  return (
    <View style={{ paddingTop: top } as any}>
      <Container>{children}</Container>
    </View>
  )
}

// Band — the numbered eyebrow row with the top ink rule and an optional door.
export function Band({ index, label, action, actionHref }: { index: string; label: string; action?: string; actionHref?: string }) {
  const mb = useVal(96, 72)
  return (
    <View
      style={
        {
          borderTopWidth: 1,
          borderTopColor: colors.ink,
          paddingTop: 14,
          marginBottom: mb,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 18,
        } as any
      }
    >
      <Eyebrow>{`${index} / ${label}`}</Eyebrow>
      {action ? (
        <Link variant="door" href={actionHref} icon={<IconArrow size={15} />}>
          {action}
        </Link>
      ) : null}
    </View>
  )
}

// PhotoSlot — dashed placeholder for pending product / install photography.
export function PhotoSlot({ label }: { label: string }) {
  const size = useFluidPx(type.meta)
  return (
    <View
      style={{
        aspectRatio: 4 / 3,
        borderWidth: 1,
        borderColor: colors.borderStrong,
        borderStyle: 'dashed',
        borderRadius: radius.sm,
        backgroundColor: colors.figBg,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 12,
      }}
    >
      <Text
        style={
          {
            fontFamily: fonts.mono,
            fontSize: size,
            letterSpacing: 0.4,
            textTransform: 'uppercase',
            color: colors.inkFaint,
            textAlign: 'center',
            lineHeight: 18,
          } as any
        }
      >
        {label}
      </Text>
    </View>
  )
}

// Real product photo. The library is full-bleed studio photography, so the
// image covers the 4:3 frame edge-to-edge (no letterboxing padding).
export function ProductMedia({ src, alt }: { src: string; alt: string }) {
  return (
    <View
      style={{
        aspectRatio: 4 / 3,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: radius.sm,
        backgroundColor: colors.figBg,
        overflow: 'hidden',
      }}
    >
      <WebImg src={src} alt={alt} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    </View>
  )
}

// A component / install line-item row: media + (title, metaline, desc, door) + price.
export function SysRow({
  media,
  title,
  meta,
  desc,
  doorLabel,
  price,
  priceSub,
  priceAccent,
  last,
}: {
  media: React.ReactNode
  title: string
  meta?: React.ReactNode
  desc: string
  doorLabel?: string
  price?: string
  priceSub?: string
  priceAccent?: boolean
  last?: boolean
}) {
  const { width } = useWindowDimensions()
  const narrow = width <= 900
  const gap = useVal(28, 22)
  const py = useVal(24, 20)
  const descSize = useFluidPx(type.small)
  const priceSize = useFluidPx(type.small)
  const subSize = useFluidPx(type.meta)

  return (
    <View
      style={
        {
          flexDirection: narrow ? 'column' : 'row',
          gap,
          paddingVertical: py,
          borderBottomWidth: last ? 0 : 1,
          borderBottomColor: colors.tableLine,
          alignItems: narrow ? 'stretch' : 'flex-start',
        } as any
      }
    >
      <View style={{ width: narrow ? '100%' : '34%', maxWidth: narrow ? 460 : 480 } as any}>{media}</View>
      <View style={{ flex: 1 }}>
        <Heading level="h4">{title}</Heading>
        {meta ? <View style={{ marginTop: 6 }}>{meta}</View> : null}
        <Text style={{ fontFamily: fonts.body, fontSize: descSize, color: colors.body, marginTop: 8, maxWidth: 620 } as any}>
          {desc}
        </Text>
        {doorLabel ? (
          <View style={{ marginTop: 12, alignSelf: 'flex-start' }}>
            <Link variant="door" icon={<IconArrow size={15} />}>
              {doorLabel}
            </Link>
          </View>
        ) : null}
      </View>
      {price ? (
        <View style={{ minWidth: 96, alignItems: narrow ? 'flex-start' : 'flex-end' }}>
          <Text
            style={
              { fontFamily: fonts.mono, fontSize: priceSize, fontWeight: '500', color: priceAccent ? colors.accent : colors.tableInk } as any
            }
          >
            {price}
          </Text>
          {priceSub ? (
            <Text style={{ fontFamily: fonts.mono, fontSize: subSize, color: colors.gray, marginTop: 3 } as any}>{priceSub}</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  )
}
