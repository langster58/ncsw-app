import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Container, Dropdown, IconClose, colors, fluid, useFluidPx } from '@/ui'
import { PackageTableModal } from './PackageTableModal.web'

// PackageTable — web-only. Ported from PackagesTable.jsx with exact values from the
// source + the inline Tailwind token map. Tailwind tokens (exact):
//   ink #16181d · ink2 #5b6270 · ink3 #8b92a1 · line #e7e9ee · lineS #d3d7e0
//   zebra #fafbfc · accent #0576cc · accentSoft #e6f1fb · hov #f3f6fb
// Fonts: text = Inter, mono = IBM Plex Mono.
//
// Faithful adaptations (DOM APIs have no RN equivalent — flagged, not approximated values):
//   - MODE="scroll" infinite list: real scroll container (div) + onScroll lazy window (+40).
//   - Custom HScrollbar drag, ResizeObserver fill mechanic -> native overflow scroll.
//   - ReactDOM.createPortal sheet -> fixed-position overlay div in-component.
//   - YMMT vehicle selector reads window.NCSW_VEHICLES (external/CMS); not present here,
//     so the vehicle control row renders its exact chrome but has no options (flagged).

const INK = colors.tableInk
const INK2 = colors.inkSoft
const INK3 = colors.inkFaint
const LINE = colors.tableLine
const LINES = colors.tableLineStrong
const ZEBRA = colors.surfaceHover
const ACCENT = colors.accent
const ACCENT_SOFT = colors.accentSoft
const WHITE = colors.white
const FONT = 'Inter'
const MONO = 'IBM Plex Mono'

/* ---------------- DATA (exact from PackagesTable.jsx) ---------------- */
const SUBS = [
  { brand: 'Crescendo Forte v2', sizes: ['10"', '12"'], tier: 'Entry', base: 1690 },
  { brand: 'Sundown SA Classic', sizes: ['10"', '12"', '15"'], tier: 'Mid', base: 1990 },
  { brand: 'Fi Car Audio HC', sizes: ['12"', '15"'], tier: 'Upper', base: 2790 },
  { brand: 'Sundown ZV6', sizes: ['12"', '15"', '18"'], tier: 'Reference', base: 4490 },
  { brand: 'Adire Kali', sizes: ['15"', '18"'], tier: 'Reference', base: 5290 },
  { brand: 'NVX VCW v3', sizes: ['10"', '12"', '15"'], tier: 'Entry', base: 1740 },
  { brand: 'DD Audio 700', sizes: ['12"', '15"'], tier: 'Mid', base: 2240 },
  { brand: 'Skar EVL', sizes: ['12"', '15"'], tier: 'Mid', base: 2090 },
  { brand: 'Adire Maelstrom X', sizes: ['15"', '18"'], tier: 'Beyond', base: 6800 },
]
const TOPO = ['2-way', '3-way']
const FRONTS = ['Stevens + SEAS MB6', 'Hybrid Audio Mirus', 'Audiofrog GB60 / GB15']
const SIGNALS = ['Zapco HB 46 II 4A', 'Helix Mini MK2', 'Helix Pro MK3']
const SUBAMPS = ['Helix Amplify 206', 'Helix DSP Ultra', 'Sundown SAE-1000', 'DS18 FRP 3.5K']
const COMPAMPS = ['Helix MINI', 'Helix DSP.3', 'Helix Amplify 206', 'Zapco ST-4X']
const COUNTS = ['Single', 'Dual']
const TIER_ORDER: Record<string, number> = { Entry: 0, Mid: 1, Upper: 2, Reference: 3, Beyond: 4 }
const sizeAdd: Record<string, number> = { '10"': 0, '12"': 260, '15"': 720, '18"': 1280 }
const dollars = (n: number) => '$' + n.toLocaleString('en-US')
const seed = (n: number) => {
  const x = Math.sin((n + 1) * 99.137) * 10000
  return x - Math.floor(x)
}
const FRONT_SUBS = ['Stevens MB-8', 'SEAS L16', 'Dayton RSS']
const ENC_TYPES = ['Sealed', 'Ported', 'Infinite baffle']
const encVol: Record<string, number> = { '10"': 0.6, '12"': 0.9, '15"': 1.4, '18"': 2.2 }
const monoWattsOf: Record<string, number> = {
  'Helix Amplify 206': 600,
  'Helix DSP Ultra': 950,
  'Sundown SAE-1000': 1000,
  'DS18 FRP 3.5K': 3500,
}

