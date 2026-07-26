#!/usr/bin/env python3
"""Find cargo/trunk dimension evidence without using an LLM.

The collector works at the physical-family level:
    (make, model, body_style, generation, doors)

It reads unresolved families from the live vehicles table, searches Brave once
per family, fetches only the strongest candidate pages, and extracts short
verbatim windows around dimension-like text. It never writes to the database.

Door count is a body boundary. When a model-generation contains more than one
door variant, fetched evidence must state the matching door count before it can
qualify for review. Unknown and conflicting door counts stay separate rather
than allowing dimensions to cross physical bodies.

The JSON report is an ephemeral review artifact. Keep it under /tmp unless a
durable report is explicitly wanted.

Examples:
    python3 scripts/data/collect-boot-dim-candidates.py --self-test
    python3 scripts/data/collect-boot-dim-candidates.py \
        --limit=50 --output=/tmp/ncsw-boot-dim-pilot.json
"""

from __future__ import annotations

import argparse
import concurrent.futures
import html
import json
import os
import re
import subprocess
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import psycopg2


BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search"
USER_AGENT = "NorthCoastSoundworksResearch/1.0"
TRUNK_STYLES = {"Sedan", "Coupe", "Convertible"}
EXCLUDED_HOST_FRAGMENTS = {
    "amazon.",
    "aliexpress.",
    "carid.",
    "cargoliner.",
    "crutchfield.",
    "ebay.",
    "husky-liners.",
    "huskyliners.",
    "temu.",
    "weathertech.",
    "walmart.",
}
PREFERRED_HOST_FRAGMENTS = {
    "audizine.",
    "bimmerfest.",
    "bimmerpost.",
    "clublexus.",
    "corvetteforum.",
    "diymobileaudio.",
    "expeditionforum.",
    "forum.",
    "forums.",
    "ih8mud.",
    "naxja.",
    "pacificaforums.",
    "r3vlimited.",
    "rav4world.",
    "rennlist.",
    "siennachat.",
    "thirdgen.",
    "toyotanation.",
    "vwvortex.",
}
GENERIC_HINT_HOST_FRAGMENTS = {
    "archive.org",
    "caranddriver.",
    "carbuzz.",
    "cardealerships.",
    "carfolio.",
    "cargurus.",
    "carsguide.",
    "carspecs.",
    "edmunds.",
    "iseecars.",
    "jdpower.",
    "kbb.",
    "thecarconnection.",
    "ultimatespecs.",
    "wheel-size.",
    "wikipedia.",
    "youtube.",
}

