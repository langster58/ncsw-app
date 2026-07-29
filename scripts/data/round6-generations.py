#!/usr/bin/env python3
"""Round 6: the last generation defects — rows filed under a nameplate the US
market did not use in that model year. Same class as the Mercedes "predecessor"
rows: the car is real, the label on it is not.

Sourced 2026-07-25, verbatim quote + URL per fact, cross-checked against the
EPA per-model-year US registry and NHTSA vPIC.

  - The Passat name is new to the US for MY1990 ("It was marketed under the
    Passat name in all markets; in North America, this was a first"). Before
    that the same car was the DASHER (B1, US MY1974-1981) and then the QUANTUM
    (B2, US MY1982-1988). MY1989 had neither on sale.
  - Jaguar XJ40/X300 were four-door saloons only; the coupes and convertibles
    in the XJ-Series bucket are XJS, a separate model line (US MY1976-1996).
  - The MY1993 "Grand Wagoneer" is a Grand Cherokee ZJ trim, not the SJ
    ("The Jeep Grand Wagoneer nameplate reappeared for one year as the
    top-of-the-line model of the new Jeep ZJ platform").

Usage: round6-generations.py [--write]      (default: dry run)
"""
import os
import sys

import psycopg2

# (make, old_model, body|None, y0, y1, new_model, generation)
RENAME = [
    ("Volkswagen", "Passat", None, 1974, 1981, "Dasher", "1974-1981"),
    ("Volkswagen", "Passat", None, 1982, 1988, "Quantum", "1982-1988"),
    ("Jaguar", "XJ-Series", "Coupe", 1976, 1996, "XJS", "1976-1996"),
    ("Jaguar", "XJ-Series", "Convertible", 1976, 1996, "XJS", "1976-1996"),
    ("Jeep", "Grand Wagoneer", None, 1993, 1993, "Grand Cherokee", "1993-1996"),
]

# Rows for a car that was not sold in the US that model year. Reported, never
# deleted — removing catalog rows is the founder's call.
PHANTOM = [
    ("Volkswagen", "Passat", None, 1973, 1973, "US Dasher begins MY1974"),
    ("Volkswagen", "Passat", None, 1989, 1989, "Quantum ended MY1988, Passat begins MY1990"),
    ("BMW", "3 Series", None, 1975, 1976, "US 3 Series begins MY1977 (E21 320i); the 2002 held that slot"),
    ("BMW", "5 Series", "Sedan", 1972, 1974, "US 5 Series begins MY1975 (E12 530i)"),
    ("BMW", "5 Series", "Wagon", 1987, 1991, "no US 5 Series wagon before the E34 Touring, MY1992"),
    ("BMW", "6 Series", None, 1976, 1976, "US 6 Series begins MY1977 (E24 630CSi)"),
    ("BMW", "7 Series", None, 1977, 1977, "US 7 Series begins MY1978 (E23 733i)"),
    ("Pontiac", "Grand Am", None, 1981, 1984, "nameplate dormant MY1981-1984"),
    ("Jeep", "Grand Wagoneer", None, 1992, 1992, "SJ ended MY1991; no MY1992 of either kind"),
]


def db():
    env = {}
    for line in open(os.path.expanduser("~/.config/directus-render.env")):
        if "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return psycopg2.connect(env["DATABASE_URL"])


def clause(mk, mo, bs, y0, y1):
    sql = "make=%s and model=%s and year between %s and %s"
    p = [mk, mo, y0, y1]
    if bs:
        sql += " and body_style=%s"
        p.append(bs)
    return sql, p


def main():
    write = "--write" in sys.argv
    conn = db()
    cur = conn.cursor()

    print("renames (car is real, the nameplate on it is wrong for that year):")
    total = 0
    for mk, mo, bs, y0, y1, new, gen in RENAME:
        w, p = clause(mk, mo, bs, y0, y1)
        cur.execute(f"select count(*) from vehicles where {w}", p)
        n = cur.fetchone()[0]
        total += n
        print(f"   {n:>4}  {mk} {mo} ({bs or 'all bodies'}) {y0}-{y1}  ->  {new}  [{gen}]")
    print(f"   {total:>4}  TOTAL")

    print("\nphantom rows (car not sold in the US that model year):")
    ptotal = 0
    for mk, mo, bs, y0, y1, why in PHANTOM:
        w, p = clause(mk, mo, bs, y0, y1)
        cur.execute(f"select count(*) from vehicles where {w}", p)
        n = cur.fetchone()[0]
        ptotal += n
        print(f"   {n:>4}  {mk} {mo} ({bs or 'all bodies'}) {y0}-{y1} — {why}")
    print(f"   {ptotal:>4}  TOTAL  (left in place, generation stays null)")

    if not write:
        print("\n(dry run — pass --write to apply)")
        return

    applied = 0
    for mk, mo, bs, y0, y1, new, gen in RENAME:
        w, p = clause(mk, mo, bs, y0, y1)
        cur.execute(f"update vehicles set model=%s, generation=%s where {w}", [new, gen] + p)
        applied += cur.rowcount
    conn.commit()
    print(f"\nrows renamed + given a generation: {applied}")

    cur.execute("select count(*), count(generation) from vehicles")
    t, g = cur.fetchone()
    print(f"generation populated : {g}/{t} ({100*g/t:.2f}%)")
    cur.execute("select count(*) from vehicles where generation is null")
    print(f"rows still null      : {cur.fetchone()[0]}")
    cur.execute("""with x as (select make,model,body_style,generation,
       split_part(generation,'-',1)::int y0, split_part(generation,'-',2)::int y1
       from vehicles where generation ~ '^[0-9]{4}-[0-9]{4}$' group by 1,2,3,4)
     select count(*) from (select 1 from x a join x b
       on (a.make,a.model,a.body_style)=(b.make,b.model,b.body_style)
       and a.y1>=b.y0 and a.y0<b.y0 and a.generation<>b.generation) y""")
    print(f"overlapping labels   : {cur.fetchone()[0]}")
    cur.execute("""select count(*) from vehicles where generation ~ '^[0-9]{4}-[0-9]{4}$'
       and (year < split_part(generation,'-',1)::int or year > split_part(generation,'-',2)::int)""")
    print(f"rows outside label   : {cur.fetchone()[0]}")


if __name__ == "__main__":
    main()
