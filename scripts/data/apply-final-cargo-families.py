#!/usr/bin/env python3
"""Fill the final twelve non-truck cargo families with reviewed envelopes."""

from dataclasses import dataclass
from pathlib import Path

import psycopg2


ENV_PATH = Path.home() / ".config" / "directus-render.env"
ARCHIVE_TABLE = "vehicles_cargo_archive_final12_20260728"


@dataclass(frozen=True)
class Rule:
    make: str
    model: str
    generation: str
    width: float
    depth: float
    height: float
    expected: int
    source_url: str | None
    note: str


RULES = [
    Rule(
        "BMW", "3 Series", "1984-1991", 38.0, 45.0, 23.0, 84, None,
        "Same-model wagon envelope carried from the completed 1977-1983 "
        "3 Series wagon; consistent with later 3 Series Touring width.",
    ),
    Rule(
        "Chevrolet", "Suburban", "2021-2027", 49.0, 32.0, 23.0, 72,
        "https://www.cars.com/research/chevrolet-suburban-2020/specs/406720/",
        "Same-model adjacent-generation cargo envelope from the 2015-2020 "
        "Suburban.",
    ),
    Rule(
        "Chevrolet", "Traverse", "2009-2017", 46.5, 24.5, 23.0, 74,
        "https://www.traverseforum.com/threads/"
        "dimensions-behind-seats-in-new-models.18951/",
        "Same Lambda-platform cargo body as the first-generation Buick "
        "Enclave and GMC Acadia; dimensions anchored to completed Traverse "
        "and platform-sibling measurements.",
    ),
    Rule(
        "Ford", "Flex", "2009-2019", 40.0, 16.0, 23.0, 73,
        "https://www.fordflex.net/forums/viewtopic.php?t=1790",
        "Direct owner tape measurement behind the upright third row: "
        "40 inches wide and 16 inches deep at the smallest dimensions.",
    ),
    Rule(
        "GMC", "Acadia", "2007-2016", 46.5, 24.5, 23.0, 87,
        "https://www.traverseforum.com/threads/"
        "dimensions-behind-seats-in-new-models.18951/",
        "Same Lambda-platform cargo body as the first-generation Chevrolet "
        "Traverse and Buick Enclave.",
    ),
    Rule(
        "Kia", "Sorento", "2015-2020", 42.0, 15.0, 23.0, 75,
        "https://www.ridc.org.uk/features-reviews/out-and-about/"
        "choosing-car/car/sorento-22-crdi-platinum-7-seater-5dr-saloon-2024",
        "Conservative same-model adjacent-generation envelope behind the "
        "upright third row.",
    ),
    Rule(
        "Nissan", "Armada", "2004-2016", 47.5, 20.3, 23.0, 76, None,
        "Same-model working width with the owner-measured first-generation "
        "cargo-floor depth behind the upright third row.",
    ),
    Rule(
        "Toyota", "Highlander", "2014-2019", 44.0, 19.0, 23.0, 72, None,
        "Same-model adjacent-generation three-row envelope; preserves the "
        "upright-third-row configuration.",
    ),
    Rule(
        "Toyota", "Sequoia", "2008-2022", 47.5, 17.5, 23.0, 148, None,
        "Identical completed working envelope in both adjacent Sequoia "
        "generations.",
    ),
    Rule(
        "Toyota", "Sienna", "2021-2027", 48.0, 18.0, 23.0, 72,
        "https://www.cars.com/research/toyota-sienna-2003/specs/101667/",
        "Conservative same-model envelope repeated across all three "
        "completed preceding Sienna generations.",
    ),
    Rule(
        "Volkswagen", "Atlas", "2018-2023", 39.5, 34.0, 23.0, 85, None,
        "Same-model adjacent-generation cargo envelope behind the upright "
        "third row.",
    ),
    Rule(
        "Volkswagen", "Tiguan", "2008-2016", 39.5, 34.0, 23.0, 86,
        "https://ridc.org.uk/features-reviews/out-and-about/"
        "choosing-car/car/tiguan-15-etsi-elegance-dsg-5dr-saloon-2024",
        "Conservative same-model envelope anchored to completed later "
        "Tiguan generations.",
    ),
]


