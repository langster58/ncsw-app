#!/usr/bin/env python3
"""Estimate missing cargo dimensions from concrete completed vehicle families.

This is deliberately a database-only process. It does not search the web or
call a model. Source-backed dimensions may be donors; prior analog estimates
may not, which prevents estimates from recursively turning into evidence.

Comparison order:
    1. Same make, model, body form, and cargo variant in the nearest generation.
    2. A directly related same-make model line with matching body form.
    3. Multiple same-make vehicles with the same body form, segment, side-door
       arrangement, similar cargo volume, and nearby model years.
    4. Multiple cross-make peers satisfying the same physical constraints.
    5. The nearest single physical peer when no agreeing cluster exists.

Two-seat cars and convertibles require a same-model donor because their cargo
geometry is unusually dependent on drivetrain or roof packaging.

The default mode is a dry run. Use --apply only after reviewing its summary.
"""

from __future__ import annotations

import argparse
import itertools
import math
import re
from dataclasses import dataclass, replace
from pathlib import Path
from statistics import median

import psycopg2


HEIGHT_BY_BODY_STYLE = {
    "Convertible": 13.0,
    "Coupe": 15.0,
    "Hatchback": 23.0,
    "Minivan": 23.0,
    "Sedan": 19.0,
    "SUV / Crossover": 23.0,
    "Wagon": 23.0,
}

# Hand-reviewed corrections for partial families where the generic nearest
# neighbor is visibly the wrong physical comparison. A None value preserves
# the already sourced dimension.
PARTIAL_OVERRIDES = {
    (
        "GMC",
        "Yukon",
        "SUV / Crossover",
        "2007-2014",
        "standard",
    ): (
        49.0,
        None,
        "Same GMT900 wheelhouse geometry as adjacent Yukon and Tahoe "
        "generations, which consistently report 49 inches between the "
        "wheelhousings.",
    ),
    (
        "GMC",
        "Yukon XL",
        "SUV / Crossover",
        "2007-2014",
        "standard",
    ): (
        49.0,
        None,
        "Same GMT900 extended-body cargo shell as the Chevrolet Suburban; "
        "the source-backed 2001-2006 and 2015-2020 Suburban families both "
        "report 49 inches between the wheelhousings.",
    ),
    (
        "Isuzu",
        "Rodeo",
        "SUV / Crossover",
        "1991-1997",
        "standard",
    ): (
        40.0,
        None,
        "Same-era Isuzu Trooper physical analog; its source-backed cargo "
        "floor is 40 W x 35 D inches.",
    ),
    (
        "Isuzu",
        "Rodeo",
        "SUV / Crossover",
        "1998-2004",
        "standard",
    ): (
        40.0,
        None,
        "Same-era Isuzu Trooper physical analog; its source-backed cargo "
        "floor is 40 W x 35 D inches.",
    ),
    (
        "Jeep",
        "Grand Cherokee L",
        "SUV / Crossover",
        "2021-2027",
        "standard",
    ): (
        44.0,
        19.0,
        "Three-row midsize analog: the source-backed 2023-2026 Honda Pilot "
        "cargo floor is 44 W x 19 D inches behind the upright third row. "
        "This replaces the prior seats-down Grand Cherokee L depth.",
    ),
    (
        "Jeep",
        "Patriot",
        "SUV / Crossover",
        "2007-2017",
        "standard",
    ): (
        None,
        32.0,
        "Same-width Jeep Compass analog: the source-backed Compass cargo "
        "floor is 38.1 W x 32.2 D inches.",
    ),
    (
        "Nissan",
        "Armada",
        "SUV / Crossover",
        "2025-2027",
        "standard",
    ): (
        None,
        20.0,
        "The 2025 Armada has 20.4 cu ft behind its upright third row; a "
        "20-inch working depth is consistent with the preceding Armada's "
        "owner-measured 20.3-inch cargo floor.",
    ),
    (
        "Nissan",
        "Murano",
        "SUV / Crossover",
        "2008-2014",
        "standard",
    ): (
        45.0,
        None,
        "Cars.com reports 45 inches between the wheelhousings for the 2014 "
        "Murano: https://www.cars.com/research/compare/?vehicles="
        "nissan-murano-2014%2Cnissan-murano-2015",
    ),
    (
        "Nissan",
        "Murano CrossCabriolet",
        "SUV / Crossover",
        "2011-2014",
        "standard",
    ): (
        45.0,
        None,
        "The CrossCabriolet shares the same-generation Murano cargo-floor "
        "width; Cars.com reports 45 inches between the 2014 Murano "
        "wheelhousings.",
    ),
    (
        "Nissan",
        "Rogue Select",
        "SUV / Crossover",
        "2008-2015",
        "standard",
    ): (
        41.0,
        None,
        "Compact-crossover analog: the source-backed Ford Escape cargo floor "
        "is 41.4 W x 37.8 D inches, matching the Rogue Select's sourced "
        "37.8-inch depth.",
    ),
}

