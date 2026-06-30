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

// Footer's horizontal gutter comes entirely from <Container> — the same
// primitive every other section (Packages, Editorial, etc.) uses. No
// hand-rolled padX/useFluidPx here; that duplication is what caused the
// footer's gutter to drift out of sync with the rest of the page.
export function Footer() {
  const { width } = useWindowDimensions();
  const stacked = width <= 1100;
  const navCols = width <= 640 ? '1fr' : 'repeat(3, minmax(0, 1fr))';

  return (
    <View
      style={
        {
          backgroundColor: INK,
          marginTop: stacked ? 64 : 96,
        } as any
      }
    >
      <Container>
        <View style={{ paddingTop: 64, paddingBottom: 40 } as any}>
          {/* footer-top: brand block (flush left) + 3-column nav block
              (flush right), both inside Container's gutter. */}
          <View
            style={
              (stacked
                ? { flexDirection: 'column', gap: 48 }
                : {
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 96,
                  }) as any
            }
          >
            <View style={stacked ? undefined : ({ flexShrink: 1, maxWidth: 460 } as any)}>
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
                }}
              >
                {BRAND_COPY}
              </Text>
            </View>

            <View
              style={
                {
                  display: 'grid',
                  gridTemplateColumns: navCols,
                  columnGap: 56,
                  rowGap: 32,
                  ...(stacked ? null : { flexShrink: 0 }),
                } as any
              }
            >
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
          </View>

          {/* footer-bot — same Container gutter, no separate padding needed */}
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
