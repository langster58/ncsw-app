#!/usr/bin/env node
// Run: node --env-file=.env --env-file=.env.local scripts/ebay-ho-alt-search.js
// Test on N models first: MAX_MODELS=20 node --env-file=.env --env-file=.env.local scripts/ebay-ho-alt-search.js
//
// Establishes a cost basis for high-output alternators for every ICE vehicle in
// the Directus vehicles collection. For each (year,make,model) it queries the
// eBay Browse API (category 177697 + compatibility_filter for correct fitment),
// extracts the amp rating from each listing title via regex, and records EVERY
// option rated >= 220A (the install floor) as its own row — so the full spread of
// amp tiers and prices is visible per vehicle. Vehicles with no 220A+ option get a
// single gap row (the custom-build / quote-at-booking cases).
//
// Non-ICE (EV/PHEV/hybrid) is excluded — no conventional belt-driven alternator.
// Writes to scripts/ebay-ho-alt-results.csv; resumes automatically (skips any
// (year,make,model) already present).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_FILE = path.join(__dirname, 'ebay-ho-alt-results.csv');

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
const EBAY_APP_ID = process.env.EBAY_APP_ID;
const EBAY_CERT_ID = process.env.EBAY_CERT_ID;
const MAX_MODELS = process.env.MAX_MODELS ? parseInt(process.env.MAX_MODELS, 10) : Infinity;
// Stop cleanly before eBay's 5000/day cap so we don't burn the tail on 429s.
// Run once per day; the CSV resume picks up where it left off.
const MAX_SEARCHES = process.env.MAX_SEARCHES ? parseInt(process.env.MAX_SEARCHES, 10) : 4800;

const EBAY_CATEGORY_ID = '177697'; // Alternators & Generators (eBay Motors > Car & Truck Parts) — supports fitment
const EBAY_SEARCH_BASE = 'https://api.ebay.com/buy/browse/v1/item_summary/search';
const EBAY_TOKEN_URL = 'https://api.ebay.com/identity/v1/oauth2/token';
const EBAY_SCOPE = 'https://api.ebay.com/oauth/api_scope';

const DELAY_MS = 800; // between eBay searches; keeps us under 5000/day

// NCSW won't install anything below this. Cost basis only cares about 220A+ parts.
const INSTALL_FLOOR_AMPS = 220;

// Exclude sub-$80 listings — those are brushes, holders, bearings, connectors,
// not complete alternators. A real HO alternator is well above this.
const PRICE_FLOOR_USD = 80;

let ebayToken = null;
let ebayTokenExpiry = 0;
let ebayCallCount = 0;

