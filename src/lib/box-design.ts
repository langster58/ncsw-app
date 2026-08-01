// box-design — the NCSW design bench, in the browser.
//
// TypeScript port of scripts/scoring/instrument.py (the ONE source of
// driver-scoring physics): the subwoofer band composite (v2.4 sealed, the
// 2026-07-19 ported instrument) and the founder-ruled design points —
// ported = the -1 dB KNEE of score vs volume (ruling 2026-07-28: the box
// takes what the driver needs, not what the car allows), sealed = the argmax
// box. Scores here are RELATIVE (dB vs the driver's own best), which is all
// the modeler needs to draw the knee; absolute normalization (impact_score
// anchoring) stays in the Python bench.
//
// Sweep feasibility uses the bench's own port gate VERBATIM (n × 4″ flared
// aeros at 25 m/s, ≤ 6 tubes, ≤ ~40″ run) so the knee lands on the same
// grid point the DB stores. designPortCount solves the tube count for a
// design point under the same flared-aero flow standard.

import type { DriverTS } from './driver-model'

const BAND = [20, 25, 31.5, 40, 50, 63]
const FT = 55.0 // cabin-gain transfer transition, Hz
const QL_VENTED = 7.0
const PORT_K_END = 0.732 // end correction, one flanged + one free end
const C_AIR = 343.0
const FB_RATIO_MIN = 0.85
const FB_RATIO_MAX = 1.05
const FB_ABS_MIN = 28.0
const PORT_RUN_CAP_M = 1.016 // ~40" straight run
const PORT_TUBE_MAX = 6
const VMAX_AERO = 25.0 // m/s — founder standard 2026-07-19 for flared aeros
const PORT_BORES_IN = [4, 6, 8] // preferred order: 4″ NCSW standard, escalate bore only when count runs out
const INCH_M = 0.0254

export const PORTED_KNEE_DB = 1.0
const PORTED_SWEEP_MIN_FT3 = 0.3
const PORTED_SWEEP_MAX_FT3 = 10.0
const SEALED_VB_CAP_FT3 = 7.0
const SEALED_VB_FLOOR_FT3: Record<string, number> = {
  '6.5': 0.15,
  '8': 0.25,
  '10': 0.45,
  '12': 0.7,
  '13.5': 0.9,
  '15': 1.2,
  '18': 2.6,
  '21': 4.0,
}
const FT3_L = 28.3168

// House target curve, dB above midrange reference at f (0 at 200 Hz+).
function shape(f: number): number {
  return Math.max(0, 22.0 - 7.33 * Math.log2(f / 25.0))
}

// Cabin gain below the ~55 Hz transfer transition, dB.
function gain(f: number): number {
  return Math.max(0, 12 * Math.log2(FT / f))
}

// Band composite from per-frequency margins (aligned to BAND). Ruling
// 2026-07-19: the min-term runs over 25–63 Hz; 20 Hz informs, never vetoes.
function compositeFromMargins(marg: number[]): number {
  const core = marg.slice(1)
  const mean = core.reduce((a, b) => a + b, 0) / core.length
  return Math.pow(10, Math.min(...core) / 10) * Math.pow(10, mean / 10)
}

// Sealed-box 2nd-order high-pass magnitude, linear.
function H(f: number, fc: number, qtc: number): number {
  const x2 = (f / fc) ** 2
  return x2 / Math.sqrt((x2 - 1) ** 2 + x2 / qtc ** 2)
}

