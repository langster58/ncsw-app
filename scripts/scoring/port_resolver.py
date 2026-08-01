#!/usr/bin/env python3
"""Port resolver — the per-driver aero/slot + enclosure-size computation.

Founder architecture 2026-07-30: scoring is port-blind and NAILED
(ported_score / ported_design_vb_ft3, written + reproducible). This module is
the SEPARATE downstream calculation: given a driver's knee build (Vb, Fb),
decide how the port is physically realized and how big the box ends up.

    aero  — n x 4" flared tubes @ 25 m/s. Cheap: a sealed box with holes.
            Chosen whenever the straight tube fits a normal build.
    slot  — folded MDF duct @ 17 m/s (sharp edges chuff earlier), area floored
            at 12 in2/ft3 (founder's ratified slot practice). Costs more labor;
            chosen only when the aero tube outgrows the box.
    none  — even the slot can't be built -> driver has NO ported realization
            (cat_ported should be false).

Outputs per driver: port_type, spec, gross_ft3 (net + port displacement +
driver displacement [+ duct wood]), min buildable Vb, and the sealed-vs-ported
verdict. READ-ONLY: writes a bench to staging for founder review, never the DB.

Bench constants (founder-reviewable, one line each to change):
    AERO_MAX_TUBE_IN  36.0  switch point: longer straight tube than this -> slot
    SLOT_VMAX_MS      17.0  duct velocity ceiling (enclosure_calc straight-port rule)
    SLOT_FLOOR_IN2FT3 12.0  slot area floor (legacy ratified slot practice)
    SLOT_MAX_LEN_IN   70.0  max folded duct run (~two walls of a trunk-width box)
    SLOT_MAX_DISP     0.50  duct may displace at most this fraction of net Vb
"""
import json, math, os, sys, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import instrument as I

AERO_MAX_TUBE_IN = 36.0
SLOT_VMAX_MS = 17.0
SLOT_FLOOR_IN2FT3 = 12.0
SLOT_MAX_LEN_IN = 70.0
SLOT_MAX_DISP = 0.50
DUCT_WOOD_FT3 = 0.10          # MDF of the duct walls, typical folded slot

# DESIGN VOLUME RULE (founder-settled 2026-08-01, replaces the -1 dB knee):
# grow the box in 0.25 ft3 steps while each added cubic foot still buys at
# least PAY_RATE dB of ceiling; stop when the next cube stops paying. Then
# grow further ONLY as far as the port needs to be physically buildable.
# The knee measured distance-from-plateau and specced 6-8 ft3 fantasy boxes;
# the pay rate stops where a sellable product stops (12s ~1.25-2.25,
# 15s ~3.25-4.5, 18s ~4.5-5). Verified vs the 1.5 rate: the bigger boxes buy
# only 0.4-2.2 dB of MAX output (nothing at listening levels, post-DSP).
PAY_RATE_DB_FT3 = 2.0
DESIGN_VB_START = 0.75
DESIGN_VB_MAX = 10.0

STAGING = "/Volumes/SSD 1TB/NCSW/research/packages/ported-design-bench.md"


def slot_spec(sd_cm2, xm_mm, fb, vb_l):
    """Folded-slot duct for (Vb, Fb): (area_cm2, len_cm) or None if unbuildable."""
    vel = (sd_cm2 * 1e-4 * xm_mm * 1e-3 * 2 * math.pi * fb / SLOT_VMAX_MS) * 1e4
    floor = SLOT_FLOOR_IN2FT3 * (vb_l / I.FT3_L) * 6.4516
    area = max(vel, floor)
    ln = I.port_length_cm(area, fb, vb_l, a_cm=math.sqrt(area / math.pi))
    if ln < 2.0 or ln / 2.54 > SLOT_MAX_LEN_IN:
        return None
    if (area * ln / 1000.0) > SLOT_MAX_DISP * (vb_l):
        return None                                   # duct eats the box
    return area, ln


