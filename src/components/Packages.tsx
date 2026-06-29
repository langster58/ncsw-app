// NCSW homepage — Section "01 / Our packages".
// Composition only. All styling lives in src/ui/* and src/ui/tokens.ts.
// Copy is verbatim from the source JSX (Packages.jsx -> HowItWorksIntro).

import { View } from 'react-native'
import { Container, Heading, Lead, Opener, Section } from '@/ui'

export function Packages() {
  return (
    <Section>
      <Container>
        <Opener index="01" label="Our packages" />
        <View style={{ gap: 20 }}>
          <Heading>{'Select from thousands of\nNCSW engineered systems'}</Heading>
          <Lead>
            We evaluate individual audio components and determine their
            appropriateness for fitment as a system. We consider everything from
            the playback of tones over factory speakers for collision avoidance,
            the safety of hands free call audio routing, to the calculation of
            weighted averages of electromechanical properties of speakers. Doing
            so allows us to offer higher performance sound reproduction and
            greater attention to detail at lower prices.
          </Lead>
        </View>
      </Container>
    </Section>
  )
}