NUMBER = r"\d{1,3}(?:\.\d+)?"
UNIT = r"(?:in(?:ch(?:es)?)?|[\"”])"
DIMENSION_CONTEXT = re.compile(
    r"\b(?:boots?|cargo|luggage|trunks?|load(?:ing)?|wheel\s*wells?|hatch|rear\s+area)\b",
    re.I,
)
LABELED_DIMENSION = re.compile(
    rf"(?:"
    rf"\b(?:width|wide|depth|deep|length|long|height|high|tall)\b"
    rf"[\s:=\-]*(?:is\s+|of\s+|about\s+|approximately\s+|roughly\s+)?{NUMBER}\s*{UNIT}"
    rf"|{NUMBER}\s*{UNIT}\s*(?:wide|deep|long|high|tall)\b"
    rf"|between\s+(?:the\s+)?wheel\s*wells?[\s:=\-]*(?:is\s+)?{NUMBER}\s*{UNIT}"
    rf")",
    re.I,
)
TRIPLE = re.compile(
    rf"\b{NUMBER}\s*(?:{UNIT}\s*)?[x×]\s*"
    rf"{NUMBER}\s*(?:{UNIT}\s*)?[x×]\s*"
    rf"{NUMBER}\s*{UNIT}\b",
    re.I,
)
ORDERED_TRIPLE = re.compile(
    rf"\b(?:w(?:idth)?\s*[x×]\s*d(?:epth)?\s*[x×]\s*h(?:eight)?"
    rf"|l(?:ength)?\s*[x×]\s*w(?:idth)?\s*[x×]\s*h(?:eight)?)\b"
    rf".{{0,80}}{NUMBER}",
    re.I,
)
EXTERIOR_CONTEXT = re.compile(
    r"\b(?:exterior|overall|wheelbase|track\s+width|vehicle\s+(?:is|measures)|"
    r"body\s+(?:is|measures)|ground\s+clearance|curb\s+weight)\b",
    re.I,
)
VALUE_AFTER_LABEL = re.compile(
    rf"\b(?P<label>width|depth|length|height)\b"
    rf"[\s:=\-]*(?:is\s+|of\s+|about\s+|approximately\s+|roughly\s+)?"
    rf"(?P<value>{NUMBER})\s*(?P<unit>{UNIT})",
    re.I,
)
VALUE_BEFORE_ADJECTIVE = re.compile(
    rf"(?P<value>{NUMBER})\s*(?P<unit>{UNIT})\s*"
    rf"(?P<label>width|depth|length|height|wide|deep|long|high|tall)\b",
    re.I,
)
BETWEEN_WHEELS = re.compile(
    rf"between\s+(?:the\s+)?wheel\s*wells?"
    rf"[\s:=\-]*(?:is\s+|of\s+|about\s+|approximately\s+|roughly\s+)?"
    rf"(?P<value>{NUMBER})\s*(?P<unit>{UNIT})",
    re.I,
)
HTML_SCRIPT_STYLE = re.compile(
    r"<(?:script|style|noscript)\b[^>]*>.*?</(?:script|style|noscript)>",
    re.I | re.S,
)
HTML_TAG = re.compile(r"<[^>]+>")


@dataclass(frozen=True)
class Family:
    make: str
    model: str
    body_style: str
    generation: str
    doors: int | None
    year_start: int
    year_end: int
    vehicle_rows: int
    door_variant_count: int

    @property
    def key(self) -> str:
        return "|".join(
            (
                self.make,
                self.model,
                self.body_style,
                self.generation,
                f"{self.doors}-door" if self.doors is not None else "doors-unknown",
            )
        )


@dataclass
class SearchResult:
    title: str
    url: str
    description: str
    host: str
    score: int
    search_has_dimensions: bool
    model_match: bool
    year_match: bool | None
    door_match: bool | None
    body_style_match: bool | None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=50)
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--workers", type=int, default=5)
    parser.add_argument("--results-per-search", type=int, default=10)
    parser.add_argument("--pages-per-family", type=int, default=2)
    parser.add_argument(
        "--status",
        choices=("untouched", "pending"),
        default="untouched",
    )
    parser.add_argument("--output", type=Path)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    for name in ("limit", "workers", "results_per_search", "pages_per_family"):
        if getattr(args, name) < 1:
            parser.error(f"--{name.replace('_', '-')} must be positive")
    if args.offset < 0:
        parser.error("--offset cannot be negative")
    return args


