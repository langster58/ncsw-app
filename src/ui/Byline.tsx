import { View } from 'react-native'
import { Eyebrow } from './Eyebrow'

// Byline — article authorship as an eyebrow line: "By {author} / {date}".
// Named-voice: NCSW publishes, the named person carries editorial. Lives in the
// article's meta rail (wide) or directly under the headline (narrow).

export function Byline({ author, date }: { author: string; date?: string }) {
  return (
    <View>
      <Eyebrow tone="ink">{date ? `By ${author} / ${date}` : `By ${author}`}</Eyebrow>
    </View>
  )
}
