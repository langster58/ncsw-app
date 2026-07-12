#!/usr/bin/env node

/**
 * Collect factory speaker-layout candidates without using an LLM per vehicle.
 *
 * Sources:
 *   - Archived AllSpeakerSize model pages (per-year location/type/size tables)
 *   - Archived CarAudioNow consolidated fitment table
 *
 * Safety:
 *   - Dry-run by default.
 *   - Cross-source matches are candidates, not proof; shared upstream errors exist.
 *   - Directus writes require both --write and a reviewed --verified-input file.
 *
 * Examples:
 *   npm run collect:factory-audio -- --make=BMW --max-pages=20
 *   npm run collect:factory-audio -- --output=/tmp/factory-audio.json
 *   npm run collect:factory-audio -- --write --verified-input=/tmp/approved.json
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const WAYBACK_CDX = 'https://web.archive.org/cdx/search/cdx';
const WAYBACK_RAW = 'https://web.archive.org/web';
const ALLSPEAKER_DOMAIN = 'allspeakersize.com';
const CARAUDIONOW_URL = 'https://www.caraudionow.com/car-speakers-what-speakers-fit-my-car/';
const USER_AGENT = 'NCSWFactoryAudioCollector/1.0 (public archive research)';

const LOCATION_FIELDS = [
  'a_pillar_speaker',
  'sail_speaker',
  'dash_speaker',
  'center_speaker',
  'front_door_speaker',
  'rear_door_speaker',
  'kick_panel_speaker',
  'underseat_speaker',
  'rear_deck_speaker',
  'rear_quarter_panel_speaker',
  'rear_pillar_speaker',
];

const args = parseArguments(process.argv.slice(2));
const directusUrl = process.env.DIRECTUS_URL?.replace(/\/$/, '');
const directusToken = process.env.DIRECTUS_TOKEN;

if (args.write && !args.verifiedInput) {
  throw new Error('--write requires --verified-input=PATH containing reviewed candidate IDs.');
}

if (!directusUrl || !directusToken) {
  throw new Error('DIRECTUS_URL and DIRECTUS_TOKEN are required. Run with node --env-file=.env.');
}

const cacheDirectory = resolve(args.cacheDirectory);
await mkdir(cacheDirectory, { recursive: true });

const inventory = await fetchDirectusItems('vehicles', {
  fields: 'make,model,year,body_style,trim',
  ...(args.make ? { 'filter[make][_eq]': args.make } : {}),
});
const inventoryIndex = buildInventoryIndex(inventory);

const sourceRecords = [];
const acquisitionErrors = [];

if (args.source === 'all' || args.source === 'allspeaker') {
  const captures = await listAllSpeakerCaptures();
  const selected = captures
    .filter((capture) => !args.make || capture.make.toLowerCase() === args.make.toLowerCase())
    .slice(0, args.maxPages || undefined);

  process.stderr.write(`AllSpeakerSize: acquiring ${selected.length} archived model pages.\n`);
  const results = await mapWithConcurrency(selected, args.concurrency, async (capture, index) => {
    try {
      const html = await fetchArchivedCapture(capture);
      if ((index + 1) % 25 === 0 || index + 1 === selected.length) {
        process.stderr.write(`AllSpeakerSize: ${index + 1}/${selected.length}\n`);
      }
      return parseAllSpeakerPage(html, capture.original);
    } catch (error) {
      acquisitionErrors.push({ source: 'allspeaker', url: capture.original, error: error.message });
      return [];
    }
  });
  sourceRecords.push(...results.flat());
}

if (args.source === 'all' || args.source === 'caraudionow') {
  process.stderr.write('CarAudioNow: acquiring archived consolidated table.\n');
  try {
    const capture = await latestExactCapture(CARAUDIONOW_URL);
    const html = await fetchArchivedCapture(capture);
    sourceRecords.push(...parseCarAudioNowPage(html).filter(
      (record) => !args.make || normalizeKey(record.make) === normalizeKey(args.make),
    ));
  } catch (error) {
    acquisitionErrors.push({ source: 'caraudionow', url: CARAUDIONOW_URL, error: error.message });
  }
}

const resolved = [];
const unmatched = [];
for (const record of sourceRecords) {
  const matches = resolveAgainstInventory(record, inventoryIndex);
  if (matches.length === 0) {
    unmatched.push(summarizeRawRecord(record));
  } else {
    resolved.push(...matches);
  }
}

const evaluatedYears = evaluatePerYear(resolved, args.minAgreeLocations);
const crossSourceCandidates = collapseConsecutiveYears(
  evaluatedYears.filter((record) => record.status === 'cross_source_match'),
);
const review = collapseConsecutiveYears(
  evaluatedYears.filter((record) => record.status !== 'cross_source_match'),
);
const candidates = crossSourceCandidates.map(withCandidateId);
const approvedCandidateIds = await loadApprovedCandidateIds(args.verifiedInput);
const approvedCandidates = candidates.filter((candidate) => approvedCandidateIds.has(candidate.candidateId));
const layouts = approvedCandidates.map(toDirectusLayout);

let writeResult = { requested: args.write, created: 0, skipped_existing: 0 };
if (args.write) {
  writeResult = await writeLayouts(layouts);
}

const report = {
  mode: args.write ? 'write' : 'dry-run',
  filters: {
    make: args.make,
    source: args.source,
    max_pages: args.maxPages || null,
    minimum_agreeing_locations: args.minAgreeLocations,
  },
  counts: {
    inventory_rows: inventory.length,
    raw_source_records: sourceRecords.length,
    resolved_source_records: resolved.length,
    evaluated_vehicle_years: evaluatedYears.length,
    cross_source_candidates: candidates.length,
    manually_verified_candidates: approvedCandidates.length,
    review_layouts: review.length,
    unmatched_source_records: unmatched.length,
    acquisition_errors: acquisitionErrors.length,
  },
  write: writeResult,
  candidates: candidates.map(summarizeCandidate),
  approved_layouts: layouts,
  review: review.map(summarizeEvaluatedRecord),
  unmatched: unmatched.slice(0, args.detailLimit),
  acquisition_errors: acquisitionErrors,
};

const output = `${JSON.stringify(report, null, 2)}\n`;
if (args.output) {
  const outputPath = resolve(args.output);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, output);
  process.stderr.write(`Report written to ${outputPath}\n`);
} else {
  process.stdout.write(output);
}

function parseArguments(values) {
  const options = {
    cacheDirectory: '.cache/factory-audio',
    concurrency: 3,
    detailLimit: 100,
    make: null,
    maxPages: 0,
    minAgreeLocations: 2,
    output: null,
    refresh: false,
    source: 'all',
    verifiedInput: null,
    write: false,
  };

  for (const value of values) {
    if (value === '--write') options.write = true;
    else if (value.startsWith('--cache-dir=')) options.cacheDirectory = value.slice(12);
    else if (value.startsWith('--concurrency=')) options.concurrency = positiveInteger(value.slice(14), 'concurrency');
    else if (value.startsWith('--detail-limit=')) options.detailLimit = positiveInteger(value.slice(15), 'detail-limit');
    else if (value.startsWith('--make=')) options.make = value.slice(7).trim() || null;
    else if (value.startsWith('--max-pages=')) options.maxPages = nonnegativeInteger(value.slice(12), 'max-pages');
    else if (value.startsWith('--min-agree-locations=')) options.minAgreeLocations = positiveInteger(value.slice(22), 'min-agree-locations');
    else if (value.startsWith('--output=')) options.output = value.slice(9);
    else if (value === '--refresh') options.refresh = true;
    else if (value.startsWith('--source=')) options.source = value.slice(9);
    else if (value.startsWith('--verified-input=')) options.verifiedInput = value.slice(17);
    else if (value === '--help') {
      process.stdout.write('Usage: node --env-file=.env scripts/collect-factory-audio-layouts.mjs [--make=BMW] [--max-pages=20] [--source=all|allspeaker|caraudionow] [--output=path] [--refresh] [--write --verified-input=path]\n');
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${value}`);
    }
  }

  if (!['all', 'allspeaker', 'caraudionow'].includes(options.source)) {
    throw new Error('--source must be all, allspeaker, or caraudionow.');
  }
  return options;
}

function positiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`--${name} must be a positive integer.`);
  return parsed;
}

function nonnegativeInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`--${name} must be a nonnegative integer.`);
  return parsed;
}

async function fetchDirectusItems(collection, parameters) {
  const url = new URL(`${directusUrl}/items/${collection}`);
  for (const [key, value] of Object.entries({ ...parameters, limit: '-1' })) {
    url.searchParams.set(key, value);
  }
  const response = await fetchWithRetry(url, {
    headers: { Authorization: `Bearer ${directusToken}` },
  });
  const payload = await response.json();
  return payload.data ?? [];
}

async function listAllSpeakerCaptures() {
  const url = new URL(WAYBACK_CDX);
  url.searchParams.set('url', ALLSPEAKER_DOMAIN);
  url.searchParams.set('matchType', 'domain');
  url.searchParams.set('output', 'json');
  url.searchParams.append('filter', 'statuscode:200');
  url.searchParams.append('filter', 'mimetype:text/html');
  url.searchParams.set('fl', 'timestamp,original,digest');

  const rows = await cachedJson(url, 'allspeaker-cdx-domain.json', args.refresh);
  const latestByUrl = new Map();
  for (const row of rows.slice(1)) {
    const [timestamp, original, digest] = row;
    const parsed = parseAllSpeakerModelUrl(original);
    if (!parsed) continue;
    const existing = latestByUrl.get(parsed.canonical);
    if (!existing || timestamp > existing.timestamp) {
      latestByUrl.set(parsed.canonical, { timestamp, original, digest, ...parsed });
    }
  }
  return [...latestByUrl.values()].sort((a, b) => a.canonical.localeCompare(b.canonical));
}

function parseAllSpeakerModelUrl(value) {
  try {
    const url = new URL(value);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length !== 2 || parts.some((part) => part.includes('.'))) return null;
    return {
      make: slugToWords(parts[0]),
      model: slugToWords(parts[1]),
      canonical: `https://${ALLSPEAKER_DOMAIN}/${parts.join('/')}`,
    };
  } catch {
    return null;
  }
}

async function latestExactCapture(original) {
  const url = new URL(WAYBACK_CDX);
  url.searchParams.set('url', original);
  url.searchParams.set('output', 'json');
  url.searchParams.append('filter', 'statuscode:200');
  url.searchParams.append('filter', 'mimetype:text/html');
  url.searchParams.set('fl', 'timestamp,original,digest');
  url.searchParams.set('collapse', 'digest');
  const rows = await cachedJson(url, `exact-${hash(original)}.json`, args.refresh);
  if (rows.length < 2) throw new Error(`No archived HTML capture found for ${original}`);
  const [timestamp, capturedOriginal, digest] = rows.slice(1).sort((a, b) => b[0].localeCompare(a[0]))[0];
  return { timestamp, original: capturedOriginal, digest };
}

async function fetchArchivedCapture(capture) {
  const cacheName = `html-${hash(`${capture.timestamp}|${capture.original}|${capture.digest ?? ''}`)}.html`;
  const cachePath = resolve(cacheDirectory, cacheName);
  if (!args.refresh) {
    try {
      return await readFile(cachePath, 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }

  const archiveUrl = `${WAYBACK_RAW}/${capture.timestamp}id_/${capture.original}`;
  const response = await fetchWithRetry(archiveUrl);
  const html = await response.text();
  if (!/<html|<table|<h2/i.test(html)) {
    throw new Error(`Archived response did not contain HTML: ${archiveUrl}`);
  }
  await writeFile(cachePath, html);
  return html;
}

async function cachedJson(url, filename, refresh) {
  const cachePath = resolve(cacheDirectory, filename);
  if (!refresh) {
    try {
      return JSON.parse(await readFile(cachePath, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  const response = await fetchWithRetry(url);
  const data = await response.json();
  await writeFile(cachePath, JSON.stringify(data));
  return data;
}

async function fetchWithRetry(input, options = {}) {
  let finalError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(input, {
        ...options,
        headers: { 'User-Agent': USER_AGENT, ...(options.headers ?? {}) },
        signal: AbortSignal.timeout(45_000),
      });
      if (response.ok) return response;
      if (![429, 500, 502, 503, 504].includes(response.status)) {
        throw new Error(`${response.status} ${response.statusText} for ${input}`);
      }
      finalError = new Error(`${response.status} ${response.statusText} for ${input}`);
    } catch (error) {
      finalError = error;
    }
    await delay(500 * (2 ** (attempt - 1)));
  }
  throw finalError;
}

function parseAllSpeakerPage(html, original) {
  const page = parseAllSpeakerModelUrl(original);
  if (!page) return [];
  const records = [];
  const sectionPattern = /<h2\b[^>]*id=["']?(\d{4})["']?[^>]*>.*?<\/h2>\s*<table\b[^>]*>([\s\S]*?)<\/table>/gi;
  for (const match of html.matchAll(sectionPattern)) {
    const year = Number(match[1]);
    const locations = emptyLocations();
    for (const cells of parseHtmlRows(match[2])) {
      if (cells.length < 3) continue;
      const field = allSpeakerLocationField(cells[0]);
      if (!field) continue;
      addDriver(locations, field, formatDriver(cells[1], cells[2]));
    }
    if (hasLocations(locations)) {
      records.push({
        source: 'allspeaker',
        sourceModel: page.model,
        make: page.make,
        model: page.model,
        yearStart: year,
        yearEnd: year,
        bodyStyle: null,
        trimCondition: null,
        locations: finalizeLocations(locations),
      });
    }
  }
  return records;
}

function parseCarAudioNowPage(html) {
  const records = [];
  for (const cells of parseHtmlRows(html)) {
    if (cells.length !== 11) continue;
    const [make, model, trim, bodyStyle, from, to, front1, front2, rear1, rear2, subwoofer] = cells;
    const yearStart = Number(from);
    const yearEnd = Number(to);
    if (!make || !model || !Number.isInteger(yearStart) || !Number.isInteger(yearEnd)) continue;

    const locations = emptyLocations();
    parseFitmentCell(front1, 'front', locations);
    parseFitmentCell(front2, 'front', locations);
    parseFitmentCell(rear1, 'rear', locations);
    parseFitmentCell(rear2, 'rear', locations);
    parseSubwooferCell(subwoofer, locations);
    if (!hasLocations(locations)) continue;

    records.push({
      source: 'caraudionow',
      sourceModel: model,
      make,
      model,
      yearStart,
      yearEnd,
      bodyStyle: bodyStyle || null,
      trimCondition: trim || null,
      locations: finalizeLocations(locations),
    });
  }
  return records;
}

function parseHtmlRows(html) {
  const rows = [];
  for (const rowMatch of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...rowMatch[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map((cell) => cleanHtml(cell[1]));
    if (cells.length) rows.push(cells);
  }
  return rows;
}

function cleanHtml(value) {
  return decodeHtml(value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function decodeHtml(value) {
  const named = {
    amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"', ndash: '–', mdash: '—', times: '×',
  };
  return value
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
    .replace(/&#x([0-9a-f]+);/gi, (_, number) => String.fromCodePoint(Number.parseInt(number, 16)))
    .replace(/&([a-z]+);/gi, (entity, name) => named[name.toLowerCase()] ?? entity);
}

function allSpeakerLocationField(location) {
  const key = normalizeKey(location);
  const mapping = {
    apillar: 'a_pillar_speaker',
    belowseats: 'underseat_speaker',
    centerdash: 'center_speaker',
    dash: 'dash_speaker',
    frontdoor: 'front_door_speaker',
    frontdoorpanel: 'front_door_speaker',
    frontkickpanel: 'kick_panel_speaker',
    kickpanel: 'kick_panel_speaker',
    reardeck: 'rear_deck_speaker',
    reardecklid: 'rear_deck_speaker',
    reardoor: 'rear_door_speaker',
    reardoorpanel: 'rear_door_speaker',
    rearpillar: 'rear_pillar_speaker',
    rearsidepanel: 'rear_quarter_panel_speaker',
    sailpanel: 'sail_speaker',
    underseat: 'underseat_speaker',
    underseats: 'underseat_speaker',
  };
  return mapping[key] ?? null;
}

function parseFitmentCell(value, zone, locations) {
  if (!value) return;
  for (const part of value.split(/[,;]+/)) {
    const [rawLocation, rawSize = ''] = part.split(':').map((item) => item.trim());
    const key = normalizeKey(rawLocation);
    let field = null;
    if (key.includes('apillar')) field = 'a_pillar_speaker';
    else if (key.includes('sail')) field = 'sail_speaker';
    else if (key.includes('center')) field = 'center_speaker';
    else if (key.includes('dash')) field = 'dash_speaker';
    else if (key.includes('kick')) field = 'kick_panel_speaker';
    else if (key.includes('deck')) field = 'rear_deck_speaker';
    else if (key.includes('pillar')) field = 'rear_pillar_speaker';
    else if (key.includes('sidepanel') || key.includes('quarter')) field = 'rear_quarter_panel_speaker';
    else if (key.includes('door')) field = zone === 'front' ? 'front_door_speaker' : 'rear_door_speaker';
    if (field) addDriver(locations, field, formatDriver('', rawSize));
  }
}

function parseSubwooferCell(value, locations) {
  if (!value) return;
  for (const part of value.split(/[,;]+/)) {
    const lower = part.toLowerCase();
    if (lower.includes('under seat') || lower.includes('underseat')) {
      addDriver(locations, 'underseat_speaker', formatDriver('midbass', extractSize(part)));
    } else if (lower.includes('center')) {
      addDriver(locations, 'center_speaker', formatDriver('', extractSize(part)));
    }
  }
}

function formatDriver(type, size) {
  const normalizedType = type
    .replace(/mid[- ]?range/i, 'midrange')
    .replace(/full[- ]?range/i, 'full-range')
    .replace(/subwoofer/i, 'woofer')
    .trim()
    .toLowerCase();
  const normalizedSize = normalizeSize(size);
  if (normalizedSize && normalizedType) return `${normalizedSize} ${normalizedType}`;
  if (normalizedSize) return `${normalizedSize} driver`;
  return normalizedType || 'factory driver';
}

function normalizeSize(value) {
  const match = String(value).match(/(\d+(?:\.\d+)?|\.\d+)\s*(?:[x×]\s*(\d+(?:\.\d+)?))?/i);
  if (!match) return '';
  const first = String(Number(match[1]));
  const second = match[2] ? String(Number(match[2])) : null;
  return second ? `${first}×${second}-inch` : `${first}-inch`;
}

function extractSize(value) {
  const match = value.match(/(\d+(?:\.\d+)?|\.\d+)\s*(?:["”]|inch|in\b)?(?:\s*[x×]\s*(\d+(?:\.\d+)?))?/i);
  if (!match) return '';
  return match[2] ? `${match[1]} x ${match[2]}` : match[1];
}

function emptyLocations() {
  return Object.fromEntries(LOCATION_FIELDS.map((field) => [field, new Set()]));
}

function addDriver(locations, field, driver) {
  if (field && driver) locations[field].add(driver);
}

function finalizeLocations(locations) {
  return Object.fromEntries(LOCATION_FIELDS.map((field) => [field, [...locations[field]].sort().join('; ') || null]));
}

function hasLocations(locations) {
  return LOCATION_FIELDS.some((field) => locations[field]?.size > 0 || Boolean(locations[field]));
}

function buildInventoryIndex(rows) {
  const byMakeYear = new Map();
  for (const row of rows) {
    if (!row.make || !row.model || !Number.isInteger(row.year)) continue;
    const key = `${normalizeKey(row.make)}|${row.year}`;
    const list = byMakeYear.get(key) ?? [];
    list.push(row);
    byMakeYear.set(key, list);
  }
  return { byMakeYear };
}

function resolveAgainstInventory(record, index) {
  const matches = [];
  for (let year = record.yearStart; year <= record.yearEnd; year += 1) {
    const rows = index.byMakeYear.get(`${normalizeKey(record.make)}|${year}`) ?? [];
    const bodyKey = normalizeKey(record.bodyStyle);
    let applicable = rows.filter((row) => normalizeKey(row.model) === normalizeKey(record.model));
    let resolution = 'model';
    if (applicable.length === 0) {
      applicable = rows.filter((row) => trimMatchesExternalModel(row.trim, record.model));
      resolution = 'trim';
    }
    if (bodyKey) applicable = applicable.filter((row) => normalizeKey(row.body_style) === bodyKey);

    const families = new Map();
    for (const row of applicable) {
      const key = `${row.model}|${row.body_style ?? ''}`;
      families.set(key, row);
    }
    for (const row of families.values()) {
      matches.push({
        ...record,
        make: row.make,
        model: row.model,
        yearStart: year,
        yearEnd: year,
        bodyStyle: row.body_style ?? record.bodyStyle,
        resolution,
      });
    }
  }
  return matches;
}

function trimMatchesExternalModel(trim, model) {
  const trimKey = normalizeKey(trim);
  const modelKey = normalizeKey(model);
  if (!trimKey || !modelKey || modelKey.length < 2) return false;
  return trimKey === modelKey || trimKey.startsWith(modelKey);
}

function evaluatePerYear(records, minimumAgreeingLocations) {
  const groups = new Map();
  for (const record of records) {
    const key = [record.make, record.model, record.bodyStyle ?? '', record.yearStart].map(normalizeKey).join('|');
    const bySource = groups.get(key) ?? new Map();
    const sourceRecords = bySource.get(record.source) ?? [];
    sourceRecords.push(record);
    bySource.set(record.source, sourceRecords);
    groups.set(key, bySource);
  }

  const output = [];
  for (const bySource of groups.values()) {
    const first = [...bySource.values()][0][0];
    const sourceVariants = new Map();
    for (const [source, candidates] of bySource) {
      const variants = new Map();
      for (const candidate of candidates) variants.set(locationSignature(candidate.locations), candidate);
      sourceVariants.set(source, [...variants.values()]);
    }

    const sourceConflict = [...sourceVariants.values()].some((variants) => variants.length > 1);
    const singular = [...sourceVariants.entries()]
      .filter(([, variants]) => variants.length === 1)
      .map(([source, variants]) => ({ source, record: variants[0] }));

    let status = 'single_source';
    let reason = 'Only one broad source supplied a usable layout.';
    let locations = singular[0]?.record.locations ?? first.locations;
    let agreeingLocations = 0;

    if (sourceConflict) {
      status = 'conflict';
      reason = 'A source supplied multiple different layouts for this vehicle family and year.';
    } else if (singular.length >= 2) {
      const comparison = compareLocations(singular[0].record.locations, singular[1].record.locations);
      agreeingLocations = comparison.agreeingLocations;
      if (!comparison.conflict && agreeingLocations >= minimumAgreeingLocations) {
        status = 'cross_source_match';
        reason = `${agreeingLocations} speaker locations match across broad sources; independent verification is still required.`;
        locations = mergeLocations(singular.map((item) => item.record.locations));
      } else {
        status = 'conflict';
        reason = comparison.conflict
          ? `Sources disagree at: ${comparison.conflictingFields.join(', ')}.`
          : `Only ${agreeingLocations} location(s) agreed; ${minimumAgreeingLocations} required.`;
      }
    }

    output.push({
      status,
      reason,
      make: first.make,
      model: first.model,
      bodyStyle: first.bodyStyle,
      yearStart: first.yearStart,
      yearEnd: first.yearEnd,
      locations,
      agreeingLocations,
      sources: [...bySource.keys()].sort(),
      sourceModels: [...new Set([...bySource.values()].flat().map((item) => item.sourceModel))].sort(),
    });
  }
  return output.sort(sortEvaluated);
}

function compareLocations(left, right) {
  let agreeingLocations = 0;
  const conflictingFields = [];
  for (const field of LOCATION_FIELDS) {
    if (!left[field] || !right[field]) continue;
    const leftSizes = sizeTokens(left[field]);
    const rightSizes = sizeTokens(right[field]);
    if (leftSizes.size === 0 || rightSizes.size === 0) {
      agreeingLocations += 1;
    } else if ([...leftSizes].some((size) => rightSizes.has(size))) {
      agreeingLocations += 1;
    } else {
      conflictingFields.push(field);
    }
  }
  return { agreeingLocations, conflictingFields, conflict: conflictingFields.length > 0 };
}

function sizeTokens(value) {
  return new Set([...String(value).matchAll(/\b\d+(?:\.\d+)?(?:×\d+(?:\.\d+)?)?-inch\b/g)].map((match) => match[0]));
}

function mergeLocations(locationSets) {
  const merged = emptyLocations();
  for (const locations of locationSets) {
    for (const field of LOCATION_FIELDS) {
      for (const driver of String(locations[field] ?? '').split(';').map((value) => value.trim()).filter(Boolean)) {
        merged[field].add(driver);
      }
    }
  }
  return finalizeLocations(merged);
}

function collapseConsecutiveYears(records) {
  const groups = new Map();
  for (const record of records) {
    const key = [
      record.status,
      record.make,
      record.model,
      record.bodyStyle ?? '',
      locationSignature(record.locations),
      record.reason,
      record.sources.join(','),
    ].map(normalizeKey).join('|');
    const list = groups.get(key) ?? [];
    list.push(record);
    groups.set(key, list);
  }

  const output = [];
  for (const list of groups.values()) {
    list.sort((a, b) => a.yearStart - b.yearStart);
    let current = structuredClone(list[0]);
    for (const next of list.slice(1)) {
      if (next.yearStart === current.yearEnd + 1) {
        current.yearEnd = next.yearEnd;
        current.sourceModels = [...new Set([...current.sourceModels, ...next.sourceModels])].sort();
      } else {
        output.push(current);
        current = structuredClone(next);
      }
    }
    output.push(current);
  }
  return output.sort(sortEvaluated);
}

function toDirectusLayout(record) {
  const years = record.yearStart === record.yearEnd ? String(record.yearStart) : `${record.yearStart}–${record.yearEnd}`;
  const body = record.bodyStyle ? ` ${record.bodyStyle}` : '';
  return {
    name: `${record.make} ${record.model} ${years}${body} — standard factory layout`,
    make: record.make,
    model: record.model,
    platform: null,
    year_start: record.yearStart,
    year_end: record.yearEnd,
    body_style: record.bodyStyle || null,
    trim_condition: null,
    factory_audio_system: 'Unspecified factory system',
    audio_tier: 'other',
    ...record.locations,
    factory_driver_notes: null,
  };
}

function withCandidateId(record) {
  return {
    ...record,
    candidateId: `fal_${hash([
      record.make,
      record.model,
      record.bodyStyle ?? '',
      record.yearStart,
      record.yearEnd,
      locationSignature(record.locations),
    ].join('|'))}`,
  };
}

async function loadApprovedCandidateIds(path) {
  if (!path) return new Set();
  const payload = JSON.parse(await readFile(resolve(path), 'utf8'));
  const values = Array.isArray(payload) ? payload : payload.approved_candidate_ids;
  if (!Array.isArray(values) || values.some((value) => typeof value !== 'string')) {
    throw new Error('--verified-input must contain a JSON array or {"approved_candidate_ids": ["fal_..."]}.');
  }
  return new Set(values);
}

async function writeLayouts(layouts) {
  const existing = await fetchDirectusItems('factory_audio_layouts', { fields: 'name' });
  const existingNames = new Set(existing.map((item) => item.name));
  const pending = layouts.filter((layout) => !existingNames.has(layout.name));
  for (let index = 0; index < pending.length; index += 100) {
    const chunk = pending.slice(index, index + 100);
    const response = await fetch(`${directusUrl}/items/factory_audio_layouts`, {
      method: 'POST',
      headers: {
        'User-Agent': USER_AGENT,
        Authorization: `Bearer ${directusToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(chunk),
      signal: AbortSignal.timeout(45_000),
    });
    if (!response.ok) {
      throw new Error(`Directus write failed: ${response.status} ${response.statusText}`);
    }
  }
  return { requested: true, created: pending.length, skipped_existing: layouts.length - pending.length };
}

function summarizeRawRecord(record) {
  return {
    source: record.source,
    make: record.make,
    model: record.model,
    year_start: record.yearStart,
    year_end: record.yearEnd,
    body_style: record.bodyStyle,
  };
}

function summarizeEvaluatedRecord(record) {
  return {
    status: record.status,
    reason: record.reason,
    make: record.make,
    model: record.model,
    year_start: record.yearStart,
    year_end: record.yearEnd,
    body_style: record.bodyStyle,
    sources: record.sources,
    source_models: record.sourceModels,
    locations: record.locations,
  };
}

function summarizeCandidate(record) {
  return {
    candidate_id: record.candidateId,
    requires_independent_verification: true,
    reason: record.reason,
    make: record.make,
    model: record.model,
    year_start: record.yearStart,
    year_end: record.yearEnd,
    body_style: record.bodyStyle,
    sources: record.sources,
    source_models: record.sourceModels,
    locations: record.locations,
  };
}

function locationSignature(locations) {
  return LOCATION_FIELDS.map((field) => `${field}:${locations[field] ?? ''}`).join('|');
}

function sortEvaluated(left, right) {
  return left.make.localeCompare(right.make)
    || left.model.localeCompare(right.model)
    || left.yearStart - right.yearStart
    || String(left.bodyStyle).localeCompare(String(right.bodyStyle));
}

function normalizeKey(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function slugToWords(value) {
  return value.split('-').map((part) => part ? `${part[0].toUpperCase()}${part.slice(1)}` : '').join(' ');
}

function hash(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 20);
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function mapWithConcurrency(items, concurrency, worker) {
  const output = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return output;
}
