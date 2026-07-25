#!/usr/bin/env python3
"""Correlate the purchased EU vehicle database to our US naming, solely to
import GENERATION BOUNDARIES (start/end production years per model+body).

Founder rulings (2026-07-25):
  - Correlation exists only to get generation boundaries right; we are not
    importing their taxonomy.
  - "Restyling" is a facelift, NOT a new unibody -> merged into its parent
    generation, so a generation span runs from the base gen's start to the
    last restyling's end.

Read-only. Writes a review file; nothing touches the DB until approved.
Usage: map-generation-source.py [--out PATH]
"""
import csv
import difflib
import json
import os
import re
import sys

SRC = "/Volumes/SSD 1TB/Database/auto_databases_one_July_2026.csv"
OUT = "/Volumes/SSD 1TB/NCSW Application/Data/generation-mapping-review.json"

# their Body_Type -> our body_style (only what we carry; None = we don't stock it)
BODY_MAP = {
    "Sedan": "Sedan", "Sedan Hardtop": "Sedan", "Limousine": "Sedan", "Phaeton": "Sedan",
    "Sedan 2-Door": "Coupe", "Coupe": "Coupe", "Coupe Hardtop": "Coupe",
    "Fastback": "Coupe", "Targa": "Coupe",
    "Cabrio": "Convertible", "Roadster": "Convertible", "Speedster": "Convertible",
    "Allroad Open": "Convertible", "Lando": "Convertible",
    "Wagon 5-Door": "Wagon", "Wagon 3-Door": "Wagon", "Wagon": "Wagon",
    "Phaeton Wagon": "Wagon",
    "Hatchback 5-Door": "Hatchback", "Hatchback 3-Door": "Hatchback",
    "Hatchback 4-Door": "Hatchback", "Liftback": "Hatchback",
    "Allroad 5-Door": "SUV / Crossover", "Allroad 3-Door": "SUV / Crossover",
    "Minivan": "Minivan", "Compact Van": "Minivan", "Microvan": "Minivan", "Van": "Minivan",
    "Pickup Double Cab": "Truck", "Pickup Single Cab": "Truck",
    "Pickup Extended Cab": "Truck", "Pickup": "Truck",
}

# deterministic name rules applied to OUR model name before matching theirs
def rule_variants(model: str):
    """Yield candidate spellings of our model name in their vocabulary."""
    v = {model}
    # Mercedes: "C-Class" -> "C-Klass"; also bare form "CLA-Class" -> "CLA"
    if model.endswith("-Class"):
        stem = model[:-len("-Class")]
        v.add(stem + "-Klass")
        v.add(stem)
    # BMW: "3 Series" -> "3er"; "3 Series Gran Turismo" -> "3er Gran Turismo"
    m = re.match(r"^(\d)\s+Series(.*)$", model)
    if m:
        v.add(f"{m.group(1)}er{m.group(2)}")
        v.add(f"{m.group(1)}er")
    # trailing US trim/variant qualifiers that aren't separate models to them
    for suf in (" Limited", " Hybrid", " EV", " LD", " Classic", " Electric Drive",
                " Plug-in Hybrid", " Prime", " Hybrid Max"):
        if model.endswith(suf):
            v.add(model[: -len(suf)])
    # size/cab qualifiers on trucks
    v.add(re.sub(r"\s+(1500|2500|3500|150|250|350)\b.*$", "", model).strip())
    return {x for x in v if x}


def norm(s):
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def base_generation(gen: str) -> str:
    """Strip 'Restyling' / 'Restyling II' — a facelift is the same unibody."""
    return re.sub(r"\s*Restyling(\s+[IVX]+)?\s*$", "", gen or "").strip()


def main():
    out_path = OUT
    if "--out" in sys.argv:
        out_path = sys.argv[sys.argv.index("--out") + 1]

    rows = list(csv.DictReader(open(SRC, encoding="utf-8", errors="replace")))

    # their catalog: make -> {model -> {our_body -> {base_gen -> [years]}}}
    cat = {}
    models_by_make = {}
    for r in rows:
        ob = BODY_MAP.get(r["Body_Type"])
        if not ob:
            continue
        try:
            y0, y1 = int(r["Start_Year_Production"]), int(r["End_Year_Production"])
        except (ValueError, TypeError):
            continue
        g = base_generation(r["Generation"])
        if not g:
            continue
        d = cat.setdefault(r["Make"], {}).setdefault(r["Model"], {}).setdefault(ob, {})
        span = d.setdefault(g, [y0, y1])
        span[0] = min(span[0], y0)          # merge restyling into parent span
        span[1] = max(span[1], y1)
        models_by_make.setdefault(r["Make"], set()).add(r["Model"])

    import psycopg2
    env = {}
    for line in open(os.path.expanduser("~/.config/directus-render.env")):
        if "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    conn = psycopg2.connect(env["DATABASE_URL"])
    cur = conn.cursor()
    cur.execute("""select distinct make, model, body_style from vehicles
                   where year >= 2010 order by 1,2,3""")
    ours = cur.fetchall()

    exact, ruled, fuzzy, unmatched = [], [], [], []
    for mk, mo, bs in ours:
        their_models = models_by_make.get(mk, set())
        hit, how = None, None
        for cand in rule_variants(mo):
            if cand in their_models:
                hit, how = cand, ("exact" if cand == mo else "rule")
                break
        if not hit:
            nm = {norm(t): t for t in their_models}
            close = difflib.get_close_matches(norm(mo), list(nm.keys()), n=1, cutoff=0.86)
            if close:
                hit, how = nm[close[0]], "fuzzy"
        if not hit:
            unmatched.append({"make": mk, "model": mo, "body": bs})
            continue
        gens = cat.get(mk, {}).get(hit, {}).get(bs, {})
        rec = {"make": mk, "our_model": mo, "their_model": hit, "body": bs,
               "generations": [{"gen": g, "start": s, "end": e}
                               for g, (s, e) in sorted(gens.items(), key=lambda x: x[1][0])]}
        if not gens:
            rec["note"] = "model matched but no generations for this body style"
        {"exact": exact, "rule": ruled, "fuzzy": fuzzy}[how].append(rec)

    def withgens(lst):
        return [r for r in lst if r.get("generations")]

    print(f"our 2010+ make/model/body rows: {len(ours)}")
    print(f"  exact model match : {len(exact):>4}   with generations: {len(withgens(exact))}")
    print(f"  matched by rule   : {len(ruled):>4}   with generations: {len(withgens(ruled))}")
    print(f"  matched by fuzzy  : {len(fuzzy):>4}   with generations: {len(withgens(fuzzy))}  <-- REVIEW")
    print(f"  unmatched         : {len(unmatched):>4}")
    total_gen = len(withgens(exact)) + len(withgens(ruled)) + len(withgens(fuzzy))
    print(f"\n  => {total_gen} model/body combos would receive generation boundaries")

    print("\nFUZZY matches (need your eyes — these are guesses):")
    for r in fuzzy[:30]:
        print(f"   {r['make']:<14} ours={r['our_model']:<28} -> theirs={r['their_model']:<28} {r['body']}  gens={len(r['generations'])}")

    print("\nUNMATCHED sample (no generation source):")
    for r in unmatched[:20]:
        print(f"   {r['make']:<14} {r['model']} · {r['body']}")

    json.dump({"exact": exact, "rule": ruled, "fuzzy": fuzzy, "unmatched": unmatched},
              open(out_path, "w"), indent=1)
    print(f"\nfull proposal -> {out_path}")


if __name__ == "__main__":
    main()