UNIQUE_WITHOUT_SAME_MODEL = {"Convertible"}

UNIQUE_MODEL_NAMES = {
    ("Acura", "NSX"),
    ("Alfa Romeo", "4C"),
    ("Audi", "R8"),
    ("BMW", "i8"),
    ("Chevrolet", "Corvette"),
    ("Dodge", "Viper"),
    ("Ford", "GT"),
    ("Honda", "S2000"),
    ("Jaguar", "F-TYPE"),
    ("Mazda", "MX-5 Miata"),
    ("Mercedes-Benz", "AMG GT"),
    ("Mercedes-Benz", "SLS AMG"),
    ("Nissan", "350Z"),
    ("Nissan", "370Z"),
    ("Nissan", "GT-R"),
    ("Porsche", "718"),
    ("Porsche", "911"),
    ("Porsche", "Boxster"),
    ("Porsche", "Cayman"),
    ("Toyota", "86"),
    ("Toyota", "GR86"),
    ("Toyota", "Supra"),
}

UNIQUE_MAKES = {
    "Aston Martin",
    "Ferrari",
    "Lamborghini",
    "Lotus",
    "Maserati",
    "McLaren",
}


@dataclass(frozen=True)
class Family:
    make: str
    model: str
    body_style: str
    generation: str
    variant: str
    year_start: int
    year_end: int
    rows: int
    doors: frozenset[int]
    configs: frozenset[str]
    segment: str
    volume: float | None
    passenger_volume: float | None
    width: float | None
    depth: float | None
    height: float | None
    source_width: float | None
    source_depth: float | None
    source_rows: int

    @property
    def key(self) -> tuple[str, str, str, str, str]:
        return (
            self.make,
            self.model,
            self.body_style,
            self.generation,
            self.variant,
        )

    @property
    def midpoint(self) -> float:
        return (self.year_start + self.year_end) / 2

    @property
    def has_source_dimensions(self) -> bool:
        return (
            self.source_rows > 0
            and self.source_width is not None
            and self.source_depth is not None
        )

    @property
    def missing_both(self) -> bool:
        return self.width is None and self.depth is None


@dataclass(frozen=True)
class Estimate:
    target: Family
    width: float
    depth: float
    height: float
    method: str
    donors: tuple[Family, ...]
    note: str


