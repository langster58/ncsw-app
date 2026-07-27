#!/usr/bin/env python3
"""Collect seats-up boot width/depth from Auto Express comparison tests.

Auto Express comparison-test pages publish ordinary HTML tables containing
their tape-measured boot length and narrowest width.  This collector discovers
those pages through the site's public, paginated ``/car-group-tests`` archive;
it does not use search APIs, browser automation, PDFs, OCR, or an LLM.

The default run is read-only and writes a JSON review report. Database writes
require ``--apply``. A candidate is accepted automatically only when the
tested model maps to exactly one US-market physical family for the article
year. Known UK/US body mismatches are explicitly excluded.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import dataclasses
import datetime as dt
import gzip
import html
from html.parser import HTMLParser
import json
import re
import runpy
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


SCRIPT_DIR = Path(__file__).resolve().parent
SHARED = runpy.run_path(str(SCRIPT_DIR / "collect-boot-dim-candidates.py"))
database_connection = SHARED["database_connection"]

BASE_URL = "https://www.autoexpress.co.uk"
ARCHIVE_URL = f"{BASE_URL}/car-group-tests"
USER_AGENT = "NorthCoastSoundworksResearch/1.0"
MAX_RESPONSE_BYTES = 4_000_000
EXISTING_TOLERANCE_IN = 0.51
MM_PER_INCH = 25.4

ARTICLE_LINK = re.compile(
    r'href=["\'](?P<path>/(?:[a-z0-9-]+/){1,4}\d{4,6}/[^"\'#?]+)',
    re.I,
)
PUBLISHED = re.compile(r'"datePublished"\s*:\s*"(?P<date>\d{4}-\d{2}-\d{2})')
TITLE = re.compile(r"<title[^>]*>(?P<title>.*?)</title>", re.I | re.S)
NUMBER = re.compile(r"\d[\d,]*(?:\.\d+)?")

HEADER_LABELS = {
    "model tested",
    "models tested",
    "our choice",
    "our choices",
    "car tested",
    "cars tested",
}

# These names describe different physical bodies in the UK source and the
# US-market vehicles table, even though the make/model strings overlap.
MARKET_BODY_EXCLUSIONS = {
    ("Ford", "Explorer"),
}
MARKET_GENERATION_EXCLUSIONS = {
    ("Honda", "HR-V", "2023-2027"),
    ("Kia", "Sportage", "2022-2027"),
    ("Volkswagen", "Tiguan", "2017-2023"),
    ("Volkswagen", "Tiguan", "2024-2025"),
    ("Volkswagen", "Tiguan", "2026-2027"),
}
SOURCE_MODEL_EXCLUSIONS = {
    # The C-HR+ is a separate electric model, not a trim of the C-HR.
    ("Toyota", "C-HR"): re.compile(r"\bC-HR\+", re.I),
}

MAKE_ALIASES = {
    "Mercedes-Benz": ("mercedes", "mercedes benz"),
    "Mini": ("mini",),
    "Volkswagen": ("volkswagen", "vw"),
    "Land Rover": ("land rover", "range rover"),
}

WAGON_HINTS = (" estate", " touring", " avant", " sport turismo", " wagon")
CONVERTIBLE_HINTS = (
    " convertible",
    " cabriolet",
    " roadster",
    " spider",
    " spyder",
)
COUPE_HINTS = (" coupe",)
SEDAN_HINTS = (" saloon", " sedan")
HATCHBACK_HINTS = (" hatchback", " hot hatch", " sportback")


@dataclasses.dataclass(frozen=True)
class Family:
    make: str
    model: str
    body_style: str
    generation: str
    cargo_body_variant: str
    year_start: int
    year_end: int
    vehicle_rows: int
    old_widths: tuple[float, ...]
    old_depths: tuple[float, ...]

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

    @property
    def generation_years(self) -> tuple[int, int]:
        start, end = self.generation.split("-", 1)
        return int(start), int(end)


@dataclasses.dataclass(frozen=True)
class Measurement:
    model_label: str
    depth_mm: float | None
    width_mm: float | None
    depth_quote: str | None
    width_quote: str | None


class TableParser(HTMLParser):
    """Small dependency-free HTML table reader."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.tables: list[list[list[str]]] = []
        self._table_depth = 0
        self._rows: list[list[str]] = []
        self._row: list[str] | None = None
        self._cell: list[str] | None = None

    def handle_starttag(
        self,
        tag: str,
        attrs: list[tuple[str, str | None]],
    ) -> None:
        del attrs
        tag = tag.lower()
        if tag == "table":
            self._table_depth += 1
            if self._table_depth == 1:
                self._rows = []
        elif tag == "tr" and self._table_depth == 1:
            self._row = []
        elif tag in ("td", "th") and self._table_depth == 1:
            self._cell = []
        elif tag == "br" and self._cell is not None:
            self._cell.append(" ")

    def handle_data(self, data: str) -> None:
        if self._cell is not None:
            self._cell.append(data)

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag in ("td", "th") and self._cell is not None:
            value = " ".join("".join(self._cell).split())
            if self._row is not None:
                self._row.append(value)
            self._cell = None
        elif tag == "tr" and self._row is not None:
            if self._row:
                self._rows.append(self._row)
            self._row = None
        elif tag == "table" and self._table_depth:
            if self._table_depth == 1 and self._rows:
                self.tables.append(self._rows)
            self._table_depth -= 1


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--archive-pages",
        type=int,
        default=1,
        help="Number of archive pages to inspect, beginning with the newest.",
    )
    parser.add_argument(
        "--archive-start",
        type=int,
        default=0,
        help="Zero-based archive page at which discovery begins.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=20,
        help="Maximum comparison articles to fetch; 0 means no limit.",
    )
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument(
        "--report",
        type=Path,
        default=Path("/tmp/autoexpress-boot-dims.json"),
    )
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if (
        args.archive_pages < 1
        or args.archive_start < 0
        or args.limit < 0
        or args.workers < 1
    ):
        parser.error(
            "archive-pages/workers must be positive; "
            "archive-start/limit cannot be negative"
        )
    return args


