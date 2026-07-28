#!/usr/bin/env python3
"""Read-only reconciliation of live truck cab variants.

This deliberately avoids web search, PDFs, OCR, and per-vehicle AI work. It
compares the live Directus vehicles table with:

1. the locally purchased vehicle CSV (cab type and production span),
2. the EPA/DOE bulk vehicle CSV (US model-year existence),
3. NHTSA vPIC GetModelsForMakeYear results (US model-year existence), and
4. model/year/cab claims already present in enclosure product labels.

None of these sources alone is authoritative for US cab availability. The
script therefore reports agreement, gaps, and strict enclosure-fitment
mismatches; it never changes the database.

Usage:
  python3 scripts/data/reconcile-truck-cabs.py
  python3 scripts/data/reconcile-truck-cabs.py --refresh-vpic

The EPA zip defaults to /private/tmp/fueleconomy-vehicles.csv.zip.
The vPIC cache defaults to /private/tmp/ncsw-vpic-trucks.json.
"""

from __future__ import annotations

import argparse
import collections
import csv
import html
import json
import os
import re
import time
import unicodedata
import urllib.parse
import urllib.request
import zipfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path

import psycopg2


PURCHASED_CSV = Path("/Volumes/SSD 1TB/Database/auto_databases_one_July_2026.csv")
EPA_ZIP = Path("/private/tmp/fueleconomy-vehicles.csv.zip")
VPIC_CACHE = Path("/private/tmp/ncsw-vpic-trucks.json")

CAB_BY_BODY = {
    "Pickup Double Cab": "crew",
    "Pickup Extended Cab": "ext",
    "Pickup Single Cab": "single",
}

CAB_PATTERNS = {
    "crew": re.compile(
        r"\bsuper\s*crew\b|\bcrew\s*(?:cab|max)\b|\bdouble\s*cab\b|"
        r"\bmega\s*cab\b|\bquad\s*cab\b",
        re.I,
    ),
    "ext": re.compile(
        r"\bsuper\s*cab\b|\bextended\s*cab\b|\bext\s*cab\b|"
        r"\bking\s*cab\b|\baccess\s*cab\b",
        re.I,
    ),
    "single": re.compile(
        r"\bstandard\s*cab\b|\bregular\s*cab\b|\bsingle\s*cab\b|"
        r"\bstd\s*cab\b",
        re.I,
    ),
}

LOCATION_PATTERNS = {
    "behind_seat": re.compile(r"\bbehind (?:the |rear |back )?seat\b|\bbts\b", re.I),
    "under_rear_seat": re.compile(r"\bunder (?:the )?(?:rear |back )?seat\b|\buts\b", re.I),
    "center_console": re.compile(r"\bconsole\b|\bbetween (?:the )?(?:rear )?seats\b", re.I),
}


def normalize(value: str | None) -> str:
    return re.sub(r"[^a-z0-9]", "", (value or "").lower())


def slug_part(value: str) -> str:
    ascii_value = (
        unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    )
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", ascii_value.lower())).strip("-")


def db_connection():
    env = {}
    with open(os.path.expanduser("~/.config/directus-render.env")) as handle:
        for line in handle:
            if "=" in line:
                key, value = line.rstrip("\n").split("=", 1)
                env[key.strip()] = value.strip()
    return psycopg2.connect(env["DATABASE_URL"])


def source_models(make: str, model: str) -> set[str]:
    """Names used by the purchased global vehicle CSV."""
    if make == "Cadillac" and model == "Escalade EXT":
        return {"Escalade"}
    if make == "Chevrolet":
        if model.startswith("C/K "):
            return {"C/K"}
        if model == "S-10":
            return {"S-10 Pickup"}
        if model.startswith("Silverado"):
            return {"Silverado"}
    if make == "Dodge" and (model.startswith("RAM") or model.startswith("Ram Pickup")):
        return {"RAM"}
    if make == "Ford" and model == "F-150 Lightning":
        return {"F-150"}
    if make == "GMC":
        if model == "HUMMER EV":
            return {"Hummer EV"}
        if model == "S-15":
            return {"Sonoma"}
        if model.startswith("Sierra"):
            return {"Sierra"}
    if make == "Hummer" and model in {"H2 SUT", "H3T"}:
        return {model[:2]}
    if make == "Mazda" and model in {"B-Series Pickup", "B-Series Truck"}:
        return {"B-series"}
    if make == "Nissan" and model == "Titan XD":
        return {"Titan"}
    if make == "Toyota" and model == "Pickup":
        return {"Hilux"}
    return {model}


