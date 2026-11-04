import React from 'react'
import { Platform } from 'react-native'

// Business details for machines (schema.org JSON-LD). Rendered in the page body,
// which Google and LLM crawlers read the same as the head — expo-router's <Head>
// drops <script> children when the page is rendered ahead of time, which is why
// the article's details never reached its published page.
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  if (Platform.OS !== 'web') return null
  return React.createElement('script', {
    type: 'application/ld+json',
    dangerouslySetInnerHTML: { __html: JSON.stringify(data) },
  })
}
