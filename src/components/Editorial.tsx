// NCSW homepage — Editorial section ("06 / Editorial").
// Faithful web-target port of the homepage Editorial section: opener band,
// SectionIntro (heading + lede), and the 3-card edit-grid of methodology
// "pieces", each with a kicker, h4 title, dek, an inline data figure, and a
// "door" link. Source: Editorial.jsx (Editorial / PIECES / MiniFrontier /
// BlindAmpFig / DspFig) + home.css + tokens.css.
//
// Copy is taken verbatim from the source. In a real build this copy + figure
// data would come from Directus; it is hardcoded here to match the reference.
//
// Conventions: only react / react-native imports. Web-only CSS props (grid,
// gap-on-grid, overflowX, scroll-snap, backgroundColor strings, raw <svg>)
// are cast `as any`. Native gets a flex-column / ScrollView fallback. No
// animation logic (the source ".fade" reveal + hover transitions are dropped).

import React from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

// ── Resolved design tokens (RN cannot read CSS vars) ────────────────────────
const INK = '#09080e'; // --ncsw-ink / --fg-1
const GRAY = '#656565'; // --ncsw-gray / --fg-2
const LINE = '#ececec'; // --ncsw-line / --border
const WHITE = '#ffffff'; // --ncsw-white
const ACCENT = '#0576cc'; // --accent / --data / --ncsw-primary
const ACCENT_2 = '#09080e'; // --accent-2 (ink)
const FIG_BG = '#fafafa'; // .minichart background
const DOT_DOMINATED = '#cfcfcf';
const AXIS_GRAY = '#aaaaaa';

const FONT_DISPLAY = 'Creato Display';
const FONT_BODY = 'Inter';
const FONT_MONO = 'IBM Plex Mono';

const IS_WEB = Platform.OS === 'web';

// ── Figure data (verbatim from source) ──────────────────────────────────────
// BlindAmpFig rows: [label, width%, highlighted?]
const BLIND_AMP_ROWS: [string, number, boolean][] = [
  ['Amp A', 81, false],
  ['Amp B', 84, false],
  ['Amp C', 79, false],
  ['Amp D', 83, true],
  ['Amp E', 80, false],
  ['Amp F', 82, false],
];

// DspFig: stylised correction curve. corr = indices tinted accent.
const DSP_BARS = [38, 52, 70, 64, 45, 30, 42, 58, 74, 80, 62, 40, 33, 50, 66, 48];
const DSP_CORR = new Set([2, 3, 8, 9, 10]);

// MiniFrontier drivers — sourced from window.NCSW_MINI_DRIVERS in the original.
// That global isn't available here, so a representative driver set is used to
// drive the same Pareto-frontier visual (price vs. impact). The frontier math
// and projection are ported 1:1 from the source.
type Driver = { id: number; price: number; impact: number };
const MINI_DRIVERS: Driver[] = [
  { id: 1, price: 180, impact: 24 },
  { id: 2, price: 260, impact: 30 },
  { id: 3, price: 340, impact: 33 },
  { id: 4, price: 420, impact: 41 },
  { id: 5, price: 560, impact: 38 },
  { id: 6, price: 640, impact: 47 },
  { id: 7, price: 760, impact: 44 },
  { id: 8, price: 880, impact: 52 },
  { id: 9, price: 1040, impact: 55 },
  { id: 10, price: 1240, impact: 56 },
  { id: 11, price: 1360, impact: 58 },
  { id: 12, price: 500, impact: 28 },
];

function paretoFrontier(points: Driver[]): Driver[] {
  return points
    .filter(
      (p) =>
        !points.some(
          (q) =>
            q !== p &&
            q.price <= p.price &&
            q.impact >= p.impact &&
            (q.price < p.price || q.impact > p.impact),
        ),
    )
    .sort((a, b) => a.price - b.price);
}

// ── Pieces (verbatim copy) ──────────────────────────────────────────────────
type FigKind = 'frontier' | 'blindAmp' | 'dsp';
type Piece = {
  no: string;
  read: string;
  title: string;
  dek: string;
  fig: FigKind;
  door: string;
};

const PIECES: Piece[] = [
  {
    no: '01',
    read: '8 min read',
    title: 'The Sub Value Frontier',
    dek: "Plot every subwoofer's measured output against its installed price and a curve emerges. The bend is where added spend stops buying meaningful bass. We build to the bend.",
    fig: 'frontier',
    door: 'Read the analysis',
  },
  {
    no: '02',
    read: '11 min read',
    title: 'The 10 Blind Amp Challenge',
    dek: 'Ten amplifiers, level-matched and identified by ear alone. The scores landed inside a few points of each other — and reframed where amplifier money is actually worth spending.',
    fig: 'blindAmp',
    door: 'Read the results',
  },
  {
    no: '03',
    read: '6 min read',
    title: 'Why Every System Gets a DSP',
    dek: 'Premium factory systems ship with a deliberate showroom voicing. Before we add output, we measure the cabin and flatten the curve to a target — every build, no exceptions.',
    fig: 'dsp',
    door: 'Read the method',
  },
];

