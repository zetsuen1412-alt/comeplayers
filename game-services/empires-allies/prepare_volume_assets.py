"""Prepare and verify the persistent Railway game-asset volume."""

import os
import time
from pathlib import Path
from shutil import rmtree
from tarfile import open as open_tar


VOLUME_ROOT = Path(os.environ.get("COMEPLAYERS_ASSET_VOLUME_ROOT", "/game-assets"))
ARCHIVE = VOLUME_ROOT / "cp-sol-assets.tar"
ASSET_ROOT = VOLUME_ROOT / "sol_assets_octdict" / "assets"
MARKER = VOLUME_ROOT / ".cp-sol-assets-v1-ready"
EXPECTED_FILES = 527
EXPECTED_BYTES = 183_237_745
ARCHIVE_WAIT_SECONDS = int(os.environ.get("COMEPLAYERS_ASSET_WAIT_SECONDS", "1200"))


def asset_totals() -> tuple[int, int]:
    files = [path for path in ASSET_ROOT.rglob("*") if path.is_file()]
    return len(files), sum(path.stat().st_size for path in files)


def assets_are_complete() -> bool:
    return ASSET_ROOT.is_dir() and asset_totals() == (
        EXPECTED_FILES,
        EXPECTED_BYTES,
    )


def extract_archive() -> None:
    volume_root = VOLUME_ROOT.resolve()
    with open_tar(ARCHIVE, "r") as archive:
        for member in archive.getmembers():
            destination = (VOLUME_ROOT / member.name).resolve()
            if destination != volume_root and volume_root not in destination.parents:
                raise RuntimeError(f"Unsafe asset archive member: {member.name}")
        archive.extractall(VOLUME_ROOT, filter="data")


def wait_for_archive() -> bool:
    deadline = time.monotonic() + ARCHIVE_WAIT_SECONDS
    last_size = -1
    stable_checks = 0
    print(
        f"Waiting up to {ARCHIVE_WAIT_SECONDS}s for {ARCHIVE}",
        flush=True,
    )
    while time.monotonic() < deadline:
        if ARCHIVE.is_file():
            current_size = ARCHIVE.stat().st_size
            if current_size > 0 and current_size == last_size:
                stable_checks += 1
                if stable_checks >= 3:
                    return True
            else:
                stable_checks = 0
            last_size = current_size
        time.sleep(1)
    return ARCHIVE.is_file() and ARCHIVE.stat().st_size > 0


def main() -> None:
    if not VOLUME_ROOT.is_dir():
        return

    if not assets_are_complete():
        if not ARCHIVE.is_file() and not wait_for_archive():
            raise RuntimeError("Railway game-asset archive is missing")
        extract_archive()

    if not assets_are_complete():
        files, total_bytes = asset_totals()
        raise RuntimeError(
            "Railway game assets failed verification: "
            f"{files} files, {total_bytes} bytes"
        )

    # Remove the duplicate partial path created by an interrupted directory
    # upload only after the canonical asset tree has passed verification.
    duplicate = VOLUME_ROOT / "sol_assets_octdict" / "sol_assets_octdict"
    if duplicate.is_dir():
        rmtree(duplicate)

    MARKER.write_text(
        f"files={EXPECTED_FILES}\nbytes={EXPECTED_BYTES}\n",
        encoding="utf-8",
    )
    ARCHIVE.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
