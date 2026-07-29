#!/usr/bin/env python3
"""Apply conservative, vehicle-backed envelopes to older unresolved truck cabs."""

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path


base_path = Path(__file__).with_name("apply-truck-enclosure-space-pass16.py")
spec = spec_from_file_location("truck_space_pass16", base_path)
base = module_from_spec(spec)
spec.loader.exec_module(base)

base.ARCHIVE_TABLE = "vehicles_truck_space_archive_pass36_20260728"

base.RULES = [
    (
        "behind_seat",
        36.0,
        4.5,
        8.0,
        """make='Nissan' AND model='Frontier'
           AND cab_type='crew_cab' AND year BETWEEN 2000 AND 2004""",
        "https://1800woofers.com/2000-2004-frontier-crew-dual-sub-box-small",
    ),
    (
        "under_seat",
        9.125,
        13.875,
        3.25,
        """make='Ford'
           AND model IN ('F-150','F-250','F-350')
           AND cab_type='extended_cab' AND year BETWEEN 1992 AND 1997""",
        "https://www.ford-trucks.com/forums/1167976-subs-in-a-1992-f150-supercab.html",
    ),
    (
        "behind_seat",
        13.75,
        10.5,
        2.75,
        """make='Toyota' AND model='Pickup'
           AND cab_type='extended_cab' AND year BETWEEN 1990 AND 1995""",
        "https://www.reddit.com/r/ToyotaPickup/comments/1he7h5x",
    ),
    (
        "behind_seat",
        14.0,
        4.0,
        7.0,
        """make IN ('Chevrolet','GMC')
           AND model IN ('S-10','Sonoma')
           AND cab_type='crew_cab' AND year BETWEEN 2001 AND 2004""",
        "https://1800woofers.com/products/2001-2007-chevrolet-s10-crew-and-gmc-sonoma-crew-cab-dual-8-speaker-box",
    ),
]

base.main()
