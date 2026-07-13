#!/usr/bin/env python3
"""Resolve eligible placement profiles (package_topologies W-A..3-C) per factory audio layout.

Reads factory_audio_layouts, classifies each location field (absent / empty
provision / populated+size), and computes which of the 14 placement profiles
each layout supports. Read-only: prints distribution, calibration counts, and
spot-check examples. Where results are stored is a schema decision — nothing
is written.

Usage: python3 resolve-placement-profiles.py [--examples]
"""
import os, re, sys, json
from collections import Counter
import psycopg2

def db():
    env = {}
    with open(os.path.expanduser("~/.config/directus-render.env")) as f:
        for line in f:
            if "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    return psycopg2.connect(env["DATABASE_URL"])

# ---------- location field classification ----------

def absent(v):
    if v is None:
        return True
    s = v.strip().lower()
    return s in ("", "none") or s.startswith("none ") or s.startswith("none(") or \
        s.startswith("n/a") or s.startswith("no ") or s.startswith("none—") or s.startswith("none-")

def empty_provision(v):
    return bool(v) and bool(re.search(r"empty (cavity|provision)", v.lower()))

def populated(v):
    return not absent(v) and not empty_provision(v)

def usable(v):
    """Populated or an empty factory provision — either accepts a driver without fab."""
    return populated(v) or empty_provision(v)

SIZE_RX = re.compile(r"(\d+(?:\.\d+)?)\s*(?:x\s*(\d+(?:\.\d+)?))?\s*-?\s*inch", re.I)

def size_in(v):
    """Largest inch figure mentioned; for cross sizes (4x10) use the smaller dim
    as the mounting-class driver (a 4x10 hole takes a 4in-class driver width-wise)."""
    if not v:
        return None
    best = None
    for m in SIZE_RX.finditer(v):
        a = float(m.group(1))
        b = float(m.group(2)) if m.group(2) else None
        val = min(a, b) if b else a
        if best is None or val > best:
            best = val
    return best

def door_is_midbass(v):
    """Front door location that takes a 6.5/6x9-class midbass."""
    if not populated(v):
        return False
    s = v.lower()
    if "no 6.5" in s or "midbass is underseat" in s:
        return False
    if "bass" in s or "woofer" in s:
        return True  # door explicitly contains a bass/woofer position (e.g. Logic7 combos)
    sz = size_in(v)
    if sz is not None:
        if sz >= 5:
            return True  # 5.25/6.5/6x9 class
        # 4x6-class door (cross size only — a round 4in door is a midrange, not midbass)
        return bool(re.search(r"\dx\d|\d\s*x\s*\d", s)) and sz >= 4
    # unsized but populated ("front doors", "doors") — era-typical full-size door driver
    return not door_is_midonly(v)

def door_is_midonly(v):
    """Door location that is a dedicated 3-4in midrange (BMW/G37 style)."""
    if not populated(v):
        return False
    s = v.lower()
    if "midrange" in s or re.search(r"\bmid\b", s):
        sz = size_in(v)
        return sz is None or sz <= 4.5
    return False

def door_has_woofer_and_mid(v):
    return populated(v) and "woofer" in (v or "").lower() and "mid" in (v or "").lower()

def door_has_tweeter(v):
    """Door location whose text mentions an integrated/door-top tweeter."""
    return populated(v) and "tweeter" in (v or "").lower()

# ---------- profile resolution ----------

