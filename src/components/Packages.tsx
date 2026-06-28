// NCSW homepage — Section "01 / Our packages" intro/opener.
// Faithful web-target port of the homepage Packages section INTRO only
// (the opener band + HowItWorksIntro heading + lede). The build-planner PLP
// table is intentionally NOT built here — per the source comment it lives on a
// separate planner page. Copy is taken verbatim from the source JSX; in a real
// build this copy would come from Directus, but it is hardcoded here to match
// the reference faithfully.

import { Text, View, useWindowDimensions } from 'react-native';

// Resolved design tokens (RN cannot read CSS vars).
const INK = '#09080e'; // --ncsw-ink / --fg-1
const GRAY = '#656565'; // --ncsw-gray / --fg-2
const FONT_DISPLAY = 'Creato Display';
const FONT_BODY = 'Inter';
const FONT_MONO = 'IBM Plex Mono';

export function Packages() {
  const { width } = useWindowDimensions();

  // .section.container → padding-top 96, container max-width 1410, padding 0 40
  // On narrow web viewports the source drops container padding to 22px.
  const isNarrow = width < 720;
  const horizontalPadding = isNarrow ? 22 : 40;

  // .howto h2 → display 800, clamp(2.3rem, 4.8vw, 3.4rem) ≈ 36.8–54.4px,
  // line-height 1.04, letter-spacing -.02em. Resolve the clamp against width.
  const headingFontSize = Math.max(36.8, Math.min(54.4, width * 0.048));
  const headingLineHeight = Math.round(headingFontSize * 1.04);
  const headingLetterSpacing = -(headingFontSize * 0.02); // -.02em

  // .howto .lead → 1.0625rem (17px), line-height 1.58
  const leadFontSize = 17;
  const leadLineHeight = Math.round(leadFontSize * 1.58);

  return (
    <View
      style={{
        paddingTop: 96,
        paddingHorizontal: horizontalPadding,
        maxWidth: 1410,
        marginHorizontal: 'auto',
        width: '100%',
      }}
    >
      {/* .opener — grid auto/1fr/auto with a top hairline rule.
          No CTA/door is passed on the homepage, so the opener is just the
          index label. */}
      <View
        style={
          {
            display: 'grid',
            gridTemplateColumns: 'auto 1fr auto',
            alignItems: 'center',
            gap: '18px',
            borderTopWidth: 1,
            borderTopColor: INK,
            paddingTop: 14,
            marginBottom: 48,
          } as any
        }
      >
        {/* .opener .idx — index "01" / label "Our packages" */}
        <Text
          style={{
            fontFamily: FONT_MONO,
            fontVariant: ['tabular-nums'],
            fontSize: 12,
            fontWeight: '500',
            letterSpacing: 12 * 0.04, // .04em on 12px = 0.48
            color: GRAY,
          }}
        >
          01 / Our packages
        </Text>
      </View>

      {/* HowItWorksIntro (withChain={false}) — .howto .howto-intro */}
      <View style={{ paddingTop: 4 }}>
        {/* .howto h2 — "Select from thousands of\nNCSW engineered systems" */}
        <Text
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: '800',
            fontSize: headingFontSize,
            lineHeight: headingLineHeight,
            letterSpacing: headingLetterSpacing,
            color: INK,
            maxWidth: 560, // .howto h2 max-width: 32ch
          }}
        >
          {'Select from thousands of\nNCSW engineered systems'}
        </Text>

        {/* .howto-cols → .howto .lead (single lede paragraph) */}
        <View style={{ maxWidth: 640, marginTop: 20 }}>
          <Text
            style={{
              fontFamily: FONT_BODY,
              fontSize: leadFontSize,
              lineHeight: leadLineHeight,
              color: GRAY,
            }}
          >
            We evaluate individual audio components and determine their
            appropriateness for fitment as a system. We consider everything from
            the playback of tones over factory speakers for collision avoidance,
            the safety of hands free call audio routing, to the calculation of
            weighted averages of electromechanical properties of speakers. Doing
            so allows us to offer higher performance sound reproduction and
            greater attention to detail at lower prices.
          </Text>
        </View>
      </View>
    </View>
  );
}
