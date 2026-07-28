#!/usr/bin/env python3
"""Correct the live vehicle W/D/H dimension defects found by the QA review.

The customer-facing contract is deliberately limited to:

* boot_width_in
* boot_depth_in
* boot_height_in

Existing source URL/quote fields are retained only as internal provenance.
The script is read-only unless invoked with ``--write``. A write archives every
changed vehicle row in Postgres and applies all changes in one transaction.
"""

from __future__ import annotations

import collections
import os
import sys
from dataclasses import dataclass

import psycopg2
from psycopg2.extras import RealDictCursor, execute_values


ARCHIVE_TABLE = "vehicles_dimension_qa_archive_20260728"

HEIGHT_BY_BODY_STYLE = {
    "Convertible": 13.0,
    "Coupe": 15.0,
    "Hatchback": 23.0,
    "Minivan": 23.0,
    "SUV / Crossover": 23.0,
    "Sedan": 19.0,
    "Wagon": 23.0,
}

# Exact physical-family corrections selected from the directly sourced value.
FAMILY_CORRECTIONS = {
    ("Mazda", "CX-5", "2017-2025", "", "SUV / Crossover"):
        (41.3, 37.6, 23.0),
    ("Land Rover", "Defender", "2020-2027", "Defender 110",
     "SUV / Crossover"):
        (45.7, 36.2, 23.0),
    ("Toyota", "Land Cruiser", "1960-1983", "40 Series short body",
     "SUV / Crossover"):
        (40.0, 27.0, 23.0),
}


@dataclass(frozen=True)
class Change:
    vehicle_id: int
    width: float | None
    depth: float | None
    height: float | None
    source_url: str | None
    quote: str | None
    reason: str


def connect():
    env = {}
    with open(os.path.expanduser("~/.config/directus-render.env")) as handle:
        for line in handle:
            if "=" in line:
                key, value = line.split("=", 1)
                env[key.strip()] = value.strip()
    return psycopg2.connect(env["DATABASE_URL"])


def family_key(row):
    return (
        row["make"],
        row["model"],
        row["generation"] or "",
        row["cargo_body_variant"] or "",
        row["body_style"] or "",
    )


def complete(row):
    return all(
        row[column] is not None
        for column in ("boot_width_in", "boot_depth_in", "boot_height_in")
    )


def load_rows(cursor):
    cursor.execute(
        """
        select vehicle_id, make, model, generation, cargo_body_variant,
               body_style, boot_width_in, boot_depth_in, boot_height_in,
               dims_config, dims_source_url, dims_quote
        from vehicles
        """
    )
    return cursor.fetchall()


def direct_donors(rows):
    donors = {}
    for key, dimensions in FAMILY_CORRECTIONS.items():
        candidates = [
            row for row in rows
            if family_key(row) == key
            and (
                row["boot_width_in"],
                row["boot_depth_in"],
                row["boot_height_in"],
            ) == dimensions
            and row["dims_source_url"]
        ]
        if not candidates:
            raise RuntimeError(f"No sourced donor exists for {key} -> {dimensions}")
        donors[key] = candidates[0]
    return donors


def build_changes(rows):
    donors = direct_donors(rows)
    changes = []

    for row in rows:
        key = family_key(row)
        old_dimensions = (
            row["boot_width_in"],
            row["boot_depth_in"],
            row["boot_height_in"],
        )

        # These measurements explicitly describe the seats-folded cavity. They
        # must not satisfy the seats-up product-fit contract.
        if complete(row) and row["dims_config"] == "seats down":
            changes.append(
                Change(
                    row["vehicle_id"], None, None, None,
                    row["dims_source_url"], row["dims_quote"],
                    "remove seats-down dimensions from seats-up W/D/H",
                )
            )
            continue

        if key in FAMILY_CORRECTIONS:
            dimensions = FAMILY_CORRECTIONS[key]
            donor = donors[key]
            if (
                old_dimensions != dimensions
                or row["dims_source_url"] != donor["dims_source_url"]
                or row["dims_quote"] != donor["dims_quote"]
            ):
                changes.append(
                    Change(
                        row["vehicle_id"], *dimensions,
                        donor["dims_source_url"], donor["dims_quote"],
                        "resolve exact physical-family dimension conflict",
                    )
                )
            continue

        expected_height = HEIGHT_BY_BODY_STYLE.get(row["body_style"])
        if (
            complete(row)
            and expected_height is not None
            and row["boot_height_in"] != expected_height
        ):
            changes.append(
                Change(
                    row["vehicle_id"],
                    row["boot_width_in"],
                    row["boot_depth_in"],
                    expected_height,
                    row["dims_source_url"],
                    row["dims_quote"],
                    "normalize height to floor-to-seatback body-class policy",
                )
            )

    return changes


