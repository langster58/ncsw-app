#!/usr/bin/env python3
"""Apply the second-generation Tundra Double Cab under-seat enclosure."""

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path


base_path = Path(__file__).with_name("apply-truck-enclosure-space-pass16.py")
spec = spec_from_file_location("truck_space_pass16", base_path)
base = module_from_spec(spec)
spec.loader.exec_module(base)

base.ARCHIVE_TABLE = "vehicles_truck_space_archive_pass31_20260728"
base.RULES = [
    (
        "under_seat",
        54.0,
        22.0,
        8.0,
        """make='Toyota' AND model='Tundra'
           AND cab_type='extended_cab' AND year=2007""",
        "https://tacotunes.com/shop/toyota-tundra-audio-products/crewmax-audio-products/crewmax-subwoofer-options/2007-2021-toyota-tundra-double-cab-ported-subwoofer-box-enclosure-single-10-in-progress/",
    ),
]

base.main()
