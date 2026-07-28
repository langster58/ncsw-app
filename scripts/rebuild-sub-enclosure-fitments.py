#!/usr/bin/env python3
"""Rebuild sub_enclosure_fitments from sub_enclosures vendor metadata.

Background: the vehicles retire-and-slim renumbered vehicle_id, which stranded
8,650 fitment refs and silently mismatched the other ~10.8k (e.g. a 1997-03 BMW
5-Series enclosure joined to 298 Fords). The old refs are unrecoverable-by-id,
but each vendor enclosure row carries its true fitment: vehicle_constraint
("Make/Model"), vehicle_label_raw ("2001-2003 Ford F150 Supercrew Cab ..."),
and vendor_url year spans. This script re-derives fitments from that metadata
against the CURRENT vehicles table.

Usage:
  python3 rebuild-sub-enclosure-fitments.py            # dry run, prints stats
  python3 rebuild-sub-enclosure-fitments.py --write    # archive old table + replace

DB creds: DATABASE_URL in ~/.config/directus-render.env
"""
import os, re, sys, json, uuid, datetime
import psycopg2

def db():
    env = {}
    with open(os.path.expanduser("~/.config/directus-render.env")) as f:
        for line in f:
            if "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    return psycopg2.connect(env["DATABASE_URL"])

CAB_PATTERNS = [
    (r"supercrew|crew[- ]?cab|crew[- ]?max|mega[- ]?cab", "crew"),
    (r"super[- ]?cab|extended[- ]?cab|ext[- ]?cab|king[- ]?cab|access[- ]?cab|quad[- ]?cab", "ext"),
    (r"standard[- ]?cab|regular[- ]?cab|single[- ]?cab|std[- ]?cab", "single"),
]

VARIANT_PATTERNS = [
    (r"crew[- ]?max", "CrewMax"),
    (r"mega[- ]?cab", "Mega Cab"),
    (r"super[- ]?crew(?:[- ]?cab)?", "SuperCrew"),
    (r"super[- ]?cab", "SuperCab"),
    (r"king[- ]?cab", "King Cab"),
    (r"access[- ]?cab", "Access Cab"),
    (r"xtra[- ]?cab", "XtraCab"),
    (r"quad[- ]?cab", "Quad Cab"),
    (r"club[- ]?cab", "Club Cab"),
    (r"double[- ]?cab", "Double Cab"),
    (r"crew[- ]?cab", "Crew Cab"),
    (r"extended[- ]?cab|ext[- ]?cab", "Extended Cab"),
    (r"standard[- ]?cab|regular[- ]?cab|single[- ]?cab|std[- ]?cab", "Regular Cab"),
]

# constraint-make/model -> vehicles-table (make, model) candidates
MODEL_ALIASES = {
    ("Dodge", "1500"): [("Ram", "1500"), ("Ram", "1500 Classic"), ("Dodge", "Ram Pickup 1500")],
    ("Dodge", "2500"): [("Ram", "2500"), ("Dodge", "Ram Pickup 2500")],
    ("Dodge", "3500"): [("Ram", "3500"), ("Dodge", "Ram Pickup 3500")],
    ("Hyundai", "Genesis Coupe"): [("Hyundai", "Genesis Coupe"), ("Genesis", "Genesis Coupe")],
    ("Hyundai", "Genesis"): [("Hyundai", "Genesis"), ("Genesis", "G70"), ("Genesis", "G80"), ("Genesis", "G90")],
    ("Lexus", "IS350"): [("Lexus", "IS")],
    ("Mazda", "Mazda3"): [("Mazda", "3"), ("Mazda", "Mazdaspeed 3")],
    ("Infiniti", "Q60"): [("Infiniti", "Q60"), ("Infiniti", "Q60 Coupe"), ("Infiniti", "Q60 Convertible")],
    ("Chevrolet", "S10"): [("Chevrolet", "S-10")],
}

# Models retired from the vehicles catalog entirely (retire-and-slim) — an
# enclosure for these correctly gets zero fitments; don't report as failure.
RETIRED_OK = {"Infiniti/G35", "Infiniti/G37", "Infiniti/I35", "Infiniti/QX4",
              "Mercury/Milan", "Pontiac/G5", "Pontiac/G6", "Pontiac/G8"}