// Vehicle selector — cascading Year -> Make -> Model -> Trim. The source
// reads window.NCSW_VEHICLES (external/CMS), not present in this port. This
// is real/realistic-volume standing data (years back to 1950, a full make
// list, real-length model lineups) so the picker lists are genuinely long
// enough to need the scrolling container they get, not just a few token
// entries. Trim still comes from a shared placeholder list — real per-model
// trim data isn't something worth hand-authoring for a stand-in feed.
const CURRENT_MODEL_YEAR = 2026
const YEARS = Array.from({ length: CURRENT_MODEL_YEAR - 1950 + 1 }, (_, i) => String(CURRENT_MODEL_YEAR - i))
const MAKES = [
  'Acura', 'Audi', 'BMW', 'Buick', 'Cadillac', 'Chevrolet', 'Chrysler', 'Dodge',
  'Ford', 'Genesis', 'GMC', 'Honda', 'Hyundai', 'Infiniti', 'Jeep', 'Kia',
  'Lexus', 'Lincoln', 'Mazda', 'Mercedes-Benz', 'Mini', 'Mitsubishi', 'Nissan',
  'Porsche', 'Ram', 'Subaru', 'Tesla', 'Toyota', 'Volkswagen', 'Volvo',
]
const MODELS_BY_MAKE: Record<string, string[]> = {
  Acura: ['Integra', 'TLX', 'RDX', 'MDX', 'ZDX'],
  Audi: ['A3', 'A4', 'A6', 'Q3', 'Q5', 'Q7', 'Q8', 'S3', 'RS5', 'e-tron GT'],
  BMW: ['2 Series', '3 Series', '4 Series', '5 Series', '7 Series', 'X1', 'X3', 'X5', 'X7', 'M4', 'i4'],
  Buick: ['Encore GX', 'Envision', 'Enclave'],
  Cadillac: ['CT4', 'CT5', 'XT4', 'XT5', 'XT6', 'Escalade', 'Lyriq'],
  Chevrolet: [
    'Spark', 'Malibu', 'Camaro', 'Corvette', 'Trax', 'Trailblazer', 'Equinox',
    'Blazer', 'Traverse', 'Tahoe', 'Suburban', 'Colorado', 'Silverado 1500',
  ],
  Chrysler: ['300', 'Pacifica'],
  Dodge: ['Charger', 'Durango', 'Hornet'],
  Ford: [
    'Maverick', 'Mustang', 'Bronco Sport', 'Bronco', 'Escape', 'Edge',
    'Explorer', 'Expedition', 'Ranger', 'F-150', 'F-250', 'Mustang Mach-E',
  ],
  Genesis: ['G70', 'G80', 'G90', 'GV70', 'GV80'],
  GMC: ['Terrain', 'Acadia', 'Yukon', 'Canyon', 'Sierra 1500'],
  Honda: ['Civic', 'Accord', 'Insight', 'HR-V', 'CR-V', 'Passport', 'Pilot', 'Ridgeline', 'Odyssey'],
  Hyundai: ['Elantra', 'Sonata', 'Venue', 'Kona', 'Tucson', 'Santa Fe', 'Palisade', 'Ioniq 5', 'Ioniq 6'],
  Infiniti: ['Q50', 'Q60', 'QX50', 'QX55', 'QX60', 'QX80'],
  Jeep: ['Compass', 'Cherokee', 'Grand Cherokee', 'Wrangler', 'Gladiator', 'Wagoneer'],
  Kia: ['Forte', 'K5', 'Soul', 'Seltos', 'Sportage', 'Sorento', 'Telluride', 'EV6', 'EV9'],
  Lexus: ['IS', 'ES', 'LS', 'UX', 'NX', 'RX', 'GX', 'LX', 'RZ'],
  Lincoln: ['Corsair', 'Nautilus', 'Aviator', 'Navigator'],
  Mazda: ['Mazda3', 'CX-30', 'CX-5', 'CX-50', 'CX-90', 'MX-5 Miata'],
  'Mercedes-Benz': ['A-Class', 'C-Class', 'E-Class', 'S-Class', 'GLA', 'GLC', 'GLE', 'GLS', 'EQE', 'EQS'],
  Mini: ['Cooper', 'Cooper Countryman', 'Cooper Clubman'],
  Mitsubishi: ['Mirage', 'Outlander', 'Outlander Sport', 'Eclipse Cross'],
  Nissan: [
    'Versa', 'Sentra', 'Altima', 'Maxima', 'Kicks', 'Rogue', 'Murano',
    'Pathfinder', 'Armada', 'Frontier', 'Titan', 'Ariya', 'Z',
  ],
  Porsche: ['718 Cayman', '718 Boxster', '911', 'Taycan', 'Macan', 'Cayenne', 'Panamera'],
  Ram: ['1500', '2500', '3500', 'ProMaster'],
  Subaru: ['Impreza', 'Legacy', 'WRX', 'Crosstrek', 'Forester', 'Outback', 'Ascent', 'BRZ', 'Solterra'],
  Tesla: ['Model 3', 'Model Y', 'Model S', 'Model X', 'Cybertruck'],
  Toyota: [
    'Corolla', 'Camry', 'Crown', 'Prius', 'C-HR', 'Venza', 'RAV4', 'Highlander',
    '4Runner', 'Sequoia', 'Tacoma', 'Tundra', 'Sienna',
  ],
  Volkswagen: ['Jetta', 'Golf GTI', 'Golf Alltrack', 'ID.4', 'Taos', 'Tiguan', 'Atlas', 'Atlas Cross Sport'],
  Volvo: ['S60', 'S90', 'XC40', 'XC60', 'XC90', 'C40 Recharge'],
}
// Placeholder — real trim data would come from the CMS feed alongside the
// rest of this. A generic ladder is enough to demonstrate the picker
// without hand-authoring trims for ~150 models.
const TRIM_OPTIONS = ['Base', 'S', 'SE', 'SEL', 'Sport', 'Limited', 'Premium', 'Touring', 'Platinum']

