#!/usr/bin/env node

/**
 * Read-only year-range audit sampler.
 *
 * Usage:
 *   node --env-file=.env scripts/audit-year-ranges.mjs [seed]
 *
 * Prints a reproducible, stratified sample of unique make/model/body/range
 * assignments. It does not write to Directus or create local output files.
 */

const arguments_ = process.argv.slice(2);
const seedInput = arguments_.find((value) => !value.startsWith('--')) ?? new Date().toISOString().slice(0, 10);
const multiYearOnly = arguments_.includes('--multi-year-only');
const sizeArgument = arguments_.find((value) => value.startsWith('--size='));
const randomSampleSize = Number(sizeArgument?.slice('--size='.length) ?? 100);
const url = process.env.DIRECTUS_URL;
const token = process.env.DIRECTUS_TOKEN;

if (!url || !token) {
  throw new Error('DIRECTUS_URL and DIRECTUS_TOKEN are required.');
}

let state = [...seedInput].reduce((hash, char) => ((hash * 31) + char.charCodeAt(0)) >>> 0, 2166136261);
const random = () => {
  state = (state * 1664525 + 1013904223) >>> 0;
  return state / 0x100000000;
};

const response = await fetch(
  `${url}/items/vehicles?fields=make,model,body_style,year_range&limit=-1`,
  { headers: { Authorization: `Bearer ${token}` } },
);

if (!response.ok) {
  throw new Error(`Directus request failed: ${response.status} ${response.statusText}`);
}

const { data } = await response.json();
const unique = new Map();

for (const row of data) {
  if (!row.make || !row.model || !row.year_range) continue;
  if (multiYearOnly && !row.year_range.includes('-')) continue;
  const key = [row.make, row.model, row.body_style ?? '', row.year_range].join('|');
  unique.set(key, {
    make: row.make,
    model: row.model,
    body_style: row.body_style,
    year_range: row.year_range,
  });
}

const buckets = new Map();
for (const unit of unique.values()) {
  const start = Number(unit.year_range.slice(0, 4));
  const bucket = start < 1990 ? 'pre_1990' : `${Math.floor(start / 10) * 10}s`;
  const list = buckets.get(bucket) ?? [];
  list.push(unit);
  buckets.set(bucket, list);
}

for (const list of buckets.values()) {
  list.sort(() => random() - 0.5);
}

const bucketsInOrder = [...buckets.keys()].sort();
const perBucket = Math.floor(randomSampleSize / bucketsInOrder.length);
const randomSample = [];

for (const bucket of bucketsInOrder) {
  randomSample.push(...buckets.get(bucket).slice(0, perBucket));
}

let cursor = 0;
while (randomSample.length < randomSampleSize) {
  const bucket = bucketsInOrder[cursor % bucketsInOrder.length];
  const candidate = buckets.get(bucket)[perBucket + Math.floor(cursor / bucketsInOrder.length)];
  if (candidate) randomSample.push(candidate);
  cursor += 1;
}

const corollaTargeted = [...unique.values()]
  .filter((unit) => unit.make === 'Toyota' && unit.model.startsWith('Corolla'))
  .sort((a, b) => a.model.localeCompare(b.model) || a.year_range.localeCompare(b.year_range));

console.log(JSON.stringify({
  seed: seedInput,
  multi_year_only: multiYearOnly,
  population_units: unique.size,
  buckets: Object.fromEntries([...buckets].map(([bucket, list]) => [bucket, list.length])),
  random_sample: randomSample,
  targeted_corolla_sample: corollaTargeted,
}, null, 2));
