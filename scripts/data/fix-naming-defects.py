#!/usr/bin/env python3
"""Fix model-naming defects that hid whole generations from the generation pass.

These are not research gaps — they are defects in `vehicles.model` that made
one physical car appear under two names, or two physical cars appear under one.
Each fix below is sourced; see the citation on each block.

1. MINI  — the catalog carries two naming eras. Pre-2017 rows say "Cooper X",
   2017-2024 rows say "X", and 2025+ rows say "Cooper" again (MINI USA really
   did drop "Hardtop" for MY2025). Worse, the 2-door and 4-door hatchbacks
   share the single model name "Cooper" in 2015-2016 and 2025-2026, so the
   picker cannot tell a 2-door from a 4-door. `doors` disambiguates them.
     MY2025+ names: miniusa.com "2025 MINI Cooper 2 Door Hatchback",
     "2025 MINI Cooper 4 Door Hatchback", "2025 MINI Cooper Convertible".
     F57 convertible = US MY2016-2024, F67 = MY2025+ (cars.com generations).

2. Toyota Corolla Hatchback — a 40-year span holding two unrelated cars: the
   1987-88 Corolla FX (E80/AE82) and the 2019+ Corolla Hatchback (E210). There
   was no US-market E90 hatchback ("The NUMMI plant had been building the E80
   Corolla FX (hatchback) ... and so Toyota switched to building the sedan
   with the new series" — Wikipedia, Toyota Corolla E90). The FX gets its own
   US model name.

3. Mercedes-Benz — ten groups whose `model` is internal shorthand
   ("E-Class predecessor W124") rather than a model name. The trim column
   already carries the real designation (300E, 560SEL, 300SL...). Where the
   same unibody continues under the modern nameplate the rows are merged into
   it; W201 is NOT the C-Class unibody (C-Class begins at W202/MY1994) so it
   takes its own US model name instead of being merged.

Usage: fix-naming-defects.py [--write]      (default: dry run)
"""
import os
import sys

import psycopg2

