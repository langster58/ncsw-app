#!/usr/bin/env python3
"""Rebuild boot_families against the real generation boundaries.

The old table keyed families on whatever generation label happened to exist,
falling back to `yr:<model year>` when there was none — so 2,288 of its 3,804
rows were single-model-year fragments of a car that has ONE cargo area. A
measurement taken on a 2019 RAV4 did not reach the 2020 RAV4 even though they
are the same body. That is what made the dimension hunt look bottomless.

Now that vehicles.generation is 99.9% populated, a family is exactly
(make, model, body_style, generation) — one physical cargo area, one row.

Everything already learned is carried forward. A measurement, or a searched-
and-came-up-empty verdict, is expensive; it is remapped onto the new family
its vehicles belong to. Where an old record's vehicles split across more than
one new family the record is NOT applied (it would be asserting a measurement
for a body it was never taken on) and is reported instead.

Usage: rebuild-boot-families.py [--write]      (default: dry run)
"""
import os
import sys
from collections import defaultdict

import psycopg2
import psycopg2.extras

MEASURED = ("boot_width_in", "boot_depth_in", "boot_height_in",
            # provenance travels WITH the numbers. A measurement without its
            # source url and quote is unauditable, which makes it worthless.
            "dims_source_url", "dims_quote", "dims_confidence",
            "dims_config", "dims_taper_note", "dims_checked_at")
# statuses that represent knowledge worth preserving (pending means "untouched")
KNOWN = ("partial", "agent_snippet", "review", "no_data")


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

    # ---- the new family set, straight off vehicles.generation ----------
    cur.execute("""
        select make, model, body_style, generation,
               split_part(generation,'-',1)::int, split_part(generation,'-',2)::int,
               array_agg(vehicle_id::text order by vehicle_id), count(*)
        from vehicles
        where generation ~ '^[0-9]{4}-[0-9]{4}$'
        group by 1,2,3,4""")
    fams = cur.fetchall()
    key_of = {}
    for i, f in enumerate(fams):
        for vid in f[6]:
            key_of[vid] = i

    cur.execute("select count(*) from vehicles where generation is null")
    orphans = cur.fetchone()[0]
    print(f"new families          : {len(fams)}   (was 3804, of which 2288 were yr: fragments)")
    print(f"vehicles covered      : {sum(f[7] for f in fams)}")
    print(f"vehicles with no family (generation still null): {orphans}")

    # ---- carry forward what has already been learned --------------------
    cur.execute(f"""select id, make, model, body_style, gen_key, vehicle_ids,
                           dims_status, {', '.join(MEASURED)}
                    from boot_families where dims_status = any(%s)""", (list(KNOWN),))
    old = cur.fetchall()
    carried, split, lost = {}, [], []
    for rec in old:
        oid, mk, mo, bs, gk, vids, status = rec[:7]
        vals = rec[7:]
        has_nums = any(v is not None for v in vals)
        hits = defaultdict(int)
        for v in (vids or []):
            if v in key_of:
                hits[key_of[v]] += 1
        if not hits:
            lost.append((mk, mo, bs, gk, status))
            continue
        total = sum(hits.values())
        t, n = max(hits.items(), key=lambda kv: kv[1])
        if len(hits) > 1:
            # The generation boundary moved under this record. Its vehicles now
            # belong to more than one body. Attach it to the family holding the
            # clear majority, but a measurement can no longer be trusted as-is:
            # downgrade it to 'review' so it gets re-checked rather than used.
            if n / total < 0.6:
                split.append((mk, mo, bs, gk, status, len(hits)))
                continue
            split.append((mk, mo, bs, gk, status, len(hits)))
            status = "review" if has_nums else status
        if t not in carried or (has_nums and not any(v is not None for v in carried[t][1])):
            carried[t] = (status, vals)

    with_nums = sum(1 for s, v in carried.values() if any(x is not None for x in v))
    print(f"\nprior records worth keeping : {len(old)}  ({', '.join(KNOWN)})")
    print(f"  carried onto a new family : {len(carried)}  ({with_nums} carry actual measurements)")
    print(f"  boundary moved under them : {len(split)}  (majority-attached, measurements -> review)")
    print(f"  no vehicle mapped, dropped: {len(lost)}")
    for a in split[:10]:
        print(f"     split: {a[0]} {a[1]} ({a[2]}) {a[3]} [{a[4]}] -> {a[5]} families")
    for a in lost[:10]:
        print(f"     lost : {a[0]} {a[1]} ({a[2]}) {a[3]} [{a[4]}]")

    complete = sum(1 for s, v in carried.values() if all(v[i] is not None for i in range(3)))
    print(f"\nafter rebuild: {complete} families with complete W/D/H, "
          f"{len(fams) - len(carried)} untouched (pending)")

    if not write:
        print("\n(dry run — pass --write to apply)")
        return

    cur.execute("drop table if exists boot_families_backup")
    cur.execute("create table boot_families_backup as table boot_families")
    cur.execute("truncate boot_families")
    rows = []
    for i, f in enumerate(fams):
        mk, mo, bs, gen, y0, y1, vids, _n = f
        status, vals = carried.get(i, ("pending", (None,) * len(MEASURED)))
        rows.append((mk, mo, bs, gen, y0, y1, vids, status, *vals))
    psycopg2.extras.execute_values(cur, f"""
        insert into boot_families
          (make, model, body_style, gen_key, year_start, year_end, vehicle_ids,
           dims_status, {', '.join(MEASURED)}) values %s""", rows)
    conn.commit()

    cur.execute("select count(*) from boot_families")
    print(f"\nboot_families rows: {cur.fetchone()[0]}  (backup in boot_families_backup)")
    cur.execute("select dims_status, count(*) from boot_families group by 1 order by 2 desc")
    for s, n in cur.fetchall():
        print(f"   {s:<16}{n}")
    cur.execute("""select count(*) from boot_families where boot_width_in is not null
                   and boot_depth_in is not null and boot_height_in is not null""")
    print(f"   complete W/D/H  {cur.fetchone()[0]}")


if __name__ == "__main__":
    main()
