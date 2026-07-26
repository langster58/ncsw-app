#!/usr/bin/env python3
"""Collect reviewable cargo/trunk dimension evidence without an LLM.

The collector works at the physical-family level:
    (make, model, body_style, generation, cargo_body_variant)

It reads unresolved families from the live vehicles table, searches Brave once
per family, fetches only the strongest candidate pages, and extracts short
verbatim windows around dimension-like text. Search snippets are discovery
only; they can never become measurements.

`cargo_body_variant` is the physical-body boundary. Door count is deliberately
not part of the key: a rear hatch is not a side door, and door count matters
only when it represents a different cargo body. Those cases must be encoded in
`cargo_body_variant` before collection.

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
EXCLUDED_PAGE_HOST_FRAGMENTS = {
    "metrommp.",
    "metroparts.",
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
NON_CARGO_OBJECT_CONTEXT = re.compile(
    r"\b(?:box|case|cage|amplifier|amp|keyboard|television|tv|"
    r"advert(?:isement)?|bumper|seal|basket|liner|mat)\b",
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
    cargo_body_variant: str
    year_start: int
    year_end: int
    vehicle_rows: int
    body_style_variant_count: int

    @property
    def key(self) -> str:
        return "|".join(
            (
                self.make,
                self.model,
                self.body_style,
                self.generation,
                self.cargo_body_variant,
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
    variant_match: bool | None
    body_style_match: bool | None


def family_from_dict(value: dict[str, Any]) -> Family:
    data = dict(value)
    data.setdefault("body_style_variant_count", 1)
    return Family(**data)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="collect-boot-dims.py",
        description=(
            "Collect source-page evidence for seats-up cargo/trunk "
            "dimensions, or apply a manually reviewed decision file."
        ),
    )
    parser.add_argument("--limit", type=int, default=50)
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--workers", type=int, default=5)
    parser.add_argument("--batch-size", type=int, default=100)
    parser.add_argument("--results-per-search", type=int, default=10)
    parser.add_argument("--pages-per-family", type=int, default=2)
    parser.add_argument(
        "--status",
        choices=("unresolved", "untouched", "pending", "review"),
        default="unresolved",
    )
    parser.add_argument("--output", type=Path)
    parser.add_argument(
        "--resume",
        action="store_true",
        help="Reuse completed families from an existing --output report.",
    )
    parser.add_argument(
        "--apply-decisions",
        type=Path,
        help=(
            "Apply a reviewed decision file to vehicles. Requires --output "
            "pointing to the collector report that supplied the evidence."
        ),
    )
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    for name in (
        "limit",
        "workers",
        "batch_size",
        "results_per_search",
        "pages_per_family",
    ):
        if getattr(args, name) < 1:
            parser.error(f"--{name.replace('_', '-')} must be positive")
    if args.offset < 0:
        parser.error("--offset cannot be negative")
    if args.apply_decisions and not args.output:
        parser.error("--apply-decisions requires --output REPORT")
    if args.resume and not args.output:
        parser.error("--resume requires --output REPORT")
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
        cursor.execute(
            """
            select count(*)
              from (
                    select 1
                      from vehicles
                     where body_style = 'SUV / Crossover'
                       and coalesce(
                               nullif(trim(cargo_body_variant), ''),
                               'standard'
                           ) = 'standard'
                     group by make, model, generation
                    having count(distinct doors) > 1
                   ) ambiguous
            """
        )
        ambiguous = cursor.fetchone()[0]
        if ambiguous:
            raise RuntimeError(
                f"{ambiguous} SUV families still combine multiple door "
                "bodies without cargo_body_variant"
            )
        status_clause = {
            "unresolved": """
                bool_or(
                    coalesce(dims_status, '') not in ('no_data', 'researched')
                    and (
                        boot_width_in is null
                        or boot_depth_in is null
                        or boot_height_in is null
                    )
                )
            """,
            "untouched": "bool_and(dims_status is null)",
            "pending": "bool_or(dims_status = 'pending')",
            "review": """
                bool_or(
                    dims_status in ('review', 'agent_snippet', 'partial')
                )
            """,
        }[status]
        cursor.execute(
            f"""
            with body_style_variants as (
                select make, model, generation,
                       coalesce(
                           nullif(trim(cargo_body_variant), ''),
                           'standard'
                       ) as cargo_body_variant,
                       count(distinct body_style)::int
                           as body_style_variant_count
                  from vehicles
                 where body_style <> 'Truck'
                   and generation ~ '^[0-9]{{4}}-[0-9]{{4}}$'
                 group by make, model, generation,
                          coalesce(
                              nullif(trim(cargo_body_variant), ''),
                              'standard'
                          )
            ),
            families as (
                select make, model, body_style, generation,
                       coalesce(nullif(trim(cargo_body_variant), ''), 'standard')
                           as cargo_body_variant,
                       min(year)::int as year_start,
                       max(year)::int as year_end,
                       count(*)::int as vehicle_rows
                  from vehicles
                 where body_style <> 'Truck'
                   and generation ~ '^[0-9]{{4}}-[0-9]{{4}}$'
                 group by make, model, body_style, generation,
                          coalesce(
                              nullif(trim(cargo_body_variant), ''),
                              'standard'
                          )
                having count(*) filter (
                           where boot_width_in is not null
                             and boot_depth_in is not null
                             and boot_height_in is not null
                       ) = 0
                   and ({status_clause})
            )
            select f.make, f.model, f.body_style, f.generation,
                   f.cargo_body_variant, f.year_start, f.year_end,
                   f.vehicle_rows, b.body_style_variant_count
              from families f
              join body_style_variants b
                using (make, model, generation, cargo_body_variant)
             order by vehicle_rows desc, make, model, generation,
                      cargo_body_variant
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


