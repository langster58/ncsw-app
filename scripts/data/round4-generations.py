#!/usr/bin/env python3
"""Round 4: generation boundaries for the remaining 143 nameplates.

Sourced by web research 2026-07-25, verbatim quote + URL required per boundary.
Spans are the TRUE generation span even where we only carry part of it.

Research corrected several premises, recorded here because they are the kind of
thing that gets silently re-broken later:
  - GMC Suburban MY1990-91 is NOT GMT400. The Suburban kept the Rounded-Line
    body through MY1991; GMT400 Suburbans start MY1992.
  - Mazda B-Series MY1990-2001 crosses THREE generations (Mazda-built UF, then
    two Ford Ranger rebadge generations), not one.
  - Ford Shelby GT500 skipped MY2015-2019 entirely (the GT350 held that slot).
  - Jaguar XJ40/X300 were four-door saloons ONLY — any Coupe/Convertible in the
    XJ-Series bucket is an XJS, a different model line. Left unassigned.
  - Infiniti G sedan/coupe/convertible have different START years within one
    V36 generation (2007 / 2008 / 2009).
  - Toyota Pickup MY1990-95 is the 5th-gen Hilux (N80/N90/N100/N110), not N140.

Usage: round4-generations.py [--write]      (default: dry run)
"""
import os
import sys

import psycopg2
import psycopg2.extras

