#!/usr/bin/env python3
"""Round 2: generation boundaries for models the purchased dataset could not
match, determined by research (agent web search, evidence-backed, 2026-07-25).

Founder rulings applied:
  - ALPINA is a BMW trim -> inherits the BMW model's unibody.
  - Mini Hardtop 2 Door / 4 Door researched specifically: CONFIRMED different
    unibodies (F55 wheelbase 2567mm vs F56 2495mm, separate body tooling).
  - Transit Connect Passenger Wagon: commercial van -> deleted, not imported.
  - Grand Wagoneer is a distinct model, not a Wagoneer trim.
  - HD trucks (2500/3500) set aside for now.

`separate_unibody` is recorded because it governs the LATER dimension work: a
long-wheelbase or different-shell variant cannot reuse its parent's cargo
measurements even when the generation years are identical.

Usage: round2-generations.py [--write]
"""
import os
import sys

import psycopg2
import psycopg2.extras

# make, model, body, [(start,end)...], separate_unibody, parent
R = [
 ("BMW","ActiveHybrid 5","Sedan",[(2012,2016)],False,"5 Series"),
 ("BMW","ActiveHybrid X6","SUV / Crossover",[(2010,2011)],False,"X6"),
 ("BMW","ALPINA XB7","SUV / Crossover",[(2021,2022),(2023,2026)],False,"X7"),
 ("BMW","ALPINA B6 Gran Coupe","Sedan",[(2015,2019)],False,"6 Series Gran Coupe"),
 ("BMW","ALPINA B7","Sedan",[(2007,2008),(2011,2015),(2017,2022)],False,"7 Series"),
 ("BMW","ALPINA B8 Gran Coupe","Sedan",[(2021,2026)],False,"8 Series Gran Coupe"),
 ("BMW","M8 Gran Coupe","Sedan",[(2020,2025)],False,"8 Series Gran Coupe"),
 ("Chrysler","Town and Country","Minivan",[(1991,1995),(1996,2000),(2001,2007),(2008,2016)],False,None),
 ("GMC","Yukon XL","SUV / Crossover",[(2000,2006),(2007,2014),(2015,2020),(2021,2027)],True,"Yukon"),
 ("Infiniti","QX","SUV / Crossover",[(2004,2010),(2011,2024),(2025,2027)],False,None),
 ("Jeep","Grand Wagoneer L","SUV / Crossover",[(2023,2027)],True,"Grand Wagoneer"),
 ("Jeep","Grand Wagoneer","SUV / Crossover",[(2022,2027)],False,None),
 ("Jeep","Wagoneer L","SUV / Crossover",[(2023,2027)],True,"Wagoneer"),
 ("Jeep","Grand Cherokee L","SUV / Crossover",[(2021,2027)],True,"Grand Cherokee"),
 ("Jeep","Liberty","SUV / Crossover",[(2002,2007),(2008,2012)],False,None),
 ("Jeep","Patriot","SUV / Crossover",[(2007,2017)],False,None),
 ("Mazda","MX-5 Miata","Convertible",[(1990,1997),(1999,2005),(2006,2015),(2016,2027)],False,None),
 ("Mazda","MX-5 Miata RF","Convertible",[(2017,2027)],False,"MX-5 Miata"),
 ("Mercedes-Benz","SLS AMG GT","Convertible",[(2013,2015)],False,"SLS AMG"),
 ("Mercedes-Benz","SLS AMG GT","Coupe",[(2013,2015)],False,"SLS AMG"),
 ("Mercedes-Benz","SLS AMG GT Final Edition","Convertible",[(2014,2014)],False,"SLS AMG GT"),
 ("Mercedes-Benz","SLS AMG GT Final Edition","Coupe",[(2015,2015)],False,"SLS AMG GT"),
 ("Mercedes-Benz","B-Class Electric Drive","Hatchback",[(2014,2017)],False,"B-Class"),
 ("Mercedes-Benz","GLC-Class Coupe","SUV / Crossover",[(2017,2023),(2024,2027)],True,"GLC-Class"),
 ("Mercedes-Benz","GLE-Class Coupe","SUV / Crossover",[(2016,2019),(2020,2027)],True,"GLE-Class"),
 ("Mercedes-Benz","Maybach","Sedan",[(2016,2020),(2021,2027)],True,"S-Class"),
 ("Mini","Cooper Clubman","Hatchback",[(2008,2014),(2015,2024)],True,"Hardtop 2 Door"),
 ("Mini","Hardtop 2 Door","Hatchback",[(2002,2006),(2007,2013),(2014,2024),(2025,2027)],False,None),
 ("Mini","Hardtop 4 Door","Hatchback",[(2015,2024),(2025,2027)],True,"Hardtop 2 Door"),
 ("Mini","Cooper Countryman","Wagon",[(2011,2016),(2017,2023),(2025,2027)],True,None),
 ("Mini","Cooper Coupe","Hatchback",[(2012,2015)],True,"Hardtop 2 Door"),
 ("Mini","Cooper Paceman","Hatchback",[(2013,2016)],True,"Cooper Countryman"),
 ("Mini","Cooper Roadster","Convertible",[(2012,2015)],True,"Hardtop 2 Door"),
 ("Mini","Convertible","Convertible",[(2005,2008),(2009,2015),(2016,2027)],True,"Hardtop 2 Door"),
 ("Volkswagen","CC","Sedan",[(2009,2017)],True,"Passat"),
 ("Volkswagen","Golf Alltrack","Wagon",[(2017,2019)],False,"Golf SportWagen"),
 ("Volkswagen","New Beetle","Hatchback",[(1998,2010)],False,None),
 ("Volkswagen","New Beetle","Convertible",[(2003,2010)],True,"New Beetle"),
 ("Audi","A6 Sportback e-tron","Hatchback",[(2025,2027)],False,None),
 ("Audi","S6 Sportback e-tron","Hatchback",[(2025,2027)],False,"A6 Sportback e-tron"),
 ("Audi","A3 Sportback e-tron","Hatchback",[(2016,2018)],False,"A3"),
 ("Audi","allroad","Wagon",[(2013,2016),(2017,2027)],False,"A4 Avant"),
 ("Hyundai","Santa Fe XL","SUV / Crossover",[(2013,2019)],True,"Santa Fe"),
 ("Hyundai","Santa Fe Sport","SUV / Crossover",[(2013,2018)],True,"Santa Fe"),
 ("Hyundai","Elantra Touring","Hatchback",[(2009,2012)],True,None),
 ("Hyundai","Elantra GT","Hatchback",[(2013,2017),(2018,2020)],True,None),
 ("Subaru","XV Crosstrek","SUV / Crossover",[(2013,2017)],False,None),
 ("Dodge","Grand Caravan","Minivan",[(2001,2007),(2008,2020)],False,None),
 ("Dodge","Ram Pickup 1500","Truck",[(1994,2001),(2002,2008),(2009,2018),(2019,2027)],False,None),
 ("Honda","Accord Crosstour","Hatchback",[(2010,2015)],False,None),
 ("Jaguar","XJ-Series","Sedan",[(1998,2002),(2003,2009),(2010,2019)],False,None),
 ("Jaguar","XK-Series","Coupe",[(1997,2006),(2007,2015)],False,None),
 ("Jaguar","XK-Series","Convertible",[(1997,2006),(2007,2015)],False,None),
 ("Cadillac","CT6-V","Sedan",[(2019,2020)],False,"CT6"),
 ("Cadillac","Escalade EXT","Truck",[(2002,2006),(2007,2013)],True,"Escalade"),
 ("Cadillac","Escalade ESV","SUV / Crossover",[(2003,2006),(2007,2014),(2015,2020),(2021,2027)],True,"Escalade"),
 ("Lincoln","Navigator L","SUV / Crossover",[(2007,2017),(2018,2027)],True,"Navigator"),
 ("Ford","F-150 Lightning","Truck",[(2022,2025)],False,"F-150"),
 ("Hummer","H3T","Truck",[(2009,2010)],True,"H3"),
 ("Chevrolet","Black Diamond Avalanche","Truck",[(2013,2013)],False,"Avalanche"),
 ("GMC","HUMMER EV SUV","SUV / Crossover",[(2024,2027)],True,"HUMMER EV Pickup"),
 ("Nissan","Murano CrossCabriolet","SUV / Crossover",[(2011,2014)],True,"Murano"),
 ("Land Rover","LR2","SUV / Crossover",[(2008,2015)],False,None),
 ("Land Rover","LR4","SUV / Crossover",[(2010,2016)],False,None),
 ("Porsche","718 Boxster","Convertible",[(2017,2025)],False,None),
 ("Porsche","718 Cayman","Coupe",[(2017,2025)],False,None),
]