def load_key_values(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip("'\"")
    return values


def database_connection():
    values = load_key_values(Path.home() / ".config" / "directus-render.env")
    return psycopg2.connect(values["DATABASE_URL"])


def read_families(limit: int, offset: int, status: str) -> list[Family]:
    connection = database_connection()
    try:
        cursor = connection.cursor()
        status_clause = (
            "dims_status is null"
            if status == "untouched"
            else "dims_status = 'pending'"
        )
        cursor.execute(
            f"""
            with door_variants as (
                select make, model, body_style, generation,
                       count(distinct coalesce(doors, -1))::int
                           as door_variant_count
                  from vehicles
                 where body_style <> 'Truck'
                 group by make, model, body_style, generation
            ),
            unresolved as (
                select make, model, body_style, generation, doors,
                       min(year)::int as year_start,
                       max(year)::int as year_end,
                       count(*)::int as vehicle_rows
                  from vehicles
                 where body_style <> 'Truck'
                   and {status_clause}
                   and boot_width_in is null
                   and boot_depth_in is null
                   and boot_height_in is null
                 group by make, model, body_style, generation, doors
            )
            select u.make, u.model, u.body_style, u.generation, u.doors,
                   u.year_start, u.year_end, u.vehicle_rows,
                   d.door_variant_count
              from unresolved u
              join door_variants d
                using (make, model, body_style, generation)
             order by u.vehicle_rows desc, u.make, u.model, u.generation,
                      u.doors nulls last
             limit %s offset %s
            """,
            (limit, offset),
        )
        return [Family(*row) for row in cursor.fetchall()]
    finally:
        connection.close()


def read_domain_hints() -> dict[tuple[str, ...], list[str]]:
    connection = database_connection()
    try:
        cursor = connection.cursor()
        cursor.execute(
            """
            select make, model, dims_source_url
              from vehicles
             where body_style <> 'Truck'
               and dims_source_url is not null
             group by make, model, dims_source_url
            """
        )
        by_model: dict[tuple[str, ...], Counter[str]] = {}
        by_make: dict[tuple[str, ...], Counter[str]] = {}
        for make, model, source_urls in cursor.fetchall():
            for source_url in str(source_urls).split(" | "):
                host = host_of(source_url.strip())
                if not host or any(
                    fragment in host
                    for fragment in (
                        EXCLUDED_HOST_FRAGMENTS
                        | GENERIC_HINT_HOST_FRAGMENTS
                    )
                ):
                    continue
                by_model.setdefault((make, model), Counter())[host] += 1
                by_make.setdefault((make,), Counter())[host] += 1
        hints: dict[tuple[str, ...], list[str]] = {}
        for key, counts in {**by_make, **by_model}.items():
            hints[key] = [host for host, _ in counts.most_common(3)]
        return hints
    finally:
        connection.close()


def family_domain_hints(
    family: Family, hints: dict[tuple[str, ...], list[str]]
) -> list[str]:
    # A make-level fallback is unsafe: a Honda Civic forum can cover only one
    # generation, and a Ford Expedition forum says nothing about a Galaxie.
    # Reuse a domain only when prior evidence ties it to the same model.
    return hints.get((family.make, family.model), [])


def build_query(family: Family, domain_hint: str | None = None) -> str:
    area = "trunk" if family.body_style in TRUNK_STYLES else "cargo area"
    representative_year = family.year_start
    doors = f'"{family.doors}-door" ' if family.doors is not None else ""
    if domain_hint:
        target = (
            "trunk dimensions size"
            if area == "trunk"
            else "cargo area dimensions measurements"
        )
        return (
            f"site:{domain_hint} {representative_year} "
            f"{family.make} {family.model} {doors}"
            f"{target} measurements"
        )
    target = (
        '"trunk size" OR "trunk dimensions"'
        if area == "trunk"
        else '"cargo dimensions" OR "cargo area measurements"'
    )
    return (
        f'"{representative_year} {family.make} {family.model}" {doors}'
        f"({target}) forum"
    )


def clean_text(value: str) -> str:
    value = html.unescape(value or "")
    value = re.sub(r"<[^>]+>", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def host_of(url: str) -> str:
    return urllib.parse.urlparse(url).netloc.lower().removeprefix("www.")


def normalize_kind(label: str) -> str:
    label = label.lower()
    if label in {"width", "wide"}:
        return "width"
    if label in {"depth", "length", "deep", "long"}:
        return "depth"
    return "height"


def plausible(kind: str, value: float) -> bool:
    bounds = {
        "width": (28.0, 65.0),
        "depth": (10.0, 75.0),
        "height": (8.0, 55.0),
    }
    low, high = bounds[kind]
    return low <= value <= high


def explicit_dimensions(text: str) -> list[dict[str, Any]]:
    found: list[dict[str, Any]] = []
    for pattern in (VALUE_AFTER_LABEL, VALUE_BEFORE_ADJECTIVE, BETWEEN_WHEELS):
        for match in pattern.finditer(text):
            start = max(0, match.start() - 140)
            end = min(len(text), match.end() + 140)
            context = text[start:end].strip()
            if not DIMENSION_CONTEXT.search(context):
                continue
            if EXTERIOR_CONTEXT.search(context):
                continue
            # Do not misread the inches portion of feet-and-inches notation
            # such as 6'-6" as a six-inch width.
            prefix = text[max(0, match.start() - 6) : match.start()]
            if "'" in prefix or "’" in prefix:
                continue
            value = float(match.group("value"))
            label = match.groupdict().get("label") or "width"
            kind = normalize_kind(label)
            if not plausible(kind, value):
                continue
            found.append(
                {
                    "kind": kind,
                    "value_in": value,
                    "match": match.group(0),
                    "context": context,
                }
            )
    return found


def local_triples(text: str) -> list[str]:
    found: list[str] = []
    for match in TRIPLE.finditer(text):
        start = max(0, match.start() - 140)
        end = min(len(text), match.end() + 140)
        context = text[start:end].strip()
        if DIMENSION_CONTEXT.search(context) and not EXTERIOR_CONTEXT.search(
            context
        ):
            found.append(context)
    return found


def dimension_signal(text: str) -> bool:
    return bool(explicit_dimensions(text) or local_triples(text))


def mentioned_years(text: str) -> set[int]:
    return {
        int(year)
        for year in re.findall(r"\b(?:19|20)\d{2}\b", text)
        if 1900 <= int(year) <= 2029
    }


def year_match(family: Family, text: str) -> bool | None:
    years = mentioned_years(text)
    if not years:
        return None
    return any(family.year_start <= year <= family.year_end for year in years)


def mentioned_door_counts(text: str) -> set[int]:
    words = {
        "two": 2,
        "three": 3,
        "four": 4,
        "five": 5,
    }
    found: set[int] = set()
    for value in re.findall(
        r"\b(2|3|4|5|two|three|four|five)[ -]?door\b",
        text,
        flags=re.I,
    ):
        lower = value.lower()
        found.add(words.get(lower, int(lower) if lower.isdigit() else -1))
    found.discard(-1)
    return found


def door_match(family: Family, text: str) -> bool | None:
    mentioned = mentioned_door_counts(text)
    if not mentioned or family.doors is None:
        return None
    return family.doors in mentioned


def body_style_match(family: Family, title: str) -> bool | None:
    style_terms = {
        "Sedan": {"sedan", "saloon"},
        "Coupe": {"coupe", "coupé"},
        "Convertible": {"convertible", "cabriolet", "cabrio", "roadster"},
        "Hatchback": {"hatchback", "hatch"},
        "Wagon": {"wagon", "estate", "touring"},
        "Minivan": {"minivan", "van"},
        "SUV / Crossover": {"suv", "crossover"},
    }
    lower = title.lower()
    mentioned = {
        style
        for style, terms in style_terms.items()
        if any(re.search(rf"\b{re.escape(term)}\b", lower) for term in terms)
    }
    if not mentioned:
        return None
    return family.body_style in mentioned


def score_result(
    family: Family,
    title: str,
    description: str,
    url: str,
) -> int:
    host = host_of(url)
    if any(fragment in host for fragment in EXCLUDED_HOST_FRAGMENTS):
        return -100
    text = f"{title} {description}"
    lower = text.lower()
    years_compatible = year_match(family, text)
    doors_compatible = door_match(family, text)
    style_compatible = body_style_match(family, title)
    if (
        years_compatible is False
        or doors_compatible is False
        or style_compatible is False
    ):
        return -100
    if family.model.lower() not in lower:
        return -100
    score = 0
    if dimension_signal(text):
        score += 7
    if DIMENSION_CONTEXT.search(text):
        score += 2
    if family.make.lower() in lower:
        score += 1
    if family.model.lower() in lower:
        score += 2
    if years_compatible:
        score += 2
    if doors_compatible:
        score += 2
    if any(fragment in host for fragment in PREFERRED_HOST_FRAGMENTS):
        score += 3
    if url.lower().endswith(".pdf"):
        score += 2
    if re.search(r"\b(?:liner|mat|cover|organizer|flooring)\b", lower):
        score -= 8
    if re.search(r"\b(?:cu\.?\s*ft|cubic\s+feet|liters?|litres?)\b", lower):
        score -= 2
    return score


def brave_search(
    family: Family,
    api_key: str,
    result_count: int,
    domain_hints: list[str],
) -> dict[str, Any]:
    query = build_query(
        family, domain_hint=domain_hints[0] if domain_hints else None
    )
    url = BRAVE_SEARCH_URL + "?" + urllib.parse.urlencode(
        {
            "q": query,
            "count": min(result_count, 20),
            "country": "us",
            "search_lang": "en",
            "safesearch": "moderate",
            "extra_snippets": "true",
        }
    )
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "Accept-Encoding": "identity",
            "X-Subscription-Token": api_key,
            "User-Agent": USER_AGENT,
        },
    )
    started = time.monotonic()
    try:
        with urllib.request.urlopen(request, timeout=25) as response:
            payload = json.load(response)
    except Exception as error:
        return {
            "family": asdict(family),
            "family_key": family.key,
            "query": query,
            "domain_hints": domain_hints,
            "elapsed_ms": round((time.monotonic() - started) * 1000),
            "error": f"{type(error).__name__}: {error}",
            "results": [],
        }

    results: list[SearchResult] = []
    for item in payload.get("web", {}).get("results", []):
        title = clean_text(item.get("title", ""))
        description_parts = [item.get("description", "")]
        description_parts.extend(item.get("extra_snippets") or [])
        description = clean_text(" ".join(description_parts))
        result_url = item.get("url", "")
        if not result_url:
            continue
        score = score_result(
            family,
            title,
            description,
            result_url,
        )
        if score < 0:
            continue
        results.append(
            SearchResult(
                title=title,
                url=result_url,
                description=description,
                host=host_of(result_url),
                score=score,
                search_has_dimensions=dimension_signal(
                    f"{title} {description}"
                ),
                model_match=family.model.lower()
                in f"{title} {description}".lower(),
                year_match=year_match(family, f"{title} {description}"),
                door_match=door_match(family, f"{title} {description}"),
                body_style_match=body_style_match(family, title),
            )
        )
    results.sort(key=lambda item: (-item.score, item.host, item.url))
    return {
        "family": asdict(family),
        "family_key": family.key,
        "query": query,
        "domain_hints": domain_hints,
        "elapsed_ms": round((time.monotonic() - started) * 1000),
        "error": None,
        "results": [asdict(item) for item in results],
    }


