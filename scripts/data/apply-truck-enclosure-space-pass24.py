#!/usr/bin/env python3
"""Apply catalog-backed enclosure envelopes across unresolved truck families."""

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path


base_path = Path(__file__).with_name("apply-truck-enclosure-space-pass16.py")
spec = spec_from_file_location("truck_space_pass16", base_path)
base = module_from_spec(spec)
spec.loader.exec_module(base)

base.ARCHIVE_TABLE = "vehicles_truck_space_archive_pass24_20260728"

regular_cab_source = (
    "https://www.hifisoundconnection.com/"
    "Dual-10-Subwoofer-Regular-Standard-Cab-Truck-Sub-Box-Enclosure-"
    "5-8-MDF-Gray-210TRUCK"
)
atrend_catalog = (
    "https://images.carid.com/atrend/items/pdf/atrend-catalog.pdf"
)

base.RULES = [
    (
        "behind_seat",
        57.25,
        8.0,
        15.25,
        """year BETWEEN 1988 AND 2006
           AND (
             (make='Chevrolet' AND model IN
               ('C/K 1500 Series','C/K 2500 Series','C/K 3500 Series'))
             OR
             (make='GMC' AND model IN
               ('Sierra 1500','Sierra 2500','Sierra 3500'))
           )
           AND cab_type='regular_cab'""",
        "https://www.americansoundconnection.com/"
        "1988-2006-Chevy-C-K-Silverado-or-GMC-Sierra-Full-Size-Truck-"
        "Regular-Cab-Dual-10-Console-Sub-Box-TRUCK572X10.htm",
    ),
    (
        "under_seat",
        56.75,
        13.25,
        10.0,
        """year BETWEEN 1988 AND 1998
           AND (
             (make='Chevrolet' AND model IN
               ('C/K 1500 Series','C/K 2500 Series','C/K 3500 Series'))
             OR
             (make='GMC' AND model IN
               ('Sierra 1500','Sierra 2500','Sierra 3500'))
           )
           AND cab_type='extended_cab'""",
        "https://www.americansoundconnection.com/"
        "1988-1998-Chevy-C-K-or-GMC-Sierra-Full-Size-Truck-Extended-"
        "Cab-Single-12-Downfiring-Sub-Box-1X12GMOLD.htm",
    ),
    (
        "behind_seat",
        49.0,
        8.0,
        14.5,
        """make IN ('Chevrolet','GMC')
           AND model IN ('S-10','S-15','Sonoma')
           AND cab_type='regular_cab' AND year BETWEEN 1982 AND 2004""",
        regular_cab_source,
    ),
    (
        "behind_seat",
        49.0,
        8.0,
        14.5,
        """make IN ('Chevrolet','GMC')
           AND model IN ('Colorado','Canyon')
           AND cab_type='regular_cab' AND year BETWEEN 2004 AND 2009""",
        regular_cab_source,
    ),
    (
        "behind_seat",
        49.0,
        8.0,
        14.5,
        """make IN ('Dodge','Ram')
           AND model IN
             ('Ram Pickup 1500','Ram Pickup 2500','Ram Pickup 3500')
           AND cab_type='regular_cab' AND year BETWEEN 1994 AND 2008""",
        regular_cab_source,
    ),
    (
        "behind_seat",
        49.0,
        8.0,
        14.5,
        """make='Ford' AND model='Ranger'
           AND cab_type='regular_cab' AND year BETWEEN 1983 AND 2009""",
        regular_cab_source,
    ),
    (
        "behind_seat",
        49.0,
        8.0,
        14.5,
        """make='Toyota' AND model='Tundra'
           AND cab_type='regular_cab' AND year BETWEEN 2000 AND 2009""",
        regular_cab_source,
    ),
    (
        "behind_seat",
        49.0,
        8.0,
        14.5,
        """make='Toyota' AND model='Tacoma'
           AND cab_type='regular_cab' AND year BETWEEN 2005 AND 2009""",
        regular_cab_source,
    ),
    (
        "under_seat",
        43.25,
        13.5,
        11.0,
        """make IN ('Dodge','Ram')
           AND model IN
             ('Ram Pickup 1500','Ram Pickup 2500','Ram Pickup 3500')
           AND cab_type='extended_cab' AND year BETWEEN 1996 AND 2002""",
        atrend_catalog,
    ),
    (
        "under_seat",
        49.0,
        17.0,
        6.5,
        """make='Toyota' AND model='Tacoma'
           AND cab_type='double_cab' AND year BETWEEN 2024 AND 2026""",
        "https://www.ground-shaker.com/index.php?option=com_hikashop"
        "&ctrl=product&task=show&cid=1277"
        "&name=black-8-single-sealed-sub-box-fits-2024-toyota-tacoma-"
        "double-cab&Itemid=104&lang=en",
    ),
]

base.main()
