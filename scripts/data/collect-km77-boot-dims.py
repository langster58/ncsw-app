#!/usr/bin/env python3
"""Collect KM77's measured seats-up cargo width and depth.

KM77 publishes a consistent "Maletero" table for many model generations.
Its methodology says that width and depth are the minimum and maximum values;
when only one value is shown, it is the minimum. The height is measured only
to the cargo cover, so this collector deliberately does not treat it as the
project's required height-to-seatbacks value.

This script is a read-only discovery tool. It reads unresolved physical
families from Directus/Postgres, tries deterministic KM77 URLs, parses cargo
tables, and writes a review file. It never writes vehicle dimensions.

The requests use curl's honest default user agent. There is no browser
impersonation, CAPTCHA handling, search API, or paid service.
"""

from __future__ import annotations

import argparse
import html
import json
import re
import runpy
import subprocess
import tempfile
import unicodedata
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict
from pathlib import Path
from typing import Any


SCRIPT_DIR = Path(__file__).resolve().parent
SHARED = runpy.run_path(str(SCRIPT_DIR / "collect-boot-dim-candidates.py"))
Family = SHARED["Family"]
database_connection = SHARED["database_connection"]

SUPPORTED_BODY_STYLES = {
    "SUV / Crossover",
    "Minivan",
    "Wagon",
    "Hatchback",
}
KM77_BASE = "https://www.km77.com/coches"
TAG = re.compile(r"<[^>]+>", re.S)
SPACE = re.compile(r"\s+")
TABLE = re.compile(r"<table\b.*?</table>", re.I | re.S)
ROW = re.compile(r"<tr\b.*?</tr>", re.I | re.S)
TH = re.compile(r"<th\b.*?</th>", re.I | re.S)
TD = re.compile(r"<td\b[^>]*>(.*?)</td>", re.I | re.S)
H1 = re.compile(r"<h1\b[^>]*>(.*?)</h1>", re.I | re.S)
CM_RANGE = re.compile(
    r"^\s*(?P<minimum>\d{1,3}(?:[.,]\d+)?)"
    r"(?:\s*[-–]\s*(?P<maximum>\d{1,3}(?:[.,]\d+)?))?\s*$"
)

# KM77 paths are usually normalized words separated by hyphens. These are
# verified exceptions where punctuation is removed instead.
MODEL_SLUG_OVERRIDES = {
    ("Volkswagen", "ID.4"): "id4",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Collect measured KM77 cargo width/depth for review."
    )
    parser.add_argument("--limit", type=int, default=40)
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--timeout", type=int, default=25)
    parser.add_argument(
        "--min-year",
        type=int,
        default=1995,
        help="Skip families ending before KM77's practical coverage window.",
    )
    parser.add_argument("--output", type=Path)
    parser.add_argument("--cache-dir", type=Path)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if (
        args.limit < 1
        or args.workers < 1
        or args.timeout < 1
        or args.min_year < 1900
    ):
        parser.error(
            "--limit, --workers, --timeout, and --min-year must be positive"
        )
    if args.offset < 0:
        parser.error("--offset cannot be negative")
    if not args.self_test and not args.output:
        parser.error("--output is required")
    return args


