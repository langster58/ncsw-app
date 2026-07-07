import { View } from 'react-native'
import { Eyebrow } from './Eyebrow'
import { colors } from './tokens'

// Byline — the eyebrow band that closes an article's hero (headline, dek, lead
// image) and opens the body. A rule with "By {author} / {date}" set flush-right
// in eyebrow format. It sits AFTER the hero, where it separates two real things
// — the intro from the body — so the rule marks an actual boundary.

export function Byline({ author, date }: { author: string; date?: string }) {
  return (
    <View
      style={{ borderTopWidth: 1, borderTopColor: colors.ink, paddingTop: 14, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' } as any}
    >
      <Eyebrow>{date ? `By ${author} / ${date}` : `By ${author}`}</Eyebrow>
    </View>
  )
}