def bytes_to_text(body: bytes, content_type: str, url: str) -> str:
    is_pdf = "application/pdf" in content_type or url.lower().endswith(".pdf")
    if is_pdf:
        with tempfile.TemporaryDirectory(prefix="ncsw-boot-pdf-") as directory:
            pdf_path = Path(directory) / "source.pdf"
            text_path = Path(directory) / "source.txt"
            pdf_path.write_bytes(body)
            completed = subprocess.run(
                ["pdftotext", "-layout", str(pdf_path), str(text_path)],
                capture_output=True,
                text=True,
                timeout=30,
            )
            if completed.returncode != 0 or not text_path.exists():
                return ""
            return clean_text(text_path.read_text(errors="replace"))

    decoded = body.decode("utf-8", "replace")
    decoded = HTML_SCRIPT_STYLE.sub(" ", decoded)
    decoded = HTML_TAG.sub(" ", decoded)
    return clean_text(decoded)


def evidence_windows(text: str, radius: int = 260) -> list[str]:
    windows: list[str] = []
    seen: set[str] = set()
    for item in explicit_dimensions(text):
        window = item["context"]
        normalized = window.lower()
        if normalized not in seen:
            seen.add(normalized)
            windows.append(window)
    for window in local_triples(text):
        normalized = window.lower()
        if normalized not in seen:
            seen.add(normalized)
            windows.append(window)
    for pattern in (LABELED_DIMENSION, TRIPLE, ORDERED_TRIPLE):
        for match in pattern.finditer(text):
            start = max(0, match.start() - radius)
            end = min(len(text), match.end() + radius)
            window = text[start:end].strip()
            if not DIMENSION_CONTEXT.search(window):
                continue
            if EXTERIOR_CONTEXT.search(window):
                continue
            normalized = window.lower()
            if normalized in seen:
                continue
            seen.add(normalized)
            windows.append(window)
            if len(windows) >= 6:
                return windows
    return windows


