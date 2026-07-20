#!/usr/bin/env python3
"""NCSW canonical scoring instruments — the ONE source of driver-scoring physics.

Why this file exists: the methodology used to live in detached one-off scripts on
an external SSD (rescore_sealed_impact.py, rescore_component_sets.py, ...), each a
slightly different re-implementation of the same physics, none in git, with the DB
silently drifting from all of them. Every "can we score these?" became an
archaeology dig. This module ends that: the physics is written ONCE here, in git,
and every driver class is scored from it. Run score.py --check to see drift,
--write to reconcile. The DB is then always == this methodology.

------------------------------------------------------------------------------
TWO instrument families
------------------------------------------------------------------------------

1. FRONT-STAGE CEILING  (the improved method, settled 2026-07-13, applied to the
   6.5" midbass and now everything front-stage). Score = the CLEAN OUTPUT CEILING
   the DSP cannot add, at the band's low edge:

       Vd        = Sd(m^2) * Xmax(m)                       one-way displaced volume
       mech(f)   = 108.4 + 20*log10(f^2 * Vd)              displacement-limited SPL, 1m/2pi
       thermal   = sensitivity(1W/1m) + 10*log10(RMS W)    voice-coil power ceiling
       score(f)  = min(mech(f), thermal)                   whichever binds first

   Sensitivity enters ONLY through the thermal term (a physical limit), never as a
   merit — power is cheap, so efficiency is not scored. Frequency response, voicing,
   and low-end rolloff are DSP-corrected, so they are not scored. Scored at the low
   band edge because that is where excursion demand (f^2) and the ceiling both bite;
   a narrower top (tweeter vs wideband vs midrange) does not move it. Two operating
   points per class capture the two jobs (mid to main sub vs mid over a front sub).

2. SUBWOOFER BAND COMPOSITE  (v2.4, the sub-specific instrument). Not a single-point
   ceiling — a band-integrated clean-margin composite across 20-63 Hz in the driver's
   BEST practical sealed box, with cabin gain and a target curve, normalized to the
   Fi HC-12 best box = 1.00. This is subwoofers.impact_score. See sub_sealed_score().

Both families share mech_spl / thermal_spl / box response H(); they differ only in
whether output is read at a point (front stage) or integrated over a box+band (sub).
"""
import math

# ---------------------------------------------------------------- shared physics

def mech_spl(f_hz, sd_cm2, xmax_mm_one_way):
    """Displacement-limited SPL at frequency f, half-space, 1 m. Vd = Sd * Xmax."""
    vd = (sd_cm2 * 1e-4) * (xmax_mm_one_way * 1e-3)   # m^3
    return 108.4 + 20 * math.log10(f_hz * f_hz * vd)

def thermal_spl(sensitivity_1w_1m, rms_watts):
    """Voice-coil power ceiling: 1W/1m sensitivity + 10*log10(RMS)."""
    return sensitivity_1w_1m + 10 * math.log10(rms_watts)

def ceiling(f_hz, sd_cm2, xmax_mm_one_way, sensitivity=None, rms_watts=None):
    """Front-stage clean-output ceiling = min(mechanical, thermal) at f.

    Thermal is applied only when both sensitivity and RMS are known; otherwise the
    score is mechanical-only (documented as such per row by the caller)."""
    m = mech_spl(f_hz, sd_cm2, xmax_mm_one_way)
    if sensitivity is not None and rms_watts:
        return round(min(m, thermal_spl(sensitivity, rms_watts)), 1)
    return round(m, 1)

def H(f, fc, qtc):
    """Sealed-box (2nd-order high-pass) magnitude response, linear."""
    x2 = (f / fc) ** 2
    return x2 / math.sqrt((x2 - 1) ** 2 + x2 / qtc ** 2)

# ------------------------------------------------------- subwoofer band composite
# Ported verbatim (physics-identical) from the SSD rescore_sealed_impact.py v2.4.

