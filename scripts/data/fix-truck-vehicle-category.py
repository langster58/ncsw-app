#!/usr/bin/env python3
"""Correct truck rows carrying a non-truck package envelope category."""

from pathlib import Path

import psycopg2


ENV_PATH = Path.home() / ".config" / "directus-render.env"
ARCHIVE_TABLE = "vehicles_truck_category_archive_20260728"


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
                    WHERE body_style='Truck'
                      AND vehicle_category IS DISTINCT FROM 'truck'
                    """
                )
                ids = [row[0] for row in cursor.fetchall()]
                if len(ids) != 40:
                    raise RuntimeError(
                        f"Expected 40 miscategorized truck rows, found {len(ids)}"
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
                    UPDATE vehicles SET vehicle_category='truck'
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
                    SELECT count(*) FROM vehicles
                    WHERE body_style='Truck'
                      AND vehicle_category IS DISTINCT FROM 'truck'
                    """
                )
                if cursor.fetchone()[0] != 0:
                    raise RuntimeError("Non-truck category remains on truck rows")
        print(f"Archived and corrected {len(ids)} rows in {ARCHIVE_TABLE}")
    finally:
        connection.close()


if __name__ == "__main__":
    main()