// ── Small primitives ────────────────────────────────────────────────────────

// IconArrow — square-cap arrow used inside .door links. s = 15 here.
function IconArrow({ s = 15 }: { s?: number }) {
  if (IS_WEB) {
    return React.createElement(
      'svg',
      {
        width: s,
        height: s,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 2,
        strokeLinecap: 'square',
        style: { display: 'block' },
      },
      React.createElement('path', { d: 'M5 12h13M12 6l6 6-6 6' }),
    );
  }
  // Native fallback: a chevron-ish glyph keeps the affordance without SVG.
  return <Text style={{ color: INK, fontSize: s, lineHeight: s }}>{'→'}</Text>;
}

// .door — uppercase, tracked link affordance.
function Door({ label }: { label: string }) {
  return (
    <Pressable
      style={{
        marginTop: 20,
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        paddingBottom: 3,
        borderBottomWidth: 1,
        borderBottomColor: 'transparent',
      }}
    >
      <Text
        style={{
          fontFamily: FONT_BODY,
          textTransform: 'uppercase',
          letterSpacing: 0.12 * 11, // .12em @ 11px
          fontSize: 11,
          fontWeight: '600',
          color: INK,
          marginRight: 9, // .door gap
        }}
      >
        {label}
      </Text>
      <IconArrow s={15} />
    </Pressable>
  );
}

// ── Figures ─────────────────────────────────────────────────────────────────

// .figrows — label + horizontal bar rows (BlindAmpFig).
function FigRows({ rows }: { rows: [string, number, boolean][] }) {
  return (
    <View style={{ flexDirection: 'column', gap: 7 } as any}>
      {rows.map(([label, w, hi]) => (
        <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 } as any}>
          <Text
            style={{
              fontFamily: FONT_MONO,
              fontVariant: ['tabular-nums'],
              fontSize: 10,
              color: GRAY,
              width: 30,
            }}
          >
            {label}
          </Text>
          {/* .bar — track + filled inner */}
          <View style={{ height: 8, backgroundColor: LINE, flex: 1, overflow: 'hidden' }}>
            <View
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: `${w}%`,
                backgroundColor: hi ? ACCENT : INK,
              }}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

// .dspfig — row of bottom-aligned vertical bars, some tinted accent (DspFig).
function DspFig() {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 3,
        height: 96,
        paddingTop: 6,
        paddingHorizontal: 4,
      } as any}
    >
      {DSP_BARS.map((h, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: `${h}%`,
            backgroundColor: DSP_CORR.has(i) ? ACCENT : LINE,
          }}
        />
      ))}
    </View>
  );
}

