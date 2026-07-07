import { Text, View } from 'react-native'
import { colors, fonts, tracking, type, useFluidPx } from './tokens'

// Byline — article authorship. Named-voice: NCSW publishes, the named person
// carries editorial. Author name in body ink; date in mono meta beneath it.

export function Byline({ author, date }: { author: string; date?: string }) {
  const nameSize = useFluidPx(type.small)
  const metaSize = useFluidPx(type.meta)
  return (
    <View>
      <Text style={{ fontFamily: fonts.body, fontSize: nameSize, fontWeight: '600', color: colors.ink } as any}>
        By {author}
      </Text>
      {date ? (
        <Text
          style={
            {
              fontFamily: fonts.mono,
              fontSize: metaSize,
              letterSpacing: tracking.label,
              textTransform: 'uppercase',
              color: colors.gray,
              marginTop: 4,
            } as any
          }
        >
          {date}
        </Text>
      ) : null}
    </View>
  )
}
