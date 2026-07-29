#!/usr/bin/env python3
"""Resolve the final known truck-cab space rows in one validated write."""

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path


base_path = Path(__file__).with_name("apply-truck-enclosure-space-pass16.py")
spec = spec_from_file_location("truck_space_pass16", base_path)
base = module_from_spec(spec)
spec.loader.exec_module(base)

base.ARCHIVE_TABLE = "vehicles_truck_space_archive_pass38_20260728"

atrend_catalog = "https://images.carid.com/atrend/items/pdf/atrend-catalog.pdf"
gately_ford_crew = (
    "https://gatelyaudio.com/products/"
    "ford-f-350-6-x-6-5-1992-2007-behind-the-seat"
)

base.RULES = [
    (
        "under_seat",
        9.125,
        13.875,
        3.25,
        """make='Dodge' AND model='Dakota'
           AND cab_type='extended_cab' AND year BETWEEN 2005 AND 2010""",
        "https://www.reddit.com/r/DodgeDakota/comments/12th6eo",
    ),
    (
        "behind_seat",
        45.0,
        7.0,
        16.0,
        """make='Ford' AND model IN ('F-250','F-350')
           AND cab_type='crew_cab' AND year BETWEEN 1990 AND 1997""",
        gately_ford_crew,
    ),
    (
        "behind_seat",
        45.75,
        8.25,
        17.0,
        """make='Ford' AND model='F-250'
           AND cab_type='crew_cab' AND year=1999""",
        atrend_catalog,
    ),
    (
        "under_seat",
        48.0,
        13.875,
        7.75,
        """make='Ford' AND model='F-250'
           AND cab_type='extended_cab' AND year=1998""",
        atrend_catalog,
    ),
    (
        "under_seat",
        55.125,
        10.75,
        6.96,
        """make='Ford' AND model='F-250'
           AND cab_type='extended_cab' AND year=1999""",
        "https://www.mtx.com/i/caraudio/products/manualsQuickInstall/"
        "thunderforms/F250X00_specs.pdf",
    ),
    (
        "behind_seat",
        53.0,
        20.0,
        23.0,
        """make='Toyota' AND model='Tacoma'
           AND cab_type='extended_cab' AND year BETWEEN 2024 AND 2026""",
        "https://www.tacomaworld.com/threads/"
        "does-anyone-here-have-a-2024-xtra-cab-model.854170/",
    ),
    (
        "under_seat",
        56.75,
        13.25,
        10.0,
        """make='Chevrolet' AND model='C/K 1500 Series'
           AND cab_type='extended_cab' AND year=1999""",
        "https://www.americansoundconnection.com/"
        "1988-1998-Chevy-C-K-or-GMC-Sierra-Full-Size-Truck-Extended-Cab-"
        "Single-12-Downfiring-Sub-Box-1X12GMOLD.htm",
    ),
]

base.main()
