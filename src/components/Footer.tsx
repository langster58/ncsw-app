import React from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
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

// Verbatim from the reference site's home.css (.footer + .footer-top and
// their two @media breakpoints). Real CSS media queries decide the column
// count and the footer's top margin — NOT a JS useWindowDimensions() check.
// A JS-computed width can be wrong on first paint of a static export (the
// page is pre-rendered before the real viewport width is known) and stay
// wrong if the correction doesn't reliably re-run. CSS media queries are
// resolved by the browser itself, instantly, with nothing to get stuck.
const FOOTER_CSS = `
.ncsw-footer { margin-top: 96px; }
.ncsw-footer-top { display:grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 32px; }
@media (max-width: 900px) {
  .ncsw-footer { margin-top: 64px; }
  .ncsw-footer-top { grid-template-columns: 1fr 1fr; gap: 28px; }
}
@media (max-width: 560px) {
  .ncsw-footer-top { grid-template-columns: 1fr; }
}
`;

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

function BrandBlock() {
  return (
    <View>
      {Platform.OS === 'web' ? (
        React.createElement('img', {
          src: '/brand/NCSW-wordmark.svg',
          alt: 'North Coast Soundworks',
          style: { height: 26, width: 'auto', filter: 'brightness(0) invert(1)' },
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
  );
}

function NavColumns() {
  return (
    <>
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
    </>
  );
}

export function Footer() {
  return (
    <View style={{ backgroundColor: INK } as any}>
      {Platform.OS === 'web'
        ? React.createElement('style', { dangerouslySetInnerHTML: { __html: FOOTER_CSS } })
        : null}

      {Platform.OS === 'web' ? (
        React.createElement(
          'div',
          { className: 'ncsw-footer' },
          <Container>
            <View style={{ paddingTop: 64, paddingBottom: 40 } as any}>
              {React.createElement(
                'div',
                { className: 'ncsw-footer-top' },
                <>
                  <BrandBlock />
                  <NavColumns />
                </>,
              )}

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
                  style={
                    {
                      fontFamily: FONT_MONO,
                      fontVariantNumeric: 'tabular-nums',
                      fontSize: 11,
                      letterSpacing: 0.04 * 11,
                      color: 'rgba(255,255,255,0.45)',
                    } as any
                  }
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
          </Container>,
        )
      ) : (
        // Native fallback: single column, no media-query behavior needed.
        <View style={{ marginTop: 64 } as any}>
          <Container>
            <View style={{ paddingTop: 64, paddingBottom: 40, gap: 32 } as any}>
              <BrandBlock />
              <NavColumns />
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 16,
                  marginTop: 24,
                  paddingTop: 26,
                  borderTopWidth: 1,
                  borderTopColor: 'rgba(255,255,255,0.14)',
                  flexWrap: 'wrap',
                }}
              >
                <Text
                  style={
                    {
                      fontFamily: FONT_MONO,
                      fontVariantNumeric: 'tabular-nums',
                      fontSize: 11,
                      letterSpacing: 0.04 * 11,
                      color: 'rgba(255,255,255,0.45)',
                    } as any
                  }
                >
                  © 2026 North Coast Soundworks
                </Text>
                <Text
                  style={{
                    fontFamily: FONT_BODY,
                    textTransform: 'uppercase',
                    letterSpacing: 0.12 * 11,
                    fontWeight: '600',
                    fontSize: 11,
                    color: 'rgba(255,255,255,0.6)',
                  }}
                >
                  MECP Certified · Cleveland OH · Pre-engineered · Installed · Tuned
                </Text>
              </View>
            </View>
          </Container>
        </View>
      )}
    </View>
  );
}