async function getEbayToken() {
  if (ebayToken && Date.now() < ebayTokenExpiry - 60_000) return ebayToken;
  const credentials = Buffer.from(`${EBAY_APP_ID}:${EBAY_CERT_ID}`).toString('base64');
  const res = await fetch(EBAY_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `grant_type=client_credentials&scope=${encodeURIComponent(EBAY_SCOPE)}`,
  });
  if (!res.ok) throw new Error(`eBay token error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  ebayToken = data.access_token;
  ebayTokenExpiry = Date.now() + data.expires_in * 1000;
  console.log(`eBay token acquired, expires in ${Math.round(data.expires_in / 60)} min`);
  return ebayToken;
}

// One eBay Browse search. Uses compatibility_filter (Year/Make/Model) so eBay
// only returns parts that fit the target vehicle — free-text alone pulls
// wrong-vehicle parts (a CR-V alternator came back for an Acura ILX). Falls back
// to free-text if the compatibility filter yields nothing (e.g. make/model naming
// doesn't match eBay's vehicle taxonomy). Returns { items, matchMode }.
async function searchEbay(year, make, model, useCompat = true) {
  const token = await getEbayToken();
  ebayCallCount++;
  const url = new URL(EBAY_SEARCH_BASE);
  url.searchParams.set('q', `high output alternator ${make} ${model}`);
  url.searchParams.set('category_ids', EBAY_CATEGORY_ID);
  url.searchParams.set('limit', '15'); // wide net; Best Match ranks real HO units up top
  url.searchParams.set('filter', `price:[${PRICE_FLOOR_USD}..],priceCurrency:USD`); // drop accessories
  // No sort => Best Match relevance, which surfaces actual "high output" units rather
  // than the cheapest scrap. We pick the cheapest 220A+ result in code afterward.
  if (useCompat) {
    url.searchParams.set('compatibility_filter', `Year:${year};Make:${make};Model:${model}`);
  }

  const res = await fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
      'Content-Type': 'application/json',
    },
  });

  if (res.status === 403) {
    console.error(`\neBay 403 — Browse API may require additional license. ${await res.text()}`);
    process.exit(1);
  }
  if (res.status === 429) {
    console.warn('eBay rate limited — waiting 60s');
    await sleep(60_000);
    return searchEbay(year, make, model, useCompat);
  }
  if (!res.ok) {
    // On a fitment/other 400 while using the compatibility filter, degrade to keyword.
    if (useCompat && res.status === 400) return searchEbay(year, make, model, false);
    console.error(`eBay search error ${res.status} for ${year} ${make} ${model}: ${await res.text()}`);
    return { items: null, matchMode: null };
  }

  const items = (await res.json()).itemSummaries ?? [];
  if (useCompat && items.length === 0) {
    // eBay has no compatibility match (often a make/model naming mismatch) — retry keyword-only
    return searchEbay(year, make, model, false);
  }
  return { items, matchMode: useCompat ? 'COMPATIBILITY' : 'KEYWORD' };
}

// EXTRACTION ONLY, from the terse/formulaic listing title — no LLM needed.
// Regex is instant, deterministic, and free; the 220A floor is applied in code,
// so sellers' "High Output" wording on sub-220A units can't fool the gate.
// Returns { amps, fit_year_start, fit_year_end } (nulls when not stated).
function extractFromTitle(title) {
  const t = title || '';

  // Amp rating: a 2-3 digit number immediately before A / AMP / AMPS (optional
  // space or hyphen). Bounded to a plausible alternator range so part numbers,
  // "12V", "3.2L" etc. can't be mistaken for amps. HO listings sometimes cite
  // both a base and a max ("240/320A") — take the highest.
  const ampHits = [...t.matchAll(/(\d{2,3})\s*-?\s*(?:a|amp|amps)\b/gi)]
    .map(m => parseInt(m[1], 10))
    .filter(n => n >= 50 && n <= 500);
  const amps = ampHits.length ? Math.max(...ampHits) : null;

  // Fitment years: every plausible model year in the title (1960-2039). Two or
  // more -> [min,max] span; one -> single year; none -> null. Handles "2016-2021"
  // and space-separated "2016 2017 2018 2019" equally.
  const years = [...t.matchAll(/\b(19[6-9]\d|20[0-3]\d)\b/g)].map(m => parseInt(m[0], 10));
  const fit_year_start = years.length ? Math.min(...years) : null;
  const fit_year_end = years.length ? Math.max(...years) : null;

  return { amps, fit_year_start, fit_year_end };
}

async function fetchIceVehicles() {
  // model key -> Set(years). ICE only.
  const models = new Map();
  let page = 1;
  const limit = 1000;
  process.stdout.write('Fetching ICE vehicles from Directus');
  while (true) {
    const url = `${DIRECTUS_URL}/items/vehicles?limit=${limit}&page=${page}&fields=make,model,year,powertrain&filter[powertrain][_eq]=ICE`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${DIRECTUS_TOKEN}` } });
    if (!res.ok) throw new Error(`Directus error ${res.status}`);
    const items = (await res.json()).data ?? [];
    if (items.length === 0) break;
    for (const v of items) {
      if (v.make && v.model && v.year) {
        const key = `${v.make}|${v.model}`;
        if (!models.has(key)) models.set(key, new Set());
        models.get(key).add(v.year);
      }
    }
    process.stdout.write('.');
    page++;
    if (items.length < limit) break;
  }
  const totalCombos = [...models.values()].reduce((n, s) => n + s.size, 0);
  console.log(`\n${models.size} ICE models, ${totalCombos} unique (make,model,year)`);
  return models;
}

function loadDone() {
  const done = new Set();
  if (!fs.existsSync(OUTPUT_FILE)) return done;
  const lines = fs.readFileSync(OUTPUT_FILE, 'utf8').trim().split('\n');
  for (const line of lines.slice(1)) {
    const p = line.split(',');
    if (p.length >= 3) done.add(`${p[0]}|${p[1]}|${p[2]}`);
  }
  if (done.size) console.log(`Resuming — ${done.size} (year,make,model) rows already done`);
  return done;
}

function csvEscape(val) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function writeHeaderIfNeeded() {
  if (fs.existsSync(OUTPUT_FILE)) return;
  fs.writeFileSync(OUTPUT_FILE,
    'year,make,model,anchor_year,match_mode,ebay_item_id,title,price_value,price_currency,condition,amps,meets_220a_floor,fit_year_start,fit_year_end,listing_url,seller,search_timestamp\n');
}