def resolve(row, vb_l, fb):
    """Aero-first / slot-fallback for one (driver, Vb, Fb). Returns dict or None."""
    xm = row.get("effective_xmax_mm") or row["xmax_mm"]
    aero = I.aero_port_spec(row["sd_cm2"], xm, fb, vb_l)
    if aero:
        n, ln, area = aero
        if 2.0 <= ln and ln / 2.54 <= AERO_MAX_TUBE_IN:
            disp = area * ln / 1000.0 / I.FT3_L
            return dict(port_type="aero", tubes=n, area_in2=round(area / 6.4516, 1),
                        len_in=round(ln / 2.54, 1),
                        gross_ft3=round(vb_l / I.FT3_L + disp
                                        + I.DRIVER_DISP_FT3.get(str(row["driver_size"]), .12), 2))
    s = slot_spec(row["sd_cm2"], xm, fb, vb_l)
    if s:
        area, ln = s
        disp = area * ln / 1000.0 / I.FT3_L
        return dict(port_type="slot", tubes=None, area_in2=round(area / 6.4516, 1),
                    len_in=round(ln / 2.54, 1),
                    gross_ft3=round(vb_l / I.FT3_L + disp + DUCT_WOOD_FT3
                                    + I.DRIVER_DISP_FT3.get(str(row["driver_size"]), .12), 2))
    return None


def _best_fb(row, vb_l):
    """Best musical tune at this volume: (raw_composite, fb)."""
    xm = row.get("effective_xmax_mm") or row["xmax_mm"]
    best = None
    for i in range(5):
        fb = max(I.FB_ABS_MIN, row["fs_hz"] * (I.FB_RATIO_MIN + i * 0.05))
        c = I.composite_from_margins(I.ported_margins(row, vb_l, fb, xm))
        if best is None or c > best[0]:
            best = (c, fb)
    return best


def design_build(row):
    """The driver's ported DESIGN build under the pay-rate rule.

    1. Grow from DESIGN_VB_START while each 0.25 ft3 step pays at a rate of
       >= PAY_RATE_DB_FT3 (marginal productivity, NOT distance-from-plateau).
    2. Grow further only until a port is buildable (aero-first, slot fallback).
    Returns dict(vb_ft3, fb, raw, grown_for_port, port fields...) or None."""
    vb = DESIGN_VB_START
    raw, fb = _best_fb(row, vb * I.FT3_L)
    s = 10 * math.log10(raw)
    while vb < DESIGN_VB_MAX:
        raw2, fb2 = _best_fb(row, (vb + 0.25) * I.FT3_L)
        s2 = 10 * math.log10(raw2)
        if (s2 - s) / 0.25 < PAY_RATE_DB_FT3:
            break
        vb, s, raw, fb = round(vb + 0.25, 2), s2, raw2, fb2
    res = resolve(row, vb * I.FT3_L, fb)
    grown = False
    while res is None and vb < 12.0:
        vb = round(vb + 0.25, 2)
        raw, fb = _best_fb(row, vb * I.FT3_L)
        res = resolve(row, vb * I.FT3_L, fb)
        grown = True
    if res is None:
        return None
    return dict(vb_ft3=vb, fb=fb, raw=raw, grown_for_port=grown, **res)


def min_buildable_vb(row):
    """Smallest Vb (ft3) with any buildable port in the musical Fb window."""
    fbs = [max(I.FB_ABS_MIN, row["fs_hz"] * (I.FB_RATIO_MIN + i * 0.05)) for i in range(5)]
    vb = 0.3
    while vb <= 12.0:
        if any(resolve(row, vb * I.FT3_L, fb) for fb in fbs):
            return round(vb, 2)
        vb *= 1.13
    return None


