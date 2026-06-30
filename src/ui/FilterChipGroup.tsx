import { Text, View } from 'react-native'
import { Chip } from './Chip'
import { colors, fonts, tracking } from './tokens'

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
}

export function FilterChipGroup({
  label,
  value,
  options,
  pick,
  onChange,
  renderOption = (o) => o,
}: Props) {
  return (
    <View style={{ paddingVertical: 10, gap: 10 } as any}>
      <Text
        style={
          {
            fontFamily: fonts.mono,
            fontSize: 10.5,
            fontWeight: '500',
            letterSpacing: 0.735, // .07em * 10.5
            textTransform: 'uppercase',
            color: colors.inkFaint,
          } as any
        }
      >
        {label}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, alignItems: 'center' } as any}>
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