def normalize(value: Any) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = text.encode("ascii", "ignore").decode("ascii").lower()
    return " ".join(re.sub(r"[^a-z0-9]+", " ", text).split())


def fetch_page(url: str, timeout: int = 30) -> tuple[str, str]:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Encoding": "gzip",
        },
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        raw = response.read(MAX_RESPONSE_BYTES + 1)
        if len(raw) > MAX_RESPONSE_BYTES:
            raise ValueError("response_too_large")
        if response.headers.get("Content-Encoding", "").lower() == "gzip":
            raw = gzip.decompress(raw)
        return response.geturl(), raw.decode("utf-8", "replace")


def archive_urls(page_count: int, start: int = 0) -> list[str]:
    return [
        ARCHIVE_URL if page == 0 else f"{ARCHIVE_URL}?page={page}"
        for page in range(start, start + page_count)
    ]


def discover_articles(
    page_count: int,
    workers: int,
    start: int = 0,
) -> list[str]:
    pages: dict[int, str] = {}

    def fetch_archive(item: tuple[int, str]) -> tuple[int, str]:
        index, url = item
        _, page_html = fetch_page(url)
        return index, page_html

    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
        futures = [
            executor.submit(fetch_archive, item)
            for item in enumerate(archive_urls(page_count, start))
        ]
        for future in concurrent.futures.as_completed(futures):
            index, page_html = future.result()
            pages[index] = page_html

    found: list[str] = []
    seen: set[str] = set()
    for page in sorted(pages):
        for match in ARTICLE_LINK.finditer(pages[page]):
            path = html.unescape(match.group("path")).rstrip("/")
            url = urllib.parse.urljoin(BASE_URL, path)
            if url not in seen:
                seen.add(url)
                found.append(url)
    return found


def numbers(value: str) -> list[float]:
    return [
        float(match.group(0).replace(",", ""))
        for match in NUMBER.finditer(value)
    ]


def table_header(rows: list[list[str]]) -> list[str] | None:
    for row in rows:
        if len(row) < 2:
            continue
        label = normalize(row[0])
        if label in HEADER_LABELS:
            return row
    return None


def row_starting(rows: list[list[str]], prefix: str) -> list[str] | None:
    prefix = normalize(prefix)
    for row in rows:
        if row and normalize(row[0]).startswith(prefix):
            return row
    return None


def plausible(depth_mm: float | None, width_mm: float | None) -> bool:
    if depth_mm is not None and not 250 <= depth_mm <= 2_000:
        return False
    if width_mm is not None and not 600 <= width_mm <= 1_700:
        return False
    return depth_mm is not None or width_mm is not None


