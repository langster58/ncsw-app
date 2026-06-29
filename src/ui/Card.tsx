import React from 'react'
import { Platform, Text, View } from 'react-native'
import { colors, fonts, radius, tracking } from './tokens'

// Card — composable container for the three card patterns on the homepage:
//
//   1. Editorial card (stack + header row + figure + footer link)
//      <Card>
//        <Card.Header right={<Eyebrow>8 min read</Eyebrow>}><Eyebrow>01</Eyebrow></Card.Header>
//        <Card.Body><Heading level="h4">…</Heading><Lead>…</Lead></Card.Body>
//        <Card.Media surface>{chart}</Card.Media>
//        <Card.Footer><Link variant="door" icon={…}>Read the analysis</Link></Card.Footer>
//      </Card>
//
//   2. Featured build card (split: image left, content right)
//      <Card layout="split">
//        <Card.Media>
//          <img .../>
//          <Card.MediaTag>IN THE BAY · 2018 GOLF ALLTRACK</Card.MediaTag>
//        </Card.Media>
//        <Card.Body>
//          <Eyebrow>2018 VW GOLF ALLTRACK · INFINITE-BAFFLE BUILD</Eyebrow>
//          <Heading level="h2sm">Reference-tier bass…</Heading>
//          <Lead>…</Lead>
//          <Meta cols={2} items={[...]} />
//        </Card.Body>
//      </Card>
//
//   3. Collection card (stack + media-top + meta + footer link)
//      <Card>
//        <Card.Media>
//          <img .../>
//          <Card.MediaTag>SUV · HATCH · WAGON</Card.MediaTag>
//        </Card.Media>
//        <Card.Body>
//          <Heading level="h4">Cargo Infinite Baffle</Heading>
//          <Lead>…</Lead>
//          <Meta cols={2} items={[…]} />
//        </Card.Body>
//        <Card.Footer><Link variant="door">See the alignment</Link></Card.Footer>
//      </Card>
//
// Default layout is "stack" (media stacks above body). "split" puts media left and
// body right (50/50 on wide, stacked on narrow).

type Layout = 'stack' | 'split'

type CardProps = {
  children: React.ReactNode
  layout?: Layout
}

function CardRoot({ children, layout = 'stack' }: CardProps) {
  const isWeb = Platform.OS === 'web'
  return (
    <View
      style={
        {
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: radius.lg,
          backgroundColor: colors.white,
          overflow: 'hidden',
          ...(layout === 'split' && isWeb
            ? { display: 'grid', gridTemplateColumns: '1fr 1fr' }
            : null),
          ...(layout === 'split' && !isWeb
            ? { flexDirection: 'column' } // native: stack the split until we add layout breakpoints
            : null),
        } as any
      }
    >
      {children}
    </View>
  )
}

// Media area — image / chart / figure. Optional surface tint for figures (charts).
// MediaTag goes inside as an absolute overlay.
function CardMedia({
  children,
  surface = false,
  aspectRatio,
}: {
  children: React.ReactNode
  surface?: boolean
  aspectRatio?: number
}) {
  return (
    <View
      style={
        {
          position: 'relative',
          backgroundColor: surface ? colors.surface : colors.white,
          ...(aspectRatio ? { aspectRatio } : null),
          overflow: 'hidden',
        } as any
      }
    >
      {children}
    </View>
  )
}

// Overlay pill on Media (e.g. "IN THE BAY · 2018 GOLF ALLTRACK", "SUV · HATCH · WAGON").
// Dark translucent bg, white mono uppercase text. Top-left positioned by default.
function CardMediaTag({
  children,
  position = 'top-left',
}: {
  children: React.ReactNode
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
}) {
  const pos: any = {}
  if (position.startsWith('top')) pos.top = 14
  else pos.bottom = 14
  if (position.endsWith('left')) pos.left = 14
  else pos.right = 14
  return (
    <View
      style={
        {
          position: 'absolute',
          ...pos,
          backgroundColor: 'rgba(0,0,0,0.55)',
          borderRadius: 5,
          paddingHorizontal: 10,
          paddingVertical: 5,
          ...(Platform.OS === 'web' ? { backdropFilter: 'blur(4px)' } : null),
        } as any
      }
    >
      <Text
        style={
          {
            fontFamily: fonts.mono,
            fontSize: 10.5,
            fontWeight: '600',
            letterSpacing: tracking.label,
            textTransform: 'uppercase',
            color: colors.white,
          } as any
        }
      >
        {children}
      </Text>
    </View>
  )
}

// Padded content area. Default gap of 16 between children (Eyebrow + Heading + Lead + Meta stack).
function CardBody({ children, gap = 16 }: { children: React.ReactNode; gap?: number }) {
  return (
    <View style={{ paddingHorizontal: 22, paddingVertical: 22, gap } as any}>{children}</View>
  )
}

// Top row inside the card — typically eyebrow/index on the left and an optional
// right slot (e.g. "8 MIN READ"). Used in Editorial cards.
function CardHeader({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View
      style={{
        paddingHorizontal: 22,
        paddingTop: 22,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}
    >
      <View>{children}</View>
      {right ? <View>{right}</View> : null}
    </View>
  )
}

// Footer row — typically a door link. Has a top hairline divider.
function CardFooter({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        paddingHorizontal: 22,
        paddingVertical: 18,
        borderTopWidth: 1,
        borderTopColor: colors.line,
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      {children}
    </View>
  )
}

// Compound API.
type CardComponent = ((p: CardProps) => React.ReactElement | null) & {
  Media: typeof CardMedia
  MediaTag: typeof CardMediaTag
  Body: typeof CardBody
  Header: typeof CardHeader
  Footer: typeof CardFooter
}

export const Card = CardRoot as CardComponent
Card.Media = CardMedia
Card.MediaTag = CardMediaTag
Card.Body = CardBody
Card.Header = CardHeader
Card.Footer = CardFooter
