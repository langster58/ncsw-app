// Directus data access — the only file that talks to the CMS.
//
// SECURITY: the web build is a static export, so everything here runs in the
// browser. Requests are anonymous — access is granted by the read-only public
// policy in Directus, scoped to catalog collections. Never import or embed
// DIRECTUS_TOKEN (or any credential) in this file or anywhere under src/.
//
// The URL is public by nature (the browser calls it); the env var just lets a
// staging instance override it at build time.

import { Platform } from 'react-native'

const REMOTE = (
  process.env.EXPO_PUBLIC_DIRECTUS_URL ??
  process.env.DIRECTUS_URL ??
  'https://directus-latest-g9tm.onrender.com'
).replace(/\/$/, '')

// The Directus instance does not (yet) send CORS headers, so a browser JSON
// fetch straight at the Render URL fails. On the deployed site, reads go
// through the same-origin `/directus/*` rewrite in vercel.json — an edge
// proxy straight to the same anonymous public-role endpoints, no credential
// involved. Native and dev fetch the remote directly (native has no CORS;
// dev works once CORS_ENABLED/CORS_ORIGIN are set on the Render service,
// which also makes this indirection removable).
const BASE = Platform.OS === 'web' && process.env.NODE_ENV === 'production' ? '/directus' : REMOTE

export type ItemsQuery = {
  fields?: string[]
  filter?: Record<string, unknown>
  search?: string
  sort?: string[]
  limit?: number
  offset?: number
  page?: number
  groupBy?: string[]
  aggregate?: Record<string, string>
}

function buildParams(q: ItemsQuery): string {
  const p = new URLSearchParams()
  if (q.fields?.length) p.set('fields', q.fields.join(','))
  if (q.filter) p.set('filter', JSON.stringify(q.filter))
  if (q.search) p.set('search', q.search)
  if (q.sort?.length) p.set('sort', q.sort.join(','))
  if (q.limit !== undefined) p.set('limit', String(q.limit))
  if (q.offset !== undefined) p.set('offset', String(q.offset))
  if (q.page !== undefined) p.set('page', String(q.page))
  if (q.groupBy?.length) p.set('groupBy', q.groupBy.join(','))
  if (q.aggregate) for (const [fn, field] of Object.entries(q.aggregate)) p.set(`aggregate[${fn}]`, field)
  const s = p.toString()
  return s ? `?${s}` : ''
}

export class DirectusError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: { Accept: 'application/json' } })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      detail = body?.errors?.[0]?.message ?? detail
    } catch {}
    throw new DirectusError(res.status, `Directus ${res.status}: ${detail}`)
  }
  const body = await res.json()
  return body.data as T
}

/** Fetch a list of items from a collection. */
export function getItems<T>(collection: string, query: ItemsQuery = {}): Promise<T[]> {
  return request<T[]>(`/items/${collection}${buildParams(query)}`)
}

/** Fetch a single item by primary key. */
export function getItem<T>(collection: string, id: string | number, query: ItemsQuery = {}): Promise<T> {
  return request<T>(`/items/${collection}/${encodeURIComponent(String(id))}${buildParams(query)}`)
}

/** Fetch a singleton collection (e.g. homepage copy). */
export function getSingleton<T>(collection: string, query: ItemsQuery = {}): Promise<T> {
  return request<T>(`/items/${collection}${buildParams(query)}`)
}

type DirectusWriteMethod = 'POST' | 'PATCH' | 'DELETE'

async function writeRequest<T>(
  path: string,
  method: DirectusWriteMethod,
  body?: unknown,
  adminKey?: string,
): Promise<T> {
  const res = await fetch(`/api/directus${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(adminKey ? { 'x-ncsw-admin-key': adminKey } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const json = await res.json()
      detail = json?.errors?.[0]?.message ?? json?.error ?? detail
    } catch {}
    throw new DirectusError(res.status, `Directus write ${res.status}: ${detail}`)
  }
  const json = await res.json()
  return json.data as T
}

/** Create an item through the private server-side Directus proxy. */
export function createItem<T>(
  collection: string,
  item: Record<string, unknown>,
  adminKey?: string,
): Promise<T> {
  return writeRequest<T>(`/${encodeURIComponent(collection)}`, 'POST', item, adminKey)
}

/** Update an item through the private server-side Directus proxy. */
export function updateItem<T>(
  collection: string,
  id: string | number,
  item: Record<string, unknown>,
  adminKey?: string,
): Promise<T> {
  return writeRequest<T>(`/${encodeURIComponent(collection)}/${encodeURIComponent(String(id))}`, 'PATCH', item, adminKey)
}

/** Delete an item through the private server-side Directus proxy. */
export function deleteItem<T>(
  collection: string,
  id: string | number,
  adminKey?: string,
): Promise<T> {
  return writeRequest<T>(`/${encodeURIComponent(collection)}/${encodeURIComponent(String(id))}`, 'DELETE', undefined, adminKey)
}

/**
 * URL for a Directus file asset, with optional server-side resizing.
 * Works identically on web and native (plain https URL).
 */
export function assetUrl(
  fileId: string,
  opts: { width?: number; height?: number; quality?: number; format?: 'webp' | 'jpg' | 'png' } = {},
): string {
  const p = new URLSearchParams()
  if (opts.width) p.set('width', String(opts.width))
  if (opts.height) p.set('height', String(opts.height))
  if (opts.quality) p.set('quality', String(opts.quality))
  if (opts.format) p.set('format', opts.format)
  const s = p.toString()
  return `${BASE}/assets/${fileId}${s ? `?${s}` : ''}`
}
