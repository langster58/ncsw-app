import React from 'react'
import { View } from 'react-native'
import { colors } from './tokens'

// ValueSlider — single-thumb slider in the same visual language as
// PriceRangeSlider: hairline track, accent fill up to the thumb, `.rng`
// global CSS thumb (public/ncsw.css). Bare control — compose the label and
// any value field at the call site.
//
//   <ValueSlider min={18} max={50} step={0.5} value={fb} onChange={setFb}
//     width={150} ariaLabel="Tuning frequency, hertz" />

type Props = {
  min: number
  max: number
  step: number
  value: number
  onChange: (n: number) => void
  width: number
  ariaLabel: string
}

export function ValueSlider({ min, max, step, value, onChange, width, ariaLabel }: Props) {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100))
  return (
    <View style={{ position: 'relative', height: 16, width } as any}>
      {/* full track */}
      <View
        style={
          { position: 'absolute', left: 0, right: 0, top: 6, height: 3, borderRadius: 9999, backgroundColor: colors.borderStrong } as any
        }
      />
      {/* filled range */}
      <View
        style={
          {
            position: 'absolute',
            top: 6,
            height: 3,
            borderRadius: 9999,
            backgroundColor: colors.accent,
            left: 0,
            width: `${pct}%`,
          } as any
        }
      />
      {React.createElement('input', {
        type: 'range',
        min,
        max,
        step,
        value,
        onChange: (e: any) => onChange(Number(e.target.value)),
        className: 'rng',
        style: {
          position: 'absolute',
          left: 0,
          top: 0,
          width: '100%',
          height: 16,
          background: 'transparent',
          pointerEvents: 'auto',
        },
        'aria-label': ariaLabel,
      })}
    </View>
  )
}
