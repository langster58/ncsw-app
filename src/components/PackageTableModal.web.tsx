import React, { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Modal, colors } from '@/ui'

// Sort & Filter modal — ported from PackagesTable.jsx (the ReactDOM.createPortal sheet
// plus its Facet and RangeSlider helpers). Web only; full-screen, portaled to
// document.body. Controlled component: all filter state + setters come from PackageTable.

const INK = colors.tableInk
const INK2 = colors.inkSoft
const INK3 = colors.inkFaint
const LINE = colors.tableLine
const LINES = colors.tableLineStrong
const ACCENT = colors.accent
const ACCENT_SOFT = colors.accentSoft
const HOV = colors.surfaceHoverNeutral
const WHITE = colors.white
const FONT = 'Inter'
const MONO = 'IBM Plex Mono'

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
          className: 'rng',
          style: { position: 'absolute', left: 0, top: 0, width: '100%', height: 16, background: 'transparent' },
          'aria-label': 'Minimum price',
        })}
        {React.createElement('input', {
          type: 'range',
          min,
          max,
          step: 10,
          value: hi,
          onChange: (e: any) => onChange(lo, Math.max(+e.target.value, lo + 10)),
          className: 'rng',
          style: { position: 'absolute', left: 0, top: 0, width: '100%', height: 16, background: 'transparent' },
          'aria-label': 'Maximum price',
        })}
      </View>
      {/* tick marks — exact from source: 5 ticks, $k labels, edge-hugging first/last */}
      {React.createElement(
        'div',
        { style: { position: 'relative', marginTop: 8, height: 16 } },
        [0, 0.25, 0.5, 0.75, 1].map((t, i, arr) => {
          const v = Math.round((min + t * (max - min)) / 100) * 100
          const isFirst = i === 0
          const isLast = i === arr.length - 1
          const xt = isFirst ? 'translateX(0)' : isLast ? 'translateX(-100%)' : 'translateX(-50%)'
          const align = isFirst ? 'flex-start' : isLast ? 'flex-end' : 'center'
          return React.createElement(
            'div',
            {
              key: i,
              style: {
                position: 'absolute',
                left: `${t * 100}%`,
                transform: xt,
                display: 'flex',
                flexDirection: 'column',
                alignItems: align,
              },
            },
            React.createElement('div', { style: { width: 1, height: 6, background: LINES, marginBottom: 4 } }),
            React.createElement(
              'span',
              { style: { fontFamily: MONO, fontSize: 10, color: INK3, whiteSpace: 'nowrap' } },
              '$' + (v / 1000).toFixed(v % 1000 ? 1 : 0) + 'k',
            ),
          )
        }),
      )}
    </View>
  )
}

// Reset / Show packages — exact: mono 12 / medium / uppercase / tracking-wide (.025em -> .3),
// rounded-lg (8), px-5 (20) py-2.5 (10). Hover: primary -> #0569b7; secondary -> ink3 border + hov bg.
function SheetButton({
  label,
  variant,
  onPress,
}: {
  label: string
  variant: 'primary' | 'secondary'
  onPress: () => void
}) {
  const [h, setH] = useState(false)
  const primary = variant === 'primary'
  const hoverProps: any = { onHoverIn: () => setH(true), onHoverOut: () => setH(false) }
  return (
    <Pressable
      onPress={onPress}
      {...hoverProps}
      style={{
        borderRadius: 8,
        borderWidth: 1,
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderColor: primary ? (h ? colors.accentHover : ACCENT) : h ? INK3 : LINES,
        backgroundColor: primary ? (h ? colors.accentHover : ACCENT) : h ? HOV : WHITE,
      }}
    >
      <Text
        style={{
          fontFamily: MONO,
          fontSize: 12,
          fontWeight: '500',
          letterSpacing: 0.3, // tracking-wide .025em * 12
          textTransform: 'uppercase',
          color: primary ? WHITE : INK,
        }}
      >
        {label}
      </Text>
    </Pressable>
  )
}

type Props = {
  onClose: () => void
  tier: string
  setTier: (v: string) => void
  topo: string
  setTopo: (v: string) => void
  count: string
  setCount: (v: string) => void
  size: string
  setSize: (v: string) => void
  signal: string
  setSignal: (v: string) => void
  cset: string
  setCset: (v: string) => void
  camp: string
  setCamp: (v: string) => void
  sub: string
  setSub: (v: string) => void
  samp: string
  setSamp: (v: string) => void
  priceMin: number
  priceMax: number
  setPriceMin: (n: number) => void
  setPriceMax: (n: number) => void
  sortKey: string
  setSortKey: (v: string) => void
  sortDir: number
  setSortDir: (n: number) => void
  PMIN: number
  PMAX: number
  SIGNALS: string[]
  FRONTS: string[]
  COMPAMPS: string[]
  SUBOPTS: string[]
  SUBAMPS: string[]
}

export function PackageTableModal(props: Props) {
  const {
    onClose,
    tier,
    setTier,
    topo,
    setTopo,
    count,
    setCount,
    size,
    setSize,
    signal,
    setSignal,
    cset,
    setCset,
    camp,
    setCamp,
    sub,
    setSub,
    samp,
    setSamp,
    priceMin,
    priceMax,
    setPriceMin,
    setPriceMax,
    sortKey,
    setSortKey,
    sortDir,
    setSortDir,
    PMIN,
    PMAX,
    SIGNALS,
    FRONTS,
    COMPAMPS,
    SUBOPTS,
    SUBAMPS,
  } = props

  return (
    <Modal open onClose={onClose} title="Sort & Filter">
      <Modal.Body>
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
      </Modal.Body>
      <Modal.Footer>
        <SheetButton
          label="Reset"
          variant="secondary"
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
        />
        <SheetButton label="Show packages" variant="primary" onPress={onClose} />
      </Modal.Footer>
    </Modal>
  )
}
