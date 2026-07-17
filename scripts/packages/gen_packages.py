#!/usr/bin/env python3
"""NCSW package frontier — balanced-to-front-stage pairing engine.

Port of the SSD package_pairing_prototype.py (founder-ratified 2026-07-05) onto the
CURATED collections built 2026-07-13/14, plus the wideband topologies that postdate it.

Principle: a package's clean ceiling is the MINIMUM stage ceiling measured against the
house curve. The optimal package at any spend = the combination maximizing that minimum.
Sweeping budget yields a Pareto frontier whose steps are the natural rungs — rungs are
OUTPUTS, not inputs.

One currency, L = max in-seat midrange reference level the stage supports
(house target at f = L + shape(f); shape/gain/H from scoring/instrument.py):

  sub stage (20-63):   L = min over band [min(mech, thermal+box) + cabin gain - shape(f)]
                       in the driver's best box within the body category's space cap.
                       Price = driver + enclosure floor + cheapest mono amp >= watts needed.
  front sub (63-100):  L = min(clean_63 - shape(63), clean_100 - shape(100)).
                       Price = driver only (treatment $0 — founder ruling 2026-07-05).
  front stage:         L = collection score + 6 (stereo pair) - shape(fx),
                       fx = 80 (no front sub) / 100 (front sub). Upper drivers never
                       limit (session ruling 2026-07-13) — stored score IS the edge.

Topologies: 2-way, wideband (fx=80); 2-way+, 3-way+, wideband+ (fx=100, need front sub).

Scope of this run (deliberate):
  - Sub candidates = the 50 curated SEALED picks (Data/sub-picks-2026-07-13.md).
    Ported (no instrument yet) and IB (picks not yet curated) join later.
  - 3-way NO-sub excluded: three_way_component_sets still holds placeholders.
  - front_subs = full scored bench (uncurated — 10 rows with clean_spl).
  - Excluded constants (identical across combos): DSP, multichannel amp, electrical
    tiers, base install. 1m-vs-in-seat calibration constant provisional; shifts all
    packages equally, does not affect pairing or step structure.

READ-ONLY against the DB. Writes the report to the staging Data folder.
"""
import os, sys, math
import psycopg2

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "scoring"))
import instrument as I

OUT = "/Volumes/SSD 1TB/NCSW Application/Data/package-frontier-2026-07-17.md"

# ---- body categories -> sealed box cap (matches packages schema) ----
CATEGORIES = [("truck", 1.0), ("trunk", 2.0), ("cargo", 4.0)]

# ---- enclosure floor pricing (founder constants 2026-07-04) ----
SEALED_PREFAB_FLOOR = [(0.40, 140), (0.60, 155), (1.00, 170), (1.75, 245), (3.00, 275), (4.00, 320)]

def sealed_floor_price(vb_ft3):
    for vol, price in SEALED_PREFAB_FLOOR:
        if vol >= vb_ft3 - 1e-9:
            return price
    return None

