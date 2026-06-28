// PackageTable.web.tsx — WEB-ONLY render of the dense package/pricing table.
//
// This is the project's known web/native split point (see CLAUDE.md §4). The
// native variant (PackageTable.native.tsx) presents the same data as a card /
// master-detail list. This file is the full dense grid and is NEVER bundled on
// native.
//
// Ported faithfully from the source "PackagesTable.jsx". Styling/spacing of the
// table chrome (filter chrome, column headers, sticky price column, zebra rows)
// is prioritized over data completeness.
//
// IMPORTANT — DEFERRED / FAKE:
//   * Real data comes from a Directus CMS. The SAMPLE_ROWS below are ~7
//     REPRESENTATIVE rows only, hardcoded purely so the chrome has something to
//     frame. Wire these to the CMS feed when available.
//   * Filtering/sorting is VISUAL ONLY. The chips and segmented toggles track
//     active state with useState and restyle themselves, but they do NOT filter
//     or reorder SAMPLE_ROWS. Real query wiring is deferred.
//   * The year selector is a static control surface (no vehicle list bound).

import React from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
} from 'react-native';

/* ------------------------------------------------------------------ tokens */
const C = {
  ink: '#09080e',
  ink2: '#3a3a3f', // cell body text (text-ink2)
  ink3: '#656565', // labels / headers (text-ink3 == --fg-2 gray)
  line: '#ececec',
  lineS: '#d8d8d8', // control / chip borders
  surface: '#f5f5f5',
  white: '#ffffff',
  accent: '#0576cc',
  accentSoft: '#eef4fb', // active chip fill (bg-accentSoft)
  accentPressed: '#d8eaf9',
  zebra: '#fafbfc', // odd-row background
  rowHover: '#f3f6fb',
  rowActive: '#e9f0fa',
  divider: '#e7e9ee', // sticky-column shadow line
  trackBg: '#eef0f3',
  thumbBg: '#cdd2da',
} as const;

const FONT_BODY = 'Inter, -apple-system, "SF Pro Text", "Segoe UI", sans-serif';
const FONT_MONO = '"IBM Plex Mono", ui-monospace, "SF Mono", monospace';

const GX = 40; // container gutter (--gx ≈ container padding 0 40px)

// em letter-spacing → points. base font sizes for the mono labels are ~10–11px.
// 0.04em * 11px = 0.44pt ; 0.07em * 10.5px = 0.735pt ; 0.12em * 11px = 1.32pt
const LS_HEADER = 0.04 * 11; // header columns: tracking-[0.04em]
const LS_FACET_LABEL = 0.07 * 10.5; // facet labels: tracking-[0.07em]
const LS_BTN = 0.12 * 11.5; // "Sort & Filter" button mono uppercase

/* ------------------------------------------------------------------ columns
   EXACT labels from the source COLS array. `w` matches the source widths. */
type Col = { key: string; label: string; w: number; mono?: boolean };
const COLS: Col[] = [
  { key: 'price', label: 'Price', w: 108, mono: true },
  { key: 'tier', label: 'Tier', w: 104 },
  { key: 'vscore', label: 'Value Score', w: 116, mono: true },
  { key: 'signal', label: 'Signal Processor', w: 158 },
  { key: 'cset', label: 'Component Set', w: 198 },
  { key: 'frontSub', label: 'Front Sub', w: 128 },
  { key: 'camp', label: 'Multi CH Amp', w: 150 },
  { key: 'subamp', label: 'Mono Amp', w: 158 },
  { key: 'sub', label: 'Subwoofer', w: 192 },
  { key: 'enclosure', label: 'Enclosure', w: 150 },
  { key: 'size', label: 'Sub Size', w: 88, mono: true },
  { key: 'count', label: 'Sub Count', w: 96 },
  { key: 'monoWatts', label: 'Mono Amp Watts', w: 138, mono: true },
];
const PRICE_W = COLS[0].w; // sticky-left column width
const TOTAL_W = COLS.reduce((a, c) => a + c.w, 0);

/* --------------------------------------------------------- representative data
   ~7 sample rows. REAL DATA COMES FROM DIRECTUS — do not extend this set. */
