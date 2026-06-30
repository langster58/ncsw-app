// NCSW homepage — Section "01 / Our packages".
// Thin composition on src/ui primitives. Copy is verbatim from the source JSX.

import { Container, Section, SectionIntro } from '@/ui'

export function Packages() {
  return (
    <Section>
      <Container>
        <SectionIntro
          index="01"
          label="Our packages"
          heading={'Select from thousands of\nNCSW engineered systems'}
          level="h2"
          body={
            'We evaluate individual audio components and determine their appropriateness for fitment as a system. We consider everything from the playback of tones over factory speakers for collision avoidance, the safety of hands free call audio routing, to the calculation of weighted averages of electromechanical properties of speakers. Doing so allows us to offer higher performance sound reproduction and greater attention to detail at lower prices.'
          }
        />
      </Container>
    </Section>
  )
}
