#!/usr/bin/env python3
"""Round 5: full generation ladders for the nameplates whose labels still
overlapped each other. Unlike earlier rounds this one OVERWRITES existing
labels — these ladders are complete and sourced, so they are authoritative.

Sourced 2026-07-25 (verbatim quote + URL per boundary), cross-checked against
the EPA/DOE fueleconomy.gov per-model-year US registry and NHTSA vPIC VIN
patterns. Several real discontinuities were confirmed rather than smoothed:

  - There was NO US 5 Series in MY1996 (BMW NA's own text: "There were no 1996
    model year 5 Series offered in the US").
  - There was NO US Passat in MY2011, and no US Passat WAGON in MY2006.
  - There was NO US Tiburon in MY2002. (EPA and vPIC both carry a phantom 2002
    record with a GK-only 2.7L V6 — an early-certification artifact. Ignored.)
  - The 3 Series COUPE and CONVERTIBLE became the 4 Series for MY2014, so their
    ladders end at MY2013 while the sedan continues.
  - Mercedes R230 SL began US MY2003, not 2002 (vPIC: WDBFA68F=R129 through
    MY2002; WDBSK75F=R230 from MY2003). The MY2002 US SL is an R129.
  - The US Rabbit ran through MY2009; the Golf name returns for MY2010.

Usage: round5-generations.py [--write]      (default: dry run)
"""
import os
import sys

import psycopg2
import psycopg2.extras

# (make, model, [body...] | None, [(start, end), ...])
R = [
    # BMW 3 Series — the coupe/convertible split off as the 4 Series for MY2014
    ("BMW", "3 Series", ["Sedan"],
     [(1977, 1983), (1984, 1991), (1992, 1998), (1999, 2005),
      (2006, 2011), (2012, 2018), (2019, 2027)]),
    ("BMW", "3 Series", ["Wagon"],
     [(1999, 2005), (2006, 2012), (2014, 2019)]),
    # the E21 was a 2-door only, so the coupe ladder starts with it, not the E30
    ("BMW", "3 Series", ["Coupe"],
     [(1977, 1983), (1984, 1991), (1992, 1999), (2000, 2006), (2007, 2013)]),
    ("BMW", "3 Series", ["Convertible"],
     [(1984, 1993), (1994, 1999), (2000, 2006), (2007, 2013)]),
    ("BMW", "3 Series", ["Hatchback"], [(1995, 1999)]),   # E36 318ti

    # BMW 5 Series — MY1996 genuinely absent from the US
    ("BMW", "5 Series", ["Sedan"],
     [(1975, 1981), (1982, 1988), (1989, 1995), (1997, 2003),
      (2004, 2010), (2011, 2016), (2017, 2023), (2024, 2027)]),
    ("BMW", "5 Series", ["Wagon"],
     [(1992, 1995), (1999, 2003), (2006, 2010), (2025, 2027)]),

    ("BMW", "7 Series", ["Sedan"],
     [(1978, 1987), (1988, 1994), (1995, 2001), (2002, 2008),
      (2009, 2015), (2016, 2022), (2023, 2027)]),

    # Volkswagen Passat — no US MY2011; wagon dies with the B6
    ("Volkswagen", "Passat", ["Sedan"],
     [(1990, 1994), (1995, 1997), (1998, 2005), (2006, 2010), (2012, 2022)]),
    ("Volkswagen", "Passat", ["Wagon"],
     [(1990, 1994), (1995, 1997), (1998, 2005), (2007, 2010)]),

    ("Ford", "Focus", ["Wagon"], [(2000, 2007)]),
    ("Hyundai", "Tiburon", None, [(1997, 2001), (2003, 2008)]),
    ("Toyota", "Camry", ["Wagon"], [(1987, 1991), (1992, 1996)]),
    ("Mitsubishi", "Eclipse", None,
     [(1990, 1994), (1995, 1999), (2000, 2005), (2006, 2012)]),
    ("Mitsubishi", "Eclipse Spyder", None,
     [(1995, 1999), (2000, 2005), (2006, 2012)]),

    # R129 held the US MY2002 slot; R230 starts MY2003
    ("Mercedes-Benz", "SL-Class", None,
     [(1990, 2002), (2003, 2012), (2013, 2020), (2022, 2027)]),

    ("Volkswagen", "Rabbit", None, [(2006, 2009)]),
    ("Volkswagen", "Rabbit GTI", None, [(2006, 2009)]),
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

    rows = [(f"{s}-{e}", mk, mo, b, s, e)
            for mk, mo, bodies, spans in R for s, e in spans
            for b in (bodies or [None])]
    cur.execute("create temp table r5 (label text, make text, model text, "
                "body text, y0 int, y1 int)")
    psycopg2.extras.execute_values(
        cur, "insert into r5 (label, make, model, body, y0, y1) values %s", rows)
    m = ("r.make=v.make and r.model=v.model and v.year between r.y0 and r.y1 "
         "and (r.body is null or r.body=v.body_style)")

    cur.execute(f"""select count(*) from vehicles v join r5 r on {m}
                    where v.generation is distinct from r.label""")
    print("rows whose current label disagrees with the sourced ladder:", cur.fetchone()[0])

    # rows in these nameplates that no sourced span covers = real US-market gaps
    cur.execute(f"""
        select v.make, v.model, v.body_style, v.year, count(*)
        from vehicles v left join r5 r on {m}
        where (v.make, v.model) in (select make, model from r5) and r.label is null
        group by 1,2,3,4 order by 1,2,3,4""")
    gaps = cur.fetchall()
    print(f"\nrows falling in a year no sourced generation covers: {sum(g[4] for g in gaps)}")
    for a in gaps:
        print(f"   {a[4]:>3}  {a[0]} {a[1]} ({a[2]}) MY{a[3]}")

    if not write:
        print("\n(dry run — pass --write to apply)")
        return

    cur.execute(f"""update vehicles v set generation = r.label from r5 r
                    where {m} and v.generation is distinct from r.label""")
    applied = cur.rowcount
    conn.commit()
    print(f"\nrows relabelled: {applied}")

    cur.execute("""with g as (select make,model,body_style,generation,
       split_part(generation,'-',1)::int y0, split_part(generation,'-',2)::int y1
       from vehicles where generation ~ '^[0-9]{4}-[0-9]{4}$' group by 1,2,3,4)
     select count(*) from (select 1 from g a join g b
       on (a.make,a.model,a.body_style)=(b.make,b.model,b.body_style)
       and a.y1>=b.y0 and a.y0<b.y0 and a.generation<>b.generation) x""")
    print("remaining overlapping generation labels:", cur.fetchone()[0])
    cur.execute("select count(*), count(generation) from vehicles")
    t, g = cur.fetchone()
    print(f"generation populated: {g}/{t} ({100*g/t:.1f}%)")


if __name__ == "__main__":
    main()