# (make, model, body_style|None, [(start, end), ...])
R = [
    # ---- BMW / Audi / Alfa Romeo ------------------------------------
    ("BMW", "3 Series", None, [(1977, 1983), (1984, 1991), (1992, 1998), (1999, 2006)]),
    ("BMW", "5 Series", None, [(1975, 1981), (1982, 1988)]),
    ("BMW", "6 Series", "Coupe", [(1977, 1989)]),
    ("BMW", "7 Series", "Sedan", [(1978, 1987)]),
    ("BMW", "2 Series", "Coupe", [(2014, 2021)]),
    ("BMW", "ActiveHybrid 7", "Sedan", [(2011, 2015)]),
    ("Audi", "S4", "Sedan", [(1992, 1994)]),
    ("Alfa Romeo", "4C", "Coupe", [(2015, 2020)]),

    # ---- Mercedes-Benz ----------------------------------------------
    ("Mercedes-Benz", "C-Class", "Coupe", [(2001, 2007)]),
    ("Mercedes-Benz", "C-Class", "Wagon", [(2001, 2007)]),
    ("Mercedes-Benz", "CLK-Class", "Coupe", [(1998, 2002), (2003, 2009)]),
    ("Mercedes-Benz", "G-Class", None, [(2002, 2018)]),
    ("Mercedes-Benz", "R-Class", None, [(2006, 2012)]),
    ("Mercedes-Benz", "SL-Class", None, [(2003, 2012), (2013, 2020), (2022, 2027)]),
    ("Mercedes-Benz", "SLS AMG GT Final Edition", "Convertible", [(2011, 2015)]),

    # ---- Maserati / Fiat / Volvo / Land Rover -----------------------
    ("Maserati", "Coupe", "Coupe", [(2002, 2006)]),
    ("Maserati", "Spyder", "Convertible", [(2002, 2006)]),
    ("Maserati", "GranSport", None, [(2005, 2007)]),
    ("Maserati", "Grecale Folgore", None, [(2023, 2027)]),
    ("Fiat", "500e", "Hatchback", [(2013, 2019), (2024, 2027)]),
    ("Volvo", "C40 Recharge", None, [(2022, 2024)]),
    ("Land Rover", "LR3", None, [(2005, 2009)]),

    # ---- Jaguar (XJ saloon only — coupe/convertible are XJS) ---------
    ("Jaguar", "F-TYPE", None, [(2014, 2024)]),
    ("Jaguar", "F-PACE", None, [(2017, 2027)]),
    ("Jaguar", "E-PACE", None, [(2018, 2024)]),
    ("Jaguar", "I-PACE", None, [(2019, 2024)]),
    ("Jaguar", "XJ-Series", "Sedan", [(1990, 1994), (1995, 1997)]),

    # ---- Cadillac ----------------------------------------------------
    ("Cadillac", "CT4-V Blackwing", None, [(2020, 2027)]),
    ("Cadillac", "CT5-V Blackwing", None, [(2020, 2027)]),
    ("Cadillac", "ESCALADE IQ", None, [(2025, 2027)]),
    ("Cadillac", "ESCALADE IQL", None, [(2026, 2027)]),
    ("Cadillac", "LYRIQ", None, [(2023, 2027)]),
    ("Cadillac", "OPTIQ", None, [(2025, 2027)]),
    ("Cadillac", "STS-V", None, [(2005, 2011)]),
    ("Cadillac", "XLR-V", None, [(2004, 2009)]),

    # ---- Chevrolet ---------------------------------------------------
    ("Chevrolet", "Bolt", None, [(2027, 2027)]),
    ("Chevrolet", "Malibu Maxx", None, [(2004, 2007)]),
    ("Chevrolet", "Malibu Classic", None, [(2004, 2008)]),
    ("Chevrolet", "TrailBlazer EXT", None, [(2002, 2006)]),
    ("Chevrolet", "Silverado 2500", None, [(1999, 2004)]),
    ("Chevrolet", "Silverado 1500HD", None, [(2001, 2006)]),
    # MY2007 GMT800 carryovers sold beside the new GMT900
    ("Chevrolet", "Silverado 1500 Classic", None, [(1999, 2007)]),
    ("Chevrolet", "Silverado 1500HD Classic", None, [(2001, 2007)]),
    ("Chevrolet", "Silverado 2500HD Classic", None, [(2001, 2007)]),
    ("Chevrolet", "Silverado 3500 Classic", None, [(2001, 2007)]),

    # ---- GMC ---------------------------------------------------------
    ("GMC", "Sierra 1500 Classic", None, [(1999, 2007)]),
    ("GMC", "Sierra 1500HD", None, [(2001, 2006)]),
    ("GMC", "Sierra 1500HD Classic", None, [(2001, 2007)]),
    ("GMC", "Sierra 2500HD Classic", None, [(2001, 2007)]),
    ("GMC", "Sierra 3500 Classic", None, [(2001, 2007)]),
    # 1999-2000 GMT400 leftovers, rebadged "Classic" beside the GMT800
    ("GMC", "Sierra Classic 1500", None, [(1988, 1999)]),
    ("GMC", "Sierra Classic 2500", None, [(1988, 2000)]),
    ("GMC", "Sierra Classic 3500", None, [(1988, 2000)]),
    ("GMC", "Envoy XL", None, [(2002, 2006)]),
    ("GMC", "Envoy XUV", None, [(2004, 2005)]),
    ("GMC", "HUMMER EV", None, [(2022, 2027)]),
    ("GMC", "S-15", None, [(1982, 1993)]),
    ("GMC", "S-15 Jimmy", None, [(1983, 1994)]),
    ("GMC", "Suburban", None, [(1973, 1991)]),   # NOT GMT400 — see docstring
    ("Hummer", "H1 Alpha", None, [(1992, 2006)]),
    ("Hummer", "H2 SUT", None, [(2003, 2009)]),

    # ---- Ford / Lincoln ----------------------------------------------
    ("Ford", "F-250", None, [(1987, 1991), (1992, 1996), (1997, 1999)]),
    ("Ford", "F-350", None, [(1987, 1991), (1992, 1998)]),
    ("Ford", "Bronco II", None, [(1984, 1990)]),
    ("Ford", "Escort", "Coupe", [(1997, 2003)]),
    ("Ford", "Expedition EL", None, [(2007, 2017)]),
    ("Ford", "Fusion", "Sedan", [(2013, 2020)]),
    ("Ford", "Fusion Energi", None, [(2013, 2020)]),
    ("Ford", "Fusion Hybrid", None, [(2013, 2020)]),
    ("Ford", "C-Max Hybrid", None, [(2013, 2018)]),
    ("Ford", "C-Max Energi", None, [(2013, 2017)]),
    ("Ford", "Shelby GT350", None, [(2015, 2023)]),
    ("Ford", "Shelby GT500", None, [(2005, 2014), (2015, 2023)]),
    ("Lincoln", "Zephyr", None, [(2006, 2012)]),

    # ---- Chrysler / Dodge / Plymouth / Jeep --------------------------
    ("Dodge", "Grand Caravan", None, [(1984, 1990), (1991, 1995), (1996, 2000)]),
    ("Plymouth", "Grand Voyager", None, [(1984, 1990), (1991, 1995), (1996, 2000)]),
    ("Chrysler", "Grand Voyager", None, [(1996, 2000)]),
    ("Chrysler", "Town and Country", None, [(1984, 1990)]),
    ("Dodge", "RAM 150", None, [(1981, 1993)]),
    ("Dodge", "RAM 250", None, [(1981, 1993)]),
    ("Dodge", "RAM 350", None, [(1981, 1993)]),
    ("Dodge", "SRT Viper", None, [(2013, 2017)]),
    ("Chrysler", "Aspen", None, [(2007, 2009)]),
    ("Chrysler", "Crossfire", None, [(2004, 2008)]),
    ("Jeep", "Grand Cherokee WK", None, [(2011, 2022)]),
    ("Jeep", "Wrangler JK", None, [(2007, 2018)]),
    ("Jeep", "Grand Wagoneer", None, [(1963, 1991)]),

    # ---- Hyundai / Genesis / Infiniti / Nissan / Isuzu ---------------
    ("Hyundai", "Ioniq Hybrid", None, [(2017, 2022)]),
    ("Hyundai", "Ioniq Electric", None, [(2017, 2022)]),
    ("Hyundai", "Ioniq Plug-In Hybrid", None, [(2017, 2022)]),
    ("Hyundai", "NEXO", None, [(2019, 2023)]),
    ("Hyundai", "XG300", None, [(2001, 2005)]),
    ("Hyundai", "XG350", None, [(2001, 2005)]),
    ("Genesis", "Electrified G80", None, [(2021, 2027)]),
    ("Genesis", "Electrified GV70", None, [(2022, 2027)]),
    ("Infiniti", "G Sedan", None, [(2007, 2015)]),
    ("Infiniti", "G Coupe", None, [(2008, 2015)]),
    ("Infiniti", "G Convertible", None, [(2009, 2015)]),
    ("Infiniti", "Q60 Coupe", None, [(2008, 2015)]),
    ("Infiniti", "Q60 Convertible", None, [(2009, 2015)]),
    ("Nissan", "ARIYA", None, [(2023, 2025)]),
    ("Nissan", "LEAF", None, [(2011, 2017), (2018, 2025), (2026, 2027)]),
    ("Nissan", "Kicks Play", None, [(2018, 2025)]),
    ("Nissan", "Rogue Select", None, [(2008, 2015)]),
    ("Nissan", "Sentra", "Coupe", [(1991, 1994)]),
    ("Nissan", "Truck", None, [(1986, 1997)]),
    ("Isuzu", "Rodeo Sport", None, [(1998, 2003)]),

    # ---- Toyota / Honda ----------------------------------------------
    ("Toyota", "86", None, [(2013, 2020)]),
    ("Toyota", "GR Supra", None, [(2020, 2026)]),
    ("Toyota", "GR Corolla", None, [(2023, 2027)]),
    ("Toyota", "Prius v", None, [(2012, 2017)]),
    ("Toyota", "Prius Plug-in", None, [(2012, 2016)]),
    ("Toyota", "Crown Signia", None, [(2025, 2027)]),
    ("Toyota", "bZ Woodland", None, [(2026, 2027)]),
    ("Toyota", "Pickup", None, [(1989, 1995)]),
    ("Honda", "Civic CRX", None, [(1988, 1991)]),
    ("Honda", "Civic del Sol", None, [(1993, 1997)]),

    # ---- Mazda / Mitsubishi / Subaru ---------------------------------
    ("Mazda", "B-Series Pickup", None, [(1986, 1993), (1994, 1997), (1998, 2009)]),
    ("Mazda", "B-Series Truck", None, [(1998, 2009)]),
    ("Mazda", "Mazdaspeed 3", None, [(2004, 2009), (2010, 2013)]),
    ("Mazda", "Mazdaspeed 6", None, [(2003, 2008)]),
    ("Mazda", "Mazdaspeed MX-5 Miata", None, [(1999, 2005)]),
    ("Mazda", "Mazdaspeed Protege", None, [(1999, 2003)]),
    ("Mazda", "MX-6", None, [(1988, 1992)]),
    ("Mazda", "Protege5", None, [(1999, 2003)]),
    ("Mitsubishi", "3000GT", None, [(1991, 1999)]),
    ("Mitsubishi", "Eclipse", "Hatchback", [(2006, 2012)]),
    ("Mitsubishi", "Eclipse Spyder", "Convertible", [(2006, 2012)]),
    ("Subaru", "B9 Tribeca", None, [(2006, 2014)]),

    # ---- Volkswagen ---------------------------------------------------
    ("Volkswagen", "Cabriolet", None, [(1985, 1993)]),
    ("Volkswagen", "Cabrio", None, [(1995, 2002)]),
    ("Volkswagen", "Rabbit", None, [(2006, 2009)]),
    ("Volkswagen", "Golf SportWagen", None, [(2015, 2021)]),
    ("Volkswagen", "Jetta SportWagen", None, [(2010, 2014)]),
    ("Volkswagen", "e-Golf", None, [(2015, 2019)]),
    ("Volkswagen", "ID. Buzz", None, [(2025, 2027)]),
    ("Volkswagen", "Routan", None, [(2009, 2014)]),
    ("Volkswagen", "Vanagon", None, [(1980, 1991)]),

    # ---- Oldsmobile / Rivian -------------------------------------------
    ("Oldsmobile", "Eighty-Eight Royale", None, [(1986, 1991), (1992, 1999)]),
    ("Oldsmobile", "LSS", None, [(1992, 1999)]),
    ("Oldsmobile", "Regency", None, [(1992, 1999)]),
    ("Rivian", "R2", None, [(2027, 2027)]),
]