// Sized to comfortably fit the longest realistic label + value (e.g. "MODEL"
// + "Golf Alltrack") without the box stretching to fill leftover row width.
// Fluid like the rest of the design system, not the fixed px this table
// otherwise intentionally uses for its dense grid.
const VEHICLE_FIELD_WIDTH = fluid(190, 150)

type Row = {
  id: number
  tier: string
  topo: string
  sub: string
  size: string
  count: string
  subCount: number
  front: string
  frontSub: string
  signal: string
  camp: string
  subamp: string
  enclosure: string
  vscore: number
  monoWatts: number
  price: number
}

const CATALOG_FULL: Row[] = (() => {
  const rows: Row[] = []
  let i = 0
  for (const s of SUBS)
    for (const size of s.sizes)
      for (const topo of TOPO)
        for (let f = 0; f < FRONTS.length; f++)
          for (let sg = 0; sg < SIGNALS.length; sg++)
            for (let ca = 0; ca < COMPAMPS.length; ca++)
              for (let a = 0; a < SUBAMPS.length; a++)
                for (const count of COUNTS) {
                  const price =
                    s.base + sizeAdd[size] + f * 180 + a * 150 + ca * 120 + (count === 'Dual' ? 900 : 0) + sg * 90
                  const cnt = count === 'Dual' ? 2 : 1
                  const encType = ENC_TYPES[Math.floor(seed(i * 3 + 1) * ENC_TYPES.length)]
                  const enclosure =
                    encType === 'Infinite baffle' ? 'IB' : encType + ' · ' + (encVol[size] * cnt).toFixed(1) + ' ft³'
                  const vscore = Math.max(
                    38,
                    Math.min(99, Math.round(50 + TIER_ORDER[s.tier] * 10 + (seed(i * 7 + 3) - 0.5) * 22)),
                  )
                  rows.push({
                    id: i,
                    tier: s.tier,
                    topo,
                    sub: s.brand + ' ' + size.replace('"', ''),
                    size,
                    count,
                    subCount: cnt,
                    front: FRONTS[f],
                    frontSub: topo === '3-way' ? FRONT_SUBS[Math.floor(seed(i * 11 + 4) * FRONT_SUBS.length)] : '—',
                    signal: SIGNALS[sg],
                    camp: COMPAMPS[ca],
                    subamp: SUBAMPS[a],
                    enclosure,
                    vscore,
                    monoWatts: (monoWattsOf[SUBAMPS[a]] || 600) * cnt,
                    price,
                  })
                  i++
                }
  return rows
})()
const CATALOG = CATALOG_FULL.slice(0, 1738)
const PMIN = Math.floor(Math.min(...CATALOG.map((r) => r.price)) / 100) * 100
const PMAX = Math.ceil(Math.max(...CATALOG.map((r) => r.price)) / 100) * 100
const SUBOPTS = [...new Set(CATALOG.map((r) => r.sub))].sort()

