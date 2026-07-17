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

def _sub_core(fs, qts, vas, sd, rms, sens, vb_l, xm):
    fc = fs * math.sqrt(1 + vas / vb_l)
    qtc = qts * math.sqrt(1 + vas / vb_l)
    vd = sd * 1e-4 * xm * 1e-3
    marg = []
    for f, sh in zip(_BAND, _SHAPE):
        g = gain(f)
        hdb = 20 * math.log10(H(f, fc, qtc))
        marg.append(min(108.4 + 20 * math.log10(f * f * vd),
                        sens + 10 * math.log10(rms) + hdb) + g - sh)
    return 10 ** (min(marg) / 10) * 10 ** ((sum(marg) / len(marg)) / 10)

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
