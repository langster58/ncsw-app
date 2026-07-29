#!/usr/bin/env python3
"""Apply split-year and same-body truck enclosure fitments for pass 15."""

from pathlib import Path

import psycopg2


ARCHIVE_TABLE = "vehicles_truck_space_archive_pass15_20260728"
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
    (
        "under_seat",
        50.25, 12.0, 5.75,
        """make='Ford'
           AND model IN ('F-250 Super Duty','F-350 Super Duty')
           AND cab_type='extended_cab' AND year BETWEEN 2002 AND 2016""",
        "https://www.ground-shaker.com/index.php?option=com_hikashop&ctrl=product"
        "&task=show&cid=742&name=black-8-dual-sealed-sub-box-fits-2002-2016"
        "-ford-f-250-350-ext-cab&Itemid=104&lang=en",
    ),
    (
        "under_seat",
        49.25, 17.5, 7.25,
        """make='Ford'
           AND model IN ('F-250 Super Duty','F-350 Super Duty')
           AND cab_type='extended_cab' AND year BETWEEN 2017 AND 2023""",
        "https://www.ground-shaker.com/index.php?option=com_hikashop&ctrl=product"
        "&task=show&cid=1028&name=black-12-dual-sealed-sub-box-fits-17-23"
        "-ford-f-250-ext-cab&Itemid=104&lang=en",
    ),
    (
        "under_seat",
        52.25, 13.75, 5.75,
        """make='Ford' AND model='F-150' AND cab_type='extended_cab'
           AND year BETWEEN 1997 AND 1999""",
        "https://www.ground-shaker.com/index.php?option=com_hikashop&ctrl=product"
        "&task=show&cid=236&name=wf150210b-black-10-dual-sealed-sub-box-fits"
        "-ford-f-150-extended-super-cab-1997-1999&Itemid=104&lang=en",
    ),
    (
        "under_seat",
        50.25, 13.25, 6.25,
        """make='Ford' AND model='F-150' AND cab_type='extended_cab'
           AND year BETWEEN 2000 AND 2003""",
        "https://www.ground-shaker.com/index.php?option=com_hikashop&ctrl=product"
        "&task=show&cid=835&name=black-8-dual-sealed-sub-box-fits-00-03"
        "-ford-f-150-ext-cab&Itemid=104&lang=en",
    ),
    (
        "behind_seat",
        45.25, 8.25, 16.75,
        """make='Toyota' AND model='Tundra' AND cab_type='crew_cab'
           AND year BETWEEN 2007 AND 2013""",
        "https://www.ground-shaker.com/index.php?option=com_hikashop&ctrl=product"
        "&task=show&cid=1049&name=black-8-dual-sealed-sub-box-fits-07-13"
        "-toyota-tundra-crew-max&Itemid=104&lang=en",
    ),
    (
        "behind_seat",
        52.5, 6.75, 16.0,
        """make='Toyota' AND model='Tundra' AND cab_type='crew_cab'
           AND year BETWEEN 2014 AND 2021""",
        "https://www.ground-shaker.com/index.php?option=com_hikashop&ctrl=product"
        "&task=show&cid=697&name=black-8-dual-sealed-sub-box-fits"
        "-toyota-tundra-crew-max-2014-2021&Itemid=104&lang=en",
    ),
    (
        "under_seat",
        42.25, 14.5, 7.25,
        """make='GMC' AND model='Canyon' AND cab_type='crew_cab'
           AND year BETWEEN 2025 AND 2026""",
        "https://www.ground-shaker.com/index.php?option=com_hikashop&ctrl=product"
        "&task=show&cid=671&name=black-10-dual-sealed-sub-box-fits-chevy"
        "-colorado-gmc-canyon-crew-cab-2015-2019&Itemid=104&lang=en",
    ),
    (
        "under_seat",
        55.5, 13.5, 9.25,
        """make='Chevrolet' AND model ILIKE 'Silverado%%'
           AND generation='2014-2019' AND cab_type='extended_cab' AND year=2019""",
        "https://ground-shaker.com/index.php?Itemid=104&cid=116&ctrl=product"
        "&lang=en&name=gs-jchvp212b-black-12-dual-ported-sub-box-fits-chevy"
        "-silverado-gmc-sierra-ext-double-cab-2007-2017"
        "&option=com_hikashop&task=show",
    ),
    (
        "under_seat",
        55.5, 13.5, 9.25,
        """make='GMC' AND model ILIKE 'Sierra%%'
           AND generation='2014-2019' AND cab_type='extended_cab' AND year=2019""",
        "https://www.ground-shaker.com/index.php?Itemid=104&cid=1010"
        "&ctrl=product&lang=en&name=black-12-dual-ported-sub-box-fits-07-18"
        "-gmc-extended-cab&option=com_hikashop&task=show",
    ),
    (
        "behind_seat",
        48.25, 9.5, 16.25,
        """make='Chevrolet' AND model ILIKE 'Silverado%%Classic%%'
           AND cab_type='regular_cab' AND year=2007""",
        "https://www.ground-shaker.com/index.php?option=com_hikashop&ctrl=product"
        "&task=show&cid=1308&name=black-12-triple-sealed-sub-box-fits-99-06"
        "-chevy-silverado-regular-cab-trucks&Itemid=104&lang=en",
    ),
    (
        "behind_seat",
        48.25, 9.5, 16.25,
        """make='GMC' AND model ILIKE 'Sierra%%Classic%%'
           AND cab_type='regular_cab' AND year=2007""",
        "https://www.ground-shaker.com/index.php?option=com_hikashop&ctrl=product"
        "&task=show&cid=1311&name=black-12-triple-sealed-sub-box-fits-99-06"
        "-gmc-sierra-regular-cab-trucks&Itemid=104&lang=en",
    ),
    (
        "behind_seat",
        54.0, 9.0, 14.0,
        """make='Ford' AND model='F-150' AND cab_type='regular_cab' AND year=2015""",
        "https://www.ebay.com/itm/395472281758",
    ),
]


