#!/usr/bin/env python3
"""NCSW package generator — Round 1 of the two-round curation model.

Assembles the curated offering from the LIVE database only (never CSVs):
  front stages   = the curated set collections (score, price, topology)
  sub stages     = the 50 curated sub picks x best sealed AND best ported
                   build per envelope class (canonical instrument math)
  front subs     = scored front_subs bench ("+" topologies)
  amps           = cheapest that covers the need (mono by watts, multichannel
                   by channels) — cheap-watts north star
  DSP            = by channel need: Zapco HB 46 II at entry, DSP MINI MK2
                   standard, DSP.3S when a topology needs > 6 outputs
  pricing        = live component prices + sub_enclosures materials/labor +
                   labor_items + the standard materials kit (all cascade;
                   reprice_packages.py stays valid on the output rows)

Combination rule (balanced-to-front-stage): a combo is offered only when the
sub stage KEEPS UP with the front stage — L_sub >= L_front - BALANCE_GRACE_DB.
There is no upper cut: a sub stage far above the front stage is the
ground-pound lane and is legitimate business (alignment ruling 2026-07-17).

One currency: L = min over the 25-63 Hz margins vs the house curve (band
ruling 2026-07-19), computed by scripts/scoring/instrument.py for both
alignments. Front-stage L = score + 6 (stereo pair) - shape(fx).

SKUs are deterministic (facets + hash of the component slugs) so re-running
against an updated catalog keeps SKUs stable for unchanged combos: ncsw_pick
flags survive regeneration; orphaned picks are reported, never dropped
silently.

Round 2 (ncsw_pick tagging) is the founder's; this script never sets picks
on new rows.

Usage:
  python3 generate_packages.py              # report only (default)
  python3 generate_packages.py --write      # upsert generator rows
  python3 generate_packages.py --write --replace-interim
                                            # also remove the v16 interim seed
"""
import hashlib
import json
import math
import os
import re
import sys

import psycopg2
import psycopg2.extras

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "scoring"))
import instrument as I

GEN_TAG = "generator-v1"
INTERIM_TAG = "v16-interim-2026-07"

# ---- judgment defaults (founder-reviewable; each is a deliberate rule) ------
BALANCE_GRACE_DB = 3.0          # sub may trail the front stage by at most this
CLASS_CAPS_FT3 = {"truck": 1.0, "trunk": 2.0, "cargo": 4.0}
CLASS_PORT_RUN_IN = {"trunk": 20.0, "cargo": 28.0, "truck": None}  # None = no ported (behind-seat fab; later)
FRONT_CHANNELS = {"2-way": 4, "wideband": 4, "2-way+": 5, "wideband+": 5, "3-way+": 7}
FX_EDGE = {"2-way": 80, "wideband": 80, "2-way+": 100, "wideband+": 100, "3-way+": 100}
SUB_COUNT = 1                   # multi-driver builds need their own ruling (not modeled yet)
# standard install materials kit (same as the interim seed; unit costs cascade)
MATERIALS_KIT = [("mat-4awg-ofc-power", 20), ("mat-16awg-ofc-speaker", 60),
                 ("mat-d4s-rca-4ch-20ft", 1), ("mat-anl-fuse-holder", 1),
                 ("mat-distribution-block", 1)]

