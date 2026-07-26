#!/usr/bin/env python3
"""Prepare and validate Cars.com cargo-dimension collection runs.

Cars.com serves useful, structured research pages to a normal browser but
returns HTTP 403 to direct command-line clients. Retrieval therefore happens
through ``cars-com-browser-collector.mjs`` in Codex's in-app browser. This
script owns the durable parts of the workflow:

1. Read unresolved physical vehicle families from Directus/Postgres.
2. Produce deterministic Cars.com research URLs without a search API.
3. Validate browser observations and select seats-up width/depth.
4. Optionally apply only unambiguous, explicitly sourced decisions.

The default behavior is read-only. Database writes require ``--apply``.

Examples:
    python3 scripts/data/collect-cars-com-boot-dims.py --self-test
    python3 scripts/data/collect-cars-com-boot-dims.py \
        --limit 40 --manifest /tmp/cars-com-pilot-manifest.json
    python3 scripts/data/collect-cars-com-boot-dims.py \
        --manifest /tmp/cars-com-pilot-manifest.json \
        --observations /tmp/cars-com-pilot-observations.json \
        --review /tmp/cars-com-pilot-review.json
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import runpy
import unicodedata
from collections import Counter
from dataclasses import asdict
from pathlib import Path
from typing import Any


SCRIPT_DIR = Path(__file__).resolve().parent
SHARED = runpy.run_path(str(SCRIPT_DIR / "collect-boot-dim-candidates.py"))
Family = SHARED["Family"]
database_connection = SHARED["database_connection"]
read_families = SHARED["read_families"]

WIDTH_LABEL_PRIORITY = (
    "Cargo Box Width @ Wheelhousings",
    "Interior cargo area min width",
    "Cargo Box Width @ Floor",
)
SUPPORTED_BODY_STYLES = {"SUV / Crossover", "Minivan", "Wagon", "Hatchback"}
MAX_SEATS_UP_DEPTH_IN = 55
EXISTING_VALUE_TOLERANCE_IN = 0.51
DEPTH_LABELS = tuple(
    f"Cargo Area Length @ Floor to Seat {row}" for row in range(5, 1, -1)
)
NUMBER_WITH_INCHES = re.compile(
    r"^\s*(?P<value>\d{1,3}(?:\.\d+)?)\s*(?:in\.?|inches?|[\"”])\s*$",
    re.I,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Prepare or validate the deterministic Cars.com collector."
    )
    parser.add_argument("--limit", type=int, default=40)
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument(
        "--status",
        choices=("unresolved", "untouched", "pending", "review"),
        default="unresolved",
    )
    parser.add_argument("--manifest", type=Path)
    parser.add_argument("--observations", type=Path)
    parser.add_argument("--review", type=Path)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write only accepted width/depth decisions to vehicles.",
    )
    parser.add_argument(
        "--audit-live",
        action="store_true",
        help="Run all live write preflights inside a rolled-back transaction.",
    )
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.limit < 1:
        parser.error("--limit must be positive")
    if args.offset < 0:
        parser.error("--offset cannot be negative")
    if args.observations and not args.manifest:
        parser.error("--observations requires --manifest")
    if (args.apply or args.audit_live) and not args.observations:
        parser.error("--apply/--audit-live requires --manifest and --observations")
    if args.apply and args.audit_live:
        parser.error("--apply and --audit-live are mutually exclusive")
    return args


def slug_part(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii")
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", ascii_value.lower())).strip(
        "-"
    )


def cars_com_url(family: Family, year: int | None = None) -> str:
    model_year = year or family.year_start
    slug = "-".join((slug_part(family.make), slug_part(family.model), str(model_year)))
    return f"https://www.cars.com/research/{slug}/specs/"


def manifest_record(family: Family) -> dict[str, Any]:
    representative_year = min(family.year_end, dt.date.today().year)
    return {
        "family_key": family.key,
        "family": asdict(family),
        "targets": [
            {
                "year": representative_year,
                "url": cars_com_url(family, representative_year),
            }
        ],
    }


def build_manifest(limit: int, offset: int, status: str) -> dict[str, Any]:
    families = read_families(limit, offset, status)
    return {
        "schema_version": 1,
        "source": "cars.com",
        "status_filter": status,
        "offset": offset,
        "limit": limit,
        "families": [manifest_record(family) for family in families],
    }


def load_json(path: Path) -> Any:
    return json.loads(path.read_text())


def save_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")


def numeric_inches(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    if not isinstance(value, str):
        return None
    match = NUMBER_WITH_INCHES.match(value)
    return float(match.group("value")) if match else None


def select_width(measurements: dict[str, Any]) -> dict[str, Any] | None:
    for label in WIDTH_LABEL_PRIORITY:
        value = numeric_inches(measurements.get(label))
        if value is not None and 28 <= value <= 75:
            return {"label": label, "value_in": value}
    return None


def select_depth(measurements: dict[str, Any]) -> dict[str, Any] | None:
    capacity_value = measurements.get("Passenger Capacity")
    capacity_match = re.search(r"\d+", str(capacity_value or ""))
    capacity = int(capacity_match.group()) if capacity_match else None
    expected_row = 3 if capacity and capacity > 5 else 2 if capacity else None
    labels = (
        (f"Cargo Area Length @ Floor to Seat {expected_row}",)
        if expected_row
        else DEPTH_LABELS
    )
    for label in labels:
        value = numeric_inches(measurements.get(label))
        if value is not None and 8 <= value <= 90:
            row = int(label.rsplit(" ", 1)[1])
            return {
                "label": label,
                "value_in": value,
                "seat_row": row,
                "passenger_capacity": capacity,
            }
    return None


def family_lookup(manifest: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        item["family_key"]: item
        for item in manifest.get("families", [])
        if isinstance(item, dict) and item.get("family_key")
    }


def page_identity_ok(family: dict[str, Any], page: dict[str, Any]) -> bool:
    title = str(page.get("title") or "").lower()
    url = str(page.get("url") or "").lower()
    make = str(family["make"]).lower()
    model = str(family["model"]).lower()
    year = str(page.get("target_year") or family["year_start"])
    identity_ok = (
        page.get("status") == "ok"
        and make in title
        and model in title
        and year in title
        and f"-{year}/specs/" in url
    )
    if not identity_ok:
        return False
    return style_matches_family(family, page)


def style_matches_family(
    family: dict[str, Any], page: dict[str, Any]
) -> bool:
    style = " ".join(
        str(page.get(key) or "")
        for key in ("style_name", "body_type", "title")
    ).lower()
    body_terms = {
        "Sedan": ("sedan",),
        "Coupe": ("coupe", "coupé"),
        "Convertible": ("convertible", "cabriolet", "roadster"),
        "Hatchback": ("hatchback", "hatch"),
        "Wagon": ("wagon", "estate"),
        "Minivan": ("minivan", "passenger van", "van"),
        "SUV / Crossover": ("suv", "sport utility", "crossover"),
    }
    mentioned_styles = {
        body_style
        for body_style, terms in body_terms.items()
        if any(re.search(rf"\b{re.escape(term)}\b", style) for term in terms)
    }
    expected_style = family["body_style"]
    if mentioned_styles and expected_style not in mentioned_styles:
        return False
    if (
        int(family.get("body_style_variant_count") or 1) > 1
        and expected_style not in mentioned_styles
    ):
        return False

    variant = str(family.get("cargo_body_variant") or "standard").lower()
    if variant == "standard":
        return True
    if variant in {"standard body", "standard wheelbase"}:
        return not re.search(
            r"\b(?:extended|long|lwb|max|el|ext)\b", style, re.I
        )
    if "2-door" in variant and not re.search(r"\b(?:2dr|2[- ]door)\b", style):
        return False
    if "4-door" in variant and not re.search(r"\b(?:4dr|4[- ]door)\b", style):
        return False
    required_tokens = []
    for token in re.findall(r"[a-z0-9]+", variant):
        if token in {
            "2",
            "4",
            "door",
            "doors",
            "body",
            "extended",
            "short",
            "long",
            "wheelbase",
            "standard",
            "series",
            "three",
            "row",
            "coupe",
            "sedan",
            "hatchback",
            "convertible",
            "wagon",
            "unresolved",
        }:
            continue
        required_tokens.append(token)
    return all(re.search(rf"\b{re.escape(token)}\b", style) for token in required_tokens)


def candidate_from_page(
    family_key: str,
    family: dict[str, Any],
    page: dict[str, Any],
) -> dict[str, Any]:
    measurements = page.get("measurements") or {}
    width = select_width(measurements)
    depth = select_depth(measurements)
    accepted = page_identity_ok(family, page) and bool(width or depth)
    reasons: list[str] = []
    if page.get("status") != "ok":
        reasons.append(str(page.get("status") or "fetch_failed"))
    elif not page_identity_ok(family, page):
        reasons.append("identity_mismatch")
    if not width:
        reasons.append("width_missing")
    if not depth:
        reasons.append("depth_missing")
    quotes = []
    for selected in (width, depth):
        if selected:
            quotes.append(f"{selected['label']}: {selected['value_in']:g} in")
    return {
        "family_key": family_key,
        "family": family,
        "accepted": accepted,
        "source_url": page.get("url"),
        "source_title": page.get("title"),
        "style_name": page.get("style_name"),
        "page_measurements": measurements,
        "width": width,
        "depth": depth,
        "quotes": quotes,
        "reasons": reasons,
        "style_links_found": len(page.get("style_links") or []),
    }


def build_review(
    manifest: dict[str, Any], observations: dict[str, Any]
) -> dict[str, Any]:
    lookup = family_lookup(manifest)
    candidates: list[dict[str, Any]] = []
    unknown_keys: list[str] = []
    for page in observations.get("pages", []):
        family_key = page.get("family_key")
        item = lookup.get(family_key)
        if not item:
            unknown_keys.append(str(family_key))
            continue
        candidates.append(
            candidate_from_page(family_key, item["family"], page)
        )

    by_family: dict[str, list[dict[str, Any]]] = {}
    for candidate in candidates:
        by_family.setdefault(candidate["family_key"], []).append(candidate)

    decisions: list[dict[str, Any]] = []
    for family_key, item in lookup.items():
        found = [c for c in by_family.get(family_key, []) if c["accepted"]]
        style_found = [
            c
            for c in found
            if re.search(r"/specs/\d+/?$", str(c.get("source_url") or ""))
        ]
        if style_found:
            found = style_found
        if not found:
            decisions.append(
                {
                    "family_key": family_key,
                    "family": item["family"],
                    "accepted": False,
                    "reasons": ["no_usable_page"],
                }
            )
            continue
        # Initial collection observes one representative style. Multiple pages
        # are accepted only when every non-null value agrees.
        width_values = {
            c["width"]["value_in"] for c in found if c.get("width")
        }
        depth_values = {
            c["depth"]["value_in"] for c in found if c.get("depth")
        }
        passenger_capacities = {
            c["depth"]["passenger_capacity"]
            for c in found
            if c.get("depth")
            and c["depth"].get("passenger_capacity") is not None
        }
        for candidate in found:
            raw_capacity = (
                candidate.get("page_measurements") or {}
            ).get("Passenger Capacity")
            capacity_match = re.search(r"\d+", str(raw_capacity or ""))
            if capacity_match:
                passenger_capacities.add(int(capacity_match.group()))
        conflicts = []
        if len(width_values) > 1:
            conflicts.append("width_conflict")
        if len(depth_values) > 1:
            conflicts.append("depth_conflict")
        seating_conflict = any(value > 5 for value in passenger_capacities) and any(
            value <= 5 for value in passenger_capacities
        )
        if seating_conflict:
            conflicts.append("seating_configuration_conflict")
        best = max(
            found,
            key=lambda c: int(bool(c.get("width"))) + int(bool(c.get("depth"))),
        )
        accepted_width = best.get("width") if len(width_values) == 1 else None
        accepted_depth = (
            best.get("depth")
            if len(depth_values) == 1 and not seating_conflict
            else None
        )
        if item["family"]["body_style"] not in SUPPORTED_BODY_STYLES:
            accepted_width = None
            accepted_depth = None
            conflicts.append("unsupported_body_style")
        if (
            accepted_depth
            and accepted_depth["value_in"] > MAX_SEATS_UP_DEPTH_IN
        ):
            accepted_depth = None
            conflicts.append("implausible_seats_up_depth")
        quotes = []
        for selected in (accepted_width, accepted_depth):
            if selected:
                quotes.append(
                    f"{selected['label']}: {selected['value_in']:g} in"
                )
        decisions.append(
            {
                **best,
                "accepted": bool(accepted_width or accepted_depth),
                "width": accepted_width,
                "depth": accepted_depth,
                "quotes": quotes,
                "reasons": conflicts or best["reasons"],
            }
        )

    summary = Counter()
    for decision in decisions:
        summary["families"] += 1
        if decision["accepted"]:
            summary["accepted"] += 1
            if decision.get("width"):
                summary["width_found"] += 1
            if decision.get("depth"):
                summary["depth_found"] += 1
            if decision.get("width") and decision.get("depth"):
                summary["both_found"] += 1
        else:
            summary["rejected"] += 1

    return {
        "schema_version": 1,
        "source": "cars.com",
        "summary": dict(summary),
        "unknown_family_keys": unknown_keys,
        "decisions": decisions,
    }


def apply_review(review: dict[str, Any], commit: bool = True) -> dict[str, Any]:
    accepted = [
        decision
        for decision in review.get("decisions", [])
        if decision.get("accepted")
        and (decision.get("width") or decision.get("depth"))
    ]
    connection = database_connection()
    changed_rows = 0
    width_cells_updated = 0
    depth_cells_updated = 0
    applied_families = 0
    conflicts: list[dict[str, Any]] = []
    try:
        cursor = connection.cursor()
        for decision in accepted:
            family = decision["family"]
            width = (decision.get("width") or {}).get("value_in")
            depth = (decision.get("depth") or {}).get("value_in")
            cursor.execute(
                """
                select count(*)::int,
                       array_remove(array_agg(distinct boot_width_in), null),
                       array_remove(array_agg(distinct boot_depth_in), null),
                       count(*) filter (where boot_width_in is null)::int,
                       count(*) filter (where boot_depth_in is null)::int
                  from vehicles
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
                    family["make"],
                    family["model"],
                    family["body_style"],
                    family["generation"],
                    family["cargo_body_variant"],
                ),
            )
            (
                matched_rows,
                existing_widths,
                existing_depths,
                missing_width_rows,
                missing_depth_rows,
            ) = cursor.fetchone()
            expected = int(family["vehicle_rows"])
            if matched_rows != expected:
                raise RuntimeError(
                    f"{decision['family_key']}: expected {expected} vehicle "
                    f"rows, matched {matched_rows}"
                )
            family_conflicts = []
            if width is not None and any(
                abs(float(value) - width) > EXISTING_VALUE_TOLERANCE_IN
                for value in existing_widths
            ):
                family_conflicts.append(
                    {"dimension": "width", "existing": existing_widths, "cars": width}
                )
                width = None
            if depth is not None and any(
                abs(float(value) - depth) > EXISTING_VALUE_TOLERANCE_IN
                for value in existing_depths
            ):
                family_conflicts.append(
                    {"dimension": "depth", "existing": existing_depths, "cars": depth}
                )
                depth = None
            if missing_width_rows == 0:
                width = None
            if missing_depth_rows == 0:
                depth = None
            if family_conflicts:
                conflicts.append(
                    {
                        "family_key": decision["family_key"],
                        "conflicts": family_conflicts,
                    }
                )
            if width is None and depth is None:
                continue
            if width is not None:
                width_cells_updated += missing_width_rows
            if depth is not None:
                depth_cells_updated += missing_depth_rows
            applied_quotes = []
            for selected in (
                decision.get("width") if width is not None else None,
                decision.get("depth") if depth is not None else None,
            ):
                if selected:
                    applied_quotes.append(
                        f"{selected['label']}: {selected['value_in']:g} in"
                    )
            quote_text = " | ".join(applied_quotes)
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
                 where make = %s
                   and model = %s
                   and body_style = %s
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
                    width,
                    depth,
                    width,
                    depth,
                    decision["source_url"],
                    decision["source_url"],
                    decision["source_url"],
                    quote_text,
                    quote_text,
                    quote_text,
                    family["make"],
                    family["model"],
                    family["body_style"],
                    family["generation"],
                    family["cargo_body_variant"],
                    width,
                    depth,
                ),
            )
            changed_rows += cursor.rowcount
            applied_families += 1
        if commit:
            connection.commit()
        else:
            connection.rollback()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()
    return {
        "families_updated": applied_families,
        "vehicle_rows_updated": changed_rows,
        "width_cells_updated": width_cells_updated,
        "depth_cells_updated": depth_cells_updated,
        "existing_value_conflicts": conflicts,
        "committed": commit,
    }


