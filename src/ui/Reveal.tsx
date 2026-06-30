import React, { useEffect, useRef } from 'react'
import { Platform } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'

// Scroll-triggered reveal: slide up 24px + fade in.
// Web: IntersectionObserver (threshold 0.15) toggles the .ncsw-reveal CSS class
//   (defined in public/ncsw.css), which respects prefers-reduced-motion.
// Native: reanimated mount animation (true scroll-trigger on native is deferred).

const EXPO_OUT = Easing.bezier(0.16, 1, 0.3, 1)

export function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  if (Platform.OS === 'web') return <RevealWeb delay={delay}>{children}</RevealWeb>
  return <RevealNative delay={delay}>{children}</RevealNative>
}

function RevealWeb({ children, delay }: { children: React.ReactNode; delay: number }) {
  const ref = useRef<any>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof window === 'undefined') return
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      el.classList.add('is-in')
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            el.style.transitionDelay = `${delay}ms`
            el.classList.add('is-in')
            io.unobserve(el)
          }
        })
      },
      { threshold: 0.15 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [delay])
  return React.createElement('div', { ref, className: 'ncsw-reveal' }, children)
}

function RevealNative({ children, delay }: { children: React.ReactNode; delay: number }) {
  const opacity = useSharedValue(0)
  const ty = useSharedValue(24)
  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: 700, easing: EXPO_OUT }))
    ty.value = withDelay(delay, withTiming(0, { duration: 700, easing: EXPO_OUT }))
  }, [delay, opacity, ty])
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: ty.value }],
  }))
  return <Animated.View style={style}>{children}</Animated.View>
}
