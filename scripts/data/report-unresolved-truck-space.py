#!/usr/bin/env python3
"""Report unresolved placement-specific truck dimensions by vehicle family."""

from pathlib import Path

import psycopg2


ENV_PATH = Path.home() / ".config" / "directus-render.env"
UNRESOLVED = """
    behind_seat_width_in IS NULL
    AND behind_seat_depth_in IS NULL
    AND behind_seat_height_in IS NULL
    AND under_seat_width_in IS NULL
    AND under_seat_depth_in IS NULL
    AND under_seat_height_in IS NULL
"""


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
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                SELECT count(*)
                FROM vehicles
                WHERE body_style='Truck' AND cab_type IS NOT NULL
                  AND {UNRESOLVED}
                """
            )
            print(f"Unresolved truck rows: {cursor.fetchone()[0]}")
            cursor.execute(
                f"""
                SELECT make, model, cab_type, generation,
                       min(year), max(year), count(*)
                FROM vehicles
                WHERE body_style='Truck' AND cab_type IS NOT NULL
                  AND {UNRESOLVED}
                GROUP BY make, model, cab_type, generation
                ORDER BY count(*) DESC, make, model, min(year)
                """
            )
            for row in cursor.fetchall():
                print("\t".join("" if value is None else str(value) for value in row))
    finally:
        connection.close()


if __name__ == "__main__":
    main()
