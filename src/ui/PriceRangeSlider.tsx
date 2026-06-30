import React from 'react'
import { Text, View } from 'react-native'
import { colors, fonts, tracking } from './tokens'

// PriceRangeSlider — dual-thumb range with tick labels along the bottom.
// Used in the package-table sort/filter modal and the chart price control.
//
//   <PriceRangeSlider min={2000} max={6000} lo={priceMin} hi={priceMax}
//     onChange={(a, b) => { setLo(a); setHi(b); }} />
//
// Relies on the `.rng` global CSS in public/ncsw.css for the dual-range thumb
// behavior (track pointer-events:none; thumbs pointer-events:auto).

type Props = {
  min: number
  max: number
  lo: number
  hi: number
  onChange: (lo: number, hi: number) => void
  label?: string
}

export function PriceRangeSlider({ min, max, lo, hi, onChange, label = 'Price range' }: Props) {
  const money = (v: number) => '$' + v.toLocaleString('en-US')
  const pct = (v: number) => ((v - min) / (max - min)) * 100
  return (
    <View style={{ paddingVertical: 10, gap: 10 } as any}>
      <Text
        style={
          {
            fontFamily: fonts.mono,
            fontSize: 10.5,
            fontWeight: '500',
            letterSpacing: 0.735,
            textTransform: 'uppercase',
            color: colors.inkFaint,
          } as any
        }
      >
        {label}
      </Text>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
        <Text style={{ fontFamily: fonts.mono, fontSize: 13, fontWeight: '600', color: colors.ink }}>
          {money(lo)}
        </Text>
        <Text style={{ fontFamily: fonts.mono, fontSize: 13, fontWeight: '600', color: colors.ink }}>
          {hi >= max ? money(hi) + '+' : money(hi)}
        </Text>
      </View>

      <View style={{ position: 'relative', height: 16 } as any}>
        {/* full track */}
        <View
          style={
            { position: 'absolute', left: 0, right: 0, top: 6, height: 3, borderRadius: 9999, backgroundColor: colors.borderStrong } as any
          }
        />
        {/* selected range */}
        <View
          style={
            {
              position: 'absolute',
              top: 6,
              height: 3,
              borderRadius: 9999,
              backgroundColor: colors.accent,
              left: `${pct(lo)}%`,
              right: `${100 - pct(hi)}%`,
            } as any
          }
        />
        {/* lo thumb input */}
        {React.createElement('input', {
          type: 'range',
          min,
          max,
          step: 10,
          value: lo,
          onChange: (e: any) => onChange(Math.min(+e.target.value, hi - 10), hi),
          className: 'rng',
          style: { position: 'absolute', left: 0, top: 0, width: '100%', height: 16, background: 'transparent' },
          'aria-label': `Minimum ${label.toLowerCase()}`,
        })}
        {/* hi thumb input */}
        {React.createElement('input', {
          type: 'range',
          min,
          max,
          step: 10,
          value: hi,
          onChange: (e: any) => onChange(lo, Math.max(+e.target.value, lo + 10)),
          className: 'rng',
          style: { position: 'absolute', left: 0, top: 0, width: '100%', height: 16, background: 'transparent' },
          'aria-label': `Maximum ${label.toLowerCase()}`,
        })}
      </View>

      {/* tick marks */}
      <View style={{ position: 'relative', marginTop: 8, height: 16 } as any}>
        {[0, 0.25, 0.5, 0.75, 1].map((t, i, arr) => {
          const v = Math.round((min + t * (max - min)) / 100) * 100
          const first = i === 0
          const last = i === arr.length - 1
          const transform = first ? 'translateX(0)' : last ? 'translateX(-100%)' : 'translateX(-50%)'
          const align = first ? 'flex-start' : last ? 'flex-end' : 'center'
          return (
            <View
              key={i}
              style={
                {
                  position: 'absolute',
                  left: `${t * 100}%`,
                  transform,
                  flexDirection: 'column',
                  alignItems: align,
                } as any
              }
            >
              <View style={{ width: 1, height: 6, backgroundColor: colors.borderStrong, marginBottom: 4 }} />
              <Text style={{ fontFamily: fonts.mono, fontSize: 10, color: colors.inkFaint }}>
                {'$' + (v / 1000).toFixed(v % 1000 ? 1 : 0) + 'k'}
              </Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}
