#!/usr/bin/env node
// Run: node --env-file=.env scripts/estimate-alt-prices.js
//
// Turns the sampled eBay data (ebay-target-results.csv) into an estimated
// high-output-alternator part cost for EVERY row in the Directus vehicles
// collection. No Directus writes — output is a CSV.
//
// Estimation rules, per vehicle row — every row gets a price:
//   model sampled -> nearest sampled year of the same (make, model):
//                      priced point  -> off_shelf, that price
//                      gap point     -> custom, custom-build estimate
//   otherwise     -> make median of priced points, else global median
//   (EV/hybrid rows fall through to custom: no off-the-shelf part exists)
//
// "Priced" means a quality listing (>= QUALITY_AMPS amps) was found for that
// sampled year; 200-249A bargain units are recorded in the raw CSV but are
// not install-grade, so they don't count as an off-the-shelf option here.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLES_FILE = path.join(__dirname, 'ebay-target-results.csv');
const OUT_FILE = path.join(__dirname, 'ebay-alt-price-estimates.csv');

const QUALITY_AMPS = 250;   // install-grade threshold for the estimate
const BUILDER_AMPS = 340;   // premium/builder tier, used to derive the custom estimate
const GLOBAL_FALLBACK = 280; // stable median across both manual samples

const URL = process.env.DIRECTUS_URL, TOKEN = process.env.DIRECTUS_TOKEN;
if (!URL || !TOKEN) { console.error('Missing DIRECTUS_URL/DIRECTUS_TOKEN'); process.exit(1); }

// ---- load samples ----------------------------------------------------------
const lines = fs.readFileSync(SAMPLES_FILE, 'utf8').trim().split('\n');
const hdr = lines[0].split(',');
const parseLine = l => {
  const m = l.match(/(".*?"|[^,]*)(,|$)/g).map(s => s.replace(/,$/, '').replace(/^"|"$/g, ''));
  return Object.fromEntries(hdr.map((h, i) => [h, m[i]]));
};
const sampleRows = lines.slice(1).map(parseLine);

// (make|model) -> Map(year -> { price|null })  — price = cheapest quality listing
const sampled = new Map();
const allQualityPrices = [];
const builderPrices = [];
for (const r of sampleRows) {
  const key = `${r.make}|${r.model}`;
  const year = +r.year;
  if (!sampled.has(key)) sampled.set(key, new Map());
  const yearMap = sampled.get(key);
  if (!yearMap.has(year)) yearMap.set(year, { price: null });

  const amps = +r.amps, price = parseFloat(r.price_value);
  if (r.meets_amp_floor === 'true' && Number.isFinite(amps) && amps >= QUALITY_AMPS && Number.isFinite(price)) {
    const pt = yearMap.get(year);
    if (pt.price === null || price < pt.price) pt.price = price;
    allQualityPrices.push(price);
    if (amps >= BUILDER_AMPS) builderPrices.push(price);
  }
}

const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const CUSTOM_EST = median(builderPrices) ?? 550; // custom-build cost ~ premium builder tier
const globalMedian = median(allQualityPrices) ?? GLOBAL_FALLBACK;

// make -> median priced point (for unsampled-model fallback)
const makePrices = {};
for (const [key, yearMap] of sampled) {
  const make = key.split('|')[0];
  for (const pt of yearMap.values()) if (pt.price !== null) (makePrices[make] ??= []).push(pt.price);
}
const makeMedian = {};
for (const [mk, arr] of Object.entries(makePrices)) makeMedian[mk] = median(arr);

// ---- load all vehicles -----------------------------------------------------
const vehicles = [];
let page = 1;
while (true) {
  const q = `${URL}/items/vehicles?limit=1000&page=${page}&fields=vehicle_id,make,model,year,powertrain`;
  const d = await (await fetch(q, { headers: { Authorization: `Bearer ${TOKEN}` } })).json();
  const items = d.data ?? [];
  if (!items.length) break;
  vehicles.push(...items);
  page++;
  if (items.length < 1000) break;
}

// ---- estimate --------------------------------------------------------------
const out = ['vehicle_id,year,make,model,powertrain,availability,est_part_cost,basis,nearest_sample_year,sample_distance'];
const tally = {};
for (const v of vehicles) {
  let availability, est = '', basis, nearestYear = '', dist = '';

  if (v.powertrain !== 'ICE') {
    // EVs/hybrids have no alternator — no price, labeled plainly
    availability = 'no_alternator'; est = ''; basis = 'no_alternator';
  } else {
    const yearMap = sampled.get(`${v.make}|${v.model}`);
    if (yearMap && yearMap.size && Number.isFinite(+v.year)) {
      // nearest sampled year; ties go to the newer year
      let best = null;
      for (const y of yearMap.keys()) {
        const d2 = Math.abs(y - v.year);
        if (!best || d2 < best.d || (d2 === best.d && y > best.y)) best = { y, d: d2 };
      }
      nearestYear = best.y; dist = best.d;
      const pt = yearMap.get(best.y);
      if (pt.price !== null) {
        availability = 'off_shelf'; est = pt.price;
        basis = best.d === 0 ? 'sampled_exact' : 'nearest_year';
      } else {
        availability = 'custom'; est = CUSTOM_EST; basis = 'nearest_gap';
      }
    } else if (makeMedian[v.make] != null) {
      availability = 'estimated'; est = makeMedian[v.make]; basis = 'make_median';
    } else {
      availability = 'estimated'; est = globalMedian; basis = 'global_median';
    }
  }

  tally[availability] = (tally[availability] || 0) + 1;
  out.push([v.vehicle_id, v.year, csv(v.make), csv(v.model), v.powertrain, availability, est, basis, nearestYear, dist].join(','));
}

function csv(s) { s = String(s ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }

fs.writeFileSync(OUT_FILE, out.join('\n') + '\n');

// ---- summary ---------------------------------------------------------------
console.log(`Estimated ${vehicles.length} vehicle rows -> ${OUT_FILE}\n`);
console.log('Availability tally:');
for (const [k, n] of Object.entries(tally).sort((a, b) => b[1] - a[1]))
  console.log(`  ${k.padEnd(15)} ${n}  (${(100 * n / vehicles.length).toFixed(1)}%)`);
const offShelf = out.slice(1).map(l => l.split(',')).filter(p => p[5] === 'off_shelf').map(p => +p[6]);
if (offShelf.length) {
  const avg = offShelf.reduce((s, x) => s + x, 0) / offShelf.length;
  console.log(`\noff_shelf est: avg $${avg.toFixed(0)}, median $${median(offShelf)}, n=${offShelf.length}`);
}
console.log(`custom-build estimate used: $${CUSTOM_EST} (median of ${builderPrices.length} listings >= ${BUILDER_AMPS}A)`);
console.log(`global median (fallback): $${globalMedian}`);
