#!/usr/bin/env python3
"""Cargo package generator (v2) — full pairing permutation, Directus-only.

Founder model 2026-07-30: packages are NOT a value frontier. They are the full
pairing space — sub stages x front stages — and the PLP narrows it: first by
the shopper's car (fit), then price, then facets. "It should be easy for the
shopper to get down to a reasonable number of entries."

Row = one sub realization (driver x alignment, from STORED score/build columns)
    x one front set (curated per-topology collections)
    + matched hardware: cheapest mono covering the sub's watts, cheapest
      multichannel covering the set's channels, DSP, electrical tier.

Base-build enclosures only (sealed prefab / aero / slot). Stealth, true-IB,
and aesthetic execution are configure-time OPTIONS on a package, not rows
(founder ruling 2026-07-30: fabrication/aesthetics are not performance calculus).

Balance gate (v1 rule, kept): a pairing is offered when the sub stage keeps up
with the front stage — L_sub >= L_front - 3 dB. No upper cut: sub far above
front = the ground-pound lane, legitimate business.

READ-ONLY by default: writes a summary bench (md) + the full permutation set
(jsonl) to staging. No DB writes.
"""
import json, math, os, re, sys, urllib.request

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "scoring"))
import instrument as I

STAGING_MD = "/Volumes/SSD 1TB/Database/staging/cargo-packages-bench.md"
STAGING_JSONL = "/Volumes/SSD 1TB/Database/staging/cargo-packages.jsonl"

PRICE_SEALED, PRICE_AERO = 200.0, 300.0
SLOT_UPCHARGE = 100.0            # OPEN — placeholder until slot labor is priced
PRICE_DSP = 250.0                # settled: DSP every package
ALT_CARGO, BIG3, BATTERY = 550.0, 200.0, 300.0
BALANCE_GRACE_DB = 3.0
AMP_HEADROOM = 0.9
BOXED_SIZES = {"12", "13.5", "15", "18"}
# topology -> (collection, crossover_hz, front_channels, needs_front_sub)
# price field is `price` or `total_price`; SPL score field is `score` (the dB
# ceiling; `impact_score` is the normalized currency) — resolved per row.
# channels = multichannel channels for the SET only; the front sub in "+"
# topologies runs on its own small mono (founder ruling 2026-07-30).
SET_SOURCES = {
    "2-way":     ("two_way_component_sets",       80.0,  4, False),
    "2-way+":    ("two_way_plus_component_sets",  100.0, 4, True),
    "wideband":  ("wideband_component_sets",      80.0,  4, False),
    "wideband+": ("wideband_plus_component_sets", 100.0, 4, True),
    "3-way":     ("three_way_component_sets",     80.0,  6, False),
    "3-way+":    ("three_way_plus_component_sets",100.0, 6, True),
}


def api(path):
    url, tok = os.environ["DIRECTUS_URL"].rstrip("/"), os.environ["DIRECTUS_TOKEN"]
    req = urllib.request.Request(url + path, headers={"Authorization": f"Bearer {tok}"})
    return json.load(urllib.request.urlopen(req, timeout=60))["data"]


