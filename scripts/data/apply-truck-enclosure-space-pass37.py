#!/usr/bin/env python3
"""Resolve remaining older extended cabs with exact and conservative envelopes."""

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path


base_path = Path(__file__).with_name("apply-truck-enclosure-space-pass16.py")
spec = spec_from_file_location("truck_space_pass16", base_path)
base = module_from_spec(spec)
spec.loader.exec_module(base)

base.ARCHIVE_TABLE = "vehicles_truck_space_archive_pass37_20260728"

compact_underseat_source = (
    "https://www.ford-trucks.com/forums/1122371-subwoofer-under-seat.html"
)
regular_box_source = (
    "https://www.hifisoundconnection.com/"
    "Dual-10-Subwoofer-Regular-Standard-Cab-Truck-Sub-Box-Enclosure-"
    "5-8-MDF-Gray-210TRUCK"
)

base.RULES = [
    (
        "behind_seat",
        37.0,
        15.0,
        15.875,
        """make='Nissan' AND model='Frontier'
           AND cab_type='extended_cab' AND year BETWEEN 1998 AND 2004""",
        "https://netaudio.com/product/2001-2018-nissan-frontier-sub-box-extended-cab/",
    ),
    (
        "under_seat",
        9.125,
        13.875,
        3.25,
        """make='Dodge' AND model='Dakota'
           AND cab_type='extended_cab' AND year BETWEEN 1990 AND 1996""",
        "https://dodgeforum.com/forum/1st-gen-dakota-tech/281839-extended-cab-subwoofer-placement.html",
    ),
    (
        "under_seat",
        9.125,
        13.875,
        3.25,
        """make='Ford'
           AND model IN ('F-150','F-250','F-350')
           AND cab_type='extended_cab' AND year BETWEEN 1987 AND 1991""",
        compact_underseat_source,
    ),
    (
        "under_seat",
        9.125,
        13.875,
        3.25,
        """make='Ford' AND model='F-150'
           AND cab_type='extended_cab' AND year BETWEEN 1979 AND 1986""",
        compact_underseat_source,
    ),
    (
        "behind_seat",
        49.0,
        8.0,
        14.5,
        """make='Dodge'
           AND model IN ('RAM','RAM 150','RAM 250','RAM 350')
           AND cab_type='extended_cab' AND year BETWEEN 1980 AND 1993""",
        regular_box_source,
    ),
]

base.main()
