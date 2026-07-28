#!/usr/bin/env python3
"""Correct collapsed truck cab variants in the live vehicles collection.

Scope is intentionally limited to the five audited groups:

* Ford Ranger
* Nissan Frontier
* Toyota Tacoma
* Ford F-150
* Dodge/Ram pickups

`cab_type` remains the broad package-fit class (single/ext/crew).
`cargo_body_variant` stores the physical customer-facing cab configuration.
Rows are duplicated only when one imported row represents two real physical
cabins. Door count is not used as a generic cab rule; it is used only in the
two audited Tacoma/Frontier year ranges where Cars.com style data proves the
source rows themselves distinguish the cabins that way.

Default is a read-only proposal. `--write`:

1. locks vehicles against concurrent ID allocation,
2. archives every changed original row in Postgres,
3. records every inserted row and its source vehicle_id,
4. applies all changes in one transaction, and
5. validates the resulting cab families before commit.

Usage:
  python3 scripts/data/correct-truck-cab-variants.py
  python3 scripts/data/correct-truck-cab-variants.py --write
"""

from __future__ import annotations

import argparse
import collections
import os
from dataclasses import dataclass

import psycopg2
from psycopg2 import sql
from psycopg2.extras import execute_values


ARCHIVE_TABLE = "vehicles_truck_cab_archive_20260728"
INSERT_MAP_TABLE = "vehicles_truck_cab_insert_map_20260728"

DIMENSION_FIELDS = {
    "behind_seat_install_supported",
    "behind_seat_depth_in",
    "boot_width_in",
    "boot_depth_in",
    "boot_height_in",
    "opening_width_in",
    "opening_height_in",
    "dims_status",
    "dims_source_url",
    "dims_quote",
    "dims_confidence",
    "dims_config",
    "dims_taper_note",
    "dims_checked_at",
}


@dataclass(frozen=True)
class Vehicle:
    vehicle_id: int
    make: str
    model: str
    year: int
    generation: str
    cab_type: str | None
    doors: int | None
    trim: str | None
    powertrain: str | None


@dataclass(frozen=True)
class ExistingPlan:
    vehicle_id: int
    cab_type: str
    variant: str
    reason: str


@dataclass(frozen=True)
class CopyPlan:
    source_vehicle_id: int
    cab_type: str
    variant: str
    doors: int | None
    reason: str


def db_connection():
    env = {}
    with open(os.path.expanduser("~/.config/directus-render.env")) as handle:
        for line in handle:
            if "=" in line:
                key, value = line.rstrip("\n").split("=", 1)
                env[key.strip()] = value.strip()
    return psycopg2.connect(env["DATABASE_URL"])


def is_ram_pickup(vehicle: Vehicle) -> bool:
    if vehicle.make == "Ram":
        return vehicle.model in {"1500", "1500 Classic", "2500", "3500"}
    if vehicle.make != "Dodge":
        return False
    return vehicle.model in {
        "RAM",
        "RAM 150",
        "RAM 250",
        "RAM 350",
        "Ram Pickup 1500",
        "Ram Pickup 2500",
        "Ram Pickup 3500",
    }