// .minichart — the Pareto value-frontier scatter + dashed frontier line.
// Ported geometry from the source MiniFrontier (W/H, pads, domains, sx/sy).
function MiniFrontier() {
  const frontier = paretoFrontier(MINI_DRIVERS);
  const fids = new Set(frontier.map((p) => p.id));

  const W = 320;
  const H = 168;
  const padL = 26;
  const padR = 10;
  const padT = 12;
  const padB = 22;
  const xMin = 120;
  const xMax = 1380;
  const yMin = 18;
  const yMax = 60;
  const sx = (p: number) => padL + ((p - xMin) / (xMax - xMin)) * (W - padL - padR);
  const sy = (v: number) => H - padB - ((v - yMin) / (yMax - yMin)) * (H - padT - padB);
  const line = frontier
    .map((p, i) => (i ? 'L' : 'M') + sx(p.price).toFixed(1) + ' ' + sy(p.impact).toFixed(1))
    .join(' ');

  const wrapStyle = {
    borderRadius: 8, // --radius-sm
    backgroundColor: FIG_BG,
    padding: 12,
  } as const;

  if (IS_WEB) {
    const svg = React.createElement(
      'svg',
      { viewBox: `0 0 ${W} ${H}`, style: { width: '100%', height: 'auto', display: 'block' } },
      // gridlines at impact ticks 25/35/45/55
      ...[25, 35, 45, 55].map((t) =>
        React.createElement('line', {
          key: `g${t}`,
          x1: padL,
          y1: sy(t),
          x2: W - padR,
          y2: sy(t),
          stroke: LINE,
          strokeWidth: 1,
        }),
      ),
      React.createElement(
        'text',
        { x: padL, y: H - 6, fontFamily: FONT_MONO, fontSize: 7.5, letterSpacing: 1, fill: AXIS_GRAY },
        'PRICE →',
      ),
      React.createElement(
        'text',
        { x: 4, y: padT + 6, fontFamily: FONT_MONO, fontSize: 7.5, letterSpacing: 1, fill: AXIS_GRAY },
        'IMPACT',
      ),
      React.createElement('path', {
        d: line,
        fill: 'none',
        stroke: ACCENT,
        strokeWidth: 1.6,
        strokeDasharray: '5 4',
      }),
      // dominated points
      ...MINI_DRIVERS.filter((p) => !fids.has(p.id)).map((p) =>
        React.createElement('circle', {
          key: `d${p.id}`,
          cx: sx(p.price),
          cy: sy(p.impact),
          r: 3,
          fill: DOT_DOMINATED,
        }),
      ),
      // frontier points
      ...frontier.map((p) =>
        React.createElement('circle', {
          key: `f${p.id}`,
          cx: sx(p.price),
          cy: sy(p.impact),
          r: 3.6,
          fill: ACCENT,
          stroke: WHITE,
          strokeWidth: 1,
        }),
      ),
    );

    return (
      <View style={wrapStyle}>
        <View style={{ width: '100%' }}>{svg as any}</View>
        <Legend />
      </View>
    );
  }

  // Native fallback: plot dots/line as absolutely-positioned Views.
  return (
    <View style={wrapStyle}>
      <View style={{ width: '100%', aspectRatio: W / H, position: 'relative' }}>
        {MINI_DRIVERS.map((p) => {
          const on = fids.has(p.id);
          const r = on ? 3.6 : 3;
          return (
            <View
              key={p.id}
              style={{
                position: 'absolute',
                left: `${(sx(p.price) / W) * 100}%`,
                top: `${(sy(p.impact) / H) * 100}%`,
                width: r * 2,
                height: r * 2,
                marginLeft: -r,
                marginTop: -r,
                borderRadius: r,
                backgroundColor: on ? ACCENT : DOT_DOMINATED,
                borderWidth: on ? 1 : 0,
                borderColor: WHITE,
              }}
            />
          );
        })}
      </View>
      <Legend />
    </View>
  );
}

// .minichart .legend
function Legend() {
  const item = (color: string, label: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 } as any}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <Text
        style={{
          fontFamily: FONT_BODY,
          textTransform: 'uppercase',
          letterSpacing: 0.1 * 8.5, // .1em @ 8.5px
          fontWeight: '600',
          fontSize: 8.5,
          color: GRAY,
        }}
      >
        {label}
      </Text>
    </View>
  );
  return (
    <View style={{ flexDirection: 'row', gap: 14, marginTop: 8 } as any}>
      {item(ACCENT, 'On frontier')}
      {item(DOT_DOMINATED, 'Dominated')}
    </View>
  );
}

function PieceFigure({ kind }: { kind: FigKind }) {
  if (kind === 'frontier') return <MiniFrontier />;
  if (kind === 'blindAmp') return <FigRows rows={BLIND_AMP_ROWS} />;
  return <DspFig />;
}

// ── Card ────────────────────────────────────────────────────────────────────
// .piece — bordered, rounded card, flex column, figure pinned to bottom.
function PieceCard({ piece, cardWidth }: { piece: Piece; cardWidth: number | undefined }) {
  return (
    <View
      style={{
        width: cardWidth,
        borderWidth: 1,
        borderColor: LINE,
        borderRadius: 16, // --radius-lg
        paddingTop: 26,
        paddingHorizontal: 26,
        paddingBottom: 24,
        flexDirection: 'column',
        backgroundColor: WHITE,
        minHeight: 420,
      }}
    >
      {/* .kicker — no + read, space-between */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
        } as any}
      >
        <Text
          style={{
            fontFamily: FONT_MONO,
            fontVariant: ['tabular-nums'],
            fontSize: 12,
            fontWeight: '500',
            color: ACCENT_2,
          }}
        >
          {piece.no}
        </Text>
        <Text
          style={{
            fontFamily: FONT_BODY,
            textTransform: 'uppercase',
            letterSpacing: 0.12 * 10, // .12em @ 10px
            fontWeight: '600',
            fontSize: 10,
            color: GRAY,
          }}
        >
          {piece.read}
        </Text>
      </View>

      {/* .piece h4 */}
      <Text
        style={{
          fontFamily: FONT_BODY,
          fontSize: 25,
          fontWeight: '600',
          letterSpacing: -0.02 * 25, // -.02em @ 25px
          lineHeight: 25 * 1.1,
          color: INK,
          marginTop: 18,
        }}
      >
        {piece.title}
      </Text>

      {/* .dek */}
      <Text
        style={{
          color: GRAY,
          fontSize: 15,
          lineHeight: 15 * 1.55,
          marginTop: 12,
        }}
      >
        {piece.dek}
      </Text>

      {/* .figure — margin-top:auto pushes it to the bottom; padding-top 22 */}
      <View style={{ marginTop: 'auto', paddingTop: 22 }}>
        <PieceFigure kind={piece.fig} />
      </View>

      <Door label={piece.door} />
    </View>
  );
}

