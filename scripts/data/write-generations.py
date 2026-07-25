#!/usr/bin/env python3
"""Write generation boundaries (Year-Year) to vehicles.generation.

Source: purchased EU vehicle DB, correlated by map-generation-source.py.

Founder rulings (2026-07-25):
  - "Restyling" is a facelift, not a new unibody -> merged into its parent.
  - Only CLEAR matches (exact + rule) are written; fuzzy/unmatched -> round 2.
  - Direct-sales EV makers (Tesla et al.) do NOT follow model-year convention
    (Model 3 produced Jul 2017 = MY2017), so the +1 shift is wrong for them.
    Deferred to round 2 rather than written incorrectly.
  - Catch-all generation labels are auto-rejected: any span > 15 years, and
    any label identical to the model name (e.g. "Corvette" 1954-2013,
    "3er" 2001-2007) which sit alongside the real chassis-coded generations.

Model-year correction: the source records PRODUCTION start; a generation goes
into production in calendar year N and sells as US model year N+1. Verified
against 8 mainstream boundaries (Civic, CR-V, F-150, C-Class) — all -1, and
+1 reproduces the published US years exactly. Does not hold for Tesla (above).

Overlap: production spans overlap (outgoing gen still built as the new one
launches); each span is truncated at the next generation's start.

Usage: write-generations.py [--write]     (default: dry run)
"""
import json
import os
import re
import sys

import psycopg2
import psycopg2.extras

REVIEW = "/Volumes/SSD 1TB/NCSW Application/Data/generation-mapping-review.json"
MY_SHIFT = 1
MAX_SPAN_YEARS = 15
# direct-sales EV makers: production year == model year, +1 shift invalid
DEFER_MAKES = {"Tesla", "Rivian", "Lucid", "Polestar"}


def db():
    env = {}
    for line in open(os.path.expanduser("~/.config/directus-render.env")):
        if "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return psycopg2.connect(env["DATABASE_URL"])


# Non-US market variants carry their own (different) year spans and must not
# contribute to US boundaries. Russian transliterations appear in the source.
FOREIGN_MARKET = re.compile(
    r"Chinese market|Kitayskiy\s*Rynok|Rynok\s*Kitaya|\(China\)|DzhiYu", re.I)


def base_generation(gen: str) -> str:
    """Normalize a generation label to its unibody identity.

    - strips 'Restyling' ANYWHERE (also the source's 'restayling' spelling)
    - drops the parenthetical chassis code down to its numeric core, so
      powertrain-prefixed variants of one generation collapse together
      (Camry 'VIII (XV70)' + 'VIII (HV70)' -> one generation) [founder ruling]
    """
    g = re.sub(r"\s*Rest[ay]{2}ling(\s+[IVX]+)?", "", gen or "", flags=re.I)
    # chassis code -> numeric core: (XV70)/(HV70) -> (70); keeps distinct
    # generations apart because their numbers differ (W205 vs W206 -> 205/206)
    g = re.sub(r"\(([A-Za-z]*)(\d+)[^)]*\)", r"(\2)", g)
    return re.sub(r"\s+", " ", g).strip()


def merge_and_clean(generations, model):
    """Re-merge on the fixed base label, drop catch-alls, truncate overlaps."""
    merged = {}
    for g in generations:
        if FOREIGN_MARKET.search(g["gen"] or ""):
            continue                      # non-US market variant — different car
        b = base_generation(g["gen"])
        if not b:
            continue
        span = merged.setdefault(b, [g["start"], g["end"]])
        span[0] = min(span[0], g["start"])
        span[1] = max(span[1], g["end"])
    cleaned, rejected = {}, []
    for b, (s, e) in merged.items():
        if e - s > MAX_SPAN_YEARS:
            rejected.append((b, s, e, f"span {e-s+1}y > {MAX_SPAN_YEARS}"))
        # A label equal to the model name is a catch-all ONLY when real
        # chassis-coded generations sit beside it (Corvette: 'Corvette' +
        # S7 + S8). For a single-generation model it is the legitimate label.
        elif b.lower() == (model or "").lower() and len(merged) > 1:
            rejected.append((b, s, e, "label == model name, alongside real generations"))
        else:
            cleaned[b] = (s, e)
    gs = sorted(({"gen": b, "start": s, "end": e} for b, (s, e) in cleaned.items()),
                key=lambda g: (g["start"], g["end"]))
    out = []
    for i, g in enumerate(gs):
        s, e = g["start"], g["end"]
        if i + 1 < len(gs):
            # Make spans contiguous: this both truncates overlap (production of
            # the outgoing gen continues past the new launch) and closes gaps
            # (a car in production always belongs to some generation).
            e = gs[i + 1]["start"] - 1
        if e >= s:
            out.append({"gen": g["gen"], "start": s + MY_SHIFT, "end": e + MY_SHIFT})
    return out, rejected


