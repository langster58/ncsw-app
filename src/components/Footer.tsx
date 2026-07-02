import React from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { Container, Section, colors, fluid, fluidLineHeight, lineHeight, type, useFluidPx } from '@/ui';

const INK = colors.ink;
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

// footer-top: brand block (sized to its own content) on one side, the
// three link columns grouped tightly together on the other. The empty
// space between them is exactly what justify-content: space-between
// fills — not a grid track's leftover width. Real CSS media queries
// (no JS width check) handle the narrow collapse.
const FOOTER_TOP_CSS = `
.ncsw-footer-top { display:flex; flex-direction:row; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:48px; }
.ncsw-footer-navcols { display:flex; flex-direction:row; gap:56px; }
@media (max-width: 900px) {
  .ncsw-footer-top { flex-direction:column; gap:28px; }
}
@media (max-width: 560px) {
  .ncsw-footer-navcols { flex-direction:column; gap:24px; }
}
`;

function FooterLink({ label }: { label: string }) {
  const [hovered, setHovered] = React.useState(false);
  const fontSize = useFluidPx(type.small);
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
            color: hovered ? colors.white : 'rgba(255,255,255,0.82)',
            fontFamily: FONT_BODY,
            fontSize,
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
  const nativeMarkSize = useFluidPx(type.heroLead);
  const copySize = useFluidPx(type.small);
  const copyLineHeight = fluidLineHeight(copySize, lineHeight.body);
  const copyMaxWidth = useFluidPx(fluid(320, 220));
  return (
    <View
      style={
        {
          alignItems: 'flex-start',
          justifySelf: 'start',
          width: 'fit-content',
        } as any
      }
    >
      {Platform.OS === 'web' ? (
        React.createElement('img', {
          src: '/brand/NCSW-wordmark.svg',
          alt: 'North Coast Soundworks',
          style: {
            height: 26,
            width: 'auto',
            filter: 'brightness(0) invert(1)',
            display: 'block',
            marginLeft: 0,
            alignSelf: 'flex-start',
          },
        })
      ) : (
        <Text
          style={
            {
              color: colors.white,
              fontFamily: 'Creato Display',
              fontSize: nativeMarkSize,
              fontWeight: '800',
              letterSpacing: 1,
            } as any
          }
        >
          NCSW
        </Text>
      )}
      <Text
        style={
          {
            color: 'rgba(255,255,255,0.55)',
            fontFamily: FONT_BODY,
            fontSize: copySize,
            lineHeight: copyLineHeight,
            marginTop: 22,
            maxWidth: copyMaxWidth,
          } as any
        }
      >
        {BRAND_COPY}
      </Text>
    </View>
  );
}

// The tight cluster of three link columns. Web: rendered as one flex row
// (.ncsw-footer-navcols) so they group together with a reasonable, fixed
// gap, independent of however much space is left after the brand block.
function NavColumns() {
  const headingSize = useFluidPx(type.meta);
  const cols = COLS.map((c) => (
    <View key={c.h}>
      <Text
        style={
          {
            fontFamily: FONT_BODY,
            textTransform: 'uppercase',
            letterSpacing: 0.12 * 11,
            fontSize: headingSize,
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
  ));

  if (Platform.OS === 'web') {
    return React.createElement('div', { className: 'ncsw-footer-navcols' }, <>{cols}</>);
  }
  return <View style={{ flexDirection: 'row', gap: 32 }}>{cols}</View>;
}

// Footer — built exactly as: Section (vertical rhythm + the dark
// background) > Container (the same horizontal gutter as every other
// section) > contents.
export function Footer() {
  const metaSize = useFluidPx(type.meta);
  return (
    <Section style={{ backgroundColor: INK } as any}>
      {Platform.OS === 'web'
        ? React.createElement('style', { dangerouslySetInnerHTML: { __html: FOOTER_TOP_CSS } })
        : null}
      <Container>
        <View style={{ paddingBottom: 40 } as any}>
          {Platform.OS === 'web' ? (
            React.createElement(
              'div',
              { className: 'ncsw-footer-top' },
              <>
                <BrandBlock />
                <NavColumns />
              </>,
            )
          ) : (
            <View style={{ gap: 32 } as any}>
              <BrandBlock />
              <NavColumns />
            </View>
          )}

          <View
            style={
              {
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
                  fontSize: metaSize,
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
                  fontSize: metaSize,
                  color: 'rgba(255,255,255,0.6)',
                } as any
              }
            >
              MECP Certified · Cleveland OH · Pre-engineered · Installed · Tuned
            </Text>
          </View>
        </View>
      </Container>
    </Section>
  );
}
