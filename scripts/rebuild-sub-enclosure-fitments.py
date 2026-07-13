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
    (r"supercrew|crew[- ]?cab|crew[- ]?max|double[- ]?cab|mega[- ]?cab|quad[- ]?cab", "crew"),
    (r"super[- ]?cab|extended[- ]?cab|ext[- ]?cab|king[- ]?cab|access[- ]?cab", "ext"),
    (r"standard[- ]?cab|regular[- ]?cab|single[- ]?cab|std[- ]?cab", "single"),
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

def cab_type(label, url, slug):
    text = " ".join(filter(None, [label, url, slug])).lower()
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
        cab = cab_type(label, url, slug)

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
        if cab:
            cur.execute(q + " and (cab_type = %s or cab_type is null)", base_params + [cab])
            ids = [r[0] for r in cur.fetchall()]
            if not ids:
                # per-model cab_type data is unreliable (e.g. Tacoma Double Cab
                # rows are typed 'ext'); fall back to no cab filter, flagged.
                cur.execute(q, base_params)
                ids = [r[0] for r in cur.fetchall()]
                cab_note = f"cab={cab} per vendor; DB cab_type unreliable for this model — verify cab on intake"
        else:
            cur.execute(q, base_params)
            ids = [r[0] for r in cur.fetchall()]

        report.append((slug, vc, span, cab, len(ids)))
        if not ids:
            if vc in RETIRED_OK:
                report[-1] = (slug, vc, span, cab, 0)
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
    counts = sorted(report, key=lambda r: r[4])
    print("\nLowest match counts:")
    for slug, vc, span, cab, n in counts[:15]:
        print(f"  {n:5}  {slug[:40]:42} {vc[:28]:30} span={span} cab={cab}")
    print("\nHighest match counts:")
    for slug, vc, span, cab, n in counts[-10:]:
        print(f"  {n:5}  {slug[:40]:42} {vc[:28]:30} span={span} cab={cab}")

    if not write:
        print("\nDRY RUN — rerun with --write to archive old table and replace.")
        return

    stamp = datetime.date.today().isoformat()
    arc = f"/Users/brettcombs/Documents/NCSW Application/Data/db-archives/sub_enclosure_fitments_corrupted_archive_{stamp}.json"
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
