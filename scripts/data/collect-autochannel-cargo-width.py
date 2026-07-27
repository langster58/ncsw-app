#!/usr/bin/env python3
"""Collect conservative cargo widths from The Auto Channel.

The Auto Channel's public Used Car Buyer's Guide exposes a deterministic
make/model/year/trim hierarchy and ordinary HTML capacity tables. Some records
publish ``Cargo Width - Wheel`` and/or ``Cargo Width - Wall``. Those are useful
physical widths even when the site's generic ``Cargo Length`` field describes
maximum cargo length with seats folded, so this collector intentionally ignores
all source length fields.

The default run is read-only and writes a JSON review report. Database writes
require ``--apply``. Only exact make/model matches, standard cargo-body
families, matching body styles, and source years inside the database generation
are accepted.
"""

from __future__ import annotations

import argparse
import dataclasses
import datetime as dt
import html
import json
import re
import runpy
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


SCRIPT_DIR = Path(__file__).resolve().parent
SHARED = runpy.run_path(str(SCRIPT_DIR / "collect-boot-dim-candidates.py"))
database_connection = SHARED["database_connection"]

BASE_URL = (
    "https://www2025.theautochannel.com/db/usedcarbuyersguide/"
)
USER_AGENT = "NorthCoastSoundworksResearch/1.0"
REQUEST_INTERVAL_SECONDS = 0.2
MAX_RESPONSE_BYTES = 2_000_000
AMBIGUOUS_DATABASE_FAMILIES = {
    # Current vehicle rows collapse cargo vans, SWB passenger wagons, and LWB
    # passenger wagons even though their cargo dimensions differ.
    ("Ford", "Transit Connect", "2013-2025"),
}

LINK_RE = re.compile(
    r'href=["\'](?P<href>[^"\']+)["\'][^>]*>(?P<label>.*?)</a>',
    re.I | re.S,
)
ROW_RE = re.compile(r"<tr[^>]*>(?P<row>.*?)</tr>", re.I | re.S)
CELL_RE = re.compile(r"<td[^>]*>(?P<cell>.*?)</td>", re.I | re.S)
TAG_RE = re.compile(r"<[^>]+>")
TITLE_RE = re.compile(r"<title[^>]*>(?P<title>.*?)</title>", re.I | re.S)
YEAR_RE = re.compile(r"\b(19|20)\d{2}\b")
NUMBER_RE = re.compile(r"\d+(?:\.\d+)?")


@dataclasses.dataclass(frozen=True)
class Family:
    make: str
    model: str
    body_style: str
    generation: str
    cargo_body_variant: str
    vehicle_rows: int
    min_year: int
    max_year: int

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


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--family-limit",
        type=int,
        default=20,
        help="Maximum unresolved families to inspect; 0 means no limit.",
    )
    parser.add_argument(
        "--trims-per-year",
        type=int,
        default=5,
        help="Maximum source trims to inspect for a representative year.",
    )
    parser.add_argument(
        "--report",
        type=Path,
        default=Path("/tmp/autochannel-cargo-width.json"),
    )
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if args.family_limit < 0 or args.trims_per_year < 1:
        parser.error("family-limit cannot be negative; trims-per-year must be positive")
    return args


def clean_text(value: str) -> str:
    value = TAG_RE.sub(" ", value)
    return " ".join(html.unescape(value).replace("\xa0", " ").split())