def load_key_values(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip("'\"")
    return values


def database_connection():
    values = load_key_values(Path.home() / ".config" / "directus-render.env")
    return psycopg2.connect(values["DATABASE_URL"])


def read_families(connection) -> list[Family]:
    cursor = connection.cursor()
    cursor.execute(
        """
        select make, model, body_style, generation,
               coalesce(nullif(trim(cargo_body_variant), ''), 'standard')
                   as variant,
               min(year)::int, max(year)::int, count(*)::int,
               array_remove(array_agg(distinct doors order by doors), null),
               array_remove(array_agg(distinct dims_config), null),
               mode() within group (order by segment),
               percentile_cont(.5) within group (
                   order by luggage_volume_cuft
               ),
               max(passenger_volume_cuft),
               percentile_cont(.5) within group (
                   order by boot_width_in
               ),
               percentile_cont(.5) within group (
                   order by boot_depth_in
               ),
               percentile_cont(.5) within group (
                   order by boot_height_in
               ),
               percentile_cont(.5) within group (
                   order by boot_width_in
               ) filter (
                   where boot_width_in is not null
                     and boot_depth_in is not null
                     and coalesce(dims_quote, '')
                         not like 'ANALOG ESTIMATE —%%'
                     and coalesce(dims_taper_note, '')
                         not like '%%Partial analog completion —%%'
                     and coalesce(dims_config, '')
                         in ('seats_up', 'seats up')
               ) as source_width,
               percentile_cont(.5) within group (
                   order by boot_depth_in
               ) filter (
                   where boot_width_in is not null
                     and boot_depth_in is not null
                     and coalesce(dims_quote, '')
                         not like 'ANALOG ESTIMATE —%%'
                     and coalesce(dims_taper_note, '')
                         not like '%%Partial analog completion —%%'
                     and coalesce(dims_config, '')
                         in ('seats_up', 'seats up')
               ) as source_depth,
               count(*) filter (
                   where boot_width_in is not null
                     and boot_depth_in is not null
                     and coalesce(dims_quote, '')
                         not like 'ANALOG ESTIMATE —%%'
                     and coalesce(dims_taper_note, '')
                         not like '%%Partial analog completion —%%'
                     and coalesce(dims_config, '')
                         in ('seats_up', 'seats up')
               )::int as source_rows
          from vehicles
         where body_style <> 'Truck'
           and generation ~ '^[0-9]{4}-[0-9]{4}$'
         group by make, model, body_style, generation,
                  coalesce(
                      nullif(trim(cargo_body_variant), ''),
                      'standard'
                  )
         order by make, model, generation, body_style, variant
        """
    )
    families = []
    for row in cursor.fetchall():
        (
            make,
            model,
            body_style,
            generation,
            variant,
            year_start,
            year_end,
            rows,
            doors,
            configs,
            segment,
            volume,
            passenger_volume,
            width,
            depth,
            height,
            source_width,
            source_depth,
            source_rows,
        ) = row
        families.append(
            Family(
                make=make,
                model=model,
                body_style=body_style,
                generation=generation,
                variant=variant,
                year_start=year_start,
                year_end=year_end,
                rows=rows,
                doors=frozenset(doors or []),
                configs=frozenset(configs or []),
                segment=segment,
                volume=float(volume) if volume is not None else None,
                passenger_volume=(
                    float(passenger_volume)
                    if passenger_volume is not None
                    else None
                ),
                width=float(width) if width is not None else None,
                depth=float(depth) if depth is not None else None,
                height=float(height) if height is not None else None,
                source_width=(
                    float(source_width) if source_width is not None else None
                ),
                source_depth=(
                    float(source_depth) if source_depth is not None else None
                ),
                source_rows=source_rows,
            )
        )
    return families


def doors_match(left: Family, right: Family) -> bool:
    return not left.doors or not right.doors or bool(left.doors & right.doors)


def volume_difference(left: Family, right: Family) -> float:
    if left.volume is None or right.volume is None:
        return math.inf
    return abs(left.volume - right.volume)


def year_distance(left: Family, right: Family) -> float:
    return abs(left.midpoint - right.midpoint)


def passenger_volume_difference(left: Family, right: Family) -> float:
    if left.passenger_volume is None or right.passenger_volume is None:
        return 0
    return abs(left.passenger_volume - right.passenger_volume)


def conservative_half(value: float) -> float:
    return math.floor(value * 2 + 1e-9) / 2


def related_model_token(make: str, model: str) -> str:
    text = re.sub(r"\s+", " ", model.strip())
    if make == "Audi":
        lowered = text.lower()
        if "e-tron" in lowered:
            if lowered == "e-tron":
                return "q8 e-tron"
            if lowered == "e-tron sportback":
                return "q8 sportback e-tron"
            match = re.search(r"\b(q\d)\b", lowered)
            if match:
                sportback = " sportback" if "sportback" in lowered else ""
                return f"{match.group(1)}{sportback} e-tron"
        compact = text.replace(" ", "")
        match = re.fullmatch(r"RSQ(\d)", compact, re.I)
        if match:
            return f"q{match.group(1)}"
        match = re.fullmatch(r"SQ(\d)", compact, re.I)
        if match:
            return f"q{match.group(1)}"
        match = re.fullmatch(r"RS(\d)", compact, re.I)
        if match:
            return f"a{match.group(1)}"
        match = re.fullmatch(r"S(\d)", compact, re.I)
        if match:
            return f"a{match.group(1)}"
        match = re.search(r"\b([AQ]\d)\b", text, re.I)
        if match:
            return match.group(1).lower()
    if make == "BMW":
        match = re.fullmatch(r"M(\d)", text, re.I)
        if match:
            return f"{match.group(1)} series"
        match = re.fullmatch(r"(X\d) M", text, re.I)
        if match:
            return match.group(1).lower()
        match = re.match(r"(\d) Series", text, re.I)
        if match:
            return f"{match.group(1)} series"
        match = re.match(r"(X\d)\b", text, re.I)
        if match:
            return match.group(1).lower()
    if make == "Lexus":
        match = re.fullmatch(r"(IS|GS|RC|LC) F", text, re.I)
        if match:
            return match.group(1).lower()
    normalized = re.sub(
        r"\b(?:hybrid|plug-in hybrid|sportback|coupe|wagon)\b",
        "",
        text,
        flags=re.I,
    )
    return re.sub(r"[^a-z0-9]+", " ", normalized.lower()).strip()


def donor_label(donor: Family) -> str:
    return (
        f"{donor.make} {donor.model} {donor.generation} "
        f"{donor.source_width:g}x{donor.source_depth:g}"
    )


def is_unique_model(target: Family) -> bool:
    if target.make in UNIQUE_MAKES:
        return True
    target_model = target.model.lower()
    return any(
        target.make == make
        and (
            target_model == model.lower()
            or target_model.startswith(f"{model.lower()} ")
        )
        for make, model in UNIQUE_MODEL_NAMES
    )


def nearest_by_model(
    target: Family,
    donors: list[Family],
    families: list[Family],
) -> Estimate | None:
    matches = [
        donor
        for donor in donors
        if donor.make == target.make
        and donor.model == target.model
        and donor.body_style == target.body_style
        and donor.variant == target.variant
        and doors_match(target, donor)
    ]
    if not matches:
        return None
    lineage = sorted(
        [
            family
            for family in families
            if family.make == target.make
            and family.model == target.model
            and family.body_style == target.body_style
            and family.variant == target.variant
            and doors_match(target, family)
        ],
        key=lambda item: (item.midpoint, item.generation),
    )
    target_index = lineage.index(target)
    positions = {family.key: index for index, family in enumerate(lineage)}
    matches = [
        donor
        for donor in matches
        if abs(positions[donor.key] - target_index) <= 2
        and year_distance(target, donor) <= 12
    ]
    if not matches:
        return None
    donor = min(
        matches,
        key=lambda item: (
            year_distance(target, item),
            volume_difference(target, item),
            item.generation,
        ),
    )
    width = conservative_half(donor.source_width)
    depth = conservative_half(donor.source_depth)
    height = HEIGHT_BY_BODY_STYLE[target.body_style]
    note = (
        "Same make, model, body form, cargo variant, and side-door "
        f"arrangement. Nearest completed generation: {donor_label(donor)}; "
        f"generation midpoint difference {year_distance(target, donor):g} "
        "years."
    )
    return Estimate(
        target=target,
        width=width,
        depth=depth,
        height=height,
        method="same_model_adjacent_generation",
        donors=(donor,),
        note=note,
    )


def related_model_estimate(
    target: Family,
    donors: list[Family],
) -> Estimate | None:
    token = related_model_token(target.make, target.model)
    matches = [
        donor
        for donor in donors
        if donor.make == target.make
        and donor.model != target.model
        and related_model_token(donor.make, donor.model) == token
        and donor.body_style == target.body_style
        and donor.variant == target.variant
        and doors_match(target, donor)
        and year_distance(target, donor) <= 12
    ]
    if not matches:
        return None
    donor = min(
        matches,
        key=lambda item: (
            year_distance(target, item),
            volume_difference(target, item),
            item.generation,
        ),
    )
    width = conservative_half(donor.source_width)
    depth = conservative_half(donor.source_depth)
    height = HEIGHT_BY_BODY_STYLE[target.body_style]
    note = (
        "Same-make model-line sibling with the same body form, cargo variant, "
        f"and side-door arrangement: {donor_label(donor)}. The target and donor "
        f"model years differ by {year_distance(target, donor):g} years at their "
        "generation midpoints."
    )
    return Estimate(
        target=target,
        width=width,
        depth=depth,
        height=height,
        method="same_model_line_sibling",
        donors=(donor,),
        note=note,
    )


def deduplicate_models(
    target: Family,
    candidates: list[Family],
) -> list[Family]:
    closest: dict[tuple[str, str], Family] = {}
    for candidate in candidates:
        key = (candidate.make, candidate.model)
        existing = closest.get(key)
        rank = (
            volume_difference(target, candidate),
            year_distance(target, candidate),
        )
        if existing is None or rank < (
            volume_difference(target, existing),
            year_distance(target, existing),
        ):
            closest[key] = candidate
    return list(closest.values())


def coherent_cluster(
    target: Family,
    candidates: list[Family],
    minimum: int,
    max_width_spread: float,
    max_depth_spread: float,
) -> list[Family]:
    candidates = deduplicate_models(target, candidates)
    candidates.sort(
        key=lambda item: (
            volume_difference(target, item),
            year_distance(target, item),
            item.make,
            item.model,
        )
    )
    candidates = candidates[:12]
    best: list[Family] = []
    best_rank: tuple[int, float] | None = None
    for size in range(len(candidates), minimum - 1, -1):
        for subset in itertools.combinations(candidates, size):
            widths = [item.source_width for item in subset]
            depths = [item.source_depth for item in subset]
            if max(widths) - min(widths) > max_width_spread:
                continue
            if max(depths) - min(depths) > max_depth_spread:
                continue
            closeness = sum(
            volume_difference(target, item)
            + passenger_volume_difference(target, item) / 5
            + year_distance(target, item) / 10
                for item in subset
            )
            rank = (-len(subset), closeness)
            if best_rank is None or rank < best_rank:
                best = list(subset)
                best_rank = rank
        if best:
            break
    if len(best) < minimum:
        return []
    best.sort(
        key=lambda item: (
            volume_difference(target, item),
            year_distance(target, item),
            item.make,
            item.model,
        )
    )
    return best


def clustered_estimate(
    target: Family,
    donors: list[Family],
    *,
    same_make: bool,
    volume_window: float,
    year_window: float,
    minimum: int,
    method: str,
    max_width_spread: float,
    max_depth_spread: float,
    passenger_volume_window: float,
) -> Estimate | None:
    if target.volume is None:
        return None
    candidates = [
        donor
        for donor in donors
        if donor.body_style == target.body_style
        and donor.segment == target.segment
        and doors_match(target, donor)
        and donor.variant == "standard"
        and (not same_make or donor.make == target.make)
        and volume_difference(target, donor) <= volume_window
        and passenger_volume_difference(target, donor)
            <= passenger_volume_window
        and year_distance(target, donor) <= year_window
        and not (
            donor.make == target.make and donor.model == target.model
        )
    ]
    cluster = coherent_cluster(
        target,
        candidates,
        minimum,
        max_width_spread,
        max_depth_spread,
    )
    if not cluster:
        return None
    widths = [item.source_width for item in cluster]
    depths = [item.source_depth for item in cluster]
    width = conservative_half(median(widths))
    depth = conservative_half(median(depths))
    height = HEIGHT_BY_BODY_STYLE[target.body_style]
    shown = cluster[:4]
    donor_text = "; ".join(donor_label(item) for item in shown)
    width_spread = max(widths) - min(widths)
    depth_spread = max(depths) - min(depths)
    scope = "Same-make" if same_make else "Cross-make"
    note = (
        f"{scope} comparison vehicles share body form, segment, side-door "
        f"arrangement, similar cargo volume ({target.volume:g} cu ft target), "
        "similar passenger-compartment size, "
        f"and nearby model years. Donors: {donor_text}. The comparison cluster "
        f"spans {width_spread:g} inches in width and {depth_spread:g} inches "
        "in depth."
    )
    return Estimate(
        target=target,
        width=width,
        depth=depth,
        height=height,
        method=method,
        donors=tuple(cluster),
        note=note,
    )


def nearest_physical_peer_estimate(
    target: Family,
    donors: list[Family],
) -> Estimate | None:
    """Use the closest concrete donor after the stronger comparisons fail."""

    def eligible(
        donor: Family,
        *,
        volume_window: float,
        passenger_window: float,
        year_window: float,
        require_segment: bool = True,
    ) -> bool:
        if donor.body_style != target.body_style:
            return False
        if require_segment and donor.segment != target.segment:
            return False
        if donor.variant != "standard":
            return False
        # Door count is cargo-relevant for SUV body variants. For cars the
        # body style already distinguishes coupe, sedan, hatchback, and wagon,
        # and historical door-count data is not consistent enough to reject
        # an otherwise strong physical match.
        if (
            target.body_style == "SUV / Crossover"
            and not doors_match(target, donor)
        ):
            return False
        if donor.segment == "two_seat" or is_unique_model(donor):
            return False
        if year_distance(target, donor) > year_window:
            return False
        if (
            target.volume is not None
            and donor.volume is not None
            and volume_difference(target, donor) > volume_window
        ):
            return False
        if (
            target.passenger_volume is not None
            and donor.passenger_volume is not None
            and passenger_volume_difference(target, donor)
                > passenger_window
        ):
            return False
        return True

    candidates = [
        donor
        for donor in donors
        if eligible(
            donor,
            volume_window=6,
            passenger_window=12,
            year_window=20,
        )
    ]
    if not candidates:
        candidates = [
            donor
            for donor in donors
            if eligible(
                donor,
                volume_window=8,
                passenger_window=18,
                year_window=30,
            )
        ]
    if not candidates:
        # Most families reaching this point are historical cars whose catalog
        # size metadata is usable but whose era predates the source-backed
        # donor pool. Keep the physical match exact and allow the year gap to
        # be stated explicitly in the provenance note.
        candidates = [
            donor
            for donor in donors
            if eligible(
                donor,
                volume_window=math.inf,
                passenger_window=math.inf,
                year_window=math.inf,
                require_segment=False,
            )
        ]
    if not candidates:
        return None

    def physical_rank(donor: Family) -> tuple[float, float, float, int, str, str]:
        volume_gap = volume_difference(target, donor)
        passenger_gap = passenger_volume_difference(target, donor)
        year_gap = year_distance(target, donor)
        known_dimension_gap = 0.0
        if target.width is not None:
            known_dimension_gap += abs(target.width - donor.source_width)
        if target.depth is not None:
            known_dimension_gap += abs(target.depth - donor.source_depth)
        combined = (
            volume_gap / 2
            + passenger_gap / 5
            + year_gap / 10
            + known_dimension_gap / 2
        )
        if donor.make == target.make:
            combined -= 0.25
        return (
            combined,
            volume_gap,
            passenger_gap,
            0 if donor.make == target.make else 1,
            donor.make,
            donor.model,
        )

    donor = min(candidates, key=physical_rank)
    width = conservative_half(donor.source_width)
    depth = conservative_half(donor.source_depth)
    height = HEIGHT_BY_BODY_STYLE[target.body_style]

    facts: list[str] = ["same body form"]
    if donor.segment == target.segment:
        facts.append("same catalog size class")
    else:
        facts.append(
            f"target catalog class {target.segment} and donor class "
            f"{donor.segment}"
        )
    if target.body_style == "SUV / Crossover":
        facts.append("same side-door arrangement")
    if target.volume is not None and donor.volume is not None:
        facts.append(
            f"cargo volume differs by "
            f"{volume_difference(target, donor):g} cu ft"
        )
    if (
        target.passenger_volume is not None
        and donor.passenger_volume is not None
    ):
        facts.append(
            "passenger-compartment volume differs by "
            f"{passenger_volume_difference(target, donor):g} cu ft"
        )
    facts.append(
        f"generation midpoint differs by "
        f"{year_distance(target, donor):g} years"
    )
    note = (
        f"Closest completed physical analog in the collection: "
        f"{donor_label(donor)}. Match basis: {', '.join(facts)}."
    )
    return Estimate(
        target=target,
        width=width,
        depth=depth,
        height=height,
        method="nearest_physical_peer",
        donors=(donor,),
        note=note,
    )


def estimate_family(
    target: Family,
    donors: list[Family],
    families: list[Family],
) -> tuple[Estimate | None, str | None]:
    height = HEIGHT_BY_BODY_STYLE.get(target.body_style)
    if height is None:
        return None, "no_height_class"

    same_model = nearest_by_model(target, donors, families)
    if same_model:
        return same_model, None

    related_model = related_model_estimate(target, donors)
    if related_model:
        return related_model, None

    if (
        target.body_style in UNIQUE_WITHOUT_SAME_MODEL
        or target.segment == "two_seat"
        or target.variant != "standard"
        or is_unique_model(target)
    ):
        return None, "unique_without_same_model_donor"

    attempts = (
        dict(
            same_make=True,
            volume_window=2.5,
            year_window=15,
            minimum=2,
            method="same_make_comparison_cluster",
            max_width_spread=3.5,
            max_depth_spread=4.5,
            passenger_volume_window=8,
        ),
        dict(
            same_make=False,
            volume_window=1.5,
            year_window=10,
            minimum=3,
            method="close_peer_comparison_cluster",
            max_width_spread=3,
            max_depth_spread=4,
            passenger_volume_window=5,
        ),
        dict(
            same_make=False,
            volume_window=2,
            year_window=12,
            minimum=4,
            method="broader_peer_comparison_cluster",
            max_width_spread=3,
            max_depth_spread=4,
            passenger_volume_window=8,
        ),
    )
    for attempt in attempts:
        if (
            target.body_style == "SUV / Crossover"
        ):
            continue
        estimate = clustered_estimate(target, donors, **attempt)
        if estimate:
            return estimate, None
    nearest_peer = nearest_physical_peer_estimate(target, donors)
    if nearest_peer:
        return nearest_peer, None
    return None, "no_coherent_comparison_cluster"


def build_estimates(
    families: list[Family],
) -> tuple[list[Estimate], dict[tuple[str, str, str, str, str], str]]:
    donors = [family for family in families if family.has_source_dimensions]
    estimates: list[Estimate] = []
    excluded: dict[tuple[str, str, str, str, str], str] = {}
    for target in families:
        if not target.missing_both:
            continue
        estimate, reason = estimate_family(target, donors, families)
        if estimate:
            estimates.append(estimate)
        else:
            excluded[target.key] = reason or "unknown"
    return estimates, excluded


def build_partial_estimates(
    families: list[Family],
) -> tuple[list[Estimate], dict[tuple[str, str, str, str, str], str]]:
    donors = [family for family in families if family.has_source_dimensions]
    estimates: list[Estimate] = []
    excluded: dict[tuple[str, str, str, str, str], str] = {}
    for target in families:
        if (target.width is None) == (target.depth is None):
            continue
        seats_down = any(
            config.strip().lower().replace("_", " ") == "seats down"
            for config in target.configs
        )
        comparison_target = (
            replace(target, width=None, depth=None)
            if seats_down
            else target
        )
        estimate = nearest_by_model(
            comparison_target,
            donors,
            families,
        )
        if estimate is None:
            estimate = related_model_estimate(comparison_target, donors)
        if estimate is None:
            estimate = nearest_physical_peer_estimate(
                comparison_target,
                donors,
            )
        if estimate is None:
            excluded[target.key] = "no_physical_donor"
            continue
        override = PARTIAL_OVERRIDES.get(target.key)
        if override is not None:
            override_width, override_depth, override_note = override
            estimate = replace(
                estimate,
                width=(
                    override_width
                    if override_width is not None
                    else estimate.width
                ),
                depth=(
                    override_depth
                    if override_depth is not None
                    else estimate.depth
                ),
                method="hand_reviewed_partial",
                note=override_note,
            )
        estimates.append(replace(estimate, target=target))
    return estimates, excluded


def apply_height_defaults(connection, families: list[Family]) -> int:
    cursor = connection.cursor()
    changed = 0
    for body_style, height in HEIGHT_BY_BODY_STYLE.items():
        cursor.execute(
            """
            update vehicles
               set boot_height_in=%s,
                   dims_config=coalesce(dims_config, 'seats_up'),
                   dims_taper_note=case
                       when coalesce(dims_taper_note, '') like
                            '%%Body-class floor-to-seatback standard:%%'
                           then dims_taper_note
                       else concat_ws(
                           ' ',
                           nullif(dims_taper_note, ''),
                           %s
                       )
                   end,
                   dims_checked_at=now()
             where body_style=%s
               and (
                   boot_height_in is null
                   or coalesce(dims_quote, '')
                       like 'ANALOG ESTIMATE —%%'
               )
            """,
            (
                height,
                f"Body-class floor-to-seatback standard: {height:g} inches.",
                body_style,
            ),
        )
        changed += cursor.rowcount
    return changed


def apply_partial_estimates(
    connection,
    estimates: list[Estimate],
) -> int:
    cursor = connection.cursor()
    changed = 0
    for estimate in estimates:
        target = estimate.target
        seats_down = any(
            config.strip().lower().replace("_", " ") == "seats down"
            for config in target.configs
        )
        if seats_down:
            quote = (
                "ANALOG ESTIMATE — Replaced a partial seats-down measurement "
                "with a seats-up working envelope. "
                f"{estimate.note} Assigned working envelope: "
                f"{estimate.width:g} W x {estimate.depth:g} D x "
                f"{estimate.height:g} H inches."
            )
            cursor.execute(
                """
                update vehicles
                   set boot_width_in=%s,
                       boot_depth_in=%s,
                       boot_height_in=%s,
                       dims_status='researched',
                       dims_confidence=null,
                       dims_config='seats_up',
                       dims_source_url=null,
                       dims_quote=%s,
                       dims_checked_at=now(),
                       dims_taper_note=%s
                 where make=%s and model=%s and body_style=%s
                   and generation=%s
                   and coalesce(
                           nullif(trim(cargo_body_variant), ''),
                           'standard'
                       )=%s
                """,
                (
                    estimate.width,
                    estimate.depth,
                    estimate.height,
                    quote,
                    (
                        "Body-class floor-to-seatback standard: "
                        f"{estimate.height:g} inches."
                    ),
                    target.make,
                    target.model,
                    target.body_style,
                    target.generation,
                    target.variant,
                ),
            )
        else:
            known_field = "width" if target.width is not None else "depth"
            known_value = (
                target.width if target.width is not None else target.depth
            )
            filled_field = "width" if target.width is None else "depth"
            filled_value = (
                estimate.width
                if target.width is None
                else estimate.depth
            )
            partial_note = (
                "Partial analog completion — Preserved source-backed "
                f"{known_field} {known_value:g} inches; assigned "
                f"{filled_field} {filled_value:g} inches. {estimate.note}"
            )
            cursor.execute(
                """
                update vehicles
                   set boot_width_in=coalesce(boot_width_in, %s),
                       boot_depth_in=coalesce(boot_depth_in, %s),
                       boot_height_in=coalesce(boot_height_in, %s),
                       dims_status='researched',
                       dims_confidence=null,
                       dims_config=coalesce(dims_config, 'seats_up'),
                       dims_checked_at=now(),
                       dims_taper_note=concat_ws(
                           ' ',
                           nullif(dims_taper_note, ''),
                           %s
                       )
                 where make=%s and model=%s and body_style=%s
                   and generation=%s
                   and coalesce(
                           nullif(trim(cargo_body_variant), ''),
                           'standard'
                       )=%s
                """,
                (
                    estimate.width,
                    estimate.depth,
                    estimate.height,
                    partial_note,
                    target.make,
                    target.model,
                    target.body_style,
                    target.generation,
                    target.variant,
                ),
            )
        if cursor.rowcount != target.rows:
            raise RuntimeError(
                f"{target.key}: expected {target.rows} partial rows, "
                f"updated {cursor.rowcount}"
            )
        changed += cursor.rowcount
    return changed


def apply_estimates(connection, estimates: list[Estimate]) -> int:
    cursor = connection.cursor()
    changed = 0
    for estimate in estimates:
        target = estimate.target
        quote = (
            f"ANALOG ESTIMATE — {estimate.note} "
            f"Assigned working envelope: {estimate.width:g} W x "
            f"{estimate.depth:g} D x {estimate.height:g} H inches."
        )
        cursor.execute(
            """
            update vehicles
               set boot_width_in=%s,
                   boot_depth_in=%s,
                   boot_height_in=%s,
                   dims_status='researched',
                   dims_confidence=null,
                   dims_config='seats_up',
                   dims_source_url=null,
                   dims_quote=%s,
                   dims_checked_at=now(),
                   dims_taper_note=concat(
                       'Body-class floor-to-seatback standard: ',
                       %s,
                       ' inches.'
                   )
             where make=%s and model=%s and body_style=%s
               and generation=%s
               and coalesce(
                       nullif(trim(cargo_body_variant), ''),
                       'standard'
                   )=%s
               and boot_width_in is null
               and boot_depth_in is null
            """,
            (
                estimate.width,
                estimate.depth,
                estimate.height,
                quote,
                f"{estimate.height:g}",
                target.make,
                target.model,
                target.body_style,
                target.generation,
                target.variant,
            ),
        )
        if cursor.rowcount != target.rows:
            raise RuntimeError(
                f"{target.key}: expected {target.rows} rows, "
                f"updated {cursor.rowcount}"
            )
        changed += cursor.rowcount
    return changed


def summarize(
    families: list[Family],
    estimates: list[Estimate],
    excluded: dict[tuple[str, str, str, str, str], str],
) -> None:
    method_counts: dict[str, int] = {}
    body_counts: dict[str, int] = {}
    for estimate in estimates:
        method_counts[estimate.method] = method_counts.get(estimate.method, 0) + 1
        style = estimate.target.body_style
        body_counts[style] = body_counts.get(style, 0) + 1
    reason_counts: dict[str, int] = {}
    for reason in excluded.values():
        reason_counts[reason] = reason_counts.get(reason, 0) + 1

    print(
        {
            "families": len(families),
            "source_backed_donors": sum(
                family.has_source_dimensions for family in families
            ),
            "empty_width_and_depth": sum(
                family.missing_both for family in families
            ),
            "estimated": len(estimates),
            "left_unresolved": len(excluded),
            "methods": method_counts,
            "estimated_by_body_style": body_counts,
            "unresolved_reasons": reason_counts,
        }
    )
    print("\nSAMPLE ESTIMATES")
    for estimate in estimates[:25]:
        print(
            f"{estimate.target.make} {estimate.target.model} "
            f"{estimate.target.generation} [{estimate.target.body_style}] -> "
            f"{estimate.width:g}x{estimate.depth:g}x{estimate.height:g} | "
            f"{estimate.method} | {estimate.note}"
        )
    print("\nSAMPLE UNRESOLVED")
    for key, reason in list(excluded.items())[:25]:
        print(" | ".join(key), "|", reason)


def summarize_partials(
    estimates: list[Estimate],
    excluded: dict[tuple[str, str, str, str, str], str],
    *,
    verbose: bool = True,
) -> None:
    print(
        {
            "partial_families": len(estimates) + len(excluded),
            "estimated": len(estimates),
            "left_unresolved": len(excluded),
            "seats_down_replacements": sum(
                any(
                    config.strip().lower().replace("_", " ")
                        == "seats down"
                    for config in estimate.target.configs
                )
                for estimate in estimates
            ),
        }
    )
    if not verbose:
        return
    print("\nPARTIAL ESTIMATES")
    for estimate in estimates:
        target = estimate.target
        action = (
            "replace both (source was seats-down)"
            if any(
                config.strip().lower().replace("_", " ") == "seats down"
                for config in target.configs
            )
            else (
                f"fill width {estimate.width:g}"
                if target.width is None
                else f"fill depth {estimate.depth:g}"
            )
        )
        print(
            f"{target.make} {target.model} {target.generation} "
            f"[{target.body_style}] -> {action} | {estimate.method} | "
            f"{estimate.note}"
        )
    if excluded:
        print("\nUNRESOLVED PARTIALS")
        for key, reason in excluded.items():
            print(" | ".join(key), "|", reason)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--apply",
        action="store_true",
        help="Write estimates and body-class height defaults.",
    )
    mode.add_argument(
        "--partials",
        action="store_true",
        help="Dry-run estimates for families missing one dimension.",
    )
    mode.add_argument(
        "--apply-partials",
        action="store_true",
        help="Write only the missing dimension in partial families.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    connection = database_connection()
    connection.autocommit = False
    try:
        families = read_families(connection)
        if args.partials or args.apply_partials:
            estimates, excluded = build_partial_estimates(families)
            summarize_partials(
                estimates,
                excluded,
                verbose=not args.apply_partials,
            )
            if not args.apply_partials:
                connection.rollback()
                return 0
            estimated_rows = apply_partial_estimates(
                connection,
                estimates,
            )
            connection.commit()
            print(
                {
                    "applied_partial_families": len(estimates),
                    "applied_partial_rows": estimated_rows,
                }
            )
            return 0
        estimates, excluded = build_estimates(families)
        summarize(families, estimates, excluded)
        if not args.apply:
            connection.rollback()
            return 0
        height_rows = apply_height_defaults(connection, families)
        estimated_rows = apply_estimates(connection, estimates)
        connection.commit()
        print(
            {
                "applied_estimate_families": len(estimates),
                "applied_estimate_rows": estimated_rows,
                "height_rows_updated": height_rows,
            }
        )
        return 0
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


if __name__ == "__main__":
    raise SystemExit(main())