def summarize(rows, changes):
    grouped = collections.Counter(change.reason for change in changes)
    changed_ids = {change.vehicle_id for change in changes}
    before_complete = sum(1 for row in rows if complete(row))
    print(f"live vehicle rows            {len(rows):>8}")
    print(f"complete W/D/H rows before   {before_complete:>8}")
    print(f"rows planned for correction  {len(changes):>8}")
    print(f"unique planned vehicle IDs   {len(changed_ids):>8}")
    for reason, count in sorted(grouped.items()):
        print(f"  {count:>6}  {reason}")


def create_plan(cursor, changes):
    cursor.execute(
        """
        create temporary table dimension_fix_plan (
            vehicle_id integer primary key,
            new_width double precision,
            new_depth double precision,
            new_height double precision,
            new_source_url text,
            new_quote text,
            correction_reason text not null
        ) on commit drop
        """
    )
    execute_values(
        cursor,
        """
        insert into dimension_fix_plan (
            vehicle_id, new_width, new_depth, new_height,
            new_source_url, new_quote, correction_reason
        ) values %s
        """,
        [
            (
                change.vehicle_id, change.width, change.depth, change.height,
                change.source_url, change.quote, change.reason,
            )
            for change in changes
        ],
    )


def archive(cursor):
    cursor.execute(
        f"""
        create table if not exists {ARCHIVE_TABLE} as
        select v.*, null::text as correction_reason,
               null::timestamptz as archived_at
        from vehicles v
        where false
        """
    )
    cursor.execute(
        f"""
        insert into {ARCHIVE_TABLE}
        select v.*, p.correction_reason, now()
        from vehicles v
        join dimension_fix_plan p using (vehicle_id)
        where not exists (
            select 1
            from {ARCHIVE_TABLE} archived
            where archived.vehicle_id = v.vehicle_id
        )
        """
    )
    return cursor.rowcount


def apply(cursor):
    cursor.execute(
        """
        update vehicles v
        set boot_width_in = p.new_width,
            boot_depth_in = p.new_depth,
            boot_height_in = p.new_height,
            dims_source_url = p.new_source_url,
            dims_quote = p.new_quote
        from dimension_fix_plan p
        where v.vehicle_id = p.vehicle_id
        """
    )
    return cursor.rowcount


def validation(rows):
    all_groups = collections.defaultdict(list)
    groups = collections.defaultdict(list)
    for row in rows:
        all_groups[family_key(row)].append(row)
        if complete(row):
            groups[family_key(row)].append(row)

    conflicts = {
        key for key, members in groups.items()
        if len({
            (
                row["boot_width_in"],
                row["boot_depth_in"],
                row["boot_height_in"],
            )
            for row in members
        }) > 1
    }
    height_outliers = {
        key for key, members in groups.items()
        if any(
            row["body_style"] in HEIGHT_BY_BODY_STYLE
            and row["boot_height_in"] != HEIGHT_BY_BODY_STYLE[row["body_style"]]
            for row in members
        )
    }
    seats_down_complete = sum(
        1 for row in rows if complete(row) and row["dims_config"] == "seats down"
    )
    fully_complete = {
        key for key, members in all_groups.items()
        if all(complete(row) for row in members)
    }
    partly_complete = {
        key for key, members in all_groups.items()
        if any(complete(row) for row in members)
        and not all(complete(row) for row in members)
    }
    unresolved = set(all_groups) - set(groups)
    unresolved_by_body = collections.Counter(key[4] or "blank" for key in unresolved)

    print("\nVALIDATION")
    print(f"all physical families             {len(all_groups):>6}")
    print(f"complete W/D/H physical families  {len(groups):>6}")
    print(f"fully propagated complete families {len(fully_complete):>5}")
    print(f"partly propagated families         {len(partly_complete):>5}")
    print(f"families with no complete W/D/H    {len(unresolved):>5}")
    print(f"within-family W/D/H conflicts      {len(conflicts):>6}")
    print(f"body-class height violations       {len(height_outliers):>6}")
    print(f"complete seats-down rows           {seats_down_complete:>6}")
    print(f"unresolved by body style           {dict(unresolved_by_body)}")
    if conflicts or height_outliers or seats_down_complete:
        raise RuntimeError("dimension validation failed")


def main():
    write = "--write" in sys.argv
    connection = connect()
    connection.autocommit = False
    try:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            rows = load_rows(cursor)
            changes = build_changes(rows)
            summarize(rows, changes)

            if not write:
                validation(rows)
                connection.rollback()
                print("\nDRY RUN — no Directus rows changed.")
                return

            if not changes:
                validation(rows)
                connection.rollback()
                print("\nNo changes required.")
                return

            cursor.execute("lock table vehicles in share row exclusive mode")
            create_plan(cursor, changes)
            archived = archive(cursor)
            updated = apply(cursor)
            if updated != len(changes):
                raise RuntimeError(
                    f"updated {updated} rows but planned {len(changes)}"
                )

            post_rows = load_rows(cursor)
            validation(post_rows)
            connection.commit()
            print(f"\narchived original rows  {archived}")
            print(f"updated Directus rows   {updated}")
            print("COMMITTED")
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


if __name__ == "__main__":
    main()
