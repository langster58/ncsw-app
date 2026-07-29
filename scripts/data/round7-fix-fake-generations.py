#!/usr/bin/env python3
"""Round 7: repair the 31 families whose "generation" was not a generation.

Cause: the contiguity rule in write-generations.py set each span's end to the
next span's start minus one. That is right for a nameplate in continuous
production and WRONG for one that goes dormant — it welded the two eras of a
revived nameplate into a single span. Dodge Dart came out as 1974-2012, Ford
Bronco as 1993-2020, Toyota Land Cruiser as 1960-2014.

All ladders below were researched 2026-07-26 with a verbatim quote + URL per
boundary, and each researcher was asked specifically for the DORMANT years,
since bridging those is what produced the fakes.

Two limitations recorded rather than papered over:
  * Jeep CJ — CJ-5, CJ-6, CJ-7 and CJ-8 are four different wheelbases sold
    concurrently. Our rows carry only a powertrain string as trim, so they
    cannot be separated. Split by era instead; a proper fix needs the model
    name split into CJ-5/CJ-7/CJ-8.
  * Toyota Land Cruiser — the 2-door FJ40 and the 4-door FJ55 wagon were sold
    alongside each other 1968-1979 and are different bodies. Same limitation.

Usage: round7-fix-fake-generations.py [--write]     (default: dry run)
"""
import os
import sys

import psycopg2

# (make, model, body|None, [(y0, y1, label), ...])
LADDERS = [
    ("Acura", "Integra", "Hatchback", [(1990, 1993, "1990-1993"), (1994, 2001, "1994-2001")]),
    ("Acura", "NSX", "Coupe", [(1991, 2005, "1991-2005")]),
    # no standalone "Fleetwood" model existed pre-1977; these are Sixty Special spans
    ("Cadillac", "Fleetwood", "Sedan",
     [(1954, 1956, "1954-1956"), (1957, 1958, "1957-1958"), (1959, 1960, "1959-1960"),
      (1961, 1964, "1961-1964"), (1965, 1970, "1965-1970"), (1971, 1976, "1971-1976")]),
    # the 1995-2005 Blazer is the S-series; the crossover revival is a different vehicle
    ("Chevrolet", "Blazer", None, [(1995, 2005, "1995-2005")]),
    # convertible body absent MY1970-1986
    ("Chevrolet", "Camaro", "Convertible",
     [(1967, 1969, "1967-1969"), (1987, 1992, "1982-1992")]),
    ("Chevrolet", "Camaro", "Hatchback",
     [(1982, 1992, "1982-1992"), (1993, 2002, "1993-2002")]),
    ("Chevrolet", "Impala", "Sedan", [(1971, 1976, "1971-1976")]),
    ("Chevrolet", "Suburban", None,
     [(1941, 1946, "1941-1946"), (1947, 1954, "1947-1954"), (1955, 1959, "1955-1959"),
      (1960, 1966, "1960-1966"), (1967, 1972, "1967-1972"), (1973, 1991, "1973-1991")]),
    ("Dodge", "Challenger", "Coupe", [(1978, 1983, "1978-1983"), (2008, 2023, "2008-2023")]),
    # coupe body: B-body to 1978, L-body 1982-87, then no coupe at all until MY2024
    ("Dodge", "Charger", "Coupe",
     [(1975, 1978, "1975-1978"), (1982, 1987, "1982-1987"), (2024, 2027, "2024-2027")]),
    ("Dodge", "Dart", "Sedan", [(1967, 1976, "1967-1976")]),
    ("Ford", "Bronco", None, [(1992, 1996, "1992-1996"), (2021, 2027, "2021-2027")]),
    # no Mustang convertible MY1974-1982
    ("Ford", "Mustang", "Convertible", [(1965, 1973, "1965-1973")]),
    ("Ford", "Mustang", "Hatchback", [(1974, 1978, "1974-1978"), (1979, 1993, "1979-1993")]),
    ("Honda", "Passport", None,
     [(1994, 1997, "1994-1997"), (1998, 2002, "1998-2002"), (2019, 2025, "2019-2025")]),
    ("Honda", "Prelude", "Coupe", [(1997, 2001, "1997-2001")]),
    ("Jaguar", "XJS", "Coupe", [(1976, 1995, "1976-1995")]),
    # XJ-SC targa MY1987-88; full convertible from MY1989. Nothing US before 1987.
    ("Jaguar", "XJS", "Convertible", [(1987, 1988, "1987-1988"), (1989, 1996, "1989-1996")]),
    # limitation: CJ-5/6/7/8 not separable in our data — split by era
    ("Jeep", "CJ", None, [(1966, 1975, "1966-1975"), (1976, 1986, "1976-1986")]),
    ("Jeep", "Grand Wagoneer", None, [(1984, 1991, "1984-1991")]),
    ("Jeep", "Wagoneer", None, [(1984, 1990, "1984-1990")]),
    # US Defender: MY1993 (110), MY1994-95 and MY1997 (90). No MY1996.
    ("Land Rover", "Defender", None, [(1993, 1993, "1993-1993"), (1994, 1997, "1994-1997")]),
    ("Land Rover", "Range Rover", None, [(1987, 1995, "1987-1995")]),
    ("Lincoln", "Continental", "Convertible", [(1940, 1942, "1940-1942"), (1946, 1948, "1946-1948")]),
    ("Lincoln", "Continental", "Coupe", [(1940, 1942, "1940-1942"), (1946, 1948, "1946-1948")]),
    ("Lincoln", "Continental", "Sedan",
     [(1961, 1969, "1961-1969"), (1970, 1979, "1970-1979"), (1980, 1980, "1980-1980"),
      (1982, 1987, "1982-1987"), (1988, 1994, "1988-1994"), (1995, 2002, "1995-2002"),
      (2017, 2020, "2017-2020")]),
    ("Porsche", "911", "Coupe", [(1965, 1973, "1965-1973"), (1974, 1989, "1974-1989")]),
    ("Toyota", "Land Cruiser", None,
     [(1958, 1960, "1958-1960"), (1961, 1967, "1961-1967"), (1968, 1980, "1968-1980"),
      (1981, 1990, "1981-1990"), (1991, 1997, "1991-1997"), (1998, 2007, "1998-2007"),
      (2008, 2021, "2008-2021")]),
]

