import React, { useEffect, useState } from 'react'
import { Platform, Text, View, useWindowDimensions } from 'react-native'
import { Button, Dropdown, Link, colors, fonts, type, useFluidPx } from '@/ui'
import { fetchMakes, fetchModels, fetchYears } from '@/lib/packages'

// VehicleFinder — year, make, model, then straight to the systems for that
// vehicle. Lives on the homepage's first screen (id "find", which the menu's
// "Find your car" points at) and again at the end of the page. Trim and the
// factory sound system are asked on the vehicle's own page, not here.
//
// Until the vehicle pages exist, "See systems" opens the packages page with the
// vehicle already chosen (/packages?year=&make=&model=).
//
// The last vehicle entered is remembered in this browser so a returning visitor
// sees "Your 2015 Honda CR-V: see systems" instead of empty fields.

const STORE_KEY = 'ncsw_vehicle'

type Picked = { year: string; make: string; model: string }

function systemsHref(v: Picked) {
  const q = new URLSearchParams({ year: v.year, make: v.make, model: v.model })
  return `/packages?${q.toString()}`
}

function readRemembered(): Picked | null {
  try {
    const raw = window.localStorage.getItem(STORE_KEY)
    if (!raw) return null
    const v = JSON.parse(raw)
    return v && v.year && v.make && v.model ? (v as Picked) : null
  } catch {
    return null
  }
}

function remember(v: Picked) {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(v))
  } catch {
    // private window or storage blocked: the finder still works, it just won't remember
  }
}

export function VehicleFinder({ nativeID }: { nativeID?: string }) {
  const { width } = useWindowDimensions()
  const narrow = width <= 760
  const [years, setYears] = useState<string[]>([])
  const [makes, setMakes] = useState<string[]>([])
  const [models, setModels] = useState<string[]>([])
  const [year, setYear] = useState('')
  const [make, setMake] = useState('')
  const [model, setModel] = useState('')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState<Picked | null>(null)
  const noteSize = useFluidPx(type.small)

  useEffect(() => {
    fetchYears().then(setYears).catch(() => setError('Could not reach the vehicle list. Please try again.'))
  }, [])

  // The remembered vehicle is read after the first paint: the page is rendered
  // ahead of time without it, and reading storage during render would disagree.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return
    const r = requestAnimationFrame(() => setSaved(readRemembered()))
    return () => cancelAnimationFrame(r)
  }, [])

  function pickYear(v: string) {
    setYear(v); setMake(''); setModel(''); setMakes([]); setModels([])
    fetchMakes(v).then(setMakes).catch(() => setError('Could not load makes.'))
  }
  function pickMake(v: string) {
    setMake(v); setModel(''); setModels([])
    fetchModels(year, v).then(setModels).catch(() => setError('Could not load models.'))
  }

  const ready = !!(year && make && model)
  function go() {
    if (!ready) return
    const v = { year, make, model }
    remember(v)
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.location.href = systemsHref(v)
  }

  return (
    <View nativeID={nativeID} style={{ gap: 14 } as any}>
      {saved ? (
        <Link variant="cta" href={systemsHref(saved)}>
          {`Your ${saved.year} ${saved.make} ${saved.model}: see systems`}
        </Link>
      ) : null}
      {/* One row that fills the width at every screen size: year, make, model,
          then the button. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: narrow ? 6 : 10, width: '100%' } as any}>
        {/* Three equal widths, whatever the label length. */}
        <View style={{ flex: 1, flexBasis: 0, minWidth: 0 } as any}>
          <Dropdown label="Year" value={year} options={years} onChange={pickYear} labelOnly nativeOnTouch />
        </View>
        <View style={{ flex: 1, flexBasis: 0, minWidth: 0 } as any}>
          <Dropdown label="Make" value={make} options={makes} onChange={pickMake} disabled={!year} labelOnly nativeOnTouch />
        </View>
        <View style={{ flex: 1, flexBasis: 0, minWidth: 0 } as any}>
          <Dropdown label="Model" value={model} options={models} onChange={setModel} disabled={!make} labelOnly nativeOnTouch />
        </View>
        <Button variant="primary" size="control" disabled={!ready} onPress={go}>
          See systems
        </Button>
      </View>
      {error ? (
        <Text style={{ fontFamily: fonts.body, fontSize: noteSize, color: colors.gray } as any}>{error}</Text>
      ) : null}
    </View>
  )
}
