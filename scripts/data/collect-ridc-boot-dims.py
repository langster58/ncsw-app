#!/usr/bin/env python3
"""Validate and apply RiDC measured boot-floor dimensions.

The Research Institute for Disabled Consumers (RiDC) publishes physical
measurements for individual UK-market cars. Its fact sheets define the two
fields needed here directly:

* Width of boot floor at narrowest point
* Length of boot floor - back row of seats upright

RiDC blocks automated HTTP/browser collection with a Cloudflare challenge.
Retrieval therefore happens through the platform's normal web-search tool,
which can return the complete indexed fact sheet. This script validates the
small structured observation produced from that page, matches it to a physical
US-market family, converts millimetres to inches, and performs guarded bulk
updates. It never treats a search-result snippet as evidence.

The default is read-only. ``--audit-live`` executes and rolls back the proposed
updates; ``--apply`` is required to commit them.
"""

from __future__ import annotations

import argparse
import json
import re
import runpy
import unicodedata
from collections import Counter
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


SCRIPT_DIR = Path(__file__).resolve().parent
SHARED = runpy.run_path(str(SCRIPT_DIR / "collect-boot-dim-candidates.py"))
database_connection = SHARED["database_connection"]

WIDTH_LABEL = "Width of boot floor at narrowest point"
DEPTH_LABEL = "Length of boot floor - back row of seats upright"
SUPPORTED_BODY_STYLES = {"SUV / Crossover", "Minivan", "Wagon", "Hatchback"}
AGREEMENT_TOLERANCE_MM = 13
EXISTING_VALUE_TOLERANCE_IN = 0.51

# These names describe the same physical vehicle in the relevant markets.
MODEL_EQUIVALENCES = {
    ("Mitsubishi", "Outlander Sport"): ("asx",),
    ("Ford", "Transit Connect"): ("tourneo connect", "grand tourneo connect"),
}

# The present vehicle-family data does not distinguish these configurations.
# RiDC is still useful for discovery, but dimensions must not be fanned out.
UNSAFE_FAMILIES = {
    (
        "Ford",
        "Transit Connect",
        "Minivan",
        "2013-2025",
        "standard",
    ): "unresolved_length_and_seating_variants",
}

# Width is common, but RiDC documents materially different seats-up depths for
# the five- and seven-seat versions inside this family.
DEPTH_UNSAFE_FAMILIES = {
    (
        "Nissan",
        "Pathfinder",
        "SUV / Crossover",
        "2005-2012",
        "standard",
    ): "mixed_five_and_seven_seat_depths",
}

BODY_TYPE_COMPATIBILITY = {
    "SUV / Crossover": {"4x4", "saloon", "mpv"},
    "Minivan": {"mpv", "estate", "saloon"},
    "Wagon": {"estate"},
    "Hatchback": {"hatch"},
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Validate and apply measured RiDC boot dimensions."
    )
    parser.add_argument("--families", type=Path)
    parser.add_argument("--observations", type=Path)
    parser.add_argument("--review", type=Path)
    parser.add_argument("--audit-live", action="store_true")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if not args.self_test and (not args.families or not args.observations):
        parser.error("--families and --observations are required")
    if args.apply and args.audit_live:
        parser.error("--apply and --audit-live are mutually exclusive")
    return args


def load_json(path: Path) -> Any:
    return json.loads(path.read_text())


def save_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n")


