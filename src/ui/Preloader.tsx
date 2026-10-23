import React, { useEffect, useState } from 'react'
import { Platform } from 'react-native'
import { colors } from './tokens'

// First-visit preloader: NCSW wordmark fades in on a white field, holds, then
// dissolves. Web only; skipped entirely on native. Shown once per session
// (sessionStorage 'ncsw_preloaded'); skipped under prefers-reduced-motion.

export function Preloader() {
  if (Platform.OS !== 'web') return null
  return <PreloaderWeb />
}

type Phase = 'init' | 'visible' | 'hidden' | 'gone'

function PreloaderWeb() {
  const [phase, setPhase] = useState<Phase>('init')

  // Whether to skip cannot be decided during render: the page is statically
  // rendered and then hydrated, so reading sessionStorage or matchMedia at render
  // time would disagree with the server HTML. The skip is therefore scheduled a
  // frame out rather than set synchronously here — invisible either way, because
  // the overlay is fully transparent while the phase is still 'init'.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const seen = window.sessionStorage.getItem('ncsw_preloaded')
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.sessionStorage.setItem('ncsw_preloaded', '1')
    if (seen || reduce) {
      const skip = requestAnimationFrame(() => setPhase('gone'))
      return () => cancelAnimationFrame(skip)
    }
    const r = requestAnimationFrame(() => setPhase('visible'))
    const t1 = setTimeout(() => setPhase('hidden'), 900)
    const t2 = setTimeout(() => setPhase('gone'), 1500)
    return () => {
      cancelAnimationFrame(r)
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [])

  if (phase === 'gone') return null
  const opacity = phase === 'visible' ? 1 : 0
  return React.createElement(
    'div',
    {
      style: {
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: colors.white,
        opacity,
        transition: 'opacity .5s ease',
        pointerEvents: 'none',
      },
    },
    React.createElement('img', {
      src: '/brand/NCSW-wordmark-full.svg',
      alt: 'North Coast Soundworks',
      style: { width: '60vw', height: 'auto' },
    }),
  )
}
