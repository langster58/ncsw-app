#!/usr/bin/env python3
"""Report placement-specific truck dimensions for selected make/model pairs."""

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
        raise SystemExit("usage: report-truck-space-model.py MAKE MODEL [MAKE MODEL ...]")
    pairs = tuple(zip(sys.argv[1::2], sys.argv[2::2]))
    connection = psycopg2.connect(base.database_url())
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT make, model, cab_type, generation, min(year), max(year),
                       behind_seat_width_in, behind_seat_depth_in,
                       behind_seat_height_in, under_seat_width_in,
                       under_seat_depth_in, under_seat_height_in,
                       max(coalesce(behind_seat_source_url,
                                    under_seat_source_url)),
                       count(*)
                FROM vehicles
                WHERE body_style='Truck' AND (make, model) IN %s
                GROUP BY make, model, cab_type, generation,
                         behind_seat_width_in, behind_seat_depth_in,
                         behind_seat_height_in, under_seat_width_in,
                         under_seat_depth_in, under_seat_height_in
                ORDER BY make, model, cab_type, min(year), count(*) DESC
                """,
                (pairs,),
            )
            for row in cursor.fetchall():
                print("\t".join("" if value is None else str(value) for value in row))
    finally:
        connection.close()


if __name__ == "__main__":
    main()
