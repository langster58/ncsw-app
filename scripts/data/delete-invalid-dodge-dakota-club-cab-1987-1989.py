#!/usr/bin/env python3
"""Archive and delete Dakota Club Cab rows predating its 1990 introduction."""

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

import psycopg2


base_path = Path(__file__).with_name("report-unresolved-truck-space.py")
spec = spec_from_file_location("truck_space_report", base_path)
base = module_from_spec(spec)
spec.loader.exec_module(base)

ARCHIVE_TABLE = "vehicles_invalid_dakota_club_cab_archive_20260728"
TARGET = """
    make='Dodge'
    AND model='Dakota'
    AND cab_type='extended_cab'
    AND cab_type_name='Club Cab'
    AND year BETWEEN 1987 AND 1989
"""
EXPECTED = 39


def main() -> None:
    connection = psycopg2.connect(base.database_url())
    try:
        with connection:
            with connection.cursor() as cursor:
                cursor.execute(f"SELECT vehicle_id FROM vehicles WHERE {TARGET}")
                ids = [row[0] for row in cursor.fetchall()]
                if len(ids) != EXPECTED:
                    raise RuntimeError(
                        f"Expected {EXPECTED} invalid rows, found {len(ids)}"
                    )
                cursor.execute("SELECT to_regclass(%s)", (f"public.{ARCHIVE_TABLE}",))
                if cursor.fetchone()[0] is not None:
                    raise RuntimeError(f"Archive already exists: {ARCHIVE_TABLE}")
                cursor.execute(
                    f"CREATE TABLE {ARCHIVE_TABLE} AS "
                    "SELECT * FROM vehicles WHERE vehicle_id=ANY(%s)",
                    (ids,),
                )
                cursor.execute(
                    "DELETE FROM vehicles WHERE vehicle_id=ANY(%s)",
                    (ids,),
                )
                if cursor.rowcount != EXPECTED:
                    raise RuntimeError(
                        f"Expected to delete {EXPECTED}, deleted {cursor.rowcount}"
                    )
                cursor.execute(f"SELECT count(*) FROM vehicles WHERE {TARGET}")
                if cursor.fetchone()[0]:
                    raise RuntimeError("Invalid Dakota Club Cab rows remain")
        print(
            f"Archived and deleted {EXPECTED} invalid vehicles in {ARCHIVE_TABLE}"
        )
    finally:
        connection.close()


if __name__ == "__main__":
    main()