def us_model_aliases(make: str, model: str) -> set[str]:
    """Exact-ish names used by EPA baseModel and NHTSA vPIC."""
    aliases = {model}
    aliases.update(source_models(make, model))
    if make == "Chevrolet" and model.startswith("Silverado"):
        aliases.add(re.sub(r"\s+(Classic|Hybrid|LD|Limited)$", "", model))
        aliases.add(model.replace("HD", " HD"))
    if make == "GMC" and model.startswith("Sierra"):
        aliases.add(re.sub(r"\s+(Classic|Hybrid|Limited)$", "", model))
        aliases.add(model.replace("HD", " HD"))
    if make == "Dodge" and model.startswith("Ram Pickup "):
        aliases.add(model.replace("Ram Pickup ", "RAM "))
    if make == "Ford" and model == "F-150 Lightning":
        aliases.add("F-150")
    if make == "Ford" and model.endswith(" Super Duty"):
        aliases.add(model.removesuffix(" Super Duty"))
    if make == "Nissan" and model == "Truck":
        aliases.update({"Pickup", "D21", "Hardbody"})
    if make == "Toyota" and model == "Pickup":
        aliases.update({"Truck", "Truck/T100"})
    return {normalize(value) for value in aliases}


def external_model_matches(make: str, model: str, external: str) -> bool:
    candidate = normalize(external)
    aliases = us_model_aliases(make, model)
    if candidate in aliases:
        return True
    # EPA model strings frequently append drivetrain, fuel, and trim text.
    return any(
        candidate.startswith(alias + suffix)
        for alias in aliases
        for suffix in ("2wd", "4wd", "awd", "hybrid", "hfe", "trx", "ho")
    )


def parse_year_span(*parts: str | None) -> tuple[int, int] | None:
    text = html.unescape(" ".join(part or "" for part in parts))
    match = re.search(
        r"\b(19[4-9]\d|20[0-3]\d)\s*[-–]\s*(19[4-9]\d|20[0-3]\d|\d{2})\b",
        text,
    )
    if match:
        first, last = int(match.group(1)), int(match.group(2))
        if last < 100:
            last += 2000 if last <= 39 else 1900
        return (first, last) if first <= last else None
    match = re.search(r"\b(19[4-9]\d|20[0-3]\d)\s*(?:&\s*)?(older|newer|up|\+)", text, re.I)
    if match:
        year = int(match.group(1))
        return (1940, year) if match.group(2).lower() == "older" else (year, 2027)
    return None


def parse_cabs(*parts: str | None) -> set[str]:
    text = html.unescape(" ".join(part or "" for part in parts)).replace("-", " ")
    return {cab for cab, pattern in CAB_PATTERNS.items() if pattern.search(text)}


def parse_locations(*parts: str | None) -> set[str]:
    text = html.unescape(" ".join(part or "" for part in parts)).replace("-", " ")
    return {location for location, pattern in LOCATION_PATTERNS.items() if pattern.search(text)}