# (make, model, body, doors|None, y0, y1) -> (new_model|None, new_generation|None)
# None on either side means "leave that column alone".
FIXES = [
    # ---------------------------------------------------------------- MINI
    # 2-door hatch: R50/R53, R56, F56. US name "Hardtop" from launch through 2024.
    ("Mini", "Cooper", "Hatchback", 2, 2002, 2006, "Hardtop 2 Door", "2002-2006"),
    ("Mini", "Cooper", "Hatchback", 2, 2007, 2013, "Hardtop 2 Door", "2007-2013"),
    ("Mini", "Cooper", "Hatchback", 2, 2014, 2016, "Hardtop 2 Door", "2014-2024"),
    # 4-door hatch (F55) launched MY2015; shared the "Cooper" name until 2017.
    ("Mini", "Cooper", "Hatchback", 4, 2015, 2016, "Hardtop 4 Door", "2015-2024"),
    # MY2025 F66/J01: MINI USA renamed the model to "Cooper 2/4 Door".
    ("Mini", "Cooper", "Hatchback", 2, 2025, 2027, "Cooper 2 Door", "2025-2027"),
    ("Mini", "Cooper", "Hatchback", 4, 2025, 2027, "Cooper 4 Door", "2025-2027"),
    # Convertible: R52, R57, F57, then F67 from MY2025.
    ("Mini", "Cooper", "Convertible", None, 2005, 2008, "Convertible", "2005-2008"),
    ("Mini", "Cooper", "Convertible", None, 2009, 2015, "Convertible", "2009-2015"),
    ("Mini", "Cooper", "Convertible", None, 2016, 2024, "Convertible", "2016-2024"),
    ("Mini", "Cooper", "Convertible", None, 2025, 2027, "Cooper Convertible", "2025-2027"),
    # existing "Convertible" rows carry F57 = 2016-2027, but F57 ended MY2024.
    ("Mini", "Convertible", "Convertible", None, 2016, 2024, None, "2016-2024"),
    # Clubman: R55 (MY2008-2014), F54 (MY2016-2024) — the 2016 row is misnamed.
    ("Mini", "Cooper Clubman", "Hatchback", 3, 2008, 2014, "Clubman", "2008-2014"),
    ("Mini", "Cooper Clubman", "Hatchback", 4, 2016, 2016, "Clubman", "2016-2024"),
    ("Mini", "Clubman", "Hatchback", 4, 2017, 2024, None, "2016-2024"),
    # Countryman: R60 (MY2011-2016), F60 (MY2017-2024 — the 2023 facelift is a
    # restyling, not a new unibody), U25 (MY2025+, recorded as SUV / Crossover).
    ("Mini", "Cooper Countryman", "Wagon", None, 2011, 2016, "Countryman", "2011-2016"),
    ("Mini", "Countryman", "Wagon", None, 2017, 2024, None, "2017-2024"),
    ("Mini", "Countryman", "SUV / Crossover", None, 2025, 2027, None, "2025-2027"),

    # -------------------------------------------------------------- TOYOTA
    ("Toyota", "Corolla Hatchback", "Hatchback", None, 1987, 1988, "Corolla FX", "1987-1988"),
    ("Toyota", "Corolla Hatchback", "Hatchback", None, 2019, 2027, None, "2019-2027"),

    # ------------------------------------------------------- MERCEDES-BENZ
    # W201 — the 190E. Not the C-Class unibody, so it keeps its own name.
    ("Mercedes-Benz", "C-Class predecessor W201 190", "Sedan", None, 1984, 1993, "190E", "1984-1993"),
    # W124 / C124 / A124 — merge into the E-Class nameplate they became in 1994.
    ("Mercedes-Benz", "E-Class predecessor W124", "Sedan", None, 1986, 1995, "E-Class", "1986-1995"),
    ("Mercedes-Benz", "E-Class predecessor W124", "Wagon", None, 1986, 1995, "E-Class", "1986-1995"),
    ("Mercedes-Benz", "E-Class predecessor W124", "Coupe", None, 1988, 1995, "E-Class", "1988-1995"),
    ("Mercedes-Benz", "E-Class predecessor W124", "Convertible", None, 1993, 1995, "E-Class", "1993-1995"),
    # the 1994-95 rows already sitting under E-Class are the same bodies
    ("Mercedes-Benz", "E-Class", "Sedan", None, 1994, 1995, None, "1986-1995"),
    ("Mercedes-Benz", "E-Class", "Wagon", None, 1994, 1995, None, "1986-1995"),
    ("Mercedes-Benz", "E-Class", "Coupe", None, 1994, 1995, None, "1988-1995"),
    ("Mercedes-Benz", "E-Class", "Convertible", None, 1994, 1995, None, "1993-1995"),
    # W126 / W140 -> S-Class; C140 coupe is its own generation, not a catch-all
    ("Mercedes-Benz", "S-Class predecessor W126", "Sedan", None, 1981, 1991, "S-Class", "1981-1991"),
    ("Mercedes-Benz", "S-Class predecessor W126", "Coupe", None, 1981, 1991, "S-Class", "1981-1991"),
    ("Mercedes-Benz", "S-Class predecessor W140", "Sedan", None, 1992, 1998, "S-Class", "1992-1998"),
    ("Mercedes-Benz", "S-Class predecessor W140", "Coupe", None, 1993, 1999, "S-Class", "1993-1999"),
    ("Mercedes-Benz", "S-Class", "Coupe", None, 1993, 1999, None, "1993-1999"),
    # R129 -> SL-Class, joining the generation label already on the 1994+ rows
    ("Mercedes-Benz", "SL-Class predecessor R129", "Convertible", None, 1990, 2001, "SL-Class", "1990-2001"),
]


