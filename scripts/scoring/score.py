#!/usr/bin/env python3
"""NCSW canonical scorer — score any driver class from the one instrument module.

Usage:
    python3 score.py <class|all> --check     # report DB rows that don't reproduce
    python3 score.py <class|all> --write      # reconcile DB to the methodology

Classes: midbass, component_sets, widebands, underseat, midranges, subs_sealed,
subs_ib, subs_ported.
(front_subs alone is still SSD-only — see COVERAGE below; --check/--write on it errors
loudly rather than pretending. subs_ib and subs_ported WERE on that list and are now
implemented; this line was stale and is corrected 2026-11-07.)

Every scorer is a pure function of DB fields via instrument.py. --check recomputes
and diffs against the stored column(s); --write PATCHes only the rows that differ.
Idempotent: run --write twice, the second run reports zero changes.
"""
import os, sys, math
import psycopg2
import instrument as I

# The Postgres password lives in ~/.pgpass (mode 600) and NOWHERE else - never inline
# it here, never in an .env. This DSN carries no password; libpq reads ~/.pgpass.
# Same connection string every other NCSW script uses (cf. research/factory-audio/sync_fullrange.py).
DSN = ("postgresql://directus_db_4b8w_user@"
       "dpg-d86h4augvqtc73dmq7j0-a.ohio-postgres.render.com:5432/"
       "directus_db_4b8w?sslmode=require")

