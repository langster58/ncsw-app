#!/usr/bin/env python3
"""NCSW canonical scorer — score any driver class from the one instrument module.

Usage:
    python3 score.py <class|all> --check     # report DB rows that don't reproduce
    python3 score.py <class|all> --write      # reconcile DB to the methodology

Classes: midbass, component_sets, widebands, underseat, subs_sealed
(front_subs, subs_ib, subs_ported are declared but NOT yet ported off the SSD — see
COVERAGE below; --check/--write on them errors loudly rather than pretending.)

Every scorer is a pure function of DB fields via instrument.py. --check recomputes
and diffs against the stored column(s); --write PATCHes only the rows that differ.
Idempotent: run --write twice, the second run reports zero changes.
"""
import os, sys, math
import psycopg2
import instrument as I

def db():
    env = {}
    with open(os.path.expanduser("~/.config/directus-render.env")) as f:
        for line in f:
            if "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    return psycopg2.connect(env["DATABASE_URL"])

# ---------------------------------------------------------------- class scorers
# Each returns {slug: {column: value, ...}} for every scoreable row.

def _ceiling_class(cur, table, sd_f, xm_f, sens_f, rms_f, points, size_filter=""):
    """Generic front-stage ceiling scorer: min(mech, thermal) at each (col, freq)."""
    cols = f"slug,{sd_f},{xm_f},{sens_f},{rms_f}"
    cur.execute(f"select {cols} from {table} {size_filter}")
    names = [d[0] for d in cur.description]
    out = {}
    for r in cur.fetchall():
        row = dict(zip(names, r))
        sd, xm = row[sd_f], row[xm_f]
        if not (sd and xm):
            continue
        out[row["slug"]] = {col: I.ceiling(freq, sd, xm, row[sens_f], row[rms_f])
                            for col, freq in points.items()}
    return out

def score_midbass(cur):
    return _ceiling_class(cur, "midbass_drivers", "sd_cm2", "xmax_mm_one_way",
                          "sensitivity_db", "rms_watts",
                          {"score_2way": 80, "score_2way_front_sub": 100})

def score_component_sets(cur):
    return _ceiling_class(cur, "component_sets", "mid_sd_cm2", "mid_xmax_mm",
                          "mid_sensitivity_db", "mid_pe_rms_w",
                          {"score_2way": 80, "score_2way_front_sub": 100})

def score_widebands(cur):
    return _ceiling_class(cur, "wideband_drivers", "sd_cm2", "xmax_mm_one_way",
                          "sensitivity_db", "rms_watts",
                          {"score_300": 300, "score_100": 100})

def score_underseat(cur):
    return _ceiling_class(cur, "underseat_woofers", "sd_cm2", "xmax_mm_one_way",
                          "sensitivity_db", "rms_watts",
                          {"score_300": 300, "score_100": 100})

def score_midranges(cur):
    # three-way midrange: low edge ~400Hz where the 6.5 hands off; single mode
    return _ceiling_class(cur, "midranges", "sd_cm2", "xmax_mm_one_way",
                          "sensitivity_db", "rms_watts",
                          {"score_400": 400})

def score_subs_sealed(cur):
    need = ("fs_hz", "qts", "vas_l", "sd_cm2", "xmax_mm", "rms_watts", "sensitivity_db_1w_1m")
    cur.execute("select slug,driver_size,effective_xmax_mm,impact_score," + ",".join(need)
                + " from subwoofers where cat_sealed")
    names = [d[0] for d in cur.description]
    rows = [dict(zip(names, r)) for r in cur.fetchall() if all(dict(zip(names, r)).get(k) for k in need)]
    anchor = next(r for r in rows if r["slug"] == I.SUB_ANCHOR_SLUG)
    aref = I.sub_best_composite(anchor)
    return {r["slug"]: {"impact_score": I.sub_impact(I.sub_best_composite(r), aref)} for r in rows}

def _not_ported(name):
    def f(cur):
        raise SystemExit(f"[{name}] not yet ported off the SSD — see COVERAGE in this file. "
                         f"Do not score it from here until its instrument is moved into instrument.py.")
    return f

CLASSES = {
    "midbass":         score_midbass,
    "component_sets":  score_component_sets,
    "widebands":       score_widebands,
    "underseat":       score_underseat,
    "midranges":       score_midranges,
    "subs_sealed":     score_subs_sealed,
    # COVERAGE: pending port (still SSD-only). ported is a PROTOTYPE, do not canonicalize.
    "front_subs":      _not_ported("front_subs"),      # rescore_front_subs.py (63/100 in-box)
    "subs_ib":         _not_ported("subs_ib"),         # rescore_ib_unified.py (ib_composite; DB currently current)
    "subs_ported":     _not_ported("subs_ported"),     # ported_instrument_prototype.py (NOT final)
}

# ---------------------------------------------------------------- check / write

def run(names, write):
    conn = db(); cur = conn.cursor()
    total_drift = 0
    for name in names:
        scored = CLASSES[name](cur)
        # current DB values for the same columns
        cols = sorted({c for v in scored.values() for c in v}) if scored else []
        if not cols:
            print(f"{name}: no scoreable rows"); continue
        cur.execute(f"select slug,{','.join(cols)} from " + _TABLE[name])
        cur_map = {r[0]: dict(zip(cols, r[1:])) for r in cur.fetchall()}
        drift = []
        for slug, vals in scored.items():
            old = cur_map.get(slug, {})
            for col, new in vals.items():
                o = old.get(col)
                if o is None or abs(float(o) - float(new)) > 0.01:
                    drift.append((slug, col, o, new))
        print(f"\n{name}: {len(scored)} scored, {len(drift)} value(s) drifted")
        for slug, col, o, new in drift[:40]:
            print(f"   {slug:40} {col:22} {str(o):>8} -> {new}")
        if len(drift) > 40:
            print(f"   ... +{len(drift)-40} more")
        total_drift += len(drift)
        if write and drift:
            for slug, vals in scored.items():
                sets = ",".join(f"{c}=%s" for c in vals)
                cur.execute(f"update {_TABLE[name]} set {sets} where slug=%s",
                            list(vals.values()) + [slug])
            conn.commit()
            print(f"   WROTE {name}")
    print(f"\nTOTAL drift: {total_drift}" + ("  (written)" if write else "  (--check only; use --write to reconcile)"))

_TABLE = {"midbass": "midbass_drivers", "component_sets": "component_sets",
          "widebands": "wideband_drivers", "underseat": "underseat_woofers",
          "midranges": "midranges", "subs_sealed": "subwoofers"}

if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    write = "--write" in sys.argv
    if not args or (args[0] not in CLASSES and args[0] != "all"):
        sys.exit(f"usage: score.py <{'|'.join(CLASSES)}|all> [--check|--write]")
    names = list(_TABLE) if args[0] == "all" else args
    run(names, write)
