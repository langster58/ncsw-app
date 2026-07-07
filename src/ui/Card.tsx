import React, { useState } from 'react'
import { Linking, Platform, Pressable, Text, View } from 'react-native'
import { FullWidthCopyContext } from './CopyContext'
import { HoverContext } from './HoverContext'
import { colors, fluid, fluidType, fonts, radius, tracking, useFluidPx } from './tokens'

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
//   2. Featured build card (split: image left, content right). Media takes
//      the left 5fr column; Body and Footer stack in the right 4fr column
//      with the footer pinned to the bottom of the image's height.
//      <Card layout="split">
//        <Card.Media aspectRatio={4 / 3}>
//          <img .../>
//          <Card.MediaTag>IN THE BAY · 2018 GOLF ALLTRACK</Card.MediaTag>
//        </Card.Media>
//        <Card.Body>
//          <Eyebrow>2018 VW GOLF ALLTRACK · INFINITE-BAFFLE BUILD</Eyebrow>
//          <Heading level="h3">Reference-tier bass…</Heading>
//          <Lead>…</Lead>
//        </Card.Body>
//        <Card.Footer>
//          <Link variant="door" icon={…}>Read the build</Link>
//        </Card.Footer>
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
//        </Card.Body>
//        <Card.Footer><Link variant="door">See the alignment</Link></Card.Footer>
//      </Card>
//
// Default layout is "stack" (media stacks above body). "split" puts media left and
// body right (5fr/4fr on wide, stacked on narrow).

type Layout = 'stack' | 'split'

type CardProps = {
  children: React.ReactNode
  layout?: Layout
  /** Click destination. Sets the whole card as the tap surface. */
  href?: string
  /** Click handler. Sets the whole card as the tap surface. */
  onPress?: () => void
}

// Context lets nested slots (Body, Footer) adapt their padding for split
// without callers needing to pass the layout down.
const CardLayoutContext = React.createContext<Layout>('stack')