def classify_existing(vehicle: Vehicle) -> ExistingPlan:
    make, model, year, cab, doors = (
        vehicle.make,
        vehicle.model,
        vehicle.year,
        vehicle.cab_type,
        vehicle.doors,
    )

    if (make, model) == ("Ford", "Ranger"):
        if cab == "single":
            return ExistingPlan(vehicle.vehicle_id, "single", "Regular Cab", "Ranger Regular Cab")
        if year <= 2011:
            return ExistingPlan(
                vehicle.vehicle_id, "ext", "SuperCab", "Ranger pre-2012 crew misclassification"
            )
        return ExistingPlan(vehicle.vehicle_id, "crew", "SuperCrew", "Ranger SuperCrew")

    if (make, model) == ("Nissan", "Frontier"):
        if cab == "single":
            return ExistingPlan(vehicle.vehicle_id, "single", "Regular Cab", "Frontier Regular Cab")
        if cab == "ext" or (2001 <= year <= 2004 and cab == "crew" and doors == 2):
            return ExistingPlan(vehicle.vehicle_id, "ext", "King Cab", "Frontier King Cab")
        return ExistingPlan(vehicle.vehicle_id, "crew", "Crew Cab", "Frontier Crew Cab")

    if (make, model) == ("Toyota", "Tacoma"):
        if cab == "single":
            return ExistingPlan(vehicle.vehicle_id, "single", "Regular Cab", "Tacoma Regular Cab")
        if (2001 <= year <= 2004 or year >= 2024) and doors == 4:
            return ExistingPlan(vehicle.vehicle_id, "crew", "Double Cab", "Tacoma Double Cab")
        if 2005 <= year <= 2023:
            return ExistingPlan(vehicle.vehicle_id, "ext", "Access Cab", "Tacoma Access Cab")
        return ExistingPlan(vehicle.vehicle_id, "ext", "XtraCab", "Tacoma XtraCab")

    if (make, model) == ("Ford", "F-150"):
        if cab == "single":
            return ExistingPlan(vehicle.vehicle_id, "single", "Regular Cab", "F-150 Regular Cab")
        if cab == "ext":
            return ExistingPlan(vehicle.vehicle_id, "ext", "SuperCab", "F-150 SuperCab")
        return ExistingPlan(vehicle.vehicle_id, "crew", "SuperCrew", "F-150 SuperCrew")

    if is_ram_pickup(vehicle):
        if cab == "single":
            return ExistingPlan(vehicle.vehicle_id, "single", "Regular Cab", "Ram Regular Cab")
        if cab == "ext":
            variant = "Club Cab" if year <= 1993 else ("Club/Quad Cab" if year <= 2001 else "Quad Cab")
            return ExistingPlan(vehicle.vehicle_id, "ext", variant, f"Ram {variant}")

        # Rows called "crew" by the import before a real Crew Cab existed are
        # four-door Club/Quad Cab rows, except audited Mega Cab duplicates added below.
        if year <= 2002:
            return ExistingPlan(vehicle.vehicle_id, "ext", "Club/Quad Cab", "Ram Club/Quad Cab")
        if make == "Dodge" and model == "Ram Pickup 1500" and year <= 2008:
            return ExistingPlan(vehicle.vehicle_id, "ext", "Quad Cab", "Ram 1500 Quad Cab")
        if make == "Dodge" and model in {"Ram Pickup 2500", "Ram Pickup 3500"} and year <= 2009:
            return ExistingPlan(vehicle.vehicle_id, "ext", "Quad Cab", "Ram HD Quad Cab")
        return ExistingPlan(vehicle.vehicle_id, "crew", "Crew Cab", "Ram Crew Cab")

    raise ValueError(f"vehicle outside controlled scope: {vehicle}")