const PICKS: Row[] = (() => {
  const out: Row[] = []
  for (const s of SUBS)
    for (const size of s.sizes.slice(0, 2)) {
      const sub = s.brand + ' ' + size.replace('"', '')
      const topo = s.tier === 'Entry' ? '2-way' : '3-way'
      const row = CATALOG_FULL.find(
        (r) =>
          r.sub === sub &&
          r.count === 'Single' &&
          r.topo === topo &&
          r.front === FRONTS[0] &&
          r.signal === SIGNALS[0] &&
          r.camp === COMPAMPS[0] &&
          r.subamp === SUBAMPS[0],
      )
      if (row) out.push(row)
    }
  return out.sort((a, b) => a.price - b.price)
})()

type Col = { key: string; label: string; w: number; stickyLeft?: boolean; sort?: string }
const COLS: Col[] = [
  { key: 'price', label: 'Price', w: 108, stickyLeft: true, sort: 'price' },
  { key: 'tier', label: 'Tier', w: 104, sort: 'tier' },
  { key: 'vscore', label: 'Value Score', w: 116, sort: 'vscore' },
  { key: 'signal', label: 'Signal Processor', w: 158 },
  { key: 'cset', label: 'Component Set', w: 198 },
  { key: 'frontSub', label: 'Front Sub', w: 128 },
  { key: 'camp', label: 'Multi CH Amp', w: 150 },
  { key: 'subamp', label: 'Mono Amp', w: 158 },
  { key: 'sub', label: 'Subwoofer', w: 192 },
  { key: 'enclosure', label: 'Enclosure', w: 150 },
  { key: 'size', label: 'Sub Size', w: 88 },
  { key: 'count', label: 'Sub Count', w: 96 },
  { key: 'monoWatts', label: 'Mono Amp Watts', w: 138 },
]
const TABLE_W = COLS.reduce((a, c) => a + c.w, 0)
const ROW_H = 52
const HEAD_H = 38
const REGION_H = 39 + 10 * 52

/* ---------------- cell renderer (exact column logic) ---------------- */
function Cell({ col, r }: { col: Col; r: Row }) {
  const base = { fontFamily: FONT, color: INK2, fontSize: 13.5 } as const
  if (col.key === 'price') {
    return <Text style={{ fontFamily: FONT, fontWeight: '600', color: INK, fontSize: 14 }}>{dollars(r.price)}</Text>
  }
  if (col.key === 'vscore') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={base}>{r.vscore}</Text>
        <View style={{ width: 34, height: 4, borderRadius: 9999, backgroundColor: LINE, overflow: 'hidden' }}>
          <View
            style={{ height: '100%', borderRadius: 9999, backgroundColor: ACCENT, width: (`${r.vscore}%` as any) }}
          />
        </View>
      </View>
    )
  }
  const map: Record<string, string> = {
    tier: r.tier,
    signal: r.signal,
    cset: r.front,
    frontSub: r.frontSub,
    camp: r.camp,
    subamp: r.subamp,
    sub: r.sub,
    enclosure: r.enclosure,
    size: r.size,
    count: r.count,
    monoWatts: r.monoWatts.toLocaleString('en-US') + ' W',
  }
  return <Text style={base}>{map[col.key]}</Text>
}