CONTROLLED_TRUCKS = {
    "Ford/Ranger", "Nissan/Frontier", "Toyota/Tacoma", "Ford/F-150",
    "Dodge/1500", "Dodge/2500", "Dodge/3500",
    "Ram/1500", "Ram/1500 Classic", "Ram/2500", "Ram/3500",
}

def year_span(label, url, slug):
    """Extract (y0, y1) from label_raw first, then vendor_url, then slug digits."""
    for text in (label or "", url or ""):
        m = re.search(r"\b(19[89]\d|20[0-3]\d)\s*[-–&]\s*(19[89]\d|20[0-3]\d|\d{2})\b", text)
        if m:
            y0 = int(m.group(1))
            y1 = int(m.group(2))
            if y1 < 100:
                y1 += 2000 if y1 <= 39 else 1900
            if y0 <= y1:
                return y0, y1
        m = re.search(r"\b(19[89]\d|20[0-3]\d)\s*(?:&\s*(?:amp;)?\s*)?(older|newer|up|\+)", text, re.I)
        if m:
            y = int(m.group(1))
            return (1980, y) if m.group(2).lower() == "older" else (y, 2026)
        m = re.search(r"\b(19[89]\d|20[0-3]\d)\b", text)
        if m:
            y = int(m.group(1))
            return y, y  # single year: conservative
    m = re.search(r"/(\d{4})-(\d{2})-", url or "")
    if m:
        y0 = int(m.group(1)); y1 = int(m.group(2)) + 2000
        if y0 <= y1:
            return y0, y1
    m = re.search(r"-(\d{2})-(\d{2})-", url or "")
    if m:
        def pivot(y):
            return y + (1900 if y > 26 else 2000)
        y0, y1 = pivot(int(m.group(1))), pivot(int(m.group(2)))
        if y0 <= y1:
            return y0, y1
    return None

def normalized_variants(text, vehicle_constraint):
    found = {name for pattern, name in VARIANT_PATTERNS if re.search(pattern, text or "", re.I)}
    # A phrase such as "SuperCrew Cab" also contains "Crew Cab". Keep only the
    # manufacturer's more specific physical-cab name.
    if "SuperCrew" in found:
        found.discard("Crew Cab")
    if "Extended Cab" in found:
        found.remove("Extended Cab")
        if vehicle_constraint in {"Ford/F-150", "Ford/Ranger"}:
            found.add("SuperCab")
        elif vehicle_constraint == "Nissan/Frontier":
            found.add("King Cab")
        elif vehicle_constraint == "Toyota/Tacoma":
            found.update({"XtraCab", "Access Cab"})
        else:
            found.add("Extended Cab")
    return found


def cab_variant(label, url, slug, vehicle_constraint):
    """Return (acceptable exact variants, conflict).

    The product description is preferred over slug/URL metadata, but a direct
    disagreement between a single label variant and a single URL variant fails
    closed instead of silently choosing one.
    """
    label_variants = normalized_variants(label or "", vehicle_constraint)
    url_variants = normalized_variants(" ".join(filter(None, [url, slug])), vehicle_constraint)
    if len(label_variants) == 1 and len(url_variants) == 1 and label_variants != url_variants:
        return set(), f"cab variant conflict label={sorted(label_variants)} url={sorted(url_variants)}"
    if label_variants:
        return label_variants, None
    return url_variants, None


def cab_type(label, url, slug, vehicle_constraint):
    text = " ".join(filter(None, [label, url, slug])).lower()
    if re.search(r"double[- ]?cab", text):
        # "Double Cab" names different physical cabins by make. Tacoma uses it
        # for the full crew cab; Tundra and GM use it for the shorter four-door
        # cab. Never treat this as a universal alias.
        if vehicle_constraint in {"Toyota/Tundra", "Chevrolet/Silverado", "GMC/Sierra"}:
            return "ext"
        return "crew"
    for pat, cab in CAB_PATTERNS:
        if re.search(pat, text):
            return cab
    return None

