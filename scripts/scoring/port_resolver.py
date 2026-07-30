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

STAGING = "/Volumes/SSD 1TB/Database/staging/ported-port-resolver-bench.md"


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

    bench, flips, nobuild = [], [], []
    for r in scored:
        _, spec = I.ported_knee(r)          # deterministic; recovers Fb at the knee
        if not spec:
            nobuild.append(r)
            continue
        vb_ft3, fb = spec["vb_ft3"], spec["fb_hz"]
        res = resolve(r, vb_ft3 * I.FT3_L, fb)
        managed = False
        # Knee unbuildable -> enlarge the box until the port fits (founder ruling:
        # "make it larger and the port smaller — we can manage those"). Score-side
        # this costs nothing: past the knee the curve is flat-to-rising.
        while res is None and vb_ft3 < 12.0:
            vb_ft3 = round(vb_ft3 * 1.13, 2)
            res = resolve(r, vb_ft3 * I.FT3_L, fb)
            managed = True
        if not res:
            nobuild.append(r)
            continue
        res.update(slug=r["slug"], name=f"{r['brand']} {r['model']}", size=r["driver_size"],
                   vb_ft3=vb_ft3, managed=managed, fb=fb, score_p=r["ported_score"],
                   score_s=r.get("impact_score") or 0.0,
                   min_vb=min_buildable_vb(r), price=r.get("price"))
        bench.append(res)
        if r.get("impact_score") and r["impact_score"] > r["ported_score"]:
            flips.append(res)

    bench.sort(key=lambda b: -b["score_p"])
    n_aero = sum(1 for b in bench if b["port_type"] == "aero")
    n_slot = len(bench) - n_aero

    L = ["# Ported port-resolver bench (read-only)", "",
         f"drivers resolved: **{len(bench)}** — aero **{n_aero}**, slot **{n_slot}**, "
         f"no-build **{len(nobuild)}**",
         f"sealed-beats-ported (offer sealed first): **{len(flips)}**", "",
         f"constants: aero<= {AERO_MAX_TUBE_IN}\" tube @25m/s | slot @{SLOT_VMAX_MS}m/s, "
         f"floor {SLOT_FLOOR_IN2FT3}in2/ft3, fold<= {SLOT_MAX_LEN_IN}\", "
         f"duct<= {int(SLOT_MAX_DISP*100)}% of Vb", "",
         "| driver | size | type | spec | net ft3 | gross ft3 | min Vb | Fb | score p/s |",
         "|---|---|---|---|---|---|---|---|---|"]
    for b in bench:
        spec = (f"{b['tubes']}x4\" x {b['len_in']}\"" if b["port_type"] == "aero"
                else f"{b['area_in2']}in2 x {b['len_in']}\" duct")
        if b.get("managed"):
            spec += " (box enlarged over knee)"
        L.append(f"| {b['name']} | {b['size']} | {b['port_type']} | {spec} | {b['vb_ft3']} | "
                 f"{b['gross_ft3']} | {b['min_vb']} | {b['fb']:.1f} | "
                 f"{b['score_p']:.2f} / {b['score_s']:.2f} |")
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
                {"ported_port_type": b["port_type"], "ported_fb_hz": round(b["fb"], 1),
                 "ported_tubes": b["tubes"], "ported_tube_len_in": b["len_in"],
                 "ported_min_vb_ft3": b["min_vb"], "ported_gross_ft3": b["gross_ft3"]})
        if r.get("error"):
            print(f"  FAIL {b['slug']}: {r}")
        else:
            n += 1
    print(f"WROTE {n}/{len(bench)} drivers")


if __name__ == "__main__":
    main()
