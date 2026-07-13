// driver-model — Thiele/Small enclosure modeling from catalog T/S parameters.
//
// Solves the lumped-element acoustic equivalent circuit numerically per
// frequency (the same physics WinISD implements), so sealed, ported, and
// infinite-baffle alignments share one code path. Validated against the
// hand-computed sealed alignments in the driver reviews (HC-12: Qtc 0.707 →
// 3.9 L, Fc 92.2 Hz) and against stored 1 W/1 m sensitivities.
//
// All SPL is anechoic half-space at 1 m — cabin gain is deliberately not
// modeled, matching the convention the enthusiast community reads.
//
// Units at the API boundary match the Directus subwoofers collection
// (Hz, liters, cm², mm, ohms, watts); everything internal is SI.

const RHO = 1.184 // air density, kg/m³
const C = 343 // speed of sound, m/s
const P_REF = 2e-5 // 0 dB SPL reference pressure, Pa
const QL = 7 // box leakage Q for ported alignments (WinISD default)

export const LITERS_PER_FT3 = 28.3168

export type DriverTS = {
  fsHz: number
  qts: number
  qes: number
  vasL: number
  sdCm2: number
  xmaxMm: number
  reOhm: number
  rmsWatts: number
}

export type Alignment =
  | { kind: 'ib' }
  | { kind: 'sealed'; vbL: number }
  | { kind: 'ported'; vbL: number; fbHz: number }

// Precomputed SI-domain driver constants. Bl is recovered from Qes rather
// than read from the catalog so the model stays consistent even when a row's
// bl_tm was published against a different wiring convention than re_ohm.
export type DerivedDriver = {
  ts: DriverTS
  sd: number // m²
  cas: number // acoustic compliance, m⁵/N
  mas: number // acoustic mass, kg/m⁴
  ras: number // total acoustic damping at Re, N·s/m⁵
  bl: number // motor force factor, T·m (implied by Qes at Re)
  xmax: number // m, one-way
}

export function deriveDriver(ts: DriverTS): DerivedDriver {
  const ws = 2 * Math.PI * ts.fsHz
  const sd = ts.sdCm2 * 1e-4
  const vas = ts.vasL * 1e-3
  const cas = vas / (RHO * C * C)
  const mas = 1 / (ws * ws * cas)
  const ras = (ws * mas) / ts.qts
  const mms = mas * sd * sd
  const bl = Math.sqrt((ws * mms * ts.reOhm) / ts.qes)
  return { ts, sd, cas, mas, ras, bl, xmax: ts.xmaxMm * 1e-3 }
}

export type SolvePoint = {
  spl: number // dB SPL, half-space 1 m, for the given RMS drive voltage
  excursion: number // m RMS phasor magnitude (× √2 for peak)
  portFlow: number // m³/s RMS volume velocity through the port (0 if none)
  phase: number // rad, phase of the radiated volume velocity (for group delay)
}

// One frequency point of the equivalent circuit. egVolts is RMS drive.
export function solveAt(d: DerivedDriver, align: Alignment, fHz: number, egVolts: number): SolvePoint {
  const w = 2 * Math.PI * fHz
  const p = (egVolts * d.bl) / (d.ts.reOhm * d.sd) // acoustic source pressure

  // Driver branch impedance Zas = Ras + jωMas + 1/(jωCas)
  const zr = d.ras
  const zi = w * d.mas - 1 / (w * d.cas)

  // Box load Zb (0 for IB) and port branch admittance imag part.
  let br = 0
  let bi = 0
  let ymapIm = 0
  if (align.kind !== 'ib') {
    const cab = (align.vbL * 1e-3) / (RHO * C * C)
    if (align.kind === 'sealed') {
      bi = -1 / (w * cab)
    } else {
      const wb = 2 * Math.PI * align.fbHz
      const map = 1 / (wb * wb * cab)
      const ral = QL / (wb * cab)
      ymapIm = -1 / (w * map)
      const yr = 1 / ral
      const yi = w * cab + ymapIm
      const den = yr * yr + yi * yi
      br = yr / den
      bi = -yi / den
    }
  }

  // Cone volume velocity Ud = p / (Zas + Zb)
  const tr = zr + br
  const ti = zi + bi
  const td = tr * tr + ti * ti
  const ur = (p * tr) / td
  const ui = (-p * ti) / td

  // Radiated volume velocity: cone minus the port branch (which cancels the
  // cone below tuning and carries the output at tuning).
  let utr = ur
  let uti = ui
  let portFlow = 0
  if (align.kind === 'ported') {
    const pbr = ur * br - ui * bi
    const pbi = ur * bi + ui * br
    const upr = -pbi * ymapIm
    const upi = pbr * ymapIm
    utr = ur - upr
    uti = ui - upi
    portFlow = Math.hypot(upr, upi)
  }

  const u = Math.hypot(utr, uti)
  const pressure = (RHO * w * u) / (2 * Math.PI * 1)
  return {
    spl: 20 * Math.log10(pressure / P_REF),
    excursion: Math.hypot(ur, ui) / (w * d.sd),
    portFlow,
    phase: Math.atan2(uti, utr),
  }
}

