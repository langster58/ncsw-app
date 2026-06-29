import React from 'react';
import {
  View,
  Text,
  Pressable,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { Container, Heading, Lead, Opener, Section } from '@/ui';

/* ============================================================
   Collections — "Sub-stage / collections" section
   Ported faithfully from Collections.jsx + home.css/tokens.css.
   Tokens (literal values):
     ink   #09080e (--fg-1)        gray   #333333 (--fg-2)
     line  #ececec (--ncsw-line)   shape  #f5f5f5 (--ncsw-shape)
     white #ffffff                 accent #0576cc (--accent)
     radius-lg 16
   ============================================================ */

const INK = '#09080e';
const GRAY = '#333333';
const LINE = '#ececec';
const SHAPE = '#f5f5f5';
const ACCENT = '#0576cc';
const FONT_BODY = 'Inter';
const FONT_MONO = 'IBM Plex Mono';
const FONT_DISPLAY = 'Creato Display';

const IS_WEB = Platform.OS === 'web';

type CollectionCard = {
  tag: string;
  img: string;
  title: string;
  desc: string;
  meta: [string, string][];
};

const COLLECTIONS: CollectionCard[] = [
  {
    tag: 'SUV · hatch · wagon',
    img: '/images/pattern-reference.png',
    title: 'Cargo Infinite Baffle',
    desc: 'The driver mounts to a baffle in the cargo floor and fires through it, using the space behind the seats as a free-air enclosure. No box to build, and the most cone area the vehicle can give.',
    meta: [
      ['Enclosure', 'Free-air'],
      ['Best for', 'SUV · Hatch'],
    ],
  },
  {
    tag: 'SUV · hatch · wagon',
    img: '/images/pattern-floor.png',
    title: 'Cargo Fabricated Sealed',
    desc: "A sealed enclosure fabricated to the cargo bay's exact dimensions and solved for the specific driver. Tight, predictable output that survives a daily-driven load floor.",
    meta: [
      ['Enclosure', 'Fabricated sealed'],
      ['Best for', 'SUV · Hatch'],
    ],
  },
  {
    tag: 'Sedan · coupe',
    img: '/images/pattern-frontstage.png',
    title: 'Trunk Infinite Baffle',
    desc: 'The driver mounts to the rear deck and fires into the cabin, with the trunk acting as the enclosure. A clean, hidden low end that uses no trunk floor space.',
    meta: [
      ['Enclosure', 'Free-air'],
      ['Best for', 'Sedan · Coupe'],
    ],
  },
];

/* Inline arrow glyph mirroring IconArrow s={15}. */
function IconArrow() {
  if (IS_WEB) {
    return React.createElement(
      'svg',
      {
        width: 15,
        height: 15,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 2,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true,
      },
      React.createElement('line', { x1: 5, y1: 12, x2: 19, y2: 12 }),
      React.createElement('polyline', { points: '12 5 19 12 12 19' })
    );
  }
  return <Text style={{ color: INK, fontSize: 15, lineHeight: 15 }}>{'→'}</Text>;
}

function CardImage({ src, alt }: { src: string; alt: string }) {
  if (IS_WEB) {
    return React.createElement('img', {
      src,
      alt,
      style: {
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        display: 'block',
      },
    });
  }
  // Native fallback: a neutral shape fill (web paths aren't bundled natively).
  return <View style={{ width: '100%', height: '100%', backgroundColor: SHAPE }} />;
}

export function Collections() {
  const { width } = useWindowDimensions();
  const isMobile = width < 760; // home.css collapses .coll-grid to 1fr at narrow widths
  const gutter = 32; // --ncsw-grid-gutter clamp(20px, 1.7vw, 32px)

  return (
    <Section>
      <Container>
        <Opener index="04" label="Sub-stage" doorLabel="All alignments" />
        <View style={{ marginBottom: gutter, gap: 16 }}>
          <Heading level="h2sm">Sub-stage fabrication &amp; alignment</Heading>
          <Lead>
            The sub-stage is defined as much by where the driver lives as by the
            driver itself. Most vehicles resolve to one of a few alignments, each a
            different trade between output, space, and how the enclosure is built.
            These are the three we fabricate most; the full breakdown lives on the
            enclosure methodology page.
          </Lead>
        </View>

        {/* CardGrid .coll-grid — repeat(3, minmax(0,1fr)) gap gutter */}
        <View
          style={
            {
              ...(IS_WEB
                ? {
                    display: 'grid',
                    gridTemplateColumns: isMobile
                      ? '1fr'
                      : 'repeat(3, minmax(0, 1fr))',
                    gap: `${gutter}px`,
                  }
                : {
                    flexDirection: 'column',
                    rowGap: gutter,
                  }),
            } as any
          }
        >
          {COLLECTIONS.map((c) => (
            <View
              key={c.title}
              style={{
                borderWidth: 1,
                borderColor: LINE,
                borderRadius: 16, // --radius-lg
                overflow: 'hidden',
                backgroundColor: '#ffffff',
                flex: 1,
              }}
            >
              {/* .coll-img — aspect-ratio 16/11, tag overlay */}
              <View
                style={{
                  aspectRatio: 16 / 11,
                  overflow: 'hidden',
                  backgroundColor: SHAPE,
                  position: 'relative',
                }}
              >
                <View
                  style={
                    {
                      position: 'absolute',
                      top: 14,
                      left: 14,
                      zIndex: 2,
                      backgroundColor: 'rgba(0,0,0,.55)',
                      paddingVertical: 5,
                      paddingHorizontal: 9,
                      borderRadius: 5,
                      ...(IS_WEB ? { backdropFilter: 'blur(4px)' } : {}),
                    } as any
                  }
                >
                  <Text
                    style={{
                      fontFamily: FONT_BODY,
                      textTransform: 'uppercase',
                      letterSpacing: 1.2, // .12em * 10
                      fontSize: 10,
                      fontWeight: '600',
                      color: '#ffffff',
                    }}
                  >
                    {c.tag}
                  </Text>
                </View>
                <CardImage src={c.img} alt={c.title} />
              </View>

              {/* .coll-body */}
              <View
                style={{
                  paddingTop: 22,
                  paddingHorizontal: 22,
                  paddingBottom: 24,
                  flex: 1,
                }}
              >
                <Text
                  style={{
                    fontFamily: FONT_BODY,
                    fontSize: 24,
                    fontWeight: '600',
                    letterSpacing: -0.48, // -.02em * 24
                    lineHeight: 24 * 1.12,
                    color: INK,
                  }}
                >
                  {c.title}
                </Text>
                <Text
                  style={{
                    fontFamily: FONT_BODY,
                    color: GRAY,
                    fontSize: 15,
                    lineHeight: 15 * 1.5,
                    marginTop: 11,
                    marginBottom: 16,
                  }}
                >
                  {c.desc}
                </Text>

                {/* .coll-meta — margin-top:auto pins to bottom; top border */}
                <View
                  style={{
                    flexDirection: 'row',
                    marginTop: 'auto',
                    paddingTop: 16,
                    borderTopWidth: 1,
                    borderTopColor: '#f0f0f0',
                  }}
                >
                  {c.meta.map(([k, v], i) => (
                    <View key={k} style={{ marginRight: i === 0 ? 22 : 0 }}>
                      <Text
                        style={{
                          fontFamily: FONT_BODY,
                          textTransform: 'uppercase',
                          letterSpacing: 1.08, // .12em * 9
                          fontWeight: '600',
                          fontSize: 9,
                          color: GRAY,
                        }}
                      >
                        {k}
                      </Text>
                      <Text
                        style={{
                          fontFamily: FONT_MONO,
                          fontSize: 17,
                          fontWeight: '500',
                          letterSpacing: 0,
                          marginTop: 3,
                          color: INK,
                        }}
                      >
                        {v}
                      </Text>
                    </View>
                  ))}
                </View>

                {/* .coll-door */}
                <View style={{ paddingTop: 18 }}>
                  <Pressable
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      borderBottomWidth: 1,
                      borderBottomColor: 'transparent',
                      paddingBottom: 3,
                      alignSelf: 'flex-start',
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: FONT_BODY,
                        textTransform: 'uppercase',
                        letterSpacing: 1.32, // .12em * 11
                        fontSize: 11,
                        fontWeight: '600',
                        color: INK,
                        marginRight: 9,
                      }}
                    >
                      See the alignment
                    </Text>
                    <IconArrow />
                  </Pressable>
                </View>
              </View>
            </View>
          ))}
        </View>
      </Container>
    </Section>
  );
}
