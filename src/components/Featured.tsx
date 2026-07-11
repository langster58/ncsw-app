import React from 'react';
import { View, Text, useWindowDimensions, Platform } from 'react-native';
import {
  Container,
  Section,
  SectionIntro,
  Link,
  IconArrow,
  Image,
  colors,
  fonts,
  type,
  tracking,
  useFluidPx,
  fluidLineHeight,
} from '@/ui';

/* ============================================================
   Featured — the "Build log" feature band.
   Ported faithfully from Collections.jsx `Featured()` + home.css
   (.featured / .featured-grid / .featured-media / .featured-info /
   .featured-specs). A two-panel band: build photo on the left, the
   build's own headline + spec grid on the right. The section opens
   with the bare eyebrow band (no section heading) because the
   headline lives inside the info panel.
   ============================================================ */

const IS_WEB = Platform.OS === 'web';

const SPECS: [string, string][] = [
  ['Subwoofer', 'Adire Kali 18 · infinite baffle'],
  ['Front stage', 'Audiofrog GB60 · GB15 · GS8ND2'],
  ['Signal', 'Helix M6 DSP'],
  ['Mono amp', 'DS18 FRP 3.5K'],
];

export function Featured() {
  const { width } = useWindowDimensions();
  const isStacked = width < 900; // .featured-grid collapses to 1fr under ~900

  const vehSize = useFluidPx(type.meta);
  const headSize = useFluidPx(type.h3);
  const headLine = fluidLineHeight(headSize, 1.04);
  const blurbSize = useFluidPx(type.body);
  const blurbLine = fluidLineHeight(blurbSize, 1.6);
  const specLabelSize = useFluidPx(type.meta);
  const specValueSize = 14; // .featured-specs .sp .v — fixed 14px mono

  return (
    <Section>
      <Container>
        <SectionIntro
          index="05"
          label="Build log"
          actionLabel="All build logs"
          actionHref="#"
          paddingBottom={28}
        />

        {/* .featured-grid — 1.25fr / 1fr, hairline frame, no inner gap */}
        <View
          style={
            {
              borderWidth: 1,
              borderColor: colors.line,
              borderRadius: 16, // --radius-lg
              overflow: 'hidden',
              backgroundColor: colors.white,
              ...(IS_WEB && !isStacked
                ? {
                    display: 'grid',
                    gridTemplateColumns: '1.25fr 1fr',
                  }
                : { flexDirection: 'column' }),
            } as any
          }
        >
          {/* .featured-media — build photo + stamp + top gradient overlay */}
          <View
            style={{
              position: 'relative',
              backgroundColor: colors.surface,
              overflow: 'hidden',
              minHeight: isStacked ? 300 : 460,
            }}
          >
            {/* .stamp — live-in-the-bay pill */}
            <View
              style={
                {
                  position: 'absolute',
                  left: 18,
                  top: 18,
                  zIndex: 2,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 9,
                  backgroundColor: 'rgba(0,0,0,.5)',
                  paddingVertical: 7,
                  paddingHorizontal: 12,
                  borderRadius: 100, // --radius-pill
                  ...(IS_WEB ? { backdropFilter: 'blur(6px)' } : {}),
                } as any
              }
            >
              <View
                style={
                  {
                    width: 7,
                    height: 7,
                    borderRadius: 50,
                    backgroundColor: '#ff5a4d',
                    ...(IS_WEB
                      ? { boxShadow: '0 0 0 4px rgba(255,90,77,.18)' }
                      : {}),
                  } as any
                }
              />
              <Text
                style={
                  {
                    fontFamily: fonts.body,
                    textTransform: 'uppercase',
                    letterSpacing: 1.2, // .12em
                    fontWeight: '600',
                    fontSize: 10,
                    color: 'rgba(255,255,255,.85)',
                  } as any
                }
              >
                In the bay · 2018 Golf Alltrack
              </Text>
            </View>

            <Image
              src="/images/build-golf-alltrack.jpg"
              alt="2018 Volkswagen Golf Alltrack, infinite-baffle build in the bay"
              fill
              objectFit="cover"
              style={IS_WEB ? { filter: 'grayscale(.2) contrast(1.02)' } : undefined}
            />

            {/* .ovl — soft top gradient so the stamp always reads */}
            {IS_WEB ? (
              <View
                style={
                  {
                    position: 'absolute',
                    inset: 0,
                    background:
                      'linear-gradient(to top, rgba(0,0,0,.28), rgba(0,0,0,0) 30%)',
                    pointerEvents: 'none',
                  } as any
                }
              />
            ) : null}
          </View>

          {/* .featured-info */}
          <View
            style={{
              paddingVertical: 40,
              paddingHorizontal: 38,
              flex: 1,
              justifyContent: 'center',
            }}
          >
            <Text
              style={
                {
                  fontFamily: fonts.body,
                  textTransform: 'uppercase',
                  letterSpacing: 1.32, // .12em
                  fontWeight: '600',
                  fontSize: vehSize,
                  color: colors.gray,
                } as any
              }
            >
              2018 VW Golf Alltrack · Infinite-baffle build
            </Text>

            <Text
              style={
                {
                  fontFamily: fonts.body,
                  color: colors.ink,
                  fontSize: headSize,
                  fontWeight: '600',
                  letterSpacing: -headSize * 0.025,
                  lineHeight: headLine,
                  marginTop: 12,
                  ...(IS_WEB ? { textWrap: 'balance' } : {}),
                } as any
              }
            >
              Reference-tier bass that keeps the cargo floor flat.
            </Text>

            <Text
              style={
                {
                  fontFamily: fonts.body,
                  color: colors.body,
                  fontSize: blurbSize,
                  lineHeight: blurbLine,
                  marginTop: 18,
                  maxWidth: 460,
                  ...(IS_WEB ? { textWrap: 'pretty' } : {}),
                } as any
              }
            >
              No enclosure — a single Adire Kali 18 is mounted infinite-baffle,
              using the cargo area as its back chamber for effortless,
              low-distortion extension. A Helix M6 DSP corrects and crosses an
              Audiofrog GB60 / GB15 / GS8ND2 front stage; a DS18 FRP 3.5K mono
              amp hands the Kali every watt it asks for.
            </Text>

            {/* .featured-specs — 2x2 hairline cell grid */}
            <View
              style={
                {
                  marginTop: 28,
                  borderWidth: 1,
                  borderColor: colors.line,
                  backgroundColor: colors.line,
                  ...(IS_WEB
                    ? {
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: 1,
                      }
                    : { flexDirection: 'row', flexWrap: 'wrap' }),
                } as any
              }
            >
              {SPECS.map(([k, v], i) => (
                <View
                  key={k}
                  style={
                    {
                      backgroundColor: colors.white,
                      paddingVertical: 15,
                      paddingHorizontal: 18,
                      ...(IS_WEB
                        ? {}
                        : {
                            width: '50%',
                            borderRightWidth: i % 2 === 0 ? 1 : 0,
                            borderTopWidth: i > 1 ? 1 : 0,
                            borderColor: colors.line,
                          }),
                    } as any
                  }
                >
                  <Text
                    style={
                      {
                        fontFamily: fonts.body,
                        textTransform: 'uppercase',
                        letterSpacing: 1.08, // .12em
                        fontWeight: '600',
                        fontSize: specLabelSize,
                        color: colors.gray,
                      } as any
                    }
                  >
                    {k}
                  </Text>
                  <Text
                    style={
                      {
                        fontFamily: fonts.mono,
                        fontSize: specValueSize,
                        fontWeight: '500',
                        marginTop: 5,
                        color: colors.ink,
                        ...(IS_WEB ? { fontVariantNumeric: 'tabular-nums' } : {}),
                      } as any
                    }
                  >
                    {v}
                  </Text>
                </View>
              ))}
            </View>

            {/* .door — read the full build log */}
            <View style={{ marginTop: 32, alignSelf: 'flex-start' }}>
              <Link variant="door" href="#" icon={<IconArrow size={15} />}>
                Read the full build log
              </Link>
            </View>
          </View>
        </View>
      </Container>
    </Section>
  );
}
