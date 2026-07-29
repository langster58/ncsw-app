#!/usr/bin/env python3
"""Apply enclosure-proven truck cabin-space dimensions for pass 12."""

from pathlib import Path

import psycopg2


ENV_PATH = Path.home() / ".config" / "directus-render.env"
ARCHIVE_TABLE = "vehicles_truck_space_archive_pass12_20260728"

CHEVY_SOURCE = (
    "https://www.ground-shaker.com/index.php?Itemid=104&cid=1144&ctrl=product"
    "&lang=en&name=black-8-dual-sealed-sub-box-fits-chevy-silverado-regular-cab-07-24"
    "&option=com_hikashop&task=show"
)
GMC_SOURCE = (
    "https://www.ground-shaker.com/index.php?Itemid=104&cid=1146&ctrl=product"
    "&lang=en&name=black-8-dual-sealed-sub-box-fits-07-24-gmc-sierra-regular-cab"
    "&option=com_hikashop&task=show"
)
RAM_SOURCE = (
    "https://www.ground-shaker.com/index.php?Itemid=104&cid=1227&ctrl=product"
    "&lang=en&name=black-8-dual-ported-sub-box-fits-06-23-dodge-ram-regular-and-mega-cab"
    "&option=com_hikashop&task=show"
)
MAVERICK_SOURCE = (
    "https://www.ground-shaker.com/index.php?Itemid=104&cid=841&ctrl=product"
    "&lang=en&name=black-8-dual-sealed-sub-box-fits-22-23-ford-maverick"
    "&option=com_hikashop&task=show"
)
TUNDRA_SOURCE = (
    "https://www.ground-shaker.com/index.php?Itemid=104&cid=796&ctrl=product"
    "&lang=en&name=black-8-dual-sealed-sub-box-fits-22-23-toyota-tundra-crew-max+UNDER"
    "&option=com_hikashop&task=show"
)

UNRESOLVED = """
    behind_seat_width_in IS NULL
    AND behind_seat_depth_in IS NULL
    AND behind_seat_height_in IS NULL
    AND under_seat_width_in IS NULL
    AND under_seat_depth_in IS NULL
    AND under_seat_height_in IS NULL
"""

CHEVY_TARGET = f"""
    make = 'Chevrolet'
    AND model ILIKE 'Silverado%%'
    AND model NOT ILIKE '%%Classic%%'
    AND cab_type = 'regular_cab'
    AND year BETWEEN 2007 AND 2026
    AND {UNRESOLVED}
"""

GMC_TARGET = f"""
    make = 'GMC'
    AND model ILIKE 'Sierra%%'
    AND model NOT ILIKE '%%Classic%%'
    AND cab_type = 'regular_cab'
    AND year BETWEEN 2007 AND 2026
    AND {UNRESOLVED}
"""

RAM_TARGET = f"""
    (
        (make = 'Dodge' AND model ILIKE 'Ram Pickup%%')
        OR make = 'Ram'
    )
    AND cab_type IN ('regular_cab', 'mega_cab')
    AND year BETWEEN 2006 AND 2026
    AND {UNRESOLVED}
"""

MAVERICK_TARGET = f"""
    make = 'Ford'
    AND model = 'Maverick'
    AND year BETWEEN 2022 AND 2026
    AND {UNRESOLVED}
"""

TUNDRA_TARGET = f"""
    make = 'Toyota'
    AND model = 'Tundra'
    AND generation = '2022-2027'
    AND cab_type = 'crew_cab'
    AND powertrain = 'ICE'
    AND year BETWEEN 2022 AND 2026
    AND {UNRESOLVED}
"""

TARGETS = {
    "Chevrolet Silverado Regular Cab": CHEVY_TARGET,
    "GMC Sierra Regular Cab": GMC_TARGET,
    "Dodge/Ram Regular and Mega Cab": RAM_TARGET,
    "Ford Maverick": MAVERICK_TARGET,
    "Toyota Tundra CrewMax non-hybrid": TUNDRA_TARGET,
}


