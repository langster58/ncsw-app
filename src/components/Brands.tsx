import React from 'react';
import { View, useWindowDimensions, Platform } from 'react-native';
import { Container, Section, SectionIntro, Image } from '@/ui';

/* ============================================================
   Brands — the equipment logo wall.
   A frameless, evenly-spaced logo strip. Equal-width columns wrap to
   fewer-per-row on tablet and phone; the first logo in every row sits
   flush to the container's left edge and the last flush to its right,
   with the inner logos centered, so the whole band reads edge to edge.
   Logos are shown in their native artwork color (no grayscale, no
   fade) and sized to the room each cell gives them.

   NOTE: heading/body copy here is placeholder pending the Directus
   copy migration (CLAUDE.md §5, engineering step 4). The brand roster
   itself will also move to a collection; for now it is the local SVG
   set under public/images/brands.
   ============================================================ */

const IS_WEB = Platform.OS === 'web';

type Brand = { slug: string; name: string };

// Alphabetized by display name; Polk pinned last per request.
const BRANDS: Brand[] = [
  { slug: 'acoustic-elegance', name: 'Acoustic Elegance' },
  { slug: 'arc-audio', name: 'Arc Audio' },
  { slug: 'audiocontrol', name: 'AudioControl' },
  { slug: 'audiofrog', name: 'Audiofrog' },
  { slug: 'audison', name: 'Audison' },
  { slug: 'blam', name: 'BLAM' },
  { slug: 'brax', name: 'BRAX' },
  { slug: 'ct-soun-ds', name: 'CT Sounds' },
  { slug: 'dc-audio', name: 'DC Audio' },
  { slug: 'down-for-sund', name: 'Down4Sound' },
  { slug: 'ds18', name: 'DS18' },
  { slug: 'dyanaudio', name: 'Dynaudio' },
  { slug: 'fi', name: 'Fi Car Audio' },
  { slug: 'focal', name: 'Focal' },
  { slug: 'fosi-audio', name: 'Fosi Audio' },
  { slug: 'gladen', name: 'Gladen' },
  { slug: 'helix', name: 'Helix' },
  { slug: 'hertz', name: 'Hertz' },
  { slug: 'illusion-audio', name: 'Illusion Audio' },
  { slug: 'jl-audio', name: 'JL Audio' },
  { slug: 'match', name: 'MATCH' },
  { slug: 'morel', name: 'Morel' },
  { slug: 'mosconi', name: 'Mosconi' },
  { slug: 'oneaudio', name: 'One Audio' },
  { slug: 'orion', name: 'Orion' },
  { slug: 'smd', name: 'SMD' },
  { slug: 'stereo-integrity', name: 'Stereo Integrity' },
  { slug: 'aundown', name: 'Sundown Audio' },
  { slug: 'zapco', name: 'Zapco' },
  { slug: 'polk-audio', name: 'Polk Audio' },
];

export function Brands() {
  const { width } = useWindowDimensions();
  // Column count divides the roster evenly so every row stays full and the
  // flush-edge alignment lands cleanly.
  const cols = width >= 1100 ? 10 : width >= 680 ? 6 : 3;
  const cellPct = `${100 / cols}%`;
  const logoMaxHeight = width >= 1100 ? 40 : width >= 680 ? 44 : 46;
  const rowGap = width >= 680 ? 46 : 38;

  return (
    <Section>
      <Container>
        <SectionIntro
          index="07"
          label="Brands"
          heading="The gear we build with"
          body="Subwoofers, amplifiers, front-stage drivers, and processors from the brands we stock and install — the parts every package is solved around."
          paddingBottom={44}
        />

        {/* Frameless logo strip — equal columns, outer logos flush to edges */}
        <View
          style={
            {
              flexDirection: 'row',
              flexWrap: 'wrap',
              ...(IS_WEB ? { rowGap } : {}),
            } as any
          }
        >
          {BRANDS.map((b, i) => {
            const col = i % cols;
            const align =
              col === 0 ? 'flex-start' : col === cols - 1 ? 'flex-end' : 'center';
            return (
              <View
                key={b.slug}
                style={
                  {
                    width: cellPct,
                    minHeight: logoMaxHeight + 16,
                    justifyContent: 'center',
                    alignItems: align,
                    ...(IS_WEB ? {} : { marginBottom: rowGap }),
                  } as any
                }
              >
                <Image
                  src={`/images/brands/${b.slug}.svg`}
                  alt={b.name}
                  objectFit="contain"
                  style={
                    IS_WEB
                      ? {
                          maxHeight: logoMaxHeight,
                          maxWidth: '100%',
                          width: 'auto',
                          height: 'auto',
                        }
                      : { width: '100%', height: logoMaxHeight }
                  }
                />
              </View>
            );
          })}
        </View>
      </Container>
    </Section>
  );
}
