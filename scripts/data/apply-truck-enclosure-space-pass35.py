#!/usr/bin/env python3
"""Apply the installed powered-sub footprint to Nissan D21 King Cabs."""

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path


base_path = Path(__file__).with_name("apply-truck-enclosure-space-pass16.py")
spec = spec_from_file_location("truck_space_pass16", base_path)
base = module_from_spec(spec)
spec.loader.exec_module(base)

base.ARCHIVE_TABLE = "vehicles_truck_space_archive_pass35_20260728"
base.RULES = [
    (
        "under_seat",
        13.4375,
        9.0625,
        2.8125,
        """make='Nissan' AND model='Truck'
           AND cab_type='extended_cab' AND year BETWEEN 1990 AND 1997""",
        "https://www.bestadvisers.co.uk/car-subwoofers/alpine-pwe-v80-vs-alpine-pwe-s8",
    ),
]

base.main()