# ---- curated sealed sub picks (Data/sub-picks-2026-07-13.md — Brett, one review pass) ----
PICKED_SEALED_SUBS = [
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

def db():
    env = {}
    with open(os.path.expanduser("~/.config/directus-render.env")) as f:
        for line in f:
            if "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    return psycopg2.connect(env["DATABASE_URL"])

# ---------------------------------------------------------------- stage ceilings

def sub_ceiling(row, vb_l, xm):
    """(L, watts_needed). Sealed box of vb_l liters."""
    fs, qts, vas = row["fs_hz"], row["qts"], row["vas_l"]
    sd, rms, sens = row["sd_cm2"], row["rms_watts"], row["sensitivity_db_1w_1m"]
    ratio = math.sqrt(1 + vas / vb_l)
    fc, qtc = fs * ratio, qts * ratio
    vd = sd * 1e-4 * xm * 1e-3
    L, W = 1e9, 0.0
    for f in I._BAND:
        hdb = 20 * math.log10(I.H(f, fc, qtc))
        clean = min(108.4 + 20 * math.log10(f * f * vd),
                    sens + 10 * math.log10(rms) + hdb) + I.gain(f)
        L = min(L, clean - I.shape(f))
    for f in I._BAND:
        hdb = 20 * math.log10(I.H(f, fc, qtc))
        W = max(W, 10 ** ((L + I.shape(f) - I.gain(f) - sens - hdb) / 10))
    return L, min(W, rms)   # displacement-bound below RMS

def build_sub_stage(cur, cap_ft3):
    cur.execute("""select slug, brand, model, driver_size, price, effective_xmax_mm, xmax_mm,
                          fs_hz, qts, vas_l, sd_cm2, rms_watts, sensitivity_db_1w_1m
                   from subwoofers where slug = any(%s)""", (PICKED_SEALED_SUBS,))
    names = [d[0] for d in cur.description]
    subs = [dict(zip(names, r)) for r in cur.fetchall()]
    cur.execute("select slug, price, watts_rms from mono_amps where price is not null and watts_rms is not null order by price")
    amps = [dict(zip(("slug", "price", "watts"), r)) for r in cur.fetchall()]

    def cheapest_amp(watts):
        for a in amps:
            if a["watts"] >= watts:
                return a
        return amps[-1]

    out = []
    for r in subs:
        need = ("fs_hz", "qts", "vas_l", "sd_cm2", "rms_watts", "sensitivity_db_1w_1m", "price")
        if not all(r.get(k) for k in need):
            continue
        r = {k: (float(v) if isinstance(v, (int, float)) or hasattr(v, "__float__") else v) for k, v in r.items()}
        xm = r.get("effective_xmax_mm") or r["xmax_mm"]
        floor = I._VB_FLOOR_EXC.get(r["slug"], I._VB_FLOOR_FT3.get(str(r["driver_size"]).rstrip(".0"), 0.05))
        if floor > cap_ft3:
            continue
        cap_l = min(cap_ft3 * I.FT3_L, 4 * r["vas_l"])
        grid = [v for v in (0.05 * 1.13 ** i for i in range(60))
                if floor <= v and v * I.FT3_L <= cap_l] or [floor]
        best_vb = max(grid, key=lambda v: sub_ceiling(r, v * I.FT3_L, xm)[0])
        L, W = sub_ceiling(r, best_vb * I.FT3_L, xm)
        encl = sealed_floor_price(best_vb)
        if encl is None:
            continue
        amp = cheapest_amp(W)
        out.append(dict(kind="sub",
                        name=f"{r['brand']} {r['model']} ({best_vb:.2f}ft3 sealed, {amp['slug']})",
                        price=r["price"] + encl + float(amp["price"]), L=round(L, 1)))
    return out

def build_front_sub_stage(cur):
    cur.execute("""select brand, model, price, clean_spl_63, clean_spl_100 from front_subs
                   where price is not null and clean_spl_63 is not null and clean_spl_100 is not null""")
    out = []
    for b, m, p, c63, c100 in cur.fetchall():
        L = min(float(c63) - I.shape(63), float(c100) - I.shape(100))
        out.append(dict(kind="fs", name=f"{b} {m}", price=float(p), L=round(L, 1)))
    return out

# front-stage collections: (table, price column, crossover edge Hz, topology label, needs front sub)
FRONT_STAGES = [
    ("two_way_component_sets",        "price",       80,  "2-way",     False),
    ("wideband_component_sets",       "total_price", 80,  "wideband",  False),
    ("two_way_plus_component_sets",   "price",       100, "2-way+",    True),
    ("three_way_plus_component_sets", "total_price", 100, "3-way+",    True),
    ("wideband_plus_component_sets",  "total_price", 100, "wideband+", True),
]

def build_front_stages(cur):
    stages = {}
    for table, pcol, fx, label, needs_fs in FRONT_STAGES:
        cur.execute(f"select column_name from information_schema.columns where table_name=%s", (table,))
        cols = {r[0] for r in cur.fetchall()}
        dash = "dash_size_class" if "dash_size_class" in cols else "NULL"
        cur.execute(f"""select name, {pcol}, score, {dash} from {table}
                        where {pcol} is not null and score is not null""")
        rows = []
        for name, price, score, dc in cur.fetchall():
            L = float(score) + 6.0 - I.shape(fx)   # +6 dB stereo pair
            nm = name + (f" [dash {dc}]" if dc else "")
            rows.append(dict(kind="cs", name=nm, price=float(price), L=round(L, 1)))
        stages[label] = dict(rows=rows, needs_fs=needs_fs)
    return stages

# ---------------------------------------------------------------- frontier

def pareto(items):
    out = []
    for x in sorted(items, key=lambda x: (x["price"], -x["L"])):
        if not out or x["L"] > out[-1]["L"] + 1e-9:
            out.append(x)
    return out

def assemble(sub_f, fs_f, stages):
    pkgs = []
    for s in sub_f:
        for label, st in stages.items():
            if st["needs_fs"]:
                for f in fs_f:
                    for c in st["front"]:
                        pkgs.append(dict(topology=label,
                                         price=s["price"] + f["price"] + c["price"],
                                         L=min(s["L"], f["L"], c["L"]),
                                         parts=[s["name"], f["name"], c["name"]],
                                         lims=(s["L"], f["L"], c["L"])))
            else:
                for c in st["front"]:
                    pkgs.append(dict(topology=label, price=s["price"] + c["price"],
                                     L=min(s["L"], c["L"]),
                                     parts=[s["name"], c["name"]], lims=(s["L"], c["L"])))
    return pkgs

def main():
    conn = db(); cur = conn.cursor()
    fs_stage = build_front_sub_stage(cur)
    stages = build_front_stages(cur)
    fs_f = pareto(fs_stage)
    for label, st in stages.items():
        st["front"] = pareto(st["rows"])

    lines = ["# NCSW package frontier — balanced-to-front-stage (run 2026-07-17)", "",
             "System ceiling L = max in-seat midrange reference level every stage holds against",
             "the house curve. Each row is a NATURAL RUNG (Pareto: no cheaper combo reaches its",
             "ceiling, none at its price beats it). Bottleneck stage marked *.",
             "Sub candidates = curated sealed picks only; ported + IB join later. 3-way no-sub",
             "pending (placeholders). Excludes DSP/multich amp/electrical/base install.", ""]
    stage_note = (f"stage frontiers: front-sub {len(fs_f)}/{len(fs_stage)}; " +
                  "; ".join(f"{k} {len(v['front'])}/{len(v['rows'])}" for k, v in stages.items()))
    print(stage_note)
    lines += [f"_{stage_note}_", ""]

    for cat, cap in CATEGORIES:
        sub_stage = build_sub_stage(cur, cap)
        sub_f = pareto(sub_stage)
        pkgs = assemble(sub_f, fs_f, stages)
        front = pareto(pkgs)
        print(f"\n== {cat} (cap {cap} ft3): sub frontier {len(sub_f)}/{len(sub_stage)}, "
              f"{len(pkgs)} combos -> {len(front)} rungs ==")
        lines += [f"## {cat} (sealed cap {cap} ft3) — sub frontier {len(sub_f)}/{len(sub_stage)}, "
                  f"{len(front)} natural rungs", "",
                  "| $ (bass+front) | ceiling L | topology | build |", "|---|---|---|---|"]
        for p in front:
            starred = [f"**{nm}***" if abs(lim - p["L"]) < 0.05 else nm
                       for nm, lim in zip(p["parts"], p["lims"])]
            lines.append(f"| ${p['price']:,.0f} | {p['L']:.1f} | {p['topology']} | {' + '.join(starred)} |")
            print(f"  ${p['price']:>6,.0f}  L={p['L']:>6.1f}  {p['topology']:<9}  " + " + ".join(p["parts"]))
        lines.append("")

    with open(OUT, "w") as f:
        f.write("\n".join(lines))
    print(f"\nwrote {OUT}")

if __name__ == "__main__":
    main()
