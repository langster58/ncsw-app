#!/usr/bin/env node
// Run: node --env-file=.env scripts/estimate-alt-prices.js
//
// Gives every ICE vehicle in the collection an estimated high-output-alternator
// price = the cheapest NEW high-output unit that fits it on eBay (the same thing
// a customer sees if they search their own car). Used / remanufactured salvage
// parts are excluded — those are stock replacements, not the upgrade we quote.
// Non-ICE rows (no alternator) get no price. Output is a CSV; no Directus writes.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLES_FILE = path.join(__dirname, 'ebay-target-results.csv');
const OUT_FILE = path.join(__dirname, 'ebay-alt-price-estimates.csv');

const MIN_AMPS = 250;          // genuine high-output threshold
const NEW_ONLY = 'New';        // condition must be exactly this
const MAX_YEAR_REACH = 6;      // don't price a vehicle off a sample >6 model years away

// Re-read the amp rating from the listing title with the corrected regex
// (the (?<!\d) lookbehind stops part numbers like "4727329A" reading as 329A).
function ampsFromTitle(title) {
  const hits = [...(title || '').matchAll(/(?<!\d)(\d{2,3})\s*-?\s*(?:a|amp|amps)\b/gi)]
    .map(m => parseInt(m[1], 10)).filter(n => n >= 50 && n <= 500);
  return hits.length ? Math.max(...hits) : null;
}

const URL = process.env.DIRECTUS_URL, TOKEN = process.env.DIRECTUS_TOKEN;
if (!URL || !TOKEN) { console.error('Missing DIRECTUS_URL/DIRECTUS_TOKEN'); process.exit(1); }

const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };

// ---- load samples ----------------------------------------------------------
const lines = fs.readFileSync(SAMPLES_FILE, 'utf8').trim().split('\n');
const hdr = lines[0].split(',');
const parseLine = l => {
  const m = l.match(/(".*?"|[^,]*)(,|$)/g).map(s => s.replace(/,$/, '').replace(/^"|"$/g, ''));
  return Object.fromEntries(hdr.map((h, i) => [h, m[i]]));
};
const sampleRows = lines.slice(1).map(parseLine);

// (make|model) -> Map(year -> cheapest NEW high-output price)
const priced = new Map();
const allPrices = [];
for (const r of sampleRows) {
  const amps = ampsFromTitle(r.title), price = parseFloat(r.price_value);
  const ok = r.condition === NEW_ONLY && Number.isFinite(amps) && amps >= MIN_AMPS && Number.isFinite(price);
  if (!ok) continue;
  const key = `${r.make}|${r.model}`, year = +r.year;
  if (!priced.has(key)) priced.set(key, new Map());
  const ym = priced.get(key);
  if (!ym.has(year) || price < ym.get(year)) ym.set(year, price);
  allPrices.push(price);
}

// make -> median of its priced points (fallback for a model we never priced)
const makeArr = {};
for (const [key, ym] of priced) { const mk = key.split('|')[0]; for (const p of ym.values()) (makeArr[mk] ??= []).push(p); }
const makeMedian = {}; for (const [mk, a] of Object.entries(makeArr)) makeMedian[mk] = median(a);
const globalMedian = median(allPrices);

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
const out = ['vehicle_id,year,make,model,powertrain,est_alt_price,basis,source_year,source_distance'];
const tally = {};
for (const v of vehicles) {
  let price = '', basis, srcYear = '', dist = '';

  if (v.powertrain !== 'ICE') {
    basis = 'no_alternator';                       // EV/hybrid: no price
  } else {
    const ym = priced.get(`${v.make}|${v.model}`);
    let best = null;
    if (ym && ym.size && Number.isFinite(+v.year)) {
      for (const [y, p] of ym) {
        const d2 = Math.abs(y - v.year);
        if (!best || d2 < best.d || (d2 === best.d && y > best.y)) best = { y, d: d2, p };
      }
    }
    if (best && best.d <= MAX_YEAR_REACH) {
      // a real new-HO listing within reach of this vehicle's year
      price = best.p; srcYear = best.y; dist = best.d;
      basis = best.d === 0 ? 'exact' : 'nearest_year';
    } else if (makeMedian[v.make] != null) {
      price = makeMedian[v.make]; basis = 'make_median';   // model never priced -> make typical
    } else {
      price = globalMedian; basis = 'global_median';       // make never priced -> overall typical
    }
  }

  tally[basis] = (tally[basis] || 0) + 1;
  out.push([v.vehicle_id, v.year, csv(v.make), csv(v.model), v.powertrain, price, basis, srcYear, dist].join(','));
}
function csv(s) { s = String(s ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
fs.writeFileSync(OUT_FILE, out.join('\n') + '\n');

// ---- summary ---------------------------------------------------------------
console.log(`Estimated ${vehicles.length} rows -> ${OUT_FILE}\n`);
console.log(`Priced from ${allPrices.length} NEW high-output listings (>=${MIN_AMPS}A). Global median $${globalMedian}\n`);
console.log('How each vehicle got its number:');
for (const [k, n] of Object.entries(tally).sort((a, b) => b[1] - a[1]))
  console.log(`  ${k.padEnd(14)} ${n}  (${(100 * n / vehicles.length).toFixed(1)}%)`);
const withPrice = out.slice(1).map(l => l.split(',')).filter(p => p[5] !== '').map(p => +p[5]);
console.log(`\nPriced rows: ${withPrice.length}. Price spread: min $${Math.min(...withPrice)}, median $${median(withPrice)}, max $${Math.max(...withPrice)}`);
