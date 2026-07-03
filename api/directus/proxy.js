const ALLOWED_COLLECTION = /^[A-Za-z0-9_]+$/

function getConfig() {
  const url = process.env.DIRECTUS_URL || process.env.EXPO_PUBLIC_DIRECTUS_URL
  const token = process.env.DIRECTUS_TOKEN
  const adminKey = process.env.NCSW_ADMIN_KEY

  if (!url) return { error: 'DIRECTUS_URL is not configured' }
  if (!token) return { error: 'DIRECTUS_TOKEN is not configured' }

  return {
    baseUrl: url.replace(/\/$/, ''),
    token,
    adminKey,
  }
}

function isWrite(method) {
  return method !== 'GET' && method !== 'HEAD'
}

function requireAdminKey(req, config) {
  if (!isWrite(req.method)) return null
  if (!config.adminKey) return 'NCSW_ADMIN_KEY is not configured'
  if (req.headers['x-ncsw-admin-key'] !== config.adminKey) return 'Invalid admin key'
  return null
}

function sendJson(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

function directusQuery(req, skipKeys) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(req.query || {})) {
    if (skipKeys.has(key) || value === undefined) continue
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, item)
    } else {
      params.set(key, value)
    }
  }
  const query = params.toString()
  return query ? `?${query}` : ''
}

async function readBody(req) {
  if (req.body !== undefined) return req.body

  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  if (!chunks.length) return undefined

  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw) return undefined

  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

async function proxyDirectus(req, res, collection, id) {
  if (!ALLOWED_COLLECTION.test(collection)) {
    sendJson(res, 400, { error: 'Invalid Directus collection' })
    return
  }

  const config = getConfig()
  if (config.error) {
    sendJson(res, 500, { error: config.error })
    return
  }

  const adminError = requireAdminKey(req, config)
  if (adminError) {
    sendJson(res, 401, { error: adminError })
    return
  }

  const query = directusQuery(req, new Set(['collection', 'id']))
  const path = `/items/${encodeURIComponent(collection)}${id ? `/${encodeURIComponent(id)}` : ''}${query}`
  const body = isWrite(req.method) && req.method !== 'DELETE' ? await readBody(req) : undefined

  const upstream = await fetch(`${config.baseUrl}${path}`, {
    method: req.method,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${config.token}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  const text = await upstream.text()
  res.statusCode = upstream.status
  res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
  res.end(text)
}

module.exports = {
  proxyDirectus,
}
