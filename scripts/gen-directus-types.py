#!/usr/bin/env python3
"""Regenerate src/lib/directus-schema.ts from the live Directus schema.

Usage:  source .env && python3 scripts/gen-directus-types.py

Uses curl (not urllib) because the Render edge rejects non-browser TLS/UA
fingerprints. Collections that are folders (no table) are skipped.
"""
import json
import os
import subprocess
import sys
import time
from datetime import date

URL = os.environ.get("DIRECTUS_URL")
TOK = os.environ.get("DIRECTUS_TOKEN")
if not URL or not TOK:
    sys.exit("DIRECTUS_URL / DIRECTUS_TOKEN not set — run: source .env first")

COLLECTIONS = [
    "vehicles", "packages", "subwoofers", "enclosures", "enclosure_fitments",
    "mono_amps", "multichannel_amps", "dsp_processors", "front_subs",
    "electrical_tiers", "alternators", "batteries", "library",
    "vehicle_editorial", "install_types",
]

TS = {
    "string": "string", "text": "string", "uuid": "string", "hash": "string",
    "integer": "number", "bigInteger": "number", "float": "number", "decimal": "number",
    "boolean": "boolean", "timestamp": "string", "dateTime": "string", "date": "string",
    "json": "unknown", "csv": "string[]",
}

FIELD_TYPES = {
    ("vehicles", "has_fullrange_output"): "'true' | 'false' | 'option'",
}

SKIP_FIELDS = {"user_created", "user_updated", "sort"}


def get(path):
    for attempt in range(4):
        r = subprocess.run(
            ["curl", "-s", "-m", "20", URL + path, "-H", "Authorization: Bearer " + TOK],
            capture_output=True, text=True,
        )
        d = json.loads(r.stdout) if r.stdout else {}
        if "data" in d:
            return d["data"]
        if "errors" in d:
            return None  # folder or missing table
        time.sleep(1.5 * (attempt + 1))
    return None


out = [
    f"// GENERATED from the live Directus schema ({date.today().isoformat()}).",
    "// Regenerate with scripts/gen-directus-types.py — do not hand-edit field lists.",
    "",
]
done, skipped = [], []
for c in COLLECTIONS:
    fields = get("/fields/" + c)
    time.sleep(0.4)
    if fields is None:
        skipped.append(c)
        continue
    name = "".join(w.capitalize() for w in c.split("_"))
    out.append(f"export interface {name} {{")
    for f in fields:
        if f["field"].startswith("date_") or f["field"] in SKIP_FIELDS:
            continue
        ts = FIELD_TYPES.get((c, f["field"]), TS.get(f["type"], "unknown"))
        nullable = (f.get("schema") or {}).get("is_nullable", True)
        out.append(f"  {f['field']}: {ts}{' | null' if nullable else ''}")
    out.append("}")
    out.append("")
    done.append(c)

dest = os.path.join(os.path.dirname(__file__), "..", "src", "lib", "directus-schema.ts")
with open(dest, "w") as fh:
    fh.write("\n".join(out) + "\n")
print(f"generated {len(done)} interfaces; skipped: {', '.join(skipped) or 'none'}")
