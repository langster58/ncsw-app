import { Text, View } from 'react-native'
import { Chip } from './Chip'
import { colors, fonts, tracking, type as typeScale, useFluidPx } from './tokens'

// FilterChipGroup — mono label + horizontal row of toggleable chips.
// Used in the chart filter band AND the package-table sort/filter modal —
// extracted to remove the duplicated `Facet` implementations.
//
//   <FilterChipGroup
//     label="Size"
//     value={size}
//     options={['all', '8', '10', '12', '15', '18']}
//     pick="NCSW Pick"    // optional — the recommended default
//     onChange={setSize}
//     renderOption={(o) => (o === 'all' ? 'All' : o + '"')}
//   />

type Props = {
  label: string
  value: string
  options: string[]
  pick?: string
  onChange: (v: string) => void
  renderOption?: (o: string) => React.ReactNode
  dense?: boolean // no outer vertical padding — for control rows that baseline-align
}

export function FilterChipGroup({
  label,
  value,
  options,
  pick,
  onChange,
  renderOption = (o) => o,
  dense = false,
}: Props) {
  // Dense mode is the control-row variant: label matches the row's other
  // control labels and the chips center inside the shared 40px content band.
  const denseLabelSize = useFluidPx(typeScale.meta)
  return (
    <View style={{ paddingVertical: dense ? 0 : 10, gap: dense ? 7 : 10 } as any}>
      <Text
        style={
          {
            fontFamily: fonts.mono,
            fontSize: dense ? denseLabelSize : 10.5,
            fontWeight: dense ? '600' : '500',
            letterSpacing: dense ? 0.88 : 0.735, // .07em * 10.5 in the regular variant
            textTransform: 'uppercase',
            color: dense ? colors.gray : colors.inkFaint,
          } as any
        }
      >
        {label}
      </Text>
      <View
        style={
          {
            flexDirection: 'row',
            gap: 5,
            alignItems: 'center', // pills are shorter than the band — center them in it
            // Dense: a fixed-height container matching the 38px control band
            // (Dropdown/Button height) so the group sits on the row's line.
            ...(dense ? { height: 38, flexWrap: 'nowrap' } : { flexWrap: 'wrap' }),
          } as any
        }
      >
        {options.map((o) => {
          const isPick = !!pick && o === pick
          return (
            <Chip
              key={o}
              selected={o === value}
              variant={isPick ? 'pick' : 'default'}
              onPress={() => onChange(o)}
            >
              {renderOption(o)}
            </Chip>
          )
        })}
      </View>
    </View>
  )
}
