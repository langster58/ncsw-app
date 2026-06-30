// NCSW design tokens — single source of truth.
//
// ── Fluid scaling engine ─────────────────────────────────────────────────────
// True linear fluid interpolation (the standard "utopia"-style formula),
// anchored between two viewport breakpoints:
//
//   MIN_VW   360px   — narrowest modern phone. Every value holds flat at its
//                       floor below this; nothing gets too small to use.
//   MAX_VW  1920px   — reference desktop viewport. Each token's "design size"
//                       lands here.
//
// Below MIN_VW: flat at the floor. Between MIN_VW and MAX_VW: linear fluid
// interpolation. Above MAX_VW: NO ceiling — values keep growing at the same
// rate forever. This matches the rest of the site's "no max-width, everything
// keeps scaling" approach: MAX_VW names the reference size, it isn't a cap.
//
// Two flavors:
//   fluid(minPx, maxPx)      — px output, for spacing/layout (space.*)
//   fluidType(minPx, maxPx)  — rem output, for type sizes (type.*). rem
//     (not px) so text also respects a user's browser-level default
//     font-size preference, not just pinch/page zoom.
//
// Both return a CSS string on web (react-native-web passes it straight to
// the DOM) and an opaque spec on native, resolved via useFluidPx().

import { Platform, useWindowDimensions } from 'react-native'

const MIN_VW = 360
const MAX_VW = 1920

function slopeIntercept(minPx: number, maxPx: number) {
  const slope = (maxPx - minPx) / (MAX_VW - MIN_VW)
  const yIntersectionPx = -MIN_VW * slope + minPx
  return { slope, yIntersectionPx }
}

type FluidSpec = { __fluid: true; minPx: number; slope: number; yIntersectionPx: number }
function isFluidSpec(v: unknown): v is FluidSpec {
  return typeof v === 'object' && v !== null && (v as FluidSpec).__fluid === true
}

// fluid(minPx, maxPx) — px-based, for spacing/layout.
export function fluid(minPx: number, maxPx: number) {
  const { slope, yIntersectionPx } = slopeIntercept(minPx, maxPx)
  if (Platform.OS === 'web') {
    return `max(${minPx}px, calc(${yIntersectionPx.toFixed(3)}px + ${(slope * 100).toFixed(4)}vw))` as unknown as number
  }
  return { __fluid: true, minPx, slope, yIntersectionPx } as unknown as number
}

// fluidType(minPx, maxPx) — rem-based (1rem = 16px), for type sizes.
export function fluidType(minPx: number, maxPx: number) {
  const { slope, yIntersectionPx } = slopeIntercept(minPx, maxPx)
  if (Platform.OS === 'web') {
    const minRem = minPx / 16
    const yRem = yIntersectionPx / 16
    return `max(${minRem.toFixed(4)}rem, calc(${yRem.toFixed(4)}rem + ${(slope * 100).toFixed(4)}vw))` as unknown as number
  }
  return { __fluid: true, minPx, slope, yIntersectionPx } as unknown as number
}

// Hook: resolve a fluid spec to a real px number on native using the current
// viewport width. Floor only — no ceiling.
export function useFluidPx(spec: number | string): number | string {
  const { width } = useWindowDimensions()
  if (Platform.OS === 'web') return spec
  if (!isFluidSpec(spec as unknown)) return spec
  const { minPx, slope, yIntersectionPx } = spec as unknown as FluidSpec
  return Math.max(minPx, yIntersectionPx + slope * width)
}

// ── Type scale ──────────────────────────────────────────────────────────────
// Modular scale, ratio 1.25 (Major Third), values in px shown for reference
// (engine converts to rem). Spread (floor vs. 1920-anchor size) widens for
// bigger elements and stays nearly flat for body/meta — small text shouldn't
// shrink much, it's already at the edge of legible. Hierarchy holds at both
// ends; no level ever crosses another.
//
//   level      floor@360   anchor@1920
export const type = {
  h2: fluidType(34, 52), //   34px        52px   — large section headings
  h2sm: fluidType(28, 40), // 28px        40px   — medium section headings
  h3: fluidType(22, 32), //   22px        32px   — sub-headings
  h4: fluidType(18, 24), //   18px        24px   — card titles
  heroLead: fluidType(18, 22), // 18px    22px   — hero statement
  lead: fluidType(17, 20), // 17px        20px   — section lede
  body: fluidType(15, 16), // 15px        16px   — body / card descriptions
  meta: fluidType(11, 12), // 11px        12px   — mono uppercase eyebrows/labels
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
}

// ── Fonts ───────────────────────────────────────────────────────────────────
export const fonts = {
  display: 'Creato Display', // hero + section h2 only
  body: 'Inter', // text, UI, smaller headings
  mono: 'IBM Plex Mono', // measured data, labels, eyebrows
}

// ── Spacing / layout ────────────────────────────────────────────────────────
// Layout spacing scales with the viewport on the same fluid curve as type.
// No max-width: the page fills the viewport at every size and keeps growing
// past the 1920 anchor with no ceiling. Floors protect narrow phones.
//
// Resolve fluid spec values via useFluidPx() at the call site (same pattern
// as the type scale).
export const space = {
  sectionTop: fluid(56, 96), // floor@360 -> 96px@1920, then keeps growing
  containerPadX: fluid(22, 40), // floor@360 -> 40px@1920, then keeps growing
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

// ── Shared text constraint ──────────────────────────────────────────────────
// All headings + body paragraphs use this. Single edit point.
export const copyMaxWidth = '66.6%' as const

// ── Breakpoint for narrow-viewport chrome (nav stack, etc.) ─────────────────
// Layout sizing is fluid via clamp(); this breakpoint only governs source
// behaviors that genuinely toggle on/off below it — e.g. the nav menu
// collapses into a hamburger. Matches home.css's @media (max-width: 900px).
export const narrowBreakpoint = 900
