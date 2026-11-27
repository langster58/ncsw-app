import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { IconClose, colors, fonts } from '@/ui'
import { fetchMakes, fetchModels, fetchYears } from '@/lib/packages'

// CarPicker — the phone version of "find your car": a full-screen picker that a
// button opens (Brett, 2026-11-27: a directive and a button, opening a
// full-screen picker; not dropdown-looking fields).
//
// Three steps on one screen: Year, then Make, then Model. Make and Model have a
// search box (the lists run long). A breadcrumb at the top shows the picks so
// far; tapping an earlier one goes back to that step. Choosing the model is the
// confirmation: the picker hands the car to onDone.
//
// Built as a modal dialog (react-native-web's Modal renders role="dialog",
// aria-modal, and keeps focus inside). The web-only parts it adds itself:
//  - the phone's back button closes the picker (one history entry while open),
//  - the page behind does not scroll while it is open.

export type Car = { year: string; make: string; model: string }
type Step = 'year' | 'make' | 'model'

export function CarPicker({ open, initial, onClose, onDone }: {
  open: boolean
  initial?: Partial<Car> | null
  onClose: () => void
  onDone: (car: Car) => void
}) {
  const [years, setYears] = useState<string[]>([])
  const [makes, setMakes] = useState<string[]>([])
  const [models, setModels] = useState<string[]>([])
  const [year, setYear] = useState('')
  const [make, setMake] = useState('')
  const [step, setStep] = useState<Step>('year')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Each opening starts from the car already chosen, if any: on its model list,
  // so changing just the model is one tap.
  useEffect(() => {
    if (!open) return
    setQuery(''); setError('')
    if (!years.length) fetchYears().then(setYears).catch(() => setError('Could not load the years. Please try again.'))
    if (initial?.year && initial?.make) {
      setYear(initial.year); setMake(initial.make); setStep('model')
      setLoading(true)
      Promise.all([fetchMakes(initial.year), fetchModels(initial.year, initial.make)])
        .then(([mk, md]) => { setMakes(mk); setModels(md) })
        .catch(() => setError('Could not load the models. Please try again.'))
        .finally(() => setLoading(false))
    } else {
      setYear(''); setMake(''); setStep('year')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Back button closes the picker; the page behind stays still while it is open.
  const closedByBack = useRef(false)
  useEffect(() => {
    if (!open || Platform.OS !== 'web' || typeof window === 'undefined') return
    closedByBack.current = false
    window.history.pushState({ ncswCarPicker: true }, '')
    const onPop = () => { closedByBack.current = true; onClose() }
    window.addEventListener('popstate', onPop)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('popstate', onPop)
      document.body.style.overflow = prevOverflow
      // closed by the close button or a pick: drop the history entry we added
      if (!closedByBack.current && window.history.state?.ncswCarPicker) window.history.back()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function pickYear(y: string) {
    setYear(y); setMake(''); setMakes([]); setModels([]); setQuery(''); setStep('make')
    setLoading(true)
    fetchMakes(y).then(setMakes).catch(() => setError('Could not load the makes. Please try again.')).finally(() => setLoading(false))
  }
  function pickMake(m: string) {
    setMake(m); setModels([]); setQuery(''); setStep('model')
    setLoading(true)
    fetchModels(year, m).then(setModels).catch(() => setError('Could not load the models. Please try again.')).finally(() => setLoading(false))
  }
  function pickModel(m: string) {
    onDone({ year, make, model: m })
  }
  function goTo(s: Step) {
    setQuery(''); setStep(s)
  }

  const list = step === 'year' ? years : step === 'make' ? makes : models
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? list.filter((x) => x.toLowerCase().includes(q)) : list
  }, [list, query])
  const current = step === 'year' ? year : step === 'make' ? make : initial?.model ?? ''
  const onPick = step === 'year' ? pickYear : step === 'make' ? pickMake : pickModel
  const title = step === 'year' ? 'Select the year' : step === 'make' ? 'Select the make' : 'Select the model'

  return (
    <Modal visible={open} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.white, height: '100dvh' } as any}>
        {/* Header: title and close */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 20, paddingRight: 8, minHeight: 56, borderBottomWidth: 1, borderBottomColor: colors.line }}>
          <Text accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: 18, color: colors.ink }}>{title}</Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
            <IconClose size={18} color={colors.ink} />
          </Pressable>
        </View>

        {/* Breadcrumb: the picks so far; an earlier step is a tap back */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingVertical: 12 }}>
          <Crumb label={year || 'Year'} active={step === 'year'} onPress={step !== 'year' ? () => goTo('year') : undefined} />
          <Text style={{ color: colors.inkFaint }}>›</Text>
          <Crumb label={make || 'Make'} active={step === 'make'} onPress={step === 'model' ? () => goTo('make') : undefined} dim={!year} />
          <Text style={{ color: colors.inkFaint }}>›</Text>
          <Crumb label="Model" active={step === 'model'} dim={!make} />
        </View>

        {/* Search, where the list runs long */}
        {step !== 'year' ? (
          <View style={{ paddingHorizontal: 20, paddingBottom: 10 }}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={step === 'make' ? 'Search makes' : 'Search models'}
              placeholderTextColor={colors.inkFaint}
              autoCorrect={false}
              autoCapitalize="none"
              accessibilityLabel={step === 'make' ? 'Search makes' : 'Search models'}
              style={{ fontFamily: fonts.body, fontSize: 16, color: colors.ink, height: 44, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 8 } as any}
            />
          </View>
        ) : null}

        {/* The list */}
        {loading ? (
          <View style={{ padding: 32 }}><ActivityIndicator color={colors.ink} /></View>
        ) : (
          <ScrollView style={{ flex: 1, overscrollBehavior: 'contain' } as any} keyboardShouldPersistTaps="handled">
            {shown.map((x) => {
              const on = x === current
              return (
                <Pressable
                  key={x}
                  onPress={() => onPick(x)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={({ pressed }: any) => ({
                    minHeight: 52, justifyContent: 'center', paddingHorizontal: 20,
                    borderBottomWidth: 1, borderBottomColor: colors.line,
                    backgroundColor: pressed ? colors.surfacePressed : on ? colors.accentSoft : colors.white,
                  })}
                >
                  <Text style={{ fontFamily: fonts.body, fontSize: 17, color: on ? colors.accent : colors.ink }}>{x}</Text>
                </Pressable>
              )
            })}
            {!shown.length && !error ? (
              <Text style={{ fontFamily: fonts.body, fontSize: 15, color: colors.gray, padding: 20 }}>No match for “{query}”.</Text>
            ) : null}
            {error ? <Text style={{ fontFamily: fonts.body, fontSize: 15, color: colors.gray, padding: 20 }}>{error}</Text> : null}
            <View style={{ height: 24 }} />
          </ScrollView>
        )}
      </View>
    </Modal>
  )
}

function Crumb({ label, active, onPress, dim }: { label: string; active: boolean; onPress?: () => void; dim?: boolean }) {
  const style = {
    fontFamily: fonts.body, fontSize: 14, fontWeight: active ? '600' : '400',
    color: active ? colors.ink : dim ? colors.inkFaint : colors.accent,
    textDecorationLine: onPress ? 'underline' : 'none',
  } as any
  if (!onPress) return <Text style={style}>{label}</Text>
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Change ${label}`} hitSlop={10}>
      <Text style={style}>{label}</Text>
    </Pressable>
  )
}
