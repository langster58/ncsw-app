#!/usr/bin/env python3
"""Apply exact Ford Ranger enclosure dimensions for pass 20."""

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path


base_path = Path(__file__).with_name("apply-truck-enclosure-space-pass16.py")
spec = spec_from_file_location("truck_space_pass16", base_path)
base = module_from_spec(spec)
spec.loader.exec_module(base)

base.ARCHIVE_TABLE = "vehicles_truck_space_archive_pass20_20260728"
base.RULES = [
    (
        "behind_seat",
        19.5,
        7.0,
        15.0,
        """make='Ford' AND model='Ranger' AND cab_type='regular_cab'
           AND year=1993""",
        "https://www.mtx.com/"
        "rmp10at-tn-mtx-ford-ranger-regular-cab-custom-subwoofer-enclosure",
    ),
    (
        "behind_seat",
        30.0,
        7.0,
        11.0,
        """make='Ford' AND model='Ranger' AND cab_type='regular_cab'
           AND year BETWEEN 1994 AND 1998""",
        "https://www.supercrewsound.com/94RangerStdDual.html",
    ),
    (
        "behind_seat",
        48.0,
        9.0,
        11.5,
        """make='Ford' AND model='Ranger' AND cab_type='regular_cab'
           AND year BETWEEN 1999 AND 2012""",
        "https://www.supercrewsound.com/99RangerStdDual.html",
    ),
    (
        "under_seat",
        51.3125,
        12.0,
        8.375,
        """make='Ford' AND model='Ranger' AND cab_type='extended_cab'
           AND doors=4 AND year BETWEEN 1999 AND 2007""",
        "https://www.mtx.com/i/caraudio/products/manualsQuickInstall/"
        "thunderforms/FRANX99_specs.pdf",
    ),
]

base.main()
