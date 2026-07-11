import React, { useState } from 'react';
import { View, Platform } from 'react-native';
import {
  Container,
  Section,
  SectionIntro,
  Image,
  colors,
} from '@/ui';

/* ============================================================
   Brands — the equipment logo wall.
   Built in the site's hairline-cell-grid language (the same system
   as .featured-specs and the packages table): white cells divided by
   1px --ncsw-line seams, wrapped in a rounded hairline frame. The
   grid is `auto-fit, minmax(...)` so it scales down and wraps to two
   columns on phones with no breakpoints. Logos sit muted + grayscale
   by default and resolve to full weight on hover, so 29 different
   wordmarks read as one calm system instead of a ransom note.

   NOTE: heading/body copy here is placeholder pending the Directus
   copy migration (CLAUDE.md §5, engineering step 4). The brand roster
   itself will also move to a collection; for now it is the local SVG
   set under public/images/brands.
   ============================================================ */

const IS_WEB = Platform.OS === 'web';

type Brand = { slug: string; name: string };

// Alphabetized by display name for a deliberate, scannable order.
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

function BrandCell({ brand }: { brand: Brand }) {
  const [hovered, setHovered] = useState(false);
  const hoverProps: any = IS_WEB
    ? { onMouseEnter: () => setHovered(true), onMouseLeave: () => setHovered(false) }
    : {};

  return (
    <View
      {...hoverProps}
      style={
        {
          backgroundColor: hovered ? '#fbfbfb' : colors.white,
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: 26,
          paddingHorizontal: 20,
          minHeight: 108,
          ...(IS_WEB
            ? { transition: 'background-color .3s ease' }
            : {
                // native seam: draw the hairline as a right/bottom border
                width: '50%',
                borderColor: colors.line,
                borderRightWidth: 1,
                borderBottomWidth: 1,
              }),
        } as any
      }
    >
      <Image
        src={`/images/brands/${brand.slug}.svg`}
        alt={brand.name}
        objectFit="contain"
        style={
          IS_WEB
            ? {
                maxHeight: 30,
                maxWidth: '72%',
                width: 'auto',
                height: 'auto',
                opacity: hovered ? 1 : 0.55,
                filter: hovered ? 'grayscale(0)' : 'grayscale(1)',
                transition: 'opacity .3s ease, filter .3s ease',
              }
            : { width: 108, height: 30, opacity: 0.7 }
        }
      />
    </View>
  );
}

export function Brands() {
  return (
    <Section>
      <Container>
        <SectionIntro
          index="07"
          label="Brands"
          heading="The gear we build with"
          body="Subwoofers, amplifiers, front-stage drivers, and processors from the brands we stock and install — the parts every package is solved around."
          paddingBottom={40}
        />

        {/* .brand-grid — hairline cell wall, auto-fit so it wraps on phones */}
        <View
          style={
            {
              borderWidth: 1,
              borderColor: colors.line,
              borderRadius: 16, // --radius-lg
              overflow: 'hidden',
              backgroundColor: colors.line,
              ...(IS_WEB
                ? {
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(158px, 1fr))',
                    gap: 1,
                  }
                : { flexDirection: 'row', flexWrap: 'wrap' }),
            } as any
          }
        >
          {BRANDS.map((b) => (
            <BrandCell key={b.slug} brand={b} />
          ))}
        </View>
      </Container>
    </Section>
  );
}