def load_database_url() -> str:
    values = {}
    for raw_line in ENV_PATH.read_text().splitlines():
        line = raw_line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            values[key] = value
    return values["DATABASE_URL"]


def main() -> None:
    connection = psycopg2.connect(load_database_url())
    try:
        with connection:
            with connection.cursor() as cursor:
                counts = {}
                ids = []
                for label, where_clause in TARGETS.items():
                    cursor.execute(
                        f"SELECT count(*), array_agg(vehicle_id) FROM vehicles WHERE {where_clause}"
                    )
                    count, target_ids = cursor.fetchone()
                    counts[label] = count
                    ids.extend(target_ids or [])

                if len(ids) != len(set(ids)):
                    raise RuntimeError("Target rules overlap; refusing to write")

                cursor.execute(
                    "SELECT to_regclass(%s)",
                    (f"public.{ARCHIVE_TABLE}",),
                )
                if cursor.fetchone()[0] is not None:
                    raise RuntimeError(f"Archive table already exists: {ARCHIVE_TABLE}")

                cursor.execute(
                    f"""
                    CREATE TABLE {ARCHIVE_TABLE} AS
                    SELECT *
                    FROM vehicles
                    WHERE vehicle_id = ANY(%s)
                    """,
                    (ids,),
                )

                updates = [
                    (
                        CHEVY_TARGET,
                        53.25,
                        9.0,
                        13.75,
                        CHEVY_SOURCE,
                    ),
                    (
                        GMC_TARGET,
                        53.25,
                        9.0,
                        13.75,
                        GMC_SOURCE,
                    ),
                    (
                        RAM_TARGET,
                        55.0,
                        9.0,
                        16.0,
                        RAM_SOURCE,
                    ),
                ]
                updated = 0
                for where_clause, width, depth, height, source in updates:
                    cursor.execute(
                        f"""
                        UPDATE vehicles
                        SET behind_seat_width_in = %s,
                            behind_seat_depth_in = %s,
                            behind_seat_height_in = %s,
                            behind_seat_source_url = %s
                        WHERE {where_clause}
                        """,
                        (width, depth, height, source),
                    )
                    updated += cursor.rowcount

                for where_clause, width, depth, height, source in [
                    (MAVERICK_TARGET, 18.5, 10.75, 7.5, MAVERICK_SOURCE),
                    (TUNDRA_TARGET, 40.0, 14.75, 7.0, TUNDRA_SOURCE),
                ]:
                    cursor.execute(
                        f"""
                        UPDATE vehicles
                        SET under_seat_width_in = %s,
                            under_seat_depth_in = %s,
                            under_seat_height_in = %s,
                            under_seat_source_url = %s
                        WHERE {where_clause}
                        """,
                        (width, depth, height, source),
                    )
                    updated += cursor.rowcount

                if updated != len(ids):
                    raise RuntimeError(
                        f"Expected to update {len(ids)} rows but updated {updated}"
                    )

                cursor.execute(
                    """
                    SELECT count(*)
                    FROM vehicles
                    WHERE vehicle_id = ANY(%s)
                      AND (
                        ((behind_seat_width_in IS NULL)::int
                         + (behind_seat_depth_in IS NULL)::int
                         + (behind_seat_height_in IS NULL)::int) NOT IN (0, 3)
                        OR
                        ((under_seat_width_in IS NULL)::int
                         + (under_seat_depth_in IS NULL)::int
                         + (under_seat_height_in IS NULL)::int) NOT IN (0, 3)
                      )
                    """,
                    (ids,),
                )
                partial_count = cursor.fetchone()[0]
                if partial_count:
                    raise RuntimeError(
                        f"Validation found {partial_count} partial dimension triples"
                    )

        print(f"Archived and updated {len(ids)} vehicles in {ARCHIVE_TABLE}")
        for label, count in counts.items():
            print(f"{label}: {count}")
        print("Partial placement-specific dimension triples: 0")
    finally:
        connection.close()


if __name__ == "__main__":
    main()