# Existing labels that research proved wrong (catch-alls from the legacy path)
RELABEL = [
    ("BMW", "6 Series", "Coupe", 1977, 1989, "1977-1989"),
]

# Rows whose car was never sold in the US in that model year, per source.
PHANTOM = [
    ("BMW", "3 Series", 1975, 1976, "US 3 Series begins MY1977 (E21)"),
    ("BMW", "5 Series", 1972, 1974, "US 5 Series begins MY1975 (E12)"),
    ("BMW", "6 Series", 1976, 1976, "US 6 Series begins MY1977 (E24)"),
    ("BMW", "7 Series", 1977, 1977, "US 7 Series begins MY1978 (E23)"),
    ("Jeep", "Grand Wagoneer", 1992, 1993, "SJ ended MY1991; MY1993 revival is a ZJ trim"),
    ("Ford", "Shelby GT500", 2015, 2019, "no GT500 offered MY2015-2019"),
    ("Pontiac", "Grand Am", 1984, 1984, "no MY1981-1984 Grand Am produced"),
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

    rows = [(f"{s}-{e}", mk, mo, bs, s, e)
            for mk, mo, bs, spans in R for s, e in spans]
    print(f"nameplates: {len(R)}    generation spans: {len(rows)}")

    cur.execute("select count(*) from vehicles where generation is null")
    before = cur.fetchone()[0]

    cur.execute("create temp table r4 (label text, make text, model text, "
                "body text, y0 int, y1 int)")
    psycopg2.extras.execute_values(
        cur, "insert into r4 (label, make, model, body, y0, y1) values %s", rows)

    match = ("r.make=v.make and r.model=v.model and v.year between r.y0 and r.y1 "
             "and (r.body is null or r.body=v.body_style)")
    cur.execute(f"""
        select count(*) filter (where r.label is not null),
               count(*) filter (where r.label is null)
        from vehicles v left join r4 r on {match}
        where v.generation is null and (v.make, v.model) in (select make, model from r4)""")
    hit, missed = cur.fetchone()
    print(f"would resolve: {hit}    would leave behind: {missed}")

    if missed:
        cur.execute(f"""
            select v.make, v.model, v.body_style, min(v.year), max(v.year), count(*)
            from vehicles v left join r4 r on {match}
            where v.generation is null and r.label is null
              and (v.make, v.model) in (select make, model from r4)
            group by 1,2,3 order by 6 desc""")
        print("\nleft behind (expect only phantom / XJS rows):")
        for a in cur.fetchall():
            print(f"   {a[5]:>4}  {a[0]} {a[1]} ({a[2]}) {a[3]}-{a[4]}")

    print("\nphantom rows (car not sold in the US that year):")
    for mk, mo, y0, y1, why in PHANTOM:
        cur.execute("""select count(*) from vehicles where make=%s and model=%s
                       and year between %s and %s""", (mk, mo, y0, y1))
        print(f"   {cur.fetchone()[0]:>4}  {mk} {mo} {y0}-{y1} — {why}")

    if not write:
        print("\n(dry run — pass --write to apply)")
        return

    cur.execute(f"""update vehicles v set generation = r.label from r4 r
                    where {match} and v.generation is null""")
    applied = cur.rowcount
    for mk, mo, bs, y0, y1, label in RELABEL:
        cur.execute("""update vehicles set generation=%s where make=%s and model=%s
                       and body_style=%s and year between %s and %s""",
                    (label, mk, mo, bs, y0, y1))
        applied += cur.rowcount
    conn.commit()

    cur.execute("select count(*) from vehicles where generation is null")
    after = cur.fetchone()[0]
    cur.execute("select count(*), count(generation) from vehicles")
    t, g = cur.fetchone()
    print(f"\nrows updated            : {applied}")
    print(f"rows without generation : {before} -> {after}")
    print(f"generation populated    : {g}/{t} ({100*g//t}%)")
    cur.execute("""select count(*) from vehicles where generation ~ '^[0-9]{4}-[0-9]{4}$'
       and (year < split_part(generation,'-',1)::int or year > split_part(generation,'-',2)::int)""")
    print(f"rows outside own label  : {cur.fetchone()[0]}")


if __name__ == "__main__":
    main()
