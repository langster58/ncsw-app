#!/usr/bin/env python3
"""Apply exact-fit current Ford truck cargo-space dimensions for pass 17."""

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path


base_path = Path(__file__).with_name("apply-truck-enclosure-space-pass16.py")
spec = spec_from_file_location("truck_space_pass16", base_path)
base = module_from_spec(spec)
spec.loader.exec_module(base)

base.ARCHIVE_TABLE = "vehicles_truck_space_archive_pass17_20260728"
base.RULES = [
    (
        "behind_seat",
        25.0,
        5.0,
        14.0,
        """make='Ford' AND model='Ranger' AND cab_type='crew_cab'
           AND year BETWEEN 2024 AND 2026""",
        "https://www.ranger6g.com/forum/threads/sub-install-behind-rear-seat.23588/",
    ),
    (
        "under_seat",
        39.0,
        14.0,
        10.75,
        """make='Ford' AND model='F-150 Lightning'
           AND cab_type='crew_cab' AND year BETWEEN 2022 AND 2026""",
        "https://www.fordpartsgiant.com/accessories/"
        "ford-f_150_lightning-cargo_organization.html",
    ),
]

base.main()
