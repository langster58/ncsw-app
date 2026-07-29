#!/usr/bin/env python3
"""Apply exact Ground Shaker truck fitments collected by the catalog crawler."""

import csv
from pathlib import Path

import psycopg2


CATALOG_PATH = Path("/private/tmp/ground-shaker-truck-enclosures.csv")
ENV_PATH = Path.home() / ".config" / "directus-render.env"
ARCHIVE_TABLE = "vehicles_truck_space_archive_pass14_20260728"

UNRESOLVED = """
    behind_seat_width_in IS NULL
    AND behind_seat_depth_in IS NULL
    AND behind_seat_height_in IS NULL
    AND under_seat_width_in IS NULL
    AND under_seat_depth_in IS NULL
    AND under_seat_height_in IS NULL
"""

MAPPINGS = [
    (
        "01-07 SILVERADO CREW-CAB",
        """make='Chevrolet' AND model ILIKE 'Silverado%%'
           AND cab_type='crew_cab'
           AND (year BETWEEN 2001 AND 2006
                OR (year=2007 AND model ILIKE '%%Classic%%'))""",
    ),
    (
        "01-07 SIERRA CREW-CAB",
        """make='GMC' AND model ILIKE 'Sierra%%'
           AND cab_type='crew_cab'
           AND (year BETWEEN 2001 AND 2006
                OR (year=2007 AND model ILIKE '%%Classic%%'))""",
    ),
    (
        "01-08 F-150 CREW-CAB",
        """make='Ford' AND model='F-150'
           AND cab_type IN ('crew_cab','extended_cab')
           AND year BETWEEN 2004 AND 2008""",
    ),
    (
        "02-18 RAM-1500 QUAD-CAB & CREW-CAB",
        """make IN ('Dodge','Ram') AND model ~ '(1500|2500|3500)'
           AND cab_type IN ('crew_cab','double_cab','extended_cab')
           AND year BETWEEN 2002 AND 2018""",
    ),
    (
        "04-14 COLORADO CREW-CAB",
        """make='Chevrolet' AND model='Colorado'
           AND cab_type='crew_cab' AND year BETWEEN 2004 AND 2014""",
    ),
    (
        "04-14 CANYON CREW-CAB",
        """make='GMC' AND model='Canyon'
           AND cab_type='crew_cab' AND year BETWEEN 2004 AND 2014""",
    ),
    (
        "05-26 FRONTIER CREW-CAB",
        """make='Nissan' AND model='Frontier'
           AND cab_type='crew_cab' AND year BETWEEN 2005 AND 2026""",
    ),
    (
        "07-13 SILVERADO CREW-CAB",
        """make='Chevrolet' AND model ILIKE 'Silverado%%'
           AND model NOT ILIKE '%%Classic%%'
           AND model NOT ILIKE '%%Hybrid%%'
           AND cab_type='crew_cab' AND year BETWEEN 2007 AND 2013""",
    ),
    (
        "07-13 SIERRA CREW-CAB",
        """make='GMC' AND model ILIKE 'Sierra%%'
           AND model NOT ILIKE '%%Classic%%'
           AND model NOT ILIKE '%%Hybrid%%'
           AND cab_type='crew_cab' AND year BETWEEN 2007 AND 2013""",
    ),
    (
        "07-21 TUNDRA DOUBLE-CAB",
        """make='Toyota' AND model='Tundra'
           AND cab_type='double_cab' AND year BETWEEN 2007 AND 2021""",
    ),
    (
        "14-18 SILVERADO CREW-CAB",
        """make='Chevrolet' AND model ILIKE 'Silverado%%'
           AND cab_type='crew_cab' AND year BETWEEN 2014 AND 2018""",
    ),
    (
        "14-18 SIERRA CREW-CAB",
        """make='GMC' AND model ILIKE 'Sierra%%'
           AND cab_type='crew_cab' AND year BETWEEN 2014 AND 2018""",
    ),
    (
        "15-24 COLORADO CREW-CAB",
        """make='Chevrolet' AND model='Colorado'
           AND cab_type='crew_cab' AND year BETWEEN 2015 AND 2026""",
    ),
    (
        "17-26 F-250 CREW-CAB",
        """make='Ford' AND model='F-250 Super Duty'
           AND cab_type='crew_cab' AND year BETWEEN 2017 AND 2026""",
    ),
    (
        "17-26 F-350 CREW-CAB",
        """make='Ford' AND model='F-350 Super Duty'
           AND cab_type='crew_cab' AND year BETWEEN 2017 AND 2026""",
    ),
    (
        "19-26 GLADIATOR",
        """make='Jeep' AND model='Gladiator' AND year BETWEEN 2019 AND 2026""",
    ),
    (
        "19-26 RAM CREW-CAB",
        """make IN ('Dodge','Ram') AND model ~ '1500'
           AND cab_type='crew_cab' AND year BETWEEN 2019 AND 2026""",
    ),
    (
        "19-26 RAM QUAD-CAB",
        """make IN ('Dodge','Ram') AND model ~ '1500'
           AND cab_type='double_cab' AND year BETWEEN 2019 AND 2026""",
    ),
    (
        "22-26 TUNDRA CREW-MAX",
        """make='Toyota' AND model='Tundra' AND cab_type='crew_cab'
           AND powertrain='Full Hybrid' AND year BETWEEN 2022 AND 2026""",
    ),
    (
        "88-98 SILVERADO EXT-CAB",
        """make='Chevrolet' AND model ILIKE 'Silverado%%'
           AND cab_type='extended_cab' AND year BETWEEN 1988 AND 1998""",
    ),
    (
        "88-98 SIERRA EXT-CAB",
        """make='GMC' AND model ILIKE 'Sierra%%'
           AND cab_type='extended_cab' AND year BETWEEN 1988 AND 1998""",
    ),
    (
        "95-04 TACOMA REGULAR-CAB",
        """make='Toyota' AND model='Tacoma'
           AND cab_type='regular_cab' AND year BETWEEN 1995 AND 2004""",
    ),
    (
        "95-23 TACOMA DOUBLE-CAB",
        """make='Toyota' AND model='Tacoma'
           AND cab_type='double_cab' AND year BETWEEN 2005 AND 2023""",
    ),
    (
        "98-01 RAM QUAD-CAB",
        """make='Dodge' AND model ILIKE 'Ram%%'
           AND cab_type IN ('double_cab','extended_cab')
           AND year BETWEEN 1998 AND 2001""",
    ),
    (
        "99-06 SILVERADO EXT-CAB",
        """make='Chevrolet' AND model ILIKE 'Silverado%%'
           AND cab_type='extended_cab'
           AND (year BETWEEN 1999 AND 2006
                OR (year=2007 AND model ILIKE '%%Classic%%'))""",
    ),
    (
        "99-06 SIERRA EXT-CAB",
        """make='GMC' AND model ILIKE 'Sierra%%'
           AND cab_type='extended_cab'
           AND (year BETWEEN 1999 AND 2006
                OR (year=2007 AND model ILIKE '%%Classic%%'))""",
    ),
    (
        "99-06 SILVERADO REGULAR-CAB",
        """make='Chevrolet' AND model ILIKE 'Silverado%%'
           AND cab_type='regular_cab' AND year BETWEEN 1999 AND 2006""",
    ),
    (
        "99-06 SIERRA SINGLE-CAB",
        """make='GMC' AND model ILIKE 'Sierra%%'
           AND cab_type='regular_cab' AND year BETWEEN 1999 AND 2006""",
    ),
    (
        "99-07 F-250 CREW-CAB",
        """make='Ford' AND model='F-250 Super Duty'
           AND cab_type='crew_cab' AND year BETWEEN 1999 AND 2007""",
    ),
    (
        "99-07 F-350 CREW-CAB",
        """make='Ford' AND model='F-350 Super Duty'
           AND cab_type='crew_cab' AND year BETWEEN 1999 AND 2007""",
    ),
    (
        "RIDGELINE CREW-CAB",
        """make='Honda' AND model='Ridgeline' AND year BETWEEN 2006 AND 2026""",
    ),
    (
        "TITAN CREW-CAB",
        """make='Nissan' AND model='Titan'
           AND cab_type='crew_cab' AND year BETWEEN 2004 AND 2015""",
    ),
    (
        "TITAN EXT-CAB",
        """make='Nissan' AND model='Titan'
           AND cab_type='extended_cab' AND year BETWEEN 2004 AND 2015""",
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
    catalog = list(csv.DictReader(CATALOG_PATH.open()))
    rules = []
    for category_prefix, predicate in MAPPINGS:
        matches = [
            row for row in catalog if row["category"].startswith(category_prefix)
        ]
        if len(matches) != 1:
            raise RuntimeError(
                f"Expected one catalog row for {category_prefix}, got {len(matches)}"
            )
        row = matches[0]
        if row["placement"] not in {"behind_seat", "under_seat"}:
            raise RuntimeError(f"Missing placement for {category_prefix}")
        dimensions = tuple(
            float(row[field]) for field in ("width_in", "depth_in", "height_in")
        )
        rules.append(
            {
                "label": category_prefix,
                "where": f"({predicate}) AND {UNRESOLVED}",
                "placement": row["placement"],
                "dimensions": dimensions,
                "source": row["source_url"],
            }
        )

    connection = psycopg2.connect(database_url())
    try:
        with connection:
            with connection.cursor() as cursor:
                all_ids = []
                counts = {}
                for rule in rules:
                    cursor.execute(
                        f"SELECT array_agg(vehicle_id) FROM vehicles WHERE {rule['where']}"
                    )
                    ids = cursor.fetchone()[0] or []
                    counts[rule["label"]] = len(ids)
                    all_ids.extend(ids)

                if len(all_ids) != len(set(all_ids)):
                    raise RuntimeError("Fitment mappings overlap; refusing to write")

                cursor.execute("SELECT to_regclass(%s)", (f"public.{ARCHIVE_TABLE}",))
                if cursor.fetchone()[0] is not None:
                    raise RuntimeError(f"Archive already exists: {ARCHIVE_TABLE}")
                cursor.execute(
                    f"""
                    CREATE TABLE {ARCHIVE_TABLE} AS
                    SELECT * FROM vehicles WHERE vehicle_id = ANY(%s)
                    """,
                    (all_ids,),
                )

                updated = 0
                for rule in rules:
                    width, depth, height = rule["dimensions"]
                    placement = rule["placement"]
                    cursor.execute(
                        f"""
                        UPDATE vehicles
                        SET {placement}_width_in=%s,
                            {placement}_depth_in=%s,
                            {placement}_height_in=%s,
                            {placement}_source_url=%s
                        WHERE {rule['where']}
                        """,
                        (width, depth, height, rule["source"]),
                    )
                    updated += cursor.rowcount

                if updated != len(all_ids):
                    raise RuntimeError(
                        f"Expected {len(all_ids)} updates but wrote {updated}"
                    )
                cursor.execute(
                    """
                    SELECT count(*) FROM vehicles
                    WHERE vehicle_id=ANY(%s)
                      AND (
                        ((behind_seat_width_in IS NULL)::int
                         +(behind_seat_depth_in IS NULL)::int
                         +(behind_seat_height_in IS NULL)::int) NOT IN (0,3)
                        OR
                        ((under_seat_width_in IS NULL)::int
                         +(under_seat_depth_in IS NULL)::int
                         +(under_seat_height_in IS NULL)::int) NOT IN (0,3)
                      )
                    """,
                    (all_ids,),
                )
                partials = cursor.fetchone()[0]
                if partials:
                    raise RuntimeError(f"Found {partials} partial dimension triples")

        print(f"Archived and updated {len(all_ids)} vehicles in {ARCHIVE_TABLE}")
        for label, count in counts.items():
            if count:
                print(f"{label}: {count}")
        print("Partial placement-specific dimension triples: 0")
    finally:
        connection.close()


if __name__ == "__main__":
    main()
