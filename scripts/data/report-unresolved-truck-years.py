#!/usr/bin/env python3
"""Show unresolved truck records by year and display cab name for selected models."""

import sys
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

import psycopg2


base_path = Path(__file__).with_name("report-unresolved-truck-space.py")
spec = spec_from_file_location("truck_space_report", base_path)
base = module_from_spec(spec)
spec.loader.exec_module(base)


def main() -> None:
    if len(sys.argv) < 3 or len(sys.argv[1:]) % 2:
        raise SystemExit("usage: report-unresolved-truck-years.py MAKE MODEL [MAKE MODEL ...]")
    pairs = tuple(zip(sys.argv[1::2], sys.argv[2::2]))
    connection = psycopg2.connect(base.database_url())
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                SELECT make, model, year, cab_type, cab_type_name, generation,
                       count(*)
                FROM vehicles
                WHERE body_style='Truck' AND (make, model) IN %s
                  AND {base.UNRESOLVED}
                GROUP BY make, model, year, cab_type, cab_type_name, generation
                ORDER BY make, model, year, cab_type_name
                """,
                (pairs,),
            )
            for row in cursor.fetchall():
                print("\t".join("" if value is None else str(value) for value in row))
    finally:
        connection.close()


if __name__ == "__main__":
    main()