# curated sealed sub picks (Data/sub-picks-2026-07-13.md — founder pass)
PICKED_SUBS = [
    "crescendo-audio-forte-v2-12", "sky-high-car-audio-fxb-12", "fi-car-audio-xv4-12",
    "stereo-integrity-sql-12", "sundown-audio-sa-classic-12", "fi-car-audio-hc-12",
    "sky-high-car-audio-fmx-12", "fi-car-audio-hc-plus-12", "one-audio-rsq3-12",
    "fi-car-audio-mt-12", "sundown-audio-xv4-12", "audiofrog-gb12d2",
    "crescendo-audio-forte-v2-10", "crescendo-audio-cartel-10", "dc-audio-m3-level-3-10",
    "sundown-audio-sa-10-v-3", "sundown-audio-xv4-10", "sundown-audio-m-10",
    "acoustic-elegance-sbp10", "jl-audio-10w7ae", "sundown-audio-ns-10",
    "audiofrog-gb10d2", "jl-audio-10w6v3",
    "skar-audio-svr-15", "trinity-audio-tas-e15", "sky-high-car-audio-fxb-15",
    "crescendo-audio-cartel-15", "skar-audio-vxf-15", "fi-car-audio-xv4-15",
    "sundown-audio-sa-classic-15", "fi-car-audio-hc-15", "sky-high-car-audio-bmx-15",
    "adire-audio-brahma-15", "sundown-audio-u-15", "adire-audio-kali-15",
    "sky-high-car-audio-fxxl-15", "sky-high-car-audio-fmx-15", "fi-car-audio-mt-15",
    "ct-sounds-tropo-18", "dc-audio-m3-level-4-18", "dc-audio-m3-level-3-18",
    "sky-high-car-audio-bmx-18", "crescendo-audio-nendo-18", "fi-car-audio-hc-18",
    "crescendo-audio-cartel-18", "sundown-audio-m-18", "sky-high-car-audio-fmx-18",
    "adire-audio-kali-18", "fi-car-audio-neo-4-7-18", "stereo-integrity-hst-18",
]

# front-stage collections: (table, price column, topology label)
SET_COLLECTIONS = [
    ("two_way_component_sets", "price", "2-way"),
    ("wideband_component_sets", "total_price", "wideband"),
    ("two_way_plus_component_sets", "price", "2-way+"),
    ("three_way_plus_component_sets", "total_price", "3-way+"),
    ("wideband_plus_component_sets", "total_price", "wideband+"),
]

TOPO_CODE = {"2-way": "2W", "wideband": "WB", "2-way+": "2WP", "3-way+": "3WP", "wideband+": "WBP"}
CLASS_CODE = {"truck": "TRK", "trunk": "TRN", "cargo": "CGO"}
TIER_ORDER = {"entry": 0, "mid": 1, "performance": 2, "reference": 3}


def db():
    env = {}
    for line in open(os.path.expanduser("~/.config/directus-render.env")):
        if "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return psycopg2.connect(env["DATABASE_URL"])


def norm_tier(t):
    t = (t or "").strip().lower()
    if t in TIER_ORDER:
        return t
    if "entry" in t:
        return "entry"
    if "ref" in t or "premium" in t:
        return "reference"
    if "perf" in t or "upper" in t:
        return "performance"
    return "mid"


# --------------------------------------------------------------- sub stages

def sealed_stage(row, cap_ft3):
    """Best sealed box within the class cap. Returns (L, watts, vb_ft3)."""
    xm = row.get("effective_xmax_mm") or row["xmax_mm"]
    floor = I._VB_FLOOR_EXC.get(row["slug"], I._VB_FLOOR_FT3.get(str(row["driver_size"]).rstrip(".0"), 0.05))
    if floor > cap_ft3:
        return None
    cap_l = min(cap_ft3 * I.FT3_L, 4 * row["vas_l"])
    grid = [v for v in (0.05 * 1.13 ** i for i in range(60))
            if floor <= v and v * I.FT3_L <= cap_l] or [floor]

    def L_of(vb_ft3):
        m = I._sub_margins(row["fs_hz"], row["qts"], row["vas_l"], row["sd_cm2"],
                           row["rms_watts"], row["sensitivity_db_1w_1m"], vb_ft3 * I.FT3_L, xm)
        return min(m[1:])   # 25-63 band ruling

    vb = max(grid, key=L_of)
    L = L_of(vb)
    # watts to reach L at the hardest band point (capped at RMS)
    fc = row["fs_hz"] * math.sqrt(1 + row["vas_l"] / (vb * I.FT3_L))
    qtc = row["qts"] * math.sqrt(1 + row["vas_l"] / (vb * I.FT3_L))
    W = 0.0
    for f in I._BAND[1:]:
        hdb = 20 * math.log10(I.H(f, fc, qtc))
        W = max(W, 10 ** ((L + I.shape(f) - I.gain(f) - row["sensitivity_db_1w_1m"] - hdb) / 10))
    return dict(L=round(L, 1), watts=min(W, row["rms_watts"]), vb_ft3=round(vb, 2), spec=None)