def fetch_candidate(result: dict[str, Any]) -> dict[str, Any]:
    request = urllib.request.Request(
        result["url"],
        headers={
            "Accept": "text/html,application/xhtml+xml,application/pdf",
            "Accept-Encoding": "identity",
            "User-Agent": USER_AGENT,
        },
    )
    started = time.monotonic()
    try:
        with urllib.request.urlopen(request, timeout=25) as response:
            content_type = response.headers.get("Content-Type", "")
            is_pdf = (
                "application/pdf" in content_type
                or result["url"].lower().endswith(".pdf")
            )
            byte_limit = 12_000_000 if is_pdf else 3_000_000
            body = response.read(byte_limit + 1)
            if len(body) > byte_limit:
                raise ValueError(
                    f"source exceeded {byte_limit // 1_000_000} MB fetch limit"
                )
        text = bytes_to_text(body, content_type, result["url"])
        windows = evidence_windows(text)
        extracted = explicit_dimensions(text)
        return {
            **result,
            "fetch_status": "ok",
            "content_type": content_type,
            "fetched_bytes": len(body),
            "evidence_windows": windows,
            "extracted_dimensions": extracted[:12],
            "page_has_dimensions": bool(extracted or local_triples(text)),
            "fetch_elapsed_ms": round(
                (time.monotonic() - started) * 1000
            ),
        }
    except urllib.error.HTTPError as error:
        status = f"http_{error.code}"
    except Exception as error:
        status = f"{type(error).__name__}: {error}"
    return {
        **result,
        "fetch_status": status,
        "content_type": None,
        "fetched_bytes": 0,
        "evidence_windows": [],
        "extracted_dimensions": [],
        "page_has_dimensions": False,
        "fetch_elapsed_ms": round((time.monotonic() - started) * 1000),
    }


