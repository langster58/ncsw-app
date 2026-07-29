#!/usr/bin/env python3
"""Resolve fixed-body pickups excluded by the cab-type collector."""

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path


base_path = Path(__file__).with_name("apply-truck-enclosure-space-pass16.py")
spec = spec_from_file_location("truck_space_pass16", base_path)
base = module_from_spec(spec)
spec.loader.exec_module(base)

base.ARCHIVE_TABLE = "vehicles_truck_space_archive_pass39_20260728"

atrend_catalog = "https://images.carid.com/atrend/items/pdf/atrend-catalog.pdf"

base.RULES = [
    (
        "behind_seat",
        14.125,
        5.125,
        9.625,
        """make='Chevrolet' AND model='El Camino'""",
        "https://www.reddit.com/r/ElCamino/comments/1jqdd6o",
    ),
    (
        "under_seat",
        16.0,
        7.0,
        15.0,
        """make='Ford' AND model='Explorer Sport Trac'""",
        "https://www.mtx.com/fexst01bk10-fpr-ford-explorer-sport-trac-"
        "custom-subwoofer-enclosure",
    ),
    (
        "under_seat",
        51.0,
        14.625,
        6.0,
        """(make='Chevrolet' AND model='Avalanche')
           OR (make='Cadillac' AND model='Escalade EXT')""",
        atrend_catalog,
    ),
    (
        "under_seat",
        14.25,
        9.375,
        3.125,
        """make='Subaru' AND model='Baja'""",
        "https://www.reddit.com/r/SubaruBaja/comments/1bchrcu",
    ),
    (
        "under_seat",
        9.125,
        13.875,
        3.25,
        """make='Chevrolet' AND model='Silverado EV'""",
        "https://www.reddit.com/r/SilveradoEV/comments/1n748c8",
    ),
    (
        "under_seat",
        9.125,
        13.875,
        3.25,
        """make='GMC' AND model='Sierra EV'""",
        "https://contentdelivery.ext.gm.com/bypass/gma-content-api/resources/"
        "sites/GMA/content/staging/MANUALS/9000/MA9379/en_US/2.0/"
        "25_GMC_Sierra_Denali_EV_OM_en_US_U_18057569B_2024OCT31_2P.pdf",
    ),
    (
        "under_seat",
        18.625,
        11.0,
        5.125,
        """make='GMC' AND model='HUMMER EV'""",
        "https://www.reddit.com/r/HummerEV/comments/1nukobh/"
        "hummer_truck_subwoofer/",
    ),
    (
        "under_seat",
        9.125,
        13.875,
        3.25,
        """make='Hummer' AND model='H3T'""",
        "https://hummer4x4offroad.com/forum/threads/"
        "h3t-installing-2-so-b-8pt-subs-under-your-rear-bench-seat.79/",
    ),
    (
        "under_seat",
        18.625,
        11.0,
        5.125,
        """make='Hummer' AND model='H2 SUT'""",
        "https://techtalk.parts-express.com/forum/tech-talk-forum/"
        "67415-subwoofer-for-h2",
    ),
]

base.main()
