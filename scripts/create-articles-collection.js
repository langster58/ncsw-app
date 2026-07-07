#!/usr/bin/env node
// Run: node --env-file=.env scripts/create-articles-collection.js
//
// Creates the `articles` collection (blog / editorial) in Directus with the
// common blog-post fields plus the "component set" fields that let a piece
// embed the site's data figures (value-frontier scatter, blind-amp bars, DSP
// curve) inline — see src/components/Editorial.tsx for the shape.
//
// Idempotent guard: aborts if the collection already exists.

const URL = (process.env.DIRECTUS_URL || 'https://directus-latest-g9tm.onrender.com').replace(/\/$/, '')
const TOKEN = process.env.DIRECTUS_TOKEN
if (!TOKEN) { console.error('Missing DIRECTUS_TOKEN'); process.exit(1) }
const H = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }

const fields = [
  // ── system / primary key ────────────────────────────────────────────────
  { field: 'id', type: 'uuid',
    meta: { hidden: true, readonly: true, interface: 'input', special: ['uuid'] },
    schema: { is_primary_key: true, length: 36, has_auto_increment: false } },

  { field: 'status', type: 'string',
    meta: { interface: 'select-dropdown', width: 'half', display: 'labels', note: 'Only "published" articles get a page at build time.',
      options: { choices: [
        { text: 'Published', value: 'published' },
        { text: 'Draft', value: 'draft' },
        { text: 'Archived', value: 'archived' } ] } },
    schema: { default_value: 'draft', is_nullable: false } },

  { field: 'sort', type: 'integer', meta: { interface: 'input', hidden: true }, schema: {} },

  { field: 'date_created', type: 'timestamp',
    meta: { special: ['date-created'], interface: 'datetime', readonly: true, hidden: true, width: 'half', display: 'datetime', display_options: { relative: true } }, schema: {} },
  { field: 'date_updated', type: 'timestamp',
    meta: { special: ['date-updated'], interface: 'datetime', readonly: true, hidden: true, width: 'half', display: 'datetime', display_options: { relative: true } }, schema: {} },

  // ── identity / routing ──────────────────────────────────────────────────
  { field: 'title', type: 'string',
    meta: { interface: 'input', required: true, width: 'full', note: 'Article headline.' },
    schema: { is_nullable: false } },
  { field: 'slug', type: 'string',
    meta: { interface: 'input', required: true, width: 'half', options: { slug: true, trim: true }, note: 'URL segment, e.g. sub-value-frontier' },
    schema: { is_nullable: false, is_unique: true } },
  { field: 'category', type: 'string',
    meta: { interface: 'select-dropdown', width: 'half', note: 'Editorial grouping.',
      options: { allowOther: true, choices: [
        { text: 'Methodology', value: 'methodology' },
        { text: 'Guide', value: 'guide' },
        { text: 'Review', value: 'review' },
        { text: 'Build Log', value: 'build-log' },
        { text: 'News', value: 'news' } ] } }, schema: {} },

  // ── byline / dates ──────────────────────────────────────────────────────
  { field: 'author', type: 'string',
    meta: { interface: 'input', width: 'half', note: 'Byline (Person). Defaults to Brett Combs.' },
    schema: { default_value: 'Brett Combs' } },
  { field: 'publish_date', type: 'timestamp',
    meta: { interface: 'datetime', width: 'half', display: 'datetime', note: 'Displayed publish date / schema datePublished.' }, schema: {} },
  { field: 'reading_time', type: 'string',
    meta: { interface: 'input', width: 'half', note: 'e.g. "8 min read".' }, schema: {} },

  // ── card / hero framing (the Editorial "piece" shape) ───────────────────
  { field: 'kicker', type: 'string',
    meta: { interface: 'input', width: 'half', note: 'Eyebrow/section label shown above the title.' }, schema: {} },
  { field: 'excerpt', type: 'text',
    meta: { interface: 'input-multiline', width: 'full', note: 'Deck / summary. Falls back to meta description.' }, schema: {} },
  { field: 'cta_label', type: 'string',
    meta: { interface: 'input', width: 'half', note: 'The "door" link label, e.g. "Read the analysis".' }, schema: {} },
  { field: 'hero_image', type: 'uuid',
    meta: { interface: 'file-image', special: ['file'], width: 'full', note: 'Lead image / OpenGraph image.' }, schema: {} },

  // ── body + component set ────────────────────────────────────────────────
  { field: 'body', type: 'text',
    meta: { interface: 'input-rich-text-md', width: 'full', note: 'Main article body (Markdown — rendered to HTML at build for crawlers).' }, schema: {} },
  { field: 'figures', type: 'json',
    meta: { interface: 'input-code', width: 'full', options: { language: 'json' },
      note: 'Embedded data-figure components: [{ "type": "frontier|blind_amp|dsp|image", "data": {}, "caption": "" }]. See Editorial.tsx.' }, schema: {} },
  { field: 'gallery', type: 'json',
    meta: { interface: 'list', width: 'full', note: 'Optional inline images (file ids).' }, schema: {} },

  // ── taxonomy / flags ────────────────────────────────────────────────────
  { field: 'tags', type: 'json',
    meta: { interface: 'tags', width: 'half', note: 'Freeform topic tags.' }, schema: {} },
  { field: 'featured', type: 'boolean',
    meta: { interface: 'boolean', width: 'half', note: 'Surface on the homepage editorial grid.' }, schema: { default_value: false } },

  // ── SEO overrides ───────────────────────────────────────────────────────
  { field: 'seo_title', type: 'string',
    meta: { interface: 'input', width: 'half', note: 'Overrides <title>. Falls back to title.' }, schema: {} },
  { field: 'seo_description', type: 'text',
    meta: { interface: 'input-multiline', width: 'full', note: 'Meta description. Falls back to excerpt.' }, schema: {} },
  { field: 'canonical_url', type: 'string',
    meta: { interface: 'input', width: 'half', note: 'Optional canonical URL override.' }, schema: {} },
]

const payload = {
  collection: 'articles',
  meta: {
    icon: 'article',
    note: 'Blog / editorial articles (Brett Combs byline). Renders the article template.',
    display_template: '{{title}}',
    sort_field: 'sort',
    archive_field: 'status', archive_value: 'archived', unarchive_value: 'draft',
    singleton: false,
  },
  schema: {},
  fields,
}

// Guard: does it already exist?
const check = await fetch(`${URL}/collections/articles`, { headers: H })
if (check.ok) { console.error('`articles` collection already exists — aborting (no changes made).'); process.exit(1) }
if (check.status !== 403 && check.status !== 404) {
  console.error(`Unexpected status probing collection: ${check.status} ${(await check.text()).slice(0, 200)}`); process.exit(1)
}

const res = await fetch(`${URL}/collections`, { method: 'POST', headers: H, body: JSON.stringify(payload) })
if (!res.ok) {
  console.error(`Create failed ${res.status}: ${(await res.text()).slice(0, 500)}`); process.exit(1)
}
const body = await res.json()
console.log(`Created collection "${body?.data?.collection}" with ${fields.length} fields.`)
