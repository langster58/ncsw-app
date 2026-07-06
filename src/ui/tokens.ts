// NCSW design tokens — single source of truth.
//
// ── Fluid scaling engine ─────────────────────────────────────────────────────
// Uniform proportional scaling — every value is a FIXED PERCENTAGE of the
// current viewport width (anchorPx/1920 of it), so headings AND body copy
// shrink and grow by the exact same percentage together as the window
// resizes. This is the "look you'd get from pure vw units" effect, just
// with a hard floor so nothing becomes illegible, and no ceiling (values
// keep growing past 1920px with no upper limit).
//
//   fluid(anchorPx, floorPx)      — px output, for spacing/layout (space.*)
//   fluidType(anchorPx, floorPx)  — rem output, for type sizes (type.*). rem
//     (not px) so text also respects a user's browser-level default
//     font-size preference, not just pinch/page zoom.
//
// anchorPx: the value at the 1920px reference viewport (also defines the
//   scaling percentage: anchorPx/1920 of viewport width, at every width).
// floorPx: a hard minimum — a safety net for extreme narrow viewports, not
//   a stylistic "barely changes" design. Above the width where the
//   proportional value crosses this floor, sizing is purely proportional.
//
// Both return a CSS string on web (react-native-web passes it straight to
// the DOM) and an opaque spec on native, resolved via useFluidPx().

import { Platform, useWindowDimensions } from 'react-native'

const REF_VW = 1920

type FluidSpec = { __fluid: true; floorPx: number; coefficient: number }
function isFluidSpec(v: unknown): v is FluidSpec {
  return typeof v === 'object' && v !== null && (v as FluidSpec).__fluid === true
}

// fluid(anchorPx, floorPx) — px-based, for spacing/layout.
export function fluid(anchorPx: number, floorPx: number) {
  const vwPercent = (anchorPx / REF_VW) * 100
  if (Platform.OS === 'web') {
    return `max(${floorPx}px, ${vwPercent.toFixed(4)}vw)` as unknown as number
  }
  return { __fluid: true, floorPx, coefficient: anchorPx / REF_VW } as unknown as number
}

// fluidType(anchorPx, floorPx) — rem-based (1rem = 16px), for type sizes.
export function fluidType(anchorPx: number, floorPx: number) {
  const vwPercent = (anchorPx / REF_VW) * 100
  if (Platform.OS === 'web') {
    const floorRem = floorPx / 16
    return `max(${floorRem.toFixed(4)}rem, ${vwPercent.toFixed(4)}vw)` as unknown as number
  }
  return { __fluid: true, floorPx, coefficient: anchorPx / REF_VW } as unknown as number
}

// Hook: resolve a fluid spec to a real px number on native using the current
// viewport width. Floor only — no ceiling.
export function useFluidPx(spec: number | string): number | string {
  const { width } = useWindowDimensions()
  if (Platform.OS === 'web') return spec
  if (!isFluidSpec(spec as unknown)) return spec
  const { floorPx, coefficient } = spec as unknown as FluidSpec
  return Math.max(floorPx, coefficient * width)
}

// Pure fluid math for contexts that need a real number, not a CSS string —
// canvas drawing, SVG width/height attributes, native <input> props. Same
// uniform-proportional-percentage formula as fluid()/fluidType(), just
// evaluated immediately against a given viewport width instead of deferred
// to the browser via CSS.
export function fluidNumber(anchorPx: number, floorPx: number, viewportWidth: number): number {
  return Math.max(floorPx, (anchorPx / REF_VW) * viewportWidth)
}

// Hook form of fluidNumber — reactive to the live viewport width on both
// web and native, for use anywhere a plain JS number is required at render
// time (icon size props, etc.) rather than a CSS value.
export function useFluidValue(anchorPx: number, floorPx: number): number {
  const { width } = useWindowDimensions()
  return fluidNumber(anchorPx, floorPx, width)
}

// ── Type scale ──────────────────────────────────────────────────────────────
// Modular scale, ratio 1.25 (Major Third), values in px shown for reference
// (engine converts to rem). Spread (floor vs. 1920-anchor size) widens for
// bigger elements and stays nearly flat for body/meta — small text shouldn't
// shrink much, it's already at the edge of legible. Hierarchy holds at both
// ends; no level ever crosses another.
//
// Uniform proportional scaling: every level shares the same anchorPx/1920
// percentage of viewport width, so a heading and a paragraph shrink/grow by
// the same percentage together. floorPx is a real legibility minimum, not a
// stylistic near-flat spread — plenty of room to visibly shrink above it.
//
//   level         anchor@1920   floor (hard minimum)
export const type = {
  h2: fluidType(52, 28), //    52px          28px   — large section headings
  h2sm: fluidType(40, 24), //  40px          24px   — medium section headings
  h3: fluidType(32, 20), //    32px          20px   — sub-headings
  h4: fluidType(24, 16), //    24px          16px   — card titles
  heroLead: fluidType(22, 16), // 22px       16px   — hero statement
  lead: fluidType(20, 15), //  20px          15px   — section lede
  body: fluidType(16, 13), //  16px          13px   — body / card descriptions
  small: fluidType(14, 11), // 14px          11px   — small labels / dense data text
  meta: fluidType(12, 10), // 12px           10px   — mono uppercase eyebrows/labels
}

