#!/usr/bin/env python3
"""Apply direct truck-cavity measurements for pass 16."""

from pathlib import Path

import psycopg2


ARCHIVE_TABLE = "vehicles_truck_space_archive_pass16_20260728"
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
        48.0,
        16.0,
        8.0,
        """make='Rivian' AND model='R1T'""",
        "https://www.reddit.com/r/CarAV/comments/1mfc7xq",
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
                all_ids = []
                for placement, width, depth, height, predicate, source in RULES:
                    where = f"({predicate}) AND {UNRESOLVED}"
                    cursor.execute(
                        f"SELECT vehicle_id FROM vehicles WHERE {where}"
                    )
                    ids = [row[0] for row in cursor.fetchall()]
                    all_ids.extend(ids)
                    targets.append(
                        (placement, width, depth, height, where, source)
                    )
                if len(all_ids) != len(set(all_ids)):
                    raise RuntimeError("Target rules overlap; refusing to write")
                if not all_ids:
                    raise RuntimeError("No unresolved targets found")

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
        print("Partial placement-specific dimension triples: 0")
    finally:
        connection.close()


if __name__ == "__main__":
    main()