def cars_cab_variants(make: str, model: str, styles: list[str]) -> dict[str, set[str]]:
    """Return broad cab_type -> exact customer-facing cab names from style labels."""
    joined = "\n".join(styles)
    found: dict[str, set[str]] = collections.defaultdict(set)

    def add(pattern: str, cab: str, name: str):
        if re.search(pattern, joined, re.I):
            found[cab].add(name)

    add(r"\bSuper\s*Crew\b", "crew", "SuperCrew")
    add(r"\bCrew\s*Cab\b", "crew", "Crew Cab")
    add(r"\bCrew\s*Max\b", "crew", "CrewMax")
    add(r"\bMega\s*Cab\b", "crew", "Mega Cab")
    add(r"\bSuper\s*Cab\b", "ext", "SuperCab")
    add(r"\bExtended\s*Cab\b", "ext", "Extended Cab")
    add(r"\bKing\s*Cab\b", "ext", "King Cab")
    add(r"\bAccess(?:\s*Cab)?\b", "ext", "Access Cab")
    add(r"\bXtra\s*Cab\b", "ext", "XtraCab")
    add(r"\bQuad\s*Cab\b", "ext", "Quad Cab")
    add(r"\b(?:Regular|Reg)\s*Cab\b|^\s*Reg(?:\s+\d|$)", "single", "Regular Cab")
    add(r"\bStandard\s*Cab\b", "single", "Standard Cab")
    add(r"\bSingle\s*Cab\b", "single", "Single Cab")

    # "Double Cab" is not a universal cabin size. GM and Tundra use it for
    # their shorter four-door cab; Tacoma uses it for the full crew cab.
    double_pattern = r"\bDouble\s*Cab\b|\bDoubleCab\b|^\s*Double(?:\s+\d|$)"
    if re.search(double_pattern, joined, re.I):
        if make == "Toyota" and model == "Tacoma":
            found["crew"].add("Double Cab")
        elif (make == "Toyota" and model == "Tundra") or make in {"Chevrolet", "GMC"}:
            found["ext"].add("Double Cab")

    return found


def vendor_models(constraint: str | None) -> set[tuple[str, str]]:
    if not constraint or "/" not in constraint:
        return set()
    make, model = constraint.split("/", 1)
    if (make, model) == ("Dodge", "1500"):
        return {
            ("Dodge", "RAM"),
            ("Dodge", "Ram Pickup 1500"),
            ("Ram", "1500"),
            ("Ram", "1500 Classic"),
        }
    if (make, model) == ("Chevrolet", "Colorado"):
        return {("Chevrolet", "Colorado"), ("GMC", "Canyon")}
    return {(make, model)}


@dataclass(frozen=True)
class Variant:
    make: str
    model: str
    generation: str
    cab: str
    years: frozenset[int]
    row_count: int

    @property
    def label(self) -> str:
        return f"{self.make} {self.model} [{self.generation}] {self.cab}"


@dataclass(frozen=True)
class Product:
    slug: str
    constraint: str
    label: str
    url: str
    models: frozenset[tuple[str, str]]
    span: tuple[int, int] | None
    cabs: frozenset[str]
    locations: frozenset[str]


def load_live():
    connection = db_connection()
    cursor = connection.cursor()
    cursor.execute(
        """
        select make, model, generation, cab_type, year, count(*)
        from vehicles
        where body_style = 'Truck'
        group by 1,2,3,4,5
        order by 1,2,3,4,5
        """
    )
    grouped: dict[tuple[str, str, str, str], dict[int, int]] = collections.defaultdict(dict)
    for make, model, generation, cab, year, count in cursor.fetchall():
        grouped[(make, model, generation, cab)][year] = count
    variants = [
        Variant(make, model, generation, cab, frozenset(year_counts), sum(year_counts.values()))
        for (make, model, generation, cab), year_counts in grouped.items()
    ]

    cursor.execute(
        """
        select slug, coalesce(vehicle_constraint,''), coalesce(vehicle_label_raw,''),
               coalesce(vendor_url,'')
        from sub_enclosures
        where vendor_url is not null
        order by slug
        """
    )
    products = []
    for slug, constraint, label, url in cursor.fetchall():
        models = vendor_models(constraint)
        if not models:
            continue
        product = Product(
            slug,
            constraint,
            label,
            url,
            frozenset(models),
            parse_year_span(label, url, slug),
            frozenset(parse_cabs(label, url, slug)),
            frozenset(parse_locations(label, url, slug)),
        )
        if any((variant.make, variant.model) in product.models for variant in variants):
            products.append(product)

    cursor.execute(
        """
        select f.sub_enclosure_slug, v.make, v.model, v.year, v.cab_type
        from sub_enclosure_fitments f
        join vehicles v on v.vehicle_id = f.vehicle_id
        join sub_enclosures e on e.slug = f.sub_enclosure_slug
        where e.vendor_url is not null
        """
    )
    current_fitments = collections.defaultdict(list)
    for slug, make, model, year, cab in cursor.fetchall():
        current_fitments[slug].append((make, model, year, cab))
    connection.close()
    return variants, products, current_fitments