def run_self_test() -> None:
    family = Family(
        make="Ford",
        model="Explorer",
        body_style="SUV / Crossover",
        generation="2020-2024",
        cargo_body_variant="standard",
        year_start=2020,
        year_end=2024,
        vehicle_rows=5,
        body_style_variant_count=1,
    )
    assert cars_com_url(family) == (
        "https://www.cars.com/research/ford-explorer-2020/specs/"
    )
    measurements = {
        "Cargo Area Length @ Floor to Seat 1": "84 in",
        "Cargo Area Length @ Floor to Seat 2": "50 in",
        "Cargo Area Length @ Floor to Seat 3": "21 in",
        "Cargo Area Width @ Beltline": "59 in",
        "Cargo Box Width @ Wheelhousings": "48 in",
        "Passenger Capacity": "7",
    }
    assert select_width(measurements)["value_in"] == 48
    assert select_depth(measurements)["value_in"] == 21
    assert select_depth(measurements)["seat_row"] == 3
    assert select_depth(measurements)["passenger_capacity"] == 7
    assert (
        select_depth(
            {
                "Passenger Capacity": "7",
                "Cargo Area Length @ Floor to Seat 2": "50 in",
            }
        )
        is None
    )
    assert select_width({"Cargo Area Width @ Beltline": "59 in"}) is None
    assert numeric_inches("N/A") is None
    print("self-test: ok")


def main() -> None:
    args = parse_args()
    if args.self_test:
        run_self_test()
        return

    if args.observations:
        manifest = load_json(args.manifest)
        observations = load_json(args.observations)
        review = build_review(manifest, observations)
        if args.review:
            save_json(args.review, review)
        print(json.dumps(review["summary"], indent=2))
        if args.apply or args.audit_live:
            print(
                json.dumps(
                    apply_review(review, commit=args.apply),
                    indent=2,
                    default=str,
                )
            )
        return

    manifest = build_manifest(args.limit, args.offset, args.status)
    if args.manifest:
        save_json(args.manifest, manifest)
    print(
        json.dumps(
            {
                "families": len(manifest["families"]),
                "manifest": str(args.manifest) if args.manifest else None,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
