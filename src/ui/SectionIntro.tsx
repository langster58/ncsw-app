import { View } from 'react-native'
import { Heading } from './Heading'
import { Lead } from './Lead'
import { Link } from './Link'
import { IconArrow } from './Icon'

// SectionIntro — heading + paragraph, optional right-aligned action link.
// Two variants:
//   default      → stacked: heading, paragraph, bottom padding
//   with action  → top row puts heading + a right-aligned door link side-by-side
//
//   <SectionIntro heading="…" body="…" />
//   <SectionIntro heading="…" body="…" actionLabel="All articles" actionHref="/articles" />

type Level = 'h2' | 'h2sm' | 'h3'

type Props = {
  heading: React.ReactNode
  body?: React.ReactNode
  level?: Level
  actionLabel?: string
  actionHref?: string
  paddingBottom?: number
}

const DEFAULT_BOTTOM = 28

export function SectionIntro({
  heading,
  body,
  level = 'h2sm',
  actionLabel,
  actionHref,
  paddingBottom = DEFAULT_BOTTOM,
}: Props) {
  const hasAction = !!actionLabel
  return (
    <View style={{ paddingBottom, gap: 16 } as any}>
      {hasAction ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: 24,
            flexWrap: 'wrap',
          }}
        >
          <View style={{ flexShrink: 1 }}>
            <Heading level={level}>{heading}</Heading>
          </View>
          <Link variant="door" href={actionHref} icon={<IconArrow size={15} />}>
            {actionLabel!}
          </Link>
        </View>
      ) : (
        <Heading level={level}>{heading}</Heading>
      )}
      {body ? <Lead>{body}</Lead> : null}
    </View>
  )
}