function stickyCell(col: Col, zebra: boolean): any {
  if (!col.stickyLeft) return {}
  const bg = zebra ? ZEBRA : WHITE
  return { position: 'sticky', left: 0, zIndex: 10, backgroundColor: bg, boxShadow: '1px 0 0 ' + LINE }
}

// Tertiary text action, not a bordered button — resetting isn't a primary
// action and shouldn't visually compete with the dropdowns or Sort & Filter.
// Stays mounted in the same place whether or not there's anything to clear
// (muted + inert vs. accent + clickable) so the row doesn't reflow when a
// field is picked.
function VehicleResetLink({ disabled, onPress }: { disabled: boolean; onPress: () => void }) {
  const [hovered, setHovered] = useState(false)
  const color = disabled ? INK3 : ACCENT
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessibilityRole="button"
      accessibilityLabel="Reset vehicle"
      style={
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          opacity: disabled ? 0.35 : 1,
          cursor: disabled ? 'not-allowed' : 'pointer',
        } as any
      }
    >
      <IconClose size={11} color={color} />
      <Text
        style={{
          fontFamily: MONO,
          fontSize: 10.5,
          fontWeight: '500',
          letterSpacing: 0.735,
          textTransform: 'uppercase',
          color,
          textDecorationLine: hovered && !disabled ? 'underline' : 'none',
        }}
      >
        Reset
      </Text>
    </Pressable>
  )
}