def normalize(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", value)
    ascii_value = decomposed.encode("ascii", "ignore").decode("ascii")
    return SPACE.sub(
        " ", re.sub(r"[^a-z0-9]+", " ", ascii_value.lower())
    ).strip()


def slug(value: str) -> str:
    return re.sub(r"-+", "-", normalize(value).replace(" ", "-")).strip("-")


def model_slug(family: Family) -> str:
    return MODEL_SLUG_OVERRIDES.get(
        (family.make, family.model), slug(family.model)
    )


def clean_cell(value: str) -> str:
    return SPACE.sub(" ", html.unescape(TAG.sub(" ", value))).strip()


def centimetre_range(value: str) -> dict[str, float] | None:
    match = CM_RANGE.fullmatch(value)
    if not match:
        return None
    minimum = float(match.group("minimum").replace(",", "."))
    maximum_text = match.group("maximum")
    maximum = (
        float(maximum_text.replace(",", ".")) if maximum_text else minimum
    )
    if not 10 <= minimum <= maximum <= 250:
        return None
    return {"minimum": minimum, "maximum": maximum}


def cargo_tables(page_html: str) -> list[dict[str, Any]]:
    title_match = H1.search(page_html)
    title = clean_cell(title_match.group(1)) if title_match else ""
    results = []
    for table in TABLE.findall(page_html):
        if not re.search(r"<h2>\s*Maletero\s*</h2>", table, re.I):
            continue
        headers = [clean_cell(value) for value in TH.findall(table)]
        normalized_headers = [normalize(value) for value in headers]
        try:
            depth_index = next(
                index
                for index, value in enumerate(normalized_headers)
                if value.startswith("profundidad")
            )
            width_index = next(
                index
                for index, value in enumerate(normalized_headers)
                if value.startswith("anchura")
            )
        except StopIteration:
            continue
        height_index = next(
            (
                index
                for index, value in enumerate(normalized_headers)
                if value == "altura cm"
            ),
            None,
        )
        for row in ROW.findall(table)[1:]:
            cells = [clean_cell(value) for value in TD.findall(row)]
            if len(cells) <= max(depth_index, width_index):
                continue
            depth = centimetre_range(cells[depth_index])
            width = centimetre_range(cells[width_index])
            if not depth or not width:
                continue
            result = {
                "page_title": title,
                "measured_vehicle": cells[0],
                "depth_text": cells[depth_index],
                "width_text": cells[width_index],
                "depth_cm": depth,
                "width_cm": width,
                "depth_in": round(depth["minimum"] / 2.54, 1),
                "width_in": round(width["minimum"] / 2.54, 1),
                "quote": (
                    f"Maletero — Profundidad (cm): {cells[depth_index]}; "
                    f"Anchura (cm): {cells[width_index]}."
                ),
            }
            if height_index is not None and len(cells) > height_index:
                height = centimetre_range(cells[height_index])
                if height:
                    result["height_to_cargo_cover_cm"] = height
            results.append(result)
    return results


def read_families(limit: int, offset: int, min_year: int) -> list[Family]:
    connection = database_connection()
    try:
        cursor = connection.cursor()
        cursor.execute(
            """
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
                   and generation ~ '^[0-9]{4}-[0-9]{4}$'
                 group by make, model, generation,
                          coalesce(
                              nullif(trim(cargo_body_variant), ''),
                              'standard'
                          )
            ),
            families as (
                select make, model, body_style, generation,
                       coalesce(
                           nullif(trim(cargo_body_variant), ''),
                           'standard'
                       ) as cargo_body_variant,
                       min(year)::int as year_start,
                       max(year)::int as year_end,
                       count(*)::int as vehicle_rows
                  from vehicles
                 where body_style = any(%s)
                   and generation ~ '^[0-9]{4}-[0-9]{4}$'
                 group by make, model, body_style, generation,
                          coalesce(
                              nullif(trim(cargo_body_variant), ''),
                              'standard'
                          )
                having bool_or(
                           coalesce(dims_status, '') <> 'no_data'
                           and (
                               boot_width_in is null
                               or boot_depth_in is null
                           )
                       )
                   and max(year) >= %s
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
            (list(SUPPORTED_BODY_STYLES), min_year, limit, offset),
        )
        return [Family(*row) for row in cursor.fetchall()]
    finally:
        connection.close()


def candidate_years(family: Family) -> list[int]:
    generation_start = int(family.generation.split("-", 1)[0])
    possibilities = (
        generation_start,
        family.year_start,
        generation_start - 1,
        family.year_start - 1,
        generation_start + 1,
        family.year_start + 1,
    )
    years = []
    for year in possibilities:
        if 1995 <= year <= 2026 and year not in years:
            years.append(year)
    return years


def candidate_url(family: Family, year: int) -> str:
    return (
        f"{KM77_BASE}/{slug(family.make)}/{model_slug(family)}/"
        f"{year}/mediciones-propias"
    )


def cache_path(cache_dir: Path, family: Family, year: int) -> Path:
    key = slug(family.key)
    return cache_dir / f"{key}-{year}.html"


def curl_page(url: str, path: Path, timeout: int) -> bool:
    path.parent.mkdir(parents=True, exist_ok=True)
    result = subprocess.run(
        [
            "curl",
            "-L",
            "--fail",
            "--silent",
            "--show-error",
            "--max-time",
            str(timeout),
            url,
            "-o",
            str(path),
        ],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode:
        path.unlink(missing_ok=True)
        return False
    return path.exists() and path.stat().st_size > 1000


def collect_family(
    family: Family, cache_dir: Path, timeout: int
) -> dict[str, Any]:
    attempts = []
    for year in candidate_years(family):
        url = candidate_url(family, year)
        path = cache_path(cache_dir, family, year)
        fetched = path.exists() or curl_page(url, path, timeout)
        attempt = {"year": year, "url": url, "fetched": fetched}
        attempts.append(attempt)
        if not fetched:
            continue
        page_html = path.read_text(errors="replace")
        measurements = cargo_tables(page_html)
        if not measurements:
            attempt["cargo_table"] = False
            continue
        attempt["cargo_table"] = True
        return {
            "family_key": family.key,
            "family": asdict(family),
            "status": "candidate",
            "source_url": url,
            "source_year": year,
            "measurements": measurements,
            "requires_generation_review": True,
            "requires_body_variant_review": len(measurements) != 1,
            "height_usable": False,
            "attempts": attempts,
        }
    return {
        "family_key": family.key,
        "family": asdict(family),
        "status": "no_cargo_table",
        "attempts": attempts,
    }


def collect(
    families: list[Family], cache_dir: Path, workers: int, timeout: int
) -> dict[str, Any]:
    records: list[dict[str, Any]] = []
    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {
            executor.submit(
                collect_family, family, cache_dir, timeout
            ): family.key
            for family in families
        }
        for future in as_completed(futures):
            records.append(future.result())
    order = {family.key: index for index, family in enumerate(families)}
    records.sort(key=lambda record: order[record["family_key"]])
    candidates = [record for record in records if record["status"] == "candidate"]
    return {
        "schema_version": 1,
        "source": "km77.com",
        "methodology": {
            "width_depth": (
                "Minimum and maximum; a single value is the minimum."
            ),
            "height": (
                "Measured to the cargo cover and intentionally not usable "
                "as height to the top of the seatbacks."
            ),
        },
        "summary": {
            "families_checked": len(records),
            "families_with_cargo_table": len(candidates),
            "candidate_measurement_rows": sum(
                len(record["measurements"]) for record in candidates
            ),
            "vehicle_rows_represented": sum(
                record["family"]["vehicle_rows"] for record in candidates
            ),
        },
        "families": records,
    }


def run_self_test() -> None:
    fixture = """
    <h1>Lexus UX 2019 | <span>Mediciones</span></h1>
    <table>
      <thead><tr>
        <th><h2>Maletero</h2></th><th>Profundidad (cm)</th>
        <th>Anchura (cm)</th><th>Altura (cm)</th>
      </tr></thead>
      <tbody><tr><td>Lexus UX (2019)</td><td>72 - 79</td>
        <td>95 - 125</td><td>31</td></tr></tbody>
    </table>
    """
    parsed = cargo_tables(fixture)
    assert len(parsed) == 1
    assert parsed[0]["depth_in"] == 28.3
    assert parsed[0]["width_in"] == 37.4
    assert parsed[0]["height_to_cargo_cover_cm"]["minimum"] == 31
    assert slug("Mercedes-Benz") == "mercedes-benz"
    print("self-test: ok")


def main() -> None:
    args = parse_args()
    if args.self_test:
        run_self_test()
        return
    cache_dir = args.cache_dir
    temporary = None
    if cache_dir is None:
        temporary = tempfile.TemporaryDirectory(prefix="km77-cargo-")
        cache_dir = Path(temporary.name)
    families = read_families(args.limit, args.offset, args.min_year)
    report = collect(families, cache_dir, args.workers, args.timeout)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    print(json.dumps(report["summary"], indent=2))
    if temporary is not None:
        temporary.cleanup()


if __name__ == "__main__":
    main()