def main():
    write = "--write" in sys.argv
    env = {}
    for line in open(os.path.expanduser("~/.config/directus-render.env")):
        if "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    conn = psycopg2.connect(env["DATABASE_URL"])
    cur = conn.cursor()

    rows = [(f"{s}-{e}", mk, mo, bs, s, e)
            for mk, mo, bs, spans, _u, _p in R for s, e in spans]
    sep = [(mk, mo, bs) for mk, mo, bs, _s, u, _p in R if u]
    print(f"models researched      : {len(R)}")
    print(f"generation spans       : {len(rows)}")
    print(f"separate-unibody flags : {len(sep)}  (cannot reuse parent cargo dims)")

    cur.execute("""select count(*) from vehicles where generation is null and year>=2010""")
    before = cur.fetchone()[0]
    if not write:
        print(f"\n2010+ rows without generation now: {before}")
        print("(dry run — pass --write)")
        return

    cur.execute("create temp table r2 (label text, make text, model text, body text, "
                "y0 int, y1 int) on commit drop")
    psycopg2.extras.execute_values(
        cur, "insert into r2 (label, make, model, body, y0, y1) values %s", rows)
    cur.execute("""update vehicles v set generation = r.label from r2 r
                   where v.make=r.make and v.model=r.model and v.body_style=r.body
                     and v.year between r.y0 and r.y1""")
    applied = cur.rowcount
    # founder ruling: commercial van, remove from the catalog
    cur.execute("delete from vehicles where model = 'Transit Connect Passenger Wagon'")
    deleted = cur.rowcount
    conn.commit()

    cur.execute("""select count(*) from vehicles where generation is null and year>=2010""")
    after = cur.fetchone()[0]
    cur.execute("select count(*), count(generation) from vehicles")
    t, g = cur.fetchone()
    print(f"\nrows updated                     : {applied}")
    print(f"Transit Connect rows deleted     : {deleted}")
    print(f"2010+ without generation: {before} -> {after}")
    print(f"vehicles.generation populated    : {g}/{t} ({100*g//t}%)")


if __name__ == "__main__":
    main()
