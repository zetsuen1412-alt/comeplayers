#!/usr/bin/env python3
"""Materialize exact HEAD Git blobs into a fresh directory, bypassing EOL filters.

Read-only Git queries, no shell/network/checkout mutation. Checks HEAD commit,
every listed HEAD path/mode/blob, source inventory's own raw Git blob, streamed
size/Git SHA/SHA256, and full strict source verification before issuing receipt.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess

from verify_checkpoint import git_blob_hash, require, safe_path, safe_relative, verify


def git(repo, *args):
    return subprocess.run(["git", "-C", str(repo), *args], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout


def head_entries(repo, commit):
    result, folds = {}, set()
    for raw in git(repo, "ls-tree", "-r", "-z", "--full-tree", commit).split(b"\0"):
        if not raw:
            continue
        header, path_raw = raw.split(b"\t", 1)
        mode, kind, sha = header.decode("ascii").split()
        name = safe_relative(path_raw.decode("utf-8"))
        require(kind == "blob" and mode in ("100644", "100755") and re.fullmatch(r"[0-9a-f]{40}", sha), "Unsupported Git source entry")
        require(name.casefold() not in folds, "Duplicate/case-colliding Git source path")
        folds.add(name.casefold()); result[name] = {"mode": mode, "sha": sha}
    return result


def materialize(repo, inventory_relative, output, commit, receipt=None):
    repo, output = repo.resolve(strict=True), output.resolve()
    inventory_relative = safe_relative(inventory_relative)
    require(re.fullmatch(r"[0-9a-f]{40}", commit), "Expected commit must be the full exact SHA")
    require(git(repo, "rev-parse", "HEAD").strip().decode("ascii") == commit, "Checkout HEAD differs from expected commit")
    require(not output.exists() and not output.is_relative_to(repo / ".git") and output != repo and not repo.is_relative_to(output),
            "Raw source output must be fresh and must not contain/overwrite checkout or Git metadata")
    entries = head_entries(repo, commit)
    require(inventory_relative in entries, "Inventory is not a regular HEAD source file")
    own_blob = entries[inventory_relative]
    inventory_raw = git(repo, "cat-file", "blob", own_blob["sha"])
    require(git_blob_hash(inventory_raw) == own_blob["sha"], "Inventory Git object identity differs")
    manifest = json.loads(inventory_raw)
    require(manifest.get("schema_version") == 1 and isinstance(manifest.get("files"), list) and manifest["files"], "Inventory is unsupported/empty")
    listed, folds = {}, set()
    for record in manifest["files"]:
        name = safe_relative(record["path"])
        require(name.casefold() not in folds and name in entries, "Duplicate/missing HEAD inventory path")
        folds.add(name.casefold())
        require(record.get("git_blob_sha1") == entries[name]["sha"] and record.get("mode", entries[name]["mode"]) == entries[name]["mode"],
                "HEAD path blob/mode differs from inventory: " + name)
        require(type(record.get("bytes")) is int and record["bytes"] >= 0, "Invalid source byte count")
        listed[name] = record
    require(inventory_relative not in listed, "Inventory must exclude itself")
    listed[inventory_relative] = {"path": inventory_relative, "bytes": len(inventory_raw), "git_blob_sha1": own_blob["sha"],
                                  "sha256_recorded": hashlib.sha256(inventory_raw).hexdigest(), "mode": own_blob["mode"]}
    if receipt:
        receipt = receipt.resolve()
        require(not receipt.exists() and not receipt.is_relative_to(output) and receipt not in {safe_path(repo, name) for name in entries},
                "Materialization receipt must be a new path outside source inputs/output")
    output.mkdir(parents=True, exist_ok=False)
    process = subprocess.Popen(["git", "-C", str(repo), "cat-file", "--batch"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    written, byte_count = 0, 0
    try:
        for name, record in sorted(listed.items()):
            expected_sha = record["git_blob_sha1"]
            process.stdin.write((expected_sha + "\n").encode("ascii")); process.stdin.flush()
            header = process.stdout.readline().decode("ascii").rstrip("\n").split()
            require(len(header) == 3 and header[:2] == [expected_sha, "blob"] and header[2].isdigit(), "Invalid Git batch blob header")
            size = int(header[2]); require(size == record["bytes"], "Git blob size differs: " + name)
            path = safe_path(output, name); path.parent.mkdir(parents=True, exist_ok=True)
            sha1 = hashlib.sha1(b"blob " + str(size).encode("ascii") + b"\0"); sha256 = hashlib.sha256()
            remaining = size
            with path.open("xb") as handle:
                while remaining:
                    chunk = process.stdout.read(min(1024 * 1024, remaining))
                    require(chunk, "Truncated Git blob stream")
                    handle.write(chunk); sha1.update(chunk); sha256.update(chunk); remaining -= len(chunk)
            require(process.stdout.read(1) == b"\n" and sha1.hexdigest() == expected_sha, "Git blob stream hash/delimiter differs")
            require(not record.get("sha256_recorded") or sha256.hexdigest() == record["sha256_recorded"], "Supplemental source SHA256 differs")
            os.chmod(path, 0o755 if entries[name]["mode"] == "100755" else 0o644)
            written += 1; byte_count += size
        process.stdin.close()
        require(process.wait(timeout=30) == 0, "Git cat-file batch failed")
    finally:
        if process.poll() is None:
            process.terminate(); process.wait(timeout=30)
        process.stdout.close(); process.stderr.close()
        if not process.stdin.closed:
            process.stdin.close()
    require(safe_path(output, inventory_relative).read_bytes() == inventory_raw, "Materialized inventory bytes differ")
    result = verify(output, manifest, strict_bytes=True)
    require(result["success"], "Strict verification failed after raw Git materialization")
    require(git(repo, "rev-parse", "HEAD").strip().decode("ascii") == commit, "HEAD changed during materialization")
    report = {"schema": "crwt.raw_git_source_materialization.v1", "commit": commit, "source_inventory": inventory_relative,
              "inventory_git_blob_sha1": own_blob["sha"], "files_written": written, "bytes_written": byte_count,
              "head_paths_modes_blobs_checked": True, "raw_git_blobs_used_without_checkout_filters": True, "strict_source_verification": result,
              "checkout_or_git_metadata_modified": False, "network_or_generation_performed": False}
    if receipt:
        receipt.parent.mkdir(parents=True, exist_ok=True)
        with receipt.open("x", encoding="utf-8", newline="\n") as handle:
            handle.write(json.dumps(report, indent=2) + "\n")
    return report


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--repo-root", required=True, type=Path)
    p.add_argument("--inventory", required=True)
    p.add_argument("--out-dir", required=True, type=Path)
    p.add_argument("--expected-commit", required=True)
    p.add_argument("--receipt", type=Path)
    a = p.parse_args()
    print(json.dumps(materialize(a.repo_root, a.inventory, a.out_dir, a.expected_commit, a.receipt), indent=2))


if __name__ == "__main__":
    main()