def choose_pages(search: dict[str, Any], limit: int) -> list[dict[str, Any]]:
    results = search["results"]
    strong = [item for item in results if item["search_has_dimensions"]]
    fallback = [item for item in results if not item["search_has_dimensions"]]
    return (strong + fallback)[:limit]


def page_identity_qualified(
    family: Family, page: dict[str, Any]
) -> bool:
    if not page["page_has_dimensions"]:
        return False
    evidence = " ".join(page["evidence_windows"])
    # Search snippets can echo query terms that never occur on the source page.
    # Qualification therefore uses only the source title and fetched evidence.
    identity_text = f"{page['title']} {evidence}"
    if family.model.lower() not in identity_text.lower():
        return False
    if year_match(family, identity_text) is not True:
        return False
    doors_compatible = door_match(family, identity_text)
    if doors_compatible is False:
        return False
    if family.door_variant_count > 1 and doors_compatible is not True:
        return False
    if body_style_match(family, page["title"]) is False:
        return False
    return True


def run_self_test() -> None:
    sample = (
        'Owner measurement: cargo area width is 42 inches between the wheel '
        'wells, depth 38", and height 31 inches with the rear seats upright.'
    )
    assert dimension_signal(sample)
    assert explicit_dimensions(sample)
    windows = evidence_windows(sample)
    assert windows and "42 inches" in windows[0]
    family = Family(
        "Example",
        "Model",
        "SUV / Crossover",
        "2018-2024",
        4,
        2018,
        2024,
        10,
        2,
    )
    good = score_result(
        family,
        "2018 Example Model cargo dimensions",
        sample,
        "https://forum.example.com/thread/1",
    )
    bad = score_result(
        family,
        "Example Model cargo liner",
        "Custom-fit cargo liner dimensions.",
        "https://weathertech.com/example",
    )
    assert good > 5
    assert bad < 0
    assert "trunk" not in build_query(family)
    assert '"4-door"' in build_query(family)
    assert door_match(family, "Measured a four-door model.") is True
    assert door_match(family, "Measured a two-door model.") is False
    assert door_match(family, "No door count stated.") is None
    assert build_query(family, "example.com").startswith("site:example.com")
    print("self-test: ok")


