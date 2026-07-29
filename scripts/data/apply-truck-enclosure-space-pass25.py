#!/usr/bin/env python3
"""Apply conservative regular-cab and exact extended-cab enclosure envelopes."""

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path


base_path = Path(__file__).with_name("apply-truck-enclosure-space-pass16.py")
spec = spec_from_file_location("truck_space_pass16", base_path)
base = module_from_spec(spec)
spec.loader.exec_module(base)

base.ARCHIVE_TABLE = "vehicles_truck_space_archive_pass25_20260728"

atrend_catalog = (
    "https://images.carid.com/atrend/items/pdf/atrend-catalog.pdf"
)
base.RULES = [
    (
        "behind_seat",
        49.0,
        8.0,
        14.5,
        """body_style='Truck' AND cab_type='regular_cab'""",
        "https://www.hifisoundconnection.com/"
        "Dual-10-Subwoofer-Regular-Standard-Cab-Truck-Sub-Box-Enclosure-"
        "5-8-MDF-Gray-210TRUCK",
    ),
    (
        "behind_seat",
        47.0,
        13.5,
        14.5,
        """make='Toyota' AND model='Tacoma'
           AND cab_type='extended_cab' AND year BETWEEN 1995 AND 2004""",
        "https://www.americansoundconnection.com/"
        "1995-2004-Toyota-Tacoma-Extended-Cab-Truck-Dual-12-Sealed-"
        "Sub-Box-2X12TOYOTA-EXT-TCMA-95-04.htm",
    ),
    (
        "behind_seat",
        40.0,
        12.75,
        14.5,
        """make IN ('Chevrolet','GMC')
           AND model IN ('S-10','S-15','Sonoma')
           AND cab_type='extended_cab' AND year BETWEEN 1982 AND 2004""",
        "https://www.walmart.com/ip/586237818",
    ),
    (
        "behind_seat",
        43.25,
        13.5,
        7.5,
        """(
             (make='Ford' AND model='Ranger')
             OR
             (make='Mazda' AND model IN
               ('B-Series Pickup','B-Series Truck'))
           )
           AND cab_type='extended_cab' AND year BETWEEN 1983 AND 2011""",
        atrend_catalog,
    ),
    (
        "under_seat",
        48.75,
        10.5,
        5.375,
        """make='Ford'
           AND model IN ('F-250 Super Duty','F-350 Super Duty')
           AND cab_type='extended_cab' AND year=2001""",
        atrend_catalog,
    ),
    (
        "under_seat",
        50.25,
        13.25,
        6.0,
        """make='Lincoln' AND model='Mark LT'
           AND cab_type='crew_cab' AND year BETWEEN 2006 AND 2008""",
        "https://www.ground-shaker.com/index.php?option=com_hikashop"
        "&ctrl=product&task=show&cid=299"
        "&name=gs-zf150212b-black-12-dual-sealed-sub-box-fits-f-150-"
        "ext-cab-crew-cab__-2004-2008&Itemid=104&lang=en",
    ),
    (
        "under_seat",
        43.625,
        13.125,
        7.875,
        """year=2000 AND cab_type='crew_cab'
           AND (
             (make='Chevrolet' AND model IN
               ('C/K 2500 Series','C/K 3500 Series'))
             OR
             (make='GMC' AND model IN
               ('Sierra 2500','Sierra 3500',
                'Sierra Classic 2500','Sierra Classic 3500'))
           )""",
        atrend_catalog,
    ),
    (
        "under_seat",
        56.75,
        13.25,
        10.0,
        """make='Chevrolet'
           AND model IN ('C/K 2500 Series','C/K 3500 Series')
           AND cab_type='extended_cab' AND year BETWEEN 1999 AND 2000""",
        "https://www.americansoundconnection.com/"
        "1988-1998-Chevy-C-K-or-GMC-Sierra-Full-Size-Truck-Extended-"
        "Cab-Single-12-Downfiring-Sub-Box-1X12GMOLD.htm",
    ),
]

base.main()