def database_url():
    values = {}
    for raw_line in ENV_PATH.read_text().splitlines():
        line = raw_line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            values[key] = value
    return values["DATABASE_URL"]


def main():
    connection = psycopg2.connect(database_url())
    try:
        with connection:
            with connection.cursor() as cursor:
                targets = []
                counts = []
                for placement, width, depth, height, predicate, source in RULES:
                    where = f"({predicate}) AND {UNRESOLVED}"
                    cursor.execute(
                        f"SELECT array_agg(vehicle_id) FROM vehicles WHERE {where}"
                    )
                    ids = cursor.fetchone()[0] or []
                    counts.append((predicate.splitlines()[0].strip(), len(ids)))
                    targets.append((placement, width, depth, height, where, source))
                all_ids = []
                for _, _, _, _, where, _ in targets:
                    cursor.execute(
                        f"SELECT vehicle_id FROM vehicles WHERE {where}"
                    )
                    all_ids.extend(row[0] for row in cursor.fetchall())
                if len(all_ids) != len(set(all_ids)):
                    raise RuntimeError("Target rules overlap; refusing to write")

                cursor.execute("SELECT to_regclass(%s)", (f"public.{ARCHIVE_TABLE}",))
                if cursor.fetchone()[0] is not None:
                    raise RuntimeError(f"Archive already exists: {ARCHIVE_TABLE}")
                cursor.execute(
                    f"CREATE TABLE {ARCHIVE_TABLE} AS "
                    "SELECT * FROM vehicles WHERE vehicle_id=ANY(%s)",
                    (all_ids,),
                )
                updated = 0
                for placement, width, depth, height, where, source in targets:
                    cursor.execute(
                        f"""
                        UPDATE vehicles
                        SET {placement}_width_in=%s,
                            {placement}_depth_in=%s,
                            {placement}_height_in=%s,
                            {placement}_source_url=%s
                        WHERE {where}
                        """,
                        (width, depth, height, source),
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
                if cursor.fetchone()[0]:
                    raise RuntimeError("Partial dimension triples found")
        print(f"Archived and updated {len(all_ids)} vehicles in {ARCHIVE_TABLE}")
        for label, count in counts:
            if count:
                print(f"{label}: {count}")
        print("Partial placement-specific dimension triples: 0")
    finally:
        connection.close()


if __name__ == "__main__":
    main()