def copy_plans(vehicle: Vehicle) -> list[CopyPlan]:
    make, model, year, cab = vehicle.make, vehicle.model, vehicle.year, vehicle.cab_type
    copies = []

    if (make, model) == ("Ford", "Ranger") and cab == "crew" and 2019 <= year <= 2023:
        copies.append(CopyPlan(vehicle.vehicle_id, "ext", "SuperCab", vehicle.doors, "Ranger SuperCab"))

    if (make, model) == ("Nissan", "Frontier") and cab == "crew" and 2005 <= year <= 2026:
        copies.append(CopyPlan(vehicle.vehicle_id, "ext", "King Cab", vehicle.doors, "Frontier King Cab"))

    if (make, model) == ("Toyota", "Tacoma") and cab == "ext" and 2005 <= year <= 2023:
        copies.append(CopyPlan(vehicle.vehicle_id, "crew", "Double Cab", vehicle.doors, "Tacoma Double Cab"))

    if (make, model) == ("Ford", "F-150"):
        if cab == "crew" and 2001 <= year <= 2026:
            copies.append(CopyPlan(vehicle.vehicle_id, "ext", "SuperCab", vehicle.doors, "F-150 SuperCab"))
        if cab == "ext" and 1979 <= year <= 1985:
            copies.append(CopyPlan(vehicle.vehicle_id, "single", "Regular Cab", 2, "F-150 Regular Cab"))
        if cab == "crew" and year == 2026 and vehicle.trim in {"XL", "XL Fleet"}:
            copies.append(CopyPlan(vehicle.vehicle_id, "single", "Regular Cab", 2, "F-150 2026 Regular Cab"))

    if is_ram_pickup(vehicle):
        # Second-generation Dodge Ram did have an extended Club/Quad Cab in 1994;
        # the source import omitted that body for the first model year.
        if make == "Dodge" and model.startswith("Ram Pickup ") and year == 1994 and cab == "single":
            copies.append(
                CopyPlan(vehicle.vehicle_id, "ext", "Club/Quad Cab", vehicle.doors, "Ram 1994 Club/Quad Cab")
            )

        if make == "Dodge" and model == "Ram Pickup 1500" and cab == "crew":
            if 2006 <= year <= 2008:
                copies.append(CopyPlan(vehicle.vehicle_id, "crew", "Mega Cab", vehicle.doors, "Ram 1500 Mega Cab"))
            if 2009 <= year <= 2010:
                copies.append(CopyPlan(vehicle.vehicle_id, "ext", "Quad Cab", vehicle.doors, "Ram 1500 Quad Cab"))

        if (
            make == "Dodge"
            and model in {"Ram Pickup 2500", "Ram Pickup 3500"}
            and cab == "crew"
            and 2006 <= year <= 2010
        ):
            copies.append(CopyPlan(vehicle.vehicle_id, "crew", "Mega Cab", vehicle.doors, "Ram HD Mega Cab"))

        if make == "Ram" and model in {"1500", "1500 Classic"} and cab == "crew":
            copies.append(CopyPlan(vehicle.vehicle_id, "ext", "Quad Cab", vehicle.doors, "Ram 1500 Quad Cab"))

        if make == "Ram" and model in {"2500", "3500"} and cab == "crew":
            copies.append(CopyPlan(vehicle.vehicle_id, "crew", "Mega Cab", vehicle.doors, "Ram HD Mega Cab"))

    return copies


def read_scope(cursor) -> list[Vehicle]:
    cursor.execute(
        """
        select vehicle_id, make, model, year, generation, cab_type, doors, trim, powertrain
        from vehicles
        where body_style = 'Truck' and (
            (make = 'Ford' and model in ('Ranger', 'F-150'))
            or (make = 'Nissan' and model = 'Frontier')
            or (make = 'Toyota' and model = 'Tacoma')
            or (
                make = 'Ram' and model in ('1500', '1500 Classic', '2500', '3500')
            )
            or (
                make = 'Dodge' and model in (
                    'RAM', 'RAM 150', 'RAM 250', 'RAM 350',
                    'Ram Pickup 1500', 'Ram Pickup 2500', 'Ram Pickup 3500'
                )
            )
        )
        order by vehicle_id
        """
    )
    return [Vehicle(*row) for row in cursor.fetchall()]


def print_plan(existing: list[ExistingPlan], copies: list[CopyPlan]):
    print(f"existing rows to classify/reset : {len(existing)}")
    print(f"new physical cab rows to insert: {len(copies)}")
    print("\nexisting row outcomes:")
    for (cab, variant), count in sorted(
        collections.Counter((p.cab_type, p.variant) for p in existing).items()
    ):
        print(f"  {count:5}  {cab:6} {variant}")
    print("\ninserted row outcomes:")
    for (cab, variant), count in sorted(
        collections.Counter((p.cab_type, p.variant) for p in copies).items()
    ):
        print(f"  {count:5}  {cab:6} {variant}")
    print("\ncopy reasons:")
    for reason, count in sorted(collections.Counter(p.reason for p in copies).items()):
        print(f"  {count:5}  {reason}")


def table_exists(cursor, table: str) -> bool:
    cursor.execute("select to_regclass(%s)", (f"public.{table}",))
    return cursor.fetchone()[0] is not None


