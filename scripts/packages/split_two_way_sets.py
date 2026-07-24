#!/usr/bin/env python3
"""Bring two_way + two_way_plus component sets up to the 3-way collection's
role-field format, so the PLP can display each set decomposed into its
tweeter and midbass columns (one object per column) while the set stays a
single collection item.

Founder rulings (2026-07-24) encoded here:
  - A set is a CURATION (we paired separately-sourced drivers) or a PRODUCT
    (a manufacturer kit bought as one unit). set_type records which.
  - Curation -> each role resolves to its standalone-collection slug (no
    asterisk in the PLP). Product -> role slug null, brand/model shown from
    the kit, PLP marks the cell with * = "part of a component set".
  - Curated drivers not yet in a standalone collection get added there, then
    referenced by slug. Two such tweeters added here: STEG Master Stroke
    MSS1M ($679, ResoNix) and Audiofrog GB15 ($569, Abt) — both confirmed
    sold separately (so, curation members, not kit-only).
  - "+ SEAS" naming was a typo; every SEAS = seas-prestige-27tffc-g-h1396.

Product-set role cells marked below with a trailing '*' in the model string
are DISPLAY PLACEHOLDERS (brand + kit/label, exact driver model not yet in
our data). Reported at the end for later refinement — never invented specs.

Idempotent. Read-then-write; run again safely.
"""
import os
import psycopg2

TABLES = ["two_way_component_sets", "two_way_plus_component_sets"]

NEW_TWEETERS = [
    dict(slug="steg-master-stroke-mss1m", brand="STEG", model="Master Stroke MSS1M",
         driver_size='1"', price=679.0, price_basis="listing", source="ResoNix listing 2026-07",
         tier="reference", description="1-inch magnesium-dome tweeter, neodymium motor. Sold separately; the top end of the STEG Master Stroke active set."),
    dict(slug="audiofrog-gb15", brand="Audiofrog", model="GB15",
         driver_size='1.5"', price=569.0, price_basis="listing", source="Abt listing 2026-07",
         tier="reference", sensitivity_db=90.0, rms_watts=100, impedance=4.0,
         freq_lo_hz=1300.0, freq_hi_hz=20000.0,
         description="1.5-inch (38 mm) sealed polyester-dome tweeter, neodymium motor. Low optimum crossover; designed to pair with the GB60. Sold separately."),
]

# set name -> classification + role fields.
# curation: (mb_slug, mb_brand, mb_model, mb_price, tw_slug, tw_brand, tw_model, tw_price)
# product : (None, mb_brand, mb_model, None, None, tw_brand, tw_model, None)  ('*' = placeholder model)
SEAS = ("seas-prestige-27tffc-g-h1396", "SEAS", "Prestige 27TFFC/G", 86.4)
SETS = {
    # ---- curations ----
    "Silver Flute W17RC38 + SEAS": ("curation", ("silver-flute-w17rc38", "Silver Flute", "W17RC38", 78.6), SEAS),
    "Dayton Audio RS180P-4 + SEAS": ("curation", ("dayton-audio-rs180p-4", "Dayton Audio", "RS180P-4", 140.0), SEAS),
    "HiVi E6.5 + SEAS": ("curation", ("hivi-e6-5", "HiVi", "E6.5", 183.86), SEAS),
    "Stereo Integrity M22 / TM65": ("curation", ("stereo-integrity-tm65-mkiv", "Stereo Integrity", "TM65 MkIV", 648.24), ("stereo-integrity-m22-tweeter", "Stereo Integrity", "M22 Tweeter", 160.0)),
    "Karma Allure 6 + SEAS": ("curation", ("karma-allure-6", "Karma", "Allure 6", 340.0), SEAS),
    "Scan-Speak Silver 16W/4531G06 + SEAS": ("curation", ("scanspeak-16w-4531g06", "Scan-Speak", "16W/4531G06", 706.6), SEAS),
    "STEG Master Stroke MSS6 + MSS1": ("curation", ("steg-master-stroke-mss6", "STEG", "Master Stroke MSS6", 999.0), ("steg-master-stroke-mss1m", "STEG", "Master Stroke MSS1M", 679.0)),
    "AudioFrog GB60/GB15": ("curation", ("audiofrog-gb60", "AudioFrog", "GB60", 1299.0), ("audiofrog-gb15", "Audiofrog", "GB15", 569.0)),
    # ---- product sets (slug null; '*' model = display placeholder) ----
    "Karma Aspect 6.1": ("product", (None, "Karma", "Aspect 6.5 woofer*", None), (None, "Karma", "Aspect tweeter*", None)),
    "Audible Physics Avatar 1.6": ("product", (None, "Audible Physics", "Avatar 6", None), (None, "Audible Physics", "Avatar tweeter*", None)),
    "Hertz CK 165 L": ("product", (None, "Hertz", "Cento C 165 L", None), (None, "Hertz", "Cento C 26", None)),
    "Stevens Audio SA6CS": ("product", (None, "Stevens Audio", "SA6 woofer*", None), (None, "Stevens Audio", "SA6 tweeter*", None)),
    "Focal Flax Evo PS165FXE": ("product", (None, "Focal", "Flax Evo woofer*", None), (None, "Focal", "Flax Evo TNF tweeter*", None)),
    "Audible Physics RAM 406": ("product", (None, "Audible Physics", "RAM406 Woofer", None), (None, "Audible Physics", "RAM tweeter*", None)),
    "Audible Physics Monitor 1": ("product", (None, "Audible Physics", "Monitor1 Midwoofer", None), (None, "Audible Physics", "Monitor tweeter*", None)),
    "Hertz Mille Legend MLK 165.3": ("product", (None, "Hertz", "Mille Legend ML 165.3", None), (None, "Hertz", "Mille Legend ML 28.3", None)),
    "Audison Voce II AVK 6.2A": ("product", (None, "Audison", "Voce AV 6.5", None), (None, "Audison", "Voce II tweeter*", None)),
    "STEG Master Stroke MSS6 + MSS1 ": ("_skip", None, None),  # guard against trailing-space dup
    "BLAM Live L165P": ("product", (None, "BLAM", "Live L165P woofer*", None), (None, "BLAM", "Live LT 25", None)),
    "Audible Physics 3DEV": ("product", (None, "Audible Physics", "3DEV woofer*", None), (None, "Audible Physics", "3DEV tweeter*", None)),
    "Focal K2 Evo ES165KX2E": ("product", (None, "Focal", "K2 Evo woofer*", None), (None, "Focal", "K2 Evo TNF tweeter*", None)),
    "AudioFrog GB60/GB15 ": ("_skip", None, None),
    "Hertz Mille Legend MLK 1650.3": ("product", (None, "Hertz", "Mille Legend ML 1650.3", None), (None, "Hertz", "Mille Legend ML 28.3", None)),
}