// Log-spaced frequency grid.
export function logSweep(f0: number, f1: number, n: number): number[] {
  const out: number[] = []
  for (let i = 0; i < n; i++) out.push(f0 * Math.pow(f1 / f0, i / (n - 1)))
  return out
}

// Drive voltages (RMS).
export function voltsFor1W(d: DriverTS): number {
  return Math.sqrt(d.reOhm)
}
export function voltsForRated(d: DriverTS): number {
  return Math.sqrt(d.rmsWatts * d.reOhm)
}

// Passband reference and -3/-10 dB corner frequencies for an alignment,
// referenced to the true high-frequency asymptote (evaluated at 2 kHz, well
// above any alignment corner and below where Le — unmodeled — would matter).
export function cornerFrequencies(d: DerivedDriver, align: Alignment) {
  const eg = voltsFor1W(d.ts)
  const ref = solveAt(d, align, 2000, eg).spl
  const at = (drop: number): number => {
    let prev: { f: number; v: number } | null = null
    for (let i = 0; i < 160; i++) {
      const f = 10 * Math.pow(400 / 10, i / 159)
      const v = solveAt(d, align, f, eg).spl - ref
      if (prev && prev.v <= -drop && v > -drop) {
        return prev.f + ((f - prev.f) * (-drop - prev.v)) / (v - prev.v)
      }
      prev = { f, v }
    }
    return NaN
  }
  return { refSpl1W: ref, f3: at(3.01), f10: at(10) }
}

// Sensitivity at 2.83 V/1 m from the 1 W passband reference.
export function sensitivity283(refSpl1W: number, reOhm: number): number {
  return refSpl1W + 10 * Math.log10(8.0089 / reOhm)
}

// Efficiency bandwidth product — the classic sealed-vs-ported heuristic.
export function ebp(d: DriverTS): number {
  return d.fsHz / d.qes
}

// Sealed box that lands a target Qtc. Returns null when Qts already exceeds
// the target (no finite box can get there) — an informative null, not a gap.
export function sealedBoxForQtc(d: DriverTS, qtc = Math.SQRT1_2): { vbL: number; fcHz: number } | null {
  const ratio = qtc / d.qts
  if (ratio <= 1.02) return null
  const alpha = ratio * ratio - 1
  return { vbL: d.vasL / alpha, fcHz: d.fsHz * Math.sqrt(1 + alpha) }
}

// Highest frequency below tuning where peak excursion crosses Xmax at the
// given power (default rated) — the subsonic-filter recommendation. NaN when
// it never crosses.
export function subsonicCrossover(
  d: DerivedDriver,
  align: Alignment & { kind: 'ported' },
  watts?: number,
): number {
  const eg = Math.sqrt((watts ?? d.ts.rmsWatts) * d.ts.reOhm)
  for (let f = align.fbHz; f >= 10; f -= 0.25) {
    if (solveAt(d, align, f, eg).excursion * Math.SQRT2 > d.xmax) return f
  }
  return NaN
}