def parse_measurements(page_html: str) -> list[Measurement]:
    parser = TableParser()
    parser.feed(page_html)
    measurements: list[Measurement] = []

    for rows in parser.tables:
        header = table_header(rows)
        if not header:
            continue
        combined = row_starting(rows, "boot length width")
        length = None if combined else row_starting(rows, "boot length")
        width = None if combined else row_starting(rows, "boot width")
        if not combined and not length and not width:
            continue

        for column in range(1, len(header)):
            model_label = header[column]
            depth_mm: float | None = None
            width_mm: float | None = None
            depth_quote: str | None = None
            width_quote: str | None = None

            if combined and column < len(combined):
                parts = combined[column].split("/")
                length_values = numbers(parts[0]) if parts else []
                width_values = numbers(parts[1]) if len(parts) > 1 else []
                if length_values and width_values:
                    depth_mm = min(length_values)
                    width_mm = min(width_values)
                    quote = f"{combined[0]}: {combined[column]}"
                    depth_quote = quote
                    width_quote = quote
            else:
                if length and column < len(length):
                    values = numbers(length[column])
                    if values:
                        # In 7/5-seat or seats-up/down rows, the first number
                        # is the conservative rearmost-seats-up length.
                        depth_mm = values[0]
                        depth_quote = f"{length[0]}: {length[column]}"
                if width and column < len(width):
                    values = numbers(width[column])
                    if values:
                        width_mm = values[0]
                        width_quote = f"{width[0]}: {width[column]}"

            if plausible(depth_mm, width_mm):
                measurements.append(
                    Measurement(
                        model_label=model_label,
                        depth_mm=depth_mm,
                        width_mm=width_mm,
                        depth_quote=depth_quote,
                        width_quote=width_quote,
                    )
                )
    return measurements


def read_families() -> list[Family]:
    connection = database_connection()
    try:
        cursor = connection.cursor()
        cursor.execute(
            """
            select make, model, body_style, generation,
                   coalesce(nullif(trim(cargo_body_variant), ''), 'standard'),
                   min(year)::int, max(year)::int, count(*)::int,
                   array_remove(array_agg(distinct boot_width_in), null),
                   array_remove(array_agg(distinct boot_depth_in), null)
              from vehicles
             where body_style <> 'Truck'
               and generation ~ '^[0-9]{4}-[0-9]{4}$'
             group by make, model, body_style, generation,
                      coalesce(
                          nullif(trim(cargo_body_variant), ''),
                          'standard'
                      )
            having bool_or(
                       boot_width_in is null or boot_depth_in is null
                   )
            """
        )
        return [
            Family(
                *row[:8],
                tuple(float(value) for value in row[8]),
                tuple(float(value) for value in row[9]),
            )
            for row in cursor.fetchall()
        ]
    finally:
        connection.close()


def contains_phrase(text: str, phrase: str) -> bool:
    return bool(re.search(rf"(?:^| ){re.escape(phrase)}(?: |$)", text))


def inferred_body_style(text: str) -> str | None:
    padded = f" {normalize(text)}"
    if any(hint in padded for hint in WAGON_HINTS):
        return "Wagon"
    if any(hint in padded for hint in CONVERTIBLE_HINTS):
        return "Convertible"
    if any(hint in padded for hint in COUPE_HINTS):
        return "Coupe"
    if any(hint in padded for hint in SEDAN_HINTS):
        return "Sedan"
    if any(hint in padded for hint in HATCHBACK_HINTS):
        return "Hatchback"
    return None


def family_matches_label(
    family: Family,
    label: str,
    title: str,
    article_year: int,
) -> bool:
    start, end = family.generation_years
    if not start <= article_year <= end:
        return False
    if (family.make, family.model) in MARKET_BODY_EXCLUSIONS:
        return False
    if (
        family.make,
        family.model,
        family.generation,
    ) in MARKET_GENERATION_EXCLUSIONS:
        return False
    source_exclusion = SOURCE_MODEL_EXCLUSIONS.get(
        (family.make, family.model)
    )
    if source_exclusion and source_exclusion.search(f"{label} {title}"):
        return False

    label_text = normalize(label)
    make_aliases = MAKE_ALIASES.get(family.make, (normalize(family.make),))
    if not any(contains_phrase(label_text, alias) for alias in make_aliases):
        return False
    if not contains_phrase(label_text, normalize(family.model)):
        return False

    body_style = inferred_body_style(f"{label} {title}")
    if body_style is not None and family.body_style != body_style:
        return False
    return True


def match_family(
    families: list[Family],
    measurement: Measurement,
    title: str,
    article_year: int,
) -> tuple[Family | None, str]:
    matches = [
        family
        for family in families
        if family_matches_label(
            family,
            measurement.model_label,
            title,
            article_year,
        )
    ]
    if not matches:
        return None, "no_us_family_match"

    # Prefer the longest matching model name so "Model 3" cannot resolve to
    # "3", and "Range Rover Sport" wins over "Range Rover".
    longest = max(len(normalize(family.model)) for family in matches)
    matches = [
        family
        for family in matches
        if len(normalize(family.model)) == longest
    ]
    if len(matches) != 1:
        return None, "ambiguous_family_match"
    return matches[0], "matched"