def build_query(
    family: Family,
    domain_hint: str | None = None,
    include_year: bool = True,
) -> str:
    area = "trunk" if family.body_style in TRUNK_STYLES else "cargo area"
    representative_year = family.year_start
    variant = (
        f'"{family.cargo_body_variant}" '
        if family.cargo_body_variant != "standard"
        else ""
    )
    if domain_hint:
        return (
            f"site:{domain_hint} {representative_year} "
            f"{family.make} {family.model} {variant}"
            f"{area} width depth height inches"
        )
    identity = (
        f'"{representative_year} {family.make} {family.model}"'
        if include_year
        else f'"{family.make} {family.model}"'
    )
    return (
        f"{identity} {variant}{area} width depth height inches"
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
            object_context = text[
                max(0, match.start() - 60) : min(len(text), match.end() + 60)
            ]
            if NON_CARGO_OBJECT_CONTEXT.search(object_context):
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
        ) and not NON_CARGO_OBJECT_CONTEXT.search(context):
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


def variant_match(family: Family, text: str) -> bool | None:
    """Return whether a page explicitly names a nonstandard cargo body."""
    if family.cargo_body_variant == "standard":
        return None
    words = [
        word
        for word in re.findall(
            r"[a-z0-9]+", family.cargo_body_variant.lower()
        )
        if word not in {"body", "door", "doors"}
    ]
    if not words:
        return None
    lower = text.lower()
    numeric_words = {
        "2": r"(?:2|two)",
        "3": r"(?:3|three)",
        "4": r"(?:4|four)",
        "5": r"(?:5|five)",
    }
    return all(
        re.search(
            rf"\b{numeric_words.get(word, re.escape(word))}\b",
            lower,
        )
        for word in words
    )


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
    if any(
        fragment in host
        for fragment in (
            EXCLUDED_HOST_FRAGMENTS | EXCLUDED_PAGE_HOST_FRAGMENTS
        )
    ):
        return -100
    text = f"{title} {description}"
    lower = text.lower()
    if re.search(
        r"\b(?:cargo|trunk)?\s*(?:liner|mat|cover|organizer|flooring)\b",
        lower,
    ):
        return -100
    years_compatible = year_match(family, text)
    variant_compatible = variant_match(family, text)
    style_compatible = body_style_match(family, title)
    if (
        years_compatible is False
        or variant_compatible is False
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
    if variant_compatible:
        score += 2
    if any(fragment in host for fragment in PREFERRED_HOST_FRAGMENTS):
        score += 3
    if url.lower().endswith(".pdf"):
        score += 2
    if re.search(r"\b(?:cu\.?\s*ft|cubic\s+feet|liters?|litres?)\b", lower):
        score -= 2
    return score


def brave_search(
    family: Family,
    api_key: str,
    result_count: int,
    domain_hints: list[str],
) -> dict[str, Any]:
    started = time.monotonic()
    queries = [
        build_query(family),
        build_query(family, include_year=False),
    ]
    if domain_hints:
        queries.append(build_query(family, domain_hint=domain_hints[0]))
    attempted: list[str] = []
    errors: list[str] = []
    by_url: dict[str, SearchResult] = {}

    for query in queries:
        attempted.append(query)
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
        try:
            with urllib.request.urlopen(request, timeout=25) as response:
                payload = json.load(response)
        except Exception as error:
            errors.append(f"{type(error).__name__}: {error}")
            continue

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
            result = SearchResult(
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
                variant_match=variant_match(
                    family, f"{title} {description}"
                ),
                body_style_match=body_style_match(family, title),
            )
            prior = by_url.get(result_url)
            if prior is None or result.score > prior.score:
                by_url[result_url] = result

        # A broad query that already surfaced a dimension-bearing result does
        # not need the paid site-specific fallback.
        if any(result.search_has_dimensions for result in by_url.values()):
            break

    results = sorted(
        by_url.values(),
        key=lambda item: (-item.score, item.host, item.url),
    )
    return {
        "family": asdict(family),
        "family_key": family.key,
        "query": attempted[0],
        "queries": attempted,
        "search_requests": len(attempted),
        "domain_hints": domain_hints,
        "elapsed_ms": round((time.monotonic() - started) * 1000),
        "error": " | ".join(errors) if errors and not results else None,
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
    if any(
        fragment in page["host"]
        for fragment in EXCLUDED_PAGE_HOST_FRAGMENTS
    ):
        return False
    evidence = " ".join(page["evidence_windows"])
    if re.search(
        r"\b(?:cargo|trunk)?\s*(?:liner|mat|cover|organizer|flooring)\b",
        evidence,
        re.I,
    ):
        return False
    # Search snippets can echo query terms that never occur on the source page.
    # Qualification therefore uses only the source title and fetched evidence.
    identity_text = f"{page['title']} {evidence}"
    if family.model.lower() not in identity_text.lower():
        return False
    if year_match(family, identity_text) is not True:
        return False
    variant_compatible = variant_match(family, identity_text)
    if variant_compatible is False:
        return False
    if (
        family.cargo_body_variant != "standard"
        and variant_compatible is not True
    ):
        return False
    style_compatible = body_style_match(family, page["title"])
    if style_compatible is False:
        return False
    if (
        family.body_style_variant_count > 1
        and style_compatible is not True
    ):
        return False
    if not unique_page_dimensions(page):
        return False
    return True


def unique_page_dimensions(page: dict[str, Any]) -> dict[str, list[float]]:
    values: dict[str, set[float]] = {
        "width": set(),
        "depth": set(),
        "height": set(),
    }
    for item in page["extracted_dimensions"]:
        if NON_CARGO_OBJECT_CONTEXT.search(item.get("context", "")):
            continue
        kind = item.get("kind")
        value = item.get("value_in")
        if kind in values and isinstance(value, (int, float)):
            values[kind].add(float(value))
    return {
        kind: sorted(found)
        for kind, found in values.items()
        if found
    }


def build_review_queue(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    queue: list[dict[str, Any]] = []
    for record in records:
        family = family_from_dict(record["family"])
        for page in record["fetched_pages"]:
            if not page_identity_qualified(family, page):
                continue
            dimensions = unique_page_dimensions(page)
            queue.append(
                {
                    "family_key": family.key,
                    "family": asdict(family),
                    "source_url": page["url"],
                    "source_title": page["title"],
                    "dimensions_found": dimensions,
                    "evidence_windows": page["evidence_windows"][:6],
                    "has_all_three_labels": all(
                        len(dimensions.get(kind, [])) == 1
                        for kind in ("width", "depth", "height")
                    ),
                }
            )
    queue.sort(
        key=lambda item: (
            not item["has_all_three_labels"],
            -item["family"]["vehicle_rows"],
            item["family_key"],
        )
    )
    return queue


def load_json(path: Path) -> Any:
    return json.loads(path.read_text())


def reviewed_decisions(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict) and isinstance(payload.get("decisions"), list):
        return payload["decisions"]
    raise ValueError("decision file must be a list or {'decisions': [...]}")


def matching_page(
    report: dict[str, Any],
    family_key: str,
    source_url: str,
) -> tuple[Family, dict[str, Any]]:
    for record in report.get("families", []):
        if record.get("family_key") != family_key:
            continue
        family = family_from_dict(record["family"])
        for page in record.get("fetched_pages", []):
            if page.get("url") == source_url:
                return family, page
    raise ValueError(
        f"{family_key}: source_url is not a fetched page in the report"
    )


def validate_decision(
    report: dict[str, Any],
    decision: dict[str, Any],
) -> tuple[Family, list[str], dict[str, float]]:
    required = {
        "family_key",
        "source_url",
        "quotes",
        "configuration",
    }
    missing = sorted(required - decision.keys())
    if missing:
        raise ValueError(f"decision missing: {', '.join(missing)}")
    if decision["configuration"] != "seats_up":
        raise ValueError("configuration must be seats_up")
    family, page = matching_page(
        report,
        decision["family_key"],
        decision["source_url"],
    )
    if not page_identity_qualified(family, page):
        raise ValueError(
            f"{family.key}: source page does not establish model, year, "
            "body variant, and dimension evidence"
        )
    available = unique_page_dimensions(page)
    measurements = {
        kind: float(decision[f"{kind}_in"])
        for kind in ("width", "depth", "height")
        if decision.get(f"{kind}_in") is not None
    }
    if not measurements:
        raise ValueError(
            "decision must provide at least one of width_in, depth_in, "
            "or height_in"
        )
    for kind, requested in measurements.items():
        if not any(
            abs(requested - candidate) <= 0.05
            for candidate in available.get(kind, [])
        ):
            raise ValueError(
                f"{family.key}: {kind}={requested} is not explicitly "
                "extracted from the source page"
            )
    quotes = decision["quotes"]
    if not isinstance(quotes, list) or not quotes:
        raise ValueError("quotes must be a nonempty list")
    source_windows = [
        clean_text(window) for window in page["evidence_windows"]
    ]
    cleaned_quotes: list[str] = []
    for quote in quotes:
        cleaned = clean_text(str(quote))
        if not cleaned or not any(
            cleaned in window for window in source_windows
        ):
            raise ValueError(
                f"{family.key}: every quote must be verbatim text from an "
                "evidence window"
            )
        cleaned_quotes.append(cleaned)
    return family, cleaned_quotes, measurements


def apply_decisions(report_path: Path, decision_path: Path) -> None:
    report = load_json(report_path)
    decisions = reviewed_decisions(load_json(decision_path))
    validated = [
        (decision, *validate_decision(report, decision))
        for decision in decisions
    ]
    connection = database_connection()
    try:
        cursor = connection.cursor()
        changed = 0
        for decision, family, quotes, measurements in validated:
            cursor.execute(
                """
                update vehicles
                   set boot_width_in = coalesce(%s, boot_width_in),
                       boot_depth_in = coalesce(%s, boot_depth_in),
                       boot_height_in = coalesce(%s, boot_height_in),
                       dims_status = case
                           when coalesce(%s, boot_width_in) is not null
                            and coalesce(%s, boot_depth_in) is not null
                            and coalesce(%s, boot_height_in) is not null
                               then 'researched'
                           else 'partial'
                       end,
                       dims_source_url = %s,
                       dims_quote = %s,
                       dims_checked_at = now(),
                       dims_confidence = 'verified',
                       dims_config = 'seats_up'
                 where make = %s
                   and model = %s
                   and body_style = %s
                   and generation = %s
                   and coalesce(
                           nullif(trim(cargo_body_variant), ''),
                           'standard'
                       ) = %s
                """,
                (
                    measurements.get("width"),
                    measurements.get("depth"),
                    measurements.get("height"),
                    measurements.get("width"),
                    measurements.get("depth"),
                    measurements.get("height"),
                    decision["source_url"],
                    " | ".join(quotes),
                    family.make,
                    family.model,
                    family.body_style,
                    family.generation,
                    family.cargo_body_variant,
                ),
            )
            if cursor.rowcount != family.vehicle_rows:
                raise RuntimeError(
                    f"{family.key}: expected {family.vehicle_rows} rows, "
                    f"matched {cursor.rowcount}; database changed since "
                    "collection"
                )
            changed += cursor.rowcount
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()
    print(
        json.dumps(
            {
                "families_updated": len(validated),
                "vehicle_rows_updated": changed,
            },
            indent=2,
        )
    )


def run_self_test() -> None:
    sample = (
        'Owner measurement of the two-door short body: cargo area width is '
        '42 inches between the wheel wells, depth 38", and height 31 inches '
        "with the rear seats upright."
    )
    assert dimension_signal(sample)
    assert explicit_dimensions(sample)
    assert not explicit_dimensions(
        'The amplifier box size is width 30", depth 14", height 32".'
    )
    windows = evidence_windows(sample)
    assert windows and "42 inches" in windows[0]
    family = Family(
        "Example",
        "Model",
        "SUV / Crossover",
        "2018-2024",
        "2-door short body",
        2018,
        2024,
        10,
        1,
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
    assert '"2-door short body"' in build_query(family)
    assert variant_match(family, "Measured a two-door short body.") is True
    assert variant_match(family, "Measured a four-door long body.") is False
    assert build_query(family, "example.com").startswith("site:example.com")
    print("self-test: ok")


def collect_batch(
    families: list[Family],
    api_key: str,
    domain_hints: dict[tuple[str, ...], list[str]],
    workers: int,
    results_per_search: int,
    pages_per_family: int,
) -> list[dict[str, Any]]:
    with concurrent.futures.ThreadPoolExecutor(
        max_workers=workers
    ) as executor:
        searches = list(
            executor.map(
                lambda family: brave_search(
                    family,
                    api_key,
                    results_per_search,
                    family_domain_hints(family, domain_hints),
                ),
                families,
            )
        )

    fetch_jobs: list[tuple[str, dict[str, Any]]] = []
    for search in searches:
        for result in choose_pages(search, pages_per_family):
            fetch_jobs.append((search["family_key"], result))

    fetched_by_family: dict[str, list[dict[str, Any]]] = {
        family.key: [] for family in families
    }
    with concurrent.futures.ThreadPoolExecutor(
        max_workers=workers
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
        family = family_from_dict(search["family"])
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
    return records


def summarize(records: list[dict[str, Any]], elapsed: float) -> dict[str, Any]:
    search_errors = Counter(record["error"] or "ok" for record in records)
    fetch_statuses = Counter(
        page["fetch_status"]
        for record in records
        for page in record["fetched_pages"]
    )
    requests = sum(record.get("search_requests", 1) for record in records)
    return {
        "families": len(records),
        "vehicle_rows_covered": sum(
            record["family"]["vehicle_rows"] for record in records
        ),
        "search_requests": requests,
        "estimated_search_cost_usd": round(requests * 0.005, 3),
        "families_with_search_candidate": sum(
            record["has_search_candidate"] for record in records
        ),
        "families_with_fetched_evidence": sum(
            record["has_page_evidence"] for record in records
        ),
        "families_with_identity_qualified_evidence": sum(
            record["has_qualified_evidence"] for record in records
        ),
        "pages_fetched": sum(
            len(record["fetched_pages"]) for record in records
        ),
        "search_statuses": dict(search_errors),
        "fetch_statuses": dict(fetch_statuses),
        "elapsed_seconds_this_run": round(elapsed, 2),
    }


def make_report(
    args: argparse.Namespace,
    records: list[dict[str, Any]],
    started: float,
    complete: bool,
) -> dict[str, Any]:
    return {
        "generated_at": time.strftime(
            "%Y-%m-%dT%H:%M:%SZ", time.gmtime()
        ),
        "mode": "read_only",
        "complete": complete,
        "target": {
            "configuration": "seats_up",
            "measurements": [
                "cargo/trunk width",
                "cargo/trunk depth with rear seats upright",
                "height from cargo floor to top of rear seatbacks",
            ],
            "search_snippets_are_evidence": False,
        },
        "selection": {
            "status": args.status,
            "sort": "vehicle_rows_desc",
            "limit": args.limit,
            "offset": args.offset,
        },
        "summary": summarize(records, time.monotonic() - started),
        "review_queue": build_review_queue(records),
        "families": records,
    }


def write_report(path: Path, report: dict[str, Any]) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(report, indent=2) + "\n")
    temporary.replace(path)


def main() -> None:
    args = parse_args()
    if args.self_test:
        run_self_test()
        return
    if args.apply_decisions:
        apply_decisions(args.output, args.apply_decisions)
        return

    repo_env = load_key_values(Path(".env"))
    brave_key = repo_env.get("BRAVE_SEARCH_API_KEY")
    if not brave_key:
        raise SystemExit("BRAVE_SEARCH_API_KEY is missing from .env")

    families = read_families(args.limit, args.offset, args.status)
    domain_hints = read_domain_hints()
    started = time.monotonic()
    records: list[dict[str, Any]] = []
    if args.resume and args.output.exists():
        prior = load_json(args.output)
        expected_selection = {
            "status": args.status,
            "sort": "vehicle_rows_desc",
            "limit": args.limit,
            "offset": args.offset,
        }
        if prior.get("selection") != expected_selection:
            raise SystemExit(
                "--resume report selection does not match this command"
            )
        records = list(prior.get("families", []))
        current_by_key = {family.key: family for family in families}
        for record in records:
            family = current_by_key.get(record.get("family_key"))
            if family is None:
                continue
            record["family"] = asdict(family)
            record["has_qualified_evidence"] = any(
                page_identity_qualified(family, page)
                for page in record.get("fetched_pages", [])
            )
    completed_keys = {record["family_key"] for record in records}
    remaining = [
        family for family in families if family.key not in completed_keys
    ]
    for start in range(0, len(remaining), args.batch_size):
        batch = remaining[start : start + args.batch_size]
        records.extend(
            collect_batch(
                batch,
                brave_key,
                domain_hints,
                args.workers,
                args.results_per_search,
                args.pages_per_family,
            )
        )
        if args.output:
            write_report(
                args.output,
                make_report(args, records, started, complete=False),
            )
        print(
            f"checkpoint: {len(records)}/{len(families)} families",
            flush=True,
        )
    report = make_report(args, records, started, complete=True)
    if args.output:
        write_report(args.output, report)
    summary = report["summary"]
    print(json.dumps(summary, indent=2))
    if args.output:
        print(f"report={args.output}")


if __name__ == "__main__":
    main()