function appendRow(year, make, model, anchorYear, matchMode, item, c, meetsFloor) {
  const price = item?.price ?? {};
  const row = [
    year, make, model, anchorYear, matchMode ?? '',
    item?.itemId ?? '',
    csvEscape(item?.title ?? ''),
    price.value ?? '',
    price.currency ?? '',
    csvEscape(item?.condition ?? ''),
    c?.amps ?? '',
    meetsFloor,
    c?.fit_year_start ?? '',
    c?.fit_year_end ?? '',
    item?.itemWebUrl ?? '',
    csvEscape(item?.seller?.username ?? ''),
    new Date().toISOString(),
  ].join(',');
  fs.appendFileSync(OUTPUT_FILE, row + '\n');
}

function appendNoResults(year, make, model, anchorYear, tag = 'NO_RESULTS') {
  fs.appendFileSync(OUTPUT_FILE,
    [year, make, model, anchorYear, '', tag, '', '', '', '', '', '', '', '', '', '', new Date().toISOString()].join(',') + '\n');
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const priceOf = r => parseFloat(r.item?.price?.value ?? 'NaN');

async function processModel(make, model, years, done) {
  const needed = [...years].filter(y => !done.has(`${y}|${make}|${model}`)).sort((a, b) => b - a);
  let searches = 0;

  for (const year of needed) {
    const { items, matchMode } = await searchEbay(year, make, model);
    searches++;

    if (items === null || items.length === 0) {
      appendNoResults(year, make, model, year);
      await sleep(DELAY_MS);
      continue;
    }

    // Extract amps + fitment from each title (local regex, instant).
    const rows = items.map(item => ({ item, c: extractFromTitle(item.title) }));
    const qualifying = rows.filter(r => Number.isFinite(r.c.amps) && r.c.amps >= INSTALL_FLOOR_AMPS);

    if (qualifying.length === 0) {
      // No 220A+ option for this vehicle. Record the cheapest complete alternator
      // as a gap signal (these are the custom-build / quote-at-booking cases).
      const best = [...rows].sort((a, b) => priceOf(a) - priceOf(b))[0];
      const flag = Number.isFinite(best.c.amps) ? 'false' : 'unknown';
      appendRow(year, make, model, year, best.item?.compatibilityMatch ?? matchMode, best.item, best.c, flag);
    } else {
      // Capture EVERY 220A+ option (one row each, dedup by listing), so the full
      // spread of amp tiers and prices is visible per vehicle. Ascending amps, then price.
      const seen = new Set();
      const options = qualifying
        .filter(r => { const id = r.item?.itemId; if (!id || seen.has(id)) return false; seen.add(id); return true; })
        .sort((a, b) => (a.c.amps - b.c.amps) || (priceOf(a) - priceOf(b)));
      for (const r of options) {
        appendRow(year, make, model, year, r.item?.compatibilityMatch ?? matchMode, r.item, r.c, 'true');
      }
    }

    await sleep(DELAY_MS);
  }
  return searches;
}

async function main() {
  for (const [k, v] of Object.entries({ EBAY_APP_ID, EBAY_CERT_ID, DIRECTUS_URL, DIRECTUS_TOKEN })) {
    if (!v) { console.error(`Missing ${k} — check .env / .env.local`); process.exit(1); }
  }

  const models = await fetchIceVehicles();
  const done = loadDone();
  writeHeaderIfNeeded();

  let modelEntries = [...models.entries()];
  if (MAX_MODELS !== Infinity) {
    modelEntries = modelEntries.slice(0, MAX_MODELS);
    console.log(`TEST MODE: limiting to first ${MAX_MODELS} models`);
  }

  const totalCombos = modelEntries.reduce((n, [, s]) => n + s.size, 0);
  let modelsDone = 0, totalSearches = 0, combosCovered = 0;

  let cappedOut = false;
  for (const [key, yearSet] of modelEntries) {
    if (ebayCallCount >= MAX_SEARCHES) { cappedOut = true; break; }
    const [make, model] = key.split('|');
    const searches = await processModel(make, model, yearSet, done);
    totalSearches += searches;
    combosCovered += yearSet.size;
    modelsDone++;
    if (modelsDone % 25 === 0 || MAX_MODELS !== Infinity) {
      console.log(`${modelsDone}/${modelEntries.length} models — ${combosCovered}/${totalCombos} vehicles, ${ebayCallCount} eBay calls`);
    }
  }

  if (cappedOut) {
    console.log(`\nReached MAX_SEARCHES (${MAX_SEARCHES}) — stopped before eBay's daily cap. Re-run to resume.`);
  }
  console.log(`\n${combosCovered}/${totalCombos} vehicles processed this run. Total eBay API calls: ${ebayCallCount}`);
  console.log(`Results: ${OUTPUT_FILE}`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
