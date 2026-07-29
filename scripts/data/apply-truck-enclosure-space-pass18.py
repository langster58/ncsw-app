#!/usr/bin/env python3
"""Apply exact-fit Cybertruck and late Titan dimensions for pass 18."""

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path


base_path = Path(__file__).with_name("apply-truck-enclosure-space-pass16.py")
spec = spec_from_file_location("truck_space_pass16", base_path)
base = module_from_spec(spec)
spec.loader.exec_module(base)

base.ARCHIVE_TABLE = "vehicles_truck_space_archive_pass18_20260728"
base.RULES = [
    (
        "under_seat",
        54.3,
        15.9,
        10.1,
        """make='Tesla' AND model='Cybertruck'
           AND year BETWEEN 2024 AND 2026""",
        "https://shop.tesla.com/es_mx/product/cybertruck-underseat-storage-bin",
    ),
    (
        "under_seat",
        49.5,
        13.5,
        9.25,
        """make='Nissan' AND model='Titan' AND cab_type='extended_cab'
           AND year BETWEEN 2020 AND 2023""",
        "https://www.ground-shaker.com/index.php?option=com_hikashop"
        "&ctrl=product&task=show&cid=1171&name=black-8-dual-sealed"
        "-solo-baric-sub-box-fits-04-23-nissan-titan-ext-king-cab"
        "&Itemid=104&lang=en",
    ),
]

base.main()
