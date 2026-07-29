#!/usr/bin/env python3
"""Apply the owner-measured first-generation Tundra Access Cab enclosure."""

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path


base_path = Path(__file__).with_name("apply-truck-enclosure-space-pass16.py")
spec = spec_from_file_location("truck_space_pass16", base_path)
base = module_from_spec(spec)
spec.loader.exec_module(base)

base.ARCHIVE_TABLE = "vehicles_truck_space_archive_pass30_20260728"
base.RULES = [
    (
        "under_seat",
        28.625,
        19.125,
        6.0625,
        """make='Toyota' AND model='Tundra'
           AND cab_type='extended_cab' AND year BETWEEN 2000 AND 2006""",
        "https://www.reddit.com/r/CarAV/comments/n2pxyd/oddball_request_two_8_subs_in_tiny_enclosure/",
    ),
]

base.main()
