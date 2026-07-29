#!/usr/bin/env python3
"""Apply exact-fit truck enclosure dimensions for unresolved cab families."""

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path


base_path = Path(__file__).with_name("apply-truck-enclosure-space-pass16.py")
spec = spec_from_file_location("truck_space_pass16", base_path)
base = module_from_spec(spec)
spec.loader.exec_module(base)

base.ARCHIVE_TABLE = "vehicles_truck_space_archive_pass23_20260728"
base.RULES = [
    (
        "behind_seat",
        57.0,
        7.5,
        16.25,
        """make='Ford' AND model IN ('F-250 Super Duty','F-350 Super Duty')
           AND cab_type='regular_cab' AND year BETWEEN 1999 AND 2016""",
        "https://netaudio.com/product/"
        "1999-2016-ford-super-duty-standard-cab-sub-box-ported/",
    ),
    (
        "behind_seat",
        22.0,
        7.75,
        13.25,
        """make='Chevrolet' AND model='Colorado'
           AND cab_type='extended_cab' AND year BETWEEN 2004 AND 2014""",
        "https://www.ground-shaker.com/index.php?option=com_hikashop"
        "&ctrl=product&task=show&cid=249"
        "&name=gs-cqhvp110b-black-10-single-ported-sub-box-fits-chevy-colorado"
        "-gmc-canyon-ext-cab-2004-2014&Itemid=104&lang=en",
    ),
    (
        "behind_seat",
        22.0,
        7.75,
        13.25,
        """make='GMC' AND model='Canyon'
           AND cab_type='extended_cab' AND year BETWEEN 2004 AND 2014""",
        "https://www.ground-shaker.com/index.php?option=com_hikashop"
        "&ctrl=product&task=show&cid=996"
        "&name=black-10-single-ported-sub-box-fits-04-14-gmc-canyon-ext-cab"
        "&Itemid=104&lang=en",
    ),
    (
        "under_seat",
        43.75,
        12.5,
        10.0,
        """make='Ford' AND model='F-150'
           AND cab_type='crew_cab' AND year BETWEEN 2001 AND 2003""",
        "https://soundboxmobile.com/products/lce-f010-10d",
    ),
]

base.main()
