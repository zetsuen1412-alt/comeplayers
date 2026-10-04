#!/usr/bin/env python3
"""Read-only verification of the CRWT portable snapshot. Python 3.10+, stdlib only."""
import argparse
import hashlib
import json
import pathlib
import sys

TEXT_SUFFIXES = {".md", ".txt", ".json", ".js", ".mjs", ".cjs", ".ts", ".tsx",
                 ".html", ".css", ".sql", ".yml", ".yaml", ".py", ".cs", ".meta",
                 ".unity", ".mat", ".asset", ".shader", ".webmanifest", ".xml",
                 ".bat", ".ps1", ".gitignore", ".gitattributes", ".sh"}
TEXT_NAMES = {".gitignore", ".gitattributes", ".env.example"}

def git_blob_hash(data):
    return hashlib.sha1(b"blob " + str(len(data)).encode("ascii") + b"\0" + data).hexdigest()

def safe_path(root, relative):
    if not isinstance(relative, str) or not relative or "\\" in relative or ":" in relative:
        raise ValueError("invalid inventory path")
    posix = pathlib.PurePosixPath(relative)
    if posix.is_absolute() or ".." in posix.parts:
        raise ValueError("inventory path must stay inside repository")
    result = root.joinpath(*posix.parts).resolve()
    if not result.is_relative_to(root):
        raise ValueError("resolved inventory path escapes repository")
    return result

def verify(root, manifest):
    errors, normalized, checked = [], [], 0
    files = manifest.get("files")
    if manifest.get("schema_version") != 1 or not isinstance(files, list) or not files:
        raise ValueError("unsupported or empty checkpoint inventory")
    paths = [entry["path"] for entry in files]
    if len(paths) != len(set(paths)):
        raise ValueError("duplicate inventory path")
    for entry in files:
        name = entry["path"]
        path = safe_path(root, name)
        if not path.is_file():
            errors.append(f"missing: {name}")
            continue
        data = path.read_bytes()
        matches = len(data) == entry["bytes"] and git_blob_hash(data) == entry["git_blob_sha1"]
        if not matches and (path.suffix.lower() in TEXT_SUFFIXES or path.name in TEXT_NAMES) and b"\0" not in data:
            try:
                data.decode("utf-8")
                clean = data.replace(b"\r\n", b"\n")
                matches = len(clean) == entry["bytes"] and git_blob_hash(clean) == entry["git_blob_sha1"]
                if matches:
                    normalized.append(name)
                    data = clean
            except UnicodeDecodeError:
                pass
        if not matches:
            errors.append(f"content/size mismatch: {name}")
        elif entry.get("sha256_recorded") and hashlib.sha256(data).hexdigest() != entry["sha256_recorded"]:
            errors.append(f"recorded SHA-256 mismatch: {name}")
        else:
            checked += 1
    return {"checkpoint_id": manifest["checkpoint_id"], "checked": checked,
            "expected": len(files), "crlf_normalized_for_hash": normalized,
            "errors": errors, "success": not errors}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=pathlib.Path, help="Repository root (default: inferred from script location)")
    parser.add_argument("--manifest", type=pathlib.Path, help="Inventory JSON (default: latest checkpoint available in this checkout)")
    args = parser.parse_args()
    root = (args.root or pathlib.Path(__file__).resolve().parents[3]).resolve()
    latest = root / "Crazy-Rich-World-Tour-Unity-28.0/Web30/checkpoints/2026-10-04-gameplay-continuity/inventory.json"
    original = root / "Crazy-Rich-World-Tour-Unity-28.0/Web30/checkpoints/2026-10-04/inventory.json"
    manifest_path = args.manifest or (latest if latest.is_file() else original)
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        result = verify(root, manifest)
        print(json.dumps(result, indent=2))
        return 0 if result["success"] else 1
    except (OSError, ValueError, KeyError, TypeError) as exc:
        print(f"Checkpoint verification failed: {exc}", file=sys.stderr)
        return 2

if __name__ == "__main__":
    raise SystemExit(main())