def load_purchased():
    evidence: dict[tuple[str, str, str], set[int]] = collections.defaultdict(set)
    with PURCHASED_CSV.open(encoding="utf-8", errors="replace") as handle:
        for row in csv.DictReader(handle):
            cab = CAB_BY_BODY.get(row["Body_Type"])
            if not cab:
                continue
            try:
                start, end = int(row["Start_Year_Production"]), int(row["End_Year_Production"])
            except (TypeError, ValueError):
                continue
            evidence[(row["Make"], row["Model"], cab)].update(range(start, end + 1))
    return evidence


def load_epa():
    evidence: dict[tuple[str, int], set[str]] = collections.defaultdict(set)
    if not EPA_ZIP.exists():
        return evidence
    with zipfile.ZipFile(EPA_ZIP) as archive:
        with archive.open("vehicles.csv") as raw:
            import io

            handle = io.TextIOWrapper(raw, encoding="utf-8", errors="replace", newline="")
            for row in csv.DictReader(handle):
                if "Pickup" not in row.get("VClass", ""):
                    continue
                try:
                    year = int(row["year"])
                except (TypeError, ValueError):
                    continue
                evidence[(row["make"], year)].update(
                    value for value in (row.get("baseModel"), row.get("model")) if value
                )
    return evidence


def fetch_vpic(pair: tuple[str, int]):
    make, year = pair
    url = (
        "https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeYear/make/"
        f"{urllib.parse.quote(make, safe='')}/modelyear/{year}/vehicletype/truck?format=json"
    )
    for attempt in range(3):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "NCSW-data-audit/1.0"})
            with urllib.request.urlopen(request, timeout=30) as response:
                data = json.load(response)
            return make, year, sorted(
                {row["Model_Name"] for row in data.get("Results", []) if row.get("Model_Name")}
            ), None
        except Exception as error:  # report failures; do not silently convert them to no-data
            if attempt == 2:
                return make, year, [], str(error)
            time.sleep(1.5 * (attempt + 1))


def refresh_vpic(variants: list[Variant], cache_path: Path, workers: int):
    pairs = sorted(
        {(variant.make, year) for variant in variants for year in variant.years if year >= 1981}
    )
    results, errors = {}, {}
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(fetch_vpic, pair): pair for pair in pairs}
        for index, future in enumerate(as_completed(futures), 1):
            make, year, models, error = future.result()
            key = f"{make}|{year}"
            results[key] = models
            if error:
                errors[key] = error
            if index % 100 == 0:
                print(f"vPIC progress: {index}/{len(pairs)}", flush=True)
    cache_path.write_text(
        json.dumps({"results": results, "errors": errors}, indent=1, sort_keys=True) + "\n"
    )
    print(f"vPIC cache: {len(results)} make-years, {len(errors)} request errors -> {cache_path}")


def load_vpic(cache_path: Path):
    if not cache_path.exists():
        return {}, {}
    data = json.loads(cache_path.read_text())
    results = {}
    for key, models in data.get("results", {}).items():
        make, year = key.rsplit("|", 1)
        results[(make, int(year))] = set(models)
    return results, data.get("errors", {})


