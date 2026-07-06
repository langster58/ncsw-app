import { Text, View } from 'react-native'
import { Heading } from './Heading'
import { IconArrow } from './Icon'
import { Lead } from './Lead'
import { Link } from './Link'
import { colors, fonts, tracking } from './tokens'

// SectionIntro — the unified opener band + heading + body for every section.
// Always has an eyebrow row at the top (`index / label`), with an optional
// right-aligned action link on the same row.
//
//   <SectionIntro
//     index="04"
//     label="Sub-stage"
//     heading="Sub-stage fabrication & alignment"
//     body="…"
//     actionLabel="All alignments"   // optional
//     actionHref="#"                 // optional
//   />
//
// Replaces the previous separate `Opener` + `SectionIntro` pair.

type Level = 'h2' | 'h2sm' | 'h3'

type Props = {
  index: string
  label: string
  heading: React.ReactNode
  body?: React.ReactNode
  actionLabel?: string
  actionHref?: string
  level?: Level
  paddingBottom?: number
}

const DEFAULT_BOTTOM = 28
const EYEBROW_ROW_GAP = 72 // distance from eyebrow band to heading

export function SectionIntro({
  index,
  label,
  heading,
  body,
  actionLabel,
  actionHref,
  level = 'h2sm',
  paddingBottom = DEFAULT_BOTTOM,
}: Props) {
  return (
    <View style={{ paddingBottom } as any}>
      {/* eyebrow band — top hairline + index/label + optional door link */}
      <View
        style={
          {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderTopWidth: 1,
            borderTopColor: colors.ink,
            paddingTop: 14,
            marginBottom: EYEBROW_ROW_GAP,
            gap: 18,
          } as any
        }
      >
        <Text
          style={
            {
              fontFamily: fonts.mono,
              fontSize: 12,
              fontWeight: '500',
              letterSpacing: tracking.wide,
              textTransform: 'uppercase',
              color: colors.gray,
            } as any
          }
        >
          {index} / {label}
        </Text>
        {actionLabel ? (
          <Link variant="door" href={actionHref} icon={<IconArrow size={15} />}>
            {actionLabel}
          </Link>
        ) : null}
      </View>

      {/* heading + body */}
      <View style={{ gap: 16 }}>
        <Heading level={level}>{heading}</Heading>
        {body ? <Lead>{body}</Lead> : null}
      </View>
    </View>
  )
}