def ported_stage(row, cap_ft3, run_in):
    """Best ported build within cap + port run. Returns (L, watts, spec)."""
    if run_in is None:
        return None
    xm = row.get("effective_xmax_mm") or row["xmax_mm"]
    comp, spec = I.ported_best(row, cap_ft3 * I.FT3_L, run_in * 2.54)
    if spec is None:
        return None
    m = I.ported_margins(row, spec["vb_l"], spec["fb_hz"], xm)
    L = min(m[1:])
    alpha = row["vas_l"] / spec["vb_l"]
    W = 0.0
    for f in I._BAND[1:]:
        G, _X = I.vented_tf(f, row["fs_hz"], spec["fb_hz"], alpha, row["qts"])
        ss = I.subsonic_bw2(f, spec["fb_hz"])
        gdb = 20 * math.log10(max(G * ss, 1e-9))
        W = max(W, 10 ** ((L + I.shape(f) - I.gain(f) - row["sensitivity_db_1w_1m"] - gdb) / 10))
    return dict(L=round(L, 1), watts=min(W, row["rms_watts"]), vb_ft3=round(spec["vb_l"] / I.FT3_L, 2), spec=spec)


# --------------------------------------------------------------------- main

def main():
    write = "--write" in sys.argv
    replace_interim = "--replace-interim" in sys.argv
    conn = db()
    cur = conn.cursor()

    # --- components -----------------------------------------------------------
    cur.execute("""select slug, brand, model, driver_size, price, effective_xmax_mm, xmax_mm,
                          fs_hz, qts, vas_l, sd_cm2, rms_watts, sensitivity_db_1w_1m
                   from subwoofers where slug = any(%s)""", (PICKED_SUBS,))
    cols = [d[0] for d in cur.description]
    subs = []
    for r in cur.fetchall():
        d = dict(zip(cols, r))
        if all(d.get(k) is not None for k in ("fs_hz", "qts", "vas_l", "sd_cm2", "rms_watts", "sensitivity_db_1w_1m", "price")):
            subs.append({k: (float(v) if hasattr(v, "__float__") else v) for k, v in d.items()})

    cur.execute("select slug, price, watts_rms from mono_amps where price is not null and watts_rms is not null order by price")
    monos = [dict(zip(("slug", "price", "watts"), map(lambda v: float(v) if hasattr(v, "__float__") else v, r))) for r in cur.fetchall()]

    cur.execute("select slug, price, channels from multichannel_amps where price is not null and channels is not null order by price")
    multis = [dict(zip(("slug", "price", "channels"), (r[0], float(r[1]), int(r[2])))) for r in cur.fetchall()]

    cur.execute("select slug, price from dsp_processors")
    dsp_price = {s: float(p) for s, p in cur.fetchall()}

    cur.execute("""select slug, brand, model, price, clean_spl_63, clean_spl_100 from front_subs
                   where price is not null and clean_spl_63 is not null and clean_spl_100 is not null""")
    front_subs = [dict(slug=r[0], name=f"{r[1]} {r[2]}", price=float(r[3]),
                       L=round(min(float(r[4]) - I.shape(63), float(r[5]) - I.shape(100)), 1))
                  for r in cur.fetchall()]
    front_subs.sort(key=lambda f: f["price"])

    cur.execute("select slug, type, size, driver_count, coalesce(materials_cost,0), coalesce(labor_hours,0), coalesce(labor_rate,100) from sub_enclosures where slug not like 'zen-%'")
    enc_rows = {}
    for slug, etype, size, count, mat, hrs, rate in cur.fetchall():
        enc_rows[(etype, str(size), int(count), slug.endswith("-prefab"))] = dict(
            slug=slug, mat=float(mat), labor=float(hrs) * float(rate))

    def enclosure(alignment, size):
        for prefab in ((True, False) if alignment == "sealed" else (False,)):
            e = enc_rows.get((alignment, str(size), SUB_COUNT, prefab))
            if e:
                return e
        return None

    cur.execute("select total_cost from labor_items where slug='labor-base-install'")
    base_labor = float(cur.fetchone()[0])
    cur.execute("select total_cost from labor_items where slug='labor-extra-amp-install'")
    extra_amp_labor = float(cur.fetchone()[0])
    kit_lines, kit_total = [], 0.0
    for slug, qty in MATERIALS_KIT:
        cur.execute("select line_item, unit_cost from materials where slug=%s", (slug,))
        li, uc = cur.fetchone()
        kit_lines.append({"collection": "materials", "slug": slug, "name": li, "qty": qty, "unit": float(uc)})
        kit_total += float(uc) * qty

    # --- front stages ----------------------------------------------------------
    stages = []   # dict(collection, slug, name, price, tier, topology, L)
    for table, pcol, topo in SET_COLLECTIONS:
        cur.execute("select column_name from information_schema.columns where table_name=%s", (table,))
        tcols = {r[0] for r in cur.fetchall()}
        tier_col = "tier" if "tier" in tcols else "NULL"
        name_col = "name" if "name" in tcols else "slug"
        cur.execute(f"select slug, {name_col}, {pcol}, score, {tier_col} from {table} where {pcol} is not null and score is not null")
        for slug, name, price, score, tier in cur.fetchall():
            stages.append(dict(collection=table, slug=slug, name=name, price=float(price),
                               tier=norm_tier(tier), topology=topo,
                               L=round(float(score) + 6.0 - I.shape(FX_EDGE[topo]), 1)))

    # --- sub stage candidates per class ---------------------------------------
    def cheapest_mono(watts):
        for a in monos:
            if a["watts"] >= watts:
                return a
        return monos[-1]

    def cheapest_multi(channels):
        elig = [a for a in multis if a["channels"] >= min(channels, 6)]
        return elig[0] if elig else None

    def front_sub_for(set_L):
        for f in front_subs:                       # cheapest that keeps up
            if f["L"] >= set_L - BALANCE_GRACE_DB:
                return f
        return max(front_subs, key=lambda f: f["L"]) if front_subs else None

    rows = []
    stats = {}
    for cls, cap in CLASS_CAPS_FT3.items():
        sub_stages = []
        for s in subs:
            for align, st in (("sealed", sealed_stage(s, cap)),
                              ("ported", ported_stage(s, cap, CLASS_PORT_RUN_IN[cls]))):
                if not st:
                    continue
                enc = enclosure(align, str(s["driver_size"]).rstrip(".0").rstrip("."))
                if not enc:
                    continue
                amp = cheapest_mono(st["watts"])
                sub_stages.append(dict(sub=s, align=align, st=st, enc=enc, amp=amp,
                                       price=s["price"] * SUB_COUNT + enc["mat"] + amp["price"]))

        n_combos = n_kept = 0
        for fs_ in stages:
            fch = FRONT_CHANNELS[fs_["topology"]]
            multi = cheapest_multi(fch)
            if not multi:
                continue
            fsub = front_sub_for(fs_["L"]) if fs_["topology"].endswith("+") else None
            if fs_["topology"].endswith("+") and not fsub:
                continue
            L_front = min(fs_["L"], fsub["L"]) if fsub else fs_["L"]
            outputs_needed = fch + 1
            if fs_["tier"] == "entry" and outputs_needed <= 6:
                dsp_slug = "zapco-hb-46-ii-4a"
            elif outputs_needed <= 6:
                dsp_slug = "helix-dsp-mini-mk2"
            else:
                dsp_slug = "helix-dsp-3s"
            dspp = dsp_price[dsp_slug]

            for ss in sub_stages:
                n_combos += 1
                if ss["st"]["L"] < L_front - BALANCE_GRACE_DB:
                    continue                      # front stage would be strangled
                n_kept += 1
                s = ss["sub"]
                size = str(s["driver_size"]).rstrip(".0").rstrip(".")
                parts = (ss["price"] + fs_["price"] + (fsub["price"] if fsub else 0.0)
                         + multi["price"] + dspp)
                n_amps = 2                        # mono + multichannel
                labor = base_labor + extra_amp_labor * (n_amps - 1) + ss["enc"]["labor"]
                installed = parts + labor + kit_total
                comp_slugs = sorted([s["slug"], ss["enc"]["slug"], ss["amp"]["slug"],
                                     fs_["slug"], multi["slug"], dsp_slug] + ([fsub["slug"]] if fsub else []))
                h = hashlib.sha1("|".join(comp_slugs).encode()).hexdigest()[:6].upper()
                sku = f"{CLASS_CODE[cls]}-{TOPO_CODE[fs_['topology']]}-{ss['align'][0].upper()}-1X{size}-{h}"
                tier_label = fs_["tier"].capitalize()
                display = f"{tier_label} {fs_['topology'].replace('-', '-').title().replace('Way', 'Way')} · 1×{size} {ss['align'].capitalize()}"
                display = f"{tier_label} {fs_['topology']} · 1×{size} {ss['align'].capitalize()}"
                summary = (f"{s['brand']} {s['model']} in a {ss['align']} enclosure ({ss['st']['vb_ft3']} ft³) · "
                           f"{fs_['name']} front stage" + (f" · {fsub['name']} front sub" if fsub else "") +
                           f" · {'Zapco HB 46 II' if dsp_slug.startswith('zapco') else 'Helix ' + ('DSP.3S' if dsp_slug.endswith('3s') else 'DSP MINI MK2')}")
                breakdown = {
                    "components": [
                        {"collection": "subwoofers", "slug": s["slug"], "name": f"{s['brand']} {s['model']}", "qty": SUB_COUNT, "unit": s["price"]},
                        {"collection": "sub_enclosures", "slug": ss["enc"]["slug"], "qty": 1, "unit": ss["enc"]["mat"]},
                        {"collection": "mono_amps", "slug": ss["amp"]["slug"], "qty": 1, "unit": ss["amp"]["price"]},
                        {"collection": fs_["collection"], "slug": fs_["slug"], "name": fs_["name"], "qty": 1, "unit": fs_["price"]},
                        {"collection": "multichannel_amps", "slug": multi["slug"], "qty": 1, "unit": multi["price"]},
                        {"collection": "dsp_processors", "slug": dsp_slug, "qty": 1, "unit": dspp},
                    ] + ([{"collection": "front_subs", "slug": fsub["slug"], "name": fsub["name"], "qty": 1, "unit": fsub["price"]}] if fsub else []),
                    "labor": {"base": base_labor, "extra_amps": extra_amp_labor * (n_amps - 1), "enclosure": ss["enc"]["labor"]},
                    "materials_kit": kit_lines,
                    "materials_total": round(kit_total, 2),
                    "enclosure_spec": ss["st"]["spec"],
                    "ceilings": {"sub": ss["st"]["L"], "front": fs_["L"], **({"front_sub": fsub["L"]} if fsub else {})},
                    "priced_at": "generator",
                }
                rows.append(dict(
                    sku=sku, vehicle_category=cls,
                    sub_id=s["slug"], sub_count=SUB_COUNT, sub_enclosure_id=ss["enc"]["slug"],
                    mono_amp_id=ss["amp"]["slug"], multichannel_amp_id=multi["slug"],
                    dsp_id=dsp_slug, component_set_id=fs_["slug"], set_collection=fs_["collection"],
                    front_sub_id=fsub["slug"] if fsub else None,
                    display_name=display, topology=fs_["topology"], bass_alignment=ss["align"],
                    tier=fs_["tier"], sub_size=size, ceiling_l=min(ss["st"]["L"], L_front),
                    depth_20hz_db=(ss["st"]["spec"] or {}).get("depth_20hz_db"),
                    summary=summary, price_total=round(parts, 2), price_installed=round(installed, 2),
                    price_breakdown=json.dumps(breakdown), seed_source=GEN_TAG,
                ))
        stats[cls] = dict(sub_stages=len(sub_stages), combos=n_combos, kept=n_kept)

    # --- report ---------------------------------------------------------------
    print(f"generated {len(rows)} package rows")
    for cls, st in stats.items():
        print(f"  {cls}: {st['sub_stages']} sub-stage builds, {st['combos']} combos -> {st['kept']} kept "
              f"({st['combos'] - st['kept']} cut by balance rule)")
    from collections import Counter
    for facet in ("topology", "bass_alignment", "tier"):
        print(f"  by {facet}:", dict(Counter(r[facet] for r in rows)))
    prices = sorted(r["price_installed"] for r in rows)
    if prices:
        print(f"  installed price range: ${prices[0]:,.0f} – ${prices[-1]:,.0f} (median ${prices[len(prices)//2]:,.0f})")
    print("\nsample rows:")
    for r in rows[:6]:
        print(f"  {r['sku']}  {r['display_name']}  L={r['ceiling_l']}  ${r['price_installed']:,.2f}")

    if not write:
        print("\n(report only — run with --write to upsert)")
        return

    # --- write -----------------------------------------------------------------
    cur.execute("""alter table packages
        add column if not exists tier varchar(24),
        add column if not exists sub_size varchar(8),
        add column if not exists ceiling_l numeric(6,1),
        add column if not exists depth_20hz_db numeric(6,1)""")
    cur.execute("select sku, ncsw_pick from packages where seed_source=%s and ncsw_pick", (GEN_TAG,))
    old_picks = {r[0] for r in cur.fetchall()}
    new_skus = {r["sku"] for r in rows}
    orphaned = old_picks - new_skus
    for r in rows:
        r["ncsw_pick"] = r["sku"] in old_picks
    cur.execute("delete from packages where seed_source=%s", (GEN_TAG,))
    if replace_interim:
        cur.execute("delete from packages where seed_source=%s", (INTERIM_TAG,))
        print(f"removed interim seed rows ({cur.rowcount})")
    cols = ["sku", "vehicle_category", "sub_id", "sub_count", "sub_enclosure_id", "mono_amp_id",
            "multichannel_amp_id", "dsp_id", "component_set_id", "set_collection", "front_sub_id",
            "display_name", "topology", "bass_alignment", "tier", "sub_size", "ceiling_l",
            "depth_20hz_db", "summary", "price_total", "price_installed", "price_breakdown",
            "seed_source", "ncsw_pick"]
    psycopg2.extras.execute_values(
        cur,
        f"insert into packages (id, {','.join(cols)}) values %s",
        [tuple([__import__('uuid').uuid4().hex] + [r.get(c) for c in cols]) for r in rows],
        template="(%s::uuid," + ",".join(["%s"] * len(cols)) + ")")
    conn.commit()
    cur.execute("select count(*) from packages")
    print(f"packages table now: {cur.fetchone()[0]} rows")
    if orphaned:
        print(f"!! ORPHANED PICKS (combo no longer generated): {sorted(orphaned)}")


if __name__ == "__main__":
    main()
