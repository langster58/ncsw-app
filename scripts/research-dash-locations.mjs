#!/usr/bin/env node

/**
 * Read-only research queue for factory_audio_layouts whose populated dash
 * location lacks a usable size. It uses Brave to find fit guides and detailed
 * owner-install/forum evidence; it never changes Directus.
 *
 * Usage:
 *   node --env-file=.env scripts/research-dash-locations.mjs --make=BMW --output=/tmp/bmw-dash-research.json
 */

import { readFile, writeFile } from 'node:fs/promises';

const args = parseArguments(process.argv.slice(2));
const directusUrl = process.env.DIRECTUS_URL?.replace(/\/$/, '');
const directusToken = process.env.DIRECTUS_TOKEN;
const braveKey = process.env.BRAVE_SEARCH_API_KEY;

if (!directusUrl || !directusToken || !braveKey) {
  throw new Error('DIRECTUS_URL, DIRECTUS_TOKEN, and BRAVE_SEARCH_API_KEY are required.');
}

const layouts = await fetchItems('factory_audio_layouts', [
  'id', 'name', 'make', 'model', 'year_start', 'year_end', 'body_style', 'audio_tier', 'dash_speaker',
].join(','));
const unresolved = layouts.filter(isPopulatedUnsized)
  .filter((layout) => !args.make || layout.make?.toLowerCase() === args.make.toLowerCase());
const families = groupFamilies(unresolved).slice(0, args.limit ?? Infinity);

const prior = args.resume && args.output ? JSON.parse(await readFile(args.output, 'utf8')).research : [];
const completed = new Map(prior.map((item) => [familyKey(item), item]));
const research = [];
for (let index = 0; index < families.length; index += 1) {
  const family = families[index];
  if (completed.has(familyKey(family))) { research.push(completed.get(familyKey(family))); continue; }
  const query = buildQuery(family);
  const results = await braveSearch(query);
  research.push({ ...family, query, results });
  if (args.output) await writeReport(args.output, unresolved.length, research);
  process.stderr.write(`Brave: ${index + 1}/${families.length} ${family.make} ${family.model}\n`);
}

const report = {
  generated_at: new Date().toISOString(),
  mode: 'read-only',
  unresolved_rows: unresolved.length,
  research_families: research.length,
  research,
};

if (args.output) {
  await writeFile(args.output, `${JSON.stringify(report, null, 2)}\n`);
  process.stderr.write(`Report written to ${args.output}\n`);
} else {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

function parseArguments(values) {
  const options = { make: null, limit: null, output: null, resume: false };
  for (const value of values) {
    if (value.startsWith('--make=')) options.make = value.slice(7);
    else if (value.startsWith('--limit=')) options.limit = Number(value.slice(8));
    else if (value.startsWith('--output=')) options.output = value.slice(9);
    else if (value === '--resume') options.resume = true;
    else if (value === '--help') {
      process.stdout.write('Usage: node --env-file=.env scripts/research-dash-locations.mjs [--make=BMW] [--limit=20] [--output=/tmp/report.json]\n');
      process.exit(0);
    } else throw new Error(`Unknown argument: ${value}`);
  }
  if (options.limit !== null && (!Number.isInteger(options.limit) || options.limit < 1)) {
    throw new Error('--limit must be a positive integer.');
  }
  return options;
}

function familyKey(family) { return [family.make, family.model, family.body_style, family.audio_tier, family.current_dash_description, family.year_start, family.year_end].join('|'); }
async function writeReport(output, unresolvedRows, research) { await writeFile(output, `${JSON.stringify({ generated_at: new Date().toISOString(), mode: 'read-only', unresolved_rows: unresolvedRows, research_families: research.length, research }, null, 2)}\n`); }

function isPopulatedUnsized(layout) {
  const text = layout.dash_speaker?.trim().toLowerCase();
  if (!text || /^(none|n\/a|no\b)/.test(text) || /empty (cavity|provision)/.test(text)) return false;
  if (text.includes('tweeter only')) return false;
  return !/\d+(?:\.\d+)?\s*(?:x\s*\d+(?:\.\d+)?)?\s*-?\s*inch/i.test(text);
}

function groupFamilies(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = [row.make, row.model, row.body_style ?? '', row.audio_tier ?? '', row.dash_speaker].join('|');
    const group = groups.get(key) ?? {
      make: row.make,
      model: row.model,
      body_style: row.body_style,
      audio_tier: row.audio_tier,
      current_dash_description: row.dash_speaker,
      year_start: row.year_start,
      year_end: row.year_end,
      layout_ids: [],
    };
    group.year_start = Math.min(group.year_start, row.year_start);
    group.year_end = Math.max(group.year_end, row.year_end);
    group.layout_ids.push(row.id);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.make.localeCompare(b.make) || a.model.localeCompare(b.model) || a.year_start - b.year_start);
}

function buildQuery(family) {
  const vehicle = `${family.year_start} ${family.make} ${family.model}`;
  return `${vehicle} dash speaker size forum OR install OR replacement`;
}

async function fetchItems(collection, fields) {
  const url = new URL(`${directusUrl}/items/${collection}`);
  url.searchParams.set('fields', fields);
  url.searchParams.set('limit', '-1');
  const response = await fetch(url, { headers: { Authorization: `Bearer ${directusToken}` } });
  if (!response.ok) throw new Error(`Directus ${response.status}: ${await response.text()}`);
  return (await response.json()).data;
}

async function braveSearch(query) {
  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', query);
  // Five tightly targeted results are enough to identify a fit-guide or an
  // owner-install thread; requesting more adds API cost without improving the
  // first-pass decision.
  url.searchParams.set('count', '5');
  const response = await fetch(url, { headers: { 'X-Subscription-Token': braveKey, Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Brave ${response.status}: ${await response.text()}`);
  return ((await response.json()).web?.results ?? []).map(({ title, url: resultUrl, description }) => ({ title, url: resultUrl, description }));
}
