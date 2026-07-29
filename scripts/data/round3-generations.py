#!/usr/bin/env python3
"""Round 3: generation boundaries for the 24 highest-volume unresolved
nameplates — heavy-duty trucks, the old GMT400/C-K truck lines, and four
stragglers. 70% of everything still unresolved sat in these 24 names.

Every span below was sourced by web research on 2026-07-25 with a verbatim
quote and URL required per boundary (the anti-confabulation rule: an earlier
pass on this project invented dimensions, so nothing here is inferred from an
adjacent model). Chassis/platform codes are recorded in the comments because
they are what distinguishes a real body change from a facelift.

Judgement calls made where sources conflict or overlap, each noted inline:
  - GM HD MY2007 is a genuine split year (GMT800 "Classic" and GMT900 both
    sold as 2007). Filed 2001-2006 / 2007-2014 per CarBuzz; Wikipedia carries
    the Classic through 2007. Our rows do not distinguish Classic trucks.
  - GMT400 vs GMT800 overlap on Sierra 2500 (1999-2000): the leftover GMT400
    trucks were rebadged "Sierra Classic", so a row still called "Sierra 2500"
    in 1999+ is GMT800.
  - Labels record the TRUE generation span even when we only carry part of it
    (e.g. Dodge Ram Pickup 2500 MY2010 is labelled 2010-2018, the span of the
    DS generation that continues under the Ram marque).

Usage: round3-generations.py [--write]      (default: dry run)
"""
import os
import sys

import psycopg2
import psycopg2.extras

# make, model, [(start, end), ...]
R = [
    # --- GM heavy duty -------------------------------------------------
    # GMT800/880 · GMT900/GMT910 · K2XX (GMTK2HC/HG) · T1XX
    ("Chevrolet", "Silverado 2500HD", [(2001, 2006), (2007, 2014), (2015, 2019), (2020, 2027)]),
    ("GMC", "Sierra 2500HD", [(2001, 2006), (2007, 2014), (2015, 2019), (2020, 2027)]),
    # 3500HD nameplate only debuts with the GMT900 for MY2007
    ("Chevrolet", "Silverado 3500HD", [(2007, 2014), (2015, 2019), (2020, 2027)]),
    ("GMC", "Sierra 3500HD", [(2007, 2014), (2015, 2019), (2020, 2027)]),
    # non-HD-badged 3500, added for 2001, one GMT800 generation
    ("Chevrolet", "Silverado 3500", [(2001, 2006)]),

    # --- GM light/older truck lines (GMT400) ---------------------------
    ("GMC", "Sierra 1500", [(1988, 1998)]),
    ("GMC", "Sierra 2500", [(1988, 1998), (1999, 2004)]),
    ("GMC", "Sierra 3500", [(1988, 2000), (2001, 2006)]),
    ("Chevrolet", "C/K 1500 Series", [(1988, 1999)]),
    ("Chevrolet", "C/K 2500 Series", [(1988, 2000)]),
    ("Chevrolet", "C/K 3500 Series", [(1988, 2000)]),
    ("Chevrolet", "S-10", [(1982, 1993), (1994, 2004)]),

    # --- Ford ----------------------------------------------------------
    # Super Duty is its own line: PHN131 · P356 · P473 · P558 · P708
    ("Ford", "F-250 Super Duty", [(1999, 2007), (2008, 2010), (2011, 2016), (2017, 2022), (2023, 2027)]),
    ("Ford", "F-350 Super Duty", [(1999, 2007), (2008, 2010), (2011, 2016), (2017, 2022), (2023, 2027)]),
    # F-450 pickup (as opposed to chassis cab) only exists from MY2008
    ("Ford", "F-450 Super Duty", [(2008, 2010), (2011, 2016), (2017, 2022), (2023, 2027)]),
    ("Ford", "Ranger", [(1983, 1992), (1993, 1997)]),

    # --- Ram / Dodge ---------------------------------------------------
    # HD changeover years differ from the 1500's — see script docstring
    ("Ram", "2500", [(2011, 2018), (2019, 2027)]),
    ("Ram", "3500", [(2011, 2018), (2019, 2027)]),
    # MY2002 HD is still 2nd-gen BR/BE; 3rd gen HD starts MY2003
    ("Dodge", "Ram Pickup 2500", [(1994, 2002), (2003, 2009), (2010, 2018)]),
    ("Dodge", "Ram Pickup 3500", [(1994, 2002), (2003, 2009), (2010, 2018)]),

    # --- stragglers ----------------------------------------------------
    # D22 is ONE generation; the 2001 restyle is a facelift
    ("Nissan", "Frontier", [(1998, 2004), (2005, 2021)]),
    # XD shares the Titan's 2nd generation (A61); MY2020 is a refresh
    ("Nissan", "Titan XD", [(2016, 2024)]),
    # N-body throughout; coupe and sedan share boundaries
    ("Pontiac", "Grand Am", [(1985, 1991), (1992, 1998), (1999, 2005)]),
    # LX then LD; 2008 and 2015 are facelifts, not generations
    ("Chrysler", "300", [(2005, 2010), (2011, 2023)]),
]

