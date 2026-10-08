#!/usr/bin/env python3
"""Rebuild into a fresh CI directory, compare frozen receipt, copy HTML only."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys


def rebuild(roster, build_dir, expected):
    if not re.fullmatch(r"[0-9a-f]{64}", expected):
        raise ValueError("Replace gallery SHA placeholder with the exact final 64-hex SHA before publication")
    roster = roster.resolve(strict=True)
    frozen_receipt = roster / "BUKA-REVIEW-MODEL.viewer-receipt.json"
    frozen_raw = frozen_receipt.read_bytes()
    frozen = json.loads(frozen_raw)
    if frozen.get("viewer_sha256") != expected or frozen.get("visual_approval") is not False or frozen.get("game_integration") is not False:
        raise ValueError("Final frozen receipt/gallery SHA or review flags differ")
    manifest_raw = (roster / "review-manifest.json").read_bytes()
    if frozen.get("manifest_sha256") != hashlib.sha256(manifest_raw).hexdigest():
        raise ValueError("Frozen viewer receipt does not identify the current manifest")
    build_dir = build_dir.resolve()
    if build_dir.exists() or build_dir.is_relative_to(roster):
        raise FileExistsError("Build directory must be fresh and outside frozen roster")
    destination = roster / "BUKA-REVIEW-MODEL.html"
    if destination.exists():
        raise FileExistsError("Generated destination HTML already exists; frozen data will not be overwritten")
    build_dir.mkdir(parents=True, exist_ok=False)
    generated = build_dir / "BUKA-REVIEW-MODEL.html"
    subprocess.run([sys.executable, str(roster / "viewer/build_offline_gallery.py"),
                    "--manifest", str(roster / "review-manifest.json"),
                    "--expected-output-sha256", expected, "--output", str(generated)], check=True)
    rebuilt = json.loads(generated.with_suffix(".viewer-receipt.json").read_bytes())
    if rebuilt != frozen:
        raise ValueError("Rebuilt receipt JSON differs from frozen evidence")
    raw = generated.read_bytes()
    if hashlib.sha256(raw).hexdigest() != expected or len(raw) != frozen["viewer_bytes"]:
        raise ValueError("Rebuilt HTML identity differs")
    if frozen_receipt.read_bytes() != frozen_raw or (roster / "review-manifest.json").read_bytes() != manifest_raw:
        raise ValueError("Frozen inputs changed during rebuild")
    with destination.open("xb") as handle:
        handle.write(raw)
    return {"gallery_sha256": expected, "bytes": len(raw), "frozen_receipt_bytes_preserved": True,
            "rebuilt_receipt_json_matches": True, "cloud_generation": False}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--roster", required=True, type=Path)
    p.add_argument("--build-dir", required=True, type=Path)
    p.add_argument("--expected-sha256", required=True)
    a = p.parse_args()
    print(json.dumps(rebuild(a.roster, a.build_dir, a.expected_sha256), indent=2))


if __name__ == "__main__":
    main()