function CardRoot({ children, layout = 'stack', href, onPress }: CardProps) {
  const isWeb = Platform.OS === 'web'
  const interactive = !!onPress || !!href

  const [hovered, setHovered] = useState(false)
  const [pressed, setPressed] = useState(false)

  const interactiveProps: any = interactive
    ? {
        onPress: () => {
          if (onPress) return onPress()
          if (!href) return
          if (Platform.OS === 'web') {
            if (typeof window !== 'undefined') window.location.href = href
          } else {
            Linking.openURL(href).catch(() => {})
          }
        },
        onPressIn: () => setPressed(true),
        onPressOut: () => setPressed(false),
        accessibilityRole: 'link',
        ...(Platform.OS === 'web'
          ? {
              onHoverIn: () => setHovered(true),
              onHoverOut: () => setHovered(false),
            }
          : null),
      }
    : null

  // Card root keeps its neutral chrome (white bg, line border) at every
  // interaction state. Hover treatment is scoped to Card.Footer — the
  // "button-equivalent" strip below the rule — via HoverContext.
  // flexGrow lets a card fill its cell: in a stretched row/shelf the card grows
  // to the tallest sibling's height, and Card.Body (flexGrow below) + the
  // margin-top:auto footer distribute that height so every CTA aligns.
  const baseStyle: any = {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    overflow: 'hidden',
    flexGrow: 1,
    ...(interactive && Platform.OS === 'web' ? { cursor: 'pointer' } : null),
  }

  if (layout === 'split' && isWeb) {
    // Split layout: peel Media out as the left grid cell; everything else
    // (Body, Footer, ...) stacks in the right cell with space-between so
    // headline-area lives at top and the affordance pins to the bottom.
    const kids = React.Children.toArray(children)
    const mediaIdx = kids.findIndex(
      (c) => React.isValidElement(c) && (c.type === CardMedia),
    )
    const media = mediaIdx >= 0 ? kids[mediaIdx] : null
    const rest = mediaIdx >= 0 ? kids.filter((_, i) => i !== mediaIdx) : kids

    const splitStyle: any = {
      ...baseStyle,
      display: 'grid',
      gridTemplateColumns: '5fr 4fr',
      alignItems: 'stretch',
    }

    const inner = (
      <>
        {media}
        <View style={{ flexDirection: 'column', justifyContent: 'space-between' } as any}>
          {rest}
        </View>
      </>
    )

    return (
      <CardLayoutContext.Provider value="split">
        <HoverContext.Provider value={interactive && hovered}>
          {interactive ? (
            <Pressable {...interactiveProps} style={splitStyle}>
              {inner}
            </Pressable>
          ) : (
            <View style={splitStyle}>{inner}</View>
          )}
        </HoverContext.Provider>
      </CardLayoutContext.Provider>
    )
  }

  const stackStyle: any = {
    ...baseStyle,
    // native split: stack until we wire a layout breakpoint there
    ...(layout === 'split' && !isWeb ? { flexDirection: 'column' } : null),
  }

  return (
    <CardLayoutContext.Provider value={layout}>
      <HoverContext.Provider value={interactive && hovered}>
        {interactive ? (
          <Pressable {...interactiveProps} style={stackStyle}>
            {children}
          </Pressable>
        ) : (
          <View style={stackStyle}>{children}</View>
        )}
      </HoverContext.Provider>
    </CardLayoutContext.Provider>
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
  const offset = useFluidPx(fluid(14, 10))
  const padX = useFluidPx(fluid(10, 7))
  const padY = useFluidPx(fluid(5, 4))
  const fontSize = useFluidPx(fluidType(10.5, 9))
  const pos: any = {}
  if (position.startsWith('top')) pos.top = offset
  else pos.bottom = offset
  if (position.endsWith('left')) pos.left = offset
  else pos.right = offset
  return (
    <View
      style={
        {
          position: 'absolute',
          ...pos,
          backgroundColor: 'rgba(0,0,0,0.55)',
          borderRadius: 5,
          paddingHorizontal: padX,
          paddingVertical: padY,
          ...(Platform.OS === 'web' ? { backdropFilter: 'blur(4px)' } : null),
        } as any
      }
    >
      <Text
        style={
          {
            fontFamily: fonts.mono,
            fontSize,
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

// Padded content area. Split-layout cards get more horizontal/vertical room
// since the right column is narrower than a full-bleed stacked card body.
function CardBody({ children, gap = 16 }: { children: React.ReactNode; gap?: number }) {
  const layout = React.useContext(CardLayoutContext)
  const padSplit = useFluidPx(fluid(32, 22))
  const padStack = useFluidPx(fluid(22, 16))
  const pad = layout === 'split' ? padSplit : padStack
  const resolvedGap = useFluidPx(fluid(gap, Math.round(gap * 0.75)))
  // flexGrow:1 makes the body absorb the card's spare height, so the flex space
  // opens up between the copy and the (margin-top:auto) footer CTA below it.
  return (
    <FullWidthCopyContext.Provider value={true}>
      <View style={{ paddingHorizontal: pad, paddingVertical: pad, gap: resolvedGap, flexGrow: 1 } as any}>{children}</View>
    </FullWidthCopyContext.Provider>
  )
}

// Top row inside the card — typically eyebrow/index on the left and an optional
// right slot (e.g. "8 MIN READ"). Used in Editorial cards.
function CardHeader({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  const layout = React.useContext(CardLayoutContext)
  const padSplit = useFluidPx(fluid(32, 22))
  const padStack = useFluidPx(fluid(22, 16))
  const pad = layout === 'split' ? padSplit : padStack
  const gap = useFluidPx(fluid(12, 10))
  return (
    <View
      style={
        {
          paddingHorizontal: pad,
          paddingTop: pad,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap,
        } as any
      }
    >
      <View>{children}</View>
      {right ? <View>{right}</View> : null}
    </View>
  )
}

// Footer row — typically a door link. No divider and no button-like hover fill:
// `marginTop: 'auto'` pushes it to the bottom of the card so the CTA aligns
// across a row of cards (the flex space above it absorbs the height difference).
// The whole card is the tap surface, and the door link inside shifts color on
// card hover via HoverContext, so the footer needs no chrome of its own.
function CardFooter({ children }: { children: React.ReactNode }) {
  const layout = React.useContext(CardLayoutContext)
  const padSplit = useFluidPx(fluid(32, 22))
  const padStack = useFluidPx(fluid(22, 16))
  const pad = layout === 'split' ? padSplit : padStack
  return (
    <View
      style={
        {
          paddingHorizontal: pad,
          paddingBottom: pad,
          marginTop: 'auto',
          flexDirection: 'row',
          alignItems: 'center',
        } as any
      }
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
