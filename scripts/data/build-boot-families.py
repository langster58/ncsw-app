#!/usr/bin/env python3
"""Build the canonical boot-dimension family list (search targets).

A boot family = one bodyshell generation of one model: (make, base_model,
body_style, generation key). Boot dimensions are constant within a family, so
the snippet collector searches once per family and the answer fans out to every
vehicle row and layout the family covers.

Families are built from the VEHICLES table, whose `generation` labels carry the
bodyshell identity. Key normalization merges what belongs together and nothing
else:
  - "IV" and "IV Restyling"          -> 4       (facelift = same boot)
  - "V" and "5th gen"                -> 5       (duplicate naming conventions)
  - "II (A5)" / "III (B3, B4)"       -> 2 / 3   (leading roman wins)
  - "240 Series", "CJ", "Passat"     -> label   (long-running named platforms)
  - NULL generation                  -> year_range string (safe fallback)
Variant suffixes (Hybrid, PHEV, ...) fold into the parent model; a variant with
a genuinely different boot is protected downstream by the per-row volume sanity
gate, not by its own search target.

Year-adjacency is deliberately NOT a merge rule — consecutive generations are
adjacent by definition; chaining them collapses a model's whole history into
one family (the bug this version replaces).

Writes boot_families (replace on each run). Trucks excluded (behind-seat model).
"""
import os, re
import psycopg2
from psycopg2.extras import execute_values
from collections import defaultdict

VARIANT_SUFFIXES = re.compile(
    r"\s+(hybrid|plug[- ]?in(?:\s+hybrid)?|phev|e:fcev|e:hev|fcev|ev|electric|"
    r"prime|energi|bluetec|tdi|hev)\s*$", re.I)
ROMAN = {"i": 1, "v": 5, "x": 10}

def base_model(model):
    m = model.strip()
    while True:
        m2 = VARIANT_SUFFIXES.sub("", m)
        if m2 == m:
            return m2
        m = m2

def roman_to_int(s):
    total, prev = 0, 0
    for ch in reversed(s.lower()):
        v = ROMAN.get(ch)
        if v is None:
            return None
        total = total - v if v < prev else total + v
        prev = max(prev, v)
    return total

def gen_key(generation, year_range, model=None):
    if not generation or not generation.strip():
        return f"yr:{year_range}"
    # junk label: generation field just repeats the model name ("Passat", "Land
    # Cruiser") -> carries no generation info; treat as unlabeled
    if model and re.sub(r"[^a-z0-9]", "", generation.lower()) == re.sub(r"[^a-z0-9]", "", model.lower()):
        return f"yr:{year_range}"
    s = re.sub(r"\s*restyling(\s*\d+)?\s*$", "", generation.strip(), flags=re.I)
    m = re.match(r"^([IVX]+)\b", s)
    if m:
        n = roman_to_int(m.group(1))
        if n:
            return f"gen{n}"
    m = re.match(r"^(\d+)(?:st|nd|rd|th)\s+gen", s, re.I)
    if m:
        return f"gen{int(m.group(1))}"
    return s.lower()

def db():
    env = {}
    with open(os.path.expanduser("~/.config/directus-render.env")) as f:
        for line in f:
            if "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    return psycopg2.connect(env["DATABASE_URL"])

conn = db(); cur = conn.cursor()
cur.execute("""select vehicle_id, make, model, body_style, year, year_range, generation
               from vehicles where body_style <> 'Truck'""")
rows = cur.fetchall()

fams = defaultdict(lambda: {"years": set(), "vehicle_ids": []})
for vid, make, model, style, year, year_range, generation in rows:
    if not (make and model and year):
        continue
    key = (make.strip(), base_model(model), style, gen_key(generation, year_range, base_model(model)))
    f = fams[key]
    f["years"].add(int(year))
    f["vehicle_ids"].append(vid)

# attach layouts by (make, base_model, style) + best year-overlap
cur.execute("""select id, make, model, body_style, year_start, year_end
               from factory_audio_layouts where body_style <> 'Truck'""")
