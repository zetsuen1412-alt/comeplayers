#!/usr/bin/env python3
"""Package the verified full source inventory and rebuilt Oct05 gallery.

No network, generation or source changes. This SOURCE archive includes all
baseline repository blobs/Unity/website and compact Oct05 evidence. The separate
model-review portable ZIP includes all 70+240 renders and editable bundles.
--verify-directory validates every member recorded in portable-manifest.json
after extraction; it does not require the original machine's absolute paths.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import zipfile

from verify_checkpoint import safe_path, safe_relative, verify

PORTABLE_MANIFEST = "portable-manifest.json"
RESTORE_NOTE = "CRWT-CHECKPOINT-RESTORE-2026-10-05.txt"


def digest(path):
    h, size = hashlib.sha256(), 0
    with path.open("rb") as handle:
        while block := handle.read(1024 * 1024):
            h.update(block)
            size += len(block)
    return size, h.hexdigest()


def verify_directory(root):
    root = root.resolve(strict=True)
    manifest = json.loads((root / PORTABLE_MANIFEST).read_bytes())
    if manifest.get("schema") != "crwt.full_source_portable.v1" or not isinstance(manifest.get("files"), list) or not manifest["files"]:
        raise ValueError("Unsupported/empty portable manifest")
    seen = set()
    for row in manifest["files"]:
        name = safe_relative(row["path"])
        if name.casefold() in seen or name == PORTABLE_MANIFEST or type(row.get("bytes")) is not int or row["bytes"] < 0 or not re.fullmatch(r"[0-9a-f]{64}", row.get("sha256", "")):
            raise ValueError("Invalid/duplicate portable record")
        seen.add(name.casefold())
        if digest(safe_path(root, name)) != (row["bytes"], row["sha256"]):
            raise ValueError("Portable member hash/size differs: " + name)
    return {"success": True, "files_checked": len(seen), "commit": manifest["continuation_commit"],
            "scope": manifest["scope"], "approved": False, "gameIntegrated": False}


def archive(root, inventory_path, roster, target, receipt, commit, expected_gallery):
    root = root.resolve(strict=True)
    inventory_path, roster = inventory_path.resolve(strict=True), roster.resolve(strict=True)
    target, receipt = target.resolve(), receipt.resolve()
    if not inventory_path.is_relative_to(root) or not roster.is_relative_to(root) or not re.fullmatch(r"[0-9a-f]{40}", commit):
        raise ValueError("Inventory/roster must be in repository and commit must be full SHA")
    raw_inventory = inventory_path.read_bytes()
    inventory = json.loads(raw_inventory)
    verification = verify(root, inventory, strict_bytes=True)
    if not verification["success"]:
        raise ValueError("Source inventory failed: " + str(verification["errors"][:5]))
    if inventory.get("checkpoint_id") != "crwt-2026-10-05-roster-refinement-pass2" or inventory.get("approved") is not False or inventory.get("gameIntegrated") is not False:
        raise ValueError("Expected unapproved/unintegrated Oct05 checkpoint")
    names = {row["path"] for row in inventory["files"]}
    names.add(inventory_path.relative_to(root).as_posix())
    gallery = roster / "BUKA-REVIEW-MODEL.html"
    gallery_name = gallery.relative_to(root).as_posix()
    frozen = json.loads((roster / "BUKA-REVIEW-MODEL.viewer-receipt.json").read_bytes())
    if not re.fullmatch(r"[0-9a-f]{64}", expected_gallery) or digest(gallery) != (frozen["viewer_bytes"], expected_gallery) or frozen["viewer_sha256"] != expected_gallery:
        raise ValueError("Rebuilt gallery/frozen receipt identity differs")
    names.add(gallery_name)
    if names.intersection({PORTABLE_MANIFEST, RESTORE_NOTE}):
        raise ValueError("Generated archive verification names collide with source")
    sources = {name: safe_path(root, name) for name in names}
    if target == receipt or target in sources.values() or receipt in sources.values() or target.exists() or receipt.exists():
        raise FileExistsError("Archive/receipt outputs must be distinct new files outside inputs")
    records = []
    modes = {row["path"]: row.get("mode", "100644") for row in inventory["files"]}
    for name, path in sorted(sources.items()):
        size, sha256 = digest(path)
        mode = modes.get(name, "100644")
        if mode not in ("100644", "100755"):
            raise ValueError("Unsupported portable file mode")
        records.append({"path": name, "bytes": size, "sha256": sha256, "git_mode": mode})
    note = ("CRWT â€” CHECKPOINT SOURCE LENGKAP 05 OKTOBER 2026\n\nCommit: " + commit + "\n\n"
            "Cakupan: seluruh source repository yang dicatat inventory (termasuk Unity, Web30 dan website), "
            "galeri offline hasil rebuild dan evidence compact. Semua source baseline 04 Oktober tetap utuh. "
            "ZIP model-review terpisah menyimpan 70 view, 240 orbit frame dan workspace editable lengkap. "
            "Tidak mencakup Git history/.git, autentikasi, browser save, API key, backend data atau package/node_modules.\n\n"
            "Ekstrak ke folder BARU. Untuk memverifikasi seluruh anggota portable:\npython " +
            (roster.relative_to(root) / "tools/archive_source_checkpoint.py").as_posix() + " --verify-directory .\n\n"
            "Untuk memverifikasi source terbaru:\npython " +
            (roster.relative_to(root) / "tools/verify_checkpoint.py").as_posix() + " --root . --strict-bytes\n\n"
            "Buka " + gallery_name + ". Model masih kandidat; sembilan statis, Pip rig mekanis. "
            "Belum sempurna/disetujui atau terintegrasi runtime. Untuk history/branch, clone repo privat dan "
            "checkout commit di atas. Hash file membuktikan integritas, bukan kualitas visual.\n").encode()
    records.append({"path": RESTORE_NOTE, "bytes": len(note), "sha256": hashlib.sha256(note).hexdigest(), "git_mode": "100644"})
    records.sort(key=lambda row: row["path"])
    portable = {"schema": "crwt.full_source_portable.v1", "continuation_commit": commit,
                "scope": "Complete inventory-listed repository source with compact Oct05 model evidence and rebuilt offline gallery; full rendered model-review bundle is separate.",
                "approved": False, "gameIntegrated": False, "excluded_from_hash": [PORTABLE_MANIFEST + " (self-referential)"], "files": records}
    portable_raw = (json.dumps(portable, indent=2) + "\n").encode()
    target.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(target, "x", zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as z:
        for row in records:
            info = zipfile.ZipInfo(row["path"], date_time=(2026, 10, 5, 0, 0, 0))
            info.create_system = 3; info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = (0o100755 if row["git_mode"] == "100755" else 0o100644) << 16
            if row["path"] == RESTORE_NOTE:
                z.writestr(info, note)
                continue
            h, size = hashlib.sha256(), 0
            with sources[row["path"]].open("rb") as source, z.open(info, "w", force_zip64=True) as out:
                while block := source.read(1024 * 1024):
                    h.update(block)
                    size += len(block)
                    out.write(block)
            if (size, h.hexdigest()) != (row["bytes"], row["sha256"]):
                raise ValueError("Source changed during ZIP creation")
        z.writestr(PORTABLE_MANIFEST, portable_raw)
    if inventory_path.read_bytes() != raw_inventory:
        raise ValueError("Inventory changed during ZIP creation")
    for row in records:
        if row["path"] != RESTORE_NOTE and digest(sources[row["path"]]) != (row["bytes"], row["sha256"]):
            raise ValueError("Source changed after ZIP creation")
    with zipfile.ZipFile(target) as z:
        if z.testzip() is not None or len(z.infolist()) != len(records) + 1 or len({i.filename.casefold() for i in z.infolist()}) != len(records) + 1:
            raise ValueError("ZIP CRC/member identity failed")
        for row in records:
            h, size = hashlib.sha256(), 0
            with z.open(row["path"]) as source:
                while block := source.read(1024 * 1024):
                    h.update(block)
                    size += len(block)
            if (size, h.hexdigest()) != (row["bytes"], row["sha256"]):
                raise ValueError("ZIP member hash differs")
    size, sha256 = digest(target)
    result = {"commit": commit, "zip_bytes": size, "zip_sha256": sha256, "files": len(records) + 1,
              "baseline_blobs_preserved": inventory["preserved_baseline"]["blob_count"], "source_verification_success": True,
              "zip_crc_and_member_hashes_valid": True, "reference_candidate_models": 10, "roster_visual_approved": False,
              "roster_game_integrated": False, "roster_viewer_sha256": expected_gallery, "cloud_generation_in_ci": False,
              "model_geometry_modified_in_ci": False, "game_assets_changed": False,
              "ci_note": "This step completed source verification/build/packaging; overall CI success is determined by the workflow service."}
    receipt.parent.mkdir(parents=True, exist_ok=True)
    with receipt.open("x", encoding="utf-8", newline="\n") as out:
        out.write(json.dumps(result, indent=2) + "\n")
    return result


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--verify-directory", type=Path)
    p.add_argument("--root", type=Path)
    p.add_argument("--inventory", type=Path)
    p.add_argument("--roster", type=Path)
    p.add_argument("--output", type=Path)
    p.add_argument("--receipt", type=Path)
    p.add_argument("--commit")
    p.add_argument("--expected-gallery-sha256")
    a = p.parse_args()
    if a.verify_directory:
        result = verify_directory(a.verify_directory)
    else:
        if not all((a.root, a.inventory, a.roster, a.output, a.receipt, a.commit, a.expected_gallery_sha256)):
            p.error("Archive mode requires root, inventory, roster, output, receipt, commit and expected-gallery-sha256")
        result = archive(a.root, a.inventory, a.roster, a.output, a.receipt, a.commit, a.expected_gallery_sha256)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
