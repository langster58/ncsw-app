#!/usr/bin/env python3
"""Validation harness for the canonical ported instrument.

Prints, for a spread of known drivers:
  - sealed impact (existing, anchor-normalized) vs ported impact (same anchor)
  - the best feasible build inside two reference envelopes
  - a WinISD cross-check sheet: our predicted max clean SPL at the band
    frequencies (1 m half-space, NO cabin gain, NO subsonic) for the best box —
    enter the same driver/box in WinISD and compare its Maximum SPL plot.

Reference envelopes (validation only; package assembly uses each car's own):
  trunk: net 70 L (2.5 ft3), port run <= 55 cm
  cargo: net 113 L (4.0 ft3), port run <= 86 cm
"""
import os, sys, math
import psycopg2
import instrument as I

ENVELOPES = {"trunk": (70.0, 55.0), "cargo": (113.0, 86.0)}
CANDIDATES = ["fi-car-audio-hc-12", "sundown-audio-xv4-12", "skar-audio-svr-15",
              "sundown-audio-sa-classic-12", "fi-car-audio-xv4-15",
              "ct-sounds-tropo-18", "sundown-audio-zv6-15"]

def db():
    env = {}
    with open(os.path.expanduser("~/.config/directus-render.env")) as f:
        for line in f:
            if "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    return psycopg2.connect(env["DATABASE_URL"])

conn = db(); cur = conn.cursor()
need = "fs_hz,qts,vas_l,sd_cm2,xmax_mm,effective_xmax_mm,rms_watts,sensitivity_db_1w_1m"
cur.execute(f"select slug,brand,model,driver_size,impact_score,{need} from subwoofers where slug = any(%s)",
            (CANDIDATES,))
names = [d[0] for d in cur.description]
rows = [dict(zip(names, (float(v) if isinstance(v, (int, float)) or hasattr(v, "__float__") else v
                          for v in r))) for r in cur.fetchall()]
by = {r["slug"]: r for r in rows}

anchor = by[I.SUB_ANCHOR_SLUG]
aref = I.sub_best_composite(anchor)

print(f"{'driver':<32} {'sealed':>7} | " + " | ".join(f"{e+' imp':>10} {'Vb ft3':>6} {'Fb':>5} {'port':>12}" for e in ENVELOPES))
print("-" * 110)
sheet = []
for slug in CANDIDATES:
    r = by.get(slug)
    if not r or not all(r.get(k) for k in ("fs_hz", "qts", "vas_l", "sd_cm2", "rms_watts", "sensitivity_db_1w_1m")):
        print(f"{slug:<32} MISSING/incomplete")
        continue
    cells = []
    for env, (cap, run) in ENVELOPES.items():
        raw, spec = I.ported_best(r, cap, run)
        if raw:
            imp = I.sub_impact(raw, aref)
            cells.append(f"{imp:>10} {spec['vb_l']/I.FT3_L:>6.2f} {spec['fb_hz']:>5.1f} {spec['port_area_cm2']:>5.0f}cm2/{spec['port_len_cm']:>3.0f}cm")
            if env == "cargo":
                sheet.append((r, spec))
        else:
            cells.append(f"{'no build':>10} {'':>6} {'':>5} {'':>12}")
    print(f"{r['brand']} {r['model']:<20.20} {r['impact_score'] or '-':>7} | " + " | ".join(cells))

print("\n=== WinISD CROSS-CHECK (cargo-envelope best box; 1 m half-space, no cabin, no subsonic) ===")
for r, spec in sheet:
    xm = r.get("effective_xmax_mm") or r["xmax_mm"]
    alpha = r["vas_l"] / spec["vb_l"]
    vd = r["sd_cm2"] * 1e-4 * xm * 1e-3
    f_hi = 400.0
    Ghi, Xhi = I.vented_tf(f_hi, r["fs_hz"], spec["fb_hz"], alpha, r["qts"])
    K = 108.4 + 20 * math.log10(f_hi ** 2 * vd)
    outs = []
    for f in I._BAND:
        G, X = I.vented_tf(f, r["fs_hz"], spec["fb_hz"], alpha, r["qts"])
        disp = K + 20 * math.log10((G / X) / (Ghi / Xhi))
        therm = r["sensitivity_db_1w_1m"] + 10 * math.log10(r["rms_watts"]) + 20 * math.log10(G)
        outs.append(f"{f:g}Hz={min(disp, therm):.1f}")
    print(f"\n{r['brand']} {r['model']}: Fs={r['fs_hz']} Qts={r['qts']} Vas={r['vas_l']}L "
          f"Sd={r['sd_cm2']} Xmax={xm}mm Pe={r['rms_watts']}W sens={r['sensitivity_db_1w_1m']}")
    print(f"  Box: vented Vb={spec['vb_l']} L ({spec['vb_l']/I.FT3_L:.2f} ft3), Fb={spec['fb_hz']} Hz, Ql=7, signal {r['rms_watts']} W")
    print("  predicted max clean SPL: " + "  ".join(outs))