def main() -> None:
    args = parse_args()
    if args.self_test:
        run_self_test()
        return

    repo_env = load_key_values(Path(".env"))
    brave_key = repo_env.get("BRAVE_SEARCH_API_KEY")
    if not brave_key:
        raise SystemExit("BRAVE_SEARCH_API_KEY is missing from .env")

    families = read_families(args.limit, args.offset, args.status)
    domain_hints = read_domain_hints()
    started = time.monotonic()
    with concurrent.futures.ThreadPoolExecutor(
        max_workers=args.workers
    ) as executor:
        searches = list(
            executor.map(
                lambda family: brave_search(
                    family,
                    brave_key,
                    args.results_per_search,
                    family_domain_hints(family, domain_hints),
                ),
                families,
            )
        )

    fetch_jobs: list[tuple[str, dict[str, Any]]] = []
    for search in searches:
        for result in choose_pages(search, args.pages_per_family):
            fetch_jobs.append((search["family_key"], result))

    fetched_by_family: dict[str, list[dict[str, Any]]] = {
        family.key: [] for family in families
    }
    with concurrent.futures.ThreadPoolExecutor(
        max_workers=args.workers
    ) as executor:
        fetched = list(
            executor.map(
                fetch_candidate, [result for _, result in fetch_jobs]
            )
        )
    for (family_key, _), fetched_result in zip(fetch_jobs, fetched):
        fetched_by_family[family_key].append(fetched_result)

    records: list[dict[str, Any]] = []
    for search in searches:
        family = Family(**search["family"])
        pages = fetched_by_family[search["family_key"]]
        records.append(
            {
                **search,
                "fetched_pages": pages,
                "has_search_candidate": any(
                    result["search_has_dimensions"]
                    for result in search["results"]
                ),
                "has_page_evidence": any(
                    page["page_has_dimensions"] for page in pages
                ),
                "has_qualified_evidence": any(
                    page_identity_qualified(family, page) for page in pages
                ),
            }
        )

    search_errors = Counter(
        record["error"] or "ok" for record in records
    )
    fetch_statuses = Counter(
        page["fetch_status"]
        for record in records
        for page in record["fetched_pages"]
    )
    summary = {
        "families": len(records),
        "vehicle_rows_covered": sum(
            record["family"]["vehicle_rows"] for record in records
        ),
        "search_requests": len(records),
        "estimated_search_cost_usd": round(len(records) * 0.005, 3),
        "families_with_search_candidate": sum(
            record["has_search_candidate"] for record in records
        ),
        "families_with_fetched_evidence": sum(
            record["has_page_evidence"] for record in records
        ),
        "families_with_identity_qualified_evidence": sum(
            record["has_qualified_evidence"] for record in records
        ),
        "pages_fetched": len(fetch_jobs),
        "search_statuses": dict(search_errors),
        "fetch_statuses": dict(fetch_statuses),
        "elapsed_seconds": round(time.monotonic() - started, 2),
    }
    report = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "mode": "read_only",
        "selection": {
            "status": args.status,
            "sort": "vehicle_rows_desc",
            "limit": args.limit,
            "offset": args.offset,
        },
        "summary": summary,
        "families": records,
    }
    if args.output:
        args.output.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(summary, indent=2))
    if args.output:
        print(f"report={args.output}")


if __name__ == "__main__":
    main()
