#!/opt/homebrew/bin/python3
# RETIRED 2026-09-20. The tables this script used (truck_wedge_envelopes, vehicle_wedge_envelopes, truck_wedge_fit,
# truck_sub_picks, the August staging tables) were deleted in the Postgres / Directus reconciliation: they were stale
# (most of their vehicle ids no longer exist) and duplicated what the vehicles rows carry now (substage_width_in /
# substage_depth_in / substage_height_in / substage_cuft, rear_seat_lift_in) and what the subwoofers rows carry
# (truck_sealed_pick / truck_ported_pick + counts). Backups: research/rollback/reconcile-2026-09-20/.
# Do not run. The replacement reads vehicles and subwoofers directly with research/scripts/vehicles/fitrules.py.
raise SystemExit("retired 2026-09-20 - see the note at the top of this file")
"""Truck wedge fit + ladder (2026-08-22).

Builds `truck_wedge_fit`: one row per (wedge_key, sub_id, alignment, sub_count) that physically
fits, with `shown` = survives the per-truck ladder rule ruled by Brett 2026-08-22:
  PER INSTALL TYPE (size x N x alignment) among the rungs that fit this envelope, sorted by the
  VALUE build's INSTALLED price (what the customer sees; falls back to drivers + enclosure before
  the category is written), a rung is shown if no cheaper rung of the same install type has >=
  impact; plus the best rung of each badge brand (Sundown, Fi, SSA, Orion, Sky High, Crescendo)
  in that install type. Nothing is pruned ACROSS install types (Brett 2026-08-22: "I would like
  to see options for install types"). Impact/cost are rung-level (driver x N at the config's
  median-truck volume, + $300 sealed / $450 ported), so this is a pure function of the envelope.
Designations (`truck_sub_picks`) are NEVER modified here; a rung shown in no truck simply has no
shown rows. Run with --apply to write; default dry-run.

2026-08-24 — DEPTH GATE. Until now a rung passed on flange width and volume alone, so the
ladders showed drivers that cannot physically mount. A rung now also has to clear the
envelope's `mount_depth_effective_in` (the envelope key carries the cap; see
truck_wedge_envelopes.sql). A driver with no `mounting_depth_in` on file FAILS the gate
rather than passing silently — unknown is not the same as fits."""
import sys, math, json, psycopg2
sys.path.insert(0, "/Volumes/SSD 1TB/NCSW/app/scripts/scoring")
import instrument as I
DSN = "postgresql://directus_db_4b8w_user@dpg-d86h4augvqtc73dmq7j0-a.ohio-postgres.render.com:5432/directus_db_4b8w?sslmode=require"
FL = {"8": 9.1, "10": 10.9, "12": 12.8}; DISP = {"8": .05, "10": .08, "12": .12}
ENC = {"sealed": 300.0, "ported": 450.0}; FB = 34.0; OVER = 2.0
BADGE = ("Sundown Audio", "Fi Car Audio", "Sound Solutions Audio", "Orion", "Sky High Car Audio", "Crescendo Audio")
c = psycopg2.connect(DSN); cur = c.cursor()
cur.execute("""select wedge_key, w_out, fh_out, net_ported_ft3, net_sealed_ft3, n_vehicles,
 mount_depth_effective_in, depth_basis from truck_wedge_envelopes where wedge_class <> 'XS'""")
ENV = [(int(k), float(w), float(f), float(p), float(s), int(n), float(md), db)
       for k, w, f, p, s, n, md, db in cur.fetchall()]
cur.execute("""select p.sub_id, p.alignment, p.counts, s.brand, s.model, s.price, s.driver_size, s.rms_watts,
 s.sensitivity_db_1w_1m, s.sd_cm2, coalesce(s.effective_xmax_mm, s.xmax_mm), s.fs_hz, s.qts, s.vas_l,
 s.sealed_design_vb_ft3, s.ported_design_vb_ft3, s.ported_min_vb_ft3, s.mounting_depth_in
 from truck_sub_picks p join subwoofers s on s.slug = p.sub_id""")
