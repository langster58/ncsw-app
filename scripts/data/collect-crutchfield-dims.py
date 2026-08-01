#!/usr/bin/env python3
"""Harvest Crutchfield's measured trunk/cargo dimensions for the fit filter.

WHY THIS SOURCE: Crutchfield's Vehicle Research Team measures cars in person and
publishes the result *framed as the space available for a subwoofer box* — e.g.
2013-2020 Ford Fusion: 37" W x 19" H x 38"/32" D. That is exactly the number the
PLP fit filter needs, and unlike SAE luggage volume it describes a rectangular
buildable space. One page per generation, which maps onto our make/model/year rows.

ACCESS: crutchfield.com's WAF returns 403 to direct fetches even with a browser
UA (their robots.txt separately grants ClaudeBot with crawl-delay 1). The pages
are read here through the public Wayback Machine instead. Paced + backed off:
archive.org rate-limits aggressively.

PHASES (each resumable; re-running skips completed work):
  --enumerate  Wayback CDX index -> data/crutchfield_urls.txt (one line per page)
  --fetch      fetch + regex-extract -> data/crutchfield_dims.jsonl (append-only)
  --match      join to the vehicles table -> staging/crutchfield-dims-review.md

Extraction is pure regex in this script — no model inference per page, so the
token cost of a full sweep is ~zero. The cost is wall clock.

NOTHING IS WRITTEN TO THE DATABASE. --match produces a review file only; a
separate approved step applies it.
"""
import argparse, html, json, os, re, subprocess, sys, time, urllib.error, urllib.request
from pathlib import Path

BASE = Path(__file__).resolve().parents[2]           # ncsw-app/
DATA = BASE / "scripts" / "data"
URLS = DATA / "crutchfield_urls.txt"
DIMS = DATA / "crutchfield_dims.jsonl"
REVIEW = Path("/Volumes/SSD 1TB/Database/staging/crutchfield-dims-review.md")
DBQ = "/Volumes/SSD 1TB/NCSW Application/Data/dbq.py"

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " \
     "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
CDX = ("https://web.archive.org/cdx/search/cdx?url=crutchfield.com/learn/*"
       "&output=text&fl=original&collapse=urlkey"
       "&filter=original:.*learn/(19|20)[0-9]{2}.*")
SNAP = "https://web.archive.org/web/3000id_/{}"   # 3000 = "newest capture available"
PACE = 2.0            # seconds between archive.org hits
MAX_RETRY = 4


def get(url, timeout=45):
    """Fetch with backoff on 429/5xx. Returns text or None."""
    delay = PACE
    for attempt in range(MAX_RETRY):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            if e.code in (429, 503, 502, 504):
                delay *= 2.5
                sys.stderr.write(f"  {e.code}, backing off {delay:.0f}s\n")
                time.sleep(delay)
                continue
            return None
        except Exception:
            time.sleep(delay)
            delay *= 2
    return None


# ---------------------------------------------------------------- 1. enumerate

def enumerate_pages():
    raw = get(CDX, timeout=180)
    if not raw:
        sys.exit("CDX index unreachable (rate-limited?) — wait and retry.")
    seen = set()
    for line in raw.splitlines():
        u = line.strip().replace(":80", "")
        u = re.sub(r"^http:", "https:", u).split("?")[0]
        if re.search(r"/learn/\d{4}[^/]*\.html$", u):
            seen.add(u)
    URLS.write_text("\n".join(sorted(seen)) + "\n")
    print(f"enumerated {len(seen)} vehicle pages -> {URLS}")


# -------------------------------------------------------------------- 2. fetch
# Crutchfield writes dimensions several ways; parse by LABEL not position:
#   37" W x 19" H x 38"/32" D        39"W x 16"H x 36"/43"D
#   35" W x 11" H x 35" D            45" W x 10" D x 22" H   <- W x D x H order!
DIM_TOKEN = re.compile(
    r'(\d+(?:\.\d+)?)\s*(?:"|”)\s*(?:/\s*(\d+(?:\.\d+)?)\s*(?:"|”)\s*)?\s*\b([WHD])\b')
SENT_SPLIT = re.compile(r'(?<=[.!?])\s+')


def extract(text):
    """Return list of {sentence, w, h, d, d2} for every dimension sentence."""
    plain = html.unescape(re.sub(r"<[^>]+>", " ", text))
    plain = re.sub(r"\s+", " ", plain)
    out = []
    for sent in SENT_SPLIT.split(plain):
        toks = DIM_TOKEN.findall(sent)
        if len(toks) < 3:
            continue
        rec = {"sentence": sent.strip()[:400]}
        for first, second, label in toks:
            key = label.lower()
            if key in rec:                      # keep the first of each label
                continue
            rec[key] = float(first)
            if second:
                rec[key + "2"] = float(second)
        if {"w", "h", "d"} <= rec.keys():
            out.append(rec)
    return out