def page_title(page_html: str) -> str:
    match = TITLE.search(page_html)
    return html.unescape(re.sub(r"<[^>]+>", "", match.group("title"))).strip() if match else ""


def collect(
    article_urls: list[str],
    families: list[Family],
    workers: int,
) -> dict[str, Any]:
    started = time.monotonic()

    def inspect(url: str) -> dict[str, Any]:
        try:
            final_url, page_html = fetch_page(url)
        except (OSError, ValueError, urllib.error.URLError) as error:
            return {"url": url, "error": type(error).__name__, "measurements": []}
        published = PUBLISHED.search(page_html)
        if not published:
            return {"url": final_url, "error": "missing_publish_date", "measurements": []}
        article_year = int(published.group("date")[:4])
        title = page_title(page_html)
        parsed = parse_measurements(page_html)
        output: list[dict[str, Any]] = []
        for measurement in parsed:
            family, reason = match_family(
                families,
                measurement,
                title,
                article_year,
            )
            width_in = (
                round(measurement.width_mm / MM_PER_INCH, 2)
                if measurement.width_mm is not None
                else None
            )
            depth_in = (
                round(measurement.depth_mm / MM_PER_INCH, 2)
                if measurement.depth_mm is not None
                else None
            )
            output.append(
                {
                    "model_label": measurement.model_label,
                    "width_in": width_in,
                    "depth_in": depth_in,
                    "width_quote": measurement.width_quote,
                    "depth_quote": measurement.depth_quote,
                    "family_key": family.key if family else None,
                    "reason": reason,
                }
            )
        return {
            "url": final_url,
            "title": title,
            "published": published.group("date"),
            "measurements": output,
        }

    inspected: list[dict[str, Any]] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
        futures = [executor.submit(inspect, url) for url in article_urls]
        for future in concurrent.futures.as_completed(futures):
            inspected.append(future.result())

    inspected.sort(key=lambda item: item["url"])
    family_by_key = {family.key: family for family in families}
    options: dict[str, list[dict[str, Any]]] = {}
    for page in inspected:
        for measurement in page["measurements"]:
            key = measurement.get("family_key")
            if key:
                options.setdefault(key, []).append(
                    {
                        **measurement,
                        "source_url": page["url"],
                        "published": page.get("published"),
                        "title": page.get("title"),
                    }
                )

    decisions: list[dict[str, Any]] = []
    for key, candidates in options.items():
        family = family_by_key[key]
        width_options = [
            item for item in candidates
            if item["width_in"] is not None and not family.old_widths
        ]
        depth_options = [
            item for item in candidates
            if item["depth_in"] is not None and not family.old_depths
        ]
        # Package fit should use the conservative smallest measured seats-up
        # floor dimension when more than one test measured the same family.
        width = min(width_options, key=lambda item: item["width_in"]) if width_options else None
        depth = min(depth_options, key=lambda item: item["depth_in"]) if depth_options else None
        if width is None and depth is None:
            continue
        decisions.append(
            {
                "family_key": key,
                "family": dataclasses.asdict(family),
                "width": width,
                "depth": depth,
                "accepted": True,
                "candidate_count": len(candidates),
            }
        )

    decisions.sort(
        key=lambda item: (
            -int(item["family"]["vehicle_rows"]),
            item["family_key"],
        )
    )
    return {
        "schema_version": 1,
        "source": "autoexpress.co.uk",
        "created_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "elapsed_seconds": round(time.monotonic() - started, 1),
        "articles_checked": len(article_urls),
        "articles_with_measurements": sum(
            bool(item["measurements"]) for item in inspected
        ),
        "measurements_parsed": sum(
            len(item["measurements"]) for item in inspected
        ),
        "decisions": decisions,
        "pages": inspected,
    }


def append_provenance(existing: str | None, addition: str) -> str:
    if not existing:
        return addition
    if addition in existing:
        return existing
    return f"{existing} | {addition}"