def main():
    write = "--write" in sys.argv
    conn = db()
    cur = conn.cursor()
    cur.execute("""select slug, vehicle_constraint, vehicle_label_raw, vendor_url
                   from sub_enclosures where vendor_url is not null order by slug""")
    enclosures = cur.fetchall()

    fitments, report, unmatched = [], [], []
    for slug, vc, label, url in enclosures:
        if "/" not in (vc or ""):
            unmatched.append((slug, "no make/model constraint", vc))
            continue
        make, model = vc.split("/", 1)
        candidates = MODEL_ALIASES.get((make, model), [(make, model)])
        span = year_span(label, url, slug)
        cab = cab_type(label, url, slug, vc)
        variants, variant_conflict = cab_variant(label, url, slug, vc)
        if vc in CONTROLLED_TRUCKS and not variants and not variant_conflict:
            variant_conflict = "no exact physical cab variant in vendor metadata"
        if vc in CONTROLLED_TRUCKS and not span and not variant_conflict:
            variant_conflict = "no year span in vendor metadata"

        clauses, params = [], []
        for m_make, m_model in candidates:
            clauses.append("(make = %s and model = %s)")
            params.extend([m_make, m_model])
        q = f"select vehicle_id from vehicles where ({' or '.join(clauses)})"
        base_params = list(params)
        if span:
            q += " and year between %s and %s"
            base_params.extend(span)

        cab_note = f"cab={cab}"
        ids = []
        if variant_conflict:
            unmatched.append((slug, variant_conflict, vc))
        elif cab:
            exact_q = q + " and cab_type = %s"
            exact_params = base_params + [cab]
            if variants:
                exact_q += " and (cargo_body_variant = any(%s) or cargo_body_variant is null)"
                exact_params.append(sorted(variants))
                cab_note += f"; variants={','.join(sorted(variants))}"
            cur.execute(exact_q, exact_params)
            ids = [r[0] for r in cur.fetchall()]
        else:
            cur.execute(q, base_params)
            ids = [r[0] for r in cur.fetchall()]

        report.append((slug, vc, span, cab, sorted(variants), len(ids)))
        if not ids and not variant_conflict:
            if vc in RETIRED_OK:
                report[-1] = (slug, vc, span, cab, sorted(variants), 0)
            else:
                unmatched.append((slug, f"0 vehicles for {vc} span={span} cab={cab}", vc))
        for vid in ids:
            note = f"constraint={vc}; span={span}; {cab_note}"
            if span is None:
                note += "; year span unparsed from vendor data — verify years on intake"
            fitments.append((str(uuid.uuid4()), slug, vid,
                             "rebuilt-from-vendor-metadata-2026-07-12", note))

    print(f"{len(enclosures)} enclosures -> {len(fitments)} fitments; "
          f"{len(unmatched)} enclosures unmatched")
    print("\nWorst/none matchers:")
    for slug, why, vc in unmatched[:25]:
        print(f"  {slug[:44]:46} {why}")
    counts = sorted(report, key=lambda r: r[5])
    print("\nLowest match counts:")
    for slug, vc, span, cab, variants, n in counts[:15]:
        print(f"  {n:5}  {slug[:40]:42} {vc[:28]:30} span={span} cab={cab}")
    print("\nHighest match counts:")
    for slug, vc, span, cab, variants, n in counts[-10:]:
        print(f"  {n:5}  {slug[:40]:42} {vc[:28]:30} span={span} cab={cab}")

    print("\nControlled truck products:")
    for slug, vc, span, cab, variants, n in report:
        if vc in CONTROLLED_TRUCKS:
            print(f"  {n:5}  {slug[:40]:42} {vc[:20]:22} "
                  f"span={span} variants={','.join(variants) or 'NONE'}")

    if not write:
        print("\nDRY RUN — rerun with --write to archive old table and replace.")
        return

    stamp = datetime.date.today().isoformat()
    archive_dir = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "output", "db-archives")
    )
    os.makedirs(archive_dir, exist_ok=True)
    arc = os.path.join(
        archive_dir, f"sub_enclosure_fitments_corrupted_archive_{stamp}.json"
    )
    cur.execute("select id, sub_enclosure_slug, vehicle_id, source, notes, sort, date_created from sub_enclosure_fitments")
    old = [dict(zip([d[0] for d in cur.description], r)) for r in cur.fetchall()]
    with open(arc, "w") as f:
        json.dump(old, f, default=str)
    print(f"archived {len(old)} old rows -> {arc}")

    cur.execute("delete from sub_enclosure_fitments")
    from psycopg2.extras import execute_values
    execute_values(cur,
        """insert into sub_enclosure_fitments (id, sub_enclosure_slug, vehicle_id, source, notes)
           values %s""", fitments)
    conn.commit()
    print(f"wrote {len(fitments)} rebuilt fitments")

if __name__ == "__main__":
    main()
