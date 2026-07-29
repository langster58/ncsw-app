#!/usr/bin/env python3
"""Apply exact F-150 regular-cab enclosure dimensions for pass 19."""

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path


base_path = Path(__file__).with_name("apply-truck-enclosure-space-pass16.py")
spec = spec_from_file_location("truck_space_pass16", base_path)
base = module_from_spec(spec)
spec.loader.exec_module(base)

base.ARCHIVE_TABLE = "vehicles_truck_space_archive_pass19_20260728"
base.RULES = [
    (
        "behind_seat",
        58.0,
        10.0,
        18.0,
        """make='Ford' AND model='F-150' AND cab_type='regular_cab'
           AND year BETWEEN 2004 AND 2008""",
        "https://netaudio.com/product/"
        "2004-2008-ford-f150-standard-cab-sub-box-double/",
    ),
    (
        "behind_seat",
        48.0,
        7.0,
        13.0,
        """make='Ford' AND model='F-150' AND cab_type='regular_cab'
           AND year BETWEEN 2009 AND 2014""",
        "https://www.f150forum.com/f10/subwoofer-box-63504/index5/",
    ),
]

base.main()