// ── Line heights (unitless multipliers, source-accurate) ────────────────────
// These are MULTIPLIERS, like CSS `line-height: 1.04`. React Native's
// `lineHeight` prop is absolute (points), so we always resolve these against
// the rendered fontSize via fluidLineHeight() below.
export const lineHeight = {
  tight: 1.04, // display headlines
  snug: 1.1,
  body: 1.58, // .lead / .ncsw-prose
}

// Resolve a unitless multiplier against a fluid fontSize.
// - Web: fontSize is a clamp() string → return calc(<clamp> * <mult>).
// - Native: fontSize is a number → return number * multiplier.
export function fluidLineHeight(
  fontSize: number | string,
  multiplier: number,
): number | string {
  if (typeof fontSize === 'string') {
    return `calc(${fontSize} * ${multiplier})` as unknown as number
  }
  return fontSize * multiplier
}

// ── Letter spacing helpers (CSS em → RN points are font-size-dependent) ─────
// Use these strings on web; native conversion lives in components when needed.
export const tracking = {
  display: '-0.02em',
  label: '0.12em',
  wide: '0.04em',
}

// ── Colors (resolved from tokens.css + source state palettes) ────────────────
export const colors = {
  // base
  ink: '#09080e', // headings — --ncsw-ink / --fg-1
  body: '#333333', // body copy
  gray: '#656565', // labels, meta — --ncsw-gray / --fg-2
  line: '#ececec', // hairlines — --ncsw-line
  surface: '#f5f5f5', // light fills — --ncsw-shape
  white: '#ffffff',
  black: '#000000',
  accent: '#0576cc', // --accent / --ncsw-primary
  accentHover: '#0569b7', // primary button :hover
  accentPressed: '#045fa6', // primary button :active
  accentSoft: '#e6f1fb', // chip selected bg
  accentSoftPressed: '#d8eaf9', // chip selected :active bg
  sky: '#3ba8e2', // --accent-sky

  // ink scale (denser-UI variants from the table palette)
  inkSoft: '#5b6270', // chip inactive text
  inkFaint: '#8b92a1', // labels, placeholders

  // button / control borders + hover surfaces
  borderStrong: '#dcdcdc',
  borderStrongHover: '#b8b8b8',
  borderStrongActive: '#aeb3b8',
  surfaceHover: '#fafbfc', // button :hover bg
  surfacePressed: '#f2f3f4', // button :active bg
  surfaceHoverNeutral: '#f3f6fb', // chip / nav neutral hover

  // disabled
  disabledFg: '#a8a8a8',
  disabledBorder: '#e4e4e4',
  disabledBg: '#f5f5f5',

  // focus
  focusRing: '#0576cc',

  // dark media surfaces
  mediaDark: '#1b1b1b', // montage grid gutter
  mediaDarker: '#0a0b0f', // door media background

  lineSoft: '#f0f0f0', // nav bottom hairline (pre-scroll)
  figBg: '#fafafa', // minichart background

  // dense table palette (PackageTable + modal)
  tableInk: '#16181d',
  tableLine: '#e7e9ee',
  tableLineStrong: '#d3d7e0',

  // chart (SubwooferFrontierChart + Editorial figures)
  chartAxis: '#6b6b70',
  chartTick: '#8a8a8e',
  chartAxisSoft: '#aaaaaa',
  chartDotMuted: '#cfcfcf',
  chartMagenta: '#e941bc',
  chartGridStrong: '#d8d8dc', // emphasized axis line
  chartChipBorderHover: '#cfd3d9',
  accentTint: '#eef5fb', // ~8% accent on white (chip active bg)
}

// ── Fonts ───────────────────────────────────────────────────────────────────
export const fonts = {
  display: 'Creato Display', // hero + section h2 only
  body: 'Inter', // text, UI, smaller headings
  mono: 'IBM Plex Mono', // measured data, labels, eyebrows
}

// ── Spacing / layout ────────────────────────────────────────────────────────
// Layout spacing scales with the viewport on the same fluid curve as type.
// The container caps at `containerMax` (below) and centers; gutters stay
// fluid inside it. Floors protect narrow phones.
//
// Resolve fluid spec values via useFluidPx() at the call site (same pattern
// as the type scale).
export const space = {
  sectionTop: fluid(96, 56), // 96px@1920, floor 56px, uniform % scaling
  containerPadX: fluid(40, 22), // 40px@1920, floor 22px, uniform % scaling
  blockGap: 28, // gap between heading and lede
  ruleHairline: 1,
}

// ── Radii ───────────────────────────────────────────────────────────────────
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 100,
}

// ── Container max width ─────────────────────────────────────────────────────
// The .container (Container.tsx) caps here and centers; the fluid gutters
// (containerPadX) sit inside it. One value shared by every page — landing,
// product detail, articles — so the whole app reads at the same measure.
// Splits the difference between an earlier 1410 cap and full-bleed.
export const containerMax = 1680

// ── Shared text constraint ──────────────────────────────────────────────────
// All headings + body paragraphs use this. Single edit point. Also used for
// the hero wordmark's width, so it scales at the same proportion.
export const copyMaxWidth = '60%' as const

// ── Breakpoint for narrow-viewport chrome (nav stack, etc.) ─────────────────
// Layout sizing is fluid via clamp(); this breakpoint only governs source
// behaviors that genuinely toggle on/off below it — e.g. the nav menu
// collapses into a hamburger. Matches home.css's @media (max-width: 900px).
export const narrowBreakpoint = 900