_VB_CAP_FT3 = 7.0
_VB_FLOOR_FT3 = {"6.5": 0.15, "8": 0.25, "10": 0.45, "12": 0.7,
                 "13.5": 0.9, "15": 1.2, "18": 2.6, "21": 4.0}
_VB_FLOOR_EXC = {"sky-high-car-audio-fxxl-18": 3.6}
_BAND = [20, 25, 31.5, 40, 50, 63]
_FT = 55.0

def shape(f_hz):
    """House target curve, dB above midrange reference level at f (0 at 200 Hz+)."""
    return max(0.0, 22.0 - 7.33 * math.log2(f_hz / 25.0))

def gain(f_hz):
    """Cabin gain below the ~55 Hz transfer transition, dB."""
    return max(0.0, 12 * math.log2(_FT / f_hz))

_SHAPE = [shape(f) for f in _BAND]
FT3_L = 28.3168

def composite_from_margins(marg):
    """Band composite from per-frequency margins (marg aligned to _BAND).

    RULING 2026-07-19 (Brett): the min-term (worst point) runs over 25-63 Hz —
    the band every system must deliver. 20 Hz is NOT in the score: a ~30 Hz
    ported tune's bottom-octave sacrifice must inform (depth badge), not veto.
    One scale, both alignments, no handicaps. Before this ruling the 20 Hz
    point held veto power and buried ported's +10 dB slam-band wins."""
    core = marg[1:]                      # 25, 31.5, 40, 50, 63
    return 10 ** (min(core) / 10) * 10 ** ((sum(core) / len(core)) / 10)

def _sub_margins(fs, qts, vas, sd, rms, sens, vb_l, xm):
    fc = fs * math.sqrt(1 + vas / vb_l)
    qtc = qts * math.sqrt(1 + vas / vb_l)
    vd = sd * 1e-4 * xm * 1e-3
    marg = []
    for f, sh in zip(_BAND, _SHAPE):
        g = gain(f)
        hdb = 20 * math.log10(H(f, fc, qtc))
        marg.append(min(108.4 + 20 * math.log10(f * f * vd),
                        sens + 10 * math.log10(rms) + hdb) + g - sh)
    return marg

def _sub_core(fs, qts, vas, sd, rms, sens, vb_l, xm):
    return composite_from_margins(_sub_margins(fs, qts, vas, sd, rms, sens, vb_l, xm))

def sub_best_composite(row):
    """Best-sealed-box composite for one sub row (raw, un-normalized)."""
    xm = row.get("effective_xmax_mm") or row["xmax_mm"]
    cap_l = min(_VB_CAP_FT3 * FT3_L, 4 * row["vas_l"])
    floor = _VB_FLOOR_EXC.get(row["slug"], _VB_FLOOR_FT3.get(str(row["driver_size"]), 0.05))
    grid = [v for v in (0.05 * 1.13 ** i for i in range(60))
            if v * FT3_L <= cap_l and v >= floor] or [min(floor, _VB_CAP_FT3)]
    return max(_sub_core(row["fs_hz"], row["qts"], row["vas_l"], row["sd_cm2"],
                         row["rms_watts"], row["sensitivity_db_1w_1m"], v * FT3_L, xm)
               for v in grid)

SUB_ANCHOR_SLUG = "fi-car-audio-hc-12"

def sub_impact(raw, anchor_raw):
    """Normalize a raw composite to impact_score (Fi HC-12 best box = 1.00)."""
    return round((raw / anchor_raw) ** 0.5, 3)

