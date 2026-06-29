import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, Text, View } from 'react-native'

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

const INK = '#16181d'
const INK2 = '#5b6270'
const INK3 = '#8b92a1'
const LINE = '#e7e9ee'
const LINES = '#d3d7e0'
const ZEBRA = '#fafbfc'
const ACCENT = '#0576cc'
const ACCENT_SOFT = '#e6f1fb'
const WHITE = '#ffffff'
const FONT = 'Inter'
const MONO = 'IBM Plex Mono'
const GX = 20 // px-[var(--gx)]

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

/* ---------------- Sort & Filter sheet pieces ---------------- */
function Facet({
  label,
  value,
  opts,
  onPick,
  pick,
}: {
  label: string
  value: string
  opts: string[]
  onPick: (v: string) => void
  pick?: string
}) {
  return (
    <View style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: LINE }}>
      <Text
        style={{
          fontFamily: MONO,
          fontSize: 10.5,
          fontWeight: '500',
          letterSpacing: 0.735, // .07em * 10.5
          textTransform: 'uppercase',
          color: INK3,
          marginBottom: 10,
        }}
      >
        {label}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {opts.map((o) => {
          const on = o === value
          const isPick = !!pick && o === pick
          const bg = on ? ACCENT_SOFT : WHITE
          const color = on ? ACCENT : isPick ? ACCENT : INK2
          const border = on ? ACCENT : LINES
          return (
            <Pressable
              key={o}
              onPress={() => onPick(o)}
              style={{
                borderRadius: 9999,
                paddingHorizontal: 14,
                paddingVertical: 6,
                borderWidth: 1,
                borderColor: border,
                backgroundColor: bg,
              }}
            >
              <Text style={{ fontFamily: FONT, fontSize: 13.5, fontWeight: on ? '600' : isPick ? '500' : '400', color }}>
                {o}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

function RangeSlider({
  min,
  max,
  lo,
  hi,
  onChange,
}: {
  min: number
  max: number
  lo: number
  hi: number
  onChange: (a: number, b: number) => void
}) {
  const money = (v: number) => '$' + v.toLocaleString('en-US')
  const pct = (v: number) => ((v - min) / (max - min)) * 100
  return (
    <View style={{ paddingTop: 4 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 }}>
        <Text style={{ fontFamily: MONO, fontSize: 13, fontWeight: '600', color: INK }}>{money(lo)}</Text>
        <Text style={{ fontFamily: MONO, fontSize: 13, fontWeight: '600', color: INK }}>
          {hi >= max ? money(hi) + '+' : money(hi)}
        </Text>
      </View>
      <View style={{ position: 'relative', height: 16 } as any}>
        <View
          style={
            { position: 'absolute', left: 0, right: 0, top: 6, height: 3, borderRadius: 9999, backgroundColor: LINES } as any
          }
        />
        <View
          style={
            {
              position: 'absolute',
              top: 6,
              height: 3,
              borderRadius: 9999,
              backgroundColor: ACCENT,
              left: `${pct(lo)}%`,
              right: `${100 - pct(hi)}%`,
            } as any
          }
        />
        {React.createElement('input', {
          type: 'range',
          min,
          max,
          step: 10,
          value: lo,
          onChange: (e: any) => onChange(Math.min(+e.target.value, hi - 10), hi),
          style: { position: 'absolute', left: 0, top: 0, width: '100%', background: 'transparent' },
          'aria-label': 'Minimum price',
        })}
        {React.createElement('input', {
          type: 'range',
          min,
          max,
          step: 10,
          value: hi,
          onChange: (e: any) => onChange(lo, Math.max(+e.target.value, lo + 10)),
          style: { position: 'absolute', left: 0, top: 0, width: '100%', background: 'transparent' },
          'aria-label': 'Maximum price',
        })}
      </View>
    </View>
  )
}

/* ---------------- main table ---------------- */
export function PackageTable() {
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
    <View style={{ backgroundColor: WHITE, width: '100%', overflow: 'hidden' } as any}>
      {/* ============ TOP CHROME: vehicle selector + Sort & Filter ============ */}
      <View
        style={{
          paddingHorizontal: GX,
          paddingTop: 12,
          paddingBottom: 12,
          borderBottomWidth: 1,
          borderBottomColor: LINE,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        }}
      >
        {['Year', 'Make', 'Model', 'Trim'].map((label, i) => (
          <View
            key={label}
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: LINES,
              backgroundColor: WHITE,
              paddingHorizontal: 12,
              paddingVertical: 8,
              opacity: i === 0 ? 1 : 0.35, // Make/Model/Trim disabled until prior chosen (no vehicle data)
            }}
          >
            <Text
              style={{
                fontFamily: MONO,
                fontSize: 10.5,
                fontWeight: '500',
                letterSpacing: 0.735,
                textTransform: 'uppercase',
                color: INK3,
              }}
            >
              {label}
            </Text>
            <Text style={{ fontFamily: MONO, fontSize: 13, color: INK3 }}>⌄</Text>
          </View>
        ))}
        <View style={{ width: 12 }} />
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
          style: { height: REGION_H, overflow: 'auto', paddingLeft: GX, paddingRight: GX },
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

      {/* ============ FILTER + SORT SHEET (createPortal -> fixed overlay) ============ */}
      {sheet
        ? React.createElement(
            'div',
            { style: { position: 'fixed', inset: 0, zIndex: 200 } },
            <>
              <Pressable
                onPress={() => setSheet(false)}
                style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(16,24,29,0.42)' } as any}
              />
              <View
                style={
                  {
                    position: 'absolute',
                    right: 0,
                    top: 0,
                    bottom: 0,
                    width: 'min(420px, 100%)',
                    backgroundColor: WHITE,
                    flexDirection: 'column',
                    boxShadow: '0 -8px 40px rgba(16,24,40,.18)',
                  } as any
                }
              >
                {/* header */}
                <Pressable
                  onPress={() => setSheet(false)}
                  style={{
                    height: 56,
                    paddingHorizontal: 24,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottomWidth: 1,
                    borderBottomColor: LINE,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: MONO,
                      fontSize: 11,
                      fontWeight: '600',
                      letterSpacing: 1.32, // .12em * 11
                      textTransform: 'uppercase',
                      color: INK,
                    }}
                  >
                    Sort & Filter
                  </Text>
                  <Text style={{ color: INK, fontSize: 18 }}>✕</Text>
                </Pressable>

                {/* body */}
                {React.createElement(
                  'div',
                  { style: { flex: 1, minHeight: 0, overflowY: 'auto' } },
                  <View style={{ paddingHorizontal: 24, paddingVertical: 16 }}>
                    <View style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: LINE }}>
                      <Text
                        style={{
                          fontFamily: MONO,
                          fontSize: 10.5,
                          fontWeight: '500',
                          letterSpacing: 0.735,
                          textTransform: 'uppercase',
                          color: INK3,
                          marginBottom: 10,
                        }}
                      >
                        Price range
                      </Text>
                      <RangeSlider
                        min={PMIN}
                        max={PMAX}
                        lo={priceMin}
                        hi={priceMax}
                        onChange={(a, b) => {
                          setPriceMin(a)
                          setPriceMax(b)
                        }}
                      />
                    </View>
                    <Facet label="Tier" value={tier} opts={['All', 'Entry', 'Mid', 'Upper', 'Reference', 'Beyond']} onPick={setTier} />
                    <Facet label="Topology" value={topo} opts={['All', '2-way', '3-way']} onPick={setTopo} />
                    <Facet label="Input signal" value={signal} opts={['NCSW Pick', ...SIGNALS]} pick="NCSW Pick" onPick={setSignal} />
                    <Facet label="Component set" value={cset} opts={['NCSW Pick', ...FRONTS]} pick="NCSW Pick" onPick={setCset} />
                    <Facet label="Component amp" value={camp} opts={['NCSW Pick', ...COMPAMPS]} pick="NCSW Pick" onPick={setCamp} />
                    <Facet label="Subwoofer" value={sub} opts={['NCSW Pick', ...SUBOPTS]} pick="NCSW Pick" onPick={setSub} />
                    <Facet label="Sub amp" value={samp} opts={['NCSW Pick', ...SUBAMPS]} pick="NCSW Pick" onPick={setSamp} />
                    <Facet label="Sub count" value={count} opts={['All', 'Single', 'Dual']} onPick={setCount} />
                    <Facet label="Sub size" value={size} opts={['All', '10"', '12"', '15"', '18"']} onPick={setSize} />
                    <Facet
                      label="Sort by"
                      value={sortKey === 'price' ? (sortDir === 1 ? 'Price: low to high' : 'Price: high to low') : 'Tier'}
                      opts={['Price: low to high', 'Price: high to low', 'Tier']}
                      onPick={(v) => {
                        if (v === 'Tier') {
                          setSortKey('tier')
                          setSortDir(1)
                        } else {
                          setSortKey('price')
                          setSortDir(v.includes('low to high') ? 1 : -1)
                        }
                      }}
                    />
                  </View>,
                )}

                {/* footer */}
                <View style={{ paddingHorizontal: 24 }}>
                  <View
                    style={{
                      paddingVertical: 12,
                      borderTopWidth: 1,
                      borderTopColor: LINE,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                      gap: 8,
                    }}
                  >
                    <Pressable
                      onPress={() => {
                        setTier('All')
                        setTopo('All')
                        setCount('All')
                        setSize('All')
                        setSignal('NCSW Pick')
                        setCset('NCSW Pick')
                        setCamp('NCSW Pick')
                        setSub('NCSW Pick')
                        setSamp('NCSW Pick')
                        setPriceMin(PMIN)
                        setPriceMax(PMAX)
                        setSortKey('price')
                        setSortDir(1)
                      }}
                      style={{
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: LINES,
                        backgroundColor: WHITE,
                        paddingHorizontal: 20,
                        paddingVertical: 10,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: MONO,
                          fontSize: 12,
                          fontWeight: '500',
                          letterSpacing: 0.6,
                          textTransform: 'uppercase',
                          color: INK,
                        }}
                      >
                        Reset
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setSheet(false)}
                      style={{
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: ACCENT,
                        backgroundColor: ACCENT,
                        paddingHorizontal: 20,
                        paddingVertical: 10,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: MONO,
                          fontSize: 12,
                          fontWeight: '500',
                          letterSpacing: 0.6,
                          textTransform: 'uppercase',
                          color: WHITE,
                        }}
                      >
                        Show packages
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            </>,
          )
        : null}
    </View>
  )
}