# Model years the vehicle was not sold in the US at all, per the research.
# Founder ruling already on record: if it wasn't sold in the US, delete it.
PHANTOM = [
    ("Chevrolet", "Camaro", "Convertible", 1970, 1986, "no Camaro convertible offered"),
    ("Chevrolet", "Suburban", None, 1943, 1945, "WWII civilian production suspended"),
    ("Dodge", "Charger", "Coupe", 1979, 1981, "nameplate dormant"),
    ("Dodge", "Charger", "Coupe", 1988, 2023, "no Charger coupe; the LX/LD Charger is a sedan"),
    ("Ford", "Mustang", "Convertible", 1974, 1982, "no Mustang convertible until MY1983"),
    ("Jaguar", "XJS", "Convertible", 1976, 1986, "no US XJS convertible before the MY1987 XJ-SC"),
    ("Jeep", "CJ", None, 1987, 1987, "CJ-7 replaced by the Wrangler for MY1987"),
    ("Land Rover", "Defender", None, 1983, 1992, "Defender not sold in the US until MY1993"),
    ("Land Rover", "Defender", None, 1996, 1996, "no MY1996 US Defender was offered"),
    ("Land Rover", "Range Rover", None, 1970, 1986, "not officially imported to the US until MY1987"),
    ("Lincoln", "Continental", None, 1943, 1945, "WWII civilian production suspended"),
    ("Porsche", "911", "Coupe", 1964, 1964, "US retail deliveries began MY1965"),
    ("Toyota", "Land Cruiser", None, 2012, 2012, "Land Cruiser skipped the 2012 model year in the US"),
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

    print("corrected generation ladders:")
    total = 0
    for mk, mo, bs, spans in LADDERS:
        counts = []
        for y0, y1, lab in spans:
            w, p = clause(mk, mo, bs, y0, y1)
            cur.execute(f"select count(*) from vehicles where {w}", p)
            n = cur.fetchone()[0]
            total += n
            counts.append(f"{lab}({n})")
        print(f"   {mk} {mo} ({bs or 'all'}): " + " ".join(counts))
    print(f"   -> {total} rows relabelled")

    print("\nphantom rows (not sold in the US that model year):")
    ptotal = 0
    for mk, mo, bs, y0, y1, why in PHANTOM:
        w, p = clause(mk, mo, bs, y0, y1)
        cur.execute(f"select count(*) from vehicles where {w}", p)
        n = cur.fetchone()[0]
        ptotal += n
        if n:
            print(f"   {n:>4}  {mk} {mo} ({bs or 'all'}) {y0}-{y1} — {why}")
    print(f"   {ptotal:>4}  TOTAL to delete")

    if not write:
        print("\n(dry run — pass --write to apply)")
        return

    applied = 0
    for mk, mo, bs, spans in LADDERS:
        for y0, y1, lab in spans:
            w, p = clause(mk, mo, bs, y0, y1)
            cur.execute(f"update vehicles set generation=%s where {w}", [lab] + p)
            applied += cur.rowcount

    cur.execute("""create table if not exists vehicles_deleted_not_sold_in_us
                   (like vehicles including defaults)""")
    deleted = 0
    for mk, mo, bs, y0, y1, why in PHANTOM:
        w, p = clause(mk, mo, bs, y0, y1)
        cur.execute(f"insert into vehicles_deleted_not_sold_in_us select * from vehicles where {w}", p)
        cur.execute(f"delete from vehicles where {w}", p)
        deleted += cur.rowcount
    conn.commit()

    print(f"\nrows relabelled : {applied}")
    print(f"rows deleted    : {deleted}  (kept in vehicles_deleted_not_sold_in_us)")
    cur.execute("select count(*), count(generation) from vehicles")
    t, g = cur.fetchone()
    print(f"vehicles        : {t}   generation populated: {g} ({100*g/t:.2f}%)")
    cur.execute("""with x as (select make,model,body_style,generation,
       split_part(generation,'-',1)::int y0, split_part(generation,'-',2)::int y1
       from vehicles where generation ~ '^[0-9]{4}-[0-9]{4}$' group by 1,2,3,4)
     select count(*) from (select 1 from x a join x b
       on (a.make,a.model,a.body_style)=(b.make,b.model,b.body_style)
       and a.y1>=b.y0 and a.y0<b.y0 and a.generation<>b.generation) y""")
    print(f"overlapping labels: {cur.fetchone()[0]}")
    cur.execute("""select count(*) from vehicles where generation ~ '^[0-9]{4}-[0-9]{4}$'
       and (year < split_part(generation,'-',1)::int or year > split_part(generation,'-',2)::int)""")
    print(f"rows outside label: {cur.fetchone()[0]}")


if __name__ == "__main__":
    main()