def db():
    env = {}
    for line in open(os.path.expanduser("~/.config/directus-render.env")):
        if "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return psycopg2.connect(env["DATABASE_URL"])


def where(mk, mo, bs, doors, y0, y1, p=""):
    sql = (f"{p}make=%s and {p}model=%s and {p}body_style=%s "
           f"and {p}year between %s and %s")
    params = [mk, mo, bs, y0, y1]
    if doors is not None:
        sql += f" and {p}doors=%s"
        params.append(doors)
    return sql, params


def main():
    write = "--write" in sys.argv
    conn = db()
    cur = conn.cursor()

    planned = 0
    print(f"{'rows':>5}  target -> new model / new generation")
    print("-" * 92)
    for mk, mo, bs, doors, y0, y1, new_model, new_gen in FIXES:
        w, p = where(mk, mo, bs, doors, y0, y1)
        cur.execute(f"select count(*) from vehicles where {w}", p)
        n = cur.fetchone()[0]
        planned += n
        d = f" {doors}dr" if doors else ""
        tgt = f"{mk} {mo} ({bs}{d}) {y0}-{y1}"
        print(f"{n:>5}  {tgt:<58} -> {new_model or '(name kept)':<20} {new_gen or ''}")
        if n == 0:
            print("        ^^ MATCHES NOTHING — check this rule")

    # a rename must not collide with an existing row for the same car
    print("\ncollision check (rename would duplicate an existing year/trim/doors row):")
    collisions = 0
    for mk, mo, bs, doors, y0, y1, new_model, _g in FIXES:
        if not new_model:
            continue
        w, p = where(mk, mo, bs, doors, y0, y1, "v.")
        cur.execute(f"""
            select v.year, v.trim, v.doors, count(*)
            from vehicles v
            join vehicles o on o.make=v.make and o.model=%s and o.body_style=v.body_style
                           and o.year=v.year and o.trim is not distinct from v.trim
                           and o.doors is not distinct from v.doors
            where {w}
            group by 1,2,3""", [new_model] + p)
        for r in cur.fetchall():
            collisions += 1
            print(f"   {mk} {mo}->{new_model} {r[0]} {r[1]} {r[2]}dr  ({r[3]})")
    print("   none" if not collisions else f"   {collisions} COLLISIONS — resolve before writing")

    cur.execute("select count(*) from vehicles where generation is null")
    before = cur.fetchone()[0]
    print(f"\nrows planned for update : {planned}")
    print(f"rows without generation : {before}")

    if not write:
        print("\n(dry run — pass --write to apply)")
        return
    if collisions:
        sys.exit("refusing to write: collisions above would create duplicate vehicles")

    applied = 0
    for mk, mo, bs, doors, y0, y1, new_model, new_gen in FIXES:
        sets, vals = [], []
        if new_model:
            sets.append("model=%s")
            vals.append(new_model)
        if new_gen:
            sets.append("generation=%s")
            vals.append(new_gen)
        if not sets:
            continue
        w, p = where(mk, mo, bs, doors, y0, y1)
        cur.execute(f"update vehicles set {', '.join(sets)} where {w}", vals + p)
        applied += cur.rowcount
    conn.commit()

    cur.execute("select count(*) from vehicles where generation is null")
    after = cur.fetchone()[0]
    cur.execute("select count(*) from vehicles where model ilike '%predecessor%'")
    left = cur.fetchone()[0]
    cur.execute("""select count(*) from (
        select make, model, body_style from vehicles where generation is null
        group by 1,2,3 having max(year)-min(year) >= 15) x""")
    wide = cur.fetchone()[0]
    print(f"\nrows updated                        : {applied}")
    print(f"rows without generation   : {before} -> {after}")
    print(f"placeholder 'predecessor' model rows: {left}")
    print(f"null-generation groups spanning 15y+: {wide}")


if __name__ == "__main__":
    main()