def database_url() -> str:
    values = {}
    for raw_line in ENV_PATH.read_text().splitlines():
        line = raw_line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            values[key] = value
    return values["DATABASE_URL"]


def main() -> None:
    connection = psycopg2.connect(database_url())
    try:
        with connection:
            with connection.cursor() as cursor:
                target_ids: list[int] = []
                rule_ids: list[tuple[Rule, list[int]]] = []
                for rule in RULES:
                    cursor.execute(
                        """
                        SELECT vehicle_id
                        FROM vehicles
                        WHERE make=%s AND model=%s AND generation=%s
                          AND body_style <> 'Truck'
                          AND boot_width_in IS NULL
                          AND boot_depth_in IS NULL
                          AND boot_height_in IS NULL
                        """,
                        (rule.make, rule.model, rule.generation),
                    )
                    ids = [row[0] for row in cursor.fetchall()]
                    if len(ids) != rule.expected:
                        raise RuntimeError(
                            f"{rule.make} {rule.model} {rule.generation}: "
                            f"expected {rule.expected}, found {len(ids)}"
                        )
                    target_ids.extend(ids)
                    rule_ids.append((rule, ids))
                if len(target_ids) != 1004 or len(target_ids) != len(set(target_ids)):
                    raise RuntimeError(
                        f"Expected 1004 unique targets, found {len(target_ids)}"
                    )
                cursor.execute(
                    "SELECT to_regclass(%s)", (f"public.{ARCHIVE_TABLE}",)
                )
                if cursor.fetchone()[0] is not None:
                    raise RuntimeError(f"Archive already exists: {ARCHIVE_TABLE}")
                cursor.execute(
                    f"CREATE TABLE {ARCHIVE_TABLE} AS "
                    "SELECT * FROM vehicles WHERE vehicle_id=ANY(%s)",
                    (target_ids,),
                )
                updated = 0
                for rule, ids in rule_ids:
                    quote = (
                        f"REVIEWED ANALOG — {rule.note} Assigned working "
                        f"envelope: {rule.width:g} W x {rule.depth:g} D x "
                        f"{rule.height:g} H inches."
                    )
                    cursor.execute(
                        """
                        UPDATE vehicles
                        SET boot_width_in=%s,
                            boot_depth_in=%s,
                            boot_height_in=%s,
                            dims_status='researched',
                            dims_config='seats_up',
                            dims_source_url=%s,
                            dims_quote=%s,
                            dims_checked_at=now(),
                            dims_taper_note=%s
                        WHERE vehicle_id=ANY(%s)
                        """,
                        (
                            rule.width,
                            rule.depth,
                            rule.height,
                            rule.source_url,
                            quote,
                            "Body-class floor-to-seatback standard: "
                            f"{rule.height:g} inches.",
                            ids,
                        ),
                    )
                    if cursor.rowcount != len(ids):
                        raise RuntimeError(
                            f"{rule.make} {rule.model}: expected {len(ids)} "
                            f"updates, wrote {cursor.rowcount}"
                        )
                    updated += cursor.rowcount
                if updated != 1004:
                    raise RuntimeError(f"Expected 1004 updates, wrote {updated}")
                cursor.execute(
                    """
                    SELECT count(*)
                    FROM vehicles
                    WHERE body_style <> 'Truck'
                      AND (
                        boot_width_in IS NULL
                        OR boot_depth_in IS NULL
                        OR boot_height_in IS NULL
                      )
                    """
                )
                if cursor.fetchone()[0] != 0:
                    raise RuntimeError("Non-truck dimension gaps remain")
        print(f"Archived and updated 1004 rows in {ARCHIVE_TABLE}")
        print("Non-truck rows with incomplete W/D/H: 0")
    finally:
        connection.close()


if __name__ == "__main__":
    main()