type Row = {
  id: number;
  price: string;
  tier: string;
  vscore: number;
  signal: string;
  cset: string;
  frontSub: string;
  camp: string;
  subamp: string;
  sub: string;
  enclosure: string;
  size: string;
  count: string;
  monoWatts: string;
};
const SAMPLE_ROWS: Row[] = [
  { id: 0, price: '$1,690', tier: 'Entry', vscore: 58, signal: 'Zapco HB 46 II 4A', cset: 'Stevens + SEAS MB6', frontSub: '—', camp: 'Helix MINI', subamp: 'Helix Amplify 206', sub: 'Crescendo Forte v2 10', enclosure: 'Sealed · 0.6 ft³', size: '10"', count: 'Single', monoWatts: '600 W' },
  { id: 1, price: '$1,740', tier: 'Entry', vscore: 61, signal: 'Zapco HB 46 II 4A', cset: 'Stevens + SEAS MB6', frontSub: '—', camp: 'Helix MINI', subamp: 'Helix Amplify 206', sub: 'NVX VCW v3 10', enclosure: 'Ported · 0.9 ft³', size: '10"', count: 'Single', monoWatts: '600 W' },
  { id: 2, price: '$1,990', tier: 'Mid', vscore: 67, signal: 'Helix Mini MK2', cset: 'Hybrid Audio Mirus', frontSub: 'Stevens MB-8', camp: 'Helix DSP.3', subamp: 'Helix DSP Ultra', sub: 'Sundown SA Classic 12', enclosure: 'Sealed · 0.9 ft³', size: '12"', count: 'Single', monoWatts: '950 W' },
  { id: 3, price: '$2,240', tier: 'Mid', vscore: 71, signal: 'Helix Mini MK2', cset: 'Hybrid Audio Mirus', frontSub: 'SEAS L16', camp: 'Helix Amplify 206', subamp: 'Sundown SAE-1000', sub: 'DD Audio 700 12', enclosure: 'Ported · 0.9 ft³', size: '12"', count: 'Single', monoWatts: '1,000 W' },
  { id: 4, price: '$2,790', tier: 'Upper', vscore: 78, signal: 'Helix Pro MK3', cset: 'Audiofrog GB60 / GB15', frontSub: 'Dayton RSS', camp: 'Zapco ST-4X', subamp: 'Sundown SAE-1000', sub: 'Fi Car Audio HC 12', enclosure: 'Ported · 0.9 ft³', size: '12"', count: 'Single', monoWatts: '1,000 W' },
  { id: 5, price: '$4,490', tier: 'Reference', vscore: 88, signal: 'Helix Pro MK3', cset: 'Audiofrog GB60 / GB15', frontSub: 'Dayton RSS', camp: 'Zapco ST-4X', subamp: 'DS18 FRP 3.5K', sub: 'Sundown ZV6 15', enclosure: 'IB', size: '15"', count: 'Single', monoWatts: '3,500 W' },
  { id: 6, price: '$6,800', tier: 'Beyond', vscore: 99, signal: 'Helix Pro MK3', cset: 'Audiofrog GB60 / GB15', frontSub: 'Dayton RSS', camp: 'Zapco ST-4X', subamp: 'DS18 FRP 3.5K', sub: 'Adire Maelstrom X 18', enclosure: 'Ported · 4.4 ft³', size: '18"', count: 'Dual', monoWatts: '7,000 W' },
];

/* ------------------------------------------------------------------ controls
   EXACT control sets requested. Size + tier are multi-select chip groups; the
   year selector is a single static surface. */
const SIZES = ['8"', '10"', '12"', '15"', '18"'];
const TIERS = ['entry', 'mid', 'upper-mid', 'reference'];

/* ------------------------------------------------------------------ chip
   active  : bg accentSoft, text accent, border accent, weight 600
   inactive: bg white, text ink2, border lineS, weight 400 */