// Small lumped vented-box model: |G| (voltage→pressure, 4th-order HP) and
// |Xnorm| (cone excursion with the relief notch at Fb) at f. s = jω expanded
// to real/imaginary parts by power parity.
function ventedTf(f: number, fs: number, fb: number, alpha: number, qts: number): [number, number] {
  const w = 2 * Math.PI * f
  const Ts = 1 / (2 * Math.PI * fs)
  const Tb = 1 / (2 * Math.PI * fb)
  const c4 = Ts * Ts * Tb * Tb
  const c3 = (Ts * Ts * Tb) / QL_VENTED + (Ts * Tb * Tb) / qts
  const c2 = (alpha + 1) * Tb * Tb + (Ts * Tb) / (QL_VENTED * qts) + Ts * Ts
  const c1 = Tb / QL_VENTED + Ts / qts
  const dRe = w ** 4 * c4 - w * w * c2 + 1
  const dIm = -(w ** 3) * c3 + w * c1
  const dAbs = Math.hypot(dRe, dIm)
  const g = (w ** 4 * c4) / dAbs
  const xRe = 1 - w * w * Tb * Tb
  const xIm = (w * Tb) / QL_VENTED
  const x = Math.hypot(xRe, xIm) / dAbs
  return [g, x]
}

// Installer protection filter: 2nd-order Butterworth HP at 0.7 × Fb.
function subsonicBw2(f: number, fb: number): number {
  const fc = 0.7 * fb
  const x2 = (f / fc) ** 2
  return x2 / Math.sqrt((x2 - 1) ** 2 + 2 * x2)
}

// Physical length (m) of n identical round tubes of TOTAL area tuning vb to
// fb; end correction acts per tube mouth.
function portTubeLengthM(totalAreaM2: number, fbHz: number, vbL: number, tubeRadiusM: number): number {
  const vb = vbL / 1000
  return (C_AIR * C_AIR * totalAreaM2) / (4 * Math.PI ** 2 * fbHz ** 2 * vb) - PORT_K_END * tubeRadiusM
}

// Bench feasibility gate, verbatim from instrument.py aero_port_spec: n × 4″
// flared aeros sized at 25 m/s, ≤ 6 tubes, tube length in [2 cm, run cap].
function benchPortFeasible(ts: DriverTS, fbHz: number, vbL: number): boolean {
  const r = (4 * INCH_M) / 2
  const tubeArea = Math.PI * r * r
  const areaNeeded = (ts.sdCm2 * 1e-4 * ts.xmaxMm * 1e-3 * 2 * Math.PI * fbHz) / VMAX_AERO
  const n = Math.max(1, Math.ceil(areaNeeded / tubeArea))
  if (n > PORT_TUBE_MAX) return false
  const len = portTubeLengthM(n * tubeArea, fbHz, vbL, r)
  return len >= 0.02 && len <= PORT_RUN_CAP_M
}

// Port count for a design point: tubes needed to hold the flared-aero flow
// ceiling at Fb, from the driver's full swept volume (Sd·Xmax·ω — the
// bench's conservative closed form), scaled by driver count. Prefers 4″
// tubes (the NCSW standard bore), escalating to 6″/8″ only when the count
// runs out; capped at PORT_TUBE_MAX regardless.
export function designPortCount(ts: DriverTS, fbHz: number, driverCount = 1): number {
  const areaNeeded = (driverCount * (ts.sdCm2 * 1e-4 * ts.xmaxMm * 1e-3 * 2 * Math.PI * fbHz)) / VMAX_AERO
  for (const bore of PORT_BORES_IN) {
    const tubeArea = Math.PI * ((bore * INCH_M) / 2) ** 2
    const tubes = Math.max(1, Math.ceil(areaNeeded / tubeArea))
    if (tubes <= PORT_TUBE_MAX) return tubes
  }
  return PORT_TUBE_MAX
}

// Margins for one ported (Vb, Fb) at rated power — same currency as sealed.
function portedMargins(ts: DriverTS, sens: number, vbL: number, fb: number): number[] {
  const alpha = ts.vasL / vbL
  const vd = ts.sdCm2 * 1e-4 * ts.xmaxMm * 1e-3
  const fHi = 400
  const [gHi, xHi] = ventedTf(fHi, ts.fsHz, fb, alpha, ts.qts)
  const K = 108.4 + 20 * Math.log10(fHi * fHi * vd)
  return BAND.map((f) => {
    const [g, x] = ventedTf(f, ts.fsHz, fb, alpha, ts.qts)
    const ss = subsonicBw2(f, fb)
    const disp = K + 20 * Math.log10(g / x / (gHi / xHi)) + 20 * Math.log10(ss)
    const therm = sens + 10 * Math.log10(ts.rmsWatts) + 20 * Math.log10(g * ss)
    return Math.min(disp, therm) + gain(f) - shape(f)
  })
}