def db():
    env = {}
    for line in open(os.path.expanduser("~/.config/directus-render.env")):
        if "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return psycopg2.connect(env["DATABASE_URL"])


def main():
    conn = db(); cur = conn.cursor()

    # 1) add the two curated tweeters (idempotent)
    for t in NEW_TWEETERS:
        cur.execute("select 1 from tweeters where slug=%s", (t["slug"],))
        if cur.fetchone():
            print(f"tweeter exists: {t['slug']}")
            continue
        keys = list(t.keys()) + ["in_stock", "coming_soon"]
        vals = list(t.values()) + [True, False]
        cur.execute(f"insert into tweeters ({','.join(keys)}) values ({','.join(['%s']*len(keys))})", vals)
        print(f"added tweeter: {t['slug']} (${t['price']})")

    # 2) add role fields + set_type to both set collections (idempotent)
    for tbl in TABLES:
        cur.execute(f"""alter table {tbl}
            add column if not exists set_type varchar(16),
            add column if not exists midbass_slug varchar(96),
            add column if not exists midbass_brand varchar(96),
            add column if not exists midbass_model varchar(96),
            add column if not exists midbass_price real,
            add column if not exists tweeter_slug varchar(96),
            add column if not exists tweeter_brand varchar(96),
            add column if not exists tweeter_model varchar(96),
            add column if not exists tweeter_price real""")

    # 3) populate every set by name in both tables
    updated, placeholders, unmatched = 0, [], []
    for tbl in TABLES:
        cur.execute(f"select name from {tbl}")
        names = [r[0] for r in cur.fetchall()]
        for name in names:
            key = name if name in SETS else name.strip()
            entry = SETS.get(key)
            if not entry or entry[0] == "_skip":
                unmatched.append(f"{tbl}: {name!r}")
                continue
            set_type, mb, tw = entry
            cur.execute(f"""update {tbl} set set_type=%s,
                midbass_slug=%s, midbass_brand=%s, midbass_model=%s, midbass_price=%s,
                tweeter_slug=%s, tweeter_brand=%s, tweeter_model=%s, tweeter_price=%s
                where name=%s""",
                (set_type, mb[0], mb[1], mb[2], mb[3], tw[0], tw[1], tw[2], tw[3], name))
            updated += cur.rowcount
            if tbl == TABLES[0]:
                for role, cell in (("midbass", mb), ("tweeter", tw)):
                    if cell[2] and cell[2].endswith("*"):
                        placeholders.append(f"{name} · {role}: {cell[1]} {cell[2]}")

    conn.commit()
    print(f"\nupdated {updated} rows across {len(TABLES)} tables")
    n_cur = sum(1 for v in SETS.values() if v[0] == "curation")
    n_prod = sum(1 for v in SETS.values() if v[0] == "product")
    print(f"classification: {n_cur} curations, {n_prod} products")
    if unmatched:
        print("UNMATCHED (check names):")
        for u in unmatched: print("  ", u)
    if placeholders:
        print(f"\nDISPLAY PLACEHOLDERS to refine ({len(placeholders)} cells — real driver model not yet in data):")
        for p in placeholders: print("  ", p)


if __name__ == "__main__":
    main()
