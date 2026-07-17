#!/usr/bin/env python3
"""Rematch median-sourced vehicle volumes against the EPA source (v3 join pass).

The original join (archive/join_epa_volumes.py) matched (year, make, model-norm)
exactly, then (year, make, first-word); everything else fell back to body-class
medians. This pass re-attacks ONLY the median rows with wider — but still
evidence-bound — matching:

  1. exact       (year, make, model-norm)
  2. year-window (year+-2, make, model-norm)          EPA gap years
  3. token-set   model tokens subset either direction  "camry le" ~ "camry"
  4. collapsed   alnum-collapsed prefix either way     "mazda3" ~ "3", "f150" ~ "f 150"
     (steps 3-4 also run inside the +-2 year window)

Volume pair by body style + doors (same convention as the original join):
  Hatchback/Wagon/SUV/Minivan -> hpv/hlv;  Coupe/Convertible/2-door -> pv2/lv2;
  else -> pv4/lv4 (with the original's any-populated-column fallback).

Sanity gates: luggage 3..60 ft3, passenger 30..200 ft3 — a match that fails the
gate is discarded (bad EPA rows carry zeros).

Trucks are excluded (EPA-exempt; behind-seat model handles them separately).

Usage: rematch-epa-volumes.py [--write]   (default: dry-run report)
"""
import csv, math, os, re, sys
from collections import defaultdict
from statistics import median
import psycopg2

EPA_CSV = "/Volumes/SSD 1TB/Database/archive/EPA-vehicles.csv"
WRITE = "--write" in sys.argv

def norm(s): return re.sub(r"\s+", " ", (s or "").strip().lower())
def model_norm(s): return re.sub(r"[^a-z0-9 ]", "", norm(s)).strip()
def collapsed(s): return re.sub(r"[^a-z0-9]", "", norm(s))
def tokens(s): return set(model_norm(s).split())

def fval(v):
    try:
        f = float(v)
        return f if f > 0 else None
    except (TypeError, ValueError):
        return None

# ---- load EPA ----
by_exact = defaultdict(list)      # (year, make, model_norm) -> rows
by_make_year = defaultdict(list)  # (year, make) -> (model_norm, collapsed, tokens, row)
with open(EPA_CSV, newline="") as f:
    for r in csv.DictReader(f):
        y, mk, md = r["year"].strip(), norm(r["make"]), model_norm(r["model"])
        if not (y and mk and md):
            continue
        by_exact[(int(y), mk, md)].append(r)
        by_make_year[(int(y), mk)].append((md, collapsed(r["model"]), tokens(r["model"]), r))

def volume_keys(body_style, doors):
    if body_style in ("Hatchback", "Wagon", "SUV / Crossover", "Minivan"):
        return "hpv", "hlv"
    if body_style in ("Coupe", "Convertible") or str(doors) == "2":
        return "pv2", "lv2"
    return "pv4", "lv4"

def pick_volumes(rows, body_style, doors):
    pvk, lvk = volume_keys(body_style, doors)
    pvs = [v for v in (fval(r[pvk]) for r in rows) if v]
    lvs = [v for v in (fval(r[lvk]) for r in rows) if v]
    if not pvs:
        for k in ("pv4", "pv2", "hpv"):
            pvs = [v for v in (fval(r[k]) for r in rows) if v]
            if pvs: break
    if not lvs:
        for k in ("lv4", "lv2", "hlv"):
            lvs = [v for v in (fval(r[k]) for r in rows) if v]
            if lvs: break
    pv = median(pvs) if pvs else None
    lv = median(lvs) if lvs else None
    if pv is None or lv is None: return None
    if not (30 <= pv <= 200 and 3 <= lv <= 60): return None
    return round(pv, 1), round(lv, 1)

def match(year, make, model, body_style, doors):
    mk, md = norm(make), model_norm(model)
    cd, tk = collapsed(model), tokens(model)
    # 1. exact, then year window
    for dy in (0, 1, -1, 2, -2):
        rows = by_exact.get((year + dy, mk, md))
        if rows:
            v = pick_volumes(rows, body_style, doors)
            if v: return v, ("epa_rematch_exact" if dy == 0 else "epa_rematch_yearwin")
    # 2. token-set / collapsed-prefix inside the window
    for dy in (0, 1, -1, 2, -2):
        cands = by_make_year.get((year + dy, mk))
        if not cands: continue
        hits = [r for emd, ecd, etk, r in cands
                if (etk and tk and (etk <= tk or tk <= etk))
                or (ecd and cd and (ecd.startswith(cd) or cd.startswith(ecd)))]
        if hits:
            v = pick_volumes(hits, body_style, doors)
            if v: return v, "epa_rematch_fuzzy"
    return None, None

def db():
    env = {}
    with open(os.path.expanduser("~/.config/directus-render.env")) as f:
        for line in f:
            if "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    return psycopg2.connect(env["DATABASE_URL"])

conn = db(); cur = conn.cursor()
cur.execute("""select vehicle_id, year, make, model, body_style, doors
               from vehicles
               where volume_source like 'body_class_median%%' and body_style <> 'Truck'""")
targets = cur.fetchall()
print(f"median-sourced non-truck rows: {len(targets):,}")

stats = defaultdict(int)
by_class = defaultdict(lambda: [0, 0])
updates = []
samples = defaultdict(list)
for vid, year, make, model, body_style, doors in targets:
    by_class[body_style][1] += 1
    if not year: continue
    v, how = match(int(year), make, model, body_style, doors)
    if v:
        pv, lv = v
        stats[how] += 1
        by_class[body_style][0] += 1
        updates.append((pv, lv, round(pv + lv, 1), how, vid))
        if len(samples[how]) < 6:
            samples[how].append(f"{year} {make} {model} [{body_style}] -> pv={pv} lv={lv}")

print("\nmatches by method:", dict(stats))
print(f"total recovered: {len(updates):,} / {len(targets):,}")
print(f"\n{'class':<18} {'recovered':>10} {'of':>8}")
for cls, (rec, tot) in sorted(by_class.items(), key=lambda x: -x[1][1]):
    print(f"{cls:<18} {rec:>10,} {tot:>8,}")
for how, rows in samples.items():
    print(f"\n  sample {how}:")
    for s in rows: print("   ", s)

if WRITE and updates:
    from psycopg2.extras import execute_values
    execute_values(cur, """
        update vehicles v set passenger_volume_cuft = u.pv, luggage_volume_cuft = u.lv,
               acoustic_volume_cuft = u.av, volume_source = u.src
        from (values %s) as u(pv, lv, av, src, vid)
        where v.vehicle_id = u.vid""", updates, page_size=2000)
    conn.commit()
    print(f"\nWROTE {len(updates):,} rows")
else:
    print("\n(dry run — pass --write to apply)")