class Fetcher:
    def __init__(self) -> None:
        self.cache: dict[str, str] = {}
        self.last_request_at = 0.0

    def fetch(self, url: str) -> str:
        if url in self.cache:
            return self.cache[url]
        elapsed = time.monotonic() - self.last_request_at
        if elapsed < REQUEST_INTERVAL_SECONDS:
            time.sleep(REQUEST_INTERVAL_SECONDS - elapsed)
        request = urllib.request.Request(
            url,
            headers={
                "User-Agent": USER_AGENT,
                "Accept": "text/html,application/xhtml+xml",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                payload = response.read(MAX_RESPONSE_BYTES + 1)
        except urllib.error.URLError as exc:
            raise RuntimeError(f"fetch failed for {url}: {exc}") from exc
        self.last_request_at = time.monotonic()
        if len(payload) > MAX_RESPONSE_BYTES:
            raise RuntimeError(f"response too large for {url}")
        text = payload.decode("iso-8859-1", errors="replace")
        self.cache[url] = text
        return text


def absolute_url(href: str) -> str:
    return urllib.parse.urljoin(BASE_URL, html.unescape(href))


def matching_links(page: str, path: str) -> list[tuple[str, str]]:
    found: list[tuple[str, str]] = []
    for match in LINK_RE.finditer(page):
        href = html.unescape(match.group("href"))
        if path not in href:
            continue
        found.append((absolute_url(href), clean_text(match.group("label"))))
    return found


def load_families(limit: int) -> list[Family]:
    connection = database_connection()
    try:
        cursor = connection.cursor()
        query = """
            select make,
                   model,
                   body_style,
                   generation,
                   coalesce(
                       nullif(trim(cargo_body_variant), ''),
                       'standard'
                   ) as cargo_body_variant,
                   count(*) as vehicle_rows,
                   min(year) as min_year,
                   max(year) as max_year
              from vehicles
             where body_style <> 'Truck'
             group by make, model, body_style, generation,
                      coalesce(
                          nullif(trim(cargo_body_variant), ''),
                          'standard'
                      )
            having bool_and(boot_width_in is null)
               and coalesce(
                       nullif(trim(cargo_body_variant), ''),
                       'standard'
                   ) = 'standard'
               and max(year) >= 1997
             order by count(*) desc, make, model, generation
        """
        if limit:
            query += " limit %s"
            cursor.execute(query, (limit,))
        else:
            cursor.execute(query)
        return [Family(*row) for row in cursor.fetchall()]
    finally:
        connection.close()


def body_style_matches(source_body: str, target_body: str) -> bool:
    source = source_body.lower()
    expected: tuple[str, ...]
    if target_body == "SUV / Crossover":
        expected = ("sport utility", "crossover")
    elif target_body == "Minivan":
        expected = ("minivan", "passenger van")
    elif target_body == "Hatchback":
        expected = ("hatchback",)
    elif target_body == "Convertible":
        expected = ("convertible",)
    elif target_body == "Coupe":
        expected = ("coupe",)
    elif target_body == "Sedan":
        expected = ("sedan",)
    elif target_body == "Wagon":
        expected = ("wagon",)
    else:
        return False
    return any(item in source for item in expected)


def parse_capacity_page(page: str, url: str) -> dict[str, Any]:
    fields: dict[str, str] = {}
    for match in ROW_RE.finditer(page):
        cells = [
            clean_text(cell.group("cell"))
            for cell in CELL_RE.finditer(match.group("row"))
        ]
        if len(cells) != 2:
            continue
        label, value = cells
        if label and value:
            fields[label] = value
    title_match = TITLE_RE.search(page)
    title = clean_text(title_match.group("title")) if title_match else ""
    widths: list[tuple[float, str]] = []
    for label in ("Cargo Width - Wheel", "Cargo Width - Wall"):
        raw = fields.get(label)
        if not raw:
            continue
        number = NUMBER_RE.search(raw)
        if not number:
            continue
        value = float(number.group())
        if 15 <= value <= 100:
            widths.append((value, f"{label}: {raw} in."))
    if not widths:
        return {
            "url": url,
            "title": title,
            "body_style": fields.get("Body Style", ""),
            "width_in": None,
            "quote": None,
        }
    width, quote = min(widths, key=lambda item: item[0])
    return {
        "url": url,
        "title": title,
        "body_style": fields.get("Body Style", ""),
        "width_in": width,
        "quote": quote,
    }


def inspect_family(fetcher: Fetcher, family: Family, trims_per_year: int) -> dict[str, Any]:
    model_url = absolute_url(
        "list_modelyears.php?"
        + urllib.parse.urlencode(
            {
                "bodystyle": "All Cars",
                "make": family.make,
                "model": family.model,
            }
        )
    )
    result: dict[str, Any] = {
        "family_key": family.key,
        "family": dataclasses.asdict(family),
        "model_url": model_url,
        "status": "no_source_year",
        "candidates": [],
        "errors": [],
    }
    if (family.make, family.model, family.generation) in AMBIGUOUS_DATABASE_FAMILIES:
        result["status"] = "ambiguous_database_family"
        return result
    try:
        model_page = fetcher.fetch(model_url)
    except RuntimeError as exc:
        result["status"] = "model_fetch_error"
        result["errors"].append(str(exc))
        return result

    start_year, end_year = family.generation_years
    year_links: list[tuple[int, str]] = []
    for url, label in matching_links(model_page, "list_trims.php"):
        year_match = YEAR_RE.search(label)
        if not year_match:
            continue
        year = int(year_match.group())
        if start_year <= year <= end_year and family.min_year <= year <= family.max_year:
            year_links.append((year, url))
    if not year_links:
        return result

    # One representative year is sufficient for a physical generation. Use the
    # newest source year in the generation because late records are generally
    # more complete.
    source_year, trims_url = max(year_links)
    result["source_year"] = source_year
    result["trims_url"] = trims_url
    try:
        trims_page = fetcher.fetch(trims_url)
    except RuntimeError as exc:
        result["status"] = "trims_fetch_error"
        result["errors"].append(str(exc))
        return result

    trim_links = matching_links(trims_page, "show_car.php")
    seen_ids: set[str] = set()
    inspected = 0
    for trim_url, trim_label in trim_links:
        parsed = urllib.parse.urlparse(trim_url)
        car_id = urllib.parse.parse_qs(parsed.query).get("id", [""])[0]
        if not car_id or car_id in seen_ids:
            continue
        seen_ids.add(car_id)
        capacity_url = absolute_url(f"show_car_capacities.php?id={car_id}")
        try:
            capacity_page = fetcher.fetch(capacity_url)
        except RuntimeError as exc:
            result["errors"].append(str(exc))
            continue
        inspected += 1
        candidate = parse_capacity_page(capacity_page, capacity_url)
        candidate["trim_label"] = trim_label
        if body_style_matches(candidate["body_style"], family.body_style):
            result["candidates"].append(candidate)
        if inspected >= trims_per_year:
            break

    usable = [
        item for item in result["candidates"]
        if item["width_in"] is not None
    ]
    if not usable:
        result["status"] = (
            "no_width" if result["candidates"] else "no_matching_body"
        )
        return result
    accepted = min(usable, key=lambda item: item["width_in"])
    result["status"] = "accepted"
    result["accepted"] = accepted
    return result


def build_report(families: list[Family], trims_per_year: int) -> dict[str, Any]:
    started = time.monotonic()
    fetcher = Fetcher()
    inspected = [
        inspect_family(fetcher, family, trims_per_year)
        for family in families
    ]
    return {
        "schema_version": 1,
        "source": "theautochannel.com Used Car Buyer's Guide",
        "created_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "elapsed_seconds": round(time.monotonic() - started, 1),
        "families_checked": len(families),
        "families_accepted": sum(
            item["status"] == "accepted" for item in inspected
        ),
        "requests_made": len(fetcher.cache),
        "results": inspected,
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
        for result in report["results"]:
            if result["status"] != "accepted":
                continue
            family = result["family"]
            accepted = result["accepted"]
            width = accepted["width_in"]
            source_url = accepted["url"]
            quote = (
                f"{accepted['title']} — {accepted['quote']} "
                f"(representative {result['source_year']} model year)"
            )
            cursor.execute(
                """
                update vehicles
                   set boot_width_in = coalesce(boot_width_in, %s),
                       dims_status = case
                           when coalesce(boot_width_in, %s) is not null
                            and boot_depth_in is not null
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
                   and boot_width_in is null
                """,
                (
                    width,
                    width,
                    source_url,
                    source_url,
                    source_url,
                    quote,
                    quote,
                    quote,
                    family["make"],
                    family["model"],
                    family["body_style"],
                    family["generation"],
                    family["cargo_body_variant"],
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
        return {
            "families_updated": families_updated,
            "vehicle_rows_updated": vehicle_rows_updated,
            "remaining_completely_unfilled_families": remaining,
        }
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def main() -> None:
    args = parse_args()
    families = load_families(args.family_limit)
    report = build_report(families, args.trims_per_year)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(
        json.dumps(report, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "families_checked": report["families_checked"],
                "families_accepted": report["families_accepted"],
                "requests_made": report["requests_made"],
                "elapsed_seconds": report["elapsed_seconds"],
                "report": str(args.report),
            },
            sort_keys=True,
        )
    )
    if args.apply:
        print(json.dumps(apply_report(report), sort_keys=True))


if __name__ == "__main__":
    main()
