#!/usr/bin/env python3
"""Apply the verified compact under-seat envelope to current Ranger SuperCabs."""

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path


base_path = Path(__file__).with_name("apply-truck-enclosure-space-pass16.py")
spec = spec_from_file_location("truck_space_pass16", base_path)
base = module_from_spec(spec)
spec.loader.exec_module(base)

base.ARCHIVE_TABLE = "vehicles_truck_space_archive_pass29_20260728"
base.RULES = [
    (
        "under_seat",
        11.0,
        7.5,
        2.75,
        """make='Ford' AND model='Ranger'
           AND cab_type='extended_cab' AND year BETWEEN 2019 AND 2023""",
        "https://www.ranger5g.com/forum/threads/supercab-underseat-kenwood-subwoofer-install.15051/",
    ),
]

base.main()
