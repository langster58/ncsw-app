#!/usr/bin/env python3
"""Classify fixed-configuration pickups by their physical cab layout."""

from pathlib import Path

import psycopg2


ENV_PATH = Path.home() / ".config" / "directus-render.env"
ARCHIVE_TABLE = "vehicles_fixed_truck_cab_archive_20260728"

REGULAR_CAB_MODELS = {
    ("Chevrolet", "El Camino"),
}

CREW_CAB_MODELS = {
    ("Cadillac", "Escalade EXT"),
    ("Chevrolet", "Avalanche"),
    ("Chevrolet", "Silverado EV"),
    ("Ford", "Explorer Sport Trac"),
    ("Ford", "Maverick"),
    ("GMC", "HUMMER EV"),
    ("GMC", "Sierra EV"),
    ("Honda", "Ridgeline"),
    ("Hummer", "H2 SUT"),
    ("Hummer", "H3T"),
    ("Hyundai", "Santa Cruz"),
    ("Jeep", "Gladiator"),
    ("Rivian", "R1T"),
    ("Subaru", "Baja"),
    ("Tesla", "Cybertruck"),
}


def database_url() -> str:
    values = {}
    for raw_line in ENV_PATH.read_text().splitlines():
        line = raw_line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            values[key] = value
    return values["DATABASE_URL"]


def main() -> None:
    assignments = [
        (make, model, "regular_cab", "Regular Cab")
        for make, model in sorted(REGULAR_CAB_MODELS)
    ]
    assignments.extend(
        (make, model, "crew_cab", "Crew Cab")
        for make, model in sorted(CREW_CAB_MODELS)
    )

    connection = psycopg2.connect(database_url())
    try:
        with connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT vehicle_id, make, model
                    FROM vehicles
                    WHERE body_style='Truck' AND cab_type IS NULL
                    ORDER BY make, model, vehicle_id
                    """
                )
                rows = cursor.fetchall()
                if len(rows) != 641:
                    raise RuntimeError(
                        f"Expected 641 unclassified truck rows, found {len(rows)}"
                    )

                assignment_keys = {(make, model) for make, model, _, _ in assignments}
                unmatched = sorted(
                    {(make, model) for _, make, model in rows} - assignment_keys
                )
                if unmatched:
                    raise RuntimeError(f"Unmapped fixed truck models: {unmatched}")

                ids = [row[0] for row in rows]
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

                values_sql = ", ".join(["(%s, %s, %s, %s)"] * len(assignments))
                parameters = [
                    value
                    for assignment in assignments
                    for value in assignment
                ]
                cursor.execute(
                    f"""
                    UPDATE vehicles AS vehicle
                    SET cab_type=assignment.cab_type,
                        cab_type_name=assignment.cab_type_name
                    FROM (
                      VALUES {values_sql}
                    ) AS assignment(make, model, cab_type, cab_type_name)
                    WHERE vehicle.body_style='Truck'
                      AND vehicle.cab_type IS NULL
                      AND vehicle.make=assignment.make
                      AND vehicle.model=assignment.model
                    """,
                    parameters,
                )
                if cursor.rowcount != len(ids):
                    raise RuntimeError(
                        f"Expected {len(ids)} updates, wrote {cursor.rowcount}"
                    )

                cursor.execute(
                    """
                    SELECT count(*)
                    FROM vehicles
                    WHERE body_style='Truck'
                      AND (cab_type IS NULL OR cab_type_name IS NULL)
                    """
                )
                remaining = cursor.fetchone()[0]
                if remaining != 0:
                    raise RuntimeError(
                        f"{remaining} truck rows still lack cab classification"
                    )

        print(f"Archived and classified {len(ids)} rows in {ARCHIVE_TABLE}")
        print("Truck rows without cab_type or cab_type_name: 0")
    finally:
        connection.close()


if __name__ == "__main__":
    main()