def fnum(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def amp_watts(txt):
    if not isinstance(txt, str):
        return fnum(txt)
    rated = txt.split("(")[0]
    pairs = re.findall(r"(\d[\d,]*)\s*W\s*@\s*([\d.]+)\s*Ω", rated)
    if pairs:
        by_ohm = {float(o): float(w.replace(",", "")) for w, o in pairs}
        return by_ohm.get(1.0) or max(by_ohm.values())
    m = re.findall(r"(\d[\d,]*)\s*W", rated)
    return max(float(x.replace(",", "")) for x in m) if m else None


def electrical(watts):
    if watts < 2000: return 0.0, "none"
    if watts < 3000: return BIG3, "big3"
    if watts < 5000: return BIG3 + ALT_CARGO, "big3+alt"
    return BIG3 + ALT_CARGO + BATTERY, "big3+alt+battery"


def sub_ceiling_db(r, align):
    xm = r.get("effective_xmax_mm") or r["xmax_mm"]
    if align == "sealed":
        m = I._sub_margins(r["fs_hz"], r["qts"], r["vas_l"], r["sd_cm2"],
                           r["rms_watts"], r["sensitivity_db_1w_1m"],
                           r["sealed_design_vb_ft3"] * I.FT3_L, xm)
    else:
        m = I.ported_margins(r, r["ported_design_vb_ft3"] * I.FT3_L, r["ported_fb_hz"], xm)
    return min(m[1:])


def main():
    need = ("fs_hz", "qts", "vas_l", "sd_cm2", "xmax_mm", "rms_watts", "sensitivity_db_1w_1m")
    subs = api("/items/subwoofers?limit=-1&fields=slug,brand,model,driver_size,price,"
               "impact_score,sealed_design_vb_ft3,sealed_gross_ft3,ported_score,"
               "ported_design_vb_ft3,ported_gross_ft3,ported_port_type,ported_fb_hz,"
               "effective_xmax_mm," + ",".join(need))
    for s in subs:
        for k in list(s):
            if k not in ("slug", "brand", "model", "driver_size", "ported_port_type"):
                s[k] = fnum(s[k]) if not isinstance(s[k], float) else s[k]
    subs = [s for s in subs if s.get("price") and all(s.get(k) for k in need)]

    monos = api("/items/mono_amps?limit=-1&fields=slug,brand,model,price,rms_power")
    for a in monos:
        a["price"], a["rms_power"] = fnum(a["price"]), amp_watts(a.get("rms_power"))
    monos = sorted([a for a in monos if a["price"] and a["rms_power"]], key=lambda a: a["price"])

    multis = api("/items/multichannel_amps?limit=-1&fields=slug,brand,model,price,channels")
    for a in multis:
        a["price"], a["channels"] = fnum(a["price"]), fnum(a.get("channels"))
    multis = sorted([a for a in multis if a["price"] and a["channels"]], key=lambda a: a["price"])

    fsubs = api("/items/front_subs?limit=-1&fields=slug,brand,model,price,rms_watts")
    fsubs = sorted([f for f in fsubs if fnum(f.get("price"))], key=lambda f: float(f["price"]))
    front_sub = fsubs[0] if fsubs else None      # cheapest; spread is configure-time
    fs_mono = None
    if front_sub:
        fs_rms = fnum(front_sub.get("rms_watts")) or 300.0
        fs_mono = next((a for a in monos if a["rms_power"] >= fs_rms), monos[0])

    # front stages from the curated per-topology collections
    fronts = []
    for topo, (coll, fx, ch, needs_fs) in SET_SOURCES.items():
        try:
            rows = api(f"/items/{coll}?limit=-1")
        except Exception:
            continue
        for c in rows:
            price = fnum(c.get("price")) or fnum(c.get("total_price"))
            score = fnum(c.get("score"))
            if not (price and score):
                continue
            L_front = score + 6.0 - I.shape(fx)          # stereo pair vs the curve at fx
            mch = next((a for a in multis if a["channels"] >= ch), None)
            if mch is None:
                continue
            extra = (float(front_sub["price"]) + fs_mono["price"]) if (needs_fs and front_sub) else 0.0
            fronts.append(dict(topo=topo, slug=c["slug"], name=c.get("name") or c["slug"],
                               price=price, L=L_front, mch=mch, fs_extra=extra,
                               needs_fs=needs_fs))

    # sub realizations from stored columns (base builds only)
    stages = []
    for s in subs:
        sz = str(s["driver_size"])
        if sz not in BOXED_SIZES:
            continue
        if s.get("impact_score") and s.get("sealed_design_vb_ft3"):
            stages.append(dict(s=s, align="sealed", enc="sealed-prefab", flag="",
                               gross=s.get("sealed_gross_ft3"),
                               L=sub_ceiling_db(s, "sealed")))
        if s.get("ported_score") and s.get("ported_design_vb_ft3") and s.get("ported_fb_hz"):
            slot = s.get("ported_port_type") == "slot"
            stages.append(dict(s=s, align="ported", enc=("slot" if slot else "aero"),
                               flag="",
                               gross=s.get("ported_gross_ft3"),
                               L=sub_ceiling_db(s, "ported")))

    for st in stages:
        pe = st["s"]["rms_watts"]
        amp = next((a for a in monos if a["rms_power"] >= AMP_HEADROOM * pe), None)
        if amp is None:
            amp = monos[-1]
            st["flag"] = (st["flag"] + "; " if st["flag"] else "") + "amp-under-Pe"
        st["amp"] = amp
        st["elec_cost"], st["elec"] = electrical(amp["rms_power"])

    # ---- permutations --------------------------------------------------------
    n_gate = 0
    out = open(STAGING_JSONL, "w")
    count, by_topo, by_align = 0, {}, {}
    for st in stages:
        for fr in fronts:
            if st["L"] < fr["L"] - BALANCE_GRACE_DB:
                n_gate += 1
                continue
            rec = dict(sub=st["s"]["slug"], size=st["s"]["driver_size"], align=st["align"],
                       sub_gross_ft3=st["gross"], sub_ceiling_db=round(st["L"], 1),
                       mono=st["amp"]["slug"], electrical=st["elec"],
                       set_slug=fr["slug"], topology=fr["topo"],
                       front_sub=front_sub["slug"] if fr["needs_fs"] and front_sub else None,
                       front_sub_mono=fs_mono["slug"] if fr["needs_fs"] and fs_mono else None,
                       multichannel=fr["mch"]["slug"], flags=st["flag"])
            out.write(json.dumps(rec) + "\n")
            count += 1
            by_topo[fr["topo"]] = by_topo.get(fr["topo"], 0) + 1
            by_align[st["align"]] = by_align.get(st["align"], 0) + 1
    out.close()

    md = ["# Cargo package permutations (read-only bench)", "",
          f"- sub realizations: **{len(stages)}** ({by_align})",
          f"- front stages: **{len(fronts)}** across {len({f['topo'] for f in fronts})} topologies",
          f"- **pairings emitted: {count:,}** (balance gate removed {n_gate:,})",
          f"- by topology: {by_topo}", "",
          f"full set: `{STAGING_JSONL}`", ""]
    with open(STAGING_MD, "w") as fh:
        fh.write("\n".join(md) + "\n")
    print("\n".join(md[2:8]))
    print(f"bench -> {STAGING_MD}")


if __name__ == "__main__":
    main()
