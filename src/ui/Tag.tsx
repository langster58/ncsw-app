import { Platform, Text, View } from 'react-native'
import { colors, fonts, tracking } from './tokens'

// Tag — small mono uppercase pill. Two tones: dark (used over media as an
// overlay caption like "SUV · HATCH · WAGON") and light (used in-content).

type Tone = 'dark' | 'light'

type TagProps = {
  children: React.ReactNode
  tone?: Tone
}

export function Tag({ children, tone = 'dark' }: TagProps) {
  const dark = tone === 'dark'
  return (
    <View
      style={
        {
          backgroundColor: dark ? 'rgba(0,0,0,0.55)' : colors.surface,
          borderRadius: 5,
          paddingHorizontal: 10,
          paddingVertical: 5,
          alignSelf: 'flex-start',
          ...(dark && Platform.OS === 'web' ? { backdropFilter: 'blur(4px)' } : null),
        } as any
      }
    >
      <Text
        style={
          {
            fontFamily: fonts.body,
            fontSize: 11,
            fontWeight: '600',
            color: dark ? colors.white : colors.ink,
          } as any
        }
      >
        {children}
      </Text>
    </View>
  )
}