// ── Section ─────────────────────────────────────────────────────────────────
export function Editorial() {
  const { width } = useWindowDimensions();

  // .section.container → padding-top 96; max-width 1410; padding 0 40 (22 mobile @<=900).
  const isNarrow = width <= 900;
  const horizontalPadding = isNarrow ? 22 : 40;

  // --ncsw-grid-gutter: clamp(20px, 1.7vw, 32px)
  const gutter = Math.max(20, Math.min(32, width * 0.017));

  // .section-intro h2 → clamp(28px, 3.2vw, 42px), lh 1.05, ls -.02em.
  const headingFontSize = Math.max(28, Math.min(42, width * 0.032));
  const headingLineHeight = Math.round(headingFontSize * 1.05);

  // .section-intro p → 1.0625rem (17px), line-height 1.58.
  const leadFontSize = 17;
  const leadLineHeight = Math.round(leadFontSize * 1.58);

  // .edit-grid → 3 cols on web wide; single column @<=900 (mobile breakpoint).
  // Resolve a concrete card width on web so the grid is even; native uses a
  // horizontal ScrollView rail with fixed-width cards.
  const containerInner = Math.min(1410, width) - horizontalPadding * 2;
  const webCardWidth = isNarrow
    ? undefined
    : (containerInner - gutter * 2) / 3;

  return (
    <View
      style={{
        paddingTop: 96,
        paddingHorizontal: horizontalPadding,
        maxWidth: 1410,
        marginHorizontal: 'auto',
        width: '100%',
      }}
    >
      {/* .opener — index/label + "All articles" door, top hairline rule. */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 18,
          borderTopWidth: 1,
          borderTopColor: INK,
          paddingTop: 14,
          marginBottom: 48,
        } as any}
      >
        <Text
          style={{
            fontFamily: FONT_MONO,
            fontVariant: ['tabular-nums'],
            fontSize: 12,
            fontWeight: '500',
            letterSpacing: 0.04 * 12, // .04em @ 12px
            color: GRAY,
          }}
        >
          06 / Editorial
        </Text>
        <Door label="All articles" />
      </View>

      {/* .section-intro — heading + lede, max-width ~70ch. */}
      <View style={{ maxWidth: 760, marginBottom: gutter }}>
        <Text
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: headingFontSize,
            fontWeight: '700',
            letterSpacing: -(headingFontSize * 0.02),
            lineHeight: headingLineHeight,
            color: INK,
          }}
        >
          We publish the reasoning.
        </Text>
        <View style={{ marginTop: 16 }}>
          <Text
            style={{
              fontSize: leadFontSize,
              lineHeight: leadLineHeight,
              color: GRAY,
              maxWidth: 760,
            }}
          >
            Every engineering call we make, from which subwoofer to how much
            amplifier to why a DSP, comes from measurement, not opinion. These
            write-ups walk the tests we run, the data behind the rankings, and
            the trade-offs we'd want explained if it were our own car.
          </Text>
        </View>
      </View>

      {/* .edit-grid — 3-up on web, horizontal card rail on native/narrow. */}
      {IS_WEB && !isNarrow ? (
        <View
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: gutter,
          } as any}
        >
          {PIECES.map((p) => (
            <PieceCard key={p.no} piece={p} cardWidth={undefined} />
          ))}
        </View>
      ) : IS_WEB ? (
        // Narrow web: single column stack.
        <View style={{ flexDirection: 'column', gap: gutter } as any}>
          {PIECES.map((p) => (
            <PieceCard key={p.no} piece={p} cardWidth={undefined} />
          ))}
        </View>
      ) : (
        // Native: horizontal rail of fixed-width cards.
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: gutter } as any}
        >
          {PIECES.map((p) => (
            <PieceCard key={p.no} piece={p} cardWidth={Math.min(320, width - horizontalPadding * 2)} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}