def fetch_all(limit=None):
    if not URLS.exists():
        sys.exit("run --enumerate first")
    urls = [u for u in URLS.read_text().split() if u]
    done = set()
    if DIMS.exists():
        for line in DIMS.read_text().splitlines():
            try:
                done.add(json.loads(line)["url"])
            except Exception:
                pass
    todo = [u for u in urls if u not in done]
    if limit:
        todo = todo[:limit]
    print(f"{len(done)} already fetched, {len(todo)} to go")
    hits = 0
    with DIMS.open("a") as fh:
        for i, u in enumerate(todo, 1):
            body = get(SNAP.format(u))
            found = extract(body) if body else []
            fh.write(json.dumps({"url": u, "ok": bool(body), "dims": found}) + "\n")
            fh.flush()
            if found:
                hits += 1
            if i % 25 == 0 or found:
                print(f"[{i}/{len(todo)}] {'HIT ' if found else '    '}{u.split('/')[-1]}")
            time.sleep(PACE)
    print(f"done: {hits}/{len(todo)} pages carried dimensions")


# -------------------------------------------------------------------- 3. match

SLUG_STOP = re.compile(r"-(sedan|coupe|hatchback|wagon|convertible|crew|quad|regular|"
                       r"extended|super|double|club|access|king|mega|cab|with|without|"
                       r"base|premium|w|no)\b")


def parse_slug(url):
    """'/learn/2002-04-ford-explorer.html' -> (2002, 2004, 'ford explorer')."""
    s = url.rsplit("/", 1)[-1][:-5]
    m = re.match(r"^(\d{4})(?:-(\d{2,4})|-(up))?-(.+)$", s)
    if not m:
        return None
    y0 = int(m.group(1))
    if m.group(3):
        y1 = 2100
    elif m.group(2):
        e = m.group(2)
        y1 = int(e) if len(e) == 4 else int(str(y0)[:2] + e)
    else:
        y1 = y0
    return y0, y1, m.group(4).replace("-", " ")


def match_all():
    rows = subprocess.run(["python3", DBQ,
        "SELECT DISTINCT make, model FROM vehicles WHERE vehicle_category IN "
        "('trunk','cargo') ORDER BY 1,2"], capture_output=True, text=True)
    pairs = []
    for ln in rows.stdout.splitlines()[1:]:
        if "\t" in ln:
            mk, md = ln.split("\t")[:2]
            pairs.append((mk, md, f"{mk} {md}".lower().replace("-", " ")))
    recs, unmatched = [], []
    for line in DIMS.read_text().splitlines():
        try:
            r = json.loads(line)
        except Exception:
            continue
        if not r.get("dims"):
            continue
        p = parse_slug(r["url"])
        if not p:
            continue
        y0, y1, name = p
        name = SLUG_STOP.sub("", name).strip()
        hit = max((pr for pr in pairs if name.startswith(pr[2]) or pr[2] == name),
                  key=lambda pr: len(pr[2]), default=None)
        d = r["dims"][0]
        entry = dict(url=r["url"], y0=y0, y1=y1, slug_name=name,
                     w=d.get("w"), h=d.get("h"), d=d.get("d"), d2=d.get("d2"),
                     sentence=d["sentence"], variants=len(r["dims"]))
        (recs if hit else unmatched).append(
            {**entry, "make": hit[0], "model": hit[1]} if hit else entry)

    REVIEW.parent.mkdir(parents=True, exist_ok=True)
    L = ["# Crutchfield measured dimensions — review", "",
         "Source: Crutchfield Vehicle Research Team, in-person measurements, read via",
         "the Wayback Machine. Framed by Crutchfield as the space available for a",
         "subwoofer box. NOT yet written to the database.", "",
         f"- matched to vehicles rows: **{len(recs)}**",
         f"- dimensions found but model unmatched: **{len(unmatched)}**", "",
         "## Matched", "",
         "| make | model | years | W | H | D | D2 | our CF | source sentence |",
         "|---|---|---|---|---|---|---|---|---|"]
    for r in sorted(recs, key=lambda x: (x["make"], x["model"], x["y0"])):
        cf = r["w"] * r["h"] * r["d"] / 1728.0 if all((r["w"], r["h"], r["d"])) else 0
        L.append(f"| {r['make']} | {r['model']} | {r['y0']}–{r['y1']} | {r['w']} | "
                 f"{r['h']} | {r['d']} | {r.get('d2') or ''} | {cf:.1f} | "
                 f"{r['sentence'][:110]} |")
    if unmatched:
        L += ["", "## Unmatched slugs (need a make/model alias)", "",
              "| slug | years | W | H | D |", "|---|---|---|---|---|"]
        for r in sorted(unmatched, key=lambda x: x["slug_name"]):
            L.append(f"| {r['slug_name']} | {r['y0']}–{r['y1']} | {r['w']} | {r['h']} | {r['d']} |")
    REVIEW.write_text("\n".join(L) + "\n")
    print(f"matched {len(recs)}, unmatched {len(unmatched)} -> {REVIEW}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--enumerate", action="store_true")
    ap.add_argument("--fetch", action="store_true")
    ap.add_argument("--match", action="store_true")
    ap.add_argument("--limit", type=int)
    a = ap.parse_args()
    if a.enumerate:
        enumerate_pages()
    if a.fetch:
        fetch_all(a.limit)
    if a.match:
        match_all()
    if not any((a.enumerate, a.fetch, a.match)):
        ap.print_help()
