#!/usr/bin/env python3
"""Apply enclosure-proven truck cabin-space dimensions for pass 13."""

from pathlib import Path

import psycopg2


ARCHIVE_TABLE = "vehicles_truck_space_archive_pass13_20260728"
ENV_PATH = Path.home() / ".config" / "directus-render.env"

UNRESOLVED = """
    behind_seat_width_in IS NULL
    AND behind_seat_depth_in IS NULL
    AND behind_seat_height_in IS NULL
    AND under_seat_width_in IS NULL
    AND under_seat_depth_in IS NULL
    AND under_seat_height_in IS NULL
"""

RULES = [
    {
        "label": "2008-2016 Ford Super Duty Crew Cab",
        "placement": "behind_seat",
        "where": f"""
            make = 'Ford'
            AND model IN (
                'F-250 Super Duty',
                'F-350 Super Duty',
                'F-450 Super Duty'
            )
            AND cab_type = 'crew_cab'
            AND year BETWEEN 2008 AND 2016
            AND {UNRESOLVED}
        """,
        "dimensions": (58.0, 6.5, 16.625),
        "source": (
            "https://www.ground-shaker.com/index.php?Itemid=104&cid=227"
            "&ctrl=product&lang=en&name=gs-rf250p212b-black-12-dual-ported-sub-box"
            "-fits-ford-f250-to-f550-super-duty-crew-cab-with-our-without-power-window"
            "-2004-2016&option=com_hikashop&task=show"
        ),
    },
    {
        "label": "2007-2018 Chevrolet Silverado Extended Cab",
        "placement": "under_seat",
        "where": f"""
            make = 'Chevrolet'
            AND model ILIKE 'Silverado%%'
            AND model NOT ILIKE '%%Classic%%'
            AND cab_type = 'extended_cab'
            AND year BETWEEN 2007 AND 2018
            AND {UNRESOLVED}
        """,
        "dimensions": (55.5, 13.5, 9.25),
        "source": (
            "https://ground-shaker.com/index.php?Itemid=104&cid=116&ctrl=product"
            "&lang=en&name=gs-jchvp212b-black-12-dual-ported-sub-box-fits-chevy"
            "-silverado-gmc-sierra-ext-double-cab-2007-2017"
            "&option=com_hikashop&task=show"
        ),
    },
    {
        "label": "2007-2018 GMC Sierra Extended Cab",
        "placement": "under_seat",
        "where": f"""
            make = 'GMC'
            AND model ILIKE 'Sierra%%'
            AND model NOT ILIKE '%%Classic%%'
            AND cab_type = 'extended_cab'
            AND year BETWEEN 2007 AND 2018
            AND {UNRESOLVED}
        """,
        "dimensions": (55.5, 13.5, 9.25),
        "source": (
            "https://www.ground-shaker.com/index.php?Itemid=104&cid=1010"
            "&ctrl=product&lang=en&name=black-12-dual-ported-sub-box-fits-07-18"
            "-gmc-extended-cab&option=com_hikashop&task=show"
        ),
    },
    {
        "label": "2009-2014 Ford F-150 Extended Cab",
        "placement": "under_seat",
        "where": f"""
            make = 'Ford'
            AND model = 'F-150'
            AND cab_type = 'extended_cab'
            AND year BETWEEN 2009 AND 2014
            AND {UNRESOLVED}
        """,
        "dimensions": (52.25, 16.75, 7.5),
        "source": (
            "https://www.ground-shaker.com/index.php?Itemid=104&cid=831"
            "&ctrl=product&lang=en&name=black-8-dual-sealed-sub-box-fits-09-16"
            "-ford-f-150-ext-cab&option=com_hikashop&task=show"
        ),
    },
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
                counts = {}
                target_ids = []
                for rule in RULES:
                    cursor.execute(
                        f"SELECT array_agg(vehicle_id) FROM vehicles WHERE {rule['where']}"
                    )
                    ids = cursor.fetchone()[0] or []
                    counts[rule["label"]] = len(ids)
                    target_ids.extend(ids)

                if len(target_ids) != len(set(target_ids)):
                    raise RuntimeError("Target rules overlap; refusing to write")

                cursor.execute("SELECT to_regclass(%s)", (f"public.{ARCHIVE_TABLE}",))
                if cursor.fetchone()[0] is not None:
                    raise RuntimeError(f"Archive table already exists: {ARCHIVE_TABLE}")

                cursor.execute(
                    f"""
                    CREATE TABLE {ARCHIVE_TABLE} AS
                    SELECT * FROM vehicles WHERE vehicle_id = ANY(%s)
                    """,
                    (target_ids,),
                )

                updated = 0
                for rule in RULES:
                    width, depth, height = rule["dimensions"]
                    prefix = rule["placement"]
                    cursor.execute(
                        f"""
                        UPDATE vehicles
                        SET {prefix}_width_in = %s,
                            {prefix}_depth_in = %s,
                            {prefix}_height_in = %s,
                            {prefix}_source_url = %s
                        WHERE {rule['where']}
                        """,
                        (width, depth, height, rule["source"]),
                    )
                    updated += cursor.rowcount

                if updated != len(target_ids):
                    raise RuntimeError(
                        f"Expected {len(target_ids)} updates but wrote {updated}"
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
                    (target_ids,),
                )
                partials = cursor.fetchone()[0]
                if partials:
                    raise RuntimeError(f"Found {partials} partial dimension triples")

        print(f"Archived and updated {len(target_ids)} vehicles in {ARCHIVE_TABLE}")
        for label, count in counts.items():
            print(f"{label}: {count}")
        print("Partial placement-specific dimension triples: 0")
    finally:
        connection.close()


if __name__ == "__main__":
    main()