def resolve(l):
    """l: dict of layout fields -> set of eligible profile codes."""
    dash, pillar, sail = l["dash_speaker"], l["a_pillar_speaker"], l["sail_speaker"]
    center, door, useat = l["center_speaker"], l["front_door_speaker"], l["underseat_speaker"]
    kick = l["kick_panel_speaker"]

    dash_sz = size_in(dash) if populated(dash) else None
    dash_large = populated(dash) and dash_sz is not None and dash_sz >= 3.5
    dash_small = populated(dash) and dash_sz is not None and 2.5 <= dash_sz < 3.5
    dash_unsized = populated(dash) and dash_sz is None
    dash_any = populated(dash)

    door_mb = door_is_midbass(door)
    door_mid = door_is_midonly(door) or door_has_woofer_and_mid(door)
    us = populated(useat)
    kick_p = populated(kick)
    pillar_u = usable(pillar)
    sail_u = usable(sail)
    tweeter_loc = pillar_u or sail_u or dash_any or door_has_tweeter(door)
    center_p = populated(center)

    door_tw = door_has_tweeter(door)

    p = set()
    # Wideband + midbass
    if dash_large and door_mb:
        p.add("W-A")
    if dash_unsized and door_mb:
        p.add("W-A?")  # dash populated but size unparsed — verify >=3.5in on intake
    if dash_small and door_mb:
        p.add("W-B")
    if door_mid and us:
        p.add("W-C")
    if dash_any and us:
        p.add("W-D")
    if (pillar_u or sail_u) and door_mb and not dash_any:
        p.add("W-E")
    if not door_mb and not door_mid and (dash_any or center_p):
        p.add("W-F")
    if door_mid and not door_mb and not us and not dash_any and not center_p:
        # W-F door variant (pending ruling): door-mid is the ONLY front location
        # (C4 Corvette 4in sealed door class) — wideband there + front sub add-on
        p.add("W-F?")
    # Two-way component
    if pillar_u and door_mb:
        p.add("T-A")
    elif door_mb and not sail_u and not dash_any and not door_has_tweeter(door):
        # Brett ruling 2026-07-12: door-only cars go two-way — a surface-mount
        # tweeter is added to the A-pillar (standard add, not fabrication).
        p.add("T-A+")
    if (sail_u or door_tw) and door_mb:
        p.add("T-B")
    if dash_any and door_mb:
        p.add("T-C")
    if tweeter_loc and us:
        p.add("T-D")
    if tweeter_loc and kick_p:
        p.add("T-E")
    # Three-way component
    if dash_large and door_mb and tweeter_loc:
        p.add("3-A")
    if (pillar_u or sail_u) and door_mid and (door_mb or us or door_has_woofer_and_mid(door)):
        p.add("3-B")
    if dash_any and door_mb:
        p.add("3-C")
    return p

FIELDS = ["dash_speaker", "a_pillar_speaker", "sail_speaker", "center_speaker",
          "front_door_speaker", "rear_door_speaker", "underseat_speaker",
          "kick_panel_speaker", "rear_deck_speaker", "subwoofer"]

def main():
    conn = db()
    cur = conn.cursor()
    cur.execute(f"""select id, name, make, model, year_start, year_end, body_style,
                    audio_tier, {', '.join(FIELDS)} from factory_audio_layouts""")
    cols = [d[0] for d in cur.description]
    layouts = [dict(zip(cols, r)) for r in cur.fetchall()]
    print(f"{len(layouts)} layouts")

    profile_counts = Counter()
    per_layout = {}
    no_profile = []
    for l in layouts:
        p = resolve(l)
        per_layout[l["id"]] = p
        for code in p:
            profile_counts[code] += 1
        if not p:
            no_profile.append(l)

    print("\nProfile eligibility counts (layouts eligible per profile):")
    for code in ["W-A", "W-A?", "W-B", "W-C", "W-D", "W-E", "W-F", "W-F?",
                 "T-A", "T-A+", "T-B", "T-C", "T-D", "T-E", "3-A", "3-B", "3-C"]:
        print(f"  {code}: {profile_counts[code]}")
    print(f"\nLayouts with NO eligible profile: {len(no_profile)}")

    # calibration extras
    n_center = sum(1 for l in layouts if populated(l["center_speaker"]))
    n_pillar_empty = sum(1 for l in layouts if empty_provision(l["a_pillar_speaker"]))
    print(f"Center-dash hole populated: {n_center}   A-pillar empty provisions: {n_pillar_empty}")

    # spot checks
    print("\nSpot checks:")
    for label, where in [("2019 Ram 1500", lambda l: l["make"] == "Ram" and l["model"] == "1500"
                          and l["year_start"] <= 2019 <= l["year_end"]),
                         ("BMW F30", lambda l: l["make"] == "BMW" and "F30" in (l["name"] or "")),
                         ("'69 Mustang", lambda l: l["make"] == "Ford" and l["model"] == "Mustang"
                          and l["year_start"] <= 1969 <= l["year_end"])]:
        for l in layouts:
            if where(l):
                print(f"  {label}: [{l['audio_tier']}] {sorted(per_layout[l['id']])}  ({l['name'][:60]})")

    if "--examples" in sys.argv and no_profile:
        print("\nSample no-profile layouts:")
        for l in no_profile[:10]:
            print(" ", l["name"][:70], "| dash:", str(l["dash_speaker"])[:30],
                  "| door:", str(l["front_door_speaker"])[:35])

if __name__ == "__main__":
    main()
