import React from 'react'
import { Image as RNImage, Platform } from 'react-native'

// Image atom — abstracts web <img> and native Image so the rest of the system
// never branches on platform when displaying a bitmap. Pass an absolute path
// (e.g. "/images/foo.webp") served from /public.

type Props = {
  src: string
  alt?: string
  fill?: boolean // fill parent
  objectFit?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down'
  style?: any
}

const FIT_TO_RESIZE: Record<string, 'cover' | 'contain' | 'stretch' | 'center'> = {
  cover: 'cover',
  contain: 'contain',
  fill: 'stretch',
  none: 'center',
  'scale-down': 'contain',
}

export function Image({ src, alt = '', fill, objectFit = 'cover', style }: Props) {
  if (Platform.OS === 'web') {
    const base: any = { display: 'block', objectFit }
    const fillStyle = fill ? { width: '100%', height: '100%' } : {}
    return React.createElement('img', {
      src,
      alt,
      style: { ...base, ...fillStyle, ...style },
    })
  }
  const resize = FIT_TO_RESIZE[objectFit] ?? 'cover'
  return (
    <RNImage
      source={{ uri: src }}
      accessibilityLabel={alt}
      resizeMode={resize}
      style={[fill ? { width: '100%', height: '100%' } : null, style]}
    />
  )
}
