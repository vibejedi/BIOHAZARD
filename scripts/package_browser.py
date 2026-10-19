#!/usr/bin/env python3
"""Package only the finished standalone HTML and its short play instructions."""
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parents[1] / 'releases'
with zipfile.ZipFile(root / 'BIOHAZARD-browser.zip', 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for name in ['BIOHAZARD.html', 'README.txt']:
        archive.write(root / name, arcname=name)
print(f"Browser download: releases/BIOHAZARD-browser.zip ({(root / 'BIOHAZARD-browser.zip').stat().st_size / 1024 / 1024:.1f} MiB)")
