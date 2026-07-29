#!/usr/bin/env python3
"""Read-only completeness report for vehicle cargo and truck-cab dimensions."""

from pathlib import Path

import psycopg2


ENV_PATH = Path.home() / ".config" / "directus-render.env"


def database_url() -> str:
    values = {}
    for raw_line in ENV_PATH.read_text().splitlines():
        line = raw_line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            values[key] = value
    return values["DATABASE_URL"]


def print_rows(cursor, sql: str, params=()) -> None:
    if params:
        cursor.execute(sql, params)
    else:
        cursor.execute(sql)
    headers = [item.name for item in cursor.description]
    print("\t".join(headers))
    for row in cursor.fetchall():
        print("\t".join("" if value is None else str(value) for value in row))


def main() -> None:
    connection = psycopg2.connect(database_url())
    try:
        with connection.cursor() as cursor:
            print("DIMENSION_RELATED_COLUMNS")
            print_rows(
                cursor,
                """
                SELECT column_name, data_type
                FROM information_schema.columns
                WHERE table_schema='public' AND table_name='vehicles'
                  AND (
                    column_name ILIKE '%boot%'
                    OR column_name ILIKE '%cargo%'
                    OR column_name ILIKE '%seat%'
                    OR column_name ILIKE '%cab%'
                    OR column_name='body_style'
                  )
                ORDER BY ordinal_position
                """,
            )

            print("\nBOOT_COMPLETENESS_BY_BODY_STYLE")
            print_rows(
                cursor,
                """
                SELECT coalesce(body_style, '<null>') AS body_style,
                       count(*) AS rows,
                       count(*) FILTER (
                         WHERE boot_width_in IS NOT NULL
                           AND boot_depth_in IS NOT NULL
                           AND boot_height_in IS NOT NULL
                       ) AS complete,
                       count(*) FILTER (
                         WHERE boot_width_in IS NULL
                           AND boot_depth_in IS NULL
                           AND boot_height_in IS NULL
                       ) AS all_missing,
                       count(*) FILTER (
                         WHERE (boot_width_in IS NULL)::int
                             + (boot_depth_in IS NULL)::int
                             + (boot_height_in IS NULL)::int IN (1,2)
                       ) AS partial
                FROM vehicles
                GROUP BY body_style
                ORDER BY rows DESC
                """,
            )

            print("\nCOMPLETENESS_BY_VEHICLE_CATEGORY_AND_BODY_STYLE")
            print_rows(
                cursor,
                """
                SELECT coalesce(vehicle_category, '<null>') AS vehicle_category,
                       coalesce(body_style, '<null>') AS body_style,
                       count(*) AS rows,
                       count(*) FILTER (
                         WHERE boot_width_in IS NOT NULL
                           AND boot_depth_in IS NOT NULL
                           AND boot_height_in IS NOT NULL
                       ) AS boot_complete,
                       count(*) FILTER (
                         WHERE behind_seat_width_in IS NOT NULL
                           AND behind_seat_depth_in IS NOT NULL
                           AND behind_seat_height_in IS NOT NULL
                       ) AS behind_complete,
                       count(*) FILTER (
                         WHERE under_seat_width_in IS NOT NULL
                           AND under_seat_depth_in IS NOT NULL
                           AND under_seat_height_in IS NOT NULL
                       ) AS under_complete
                FROM vehicles
                GROUP BY vehicle_category, body_style
                ORDER BY vehicle_category, rows DESC, body_style
                """,
            )

            print("\nTRUCK_CAB_COMPLETENESS")
            print_rows(
                cursor,
                """
                SELECT
                  count(*) AS truck_rows,
                  count(*) FILTER (WHERE cab_type IS NULL) AS cab_type_missing,
                  count(*) FILTER (
                    WHERE behind_seat_width_in IS NOT NULL
                      AND behind_seat_depth_in IS NOT NULL
                      AND behind_seat_height_in IS NOT NULL
                  ) AS behind_complete,
                  count(*) FILTER (
                    WHERE under_seat_width_in IS NOT NULL
                      AND under_seat_depth_in IS NOT NULL
                      AND under_seat_height_in IS NOT NULL
                  ) AS under_complete,
                  count(*) FILTER (
                    WHERE behind_seat_width_in IS NOT NULL
                      AND behind_seat_depth_in IS NOT NULL
                      AND behind_seat_height_in IS NOT NULL
                      AND under_seat_width_in IS NOT NULL
                      AND under_seat_depth_in IS NOT NULL
                      AND under_seat_height_in IS NOT NULL
                  ) AS both_complete,
                  count(*) FILTER (
                    WHERE behind_seat_width_in IS NULL
                      AND behind_seat_depth_in IS NULL
                      AND behind_seat_height_in IS NULL
                      AND under_seat_width_in IS NULL
                      AND under_seat_depth_in IS NULL
                      AND under_seat_height_in IS NULL
                  ) AS neither,
                  count(*) FILTER (
                    WHERE (
                      (behind_seat_width_in IS NULL)::int
                      + (behind_seat_depth_in IS NULL)::int
                      + (behind_seat_height_in IS NULL)::int
                    ) IN (1,2)
                    OR (
                      (under_seat_width_in IS NULL)::int
                      + (under_seat_depth_in IS NULL)::int
                      + (under_seat_height_in IS NULL)::int
                    ) IN (1,2)
                  ) AS partial_triples
                FROM vehicles
                WHERE body_style='Truck'
                """,
            )

            print("\nTRUCK_NEITHER_BY_MAKE_AND_CAB")
            print_rows(
                cursor,
                """
                SELECT make, coalesce(cab_type, '<null>') AS cab_type,
                       coalesce(cab_type_name, '<null>') AS cab_type_name,
                       count(*) AS rows
                FROM vehicles
                WHERE body_style='Truck'
                  AND behind_seat_width_in IS NULL
                  AND behind_seat_depth_in IS NULL
                  AND behind_seat_height_in IS NULL
                  AND under_seat_width_in IS NULL
                  AND under_seat_depth_in IS NULL
                  AND under_seat_height_in IS NULL
                GROUP BY make, cab_type, cab_type_name
                ORDER BY rows DESC, make, cab_type, cab_type_name
                """,
            )

            print("\nTRUCK_NEITHER_BY_MODEL")
            print_rows(
                cursor,
                """
                SELECT make, model, coalesce(generation, '<null>') AS generation,
                       min(year) AS min_year, max(year) AS max_year,
                       count(*) AS rows
                FROM vehicles
                WHERE body_style='Truck'
                  AND behind_seat_width_in IS NULL
                  AND behind_seat_depth_in IS NULL
                  AND behind_seat_height_in IS NULL
                  AND under_seat_width_in IS NULL
                  AND under_seat_depth_in IS NULL
                  AND under_seat_height_in IS NULL
                GROUP BY make, model, generation
                ORDER BY rows DESC, make, model, min(year)
                """,
            )

            print("\nTRUCK_NULL_CAB_BY_MODEL_AND_LOCATION")
            print_rows(
                cursor,
                """
                SELECT make, model, coalesce(generation, '<null>') AS generation,
                       min(year) AS min_year, max(year) AS max_year,
                       CASE
                         WHEN bool_and(behind_seat_width_in IS NOT NULL)
                              AND bool_and(under_seat_width_in IS NOT NULL)
                           THEN 'both'
                         WHEN bool_and(behind_seat_width_in IS NOT NULL)
                           THEN 'behind'
                         WHEN bool_and(under_seat_width_in IS NOT NULL)
                           THEN 'under'
                         WHEN bool_and(behind_seat_width_in IS NULL)
                              AND bool_and(under_seat_width_in IS NULL)
                           THEN 'neither'
                         ELSE 'mixed'
                       END AS location_status,
                       count(*) AS rows
                FROM vehicles
                WHERE body_style='Truck' AND cab_type IS NULL
                GROUP BY make, model, generation
                ORDER BY rows DESC, make, model, min(year)
                """,
            )

            print("\nTRUCK_LOCATION_BY_CAB_AND_SUPPORT_FLAG")
            print_rows(
                cursor,
                """
                SELECT coalesce(cab_type, '<null>') AS cab_type,
                       coalesce(behind_seat_install_supported::text, '<null>')
                         AS behind_supported,
                       count(*) AS rows,
                       count(*) FILTER (
                         WHERE behind_seat_width_in IS NOT NULL
                       ) AS behind_complete,
                       count(*) FILTER (
                         WHERE under_seat_width_in IS NOT NULL
                       ) AS under_complete,
                       count(*) FILTER (
                         WHERE behind_seat_width_in IS NOT NULL
                           AND under_seat_width_in IS NOT NULL
                       ) AS both_complete
                FROM vehicles
                WHERE body_style='Truck'
                GROUP BY cab_type, behind_seat_install_supported
                ORDER BY cab_type, behind_seat_install_supported
                """,
            )

            print("\nTRUCK_FAMILIES_WITH_MIXED_RESEARCHED_LOCATIONS")
            print_rows(
                cursor,
                """
                SELECT make, model, generation,
                       coalesce(cab_type, '<null>') AS cab_type,
                       count(*) AS rows,
                       count(*) FILTER (
                         WHERE behind_seat_width_in IS NOT NULL
                       ) AS behind_rows,
                       count(*) FILTER (
                         WHERE under_seat_width_in IS NOT NULL
                       ) AS under_rows
                FROM vehicles
                WHERE body_style='Truck'
                GROUP BY make, model, generation, cab_type
                HAVING bool_or(behind_seat_width_in IS NOT NULL)
                   AND bool_or(under_seat_width_in IS NOT NULL)
                ORDER BY rows DESC, make, model, generation, cab_type
                """,
            )

            print("\nTRUCK_MIXED_LOCATION_DETAIL")
            print_rows(
                cursor,
                """
                WITH mixed AS (
                  SELECT make, model, generation, cab_type
                  FROM vehicles
                  WHERE body_style='Truck'
                  GROUP BY make, model, generation, cab_type
                  HAVING bool_or(behind_seat_width_in IS NOT NULL)
                     AND bool_or(under_seat_width_in IS NOT NULL)
                )
                SELECT v.make, v.model, v.generation,
                       coalesce(v.cab_type, '<null>') AS cab_type,
                       v.year,
                       coalesce(v.cargo_body_variant, '<null>') AS variant,
                       coalesce(v.powertrain, '<null>') AS powertrain,
                       CASE
                         WHEN v.behind_seat_width_in IS NOT NULL THEN 'behind'
                         WHEN v.under_seat_width_in IS NOT NULL THEN 'under'
                         ELSE 'neither'
                       END AS location,
                       count(*) AS rows
                FROM vehicles v
                JOIN mixed m
                  ON m.make=v.make AND m.model=v.model
                 AND m.generation=v.generation
                 AND m.cab_type IS NOT DISTINCT FROM v.cab_type
                GROUP BY v.make, v.model, v.generation, v.cab_type, v.year,
                         v.cargo_body_variant, v.powertrain, location
                ORDER BY v.make, v.model, v.generation, v.cab_type, v.year,
                         v.cargo_body_variant, v.powertrain, location
                """,
            )

            print("\nNONTRUCK_MISSING_BOOT_GROUPS")
            print_rows(
                cursor,
                """
                SELECT make, model, coalesce(body_style, '<null>') AS body_style,
                       coalesce(generation, '<null>') AS generation,
                       min(year) AS min_year, max(year) AS max_year,
                       count(*) AS rows
                FROM vehicles
                WHERE body_style IS DISTINCT FROM 'Truck'
                  AND (
                    boot_width_in IS NULL
                    OR boot_depth_in IS NULL
                    OR boot_height_in IS NULL
                  )
                GROUP BY make, model, body_style, generation
                ORDER BY rows DESC, make, model, min(year)
                """,
            )

            print("\nCOMPLETE_SAME_MODEL_DONORS_FOR_MISSING_GROUPS")
            print_rows(
                cursor,
                """
                WITH missing_models AS (
                  SELECT DISTINCT make, model
                  FROM vehicles
                  WHERE body_style IS DISTINCT FROM 'Truck'
                    AND (
                      boot_width_in IS NULL
                      OR boot_depth_in IS NULL
                      OR boot_height_in IS NULL
                    )
                )
                SELECT v.make, v.model, v.body_style, v.generation,
                       min(v.year) AS min_year, max(v.year) AS max_year,
                       percentile_cont(.5) WITHIN GROUP (
                         ORDER BY v.boot_width_in
                       ) AS width,
                       percentile_cont(.5) WITHIN GROUP (
                         ORDER BY v.boot_depth_in
                       ) AS depth,
                       percentile_cont(.5) WITHIN GROUP (
                         ORDER BY v.boot_height_in
                       ) AS height,
                       mode() WITHIN GROUP (
                         ORDER BY v.dims_source_url
                       ) AS source_url,
                       count(*) AS rows
                FROM vehicles v
                JOIN missing_models m USING (make, model)
                WHERE v.boot_width_in IS NOT NULL
                  AND v.boot_depth_in IS NOT NULL
                  AND v.boot_height_in IS NOT NULL
                GROUP BY v.make, v.model, v.body_style, v.generation
                ORDER BY v.make, v.model, min(v.year)
                """,
            )
    finally:
        connection.close()


if __name__ == "__main__":
    main()
