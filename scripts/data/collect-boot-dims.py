#!/usr/bin/env python3
"""Canonical entry point for the cargo/trunk dimension collector.

The implementation lives in collect-boot-dim-candidates.py. Keeping this
entry point preserves the familiar command while permanently removing the old
DuckDuckGo-snippet writer, which could save unsupported measurements.
"""

from pathlib import Path
import runpy


runpy.run_path(
    str(Path(__file__).with_name("collect-boot-dim-candidates.py")),
    run_name="__main__",
)