lay = cur.fetchall()
lay_by_model = defaultdict(list)
for lid, make, model, style, ys, ye in lay:
    if make and model and ys and ye:
        lay_by_model[(make.strip(), base_model(model), style)].append((int(ys), int(ye), lid))

# absorption pass: a family mostly contained in a bigger family of the same
# model (orphan yr:* singletons from NULL generations; duplicate label spellings)
# merges into it. Containment, not adjacency — generations stay separate.
by_model = defaultdict(list)
for key, f in fams.items():
    by_model[key[:3]].append(key)
for mkey, keys in by_model.items():
    keys.sort(key=lambda k: (min(fams[k]["years"]), -len(fams[k]["years"])))
    keys_by_size = sorted(keys, key=lambda k: len(fams[k]["years"]))
    for small in keys_by_size:
        if small not in fams:
            continue
        if not small[3].startswith('yr:'):
            continue   # only unlabeled fragments get absorbed
        sy = fams[small]["years"]
        for big in sorted(keys, key=lambda k: -len(fams[k]["years"]) if k in fams else 0):
            if big == small or big not in fams or small not in fams:
                continue
            by = fams[big]["years"]
            if len(by) <= len(sy):
                continue
            contained = len([y for y in sy if min(by) <= y <= max(by)])
            if contained >= 0.7 * len(sy):
                fams[big]["years"] |= sy
                fams[big]["vehicle_ids"] += fams[small]["vehicle_ids"]
                del fams[small]
                break

fam_rows = []
for (make, model, style, gk), f in fams.items():
    ys, ye = min(f["years"]), max(f["years"])
    lids = []
    for lys, lye, lid in lay_by_model.get((make, model, style), []):
        ov = min(ye, lye) - max(ys, lys)
        if ov >= 0 and (ov + 1) >= 0.5 * (lye - lys + 1):   # layout mostly inside family
            lids.append(lid)
    fam_rows.append((make, model, style, gk, ys, ye, f["vehicle_ids"], lids))

print(f"vehicle rows in: {len(rows):,}")
print(f"boot families: {len(fam_rows):,}")

cur.execute("drop table if exists boot_families")
cur.execute("""create table boot_families (
    id serial primary key,
    make varchar, model varchar, body_style varchar, gen_key varchar,
    year_start int, year_end int,
    vehicle_ids text[], layout_ids int[],
    boot_width_in real, boot_depth_in real, boot_height_in real,
    opening_width_in real, opening_height_in real,
    dims_status varchar default 'pending')""")
execute_values(cur,
    """insert into boot_families
       (make, model, body_style, gen_key, year_start, year_end, vehicle_ids, layout_ids)
       values %s""",
    fam_rows, page_size=500)
conn.commit()

from collections import Counter
c = Counter(f[2] for f in fam_rows)
print("\nfamilies by body style:")
for st, n in c.most_common():
    print(f"  {st:<18} {n:,}")
size = Counter()
for f in fam_rows:
    size[len(f[6])] += 1
print(f"\nmedian vehicle rows per family: "
      f"{sorted(len(f[6]) for f in fam_rows)[len(fam_rows)//2]}")
print("\nHonda CR-V sample:")
for f in sorted([f for f in fam_rows if f[0] == 'Honda' and f[1] == 'CR-V'], key=lambda x: x[4]):
    print(f"  {f[0]} {f[1]} [{f[2]}] {f[3]}: {f[4]}-{f[5]}  vehicles={len(f[6])} layouts={len(f[7])}")
print("\nToyota Camry sample:")
for f in sorted([f for f in fam_rows if f[0] == 'Toyota' and f[1] == 'Camry'], key=lambda x: x[4]):
    print(f"  {f[0]} {f[1]} [{f[2]}] {f[3]}: {f[4]}-{f[5]}  vehicles={len(f[6])} layouts={len(f[7])}")
