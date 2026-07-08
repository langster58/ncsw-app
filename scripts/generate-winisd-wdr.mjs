import fs from 'node:fs';
import path from 'node:path';

const [, , inputPath, outputDir] = process.argv;

if (!inputPath || !outputDir) {
  console.error('Usage: node scripts/generate-winisd-wdr.mjs <directus-export.json> <output-dir>');
  process.exit(1);
}

const payload = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const rows = Array.isArray(payload) ? payload : payload.data;

if (!Array.isArray(rows)) {
  throw new Error('Input must be a Directus response with a data array or a raw array.');
}

fs.mkdirSync(outputDir, { recursive: true });

const requiredFields = [
  'brand',
  'model',
  'fs_hz',
  'qts',
  'qes',
  'qms',
  'vas_l',
  'sd_cm2',
  'xmax_mm',
  're_ohm',
  'bl_tm',
  'mms_g',
  'cms_mm_per_n',
];

function hasRequiredData(row) {
  return requiredFields.every((field) => row[field] !== null && row[field] !== undefined && row[field] !== '');
}

function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '0';
  }

  return Number(value)
    .toPrecision(12)
    .replace(/\.?0+$/, '')
    .replace('.', ',');
}

function safeFileName(value) {
  return String(value)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function nominalImpedance(reOhm) {
  if (reOhm < 2.3) return 2;
  if (reOhm < 3.3) return 3;
  if (reOhm < 6.2) return 4;
  if (reOhm < 10) return 8;
  return Math.round(reOhm);
}

function coneDiameterM(sdM2) {
  return Math.sqrt((4 * sdM2) / Math.PI);
}

function efficiency(fsHz, vasM3, qes) {
  // Small-signal reference efficiency approximation.
  const c = 343.684120962152;
  return (4 * Math.PI ** 2 * fsHz ** 3 * vasM3) / (c ** 3 * qes);
}

function sensitivityFromEfficiency(n0) {
  return 112.15 + 10 * Math.log10(n0);
}

function todayStamp() {
  return new Date().toISOString().slice(0, 10).replaceAll('-', '');
}

function driverToWdr(row) {
  const fsHz = Number(row.fs_hz);
  const qes = Number(row.qes);
  const qms = Number(row.qms);
  const sdM2 = Number(row.sd_cm2) / 10000;
  const xmaxM = Number(row.xmax_mm) / 1000;
  const mmsKg = Number(row.mms_g) / 1000;
  const cmsMPerN = Number(row.cms_mm_per_n) / 1000;
  const reOhm = Number(row.re_ohm);
  const qts = (qes * qms) / (qes + qms);
  const blTm = Math.sqrt((2 * Math.PI * fsHz * mmsKg * reOhm) / qes);
  const vasM3 = 1.20095217714682 * 343.684120962152 ** 2 * sdM2 ** 2 * cmsMPerN;
  const leH = row.le_mh === null || row.le_mh === undefined ? 0 : Number(row.le_mh) / 1000;
  const peW = row.rms_watts === null || row.rms_watts === undefined ? 0 : Number(row.rms_watts);
  const vdM3 = sdM2 * xmaxM;
  const diaM = coneDiameterM(sdM2);
  const n0 = efficiency(fsHz, vasM3, qes);
  const spl = sensitivityFromEfficiency(n0);
  const ebp = fsHz / qes;
  const rms = (2 * Math.PI * fsHz * mmsKg) / qms;
  const date = todayStamp();

  const values = {
    Brand: row.brand,
    Model: row.model,
    Manufacturer: row.brand,
    ProvidedBy: 'North Coast Soundworks Directus',
    Comment: `Generated from Directus slug ${row.slug || ''}`.trim(),
    DateAdded: date,
    DateModified: date,
    Qts: qts,
    Znom: nominalImpedance(reOhm),
    Fs: fsHz,
    Pe: peW,
    SPL: spl,
    Re: reOhm,
    Le: leH,
    fLe: 0,
    KLe: 0,
    BL: blTm,
    Xmax: xmaxM,
    Cms: cmsMPerN,
    Qms: qms,
    Qes: qes,
    Rms: rms,
    Mms: mmsKg,
    Sd: sdM2,
    Vas: vasM3,
    Dia: diaM,
    Vd: vdM3,
    no: n0,
    Dd: diaM,
    EBP: ebp,
    numVC: 1,
    Hc: 0,
    Hg: 0,
    SPLmax: 0,
    SPLmaxLF: 0,
    USPL: 0,
    alfaVC: 0,
    Rt: 0,
    Ct: 0,
    gamma: 0,
    Rme: 0,
    Mpow: 0,
    Mcost: 0,
    Gloss: 0,
    VCCon: 1,
    c: 343.684120962152,
    roo: 1.20095217714682,
    Thick: 0,
    Depth: 0,
    MagDepth: 0,
    Magnet: 0,
    Basket: 0,
    Outer: 0,
    Vcd: 0,
    DVol: 0,
    ParState: 'CEECEENNECNCECCCEECCNCCEEECCCNNNCCCCCCEEEEEEECNCC',
  };

  return `[Driver]\r\n${Object.entries(values)
    .map(([key, value]) => `${key}=${typeof value === 'number' ? formatNumber(value) : value}`)
    .join('\r\n')}\r\n`;
}

let written = 0;
const skipped = [];

for (const row of rows) {
  if (!hasRequiredData(row)) {
    skipped.push({
      slug: row.slug,
      missing: requiredFields.filter((field) => row[field] === null || row[field] === undefined || row[field] === ''),
    });
    continue;
  }

  const fileName = `${safeFileName(`${row.brand} ${row.model}`)}.wdr`;
  fs.writeFileSync(path.join(outputDir, fileName), driverToWdr(row), 'utf8');
  written += 1;
}

const manifest = {
  generatedAt: new Date().toISOString(),
  inputPath,
  outputDir,
  written,
  skipped,
};

fs.writeFileSync(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(manifest, null, 2));
