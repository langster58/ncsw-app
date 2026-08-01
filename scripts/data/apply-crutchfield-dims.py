#!/usr/bin/env python3
"""Apply harvested Crutchfield measurements + class calibration to vehicles.

Two-tier, per founder ruling 2026-07-29:
  TIER 1 — the models Crutchfield measured in person get those exact numbers
           written to boot_width_in / boot_height_in / boot_depth_in, with the
           source URL and the verbatim sentence recorded for provenance.
  TIER 2 — every other model KEEPS its own width and depth (the per-vehicle
           variation is the point) but gets a new derived `buildable_ft3`
           column = its bounding-box volume x a per-body-style factor, where
           the factor is calibrated from the tier-1 measurements rather than
           guessed.

`buildable_ft3` is what the PLP fit filter compares a driver's design box
against. Raw boot_* stay as collected so provenance is never lost.

Depth ranges: Crutchfield writes both `38"/32" D` and `19"-24" D`. Both mean
the space tapers. We take the SMALLER value — a filter should be conservative.

  --dry   (default) print what would change
  --write apply
"""
import html, json, re, subprocess, sys
from collections import defaultdict
from pathlib import Path

DIMS = Path(__file__).with_name("crutchfield_dims.jsonl")
DBQ = "/Volumes/SSD 1TB/NCSW Application/Data/dbq.py"
WRITE = "--write" in sys.argv

# labelled token, now catching BOTH range forms:  38"/32" D   and   19"-24" D
TOK = re.compile(r'(\d+(?:\.\d+)?)\s*(?:"|”)\s*(?:[/-]\s*(\d+(?:\.\d+)?)\s*(?:"|”)\s*)?\s*\b([WHD])\b')
SLUG_STOP = re.compile(r"-(sedan|coupe|hatchback|wagon|convertible|crew|quad|regular|"
                       r"extended|super|double|club|access|king|mega|cab|with|without|"
                       r"base|premium|w|no)\b")


def q(sql):
    r = subprocess.run(["python3", DBQ, sql], capture_output=True, text=True)
    if r.returncode:
        sys.exit(r.stderr[:400])
    return [l.split("\t") for l in r.stdout.splitlines()[1:] if l.strip()]


# Crutchfield slugs name the body when it matters (…-honda-civic-sedan). That
# token MUST gate the match: a Civic sedan page describes a trunk, the hatchback
# page a cargo bay, and they are wildly different spaces.
BODY_TOKEN = {"sedan": "Sedan", "coupe": "Coupe", "hatchback": "Hatchback",
              "wagon": "Wagon", "convertible": "Convertible",
              "minivan": "Minivan", "van": "Minivan"}


def parse_slug(url):
    s = url.rsplit("/", 1)[-1][:-5]
    m = re.match(r"^(\d{4})(?:-(\d{2,4})|-(up))?-(.+)$", s)
    if not m:
        return None
    y0 = int(m.group(1))
    if m.group(3):
        y1 = 2100
    elif m.group(2):
        e = m.group(2)
        y1 = int(e) if len(e) == 4 else int(str(y0)[:2] + e)
    else:
        y1 = y0
    raw = m.group(4).replace("-", " ")
    body = next((v for k, v in BODY_TOKEN.items() if re.search(rf"\b{k}\b", raw)), None)
    return y0, y1, SLUG_STOP.sub("", raw).strip(), body


def dims_from(sentence):
    """W/H/D from a Crutchfield sentence; ranges collapse to the SMALLER value."""
    out = {}
    for a, b, lab in TOK.findall(sentence):
        k = lab.lower()
        if k in out:
            continue
        out[k] = min(float(a), float(b)) if b else float(a)
    return out if {"w", "h", "d"} <= out.keys() else None


# ------------------------------------------------------------ load harvest
cand = []
for line in DIMS.read_text().splitlines():
    try:
        r = json.loads(line)
    except Exception:
        continue
    if not r.get("dims"):
        continue
    ps = parse_slug(r["url"])
    if not ps:
        continue
    d = dims_from(r["dims"][0]["sentence"])
    if not d:
        continue
    y0, y1, name, body = ps
    cand.append(dict(url=r["url"], y0=y0, y1=y1, name=name, body=body,
                     sentence=r["dims"][0]["sentence"], **d))
