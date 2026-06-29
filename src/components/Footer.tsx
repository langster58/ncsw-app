import React from 'react';
import { View, Text, Pressable, useWindowDimensions, Platform } from 'react-native';

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

export function Footer() {
  const { width } = useWindowDimensions();

  // CSS breakpoints: <=1100 -> 2 cols, <=640 -> 1 col, else 2fr 1fr 1fr 1fr
  let gridTemplateColumns = '2fr 1fr 1fr 1fr';
  let gridGap = 32;
  if (width <= 640) {
    gridTemplateColumns = '1fr';
    gridGap = 28;
  } else if (width <= 1100) {
    gridTemplateColumns = '1fr 1fr';
    gridGap = 28;
  }

  return (
    <View
      style={
        {
          backgroundColor: INK,
          marginTop: width <= 1100 ? 64 : 96,
        } as any
      }
    >
      <View
        style={
          {
            maxWidth: 1410,
            marginLeft: 'auto',
            marginRight: 'auto',
            width: '100%',
            paddingTop: 64,
            paddingBottom: 40,
            paddingLeft: 40,
            paddingRight: 40,
          } as any
        }
      >
        {/* footer-top */}
        <View
          style={
            {
              display: 'grid',
              gridTemplateColumns,
              gap: gridGap,
            } as any
          }
        >
          {/* footer-brand */}
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
                maxWidth: '66.6%',
              }}
            >
              {BRAND_COPY}
            </Text>
          </View>

          {/* footer-col x3 */}
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

        {/* footer-bot */}
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
    </View>
  );
}