function sealedMargins(ts: DriverTS, sens: number, vbL: number): number[] {
  const fc = ts.fsHz * Math.sqrt(1 + ts.vasL / vbL)
  const qtc = ts.qts * Math.sqrt(1 + ts.vasL / vbL)
  const vd = ts.sdCm2 * 1e-4 * ts.xmaxMm * 1e-3
  return BAND.map((f) => {
    const mech = 108.4 + 20 * Math.log10(f * f * vd)
    const therm = sens + 10 * Math.log10(ts.rmsWatts) + 20 * Math.log10(H(f, fc, qtc))
    return Math.min(mech, therm) + gain(f) - shape(f)
  })
}

export type SweepPoint = { vbFt3: number; relDb: number; fbHz?: number }
export type PortedDesign = {
  curve: SweepPoint[] // relDb is dB vs the flat top (≤ 0)
  vbFt3: number // per-driver knee volume
  fbHz: number
}
export type SealedDesign = {
  curve: SweepPoint[]
  vbFt3: number // per-driver argmax volume
}

// Ported design bench: sweep volume × musical tuning window, best feasible
// tune per volume, knee = smallest volume within PORTED_KNEE_DB of the top.
export function portedDesign(ts: DriverTS, sens: number): PortedDesign | null {
  const fbs: number[] = []
  for (let r = FB_RATIO_MIN; r <= FB_RATIO_MAX + 1e-9; r += 0.05) {
    fbs.push(Math.max(FB_ABS_MIN, ts.fsHz * r))
  }
  const raw: { vbFt3: number; raw: number; fbHz: number }[] = []
  for (let vb = PORTED_SWEEP_MIN_FT3; vb <= PORTED_SWEEP_MAX_FT3; vb *= 1.13) {
    const vbL = vb * FT3_L
    let best: { raw: number; fbHz: number } | null = null
    for (const fb of fbs) {
      if (!benchPortFeasible(ts, fb, vbL)) continue
      const c = compositeFromMargins(portedMargins(ts, sens, vbL, fb))
      if (!best || c > best.raw) best = { raw: c, fbHz: fb }
    }
    if (best) raw.push({ vbFt3: vb, raw: best.raw, fbHz: best.fbHz })
  }
  if (!raw.length) return null
  const top = Math.max(...raw.map((p) => p.raw))
  const curve = raw.map((p) => ({
    vbFt3: p.vbFt3,
    relDb: 10 * Math.log10(p.raw / top),
    fbHz: p.fbHz,
  }))
  const knee = curve.find((p) => p.relDb >= -PORTED_KNEE_DB)!
  return { curve, vbFt3: knee.vbFt3, fbHz: knee.fbHz! }
}

// Sealed design bench: argmax of the composite over the volume grid
// (founder model 2026-07-28: the design box is a per-driver property).
export function sealedDesign(ts: DriverTS, sens: number, driverSize?: string | null): SealedDesign | null {
  const capL = Math.min(SEALED_VB_CAP_FT3 * FT3_L, 4 * ts.vasL)
  const floor = SEALED_VB_FLOOR_FT3[String(driverSize ?? '')] ?? 0.05
  const raw: { vbFt3: number; raw: number }[] = []
  for (let i = 0; i < 60; i++) {
    const vb = 0.05 * 1.13 ** i
    if (vb < floor || vb * FT3_L > capL) continue
    raw.push({ vbFt3: vb, raw: compositeFromMargins(sealedMargins(ts, sens, vb * FT3_L)) })
  }
  if (!raw.length) return null
  const top = Math.max(...raw.map((p) => p.raw))
  const best = raw.find((p) => p.raw === top)!
  return {
    curve: raw.map((p) => ({ vbFt3: p.vbFt3, relDb: 10 * Math.log10(p.raw / top) })),
    vbFt3: best.vbFt3,
  }
}
