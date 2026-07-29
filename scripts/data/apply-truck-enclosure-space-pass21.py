#!/usr/bin/env python3
"""Apply owner-measured compact-truck enclosure dimensions for pass 21."""

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path


base_path = Path(__file__).with_name("apply-truck-enclosure-space-pass16.py")
spec = spec_from_file_location("truck_space_pass16", base_path)
base = module_from_spec(spec)
spec.loader.exec_module(base)

base.ARCHIVE_TABLE = "vehicles_truck_space_archive_pass21_20260728"
base.RULES = [
    (
        "behind_seat",
        17.0,
        14.0,
        12.0,
        """make='Nissan' AND model='Frontier' AND cab_type='extended_cab'
           AND year BETWEEN 2005 AND 2021""",
        "https://www.soundsolutionsaudio.com/forum/64-ascendant-audio/"
        "?page=5&sortby=views&sortdirection=desc",
    ),
    (
        "behind_seat",
        11.0,
        11.0,
        13.5,
        """make='Toyota' AND model='Tacoma' AND cab_type='extended_cab'
           AND year BETWEEN 2005 AND 2015""",
        "https://www.reddit.com/r/ToyotaTacoma/comments/l1dmre",
    ),
    (
        "behind_seat",
        11.0,
        11.0,
        22.0,
        """make='Toyota' AND model='Tacoma' AND cab_type='extended_cab'
           AND year BETWEEN 2016 AND 2023""",
        "https://www.reddit.com/r/ToyotaTacoma/comments/1imetwv",
    ),
]

base.main()
