#!/usr/bin/env python3
"""Read-only CRWT source checkpoint verification. Python 3.10+, stdlib only.

This is a NEW Oct05 tool; do not overwrite the frozen Web30/tools verifier.
Default selection prefers the newest dated inventory, then roster refinement,
roster reference, gameplay continuity and the original inventory on equal dates.
CI uses --strict-bytes. Optional --receipt must be a new path outside inputs.
"""
import argparse
import datetime
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys

WEB30 = "Crazy-Rich-World-Tour-Unity-28.0/Web30"
TEXT_SUFFIXES = {".md", ".txt", ".json", ".js", ".mjs", ".cjs", ".ts", ".tsx",
                 ".html", ".css", ".sql", ".yml", ".yaml", ".py", ".cs", ".meta",
                 ".unity", ".mat", ".asset", ".shader", ".webmanifest", ".xml",
                 ".bat", ".ps1", ".gitignore", ".gitattributes", ".sh"}
TEXT_NAMES = {".gitignore", ".gitattributes", ".env.example"}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def git_blob_hash(raw):
    return hashlib.sha1(b"blob " + str(len(raw)).encode("ascii") + b"\0" + raw).hexdigest()


def safe_relative(relative):
    require(isinstance(relative, str) and relative and "\\" not in relative and ":" not in relative and not any(c in relative for c in "\r\n\t\0"),
            "Expected a repository-relative POSIX path")
    p = PurePosixPath(relative)
    require(not p.is_absolute() and ".." not in p.parts and relative == p.as_posix(),
            "Path is noncanonical or escapes repository")
    require(".git" not in p.parts, "Git metadata is outside checkpoint scope")
    return relative


def safe_path(root, relative):
    relative = safe_relative(relative)
    p = root.joinpath(*PurePosixPath(relative).parts)
    for parent in [p, *p.parents]:
        if parent == root:
            break
        require(not parent.is_symlink(), "Symlink checkpoint member: " + relative)
    result = p.resolve()
    require(result.is_relative_to(root), "Resolved path escapes repository")
    return result


def infer_root(script):
    for candidate in Path(script).resolve().parents:
        if (candidate / WEB30 / "checkpoints").is_dir():
            return candidate
    raise ValueError("Supply --root; repository cannot be inferred from script location")


def resolve_latest_inventory(root):
    directory = root / WEB30 / "checkpoints"
    require(directory.is_dir(), "Checkpoint directory missing")
    choices = []
    for folder in directory.iterdir():
        if not folder.is_dir() or not re.fullmatch(r"\d{4}-\d{2}-\d{2}(?:-[a-z0-9-]+)?", folder.name):
            continue
        path = safe_path(root, folder.relative_to(root).as_posix() + "/inventory.json")
        if not path.is_file():
            continue
        data = json.loads(path.read_bytes())
        require(data.get("schema_version") == 1 and isinstance(data.get("files"), list) and data["files"],
                "Malformed dated checkpoint inventory: " + folder.name)
        date = data.get("date")
        require(isinstance(date, str) and date == folder.name[:10], "Checkpoint date/path mismatch")
        datetime.date.fromisoformat(date)
        rank = 3 if "roster-refinement" in folder.name else 2 if "roster-reference" in folder.name else 1 if "gameplay-continuity" in folder.name else 0
        choices.append((date, rank, folder.name, path))
    require(choices, "No valid dated checkpoint inventories found")
    return max(choices)[-1]


