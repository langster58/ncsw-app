#!/usr/bin/env python3
"""Apply exact older Ford and Dodge Dakota enclosure dimensions for pass 22."""

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path


base_path = Path(__file__).with_name("apply-truck-enclosure-space-pass16.py")
spec = spec_from_file_location("truck_space_pass16", base_path)
base = module_from_spec(spec)
spec.loader.exec_module(base)

base.ARCHIVE_TABLE = "vehicles_truck_space_archive_pass22_20260728"
base.RULES = [
    (
        "behind_seat",
        29.5276,
        3.937,
        11.811,
        """make='Ford' AND model IN ('F-150','F-250','F-350')
           AND cab_type='regular_cab' AND year BETWEEN 1987 AND 1996""",
        "https://www.ford-trucks.com/forums/"
        "966278-subwoofer-behind-bench-seat-in-a-singlecab-done-with-pics.html",
    ),
    (
        "behind_seat",
        42.5,
        8.5,
        14.0,
        """make='Ford' AND model='F-150' AND cab_type='regular_cab'
           AND year BETWEEN 1997 AND 2003""",
        "https://netaudio.com/product/"
        "1998-2003-ford-f150-standard-cab-sub-box/",
    ),
    (
        "behind_seat",
        48.0,
        8.0,
        18.0,
        """make='Dodge' AND model='Dakota' AND cab_type='regular_cab'
           AND year BETWEEN 1997 AND 2004""",
        "https://www.soundoffaudio.com/"
        "1997-2004-dakota-standard-dual-sub-box/?fullSite=1",
    ),
    (
        "under_seat",
        57.5,
        18.5,
        8.25,
        """make='Dodge' AND model='Dakota' AND cab_type='extended_cab'
           AND year BETWEEN 1997 AND 2004""",
        "https://www.mtx.com/"
        "ddxp201-tn-dodge-dakota-custom-subwoofer-enclosure",
    ),
    (
        "behind_seat",
        20.75,
        8.0,
        16.3125,
        """make IN ('Dodge','Ram') AND model='Dakota'
           AND cab_type='double_cab' AND year BETWEEN 2000 AND 2011""",
        "https://www.mtx.com/"
        "ddqc10-tn-dodge-dakota-quad-cab-custom-subwoofer-enclosure",
    ),
]

base.main()