def sub_ib_composite(row):
    """Infinite-baffle composite: the sealed model with the box removed
    (fc = Fs, Qtc = Qts; trunk/cabin is the enclosure). Same band ruling,
    same margins, same anchor normalization as sealed — one currency.
    (Ported verbatim from SSD rescore_ib_unified.py, re-banded per the
    2026-07-19 composite ruling. No Qts gate: free-air rolloff is already
    penalized by H(f, Fs, Qts) itself.)"""
    xm = row.get("effective_xmax_mm") or row["xmax_mm"]
    vd = row["sd_cm2"] * 1e-4 * xm * 1e-3
    marg = []
    for f, sh in zip(_BAND, _SHAPE):
        hdb = 20 * math.log10(H(f, row["fs_hz"], row["qts"]))
        marg.append(min(108.4 + 20 * math.log10(f * f * vd),
                        row["sensitivity_db_1w_1m"] + 10 * math.log10(row["rms_watts"]) + hdb)
                    + gain(f) - sh)
    return composite_from_margins(marg)

# ---------------------------------------------------- ported (vented) instrument
# Canonicalized 2026-07-19 from two ratified sources:
#   - archive/enclosure_calc.py (SSD): port length (Small, end correction k=0.732),
#     peak port velocity, the 12 in^2/ft^3 SQ area floor, musical Fb window
#     0.85-1.05 x Fs (floored at 28 Hz). Formulas verified against Small 1972/73
#     JAES + Dickason; do not restate from memory.
#   - ported_instrument_prototype.py (SSD): Small lumped vented response G(s) and
#     cone-excursion X(s) (Ql = 7, WinISD convention), displacement ceiling
#     calibrated NUMERICALLY against the universal mass-controlled asymptote
#     (at f >> resonance every box's clean ceiling -> 108.4 + 20log10(f^2 Vd)),
#     BW2 subsonic filter at 0.7 x Fb, same 20-63 Hz min x mean composite.
#
# NCSW builds ported enclosures CUSTOM with aero (flared) ports: flares stay
# clean to higher air speed than straight ports, so the velocity ceiling is
# 25 m/s (vs 17 m/s straight; founder standard 2026-07-19). Feasibility is
# envelope-driven per vehicle: net volume cap + longest buildable port run come
# from the car's boot (boot_families measured dims or the derived fill), not
# from abstract box classes. A driver with no feasible (Vb, Fb, port) in the
# envelope has NO ported realization there - that is an answer, not an error.

QL_VENTED = 7.0          # leakage Q, WinISD convention
VMAX_AERO = 25.0         # m/s peak port air speed, flared aero ports
PORT_K_END = 0.732       # end correction (one flanged + one free end)
PORT_AREA_FLOOR_SQIN_PER_FT3 = 12.0
FB_RATIO_MIN, FB_RATIO_MAX = 0.85, 1.05   # musical window vs Fs
FB_ABS_MIN = 28.0        # practical musical floor, Hz
C_AIR = 343.0            # m/s

def vented_tf(f, fs, fb, alpha, qts, ql=QL_VENTED):
    """Small lumped vented-box model: (|G|, |Xnorm|) at f.
    G = voltage->far-field pressure (4th-order HP); X = cone excursion with the
    relief notch at Fb. Normalizations are arbitrary but consistent; callers
    calibrate against the mass-controlled asymptote."""
    s = complex(0.0, 2 * math.pi * f)
    Ts, Tb = 1 / (2 * math.pi * fs), 1 / (2 * math.pi * fb)
    D = (s**4 * Ts**2 * Tb**2
         + s**3 * (Ts**2 * Tb / ql + Ts * Tb**2 / qts)
         + s**2 * ((alpha + 1) * Tb**2 + Ts * Tb / (ql * qts) + Ts**2)
         + s * (Tb / ql + Ts / qts) + 1)
    G = (s**4 * Ts**2 * Tb**2) / D
    X = (s**2 * Tb**2 + s * Tb / ql + 1) / D
    return abs(G), abs(X)

def subsonic_bw2(f, fb):
    """Installer protection filter: 2nd-order Butterworth HP at 0.7 x Fb."""
    fc = 0.7 * fb
    x2 = (f / fc) ** 2
    return x2 / math.sqrt((x2 - 1) ** 2 + 2 * x2)