def git_line_ending_equivalent(root, name, actual, entry):
    """Optional clone fallback; verify actual HEAD path/object, then text equivalence."""
    try:
        identity = subprocess.run(["git", "-C", str(root), "rev-parse", "--verify", "HEAD:" + name],
                                  check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout.strip().decode("ascii")
        if identity != entry["git_blob_sha1"]:
            return None
        blob = subprocess.run(["git", "-C", str(root), "cat-file", "blob", identity],
                              check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout
        if len(blob) != entry["bytes"] or git_blob_hash(blob) != identity or b"\0" in blob:
            return None
        blob.decode("utf-8"); actual.decode("utf-8")
        if blob.replace(b"\r\n", b"\n") != actual.replace(b"\r\n", b"\n"):
            return None
        return blob
    except (OSError, subprocess.CalledProcessError, UnicodeError):
        return None


def verify(root, manifest, strict_bytes=False):
    require(manifest.get("schema_version") == 1 and isinstance(manifest.get("checkpoint_id"), str),
            "Unsupported checkpoint inventory header")
    files = manifest.get("files")
    require(isinstance(files, list) and files, "Checkpoint inventory is empty")
    seen, errors, normalized, git_equivalent, checked = set(), [], [], [], 0
    for entry in files:
        require(isinstance(entry, dict), "Invalid inventory entry")
        name = safe_relative(entry.get("path"))
        require(name.casefold() not in seen, "Duplicate/case-colliding inventory path: " + name)
        seen.add(name.casefold())
        require(type(entry.get("bytes")) is int and entry["bytes"] >= 0 and
                isinstance(entry.get("git_blob_sha1"), str) and re.fullmatch(r"[0-9a-f]{40}", entry["git_blob_sha1"]),
                "Invalid recorded size/Git blob hash: " + name)
        supplemental = entry.get("sha256_recorded")
        require(supplemental is None or isinstance(supplemental, str) and re.fullmatch(r"[0-9a-f]{64}", supplemental),
                "Invalid recorded SHA-256: " + name)
        path = safe_path(root, name)
        if not path.is_file():
            errors.append("missing: " + name)
            continue
        raw = path.read_bytes()
        matches = len(raw) == entry["bytes"] and git_blob_hash(raw) == entry["git_blob_sha1"]
        if not matches and not strict_bytes and (path.suffix.lower() in TEXT_SUFFIXES or path.name in TEXT_NAMES) and b"\0" not in raw:
            try:
                raw.decode("utf-8")
                clean = raw.replace(b"\r\n", b"\n")
                matches = len(clean) == entry["bytes"] and git_blob_hash(clean) == entry["git_blob_sha1"]
                if matches:
                    normalized.append(name)
                    raw = clean
            except UnicodeDecodeError:
                pass
            if not matches:
                canonical = git_line_ending_equivalent(root, name, raw, entry)
                if canonical is not None:
                    matches = True
                    raw = canonical
                    git_equivalent.append(name)
        if not matches:
            errors.append("content/size mismatch: " + name)
        elif supplemental and hashlib.sha256(raw).hexdigest() != supplemental:
            errors.append("recorded SHA-256 mismatch: " + name)
        else:
            checked += 1
    preservation = manifest.get("preserved_baseline", {})
    if preservation:
        require(type(preservation.get("blob_count")) is int and preservation["blob_count"] > 0,
                "Invalid preserved baseline count")
        baseline = [entry for entry in files if entry.get("preserved_baseline_blob") is True]
        require(len(baseline) == preservation["blob_count"], "Preserved baseline blob count differs")
        require(not manifest.get("deleted_paths"), "Preserved checkpoint must not delete source paths")
    return {"checkpoint_id": manifest["checkpoint_id"], "checked": checked, "expected": len(files),
            "strict_bytes": strict_bytes, "crlf_normalized_for_hash": normalized,
            "checkedout_line_ending_equivalent_via_verified_head_git_blob": git_equivalent,
            "errors": errors, "success": not errors,
            "limits": "Source byte/hash integrity only; no visual fidelity, rig or gameplay approval."}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--root", type=Path)
    p.add_argument("--manifest", type=Path)
    p.add_argument("--strict-bytes", action="store_true")
    p.add_argument("--receipt", type=Path)
    a = p.parse_args()
    try:
        root = (a.root or infer_root(__file__)).resolve()
        manifest_path = a.manifest or resolve_latest_inventory(root)
        if not manifest_path.is_absolute():
            manifest_path = root / manifest_path
        manifest_path = manifest_path.resolve(strict=True)
        require(manifest_path.is_relative_to(root), "Inventory must be inside repository root")
        safe_path(root, manifest_path.relative_to(root).as_posix())
        raw = manifest_path.read_bytes()
        manifest = json.loads(raw)
        result = verify(root, manifest, a.strict_bytes)
        result.update({"manifest": manifest_path.relative_to(root).as_posix(),
                       "manifest_sha256": hashlib.sha256(raw).hexdigest()})
        require(manifest_path.read_bytes() == raw, "Inventory changed during verification")
        if a.receipt:
            out = a.receipt.resolve()
            inputs = {manifest_path, *(safe_path(root, entry["path"]) for entry in manifest["files"])}
            require(out not in inputs and not out.exists(), "Receipt must be a new path outside checkpoint inputs")
            out.parent.mkdir(parents=True, exist_ok=True)
            with out.open("x", encoding="utf-8", newline="\n") as handle:
                handle.write(json.dumps(result, indent=2) + "\n")
        print(json.dumps(result, indent=2))
        return 0 if result["success"] else 1
    except (OSError, ValueError, KeyError, TypeError) as exc:
        print("Checkpoint verification failed: " + str(exc), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
