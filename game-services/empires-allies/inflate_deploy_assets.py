"""Restore compressed text assets included in Railway source uploads."""

from gzip import open as gzip_open
from pathlib import Path
from shutil import copyfileobj


def main() -> None:
    archives = sorted(Path(".").rglob("*.deploy.gz"))
    if not archives:
        raise RuntimeError("No compressed deployment assets were found")

    for archive in archives:
        target = archive.with_name(archive.name.removesuffix(".deploy.gz"))
        target.parent.mkdir(parents=True, exist_ok=True)
        with gzip_open(archive, "rb") as source, target.open("wb") as destination:
            copyfileobj(source, destination)


if __name__ == "__main__":
    main()
