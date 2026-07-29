#!/usr/bin/env python3
"""Apply archived manufacturer enclosure dimensions to remaining truck cabs."""

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path


base_path = Path(__file__).with_name("apply-truck-enclosure-space-pass16.py")
spec = spec_from_file_location("truck_space_pass16", base_path)
base = module_from_spec(spec)
spec.loader.exec_module(base)

base.ARCHIVE_TABLE = "vehicles_truck_space_archive_pass27_20260728"
base.RULES = [
    (
        "under_seat",
        48.0,
        18.0,
        8.6875,
        """make='Dodge'
           AND model IN
             ('Ram Pickup 1500','Ram Pickup 2500','Ram Pickup 3500')
           AND cab_type='extended_cab' AND year BETWEEN 1994 AND 1995""",
        "https://www.mtx.com/"
        "drxp20t-tn-mtx-vehicle-specific-custom-subwoofer-enclosure",
    ),
    (
        "behind_seat",
        20.75,
        8.0,
        16.3125,
        """make='Dodge' AND model='Dakota'
           AND cab_type='crew_cab' AND year=2010""",
        "https://www.mtx.com/"
        "ddqc10-tn-dodge-dakota-quad-cab-custom-subwoofer-enclosure",
    ),
    (
        "under_seat",
        49.25,
        14.12,
        7.625,
        """make='Nissan' AND model='Titan'
           AND cab_type='extended_cab' AND year=2024""",
        "https://images.carid.com/atrend/items/pdf/atrend-catalog.pdf",
    ),
]

base.main()
