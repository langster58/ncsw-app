#!/usr/bin/env python3
"""Match a complete RiDC factsheet export to Directus vehicle families.

The browser collector deliberately records RiDC factsheets without guessing
which US-market family they belong to. This script performs that identity step
locally and accepts a factsheet only when make, model, generation year, body
type, and cargo-body variant resolve to exactly one family.
"""

from __future__ import annotations

import argparse
import json
import runpy
from collections import Counter
from pathlib import Path
from typing import Any


SCRIPT_DIR = Path(__file__).resolve().parent
RIDC = runpy.run_path(str(SCRIPT_DIR / "collect-ridc-boot-dims.py"))
BODY_TYPE_COMPATIBILITY = RIDC["BODY_TYPE_COMPATIBILITY"]
ONE_YEAR_EARLY_EQUIVALENCES = RIDC["ONE_YEAR_EARLY_EQUIVALENCES"]
database_connection = RIDC["database_connection"]
family_key = RIDC["family_key"]
model_matches = RIDC["model_matches"]
normalize = RIDC["normalize"]
variant_matches = RIDC["variant_matches"]
year_matches = RIDC["year_matches"]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Match browser-collected RiDC factsheets to vehicle families."
    )
    parser.add_argument(
        "--families",
        type=Path,
        help=(
            "Optional complete family snapshot. When omitted, read every "
            "current non-truck family from the live vehicles table."
        ),
    )
    parser.add_argument(
        "--families-output",
        type=Path,
        help="Write the live family snapshot used for matching.",
    )
    parser.add_argument("--observations", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--report", type=Path)
    return parser.parse_args()


def load_json(path: Path) -> Any:
    return json.loads(path.read_text())


def load_live_families() -> dict[str, Any]:
    connection = database_connection()
    try:
        cursor = connection.cursor()
        cursor.execute(
            """
            select make, model, body_style, generation,
                   coalesce(
                       nullif(trim(cargo_body_variant), ''),
                       'standard'
                   ) as variant,
                   min(year)::int as year_start,
                   max(year)::int as year_end,
                   count(*)::int as rows,
                   bool_or(boot_width_in is null) as width_missing,
                   bool_or(boot_depth_in is null) as depth_missing,
                   bool_and(
                       coalesce(dims_status, '') = 'no_data'
                   ) as closed_no_data
              from vehicles
             where body_style <> 'Truck'
               and generation ~ '^[0-9]{4}-[0-9]{4}$'
             group by make, model, body_style, generation,
                      coalesce(
                          nullif(trim(cargo_body_variant), ''),
                          'standard'
                      )
             order by count(*) desc, make, model, generation, variant
            """
        )
        columns = [description.name for description in cursor.description]
        families = [
            dict(zip(columns, row))
            for row in cursor.fetchall()
        ]
    finally:
        connection.close()
    return {
        "schema_version": 1,
        "source": "directus.vehicles",
        "families": families,
    }


def body_matches(family: dict[str, Any], observation: dict[str, Any]) -> bool:
    body_type = normalize(str(observation.get("body_type") or ""))
    return body_type in BODY_TYPE_COMPATIBILITY.get(family["body_style"], set())


def most_specific_candidate(
    candidates: list[dict[str, Any]],
    observation: dict[str, Any],
) -> dict[str, Any] | None:
    if not candidates:
        return None
    early_equivalences = [
        family
        for family in candidates
        if (family["make"], family["model"], family["generation"])
        in ONE_YEAR_EARLY_EQUIVALENCES
        and int(observation.get("test_year") or 0)
        == int(family["year_start"]) - 1
    ]
    if len(early_equivalences) == 1:
        return early_equivalences[0]
    ordered = sorted(
        candidates,
        key=lambda family: len(normalize(family["model"])),
        reverse=True,
    )
    if len(ordered) == 1:
        return ordered[0]
    longest = len(normalize(ordered[0]["model"]))
    if longest > len(normalize(ordered[1]["model"])):
        return ordered[0]
    return None


def match(
    families_payload: dict[str, Any],
    observations_payload: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any]]:
    families = families_payload.get("families", [])
    observations = observations_payload.get("observations", [])
    families_by_make: dict[str, list[dict[str, Any]]] = {}
    for family in families:
        families_by_make.setdefault(normalize(family["make"]), []).append(family)

    matched = []
    ambiguous = []
    unmatched = []
    matched_family_keys = set()
    for observation in observations:
        make_families = families_by_make.get(
            normalize(str(observation.get("make") or "")),
            [],
        )
        model_candidates = [
            family
            for family in make_families
            if model_matches(family, observation)
        ]
        if model_candidates:
            longest_model = max(
                len(normalize(family["model"]))
                for family in model_candidates
            )
            model_candidates = [
                family
                for family in model_candidates
                if len(normalize(family["model"])) == longest_model
            ]
        candidates = [
            family
            for family in model_candidates
            if (
                year_matches(family, observation)
                and body_matches(family, observation)
                and variant_matches(family, observation)
            )
        ]
        selected = most_specific_candidate(candidates, observation)
        if selected:
            key = family_key(selected)
            matched.append({**observation, "family_key": key})
            matched_family_keys.add(key)
        elif len(candidates) > 1:
            ambiguous.append(
                {
                    "node_id": observation.get("node_id"),
                    "title": observation.get("title"),
                    "source_url": observation.get("source_url"),
                    "candidate_family_keys": [
                        family_key(family) for family in candidates
                    ],
                }
            )
        else:
            unmatched.append(
                {
                    "node_id": observation.get("node_id"),
                    "make": observation.get("make"),
                    "title": observation.get("title"),
                    "body_type": observation.get("body_type"),
                    "test_year": observation.get("test_year"),
                    "source_url": observation.get("source_url"),
                }
            )

    matched_by_body = Counter()
    family_lookup = {family_key(family): family for family in families}
    for key in matched_family_keys:
        matched_by_body[family_lookup[key]["body_style"]] += 1
    report = {
        "schema_version": 1,
        "source": "ridc.org.uk",
        "factsheets": len(observations),
        "matched_factsheets": len(matched),
        "matched_families": len(matched_family_keys),
        "ambiguous_factsheets": len(ambiguous),
        "unmatched_factsheets": len(unmatched),
        "matched_families_by_body_style": dict(
            sorted(matched_by_body.items())
        ),
        "ambiguous": ambiguous,
        "unmatched": unmatched,
    }
    output = {
        "schema_version": 1,
        "source": "ridc.org.uk",
        "observations": matched,
    }
    return output, report


def main() -> None:
    args = parse_args()
    families_payload = (
        load_json(args.families) if args.families else load_live_families()
    )
    if args.families_output:
        args.families_output.write_text(
            json.dumps(families_payload, indent=2, sort_keys=True) + "\n"
        )
    output, report = match(
        families_payload,
        load_json(args.observations),
    )
    args.output.write_text(json.dumps(output, indent=2, sort_keys=True) + "\n")
    if args.report:
        args.report.write_text(
            json.dumps(report, indent=2, sort_keys=True) + "\n"
        )
    print(
        json.dumps(
            {
                key: report[key]
                for key in (
                    "factsheets",
                    "matched_factsheets",
                    "matched_families",
                    "ambiguous_factsheets",
                    "unmatched_factsheets",
                    "matched_families_by_body_style",
                )
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