def validate(cursor):
    checks = [
        (
            "target rows without physical variant",
            """
            select count(*) from vehicles where body_style='Truck'
            and cargo_body_variant is null and (
              (make='Ford' and model in ('Ranger','F-150'))
              or (make='Nissan' and model='Frontier')
              or (make='Toyota' and model='Tacoma')
              or (make='Ram' and model in ('1500','1500 Classic','2500','3500'))
              or (make='Dodge' and model in (
                'RAM','RAM 150','RAM 250','RAM 350',
                'Ram Pickup 1500','Ram Pickup 2500','Ram Pickup 3500'))
            )
            """,
            0,
        ),
        (
            "Frontier 2005+ years missing King or Crew Cab",
            """
            select count(*) from (
              select year from vehicles where make='Nissan' and model='Frontier'
              and year between 2005 and 2026
              group by year
              having not (
                bool_or(cargo_body_variant='King Cab')
                and bool_or(cargo_body_variant='Crew Cab')
              )
            ) x
            """,
            0,
        ),
        (
            "Tacoma 2005-2023 years missing Access or Double Cab",
            """
            select count(*) from (
              select year from vehicles where make='Toyota' and model='Tacoma'
              and year between 2005 and 2023
              group by year
              having not (
                bool_or(cargo_body_variant='Access Cab')
                and bool_or(cargo_body_variant='Double Cab')
              )
            ) x
            """,
            0,
        ),
        (
            "F-150 2001+ years missing SuperCab or SuperCrew",
            """
            select count(*) from (
              select year from vehicles where make='Ford' and model='F-150'
              and year between 2001 and 2026
              group by year
              having not (
                bool_or(cargo_body_variant='SuperCab')
                and bool_or(cargo_body_variant='SuperCrew')
              )
            ) x
            """,
            0,
        ),
        (
            "Ram 2500/3500 2011+ years missing Crew or Mega Cab",
            """
            select count(*) from (
              select make,model,year from vehicles
              where make='Ram' and model in ('2500','3500') and year between 2011 and 2026
              group by make,model,year
              having not (
                bool_or(cargo_body_variant='Crew Cab')
                and bool_or(cargo_body_variant='Mega Cab')
              )
            ) x
            """,
            0,
        ),
    ]
    print("\nvalidation:")
    for label, query, expected in checks:
        cursor.execute(query)
        actual = cursor.fetchone()[0]
        print(f"  {actual:5}  {label}")
        if actual != expected:
            raise RuntimeError(f"validation failed: {label}: {actual} != {expected}")


