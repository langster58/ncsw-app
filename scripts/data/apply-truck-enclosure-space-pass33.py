#!/usr/bin/env python3
"""Apply the same-body GM OBS crew-cab under-seat enclosure envelope."""

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path


base_path = Path(__file__).with_name("apply-truck-enclosure-space-pass16.py")
spec = spec_from_file_location("truck_space_pass16", base_path)
base = module_from_spec(spec)
spec.loader.exec_module(base)

base.ARCHIVE_TABLE = "vehicles_truck_space_archive_pass33_20260728"
base.RULES = [
    (
        "under_seat",
        43.625,
        13.125,
        7.875,
        """make IN ('Chevrolet','GMC')
           AND model IN (
             'C/K 2500 Series','C/K 3500 Series',
             'Sierra 3500','Sierra Classic 2500','Sierra Classic 3500'
           )
           AND cab_type='crew_cab' AND year BETWEEN 1988 AND 2000""",
        "https://images.carid.com/atrend/items/pdf/atrend-catalog.pdf",
    ),
]

base.main()
