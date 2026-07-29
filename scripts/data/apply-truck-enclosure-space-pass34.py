#!/usr/bin/env python3
"""Apply the exact first-generation Tacoma Double Cab behind-seat enclosure."""

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path


base_path = Path(__file__).with_name("apply-truck-enclosure-space-pass16.py")
spec = spec_from_file_location("truck_space_pass16", base_path)
base = module_from_spec(spec)
spec.loader.exec_module(base)

base.ARCHIVE_TABLE = "vehicles_truck_space_archive_pass34_20260728"
base.RULES = [
    (
        "behind_seat",
        48.25,
        4.5,
        8.75,
        """make='Toyota' AND model='Tacoma'
           AND cab_type='double_cab' AND year BETWEEN 2001 AND 2004""",
        "https://www.etsy.com/listing/1744369122/fits-toyota-tacoma-double-cab-1995-2004",
    ),
]

base.main()
