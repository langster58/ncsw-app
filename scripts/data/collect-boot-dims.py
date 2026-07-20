#!/usr/bin/env python3
"""Collect boot linear dimensions per family from free web snippets.

For each pending boot_families row (newest first), runs ONE DuckDuckGo HTML
search, extracts trunk/cargo W-D-H candidates from the result snippets, and:
  - clean hit + passes the volume sanity gate  -> writes dims, dims_status='snippet'
  - partial/ambiguous                          -> dims_status='review' + evidence JSONL
  - nothing usable                             -> dims_status='no_data'
Derived fallback stays in force for review/no_data rows — the package math never
waits on this collector.

Free endpoint, no API key. Politely rate-limited (~1 request / 2.5-3.5 s).
Resumable: only rows with dims_status='pending' are fetched; rerun continues.

Usage:
  collect-boot-dims.py [--limit=N] [--style=Sedan]     # newest-first sweep
"""
import json, os, random, re, sys, time, urllib.parse, urllib.request
import psycopg2

EVIDENCE = "/Volumes/SSD 1TB/NCSW Application/Data/boot-dims-evidence.jsonl"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
TRUNK_STYLES = {"Sedan", "Coupe", "Convertible"}

args = {a.split("=")[0]: (a.split("=", 1)[1] if "=" in a else True) for a in sys.argv[1:]}
LIMIT = int(args.get("--limit", 10**9))
STYLE = args.get("--style")

def db():
    env = {}
    with open(os.path.expanduser("~/.config/directus-render.env")) as f:
        for line in f:
            if "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    return psycopg2.connect(env["DATABASE_URL"])

def ddg(query):
    url = "https://html.duckduckgo.com/html/?" + urllib.parse.urlencode({"q": query})
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "en-US"})
    with urllib.request.urlopen(req, timeout=25) as r:
        html = r.read().decode("utf-8", "replace")
    # result snippets live in <a class="result__snippet" ...>text</a>
    snips = re.findall(r'class="result__snippet"[^>]*>(.*?)</a>', html, re.S)
    return [re.sub(r"<[^>]+>", " ", s) for s in snips][:10]

NUM = r"(\d{1,2}(?:\.\d)?)"
CTX = re.compile(r"\b(trunk|cargo|boot|luggage)\b", re.I)
TRIPLE = re.compile(NUM + r'\s*(?:"|in(?:ches)?\b)?\s*(?:x|by|×)\s*' + NUM +
                    r'\s*(?:"|in(?:ches)?\b)?\s*(?:x|by|×)\s*' + NUM, re.I)
LABELED = {
    "depth":  re.compile(NUM + r'\s*(?:"|in(?:ches)?)?\s*(?:deep|of depth|long|in length)|'
                         r'depth(?:\s*(?:of|:|is))?\s*' + NUM, re.I),
    "width":  re.compile(NUM + r'\s*(?:"|in(?:ches)?)?\s*(?:wide|of width|between the wheel\s?-?\s?(?:wells|houses?|housings))|'
                         r'width(?:\s*(?:of|:|is))?\s*' + NUM, re.I),
    "height": re.compile(NUM + r'\s*(?:"|in(?:ches)?)?\s*(?:tall|high|of height)|'
                         r'height(?:\s*(?:of|:|is))?\s*' + NUM, re.I),
}
BOUNDS = {"width": (28, 62), "depth": (10, 65), "height": (8, 50)}

def plausible(kind, v):
    lo, hi = BOUNDS[kind]
    return lo <= v <= hi

def extract(snippets):
    """Return (dims dict, evidence list). Labeled beats positional triples."""
    dims, evid = {}, []
    text_all = "  ".join(snippets)
    for kind, pat in LABELED.items():
        for m in pat.finditer(text_all):
            v = float(next(g for g in m.groups() if g))
            if plausible(kind, v) and CTX.search(text_all[max(0, m.start()-120):m.end()+120]):
                dims.setdefault(kind, []).append(v)
                evid.append(f"{kind}={v}: …{text_all[max(0,m.start()-60):m.end()+40].strip()}…")
    for m in TRIPLE.finditer(text_all):
        ctxwin = text_all[max(0, m.start()-120):m.end()+120]
        if not CTX.search(ctxwin):
            continue
        vals = sorted(float(v) for v in m.groups())
        h, d, w = vals            # trunk convention: W >= D >= H
        if plausible("width", w) and plausible("depth", d) and plausible("height", h):
            dims.setdefault("width", []).append(w)
            dims.setdefault("depth", []).append(d)
            dims.setdefault("height", []).append(h)
            evid.append(f"triple {w}x{d}x{h}: …{ctxwin.strip()[:120]}…")
    out = {}
    for kind, vals in dims.items():
        vals.sort()
        out[kind] = vals[len(vals)//2]     # median of found values
    return out, evid

def gate(dims, rated_ft3, style):
    if not rated_ft3:
        return True     # nothing to check against
    box = dims["width"] * dims["depth"] * dims["height"] / 1728.0
    lo, hi = (0.55, 1.8) if style in TRUNK_STYLES else (0.25, 1.3)
    return lo * rated_ft3 <= box <= hi * rated_ft3

conn = db(); cur = conn.cursor()
where = "dims_status='pending' and body_style <> 'Truck'"
params = []
if STYLE:
    where += " and body_style=%s"; params.append(STYLE)
cur.execute(f"""select id, make, model, body_style, year_start, year_end, vehicle_ids
                from boot_families where {where}
                order by year_end desc, year_start desc limit %s""", params + [LIMIT])
fams = cur.fetchall()
print(f"queue: {len(fams)} families")

stats = {"snippet": 0, "review": 0, "no_data": 0}
for i, (fid, make, model, style, ys, ye, vids) in enumerate(fams):
    cur.execute("""select percentile_cont(0.5) within group (order by luggage_volume_cuft)
                   from vehicles where vehicle_id::text = any(%s) and luggage_volume_cuft > 0""", (vids,))
    rated = cur.fetchone()[0]
    kind = "trunk dimensions" if style in TRUNK_STYLES else "cargo area dimensions"
    q = f"{ys if ys == ye else f'{ys}'} {make} {model} {kind} inches wide deep"
    try:
        snips = ddg(q)
    except Exception as e:
        print(f"  FETCH FAIL ({e}) — stopping to be polite; resume later")
        break
    dims, evid = extract(snips)
    if {"width", "depth", "height"} <= dims.keys() and gate(dims, rated, style):
        cur.execute("""update boot_families set boot_width_in=%s, boot_depth_in=%s,
                       boot_height_in=%s, dims_status='snippet' where id=%s""",
                    (dims["width"], dims["depth"], dims["height"], fid))
        stats["snippet"] += 1
        tag = "OK  "
    elif dims:
        cur.execute("update boot_families set dims_status='review' where id=%s", (fid,))
        with open(EVIDENCE, "a") as f:
            f.write(json.dumps({"family_id": fid, "name": f"{ys}-{ye} {make} {model} [{style}]",
                                "rated_ft3": float(rated) if rated else None,
                                "partial": dims, "evidence": evid, "query": q}) + "\n")
        stats["review"] += 1
        tag = "REV "
    else:
        cur.execute("update boot_families set dims_status='no_data' where id=%s", (fid,))
        stats["no_data"] += 1
        tag = "none"
    conn.commit()
    print(f"  [{i+1}/{len(fams)}] {tag} {ys}-{ye} {make} {model} [{style}] "
          + (f"W{dims.get('width')} D{dims.get('depth')} H{dims.get('height')}" if dims else ""))
    time.sleep(2.5 + random.random())

print(f"\ndone: {stats}")
