import React from 'react';
import { View, Text, Pressable, useWindowDimensions, Platform } from 'react-native';
import { Container } from '@/ui';

const INK = '#09080e';
const FONT_BODY = 'Inter';
const FONT_MONO = 'IBM Plex Mono';

type Col = { h: string; links: string[] };

const COLS: Col[] = [
  { h: 'Systems', links: ['Packages', 'Subwoofers', 'Front stages', 'Amplifiers', 'DSP & tuning'] },
  { h: 'Read', links: ['Editorial', 'Build logs', 'Reviews', 'The value frontier'] },
  { h: 'Shop', links: ['About', 'Cleveland, OH', 'Schedule install', 'Call (216) 555-0114'] },
];

const BRAND_COPY =
  "Cleveland's MECP-certified car-audio installation specialist. Factory-integrated systems, engineered for one vehicle and priced installed.";

function FooterLink({ label }: { label: string }) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <Pressable
      onPress={() => {}}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={{ paddingVertical: 6 } as any}
    >
      <Text
        style={
          {
            display: 'block',
            color: hovered ? '#ffffff' : 'rgba(255,255,255,0.82)',
            fontFamily: FONT_BODY,
            fontSize: 14,
            transition: 'color .2s ease-in-out',
          } as any
        }
      >
        {label}
      </Text>
    </Pressable>
  );
}

// Footer-top structure ported from the reference site's .footer-top:
//   display:grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 32px
// ONE grid, four tracks — brand (2fr) and the three nav columns (1fr each)
// are siblings in the same grid, not a flex row with a nested grid. That
// match is what makes the brand column's left edge align with everything
// else automatically — no special-casing needed.
//
// Horizontal gutter comes from <Container> (our fluid clamp(), no
// max-width) — same primitive every other section uses. Column-count
// breakpoints below mirror the reference's structural collapse
// (4 -> 2 -> 1 columns), not its fixed pixel gutter.
export function Footer() {
  const { width } = useWindowDimensions();
  const narrow = width <= 900;
  const stacked = width <= 560;

  const topCols = stacked ? '1fr' : narrow ? '1fr 1fr' : '2fr 1fr 1fr 1fr';
  const topGap = narrow ? 28 : 32;

  return (
    <View
      style={
        {
          backgroundColor: INK,
          marginTop: narrow ? 64 : 96,
        } as any
      }
    >
      <Container>
        <View style={{ paddingTop: 64, paddingBottom: 40 } as any}>
          {/* footer-top — one grid, brand + 3 nav columns as siblings */}
          <View
            style={
              {
                display: 'grid',
                gridTemplateColumns: topCols,
                gap: topGap,
              } as any
            }
          >
            <View>
              {Platform.OS === 'web' ? (
                React.createElement('img', {
                  src: '/brand/NCSW-wordmark.svg',
                  alt: 'North Coast Soundworks',
                  style: {
                    height: 26,
                    width: 'auto',
                    filter: 'brightness(0) invert(1)',
                  },
                })
              ) : (
                <Text
                  style={{
                    color: '#ffffff',
                    fontFamily: 'Creato Display',
                    fontSize: 22,
                    fontWeight: '800',
                    letterSpacing: 1,
                  }}
                >
                  NCSW
                </Text>
              )}
              <Text
                style={{
                  color: 'rgba(255,255,255,0.55)',
                  fontFamily: FONT_BODY,
                  fontSize: 14,
                  lineHeight: 14 * 1.6,
                  marginTop: 22,
                  maxWidth: 320,
                }}
              >
                {BRAND_COPY}
              </Text>
            </View>

            {COLS.map((c) => (
              <View key={c.h}>
                <Text
                  style={
                    {
                      fontFamily: FONT_BODY,
                      textTransform: 'uppercase',
                      letterSpacing: 0.12 * 11,
                      fontSize: 11,
                      fontWeight: '600',
                      color: 'rgba(255,255,255,0.5)',
                      marginBottom: 18,
                    } as any
                  }
                >
                  {c.h}
                </Text>
                {c.links.map((l) => (
                  <FooterLink key={l} label={l} />
                ))}
              </View>
            ))}
          </View>

          {/* footer-bot — same Container gutter as footer-top */}
          <View
            style={
              {
                display: 'flex',
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 16,
                marginTop: 56,
                paddingTop: 26,
                borderTopWidth: 1,
                borderTopColor: 'rgba(255,255,255,0.14)',
                flexWrap: 'wrap',
              } as any
            }
          >
            <Text
              style={{
                fontFamily: FONT_MONO,
                fontVariantNumeric: 'tabular-nums',
                fontSize: 11,
                letterSpacing: 0.04 * 11,
                color: 'rgba(255,255,255,0.45)',
              } as any}
            >
              © 2026 North Coast Soundworks
            </Text>
            <Text
              style={
                {
                  fontFamily: FONT_BODY,
                  textTransform: 'uppercase',
                  letterSpacing: 0.12 * 11,
                  fontWeight: '600',
                  fontSize: 11,
                  color: 'rgba(255,255,255,0.6)',
                } as any
              }
            >
              MECP Certified · Cleveland OH · Pre-engineered · Installed · Tuned
            </Text>
          </View>
        </View>
      </Container>
    </View>
  );
}
