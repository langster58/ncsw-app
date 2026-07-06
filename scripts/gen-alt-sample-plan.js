#!/usr/bin/env node
// Run: node --env-file=.env scripts/gen-alt-sample-plan.js
//
// Generates the stratified eBay sampling plan for alternator pricing:
// for every ICE (make, model), sample every STRIDE-th model year (sorted
// newest-first), always including the newest and oldest year. Alternator
// pricing moves by platform generation, so a <=2-year gap to the nearest
// sampled year is accurate enough for estimation, at ~1/4 the searches.
//
// Writes scripts/ebay-sample-plan.json (consumed via TARGETS_FILE mode).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'ebay-sample-plan.json');
const STRIDE = 4;

const URL = process.env.DIRECTUS_URL, TOKEN = process.env.DIRECTUS_TOKEN;
if (!URL || !TOKEN) { console.error('Missing DIRECTUS_URL/DIRECTUS_TOKEN'); process.exit(1); }

const models = new Map();
let page = 1;
while (true) {
  const q = `${URL}/items/vehicles?limit=1000&page=${page}&fields=make,model,year&filter[powertrain][_eq]=ICE`;
  const d = await (await fetch(q, { headers: { Authorization: `Bearer ${TOKEN}` } })).json();
  const items = d.data ?? [];
  if (!items.length) break;
  for (const v of items) {
    if (v.make && v.model && v.year) {
      const k = `${v.make}|${v.model}`;
      if (!models.has(k)) models.set(k, new Set());
      models.get(k).add(v.year);
    }
  }
  page++;
  if (items.length < 1000) break;
}

const plan = [];
for (const [key, yearSet] of models) {
  const [make, model] = key.split('|');
  const years = [...yearSet].sort((a, b) => b - a); // newest first
  const picks = new Set();
  for (let i = 0; i < years.length; i += STRIDE) picks.add(years[i]);
  picks.add(years[years.length - 1]); // always include oldest
  for (const year of [...picks].sort((a, b) => b - a)) plan.push({ year, make, model });
}

fs.writeFileSync(OUT, JSON.stringify(plan, null, 1));
const totalYears = [...models.values()].reduce((n, s) => n + s.size, 0);
console.log(`${models.size} ICE models, ${totalYears} year-combos -> ${plan.length} sampled searches (stride ${STRIDE})`);
console.log(`Plan written to ${OUT}`);
