import React from 'react'
import { Text, View } from 'react-native'
import { colors, fonts, type as typeScale, useFluidPx } from './tokens'

// ControlColumn — mono label over a control, content centered in the shared
// 38px control band (the Dropdown/FilterTriggerButton height). The column
// skeleton for control rows where labels align on one line and each
// control centers beneath.
//
//   <ControlColumn label="Driver" width={240}>
//     <Dropdown hideLabel label="Driver" ... />
//   </ControlColumn>

export const CONTROL_BAND = 38

type Props = {
  label: string
  width?: number
  children: React.ReactNode
}

export function ControlColumn({ label, width, children }: Props) {
  const fontSize = useFluidPx(typeScale.meta)
  return (
    <View style={{ flexDirection: 'column', gap: 7, width } as any}>
      <Text
        style={
          {
            fontFamily: fonts.mono,
            fontWeight: '600',
            fontSize,
            color: colors.gray,
            textTransform: 'uppercase',
            letterSpacing: 0.88,
          } as any
        }
        numberOfLines={1}
      >
        {label}
      </Text>
      <View style={{ minHeight: CONTROL_BAND, justifyContent: 'center' } as any}>{children}</View>
    </View>
  )
}
