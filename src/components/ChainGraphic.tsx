import React from 'react'
import { Platform, Text, View, useWindowDimensions } from 'react-native'

// ChainGraphic — the "what every package contains" interactive signal-chain band.
// Ported from ChainGraphic.jsx (CHAIN_NODES) and home.css (.chainband .flow / .gnode).
//
// Resolved tokens (literal):
//   --ncsw-ink  #09080e   --ncsw-gray #656565   --ncsw-line #ececec
//   --accent    #0576cc (var(--ncsw-primary))   white #ffffff
//   --font-mono "IBM Plex Mono"
//
// home.css values reproduced:
//   .chainband .flow { display:flex; align-items:stretch; justify-content:space-between }
//   .chainband .flow::before { top:70px; left:0; right:0; height:1.5px; background:#ececec }
//   .chainband .gnode { flex-direction:column; align-items:center; padding:14px 0 28px;
//                       border:1px solid transparent; border-radius:12px }
//   .gnode .num { mono 11px/600 #0576cc; margin-bottom:9px; letter-spacing:.04em }
//   .gnode .tile { 58x58; border-radius:50%; border:1.5px solid #ececec; background:#fff }
//   .gnode .tile svg { 26x26; stroke:#09080e; fill:none; stroke-width:1.6 }
//   .gnode .glabel { mono 11.5px/600 uppercase #09080e; margin-top:13px; letter-spacing:.04em }
//   mobile (<=720): .flow { flex-wrap:wrap } / ::before hidden / .gnode flex:0 0 33.33%

const INK = '#09080e' // --ncsw-ink
const LINE = '#ececec' // --ncsw-line
const ACCENT = '#0576cc' // --accent / --ncsw-primary
const WHITE = '#ffffff'
const MONO = 'IBM Plex Mono'

// .04em letter-spacing on the mono num (11px) and glabel (11.5px) -> points.
const NUM_TRACKING = 0.04 * 11 // 0.44
const LABEL_TRACKING = 0.04 * 11.5 // 0.46

type Node = { num: string; label: string; svg: () => React.ReactNode }