def coverage(years: frozenset[int], supported: set[int]) -> str:
    count = len(years & supported)
    if count == len(years):
        return "full"
    if count:
        return "partial"
    return "none"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh-vpic", action="store_true")
    parser.add_argument("--vpic-cache", type=Path, default=VPIC_CACHE)
    parser.add_argument("--workers", type=int, default=6)
    parser.add_argument(
        "--cars-targets",
        type=Path,
        help="Write focused Cars.com targets for cab gaps; still makes no DB changes.",
    )
    parser.add_argument(
        "--cars-observations",
        type=Path,
        help="Read browser-collected Cars.com style labels and compare them to live cabs.",
    )
    args = parser.parse_args()

    variants, products, current_fitments = load_live()
    purchased = load_purchased()
    epa = load_epa()
    if args.refresh_vpic:
        refresh_vpic(variants, args.vpic_cache, args.workers)
    vpic, vpic_errors = load_vpic(args.vpic_cache)

    source_status = collections.Counter()
    us_status = collections.Counter()
    product_status = collections.Counter()
    source_gaps = []
    us_gaps = []
    product_supported = []

    for variant in variants:
        source_years = set()
        for model in source_models(variant.make, variant.model):
            source_years.update(purchased.get((variant.make, model, variant.cab), set()))
        source_result = coverage(variant.years, source_years)
        source_status[source_result] += 1
        if source_result != "full":
            source_gaps.append((variant, source_result, sorted(variant.years - source_years)))

        us_years = set()
        for year in variant.years:
            epa_hit = any(
                external_model_matches(variant.make, variant.model, model_name)
                for model_name in epa.get((variant.make, year), set())
            )
            vpic_hit = any(
                external_model_matches(variant.make, variant.model, model_name)
                for model_name in vpic.get((variant.make, year), set())
            )
            if epa_hit or vpic_hit:
                us_years.add(year)
        us_result = coverage(variant.years, us_years)
        us_status[us_result] += 1
        if us_result != "full":
            us_gaps.append((variant, us_result, sorted(variant.years - us_years)))

        matching_products = []
        for product in products:
            if (variant.make, variant.model) not in product.models:
                continue
            if variant.cab not in product.cabs or not product.span:
                continue
            if any(product.span[0] <= year <= product.span[1] for year in variant.years):
                matching_products.append(product)
        product_result = "some" if matching_products else "none"
        product_status[product_result] += 1
        if matching_products:
            product_supported.append((variant, matching_products))

    strict_product_gaps = []
    fitment_errors = []
    for product in products:
        if not product.span or not product.cabs:
            continue
        intended_rows = [
            (variant, year)
            for variant in variants
            if (variant.make, variant.model) in product.models
            for year in variant.years
            if product.span[0] <= year <= product.span[1]
        ]
        intended_exact = [
            (variant, year) for variant, year in intended_rows if variant.cab in product.cabs
        ]
        if intended_rows and not intended_exact:
            strict_product_gaps.append((product, intended_rows))

        linked = current_fitments.get(product.slug, [])
        wrong = [
            row
            for row in linked
            if (row[0], row[1]) not in product.models
            or not (product.span[0] <= row[2] <= product.span[1])
            or row[3] not in product.cabs
        ]
        if wrong:
            fitment_errors.append((product, len(linked), len(wrong), wrong))

    if args.cars_targets:
        target_years: dict[tuple[str, str, str], set[int]] = collections.defaultdict(set)
        for variant, result, missing_years in source_gaps:
            if result in {"partial", "none"}:
                key = (variant.make, variant.model, variant.generation)
                target_years[key].update({min(variant.years), max(variant.years)})
                if missing_years:
                    target_years[key].update({min(missing_years), max(missing_years)})
        for product, rows in strict_product_gaps:
            for variant, year in rows:
                target_years[(variant.make, variant.model, variant.generation)].add(year)

        targets = []
        for (make, model, generation), years in sorted(target_years.items()):
            selected = sorted(years)
            # Boundary years catch most within-generation cab introductions/removals
            # without expanding into a per-model-year crawl.
            if len(selected) > 4:
                selected = sorted({selected[0], selected[1], selected[-2], selected[-1]})
            for year in selected:
                slug = "-".join((slug_part(make), slug_part(model), str(year)))
                targets.append(
                    {
                        "make": make,
                        "model": model,
                        "generation": generation,
                        "year": year,
                        "url": f"https://www.cars.com/research/{slug}/specs/",
                    }
                )
        args.cars_targets.parent.mkdir(parents=True, exist_ok=True)
        args.cars_targets.write_text(
            json.dumps({"schema_version": 1, "targets": targets}, indent=2) + "\n"
        )
        print(f"\nCARS.COM FOCUSED TARGETS: {len(targets)} -> {args.cars_targets}")

    cars_pages = []
    cars_missing = []
    cars_extra = []
    if args.cars_observations:
        data = json.loads(args.cars_observations.read_text())
        live_by_year: dict[tuple[str, str, int], set[str]] = collections.defaultdict(set)
        for variant in variants:
            for year in variant.years:
                live_by_year[(variant.make, variant.model, year)].add(variant.cab)
        for page in data.get("observations", []):
            styles = page.get("styles") or []
            if page.get("status") != "ok" or len(styles) <= 1:
                continue
            marketed = cars_cab_variants(page["make"], page["model"], styles)
            if not marketed:
                continue
            claimed = set(marketed)
            live = live_by_year.get((page["make"], page["model"], int(page["year"])), set())
            cars_pages.append((page, marketed, live))
            for cab in claimed - live:
                cars_missing.append((page, cab, marketed[cab], live))
            for cab in live - claimed:
                cars_extra.append((page, cab, marketed, live))

    print("\nLIVE SCOPE")
    print(f"  truck rows                 {sum(variant.row_count for variant in variants):>6}")
    print(f"  generation/cab variants   {len(variants):>6}")
    print(f"  model-specific products   {len(products):>6}")

    print("\nCAB EVIDENCE — PURCHASED STRUCTURED CSV")
    print(f"  full variant-span support {source_status['full']:>6}")
    print(f"  partial support           {source_status['partial']:>6}")
    print(f"  no support                {source_status['none']:>6}")

    print("\nUS MODEL-YEAR EVIDENCE — EPA OR vPIC (NOT CAB EVIDENCE)")
    print(f"  full variant-span support {us_status['full']:>6}")
    print(f"  partial support           {us_status['partial']:>6}")
    print(f"  no support                {us_status['none']:>6}")
    print(f"  vPIC request errors       {len(vpic_errors):>6}")

    print("\nENCLOSURE LABEL EVIDENCE")
    print(f"  variants touched          {product_status['some']:>6}")
    print(f"  variants not touched      {product_status['none']:>6}")
    print(f"  strict label/DB cab gaps  {len(strict_product_gaps):>6}")
    print(f"  products with bad links   {len(fitment_errors):>6}")

    if args.cars_observations:
        print("\nCARS.COM STRUCTURED STYLE-LIST EVIDENCE")
        print(f"  pages with parsed cabs     {len(cars_pages):>6}")
        print(f"  missing live cab/year      {len(cars_missing):>6}")
        print(f"  live cab absent on page    {len(cars_extra):>6}")
        print("\n  MISSING LIVE CAB/YEAR EVIDENCE")
        for page, cab, names, live in cars_missing:
            print(
                f"    {page['make']} {page['model']} {page['year']}: "
                f"{'/'.join(sorted(names))} -> {cab}; live={','.join(sorted(live)) or 'none'}"
            )

    print("\nSTRICT ENCLOSURE LABEL/DB CAB GAPS")
    if not strict_product_gaps:
        print("  none")
    for product, rows in strict_product_gaps:
        live = sorted({f"{variant.cab}:{year}" for variant, year in rows})
        print(
            f"  {product.slug}: claims cabs={','.join(sorted(product.cabs))} "
            f"years={product.span[0]}-{product.span[1]}; live={','.join(live[:18])}"
            + ("..." if len(live) > 18 else "")
        )

    print("\nCURRENT FITMENT LINKS THAT VIOLATE PRODUCT MODEL/YEAR/CAB")
    if not fitment_errors:
        print("  none")
    for product, total, wrong_count, wrong in sorted(
        fitment_errors, key=lambda item: (-item[2], item[0].slug)
    ):
        examples = ", ".join(
            f"{make} {model} {year} {cab}" for make, model, year, cab in wrong[:3]
        )
        print(f"  {product.slug}: {wrong_count}/{total} wrong; {examples}")

    print("\nPARTIAL PURCHASED-CAB GAPS TO REVIEW (NO AUTOMATIC DELETES)")
    for variant, result, years in source_gaps:
        if result == "partial":
            print(f"  {result:7} {variant.label}; unsupported years={years}")

    print("\nUS MODEL-YEAR GAPS TO REVIEW")
    for variant, result, years in us_gaps:
        print(f"  {result:7} {variant.label}; unsupported years={years}")

    print("\nREAD ONLY — no database rows were changed.")


if __name__ == "__main__":
    main()
