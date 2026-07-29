#!/usr/bin/env python3
"""Apply exact enclosure envelopes and same-generation cab carryovers."""

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path


base_path = Path(__file__).with_name("apply-truck-enclosure-space-pass16.py")
spec = spec_from_file_location("truck_space_pass16", base_path)
base = module_from_spec(spec)
spec.loader.exec_module(base)

base.ARCHIVE_TABLE = "vehicles_truck_space_archive_pass26_20260728"

atrend_catalog = (
    "https://images.carid.com/atrend/items/pdf/atrend-catalog.pdf"
)
base.RULES = [
    (
        "under_seat",
        53.0,
        12.0,
        7.0,
        """make='Ford'
           AND model IN ('F-250 Super Duty','F-350 Super Duty')
           AND cab_type='extended_cab' AND year BETWEEN 1999 AND 2000""",
        "https://netaudio.com/product/"
        "1999-2016-ford-super-duty-extended-cab-sub-box-ported/",
    ),
    (
        "behind_seat",
        18.625,
        5.125,
        11.0,
        """make='Ford' AND model='Ranger'
           AND cab_type='crew_cab' AND year=2023""",
        "https://www.ranger5g.com/forum/threads/"
        "what-is-the-biggest-sub-enclosure-for-the-back.10648/",
    ),
    (
        "under_seat",
        52.75,
        13.25,
        6.875,
        """make IN ('Chevrolet','GMC')
           AND model IN ('Silverado 2500HD','Sierra 2500HD')
           AND cab_type='extended_cab' AND year=2019""",
        atrend_catalog,
    ),
    (
        "behind_seat",
        51.0,
        7.0,
        15.0,
        """make='Ford' AND model='F-250 Super Duty'
           AND cab_type='extended_cab' AND year BETWEEN 2024 AND 2026""",
        "https://www.americantrucks.com/"
        "f250-dual-10-inch-behind-seat-subwoofer-box-poly-coated-fd-148.html",
    ),
    (
        "behind_seat",
        51.0,
        7.0,
        15.0,
        """make='Ford' AND model='F-350 Super Duty'
           AND cab_type='extended_cab' AND year BETWEEN 2024 AND 2026""",
        "https://www.americantrucks.com/"
        "f350-dual-8-inch-behind-seat-subwoofer-box-carpeted-fd-147-ca.html",
    ),
    (
        "under_seat",
        49.5,
        13.5,
        9.25,
        """make='Nissan' AND model='Titan'
           AND cab_type='extended_cab' AND year BETWEEN 2017 AND 2023""",
        "https://www.ground-shaker.com/index.php"
        "?option=com_hikashop&ctrl=product&task=show&cid=1171"
        "&name=black-8-dual-sealed-solo-baric-sub-box-fits-04-23-"
        "nissan-titan-ext-king-cab&Itemid=104&lang=en",
    ),
]

base.main()