def db():
    """Connect to Postgres.

    Fixed 2026-11-07: this used to read DATABASE_URL out of
    ~/.config/directus-render.env, which only ever held DIRECTUS_URL and
    DIRECTUS_TOKEN - so the canonical scorer died with KeyError('DATABASE_URL')
    before doing anything, and the DB had no way to be checked against the
    methodology. An explicit DATABASE_URL in the environment still wins.
    """
    return psycopg2.connect(os.environ.get("DATABASE_URL") or DSN)

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
        # Front stages are a LEFT and a RIGHT driver and they add at the seat; the stored
        # score is the STAGE, not one driver (Brett 2026-11-08). See pair_gain in
        # instrument.py. At every frequency scored here this is +6.0 dB.
        out[row["slug"]] = {col: round(I.ceiling(freq, sd, xm, row[sens_f], row[rms_f])
                                       + I.pair_gain(freq), 1)
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
    # cat_sealed is NOT a gate (2026-08-21, completing the ported/IB rulings): every driver
    # with full T/S gets its best-sealed-box realization. The truck behind-seat class needs
    # sealed scores on drivers that were catalogued ported/IB-only (SDv4-12, TW3-12).
    cur.execute("select slug,driver_size,effective_xmax_mm,impact_score," + ",".join(need)
                + " from subwoofers")
    names = [d[0] for d in cur.description]
    rows = [dict(zip(names, r)) for r in cur.fetchall() if all(dict(zip(names, r)).get(k) for k in need)]
    anchor = next(r for r in rows if r["slug"] == I.SUB_ANCHOR_SLUG)
    aref = I.sub_best_composite(anchor)
    out = {}
    SEALED_COLS = ("impact_score", "sealed_design_vb_ft3", "sealed_gross_ft3",
                   "sealed_qtc", "sealed_fc_hz", "sealed_peak_db")
    for r in rows:
        best = I.sub_best_box(r)
        if best is None:
            # No box in the grid damps this driver below QTC_MAX, so it has no sealed
            # design (Brett 2026-11-08: "those IB drivers should not have sealed designs
            # at all"). NULL every sealed column - the generator's margins() already
            # skips a driver with no sealed_design_vb_ft3, so it leaves sealed service.
            out[r["slug"]] = {c: None for c in SEALED_COLS}
            continue
        raw, vb_l = best
        vb_ft3 = vb_l / I.FT3_L
        gross = vb_ft3 + I.DRIVER_DISP_FT3.get(str(r["driver_size"]), 0.12)
        # bass CHARACTER alongside bass LEVEL (2026-11-07). Qtc is the ringing number:
        # how fast the cone stops when the note stops. The scores above say only how
        # loud it gets cleanly. See the "bass CHARACTER" block in instrument.py.
        qtc = I.sealed_qtc(r["qts"], r["vas_l"], vb_l)
        out[r["slug"]] = {"impact_score": I.sub_impact(raw, aref),
                          "sealed_design_vb_ft3": round(vb_ft3, 2),
                          "sealed_gross_ft3": round(gross, 2),
                          "sealed_qtc": round(qtc, 3),
                          "sealed_fc_hz": round(I.sealed_fc(r["fs_hz"], r["vas_l"], vb_l), 1),
                          "sealed_peak_db": round(I.qtc_peak_db(qtc), 2)}
    return out

def _not_ported(name):
    def f(cur):
        raise SystemExit(f"[{name}] not yet ported off the SSD — see COVERAGE in this file. "
                         f"Do not score it from here until its instrument is moved into instrument.py.")
    return f

def score_subs_ib(cur):
    # IB = sealed model, box removed (fc=Fs, Qtc=Qts); same HC-12 sealed anchor.
    # cat_ib is NOT a gate (founder ruling 2026-08-19, mirroring the ported ruling):
    # IB qualification is mechanical survival (subsonic HPF is standard in every
    # NCSW DSP) plus the per-vehicle cavity test (trunk >= 4x Vas, in
    # vehicle_sub_fit) — not a driver type. Every driver with full T/S gets an
    # ib_composite; the old Qts/EBP folklore was a passive-era response-shape
    # proxy that DSP dissolves.
    need = ("fs_hz", "qts", "vas_l", "sd_cm2", "xmax_mm", "rms_watts", "sensitivity_db_1w_1m")
    cur.execute("select slug,driver_size,effective_xmax_mm," + ",".join(need)
                + " from subwoofers")
    names = [d[0] for d in cur.description]
    rows = [dict(zip(names, r)) for r in cur.fetchall()]
    rows = [r for r in rows if all(r.get(k) for k in need)]
    anchor = next(r for r in rows if r["slug"] == I.SUB_ANCHOR_SLUG)
    aref = I.sub_best_composite(anchor)
    return {r["slug"]: {"ib_composite": I.sub_impact(I.sub_ib_composite(r), aref)}
            for r in rows}

def score_subs_ported(cur):
    # Ported bench = the driver's -1 dB KNEE build (founder ruling 2026-07-28):
    # design volume is a property of the driver, not the car — the vehicle's
    # dims only gate which knees fit. n x 4" aero ports, <=40" run, musical Fb.
    # Same HC-12 sealed anchor = one currency with impact_score / ib_composite.
    # cat_ported is NOT a gate (alignment ruling): every driver with full T/S
    # gets a ported realization or a NULL (no feasible build — an answer).
    need = ("fs_hz", "qts", "vas_l", "sd_cm2", "xmax_mm", "rms_watts", "sensitivity_db_1w_1m")
    cur.execute("select slug,driver_size,effective_xmax_mm," + ",".join(need)
                + " from subwoofers")
    names = [d[0] for d in cur.description]
    rows = [dict(zip(names, r)) for r in cur.fetchall()]
    rows = [r for r in rows if all(r.get(k) for k in need)]
    anchor = next(r for r in rows if r["slug"] == I.SUB_ANCHOR_SLUG)
    aref = I.sub_best_composite(anchor)
    # Design volume = the pay-rate rule in port_resolver (founder 2026-08-01);
    # the resolver is the single source for ported builds — delegate to it.
    import port_resolver as PR
    out = {}
    for r in rows:
        d = PR.design_build(r)
        if d:
            out[r["slug"]] = {"ported_score": I.sub_impact(d["raw"], aref),
                              "ported_design_vb_ft3": d["vb_ft3"],
                              "ported_gross_ft3": d["gross_ft3"]}
    return out

CLASSES = {
    "midbass":         score_midbass,
    "component_sets":  score_component_sets,
    "widebands":       score_widebands,
    "underseat":       score_underseat,
    "midranges":       score_midranges,
    "subs_sealed":     score_subs_sealed,
    "subs_ib":         score_subs_ib,
    "subs_ported":     score_subs_ported,
    # COVERAGE: pending port (still SSD-only).
    "front_subs":      _not_ported("front_subs"),      # rescore_front_subs.py (63/100 in-box)
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
        try:
            cur.execute(f"select slug,{','.join(cols)} from " + _TABLE[name])
            cur_map = {r[0]: dict(zip(cols, r[1:])) for r in cur.fetchall()}
        except psycopg2.errors.UndefinedColumn:
            conn.rollback()
            print(f"{name}: column(s) {cols} not in {_TABLE[name]} yet — "
                  f"showing all computed values as new (ALTER TABLE before --write)")
            cur_map = {}
        drift = []
        for slug, vals in scored.items():
            old = cur_map.get(slug, {})
            for col, new in vals.items():
                o = old.get(col)
                # new is None = "this row has no such design" (e.g. a sub with no
                # sealed design at all); the column is written NULL, and matching
                # NULL is not drift.
                if new is None:
                    if o is not None:
                        drift.append((slug, col, o, new))
                elif o is None or abs(float(o) - float(new)) > 0.01:
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
          "midranges": "midranges", "subs_sealed": "subwoofers", "subs_ib": "subwoofers",
          "subs_ported": "subwoofers"}

if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    write = "--write" in sys.argv
    if not args or (args[0] not in CLASSES and args[0] != "all"):
        sys.exit(f"usage: score.py <{'|'.join(CLASSES)}|all> [--check|--write]")
    names = list(_TABLE) if args[0] == "all" else args
    run(names, write)