def main():
    url, tok = os.environ["DIRECTUS_URL"].rstrip("/"), os.environ["DIRECTUS_TOKEN"]
    need = "fs_hz,qts,vas_l,sd_cm2,xmax_mm,effective_xmax_mm,rms_watts,sensitivity_db_1w_1m"
    req = urllib.request.Request(
        url + "/items/subwoofers?limit=-1&fields=slug,brand,model,driver_size,price,"
              "cat_ported,impact_score,ported_score,ported_design_vb_ft3," + need,
        headers={"Authorization": f"Bearer {tok}"})
    rows = json.load(urllib.request.urlopen(req, timeout=60))["data"]
    for r in rows:
        for k, v in list(r.items()):
            if isinstance(v, str) and k not in ("slug", "brand", "model", "driver_size"):
                try:
                    r[k] = float(v)
                except ValueError:
                    pass
    scored = [r for r in rows if r.get("ported_score") and r.get("ported_design_vb_ft3")
              and all(r.get(k) for k in need.split(",") if k != "effective_xmax_mm")]

    anchor = next(r for r in scored if r["slug"] == I.SUB_ANCHOR_SLUG)
    aref = I.sub_best_composite(anchor)

    bench, flips, nobuild = [], [], []
    for r in scored:
        d = design_build(r)                 # pay-rate design volume + build
        if not d:
            nobuild.append(r)
            continue
        new_score = I.sub_impact(d["raw"], aref)
        d.update(slug=r["slug"], name=f"{r['brand']} {r['model']}", size=r["driver_size"],
                 managed=d.pop("grown_for_port"), fb=d["fb"],
                 score_p=new_score, old_score=r.get("ported_score"),
                 score_s=r.get("impact_score") or 0.0,
                 min_vb=min_buildable_vb(r), price=r.get("price"))
        bench.append(d)
        if r.get("impact_score") and r["impact_score"] > new_score:
            flips.append(d)

    bench.sort(key=lambda b: -b["score_p"])
    n_aero = sum(1 for b in bench if b["port_type"] == "aero")
    n_slot = len(bench) - n_aero

    L = ["# Ported design bench — pay-rate rule (read-only)", "",
         f"design rule: grow while each ft3 pays >= {PAY_RATE_DB_FT3} dB, then only as far "
         f"as the port needs (founder-settled 2026-08-01; replaces the knee).", "",
         f"drivers resolved: **{len(bench)}** — aero **{n_aero}**, slot **{n_slot}**, "
         f"no-build **{len(nobuild)}**",
         f"sealed-beats-ported (offer sealed first): **{len(flips)}**", "",
         f"constants: aero<= {AERO_MAX_TUBE_IN}\" tube @25m/s | slot @{SLOT_VMAX_MS}m/s, "
         f"floor {SLOT_FLOOR_IN2FT3}in2/ft3, fold<= {SLOT_MAX_LEN_IN}\", "
         f"duct<= {int(SLOT_MAX_DISP*100)}% of Vb", "",
         "| driver | size | type | spec | net ft3 | gross ft3 | Fb | score new/old | vs sealed |",
         "|---|---|---|---|---|---|---|---|---|"]
    for b in bench:
        spec = (f"{b['tubes']}x4\" x {b['len_in']}\"" if b["port_type"] == "aero"
                else f"{b['area_in2']}in2 x {b['len_in']}\" duct")
        if b.get("managed"):
            spec += " (grown for port)"
        L.append(f"| {b['name']} | {b['size']} | {b['port_type']} | {spec} | {b['vb_ft3']} | "
                 f"{b['gross_ft3']} | {b['fb']:.1f} | "
                 f"{b['score_p']:.2f} / {b['old_score'] or 0:.2f} | {b['score_s']:.2f} |")
    if nobuild:
        L += ["", "## No buildable port (cat_ported -> false)", ""]
        L += [f"- {r['brand']} {r['model']} ({r['driver_size']}\")" for r in nobuild]
    with open(STAGING, "w") as fh:
        fh.write("\n".join(L) + "\n")
    print(f"bench -> {STAGING}")
    print(f"resolved {len(bench)}: aero {n_aero}, slot {n_slot}, no-build {len(nobuild)}, "
          f"sealed-first {len(flips)}")

    if "--write" in sys.argv:
        write(url, tok, bench)


FIELDS = [("ported_port_type", "string"), ("ported_fb_hz", "float"),
          ("ported_tubes", "integer"), ("ported_tube_len_in", "float"),
          ("ported_min_vb_ft3", "float")]


def api(url, tok, method, path, payload=None):
    req = urllib.request.Request(url + path, method=method,
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    try:
        return json.load(urllib.request.urlopen(req, timeout=30))
    except urllib.error.HTTPError as e:
        return {"error": e.code, "body": e.read().decode()[:200]}


def write(url, tok, bench):
    for field, ftype in FIELDS:
        r = api(url, tok, "POST", "/fields/subwoofers",
                {"field": field, "type": ftype, "schema": {}})
        state = "exists" if r.get("error") else "created"
        print(f"field {field}: {state}")
    n = 0
    for b in bench:
        r = api(url, tok, "PATCH", f"/items/subwoofers/{b['slug']}",
                {"ported_score": b["score_p"], "ported_design_vb_ft3": b["vb_ft3"],
                 "ported_port_type": b["port_type"], "ported_fb_hz": round(b["fb"], 1),
                 "ported_tubes": b["tubes"], "ported_tube_len_in": b["len_in"],
                 "ported_min_vb_ft3": b["min_vb"], "ported_gross_ft3": b["gross_ft3"]})
        if r.get("error"):
            print(f"  FAIL {b['slug']}: {r}")
        else:
            n += 1
    print(f"WROTE {n}/{len(bench)} drivers")


if __name__ == "__main__":
    main()