def normalize(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", value)
    ascii_value = decomposed.encode("ascii", "ignore").decode("ascii")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", ascii_value.lower())).strip()


def family_key(family: dict[str, Any]) -> str:
    return "|".join(
        (
            family["make"],
            family["model"],
            family["body_style"],
            family["generation"],
            family.get("variant") or family.get("cargo_body_variant") or "standard",
        )
    )


def family_tuple(family: dict[str, Any]) -> tuple[str, str, str, str, str]:
    return tuple(family_key(family).split("|", 4))  # type: ignore[return-value]


def millimetres(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    match = re.fullmatch(r"\s*(\d{2,4}(?:\.\d+)?)\s*mm\s*", str(value or ""), re.I)
    return float(match.group(1)) if match else None


def inches_from_mm(value: float) -> float:
    return round(value / 25.4, 1)


def source_url_ok(url: str) -> bool:
    parsed = urlparse(url)
    return (
        parsed.scheme == "https"
        and parsed.hostname in {"ridc.org.uk", "www.ridc.org.uk", "new.ridc.org.uk"}
        and "/features-reviews/out-and-about/choosing-car/car/" in parsed.path
    )


def model_matches(family: dict[str, Any], observation: dict[str, Any]) -> bool:
    if normalize(family["make"]) != normalize(observation.get("make", "")):
        return False
    title = normalize(observation.get("title", ""))
    model = normalize(family["model"])
    if re.search(rf"\b{re.escape(model)}\b", title):
        return True
    aliases = MODEL_EQUIVALENCES.get((family["make"], family["model"]), ())
    return any(re.search(rf"\b{re.escape(alias)}\b", title) for alias in aliases)


def year_matches(family: dict[str, Any], observation: dict[str, Any]) -> bool:
    test_year = int(observation.get("test_year") or 0)
    if int(family["year_start"]) <= test_year <= int(family["year_end"]):
        return True
    return (
        family["make"] == "Mitsubishi"
        and family["model"] == "Outlander Sport"
        and test_year == int(family["year_start"]) - 1
        and "asx" in normalize(observation.get("title", ""))
    )


def variant_matches(family: dict[str, Any], observation: dict[str, Any]) -> bool:
    variant = normalize(
        family.get("variant") or family.get("cargo_body_variant") or "standard"
    )
    title = normalize(observation.get("title", ""))
    if variant == "standard":
        return True
    if "unlimited" in variant and "unlimited" not in title:
        return False
    if "4 door" in variant and not re.search(r"\b(?:4dr|5dr)\b", title):
        return False
    if "2 door" in variant and not re.search(r"\b(?:2dr|3dr)\b", title):
        return False
    if any(token in variant for token in ("long", "extended", "max", "esv", "el")):
        if not re.search(r"\b(?:grand|max|long|extended|esv|el|lwb)\b", title):
            return False
    return True


def observation_reasons(
    family: dict[str, Any], observation: dict[str, Any]
) -> list[str]:
    reasons = []
    if not source_url_ok(str(observation.get("source_url") or "")):
        reasons.append("invalid_source_url")
    if family["body_style"] not in SUPPORTED_BODY_STYLES:
        reasons.append("unsupported_body_style")
    if not model_matches(family, observation):
        reasons.append("model_mismatch")
    if not year_matches(family, observation):
        reasons.append("generation_year_mismatch")
    body_type = normalize(observation.get("body_type", ""))
    if body_type not in BODY_TYPE_COMPATIBILITY.get(family["body_style"], set()):
        reasons.append("body_type_mismatch")
    if not variant_matches(family, observation):
        reasons.append("body_variant_mismatch")
    width_mm = millimetres(observation.get("width_mm"))
    depth_mm = millimetres(observation.get("depth_mm"))
    if width_mm is None or not 600 <= width_mm <= 1800:
        reasons.append("invalid_width")
    if depth_mm is None or not 150 <= depth_mm <= 1800:
        reasons.append("invalid_depth")
    return reasons


def consistent(values: list[float]) -> bool:
    return bool(values) and max(values) - min(values) <= AGREEMENT_TOLERANCE_MM


def build_review(
    families_payload: Any, observations_payload: Any
) -> dict[str, Any]:
    families = (
        families_payload.get("families", [])
        if isinstance(families_payload, dict)
        else families_payload
    )
    observations = (
        observations_payload.get("observations", [])
        if isinstance(observations_payload, dict)
        else observations_payload
    )
    lookup = {family_key(family): family for family in families}
    by_family: dict[str, list[dict[str, Any]]] = {}
    unknown_keys = []
    for observation in observations:
        key = observation.get("family_key")
        if key not in lookup:
            unknown_keys.append(str(key))
            continue
        reasons = observation_reasons(lookup[key], observation)
        by_family.setdefault(key, []).append(
            {**observation, "accepted": not reasons, "reasons": reasons}
        )

    decisions = []
    for key, family in lookup.items():
        usable = [item for item in by_family.get(key, []) if item["accepted"]]
        unsafe_reason = UNSAFE_FAMILIES.get(family_tuple(family))
        if not usable or unsafe_reason:
            reasons = [unsafe_reason] if unsafe_reason else ["no_usable_fact_sheet"]
            decisions.append(
                {
                    "family_key": key,
                    "family": family,
                    "accepted": False,
                    "reasons": reasons,
                }
            )
            continue

        widths = [millimetres(item["width_mm"]) for item in usable]
        depths = [millimetres(item["depth_mm"]) for item in usable]
        width_values = [value for value in widths if value is not None]
        depth_values = [value for value in depths if value is not None]
        reasons = []
        width_ok = consistent(width_values)
        depth_ok = consistent(depth_values)
        if not width_ok:
            reasons.append("width_conflict")
        if not depth_ok:
            reasons.append("depth_conflict")
        depth_unsafe = DEPTH_UNSAFE_FAMILIES.get(family_tuple(family))
        if depth_unsafe:
            depth_ok = False
            reasons.append(depth_unsafe)

        representative_year = min(int(family["year_end"]), 2026)
        best = min(
            usable,
            key=lambda item: (
                abs(int(item["test_year"]) - representative_year),
                -int(item["test_year"]),
            ),
        )
        width = None
        depth = None
        if family.get("width_missing", True) and width_ok:
            width_mm = millimetres(best["width_mm"])
            width = {
                "label": WIDTH_LABEL,
                "value_mm": width_mm,
                "value_in": inches_from_mm(width_mm),
            }
        if family.get("depth_missing", True) and depth_ok:
            depth_mm = millimetres(best["depth_mm"])
            depth = {
                "label": DEPTH_LABEL,
                "value_mm": depth_mm,
                "value_in": inches_from_mm(depth_mm),
            }
        quotes = []
        for selected in (width, depth):
            if selected:
                quotes.append(f"{selected['label']}: {selected['value_mm']:g}mm")
        decisions.append(
            {
                "family_key": key,
                "family": family,
                "accepted": bool(width or depth),
                "source_url": best["source_url"],
                "source_title": best["title"],
                "test_year": best["test_year"],
                "width": width,
                "depth": depth,
                "quotes": quotes,
                "reasons": reasons,
                "usable_fact_sheets": len(usable),
            }
        )

    summary = Counter()
    for decision in decisions:
        summary["families"] += 1
        if decision["accepted"]:
            summary["accepted"] += 1
            summary["width_found"] += int(bool(decision.get("width")))
            summary["depth_found"] += int(bool(decision.get("depth")))
            summary["both_found"] += int(
                bool(decision.get("width")) and bool(decision.get("depth"))
            )
        else:
            summary["rejected"] += 1
    return {
        "schema_version": 1,
        "source": "ridc.org.uk",
        "summary": dict(summary),
        "unknown_family_keys": unknown_keys,
        "decisions": decisions,
    }


def apply_review(review: dict[str, Any], commit: bool) -> dict[str, Any]:
    accepted = [
        decision
        for decision in review["decisions"]
        if decision.get("accepted")
        and (decision.get("width") or decision.get("depth"))
    ]
    connection = database_connection()
    changed_rows = 0
    changed_families = 0
    width_cells = 0
    depth_cells = 0
    conflicts = []
    try:
        cursor = connection.cursor()
        for decision in accepted:
            family = decision["family"]
            variant = family.get("variant") or family.get("cargo_body_variant") or "standard"
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
                 where make = %s and model = %s and body_style = %s
                   and generation = %s
                   and coalesce(nullif(trim(cargo_body_variant), ''), 'standard') = %s
                """,
                (
                    family["make"],
                    family["model"],
                    family["body_style"],
                    family["generation"],
                    variant,
                ),
            )
            matched, old_widths, old_depths, missing_width, missing_depth = (
                cursor.fetchone()
            )
            expected = int(family["rows"])
            if matched != expected:
                raise RuntimeError(
                    f"{decision['family_key']}: expected {expected} rows, matched {matched}"
                )
            dimension_conflicts = []
            if width is not None and any(
                abs(float(value) - width) > EXISTING_VALUE_TOLERANCE_IN
                for value in old_widths
            ):
                dimension_conflicts.append(
                    {"dimension": "width", "existing": old_widths, "ridc": width}
                )
                width = None
            if depth is not None and any(
                abs(float(value) - depth) > EXISTING_VALUE_TOLERANCE_IN
                for value in old_depths
            ):
                dimension_conflicts.append(
                    {"dimension": "depth", "existing": old_depths, "ridc": depth}
                )
                depth = None
            if missing_width == 0:
                width = None
            if missing_depth == 0:
                depth = None
            if dimension_conflicts:
                conflicts.append(
                    {
                        "family_key": decision["family_key"],
                        "conflicts": dimension_conflicts,
                    }
                )
            if width is None and depth is None:
                continue
            applied_quotes = []
            if width is not None:
                width_cells += missing_width
                applied_quotes.append(
                    f"{decision['width']['label']}: "
                    f"{decision['width']['value_mm']:g}mm"
                )
            if depth is not None:
                depth_cells += missing_depth
                applied_quotes.append(
                    f"{decision['depth']['label']}: "
                    f"{decision['depth']['value_mm']:g}mm"
                )
            quote = " | ".join(applied_quotes)
            cursor.execute(
                """
                update vehicles
                   set boot_width_in = coalesce(boot_width_in, %s),
                       boot_depth_in = coalesce(boot_depth_in, %s),
                       dims_status = case
                           when coalesce(boot_width_in, %s) is not null
                            and coalesce(boot_depth_in, %s) is not null
                            and boot_height_in is not null then 'researched'
                           else 'partial'
                       end,
                       dims_source_url = case
                           when dims_source_url is null or dims_source_url = '' then %s
                           when position(%s in dims_source_url) > 0 then dims_source_url
                           else dims_source_url || ' | ' || %s
                       end,
                       dims_quote = case
                           when dims_quote is null or dims_quote = '' then %s
                           when position(%s in dims_quote) > 0 then dims_quote
                           else dims_quote || ' | ' || %s
                       end,
                       dims_checked_at = now(),
                       dims_confidence = 'verified',
                       dims_config = 'seats_up'
                 where make = %s and model = %s and body_style = %s
                   and generation = %s
                   and coalesce(nullif(trim(cargo_body_variant), ''), 'standard') = %s
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
                    quote,
                    quote,
                    quote,
                    family["make"],
                    family["model"],
                    family["body_style"],
                    family["generation"],
                    variant,
                    width,
                    depth,
                ),
            )
            changed_rows += cursor.rowcount
            changed_families += 1
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
        "families_updated": changed_families,
        "vehicle_rows_updated": changed_rows,
        "width_cells_updated": width_cells,
        "depth_cells_updated": depth_cells,
        "existing_value_conflicts": conflicts,
        "committed": commit,
    }


def run_self_test() -> None:
    family = {
        "make": "Jeep",
        "model": "Wrangler",
        "body_style": "SUV / Crossover",
        "generation": "2008-2017",
        "variant": "Unlimited 4-door",
        "year_start": 2008,
        "year_end": 2017,
        "rows": 10,
        "width_missing": True,
        "depth_missing": True,
    }
    observation = {
        "source_url": (
            "https://www.ridc.org.uk/features-reviews/out-and-about/"
            "choosing-car/car/jeep-wrangler-unlimited-2011"
        ),
        "title": "Jeep Wrangler Unlimited Rubicon 2.8 CRD 5dr 4x4 2011",
        "make": "Jeep",
        "body_type": "4x4",
        "test_year": 2011,
        "width_mm": "901mm",
        "depth_mm": "940mm",
    }
    assert not observation_reasons(family, observation)
    assert inches_from_mm(901) == 35.5
    assert millimetres("940mm") == 940
    assert consistent([1126, 1127, 1130])
    assert not consistent([1126, 900])
    print("self-test: ok")


def main() -> None:
    args = parse_args()
    if args.self_test:
        run_self_test()
        return
    review = build_review(load_json(args.families), load_json(args.observations))
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


if __name__ == "__main__":
    main()
