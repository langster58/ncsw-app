#!/usr/bin/env python3
"""Apply the manufacturer-confirmed GM crew-cab enclosure envelope to hybrids."""

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path


base_path = Path(__file__).with_name("apply-truck-enclosure-space-pass16.py")
spec = spec_from_file_location("truck_space_pass16", base_path)
base = module_from_spec(spec)
spec.loader.exec_module(base)

base.ARCHIVE_TABLE = "vehicles_truck_space_archive_pass28_20260728"
base.RULES = [
    (
        "under_seat",
        52.0,
        15.5,
        7.4375,
        """make IN ('Chevrolet','GMC')
           AND model IN
             ('Silverado 1500 Hybrid','Sierra 1500 Hybrid')
           AND cab_type='crew_cab' AND year BETWEEN 2009 AND 2013""",
        "https://www.kicker.com/51KGMDL7T122",
    ),
]

base.main()
