// NCSW design tokens — single source of truth.
//
// Fluid typography anchored at 1920px viewport (modal desktop per StatCounter
// data). 1 reference px ≈ 0.0521vw (100/1920). Every type size is a clamp()
// with an accessibility floor and a desktop-XL cap, so the page scales
// proportionally like printed material between 360px and 2560px viewports.
//
//   anchor (reference)  1920px   — design sizes resolve to nominal here
//   cap                  2560px   — page stops growing above this (1440p)
//   floor                 360px   — modern smallest phone (iPhone SE etc.)
//   body text floor        14px   — practical WCAG floor for desktop body
//
// `fluid()` returns a CSS clamp() string on web (react-native-web passes it
// straight through to the underlying DOM). On native we expose a hook that
// resolves the same curve via useWindowDimensions.

import { Platform, useWindowDimensions } from 'react-native'

const ANCHOR_VW_PX = 1920 // 1 ref px = 100/1920 ≈ 0.0521vw

// fluid(referencePx, floorPx, capPx)
// referencePx is the value the type lands at on a 1920px viewport.
export function fluid(ref: number, floor: number, cap: number) {
  if (Platform.OS === 'web') {
    const coef = (100 / ANCHOR_VW_PX) * ref
    return `clamp(${floor}px, ${coef.toFixed(3)}vw, ${cap}px)` as unknown as number
  }
  // Native: opaque tag; resolve via useFluidPx(spec) at the call site.
  return { __fluid: true, ref, floor, cap } as unknown as number
}

type FluidSpec = { __fluid: true; ref: number; floor: number; cap: number }
function isFluidSpec(v: unknown): v is FluidSpec {
  return typeof v === 'object' && v !== null && (v as FluidSpec).__fluid === true
}

// Hook: resolve a fluid spec to a real px on native using the current viewport.
// On web this is a no-op (the value is already a clamp() string).
export function useFluidPx(spec: number | string): number | string {
  const { width } = useWindowDimensions()
  if (Platform.OS === 'web') return spec
  if (!isFluidSpec(spec as unknown)) return spec
  const { ref, floor, cap } = spec as unknown as FluidSpec
  const coef = ref / ANCHOR_VW_PX
  return Math.max(floor, Math.min(cap, coef * width))
}

// ── Type scale ──────────────────────────────────────────────────────────────
// Two section heading sizes in the source:
//   - h2     → .howto h2 (HowItWorks) — clamp(36, 4.8vw, 54)
//   - h2sm   → .section-intro h2 (Collections, Editorial) — clamp(28, 3.2vw, 42)
export const type = {
  hero: fluid(168, 58, 168), // hero wordmark / source: clamp(58, 9.5vw, 168)
  h2: fluid(54, 36, 64), // section headings (large) — .howto h2
  h2sm: fluid(42, 28, 50), // section headings (medium) — .section-intro h2
  h3: fluid(30, 22, 36), // sub-headings
  h4: fluid(22, 18, 26), // card titles
  heroLead: fluid(22, 17, 26), // hero statement — source: .hero-lede 22/1.45
  lead: fluid(17, 15, 20), // section lede
  body: fluid(15, 14, 18), // body / card descriptions — 14px WCAG floor
  meta: fluid(11, 11, 13), // mono uppercase eyebrows / labels
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
export const space = {
  sectionTop: 96, // .section { padding-top: 96px }
  containerMax: 1410, // .container { max-width: 1410px }
  containerPadX: 40, // .container { padding: 0 40px }
  containerPadXMobile: 22, // narrow-viewport gutter
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

// ── Breakpoint for narrow-viewport behavior ─────────────────────────────────
// Below this we switch container gutter to 22px and stack the source's
// desktop-only chrome (nav menu hidden, etc.) — matches home.css's
// @media (max-width: 900px) rule used by source nav/hero.
export const narrowBreakpoint = 900