P = []
for r in cur.fetchall():
    d = dict(zip(("slug","al","counts","brand","model","price","size","rms","sens","sd","xm","fs","qts","vas","svb","pvb","minvb","md"), r))
    for k in ("price","rms","sens","sd","xm","fs","qts","vas"): d[k] = float(d[k])
    for k in ("svb","pvb","minvb","md"): d[k] = float(d[k]) if d[k] is not None else None
    P.append(d)
NO_DEPTH = sorted({d["slug"] for d in P if d["md"] is None})
if NO_DEPTH: print(f"EXCLUDED — no mounting_depth_in on file ({len(NO_DEPTH)}): {', '.join(NO_DEPTH)}")
anchor_row = None
cur.execute("select slug,driver_size,fs_hz,qts,vas_l,sd_cm2,rms_watts,sensitivity_db_1w_1m,xmax_mm,effective_xmax_mm from subwoofers where slug='fi-car-audio-hc-12'")
a = cur.fetchone(); ANCHOR = I.sub_best_composite(dict(slug=a[0], driver_size=a[1], fs_hz=float(a[2]), qts=float(a[3]), vas_l=float(a[4]), sd_cm2=float(a[5]), rms_watts=float(a[6]), sensitivity_db_1w_1m=float(a[7]), xmax_mm=float(a[8]), effective_xmax_mm=float(a[9]) if a[9] else None))
def stage(m, N):
    sh = 6.02 * math.log2(N); core = [x + sh for x in m[1:]]
    raw = 10 ** (min(core) / 10) * 10 ** (sum(core) / len(core) / 10)
    return round(min(core), 1), round((raw / ANCHOR) ** 0.5, 2)
def fits(d, N, e):
    k, w_face, fh, np_, ns, n, md_cap, _db = e
    if d["md"] is None or d["md"] > md_cap: return None      # depth gate — unknown fails
    # flanges sit ON THE BAFFLE, so both flange checks use the OUTSIDE face (Brett 2026-08-24).
    # This previously tested width against wi (face minus 1.5in of side wall), which is wrong —
    # side walls sit behind the baffle; only the CUTOUT has to clear the cavity, not the flange.
    if N * FL[d["size"]] > w_face or FL[d["size"]] > fh + OVER: return None
    share = ((np_ if d["al"] == "ported" else ns) - N * DISP[d["size"]]) / N
    if d["al"] == "ported" and d["minvb"] is not None and share < d["minvb"]: return None
    return share
# installed price of the value two-way package per rung, when the truck category has been written
cur.execute("""select sub_id, bass_alignment, sub_count, price_installed from packages
 where vehicle_category='truck' and is_default_variant and topology='two-way'""")
INSTALLED = {(a, b, int(n)): float(p) for a, b, n, p in cur.fetchall()}
# rung-level impact at the median fitting truck (same convention as the pick sheets)
rungs = []
for d in P:
    for N in d["counts"]:
        shares = sorted((fits(d, N, e), e[5]) for e in ENV if fits(d, N, e) is not None)
        if not shares: continue
        tot = sum(n for _, n in shares); run = 0; med = shares[0][0]
        for v, n in shares:
            run += n
            if run >= tot / 2: med = v; break
        row = dict(fs_hz=d["fs"], qts=d["qts"], vas_l=d["vas"], sd_cm2=d["sd"], rms_watts=d["rms"], sensitivity_db_1w_1m=d["sens"])
        if d["al"] == "ported":
            vb = min(med, d["pvb"]) if d["pvb"] else med
            m = I.ported_margins(row, vb * I.FT3_L, FB, d["xm"])
        else:
            vb = min(med, d["svb"]) if d["svb"] else med
            if d["qts"] * math.sqrt(1 + d["vas"] / (vb * I.FT3_L)) > 1.1: continue
            m = I._sub_margins(d["fs"], d["qts"], d["vas"], d["sd"], d["rms"], d["sens"], vb * I.FT3_L, d["xm"])
        Ls, imp = stage(m, N)
        stage_cost = d["price"] * N + ENC[d["al"]]
        rungs.append(dict(d=d, N=N, imp=imp, Ls=Ls, vb=round(vb, 2), cost=INSTALLED.get((d["slug"], d["al"], N)), stage_cost=stage_cost, badge=d["brand"] in BADGE))