def apply_report(report: dict[str, Any]) -> dict[str, Any]:
    connection = database_connection()
    families_updated = 0
    vehicle_rows_updated = 0
    try:
        cursor = connection.cursor()
        for decision in report["decisions"]:
            if not decision.get("accepted"):
                continue
            family = decision["family"]
            width = decision.get("width")
            depth = decision.get("depth")
            width_value = width["width_in"] if width else None
            depth_value = depth["depth_in"] if depth else None
            sources = [item for item in (width, depth) if item]
            source_urls = " | ".join(
                dict.fromkeys(item["source_url"] for item in sources)
            )
            quotes = " | ".join(
                dict.fromkeys(
                    f"{item['model_label']} — "
                    f"{item['width_quote'] if item is width else item['depth_quote']}"
                    for item in sources
                )
            )
            cursor.execute(
                """
                update vehicles
                   set boot_width_in = coalesce(boot_width_in, %s),
                       boot_depth_in = coalesce(boot_depth_in, %s),
                       dims_status = case
                           when coalesce(boot_width_in, %s) is not null
                            and coalesce(boot_depth_in, %s) is not null
                            and boot_height_in is not null
                               then 'researched'
                           else 'partial'
                       end,
                       dims_source_url = case
                           when dims_source_url is null or dims_source_url = ''
                               then %s
                           when position(%s in dims_source_url) > 0
                               then dims_source_url
                           else dims_source_url || ' | ' || %s
                       end,
                       dims_quote = case
                           when dims_quote is null or dims_quote = ''
                               then %s
                           when position(%s in dims_quote) > 0
                               then dims_quote
                           else dims_quote || ' | ' || %s
                       end,
                       dims_checked_at = now(),
                       dims_confidence = 'verified',
                       dims_config = 'seats_up'
                 where make = %s and model = %s and body_style = %s
                   and generation = %s
                   and coalesce(
                           nullif(trim(cargo_body_variant), ''),
                           'standard'
                       ) = %s
                   and (
                       (boot_width_in is null and %s is not null)
                       or (boot_depth_in is null and %s is not null)
                   )
                """,
                (
                    width_value,
                    depth_value,
                    width_value,
                    depth_value,
                    source_urls,
                    source_urls,
                    source_urls,
                    quotes,
                    quotes,
                    quotes,
                    family["make"],
                    family["model"],
                    family["body_style"],
                    family["generation"],
                    family["cargo_body_variant"],
                    width_value,
                    depth_value,
                ),
            )
            if cursor.rowcount:
                families_updated += 1
                vehicle_rows_updated += cursor.rowcount
        connection.commit()
        cursor.execute(
            """
            select count(*) from (
                select 1
                  from vehicles
                 where body_style <> 'Truck'
                 group by make, model, body_style, generation,
                          coalesce(
                              nullif(trim(cargo_body_variant), ''),
                              'standard'
                          )
                having bool_and(
                           boot_width_in is null and boot_depth_in is null
                       )
            ) remaining
            """
        )
        remaining = cursor.fetchone()[0]
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()
    return {
        "families_updated": families_updated,
        "vehicle_rows_updated": vehicle_rows_updated,
        "remaining_completely_unfilled": remaining,
    }


def self_test() -> None:
    sample = """
    <table><tbody>
      <tr><td>Our choice</td><td>Kia Sorento 2 HEV</td></tr>
      <tr><td>Boot length 7/5 seats</td><td>391/1,110-1,260mm</td></tr>
      <tr><td>Boot width/lip height</td><td>1,075/780mm</td></tr>
    </tbody></table>
    """
    result = parse_measurements(sample)
    assert len(result) == 1
    assert result[0].depth_mm == 391
    assert result[0].width_mm == 1075
    combined = """
    <table><tr><td>Model tested</td><td>Tesla Model 3</td></tr>
    <tr><td>Boot length/width</td><td>1,034/995mm</td></tr></table>
    """
    result = parse_measurements(combined)
    assert result[0].depth_mm == 1034
    assert result[0].width_mm == 995
    ranged = """
    <table><tr><td>Our choice</td><td>Audi Q5</td></tr>
    <tr><td>Boot length/width</td><td>964-1,066/970mm</td></tr></table>
    """
    result = parse_measurements(ranged)
    assert result[0].depth_mm == 964
    assert result[0].width_mm == 970
    assert not plausible(8895, 1015)
    print("self-test passed")


def main() -> None:
    args = parse_args()
    if args.self_test:
        self_test()
        return
    articles = discover_articles(
        args.archive_pages,
        args.workers,
        args.archive_start,
    )
    if args.limit:
        articles = articles[: args.limit]
    print(
        f"checking {len(articles)} Auto Express comparison articles",
        flush=True,
    )
    report = collect(articles, read_families(), args.workers)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    summary: dict[str, Any] = {
        "articles_checked": report["articles_checked"],
        "articles_with_measurements": report["articles_with_measurements"],
        "measurements_parsed": report["measurements_parsed"],
        "matched_families": len(report["decisions"]),
        "report": str(args.report),
    }
    if args.apply:
        summary["applied"] = apply_report(report)
    print(json.dumps(summary, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