def port_length_cm(area_cm2, fb_hz, vb_l, k=PORT_K_END):
    """Physical port length for a round port of given area tuning vb to fb."""
    sv = area_cm2 / 1e4
    vb = vb_l / 1000.0
    a = math.sqrt(sv / math.pi)
    length_m = (C_AIR * C_AIR * sv) / (4.0 * math.pi ** 2 * fb_hz ** 2 * vb) - k * a
    return length_m * 100.0

def port_area_cm2(sd_cm2, xm_mm, fb_hz, vb_l, vmax=VMAX_AERO):
    """Required port area: max(velocity-limited at vmax, SQ floor 12 in^2/ft^3)."""
    vel_cm2 = (sd_cm2 * 1e-4 * xm_mm * 1e-3 * 2 * math.pi * fb_hz / vmax) * 1e4
    floor_cm2 = PORT_AREA_FLOOR_SQIN_PER_FT3 * (vb_l / FT3_L) * 6.4516
    return max(vel_cm2, floor_cm2)

def ported_margins(row, vb_l, fb, xm):
    """Clean margins vs the house shape at each band frequency (in-seat), or
    None if the port is not buildable. Same currency as the sealed composite."""
    fs, qts, vas = row["fs_hz"], row["qts"], row["vas_l"]
    sd, rms, sens = row["sd_cm2"], row["rms_watts"], row["sensitivity_db_1w_1m"]
    alpha = vas / vb_l
    vd = sd * 1e-4 * xm * 1e-3
    # calibrate displacement ceiling at a frequency far above resonance
    f_hi = 400.0
    Ghi, Xhi = vented_tf(f_hi, fs, fb, alpha, qts)
    K = 108.4 + 20 * math.log10(f_hi * f_hi * vd)
    marg = []
    for f in _BAND:
        G, X = vented_tf(f, fs, fb, alpha, qts)
        ss = subsonic_bw2(f, fb)
        disp = K + 20 * math.log10((G / X) / (Ghi / Xhi)) + 20 * math.log10(ss)
        therm = sens + 10 * math.log10(rms) + 20 * math.log10(G * ss)
        marg.append(min(disp, therm) + gain(f) - shape(f))
    return marg

def ported_best(row, vb_cap_l, max_port_run_cm, vb_floor_l=None):
    """Best feasible ported realization inside an envelope.

    Sweeps net volume (13%-step grid to the cap) x Fb (musical window). A combo
    is feasible when the aero port that keeps velocity <= 25 m/s physically fits:
    length >= 2 cm and <= max_port_run_cm. Returns (raw_composite, spec) for the
    best composite, or (None, None) when no feasible build exists.
    spec = dict(vb_l, fb_hz, port_area_cm2, port_len_cm, depth_20hz_db) - the
    build envelope plus the 20 Hz depth badge (margin vs the curve; informs,
    never vetoes). Exact aero tube count/diameter is a per-job design task."""
    xm = row.get("effective_xmax_mm") or row["xmax_mm"]
    floor = vb_floor_l or min(vb_cap_l, 0.25 * row["vas_l"])
    grid = [v for v in (floor * 1.13 ** i for i in range(40)) if v <= vb_cap_l] or [floor]
    fbs = [max(FB_ABS_MIN, row["fs_hz"] * (FB_RATIO_MIN + i * 0.05))
           for i in range(int((FB_RATIO_MAX - FB_RATIO_MIN) / 0.05) + 1)]
    best, best_spec = None, None
    for vb in grid:
        for fb in fbs:
            area = port_area_cm2(row["sd_cm2"], xm, fb, vb)
            plen = port_length_cm(area, fb, vb)
            if not (2.0 <= plen <= max_port_run_cm):
                continue
            m = ported_margins(row, vb, fb, xm)
            c = composite_from_margins(m)
            if best is None or c > best:
                best = c
                best_spec = dict(vb_l=round(vb, 1), fb_hz=round(fb, 1),
                                 port_area_cm2=round(area, 1), port_len_cm=round(plen, 1),
                                 depth_20hz_db=round(m[0], 1))
    return best, best_spec
