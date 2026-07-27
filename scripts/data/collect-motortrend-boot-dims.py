#!/usr/bin/env python3
"""Collect seats-up cargo width/depth from MotorTrend specification pages.

MotorTrend's deterministic model-year pages expose ordinary HTML containing
structured vehicle specifications. This collector does not use a search API,
browser automation, PDFs, or OCR.

Only SUVs/crossovers and minivans are targeted because a sample of ordinary
cars showed no published trunk length/width fields. Width is the cargo width
between wheelhousings (falling back to cargo width at floor). Depth is the
floor length behind the rearmost installed seating row.

The default run is read-only and writes a JSON review report. Database writes
require ``--apply``.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import dataclasses
import datetime as dt
import gzip
import json
import re
import runpy
import time
import unicodedata
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


SCRIPT_DIR = Path(__file__).resolve().parent
SHARED = runpy.run_path(str(SCRIPT_DIR / "collect-boot-dim-candidates.py"))
database_connection = SHARED["database_connection"]

USER_AGENT = "NorthCoastSoundworksResearch/1.0"
BODY_STYLES = {"SUV / Crossover", "Minivan"}
WIDTH_LABELS = (
    "Cargo Box Width @ Wheelhousings",
    "Cargo Box Width @ Floor",
)
DEPTH_LABELS = (
    "Cargo Area Length @ Floor to Seat 3",
    "Cargo Area Length @ Floor to Seat 2",
    "Cargo Area Length @ Floor to Seat 1",
)
THIRD_ROW_ROOM = re.compile(
    r"^Third(?: Row)? (?:Head|Hip|Leg|Shoulder) Room$", re.I
)
NEXT_CHUNK = re.compile(
    r"self\.__next_f\.push\((\[1,.*?\])\)</script>", re.S
)
MAX_RESPONSE_BYTES = 8_000_000
EXISTING_TOLERANCE_IN = 0.51


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


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=2500)
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument(
        "--report",
        type=Path,
        default=Path("/tmp/motortrend-boot-dims.json"),
    )
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.limit < 1 or args.workers < 1 or args.offset < 0:
        parser.error("limit/workers must be positive and offset non-negative")
    return args


def normalize(value: Any) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = text.encode("ascii", "ignore").decode("ascii").lower()
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", text)).strip()


def slug(value: str) -> str:
    return normalize(value).replace(" ", "-")


MODEL_SLUGS = {
    ("Mazda", "3"): "mazda3",
    ("Mazda", "6"): "mazda6",
}


def source_url(family: Family, year: int) -> str:
    model_slug = MODEL_SLUGS.get((family.make, family.model), slug(family.model))
    return (
        f"https://www.motortrend.com/cars/{slug(family.make)}/"
        f"{model_slug}/{year}/specs"
    )


def target_years(family: Family) -> list[int]:
    current_year = dt.date.today().year
    first = family.year_start
    last = min(family.year_end, current_year)
    middle = (first + last) // 2
    return list(dict.fromkeys((middle, first, last)))


def read_families(limit: int, offset: int) -> list[Family]:
    connection = database_connection()
    try:
        cursor = connection.cursor()
        cursor.execute(
            """
            select make, model, body_style, generation,
                   coalesce(nullif(trim(cargo_body_variant), ''), 'standard'),
                   min(year)::int, max(year)::int, count(*)::int
              from vehicles
             where body_style = any(%s)
               and generation ~ '^[0-9]{4}-[0-9]{4}$'
             group by make, model, body_style, generation,
                      coalesce(
                          nullif(trim(cargo_body_variant), ''),
                          'standard'
                      )
            having bool_or(
                       boot_width_in is null or boot_depth_in is null
                   )
             order by count(*) desc, make, model, generation,
                      coalesce(
                          nullif(trim(cargo_body_variant), ''),
                          'standard'
                      )
             limit %s offset %s
            """,
            (list(BODY_STYLES), limit, offset),
        )
        return [Family(*row) for row in cursor.fetchall()]
    finally:
        connection.close()


def fetch_page(url: str, timeout: int = 25) -> tuple[str, str]:
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


def decoded_next_data(page_html: str) -> str:
    chunks: list[str] = []
    for match in NEXT_CHUNK.finditer(page_html):
        try:
            payload = json.loads(match.group(1))
        except json.JSONDecodeError:
            continue
        if len(payload) > 1 and isinstance(payload[1], str):
            chunks.append(payload[1])
    return "".join(chunks)


def balanced_array(text: str, marker: str) -> str | None:
    marker_at = text.find(marker)
    if marker_at < 0:
        return None
    start = text.find("[", marker_at)
    if start < 0:
        return None
    depth = 0
    quoted = False
    escaped = False
    for index in range(start, len(text)):
        char = text[index]
        if quoted:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                quoted = False
            continue
        if char == '"':
            quoted = True
        elif char == "[":
            depth += 1
        elif char == "]":
            depth -= 1
            if depth == 0:
                return text[start : index + 1]
    return None


def parse_styles(page_html: str) -> list[dict[str, Any]]:
    data = decoded_next_data(page_html)
    search_at = 0
    while True:
        marker_at = data.find('"trims":[', search_at)
        if marker_at < 0:
            return []
        raw = balanced_array(data[marker_at:], '"trims":')
        if raw:
            try:
                trims = json.loads(raw)
            except json.JSONDecodeError:
                pass
            else:
                styles = [
                    style
                    for trim in trims
                    if isinstance(trim, dict)
                    for style in trim.get("styles", [])
                    if isinstance(style, dict)
                ]
                if styles:
                    return styles
        search_at = marker_at + len('"trims":[')


def walk(value: Any):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from walk(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk(child)


def style_specs(style: dict[str, Any]) -> dict[str, Any]:
    values: dict[str, Any] = {}
    for item in walk(style):
        label = item.get("titleName")
        raw_value = item.get("value")
        relevant = (
            label in WIDTH_LABELS + DEPTH_LABELS
            or label == "Cargo Volume to Seat 3"
            or bool(THIRD_ROW_ROOM.match(str(label or "")))
        )
        if not relevant:
            continue
        try:
            number = float(raw_value)
        except (TypeError, ValueError):
            continue
        if label in WIDTH_LABELS + DEPTH_LABELS and 5 <= number <= 150:
            values[label] = number
        elif number > 0:
            values["_has_third_row"] = True
    return values


def style_identity(style: dict[str, Any]) -> dict[str, Any]:
    configuration = (
        style.get("dataset", {}).get("configuration", {}).get("style", {})
    )
    model = configuration.get("model", {})
    body_types = configuration.get("bodyTypes", [])
    return {
        "year": model.get("modelYear"),
        "make": model.get("divisionName"),
        "model": model.get("modelName"),
        "name": style.get("name") or configuration.get("styleName") or "",
        "body_types": [
            item.get("bodyTypeName", "")
            for item in body_types
            if isinstance(item, dict)
        ],
    }


def model_matches(family: Family, identity: dict[str, Any], year: int) -> bool:
    if identity["year"] != year:
        return False
    if normalize(identity["make"]) != normalize(family.make):
        return False
    expected = normalize(family.model)
    actual = normalize(identity["model"])
    if actual == expected:
        return True
    suffix = actual.removeprefix(expected).strip()
    if suffix in {"van", "wagon"}:
        return True
    if suffix not in {"el", "max", "l", "xl", "lwb", "long", "extended"}:
        return False
    variant = normalize(family.cargo_body_variant)
    return bool(
        re.search(
            r"\b(?:el|max|ext|extended|long|lwb|xl)\b",
            variant,
        )
    )


def variant_matches(family: Family, identity: dict[str, Any]) -> bool:
    variant = normalize(family.cargo_body_variant)
    text = normalize(
        " ".join(
            (
                str(identity["model"]),
                str(identity["name"]),
                " ".join(identity["body_types"]),
            )
        )
    )
    if variant == "110 130 unresolved":
        return False
    if variant == "standard":
        return True
    if variant in {"standard body", "standard wheelbase"}:
        return not re.search(r"\b(?:el|max|ext|extended|long|lwb)\b", text)
    if variant == "standard two row":
        return True
    if "2 door" in variant and not re.search(r"\b(?:2dr|2 door)\b", text):
        return False
    if "4 door" in variant and not re.search(r"\b(?:4dr|4 door)\b", text):
        return False
    token_groups = {
        "unlimited": ("unlimited",),
        "max": ("max",),
        "esv": ("esv",),
        "el": ("el",),
        "ext": ("ext", "extended"),
        "long": ("long", "lwb"),
        "defender 90": ("90",),
        "defender 110": ("110",),
        "defender 130": ("130",),
        "40 series": ("40",),
        "55 series": ("55",),
        "60 62 series": ("60", "62"),
    }
    for phrase, alternatives in token_groups.items():
        phrase_pattern = r"\b" + r"\s+".join(
            re.escape(token) for token in phrase.split()
        ) + r"\b"
        if re.search(phrase_pattern, variant) and not any(
            re.search(rf"\b{re.escape(token)}\b", text)
            for token in alternatives
        ):
            return False
    return True


def physical_signature(identity: dict[str, Any], specs: dict[str, Any]) -> tuple:
    text = normalize(
        f"{identity['model']} {identity['name']} {' '.join(identity['body_types'])}"
    )
    length = (
        "extended"
        if re.search(r"\b(?:el|max|ext|extended|long|lwb)\b", text)
        else "short"
        if re.search(r"\b(?:short|swb)\b", text)
        else "standard"
    )
    use = (
        "cargo"
        if re.search(r"\b(?:cargo|commercial)\b", text)
        else "passenger"
        if re.search(r"\b(?:wagon|passenger)\b", text)
        else "standard"
    )
    doors = (
        "2-door"
        if re.search(r"\b(?:2dr|2 door)\b", text)
        else "4-door"
        if re.search(r"\b(?:4dr|4 door)\b", text)
        else "unspecified"
    )
    rows = 3 if specs.get("_has_third_row") else 2
    return length, use, doors, rows


def selected_measurements(specs: dict[str, Any]) -> dict[str, dict[str, Any]]:
    selected: dict[str, dict[str, Any]] = {}
    for label in WIDTH_LABELS:
        if label in specs:
            selected["width"] = {"label": label, "value_in": specs[label]}
            break
    style_name = normalize(specs.get("_style_name", ""))
    if specs.get("_has_third_row"):
        expected_depth_label = DEPTH_LABELS[0]
    elif any(word in style_name for word in ("cargo", "commercial", " van")):
        expected_depth_label = (
            DEPTH_LABELS[1] if DEPTH_LABELS[1] in specs else DEPTH_LABELS[2]
        )
    else:
        expected_depth_label = DEPTH_LABELS[1]
    if expected_depth_label in specs:
        label = expected_depth_label
        selected["depth"] = {
            "label": label,
            "value_in": specs[label],
            "seat_row": int(label[-1]),
        }
    return selected


def inspect_page(
    family: Family, requested_year: int, final_url: str, page_html: str
) -> dict[str, Any]:
    styles = parse_styles(page_html)
    matched: list[dict[str, Any]] = []
    for style in styles:
        identity = style_identity(style)
        if not model_matches(family, identity, requested_year):
            continue
        if not variant_matches(family, identity):
            continue
        specs = style_specs(style)
        specs["_style_name"] = identity["name"]
        chosen = selected_measurements(specs)
        matched.append(
            {
                "style": identity["name"],
                "identity": identity,
                "measurements": chosen,
                "signature": physical_signature(identity, specs),
            }
        )

    signatures = {tuple(item["signature"]) for item in matched}
    variant = normalize(family.cargo_body_variant)
    ambiguous = (
        variant in {"standard", "standard two row"}
        and len(signatures) > 1
        and any(
            len({signature[index] for signature in signatures}) > 1
            for index in (0, 1, 2, 3)
        )
    )
    if variant == "standard two row":
        matched = [
            item for item in matched if item["signature"][3] == 2
        ]
        ambiguous = False
    return {
        "requested_year": requested_year,
        "source_url": final_url,
        "style_count": len(styles),
        "matched_styles": matched,
        "signatures": [list(item) for item in sorted(signatures)],
        "ambiguous_physical_styles": ambiguous,
    }


def collect_family(family: Family) -> dict[str, Any]:
    pages: list[dict[str, Any]] = []
    values: dict[str, list[dict[str, Any]]] = {"width": [], "depth": []}
    for year in target_years(family):
        url = source_url(family, year)
        try:
            final_url, page_html = fetch_page(url)
            page = inspect_page(family, year, final_url, page_html)
            page["status"] = "ok"
        except urllib.error.HTTPError as error:
            page = {
                "requested_year": year,
                "source_url": url,
                "status": f"http_{error.code}",
            }
        except Exception as error:
            page = {
                "requested_year": year,
                "source_url": url,
                "status": type(error).__name__,
                "detail": str(error)[:200],
            }
        pages.append(page)
        if page.get("ambiguous_physical_styles"):
            continue
        for style in page.get("matched_styles", []):
            for dimension, selected in style["measurements"].items():
                values[dimension].append(
                    {
                        **selected,
                        "style": style["style"],
                        "year": year,
                        "source_url": page["source_url"],
                    }
                )
        if values["width"] and values["depth"]:
            break

    all_signatures = {
        tuple(signature)
        for page in pages
        for signature in page.get("signatures", [])
    }
    signature_mixture = (
        normalize(family.cargo_body_variant)
        in {"standard", "standard two row"}
        and len(all_signatures) > 1
        and any(
            len({signature[index] for signature in all_signatures}) > 1
            for index in (0, 1, 2, 3)
        )
    )
    depth_rows = {
        item.get("seat_row")
        for item in values["depth"]
        if item.get("seat_row") is not None
    }
    seating_mixture = len(depth_rows) > 1
    selected: dict[str, dict[str, Any] | None] = {}
    for dimension, candidates in values.items():
        if not candidates:
            selected[dimension] = None
            continue
        minimum = min(candidates, key=lambda item: item["value_in"])
        selected[dimension] = {
            **minimum,
            "observed_values": sorted(
                {item["value_in"] for item in candidates}
            ),
        }
    ambiguous = (
        any(page.get("ambiguous_physical_styles") for page in pages)
        or signature_mixture
        or seating_mixture
    )
    return {
        "family_key": family.key,
        "family": dataclasses.asdict(family),
        "accepted": not ambiguous and bool(
            selected["width"] or selected["depth"]
        ),
        "width": selected["width"] if not ambiguous else None,
        "depth": selected["depth"] if not ambiguous else None,
        "pages": pages,
        "reason": "physical_variant_mixture" if ambiguous else None,
    }


def collect(families: list[Family], workers: int) -> dict[str, Any]:
    decisions: list[dict[str, Any]] = []
    started = time.monotonic()
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {
            pool.submit(collect_family, family): family
            for family in families
        }
        for index, future in enumerate(
            concurrent.futures.as_completed(futures), 1
        ):
            family = futures[future]
            try:
                decisions.append(future.result())
            except Exception as error:
                decisions.append(
                    {
                        "family_key": family.key,
                        "family": dataclasses.asdict(family),
                        "accepted": False,
                        "reason": type(error).__name__,
                        "detail": str(error)[:200],
                    }
                )
            if index % 25 == 0 or index == len(families):
                accepted = sum(item.get("accepted", False) for item in decisions)
                print(
                    f"checked {index}/{len(families)}; usable {accepted}",
                    flush=True,
                )
    decisions.sort(
        key=lambda item: (
            -int(item["family"]["vehicle_rows"]),
            item["family_key"],
        )
    )
    return {
        "schema_version": 1,
        "source": "motortrend.com",
        "created_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "elapsed_seconds": round(time.monotonic() - started, 1),
        "families_checked": len(families),
        "decisions": decisions,
    }


def apply_report(report: dict[str, Any]) -> dict[str, Any]:
    connection = database_connection()
    families_updated = 0
    vehicle_rows_updated = 0
    conflicts: list[dict[str, Any]] = []
    try:
        cursor = connection.cursor()
        for decision in report["decisions"]:
            if not decision.get("accepted"):
                continue
            family = decision["family"]
            width = decision.get("width")
            depth = decision.get("depth")
            cursor.execute(
                """
                select count(*)::int,
                       array_remove(array_agg(distinct boot_width_in), null),
                       array_remove(array_agg(distinct boot_depth_in), null)
                  from vehicles
                 where make = %s and model = %s and body_style = %s
                   and generation = %s
                   and coalesce(
                           nullif(trim(cargo_body_variant), ''),
                           'standard'
                       ) = %s
                """,
                (
                    family["make"],
                    family["model"],
                    family["body_style"],
                    family["generation"],
                    family["cargo_body_variant"],
                ),
            )
            matched, old_widths, old_depths = cursor.fetchone()
            if matched != family["vehicle_rows"]:
                raise RuntimeError(
                    f"{decision['family_key']}: expected "
                    f"{family['vehicle_rows']} rows, found {matched}"
                )
            width_value = width["value_in"] if width else None
            depth_value = depth["value_in"] if depth else None
            if width_value is not None and any(
                abs(float(value) - width_value) > EXISTING_TOLERANCE_IN
                for value in old_widths
            ):
                conflicts.append(
                    {
                        "family_key": decision["family_key"],
                        "dimension": "width",
                        "existing": old_widths,
                        "motortrend": width_value,
                    }
                )
                width_value = None
            if depth_value is not None and any(
                abs(float(value) - depth_value) > EXISTING_TOLERANCE_IN
                for value in old_depths
            ):
                conflicts.append(
                    {
                        "family_key": decision["family_key"],
                        "dimension": "depth",
                        "existing": old_depths,
                        "motortrend": depth_value,
                    }
                )
                depth_value = None
            if width_value is None and depth_value is None:
                continue
            selected = [
                item
                for item in (width if width_value is not None else None,
                             depth if depth_value is not None else None)
                if item
            ]
            urls = " | ".join(
                dict.fromkeys(item["source_url"] for item in selected)
            )
            quotes = " | ".join(
                f"{item['label']}: {item['value_in']:g} in"
                for item in selected
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
                    urls,
                    urls,
                    urls,
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
        remaining_unfilled = cursor.fetchone()[0]
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()
    return {
        "families_updated": families_updated,
        "vehicle_rows_updated": vehicle_rows_updated,
        "conflicts": conflicts,
        "remaining_completely_unfilled": remaining_unfilled,
    }


def self_test() -> None:
    family = Family(
        "Ford",
        "Expedition",
        "SUV / Crossover",
        "2007-2017",
        "EL extended body",
        2007,
        2017,
        10,
    )
    assert source_url(family, 2015).endswith(
        "/cars/ford/expedition/2015/specs"
    )
    assert target_years(family) == [2012, 2007, 2017]
    assert variant_matches(
        family,
        {
            "model": "Expedition EL",
            "name": "Expedition EL 4WD XLT",
            "body_types": ["Sport Utility"],
        },
    )
    assert not variant_matches(
        family,
        {
            "model": "Expedition",
            "name": "Expedition 4WD XLT",
            "body_types": ["Sport Utility"],
        },
    )
    assert balanced_array('x"trims":[{"a":[1,2]}]y', '"trims":') == (
        '[{"a":[1,2]}]'
    )
    print("self-test passed")


def main() -> None:
    args = parse_args()
    if args.self_test:
        self_test()
        return
    families = read_families(args.limit, args.offset)
    print(f"collecting {len(families)} unresolved SUV/minivan families", flush=True)
    report = collect(families, args.workers)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    summary = {
        "families_checked": report["families_checked"],
        "usable_families": sum(
            decision.get("accepted", False)
            for decision in report["decisions"]
        ),
        "physical_variant_mixtures": sum(
            decision.get("reason") == "physical_variant_mixture"
            for decision in report["decisions"]
        ),
        "report": str(args.report),
    }
    if args.apply:
        summary["applied"] = apply_report(report)
    print(json.dumps(summary, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