def main():
    write = "--write" in sys.argv
    data = json.load(open(REVIEW))
    clear = [r for r in (data["exact"] + data["rule"]) if r.get("generations")]

    rows, deferred, all_rejected = [], [], []
    for rec in clear:
        if rec["make"] in DEFER_MAKES:
            deferred.append(rec)
            continue
        spans, rejected = merge_and_clean(rec["generations"], rec["their_model"])
        all_rejected += [(rec["make"], rec["our_model"]) + r for r in rejected]
        for s in spans:
            rows.append((f"{s['start']}-{s['end']}", rec["make"], rec["our_model"],
                         rec["body"], s["start"], s["end"]))

    print(f"clear-matched combos      : {len(clear)}")
    print(f"deferred to round 2 (EV)  : {len(deferred)}  {sorted({r['make'] for r in deferred})}")
    print(f"catch-all labels rejected : {len(all_rejected)}")
    for mk, mo, b, s, e, why in all_rejected[:8]:
        print(f"    {mk} {mo}: '{b}' {s}-{e}  ({why})")
    print(f"generation spans to write : {len(rows)}")

    for probe in [("Toyota", "Prius", "Hatchback"), ("Mercedes-Benz", "C-Class", "Sedan"),
                  ("Chevrolet", "Corvette", "Coupe")]:
        got = [r for r in rows if (r[1], r[2], r[3]) == probe]
        print(f"\n  {probe[0]} {probe[1]} ({probe[2]}):")
        for r in sorted(got, key=lambda x: x[4]):
            if r[5] >= 2005:
                print(f"     {r[0]}")

    if not write:
        print("\n(dry run — pass --write to apply)")
        return

    conn = db()
    cur = conn.cursor()
    cur.execute("create temp table gen_import (label text, make text, model text, "
                "body text, y0 int, y1 int) on commit drop")
    psycopg2.extras.execute_values(
        cur, "insert into gen_import (label, make, model, body, y0, y1) values %s", rows)
    # Founder ruling: the purchased dataset is the authority — overwrite legacy
    # values rather than preserving them (they are the SAME source vocabulary,
    # stored as raw labels without the restyling merge).
    cur.execute("""
        update vehicles v set generation = g.label
        from gen_import g
        where v.make = g.make and v.model = g.model and v.body_style = g.body
          and v.year between g.y0 and g.y1""")
    applied = cur.rowcount

    # Normalize whatever legacy labels remain (models we could not match, so the
    # purchased spans are unavailable): collapse Restyling into the parent and
    # derive Year-Year from the years actually observed in our own data. Those
    # years are already US model years, so no shift applies here.
    cur.execute("""select make, model, body_style, generation, min(year), max(year)
                   from vehicles
                   where generation is not null and generation !~ '^[0-9]{4}-[0-9]{4}$'
                   group by 1,2,3,4""")
    legacy = cur.fetchall()
    spans = {}
    for mk, mo, bs, lab, y0, y1 in legacy:
        base = base_generation(lab)
        k = (mk, mo, bs, base)
        cur_span = spans.setdefault(k, [y0, y1])
        cur_span[0] = min(cur_span[0], y0)
        cur_span[1] = max(cur_span[1], y1)
    norm_rows = [(f"{s}-{e}", mk, mo, bs, lab)
                 for (mk, mo, bs, base), (s, e) in spans.items()
                 for lab in {l for m2, mo2, b2, l, _, _ in legacy
                             if (m2, mo2, b2) == (mk, mo, bs) and base_generation(l) == base}]
    cur.execute("create temp table gen_norm (label text, make text, model text, "
                "body text, oldlab text) on commit drop")
    psycopg2.extras.execute_values(
        cur, "insert into gen_norm (label, make, model, body, oldlab) values %s", norm_rows)
    cur.execute("""
        update vehicles v set generation = n.label
        from gen_norm n
        where v.make = n.make and v.model = n.model and v.body_style = n.body
          and v.generation = n.oldlab""")
    normalized = cur.rowcount
    conn.commit()

    print(f"\nrows written from purchased spans : {applied}")
    print(f"legacy labels normalized to Year-Year: {normalized}")
    cur.execute("select count(*), count(generation) from vehicles")
    t, g = cur.fetchone()
    print(f"vehicles.generation populated: {g}/{t} ({100*g//t}%)")
    cur.execute("""select count(*) from vehicles
                   where generation is not null and generation !~ '^[0-9]{4}-[0-9]{4}$'""")
    print(f"rows still in a non-Year-Year format: {cur.fetchone()[0]}")


if __name__ == "__main__":
    main()