# newest generation wins when two pages cover the same span
cand.sort(key=lambda c: c["y0"])

# ------------------------------------------------------------ match to DB
veh = q("SELECT vehicle_id, make, model, year, body_style, boot_width_in, "
        "boot_height_in, boot_depth_in FROM vehicles WHERE vehicle_category IN "
        "('trunk','cargo') AND boot_width_in IS NOT NULL")
by_model = defaultdict(list)
for vid, mk, md, yr, bs, w, h, dp in veh:
    by_model[(mk, md)].append((int(vid), int(yr), bs, float(w), float(h), float(dp)))

assign = {}          # vehicle_id -> candidate
for c in cand:
    for (mk, md), lst in by_model.items():
        if c["name"].startswith(f"{mk} {md}".lower().replace("-", " ")):
            for vid, yr, bs, w, h, dp in lst:
                if not (c["y0"] <= yr <= c["y1"]):
                    continue
                # body-gated: a page naming a body only describes that body.
                if c["body"] and bs != c["body"]:
                    continue
                # an un-bodied page must not overwrite a body-specific match
                if c["body"] is None and assign.get(vid, {}).get("body"):
                    continue
                assign[vid] = c
            break

# ------------------------------------- calibrate k per body style (pre-overwrite)
ratio = defaultdict(list)
for vid, yr, bs, w, h, dp in [r for lst in by_model.values() for r in lst]:
    c = assign.get(vid)
    if not c:
        continue
    ours = w * h * dp / 1728.0
    theirs = c["w"] * c["h"] * c["d"] / 1728.0
    if ours > 0:
        ratio[bs].append(theirs / ours)
K = {bs: round(sum(v) / len(v), 3) for bs, v in ratio.items()}
allk = [x for v in ratio.values() for x in v]
K_DEFAULT = round(sorted(allk)[len(allk) // 2], 3)

print(f"matched vehicle rows: {len(assign)} across {len({id(c) for c in assign.values()})} generations")
print(f"calibration factors (n = sample size):")
for bs in sorted(K, key=lambda b: -len(ratio[b])):
    print(f"   {bs:<18} k={K[bs]:<6} n={len(ratio[bs])}")
print(f"   {'(default/median)':<18} k={K_DEFAULT}")

if not WRITE:
    print("\n-- dry run; re-run with --write --")
    for vid, c in list(assign.items())[:5]:
        print(f"   vid {vid}: {c['w']} x {c['h']} x {c['d']}  <- {c['sentence'][:70]}")
    sys.exit(0)

# ------------------------------------------------------------------- write
q("ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS buildable_ft3 real, "
  "ADD COLUMN IF NOT EXISTS buildable_source varchar")

# tier 1: exact measured numbers
groups = defaultdict(list)
for vid, c in assign.items():
    groups[id(c)].append(vid)
n1 = 0
for c in {id(x): x for x in assign.values()}.values():
    ids = ",".join(str(v) for v in groups[id(c)])
    esc = c["sentence"].replace("'", "''")[:300]
    q(f"UPDATE vehicles SET boot_width_in={c['w']}, boot_height_in={c['h']}, "
      f"boot_depth_in={c['d']}, buildable_ft3={round(c['w']*c['h']*c['d']/1728.0,2)}, "
      f"buildable_source='crutchfield-measured', dims_status='researched', "
      f"dims_confidence='high', dims_source_url='{c['url']}', "
      f"dims_quote='{esc}' WHERE vehicle_id IN ({ids})")
    n1 += len(groups[id(c)])
print(f"TIER 1 written: {n1} rows from {len(groups)} measured generations")

# tier 2: keep own dims, derive buildable volume via the calibrated factor
cases = " ".join(f"WHEN '{bs}' THEN {k}" for bs, k in K.items())
n2 = q(f"UPDATE vehicles SET buildable_ft3 = ROUND((boot_width_in*boot_height_in*"
       f"boot_depth_in/1728.0 * (CASE body_style {cases} ELSE {K_DEFAULT} END))::numeric, 2), "
       f"buildable_source='class-calibrated' "
       f"WHERE vehicle_category IN ('trunk','cargo') AND boot_width_in IS NOT NULL "
       f"AND buildable_source IS DISTINCT FROM 'crutchfield-measured' "
       f"RETURNING vehicle_id")
print(f"TIER 2 written: {len(n2)} rows class-calibrated")
