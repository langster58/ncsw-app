#!/usr/bin/env python3
"""Propagate both verified enclosure locations across identical Ranger cabs."""

from pathlib import Path

import psycopg2


ENV_PATH = Path.home() / ".config" / "directus-render.env"
ARCHIVE_TABLE = "vehicles_truck_dual_location_archive_ranger_20260728"
GENERATIONS = ("1999-2006", "2007-2011")


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
                cursor.execute(
                    """
                    SELECT vehicle_id
                    FROM vehicles
                    WHERE make='Ford' AND model='Ranger'
                      AND cab_type='extended_cab'
                      AND generation=ANY(%s)
                    """,
                    (list(GENERATIONS),),
                )
                ids = [row[0] for row in cursor.fetchall()]
                if len(ids) != 174:
                    raise RuntimeError(
                        f"Expected 174 Ranger rows, found {len(ids)}"
                    )
                cursor.execute(
                    "SELECT to_regclass(%s)", (f"public.{ARCHIVE_TABLE}",)
                )
                if cursor.fetchone()[0] is not None:
                    raise RuntimeError(f"Archive already exists: {ARCHIVE_TABLE}")
                cursor.execute(
                    f"CREATE TABLE {ARCHIVE_TABLE} AS "
                    "SELECT * FROM vehicles WHERE vehicle_id=ANY(%s)",
                    (ids,),
                )
                cursor.execute(
                    """
                    UPDATE vehicles
                    SET behind_seat_width_in=coalesce(
                          behind_seat_width_in, 43.25
                        ),
                        behind_seat_depth_in=coalesce(
                          behind_seat_depth_in, 13.5
                        ),
                        behind_seat_height_in=coalesce(
                          behind_seat_height_in, 7.5
                        ),
                        behind_seat_source_url=coalesce(
                          behind_seat_source_url,
                          'https://images.carid.com/atrend/items/pdf/'
                          'atrend-catalog.pdf'
                        ),
                        under_seat_width_in=coalesce(
                          under_seat_width_in, 51.3125
                        ),
                        under_seat_depth_in=coalesce(
                          under_seat_depth_in, 12.0
                        ),
                        under_seat_height_in=coalesce(
                          under_seat_height_in, 8.375
                        ),
                        under_seat_source_url=coalesce(
                          under_seat_source_url,
                          'https://www.mtx.com/i/caraudio/products/'
                          'manualsQuickInstall/thunderforms/FRANX99_specs.pdf'
                        )
                    WHERE vehicle_id=ANY(%s)
                    """,
                    (ids,),
                )
                if cursor.rowcount != len(ids):
                    raise RuntimeError(
                        f"Expected {len(ids)} updates, wrote {cursor.rowcount}"
                    )
                cursor.execute(
                    """
                    SELECT count(*)
                    FROM vehicles
                    WHERE vehicle_id=ANY(%s)
                      AND (
                        behind_seat_width_in IS NULL
                        OR behind_seat_depth_in IS NULL
                        OR behind_seat_height_in IS NULL
                        OR under_seat_width_in IS NULL
                        OR under_seat_depth_in IS NULL
                        OR under_seat_height_in IS NULL
                      )
                    """,
                    (ids,),
                )
                if cursor.fetchone()[0] != 0:
                    raise RuntimeError("A Ranger dual-location gap remains")
        print(f"Archived and updated {len(ids)} rows in {ARCHIVE_TABLE}")
        print("Ranger rows with both complete locations: 174")
    finally:
        connection.close()


if __name__ == "__main__":
    main()