function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={
        {
          borderRadius: 100,
          borderWidth: 1,
          paddingHorizontal: 14,
          paddingVertical: 6,
          backgroundColor: active ? C.accentSoft : C.white,
          borderColor: active ? C.accent : C.lineS,
        } as any
      }
    >
      <Text
        style={{
          fontFamily: FONT_BODY,
          fontSize: 13.5,
          color: active ? C.accent : C.ink2,
          fontWeight: active ? '600' : '400',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/* facet label (mono, uppercase, tracked) */
function FacetLabel({ children }: { children: string }) {
  return (
    <Text
      style={
        {
          fontFamily: FONT_MONO,
          fontSize: 10.5,
          fontWeight: '500',
          color: C.ink3,
          textTransform: 'uppercase',
          letterSpacing: LS_FACET_LABEL,
          marginBottom: 10,
        } as any
      }
    >
      {children}
    </Text>
  );
}

/* ================================================================ component */
export function PackageTable() {
  // Visual-only filter state (does not actually filter SAMPLE_ROWS — deferred).
  const [year, setYear] = React.useState<string>('');
  const [sizes, setSizes] = React.useState<Record<string, boolean>>({});
  const [tiers, setTiers] = React.useState<Record<string, boolean>>({});

  const toggle =
    (set: React.Dispatch<React.SetStateAction<Record<string, boolean>>>) =>
    (key: string) =>
      set((m) => ({ ...m, [key]: !m[key] }));

  const activeCount =
    Object.values(sizes).filter(Boolean).length +
    Object.values(tiers).filter(Boolean).length +
    (year ? 1 : 0);

  return (
    <View
      style={{
        backgroundColor: C.white,
        flex: 1,
        overflow: 'hidden',
      }}
    >
      {/* ============================ TOP CHROME / FILTER BAR ============= */}
      <View
        style={{
          paddingHorizontal: GX,
          paddingTop: 16,
          paddingBottom: 16,
          borderBottomWidth: 1,
          borderBottomColor: C.line,
          gap: 16,
        }}
      >
        {/* Row 1: Year selector (static surface) + Sort & Filter */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          }}
        >
          {/* Year selector — single static control surface */}
          <Pressable
            onPress={() => setYear((y) => (y ? '' : '2024'))}
            style={
              {
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: C.lineS,
                backgroundColor: C.white,
                paddingHorizontal: 12,
                paddingVertical: 8,
                minWidth: 180,
              } as any
            }
          >
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
            >
              <Text
                style={
                  {
                    fontFamily: FONT_MONO,
                    fontSize: 10.5,
                    fontWeight: '500',
                    color: C.ink3,
                    textTransform: 'uppercase',
                    letterSpacing: 0.07 * 10.5,
                  } as any
                }
              >
                Year
              </Text>
              {year ? (
                <Text
                  style={{
                    fontFamily: FONT_MONO,
                    fontSize: 11,
                    fontWeight: '600',
                    color: C.ink,
                  }}
                >
                  {year}
                </Text>
              ) : null}
            </View>
            <Text style={{ color: C.ink3, fontSize: 11 }}>▾</Text>
          </Pressable>

          {/* Sort & Filter button */}
          <Pressable
            style={
              {
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: C.lineS,
                backgroundColor: C.white,
                paddingHorizontal: 14,
                paddingVertical: 8,
              } as any
            }
          >
            {/* filter glyph (three stacked lines) */}
            <View style={{ width: 14, height: 12, justifyContent: 'space-between' }}>
              <View style={{ height: 2, borderRadius: 1, backgroundColor: C.ink2, width: 14 }} />
              <View style={{ height: 2, borderRadius: 1, backgroundColor: C.ink2, width: 10, alignSelf: 'center' }} />
              <View style={{ height: 2, borderRadius: 1, backgroundColor: C.ink2, width: 5, alignSelf: 'center' }} />
            </View>
            <Text
              style={
                {
                  fontFamily: FONT_MONO,
                  fontSize: 11.5,
                  fontWeight: '500',
                  color: C.ink,
                  textTransform: 'uppercase',
                  letterSpacing: LS_BTN,
                } as any
              }
            >
              Sort &amp; Filter
            </Text>
            {activeCount > 0 ? (
              <View
                style={{
                  minWidth: 16,
                  height: 16,
                  paddingHorizontal: 4,
                  borderRadius: 100,
                  backgroundColor: C.accent,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text
                  style={{
                    fontFamily: FONT_MONO,
                    fontSize: 10,
                    fontWeight: '600',
                    color: C.white,
                  }}
                >
                  {activeCount}
                </Text>
              </View>
            ) : null}
          </Pressable>
        </View>

        {/* Row 2: Sub size chips (8" / 10" / 12" / 15" / 18") */}
        <View style={{ gap: 8 }}>
          <FacetLabel>Sub size</FacetLabel>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {SIZES.map((s) => (
              <Chip
                key={s}
                label={s}
                active={!!sizes[s]}
                onPress={() => toggle(setSizes)(s)}
              />
            ))}
          </View>
        </View>

        {/* Row 3: Tier chips (entry / mid / upper-mid / reference) */}
        <View style={{ gap: 8 }}>
          <FacetLabel>Tier</FacetLabel>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {TIERS.map((t) => (
              <Chip
                key={t}
                label={t}
                active={!!tiers[t]}
                onPress={() => toggle(setTiers)(t)}
              />
            ))}
          </View>
        </View>
      </View>

      {/* ============================ TABLE REGION ======================== */}
      {/* Horizontal scroll for the body; the Price column is rendered sticky
          via a CSS-grid + position:sticky cell (web-only). */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ paddingHorizontal: GX }}
        contentContainerStyle={{ minWidth: TOTAL_W }}
      >
        <View style={{ width: TOTAL_W }}>
          {/* -------- header row -------- */}
          <View
            style={
              {
                display: 'grid',
                gridTemplateColumns: COLS.map((c) => `${c.w}px`).join(' '),
                position: 'sticky',
                top: 0,
                zIndex: 20,
                backgroundColor: C.white,
              } as any
            }
          >
            {COLS.map((c, ci) => (
              <View
                key={c.key}
                style={
                  {
                    height: 38,
                    paddingHorizontal: 14,
                    justifyContent: 'center',
                    borderBottomWidth: 1,
                    borderBottomColor: C.lineS,
                    backgroundColor: C.white,
                    ...(ci === 0
                      ? {
                          position: 'sticky',
                          left: 0,
                          zIndex: 30,
                          boxShadow: `1px 0 0 ${C.divider}`,
                        }
                      : {}),
                  } as any
                }
              >
                <Text
                  style={
                    {
                      fontFamily: FONT_MONO,
                      fontSize: 11,
                      fontWeight: '500',
                      color: C.ink3,
                      textTransform: 'uppercase',
                      letterSpacing: LS_HEADER,
                    } as any
                  }
                  numberOfLines={1}
                >
                  {c.label}
                </Text>
              </View>
            ))}
          </View>

          {/* -------- body rows -------- */}
          {SAMPLE_ROWS.map((r, ri) => {
            const zebra = ri % 2 === 1;
            const rowBg = zebra ? C.zebra : C.white;
            return (
              <View
                key={r.id}
                style={
                  {
                    display: 'grid',
                    gridTemplateColumns: COLS.map((c) => `${c.w}px`).join(' '),
                    minHeight: 52,
                  } as any
                }
              >
                {COLS.map((c, ci) => {
                  const isPrice = ci === 0;
                  const value = (r as unknown as Record<string, unknown>)[
                    c.key
                  ];
                  return (
                    <View
                      key={c.key}
                      style={
                        {
                          minHeight: 52,
                          paddingHorizontal: 14,
                          justifyContent: 'center',
                          borderBottomWidth: 1,
                          borderBottomColor: C.line,
                          backgroundColor: rowBg,
                          ...(isPrice
                            ? {
                                position: 'sticky',
                                left: 0,
                                zIndex: 10,
                                boxShadow: `1px 0 0 ${C.divider}`,
                              }
                            : {}),
                        } as any
                      }
                    >
                      {c.key === 'vscore' ? (
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 8,
                          }}
                        >
                          <Text
                            style={{
                              fontFamily: FONT_MONO,
                              fontSize: 13.5,
                              color: C.ink2,
                            }}
                          >
                            {String(value)}
                          </Text>
                          {/* value-score meter */}
                          <View
                            style={{
                              width: 34,
                              height: 4,
                              borderRadius: 100,
                              backgroundColor: C.line,
                              overflow: 'hidden',
                            }}
                          >
                            <View
                              style={{
                                height: 4,
                                borderRadius: 100,
                                backgroundColor: C.accent,
                                width: `${r.vscore}%`,
                              }}
                            />
                          </View>
                        </View>
                      ) : (
                        <Text
                          style={{
                            fontFamily: isPrice || c.mono ? FONT_MONO : FONT_BODY,
                            fontSize: isPrice ? 14 : 13.5,
                            fontWeight: isPrice ? '600' : '400',
                            color: isPrice ? C.ink : C.ink2,
                          }}
                          numberOfLines={1}
                        >
                          {String(value)}
                        </Text>
                      )}
                    </View>
                  );
                })}
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* ============================ FOOTER NOTE ======================== */}
      <View
        style={{
          paddingHorizontal: GX,
          paddingVertical: 12,
          borderTopWidth: 1,
          borderTopColor: C.line,
          backgroundColor: C.white,
        }}
      >
        <Text
          style={{
            fontFamily: FONT_MONO,
            fontSize: 11,
            color: C.ink3,
          }}
        >
          Showing {SAMPLE_ROWS.length} sample rows — full catalog served from CMS.
        </Text>
      </View>
    </View>
  );
}