/* ---------------- main table ---------------- */
export function PackageTable() {
  const vehicleFieldWidth = useFluidPx(VEHICLE_FIELD_WIDTH)
  const [vehYear, setVehYear] = useState('')
  const [vehMake, setVehMake] = useState('')
  const [vehModel, setVehModel] = useState('')
  const [vehTrim, setVehTrim] = useState('')
  const onVehYearChange = (v: string) => {
    setVehYear(v)
    setVehMake('')
    setVehModel('')
    setVehTrim('')
  }
  const onVehMakeChange = (v: string) => {
    setVehMake(v)
    setVehModel('')
    setVehTrim('')
  }
  const onVehModelChange = (v: string) => {
    setVehModel(v)
    setVehTrim('')
  }
  const hasVehicleSelection = !!(vehYear || vehMake || vehModel || vehTrim)
  const onVehicleReset = () => {
    setVehYear('')
    setVehMake('')
    setVehModel('')
    setVehTrim('')
  }
  const [tier, setTier] = useState('All')
  const [topo, setTopo] = useState('All')
  const [count, setCount] = useState('All')
  const [size, setSize] = useState('All')
  const [signal, setSignal] = useState('NCSW Pick')
  const [cset, setCset] = useState('NCSW Pick')
  const [camp, setCamp] = useState('NCSW Pick')
  const [sub, setSub] = useState('NCSW Pick')
  const [samp, setSamp] = useState('NCSW Pick')
  const [priceMin, setPriceMin] = useState(PMIN)
  const [priceMax, setPriceMax] = useState(PMAX)
  const [sortKey, setSortKey] = useState('price')
  const [sortDir, setSortDir] = useState(1)
  const [sheet, setSheet] = useState(false)
  const [visible, setVisible] = useState(40)
  const regionRef = useRef<any>(null)

  const allPicks =
    signal === 'NCSW Pick' && cset === 'NCSW Pick' && camp === 'NCSW Pick' && sub === 'NCSW Pick' && samp === 'NCSW Pick'

  const rows = useMemo(() => {
    let set = allPicks ? PICKS : CATALOG
    set = set.filter(
      (r) =>
        (tier === 'All' || r.tier === tier) &&
        (topo === 'All' || r.topo === topo) &&
        (count === 'All' || r.count === count) &&
        (size === 'All' || r.size === size) &&
        (signal === 'NCSW Pick' || r.signal === signal) &&
        (cset === 'NCSW Pick' || r.front === cset) &&
        (camp === 'NCSW Pick' || r.camp === camp) &&
        (sub === 'NCSW Pick' || r.sub === sub) &&
        (samp === 'NCSW Pick' || r.subamp === samp) &&
        r.price >= priceMin &&
        r.price <= priceMax,
    )
    const dir = sortDir
    set = [...set].sort((a, b) => {
      let av: number, bv: number
      if (sortKey === 'tier') {
        av = TIER_ORDER[a.tier]
        bv = TIER_ORDER[b.tier]
        if (av === bv) {
          av = a.price
          bv = b.price
        }
      } else if (sortKey === 'vscore') {
        av = a.vscore
        bv = b.vscore
        if (av === bv) {
          av = a.price
          bv = b.price
        }
      } else {
        av = a.price
        bv = b.price
      }
      return av < bv ? -dir : av > bv ? dir : 0
    })
    return set
  }, [allPicks, tier, topo, count, size, signal, cset, camp, sub, samp, priceMin, priceMax, sortKey, sortDir])

  useEffect(() => {
    setVisible(40)
  }, [rows])

  const onScroll = useCallback(() => {
    const el = regionRef.current
    if (!el) return
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 400) {
      setVisible((v) => Math.min(rows.length, v + 40))
    }
  }, [rows.length])

  const bodyRows = rows.slice(0, visible)
  const activeCount =
    [tier, topo, count, size].filter((x) => x !== 'All').length +
    [signal, cset, camp, sub, samp].filter((x) => x !== 'NCSW Pick').length +
    (priceMin > PMIN || priceMax < PMAX ? 1 : 0)

  const headLabel = {
    fontFamily: MONO,
    fontSize: 11,
    fontWeight: '500' as const,
    letterSpacing: 0.44, // .04em * 11
    textTransform: 'uppercase' as const,
    color: INK3,
  }

  return (
    // Horizontal gutter comes from <Container> — the same primitive every
    // other section uses. The inner scroll region only shows a horizontal
    // scrollbar when the table's columns exceed the viewport width.
    <View style={{ width: '100%', backgroundColor: WHITE } as any}>
      <Container>
      {/* ============ TOP CHROME: vehicle selector + Sort & Filter ============ */}
      <View
        style={{
          paddingTop: 12,
          paddingBottom: 12,
          borderBottomWidth: 1,
          borderBottomColor: LINE,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 } as any}>
          {[
            {
              label: 'Year',
              value: vehYear,
              options: YEARS,
              onChange: onVehYearChange,
              placeholder: 'Select year',
              disabled: false,
            },
            {
              label: 'Make',
              value: vehMake,
              options: MAKES,
              onChange: onVehMakeChange,
              placeholder: 'Select make',
              disabled: !vehYear,
            },
            {
              label: 'Model',
              value: vehModel,
              options: vehMake ? (MODELS_BY_MAKE[vehMake] ?? []) : [],
              onChange: onVehModelChange,
              placeholder: 'Select model',
              disabled: !vehMake,
            },
            {
              label: 'Trim',
              value: vehTrim,
              options: vehModel ? TRIM_OPTIONS : [],
              onChange: setVehTrim,
              placeholder: 'Select trim',
              disabled: !vehModel,
            },
          ].map((f) => (
            <View key={f.label} style={{ width: vehicleFieldWidth } as any}>
              <Dropdown
                label={f.label}
                value={f.value}
                options={f.options}
                onChange={f.onChange}
                placeholder={f.placeholder}
                disabled={f.disabled}
              />
            </View>
          ))}
          <VehicleResetLink disabled={!hasVehicleSelection} onPress={onVehicleReset} />
        </View>
        <Pressable
          onPress={() => setSheet(true)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: LINES,
            backgroundColor: WHITE,
            paddingHorizontal: 14,
            paddingVertical: 8,
          }}
        >
          <View style={{ gap: 3 }}>
            <View style={{ width: 16, height: 2, backgroundColor: INK2 }} />
            <View style={{ width: 12, height: 2, backgroundColor: INK2, alignSelf: 'center' }} />
            <View style={{ width: 8, height: 2, backgroundColor: INK2, alignSelf: 'center' }} />
          </View>
          <Text
            style={{
              fontFamily: MONO,
              fontSize: 11.5,
              fontWeight: '500',
              letterSpacing: 0.5,
              textTransform: 'uppercase',
              color: INK,
            }}
          >
            Sort & Filter
          </Text>
          {activeCount > 0 ? (
            <View
              style={{
                minWidth: 16,
                height: 16,
                paddingHorizontal: 4,
                borderRadius: 9999,
                backgroundColor: ACCENT,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontFamily: MONO, fontSize: 10, fontWeight: '600', color: WHITE }}>{activeCount}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      {/* ============ TABLE REGION (sticky header + price col, infinite scroll) ============ */}
      {React.createElement(
        'div',
        {
          ref: regionRef,
          onScroll,
          style: { height: REGION_H, overflow: 'auto', width: '100%' },
        },
        <View style={{ width: TABLE_W } as any}>
          {/* header row */}
          <View
            style={
              {
                flexDirection: 'row',
                height: HEAD_H,
                position: 'sticky',
                top: 0,
                zIndex: 30,
                backgroundColor: WHITE,
                borderBottomWidth: 1,
                borderBottomColor: LINES,
              } as any
            }
          >
            {COLS.map((c) => {
              const sortable = !!c.sort
              const sty = c.stickyLeft
                ? ({ position: 'sticky', left: 0, zIndex: 31, backgroundColor: WHITE } as any)
                : {}
              return (
                <Pressable
                  key={c.key}
                  onPress={
                    sortable
                      ? () => {
                          if (sortKey === c.sort) setSortDir((d) => -d)
                          else {
                            setSortKey(c.sort as string)
                            setSortDir(1)
                          }
                        }
                      : undefined
                  }
                  style={{ width: c.w, paddingHorizontal: 14, justifyContent: 'center', ...sty }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={headLabel}>{c.label}</Text>
                    {sortable && sortKey === c.sort ? (
                      <Text style={{ color: ACCENT, fontSize: 11 }}>{sortDir === 1 ? '▾' : '▴'}</Text>
                    ) : null}
                  </View>
                </Pressable>
              )
            })}
          </View>

          {/* body rows */}
          {bodyRows.map((r, ri) => {
            const zebra = ri % 2 === 1
            return (
              <View key={r.id} style={{ flexDirection: 'row', height: ROW_H, backgroundColor: zebra ? ZEBRA : WHITE }}>
                {COLS.map((c) => (
                  <View
                    key={c.key}
                    style={{
                      width: c.w,
                      paddingHorizontal: 14,
                      justifyContent: 'center',
                      borderBottomWidth: 1,
                      borderBottomColor: LINE,
                      ...stickyCell(c, zebra),
                    }}
                  >
                    <Cell col={c} r={r} />
                  </View>
                ))}
              </View>
            )
          })}
        </View>,
      )}
      </Container>

      {/* ============ FILTER + SORT SHEET (extracted to PackageTableModal.web.tsx) ============ */}
      {sheet ? (
        <PackageTableModal
          onClose={() => setSheet(false)}
          tier={tier}
          setTier={setTier}
          topo={topo}
          setTopo={setTopo}
          count={count}
          setCount={setCount}
          size={size}
          setSize={setSize}
          signal={signal}
          setSignal={setSignal}
          cset={cset}
          setCset={setCset}
          camp={camp}
          setCamp={setCamp}
          sub={sub}
          setSub={setSub}
          samp={samp}
          setSamp={setSamp}
          priceMin={priceMin}
          priceMax={priceMax}
          setPriceMin={setPriceMin}
          setPriceMax={setPriceMax}
          sortKey={sortKey}
          setSortKey={setSortKey}
          sortDir={sortDir}
          setSortDir={setSortDir}
          PMIN={PMIN}
          PMAX={PMAX}
          SIGNALS={SIGNALS}
          FRONTS={FRONTS}
          COMPAMPS={COMPAMPS}
          SUBOPTS={SUBOPTS}
          SUBAMPS={SUBAMPS}
        />
      ) : null}
    </View>
  )
}
