#!/usr/bin/env python3
"""Apply the verified powered-sub footprint to second-gen Colorado/Canyon extended cabs."""

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path


base_path = Path(__file__).with_name("apply-truck-enclosure-space-pass16.py")
spec = spec_from_file_location("truck_space_pass16", base_path)
base = module_from_spec(spec)
spec.loader.exec_module(base)

base.ARCHIVE_TABLE = "vehicles_truck_space_archive_pass32_20260728"
base.RULES = [
    (
        "under_seat",
        13.6,
        9.9,
        2.9,
        """make IN ('Chevrolet','GMC')
           AND model IN ('Colorado','Canyon')
           AND cab_type='extended_cab' AND year BETWEEN 2015 AND 2022""",
        "https://www.reddit.com/r/chevycolorado/comments/1ir7313/2nd_gen_extended_cab_under_seat_subwoofer_install/",
    ),
]

base.main()