// Port area needed to hold peak air velocity under the given limit at rated
// power (17 m/s is the community chuffing threshold). Returns m².
export function portAreaForVelocity(
  d: DerivedDriver,
  align: Alignment & { kind: 'ported' },
  maxVelocity = 17,
  watts?: number,
): number {
  const eg = Math.sqrt((watts ?? d.ts.rmsWatts) * d.ts.reOhm)
  let peak = 0
  for (const f of logSweep(Math.max(15, align.fbHz - 15), align.fbHz + 25, 60)) {
    const flow = solveAt(d, align, f, eg).portFlow * Math.SQRT2
    if (flow > peak) peak = flow
  }
  return peak / maxVelocity
}

// Max SPL at a frequency: the lesser of power-limited (given watts, default
// rated) and displacement-limited (drive scaled so peak excursion hits Xmax).
export function maxSplAt(d: DerivedDriver, align: Alignment, fHz: number, watts?: number) {
  const eg = Math.sqrt((watts ?? d.ts.rmsWatts) * d.ts.reOhm)
  const r = solveAt(d, align, fHz, eg)
  const excursionRatio = d.xmax / (r.excursion * Math.SQRT2)
  const displacementLimited = excursionRatio < 1
  return {
    spl: r.spl + (displacementLimited ? 20 * Math.log10(excursionRatio) : 0),
    displacementLimited,
  }
}

// Sealed-box alignment numbers for an arbitrary volume: Qtc, Fc, and the
// classic closed-box compliance ratio α = Vas/Vb.
export function sealedAlignment(ts: DriverTS, vbL: number) {
  const alpha = ts.vasL / vbL
  const k = Math.sqrt(1 + alpha)
  return { alpha, qtc: ts.qts * k, fcHz: ts.fsHz * k }
}

// Group delay in ms across a frequency grid: −dφ/dω of the radiated output,
// phase unwrapped, central differences. The e^{−jkr} propagation term is
// excluded (WinISD's convention).
export function groupDelaySeries(
  d: DerivedDriver,
  align: Alignment,
  freqs: number[],
  egVolts: number,
): { f: number; y: number }[] {
  const ph = freqs.map((f) => solveAt(d, align, f, egVolts).phase)
  for (let i = 1; i < ph.length; i++) {
    while (ph[i] - ph[i - 1] > Math.PI) ph[i] -= 2 * Math.PI
    while (ph[i] - ph[i - 1] < -Math.PI) ph[i] += 2 * Math.PI
  }
  return freqs.map((f, i) => {
    const i0 = Math.max(0, i - 1)
    const i1 = Math.min(freqs.length - 1, i + 1)
    const dw = 2 * Math.PI * (freqs[i1] - freqs[i0])
    return { f, y: (-(ph[i1] - ph[i0]) / dw) * 1000 }
  })
}

// Physical port length (m) that lands the tuning, from the Helmholtz
// resonance of N identical round ports of total area areaM2, with the
// standard one-flanged/one-free end correction (0.732 diameters ≈ 1.463 r).
// Negative result = the port won't fit (area too large for the tuning).
export function portLengthM(vbL: number, fbHz: number, areaM2: number, count: number): number {
  const wb = 2 * Math.PI * fbHz
  const r = Math.sqrt(areaM2 / count / Math.PI)
  return (C * C * areaM2) / (wb * wb * vbL * 1e-3) - 1.463 * r
}

// Peak port air velocity (m/s) across a frequency grid for a given total
// port area and drive voltage. 17 m/s is the community chuffing threshold.
export function portVelocitySeries(
  d: DerivedDriver,
  align: Alignment & { kind: 'ported' },
  areaM2: number,
  freqs: number[],
  egVolts: number,
): { f: number; y: number }[] {
  return freqs.map((f) => ({
    f,
    y: (solveAt(d, align, f, egVolts).portFlow * Math.SQRT2) / areaM2,
  }))
}

// RMS drive voltage for an arbitrary input power into Re.
export function voltsForWatts(d: DriverTS, watts: number): number {
  return Math.sqrt(watts * d.reOhm)
}