# one currency for the whole ladder: installed price only when EVERY rung has a package row,
# otherwise stage cost for all (mixing the two silently prunes the cheap rungs — 2026-08-22 bug)
if any(r["cost"] is None for r in rungs):
    print(f"NOTE: {sum(1 for r in rungs if r['cost'] is None)} rungs lack a package row — ranking ALL rungs on stage cost this pass")
    for r in rungs: r["cost"] = r["stage_cost"]
# per-envelope ladder, per INSTALL TYPE (Brett 2026-08-22): within each (size, N, alignment) that
# fits, the value frontier by installed price + the best rung of each badge brand (any N).
# No pruning across install types — a single 12 is its own offer, not a worse pair.
fit_rows = []; alive = set()
for e in ENV:
    f = [r for r in rungs if fits(r["d"], r["N"], e) is not None]
    by_cfg = {}
    for r in f: by_cfg.setdefault((r["d"]["size"], r["N"], r["d"]["al"]), []).append(r)
    keep = set()
    for cfg, rs in by_cfg.items():
        rs.sort(key=lambda r: (r["cost"], -r["imp"]))
        best = 0.0; badge_best = {}
        for r in rs:
            if r["imp"] > best: keep.add(id(r)); best = r["imp"]
            if r["badge"]:
                b = r["d"]["brand"]
                if b not in badge_best or r["imp"] > badge_best[b]["imp"]: badge_best[b] = r
        keep.update(id(r) for r in badge_best.values())
    for r in f:
        shown = id(r) in keep
        fit_rows.append((e[0], r["d"]["slug"], r["d"]["al"], r["N"], shown, r["imp"], r["stage_cost"], r["cost"]))
        if shown: alive.add((r["d"]["slug"], r["d"]["al"], r["N"]))
dead = [(r["d"]["slug"], r["d"]["al"], r["N"]) for r in rungs if (r["d"]["slug"], r["d"]["al"], r["N"]) not in alive]
tot = sum(e[5] for e in ENV)
print(f"ladder priced on installed value build for {sum(1 for r in rungs if (r['d']['slug'], r['d']['al'], r['N']) in INSTALLED)} of {len(rungs)} rungs")
print(f"{len(rungs)} rungs · {len(ENV)} envelopes · {tot} trucks · fit rows {len(fit_rows)} · shown rows {sum(1 for x in fit_rows if x[4])}")
by_basis = {}
for e in ENV:
    f = [r for r in rungs if fits(r["d"], r["N"], e) is not None]
    b = by_basis.setdefault(e[7], [0, 0, 0])
    b[0] += e[5]; b[1] += len(f); b[2] += 1
for b, (tr, nf, ne) in sorted(by_basis.items()):
    print(f"  depth basis {b:17s} {ne:3d} envelopes · {tr:5d} trucks · {nf/ne:5.1f} rungs clear depth on average")
print(f"alive {len(alive)} · dead {len(dead)}")
for s in sorted(dead): print("  drop", s)
if "--apply" not in sys.argv:
    print("dry run"); raise SystemExit
# designations (truck_sub_picks) are never modified here — a rung that is shown nowhere just has no shown rows
cur.execute("drop table if exists truck_wedge_fit")
cur.execute("""create table truck_wedge_fit (wedge_key int not null references truck_wedge_envelopes(wedge_key),
  sub_id varchar not null references subwoofers(slug), alignment varchar not null, sub_count int not null,
  shown boolean not null, impact real, stage_cost real, ladder_price real, primary key (wedge_key, sub_id, alignment, sub_count))""")
cur.executemany("insert into truck_wedge_fit values (%s,%s,%s,%s,%s,%s,%s,%s)", fit_rows)
cur.execute("create index on truck_wedge_fit (sub_id, alignment, sub_count)")
c.commit()
cur.execute("select count(*), count(*) filter (where shown) from truck_wedge_fit"); print("truck_wedge_fit:", cur.fetchone())
cur.execute("select count(*), sum(cardinality(counts)) from truck_sub_picks"); print("truck_sub_picks rows, designations (untouched):", cur.fetchone())