// Each icon is the verbatim SVG geometry from CHAIN_NODES, built with
// React.createElement so no react-native-svg import is needed (web-only render).
function svgEl(children: React.ReactNode) {
  return React.createElement(
    'svg',
    {
      viewBox: '0 0 24 24',
      width: 26,
      height: 26,
      stroke: INK,
      fill: 'none',
      strokeWidth: 1.6,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
    children
  )
}

const CHAIN_NODES: Node[] = [
  {
    num: '01',
    label: 'Source',
    svg: () =>
      svgEl([
        React.createElement('rect', {
          key: 'r',
          x: 6.5,
          y: 2.5,
          width: 11,
          height: 19,
          rx: 2.2,
        }),
        React.createElement('line', { key: 'l', x1: 10.5, y1: 18.4, x2: 13.5, y2: 18.4 }),
      ]),
  },
  {
    num: '02',
    label: 'Signal',
    svg: () =>
      svgEl([
        React.createElement('path', {
          key: 'p',
          d: 'M2 16 C6 16 6 7 10 7 C14 7 14 13 18 13 L22 13',
        }),
        React.createElement('line', {
          key: 'l',
          x1: 2,
          y1: 20,
          x2: 22,
          y2: 20,
          strokeWidth: 1.1,
          opacity: 0.35,
        }),
      ]),
  },
  {
    num: '03',
    label: 'Front stage',
    svg: () =>
      svgEl([
        React.createElement('circle', { key: 'c1', cx: 12, cy: 12, r: 9 }),
        React.createElement('circle', { key: 'c2', cx: 12, cy: 12, r: 4.8 }),
        React.createElement('circle', {
          key: 'c3',
          cx: 12,
          cy: 12,
          r: 1.4,
          fill: 'currentColor',
          stroke: 'none',
        }),
        React.createElement('circle', {
          key: 'c4',
          cx: 12,
          cy: 4.4,
          r: 1,
          fill: 'currentColor',
          stroke: 'none',
        }),
        React.createElement('circle', {
          key: 'c5',
          cx: 12,
          cy: 19.6,
          r: 1,
          fill: 'currentColor',
          stroke: 'none',
        }),
        React.createElement('circle', {
          key: 'c6',
          cx: 4.4,
          cy: 12,
          r: 1,
          fill: 'currentColor',
          stroke: 'none',
        }),
        React.createElement('circle', {
          key: 'c7',
          cx: 19.6,
          cy: 12,
          r: 1,
          fill: 'currentColor',
          stroke: 'none',
        }),
      ]),
  },
  {
    num: '04',
    label: 'Amplification',
    svg: () =>
      svgEl([
        React.createElement('path', { key: 'p', d: 'M4 5 L4 19 L19 12 Z' }),
        React.createElement('line', { key: 'l1', x1: 19, y1: 9.5, x2: 19, y2: 14.5 }),
        React.createElement('line', { key: 'l2', x1: 21.5, y1: 11, x2: 21.5, y2: 13 }),
      ]),
  },
  {
    num: '05',
    label: 'Subwoofer',
    svg: () =>
      svgEl([
        React.createElement('circle', { key: 'c1', cx: 12, cy: 12, r: 9 }),
        React.createElement('circle', { key: 'c2', cx: 12, cy: 12, r: 4.2 }),
        React.createElement('circle', { key: 'c3', cx: 12, cy: 12, r: 1 }),
      ]),
  },
  {
    num: '06',
    label: 'Enclosure',
    svg: () =>
      svgEl([
        React.createElement('path', {
          key: 'p1',
          d: 'M3 7.5 L12 3 L21 7.5 L21 17 L12 21.5 L3 17 Z',
        }),
        React.createElement('path', {
          key: 'p2',
          d: 'M3 7.5 L12 12 L21 7.5',
          strokeWidth: 1.1,
          opacity: 0.5,
        }),
        React.createElement('line', {
          key: 'l',
          x1: 12,
          y1: 12,
          x2: 12,
          y2: 21.5,
          strokeWidth: 1.1,
          opacity: 0.5,
        }),
      ]),
  },
]

// .chainband .gnode .tile + its icon. On web, the icon is real inline SVG;
// on native we show a small ink dot in the same circular tile (no SVG lib).
function NodeTile({ node, isWeb }: { node: Node; isWeb: boolean }) {
  return (
    <View
      style={{
        width: 58,
        height: 58,
        borderRadius: 29, // 50%
        borderWidth: 1.5,
        borderColor: LINE,
        backgroundColor: WHITE,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {isWeb ? (
        node.svg()
      ) : (
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: INK }} />
      )}
    </View>
  )
}

// One .chainband .gnode column: num + tile + label.
function ChainNode({
  node,
  isWeb,
  narrow,
}: {
  node: Node
  isWeb: boolean
  narrow: boolean
}) {
  return (
    <View
      style={
        {
          // .gnode { flex:0 0 auto; column; align-items:center;
          //          border:1px solid transparent; border-radius:12px; padding:14px 0 28px }
          // mobile: flex:0 0 33.33%
          ...(narrow ? { width: '33.33%' as const } : { flexGrow: 0, flexShrink: 0 }),
          flexDirection: 'column' as const,
          alignItems: 'center' as const,
          borderWidth: 1,
          borderColor: 'transparent',
          borderRadius: 12,
          paddingTop: 14,
          paddingBottom: 28,
          zIndex: 1,
          ...(isWeb ? { cursor: 'pointer' } : {}),
        } as any
      }
    >
      {/* .gnode .num */}
      <Text
        style={{
          fontFamily: MONO,
          fontSize: 11,
          fontWeight: '600',
          color: ACCENT,
          marginBottom: 9,
          letterSpacing: NUM_TRACKING,
        }}
      >
        {node.num}
      </Text>

      <NodeTile node={node} isWeb={isWeb} />

      {/* .gnode .glabel */}
      <Text
        style={{
          fontFamily: MONO,
          fontSize: 11.5,
          fontWeight: '600',
          letterSpacing: LABEL_TRACKING,
          textTransform: 'uppercase',
          color: INK,
          marginTop: 13,
          lineHeight: 14.375, // 1.25 * 11.5
          textAlign: 'center',
        }}
      >
        {node.label}
      </Text>
    </View>
  )
}

export function ChainGraphic() {
  const { width } = useWindowDimensions()
  const isWeb = Platform.OS === 'web'
  // home.css breakpoint: .flow wraps at <=720px (3 per row); ::before line hidden.
  const narrow = !isWeb || width <= 720

  return (
    // .chainband { margin-top:40px; border:none; background:none; padding:0 }
    <View style={{ marginTop: 40 }}>
      {/* .chainband .flow */}
      <View
        style={
          {
            position: 'relative',
            flexDirection: 'row',
            alignItems: 'stretch',
            justifyContent: narrow ? 'flex-start' : 'space-between',
            ...(narrow ? { flexWrap: 'wrap' } : {}),
          } as any
        }
      >
        {/* .chainband .flow::before — the 1.5px connecting line at top:70px.
            Hidden when the row wraps (mobile), matching home.css. */}
        {narrow ? null : (
          <View
            style={{
              position: 'absolute',
              top: 70,
              left: 0,
              right: 0,
              height: 1.5,
              backgroundColor: LINE,
              zIndex: 0,
            }}
          />
        )}

        {CHAIN_NODES.map((node) => (
          <ChainNode key={node.num} node={node} isWeb={isWeb} narrow={narrow} />
        ))}
      </View>
    </View>
  )
}