# Rows for cars that were never built (sourced absence, not a research gap).
# Reported, not deleted — removing catalog rows is the founder's call.
PHANTOM = [
    ("Pontiac", "Grand Am", None, 1984, 1984, "no MY1981-1984 Grand Am was produced"),
    ("Pontiac", "Grand Am", "Sedan", 1985, 1985, "3rd-gen sedan not added until MY1986"),
]


def db():
    env = {}
    for line in open(os.path.expanduser("~/.config/directus-render.env")):
        if "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return psycopg2.connect(env["DATABASE_URL"])


def main():
    write = "--write" in sys.argv
    conn = db()
    cur = conn.cursor()

    rows = [(f"{s}-{e}", mk, mo, s, e) for mk, mo, spans in R for s, e in spans]
    print(f"nameplates : {len(R)}")
    print(f"gen spans  : {len(rows)}")

    cur.execute("select count(*) from vehicles where generation is null")
    before = cur.fetchone()[0]

    cur.execute("create temp table r3 (label text, make text, model text, y0 int, y1 int)")
    psycopg2.extras.execute_values(
        cur, "insert into r3 (label, make, model, y0, y1) values %s", rows)

    # what each nameplate would gain, and what it would leave behind
    cur.execute("""
        select v.make, v.model, count(*) filter (where r.label is not null) hit,
               count(*) filter (where r.label is null) missed
        from vehicles v
        left join r3 r on r.make=v.make and r.model=v.model and v.year between r.y0 and r.y1
        where v.generation is null
          and (v.make, v.model) in (select make, model from r3)
        group by 1,2 order by 4 desc, 3 desc""")
    total_hit = total_missed = 0
    print(f"\n{'resolved':>9} {'left':>5}  nameplate")
    for mk, mo, hit, missed in cur.fetchall():
        total_hit += hit
        total_missed += missed
        flag = "   <-- year outside every sourced span" if missed else ""
        print(f"{hit:>9} {missed:>5}  {mk} {mo}{flag}")
    print(f"{total_hit:>9} {total_missed:>5}  TOTAL")

    print("\nphantom rows (car was never built — reported, not deleted):")
    for mk, mo, bs, y0, y1, why in PHANTOM:
        q = "select count(*) from vehicles where make=%s and model=%s and year between %s and %s"
        p = [mk, mo, y0, y1]
        if bs:
            q += " and body_style=%s"
            p.append(bs)
        cur.execute(q, p)
        print(f"   {cur.fetchone()[0]:>4}  {mk} {mo} {bs or ''} {y0}-{y1} — {why}")

    if not write:
        print("\n(dry run — pass --write to apply)")
        return

    cur.execute("""update vehicles v set generation = r.label from r3 r
                   where v.make=r.make and v.model=r.model
                     and v.year between r.y0 and r.y1 and v.generation is null""")
    applied = cur.rowcount
    conn.commit()

    cur.execute("select count(*) from vehicles where generation is null")
    after = cur.fetchone()[0]
    cur.execute("select count(*), count(generation) from vehicles")
    t, g = cur.fetchone()
    print(f"\nrows updated             : {applied}")
    print(f"rows without generation  : {before} -> {after}")
    print(f"generation populated     : {g}/{t} ({100*g//t}%)")
    cur.execute("""select count(*) from vehicles where generation ~ '^[0-9]{4}-[0-9]{4}$'
       and (year < split_part(generation,'-',1)::int or year > split_part(generation,'-',2)::int)""")
    print(f"rows outside own label   : {cur.fetchone()[0]}")


if __name__ == "__main__":
    main()