def apply(connection, vehicles: list[Vehicle], existing: list[ExistingPlan], copies: list[CopyPlan]):
    cursor = connection.cursor()
    cursor.execute("lock table vehicles in share row exclusive mode")

    if table_exists(cursor, ARCHIVE_TABLE) or table_exists(cursor, INSERT_MAP_TABLE):
        raise RuntimeError(
            f"{ARCHIVE_TABLE} or {INSERT_MAP_TABLE} already exists; refusing a second application"
        )

    cursor.execute(
        sql.SQL(
            "create table {} as select v.*, null::text as archive_reason, "
            "null::timestamptz as archived_at from vehicles v where false"
        ).format(sql.Identifier(ARCHIVE_TABLE))
    )
    cursor.execute(
        sql.SQL(
            "create table {} (vehicle_id integer primary key, source_vehicle_id integer not null, "
            "insert_reason text not null, inserted_at timestamptz not null default now())"
        ).format(sql.Identifier(INSERT_MAP_TABLE))
    )

    cursor.execute(
        """
        create temp table truck_existing_plan (
          vehicle_id integer primary key, new_cab text not null,
          new_variant text not null, reason text not null
        ) on commit drop
        """
    )
    execute_values(
        cursor,
        "insert into truck_existing_plan (vehicle_id,new_cab,new_variant,reason) values %s",
        [(p.vehicle_id, p.cab_type, p.variant, p.reason) for p in existing],
    )

    cursor.execute(
        sql.SQL(
            "insert into {} select v.*, p.reason, now() from vehicles v "
            "join truck_existing_plan p using (vehicle_id)"
        ).format(sql.Identifier(ARCHIVE_TABLE))
    )
    archived = cursor.rowcount
    if archived != len(existing):
        raise RuntimeError(f"archive count mismatch: {archived} != {len(existing)}")

    cursor.execute("select max(vehicle_id) from vehicles")
    first_id = cursor.fetchone()[0] + 1
    copy_rows = [
        (p.source_vehicle_id, first_id + index, p.cab_type, p.variant, p.doors, p.reason)
        for index, p in enumerate(copies)
    ]
    cursor.execute(
        """
        create temp table truck_copy_plan (
          source_vehicle_id integer not null, new_vehicle_id integer primary key,
          new_cab text not null, new_variant text not null, new_doors integer,
          reason text not null
        ) on commit drop
        """
    )
    execute_values(
        cursor,
        """
        insert into truck_copy_plan
          (source_vehicle_id,new_vehicle_id,new_cab,new_variant,new_doors,reason)
        values %s
        """,
        copy_rows,
    )

    cursor.execute(
        """
        update vehicles v
        set cab_type=p.new_cab,
            cargo_body_variant=p.new_variant,
            behind_seat_install_supported=null,
            behind_seat_depth_in=null,
            boot_width_in=null, boot_depth_in=null, boot_height_in=null,
            opening_width_in=null, opening_height_in=null,
            dims_status=null, dims_source_url=null, dims_quote=null,
            dims_confidence=null, dims_config=null, dims_taper_note=null,
            dims_checked_at=null
        from truck_existing_plan p
        where v.vehicle_id=p.vehicle_id
        """
    )
    updated = cursor.rowcount
    if updated != len(existing):
        raise RuntimeError(f"update count mismatch: {updated} != {len(existing)}")

    cursor.execute(
        "select column_name from information_schema.columns "
        "where table_schema='public' and table_name='vehicles' order by ordinal_position"
    )
    columns = [row[0] for row in cursor.fetchall()]
    select_expressions = []
    for column in columns:
        if column == "vehicle_id":
            select_expressions.append(sql.SQL("p.new_vehicle_id"))
        elif column == "cab_type":
            select_expressions.append(sql.SQL("p.new_cab"))
        elif column == "cargo_body_variant":
            select_expressions.append(sql.SQL("p.new_variant"))
        elif column == "doors":
            select_expressions.append(sql.SQL("coalesce(p.new_doors,v.doors)"))
        elif column in DIMENSION_FIELDS:
            select_expressions.append(sql.SQL("null"))
        else:
            select_expressions.append(sql.SQL("v.{}").format(sql.Identifier(column)))

    insert_query = sql.SQL(
        "insert into vehicles ({columns}) "
        "select {expressions} from vehicles v "
        "join truck_copy_plan p on p.source_vehicle_id=v.vehicle_id"
    ).format(
        columns=sql.SQL(",").join(map(sql.Identifier, columns)),
        expressions=sql.SQL(",").join(select_expressions),
    )
    cursor.execute(insert_query)
    inserted = cursor.rowcount
    if inserted != len(copies):
        raise RuntimeError(f"insert count mismatch: {inserted} != {len(copies)}")

    cursor.execute(
        sql.SQL(
            "insert into {} (vehicle_id,source_vehicle_id,insert_reason) "
            "select new_vehicle_id,source_vehicle_id,reason from truck_copy_plan"
        ).format(sql.Identifier(INSERT_MAP_TABLE))
    )

    validate(cursor)
    cursor.execute(
        sql.SQL("select count(*) from {}").format(sql.Identifier(ARCHIVE_TABLE))
    )
    print(f"\narchived existing rows : {cursor.fetchone()[0]}")
    cursor.execute(
        sql.SQL("select count(*) from {}").format(sql.Identifier(INSERT_MAP_TABLE))
    )
    print(f"recorded inserted rows : {cursor.fetchone()[0]}")
    print(f"updated existing rows  : {updated}")
    print(f"inserted new rows      : {inserted}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()

    connection = db_connection()
    connection.autocommit = False
    cursor = connection.cursor()
    vehicles = read_scope(cursor)
    if not vehicles:
        raise RuntimeError("controlled scope returned no vehicles")

    cursor.execute(
        """
        select count(*) from vehicles
        where cargo_body_variant is not null and vehicle_id = any(%s)
        """,
        ([vehicle.vehicle_id for vehicle in vehicles],),
    )
    already_classified = cursor.fetchone()[0]
    if already_classified:
        raise RuntimeError(
            f"{already_classified} controlled rows already have cargo_body_variant; "
            "refusing to stack a second correction"
        )

    existing = [classify_existing(vehicle) for vehicle in vehicles]
    copies = [plan for vehicle in vehicles for plan in copy_plans(vehicle)]
    print_plan(existing, copies)

    if not args.write:
        connection.rollback()
        print("\nDRY RUN — no database rows changed. Pass --write to apply one transaction.")
        return

    try:
        apply(connection, vehicles, existing, copies)
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()
    print("\nCOMMITTED — controlled truck cab correction complete.")


if __name__ == "__main__":
    main()
