#!/usr/bin/env node
// Run: node --env-file=.env scripts/write-alt-estimates-to-db.js
//
// Writes ebay-alt-price-estimates.csv into the vehicles collection:
//   alt_price_estimate (float) + alt_price_basis (listing | make_estimate | no_alternator)
// Batched PATCHes by vehicle_id. Re-runnable (idempotent per row).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV = path.join(__dirname, 'ebay-alt-price-estimates.csv');
const URL = process.env.DIRECTUS_URL, TOKEN = process.env.DIRECTUS_TOKEN;
const H = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };
const BATCH = 200;

const lines = fs.readFileSync(CSV, 'utf8').trim().split('\n');
const hdr = lines[0].split(',');
const idx = n => hdr.indexOf(n);
const iId = idx('vehicle_id'), iPrice = idx('est_alt_price'), iBasis = idx('basis');

const basisMap = { exact: 'listing', nearest_year: 'listing', make_median: 'make_estimate', global_median: 'make_estimate', no_alternator: 'no_alternator' };

const updates = [];
for (const line of lines.slice(1)) {
  const p = line.split(',');
  const id = +p[iId];
  const priceRaw = p[iPrice];
  const basis = basisMap[p[iBasis]] ?? null;
  updates.push({
    vehicle_id: id,
    alt_price_estimate: priceRaw === '' ? null : parseFloat(priceRaw),
    alt_price_basis: basis,
  });
}
console.log(`${updates.length} rows to write in batches of ${BATCH}`);

let done = 0, failed = 0;
for (let i = 0; i < updates.length; i += BATCH) {
  const chunk = updates.slice(i, i + BATCH);
  const r = await fetch(`${URL}/items/vehicles`, { method: 'PATCH', headers: H, body: JSON.stringify(chunk) });
  if (!r.ok) {
    failed += chunk.length;
    if (failed <= BATCH) console.error(`batch @${i} failed ${r.status}: ${(await r.text()).slice(0, 200)}`);
  } else {
    done += chunk.length;
  }
  if ((i / BATCH) % 25 === 0) console.log(`  ${done}/${updates.length} written...`);
}
console.log(`\nDone. ${done} written, ${failed} failed.`);
