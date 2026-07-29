#!/usr/bin/env python3
"""Report rows that reference a selected set of vehicle IDs."""

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

import psycopg2
from psycopg2 import sql


base_path = Path(__file__).with_name("report-unresolved-truck-space.py")
spec = spec_from_file_location("truck_space_report", base_path)
base = module_from_spec(spec)
spec.loader.exec_module(base)

TARGET = """
    make='Dodge'
    AND model='RAM'
    AND cab_type='extended_cab'
    AND cab_type_name='Club Cab'
    AND year BETWEEN 1983 AND 1989
"""


def main() -> None:
    connection = psycopg2.connect(base.database_url())
    try:
        with connection.cursor() as cursor:
            cursor.execute(f"SELECT vehicle_id FROM vehicles WHERE {TARGET}")
            ids = [row[0] for row in cursor.fetchall()]
            print(f"target vehicles: {len(ids)}")
            cursor.execute(
                """
                SELECT conrelid::regclass::text,
                       a.attname,
                       confdeltype,
                       conname
                FROM pg_constraint c
                JOIN pg_attribute a
                  ON a.attrelid=c.conrelid
                 AND a.attnum=ANY(c.conkey)
                WHERE c.contype='f'
                  AND c.confrelid='vehicles'::regclass
                ORDER BY 1,2
                """
            )
            for table, column, delete_type, constraint in cursor.fetchall():
                cursor.execute(
                    sql.SQL("SELECT count(*) FROM {} WHERE {}=ANY(%s)").format(
                        sql.Identifier(table),
                        sql.Identifier(column),
                    ),
                    (ids,),
                )
                print(
                    f"{table}.{column}: {cursor.fetchone()[0]} "
                    f"delete={delete_type} constraint={constraint}"
                )
    finally:
        connection.close()


if __name__ == "__main__":
    main()
