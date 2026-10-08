"""One-shot front-only diagnostic; executing this script submits one free Space call.

The existing front.png was made with imagegen from the reviewed reference sheet.
It is NOT the unexported Gemini/Nano Banana image and is NOT an approved final.
Do not rerun after an export failure: recover the saved service result instead.
"""

import dataclasses
import datetime
import hashlib
import json
import pathlib
import shutil
import ssl
import struct
import sys
import urllib.parse
import urllib.request

WORK = pathlib.Path(__file__).resolve().parent
ARCHIVE_ROOT = WORK.parent
OPTIONAL_PYDEPS = ARCHIVE_ROOT / "work" / "pydeps"
INPUT = ARCHIVE_ROOT / "alexia" / "inputs" / "front.png"
OUT = ARCHIVE_ROOT / "alexia" / "v9-front-only-diagnostic"
BASE = "https://tencent-hunyuan3d-2mv.hf.space"
PARAMS = {
    "steps": 10,
    "guidance_scale": 5.0,
    "seed": 1412,
    "octree_resolution": 256,
    "check_box_rembg": True,
    "num_chunks": 8000,
    "randomize_seed": False,
}
MAX_DOWNLOAD_BYTES = 128 * 1024 * 1024


def utc_now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def jsonable(value):
    if isinstance(value, dict):
        return {str(key): jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [jsonable(item) for item in value]
    if dataclasses.is_dataclass(value) and not isinstance(value, type):
        return jsonable(dataclasses.asdict(value))
    if hasattr(value, "model_dump"):
        return jsonable(value.model_dump())
    if isinstance(value, pathlib.Path):
        return str(value)
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


def write_json(path, value):
    temporary = path.with_suffix(path.suffix + ".partial")
    temporary.write_text(json.dumps(jsonable(value), indent=2, ensure_ascii=False), encoding="utf-8")
    temporary.replace(path)


def sha256_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def file_reference(value):
    """Accept a local-path string or FileData dict/dataclass without stringifying it."""
    value = jsonable(value)
    if isinstance(value, dict) and "path" not in value and "value" in value:
        value = value["value"]
    if isinstance(value, str):
        return {"path": value}
    if isinstance(value, dict) and isinstance(value.get("path"), str):
        return value
    raise ValueError("The service did not return a file path or FileData object.")


def check_remote_url(url):
    parsed = urllib.parse.urlparse(url)
    expected = urllib.parse.urlparse(BASE)
    if (
        parsed.scheme != "https"
        or parsed.hostname != expected.hostname
        or parsed.port not in (None, 443)
        or parsed.username is not None
        or parsed.password is not None
    ):
        raise ValueError("Result download URL must stay on the public Hunyuan Space HTTPS origin.")
    return url


class SameOriginRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        check_remote_url(newurl)
        return super().redirect_request(request, fp, code, msg, headers, newurl)


def obtain_result_file(reference, temporary, tls_context):
    path_value = reference["path"]
    local_path = pathlib.Path(path_value)
    # Remote Linux paths are not local downloads. A real local result must be
    # inside this task's work/output directories before it can be copied.
    if not path_value.startswith(("http://", "https://")) and local_path.is_file():
        resolved = local_path.resolve()
        if not (resolved.is_relative_to(WORK) or resolved.is_relative_to(OUT)):
            raise ValueError("Local service result is outside the task's result directories.")
        if resolved.stat().st_size > MAX_DOWNLOAD_BYTES:
            raise ValueError("Local result exceeds the diagnostic's 128 MiB limit.")
        shutil.copy2(resolved, temporary)
        return {"mode": "copy-existing-local-result", "sourceFile": str(resolved)}

    url = reference.get("url")
    if not isinstance(url, str) or not url:
        url = path_value if path_value.startswith(("http://", "https://")) else (
            BASE + "/file=" + urllib.parse.quote(path_value, safe="/")
        )
    url = check_remote_url(urllib.parse.urljoin(BASE + "/", url))
    opener = urllib.request.build_opener(
        SameOriginRedirects(), urllib.request.HTTPSHandler(context=tls_context)
    )
    request = urllib.request.Request(url, headers={"User-Agent": "CRWT-front-only-diagnostic/1.0"})
    with opener.open(request, timeout=120) as response, temporary.open("wb") as target:
        declared = response.headers.get("Content-Length")
        if declared and int(declared) > MAX_DOWNLOAD_BYTES:
            raise ValueError("Result download exceeds the diagnostic's 128 MiB limit.")
        total = 0
        for chunk in iter(lambda: response.read(1024 * 1024), b""):
            total += len(chunk)
            if total > MAX_DOWNLOAD_BYTES:
                raise ValueError("Result download exceeds the diagnostic's 128 MiB limit.")
            target.write(chunk)
    return {"mode": "download-existing-service-result", "bytes": total}


def validate_glb(path):
    size = path.stat().st_size
    with path.open("rb") as stream:
        header = stream.read(20)
    if len(header) < 20:
        raise ValueError("Downloaded GLB is truncated.")
    magic, version, declared, first_chunk_size, first_chunk_type = struct.unpack("<4sIII4s", header)
    if magic != b"glTF" or version != 2:
        raise ValueError("Downloaded result is not a GLB version 2 file.")
    if declared != size:
        raise ValueError("GLB declared length does not match the downloaded file size.")
    if first_chunk_type != b"JSON" or first_chunk_size == 0 or 20 + first_chunk_size > size:
        raise ValueError("GLB first JSON chunk is missing or truncated.")
    return {"magic": "glTF", "version": version, "bytes": size, "declaredLength": declared}


def main():
    if OUT.is_dir() and any(OUT.iterdir()):
        raise SystemExit("Diagnostic output directory already contains saved results. Preserve them; use a separate fresh archive copy for a new diagnostic.")
    OUT.mkdir(parents=True, exist_ok=True)
    marker = OUT / "run-started.lock"
    try:
        with marker.open("x", encoding="utf-8") as lock:
            lock.write(utc_now() + "\n")
    except FileExistsError:
        raise SystemExit("This diagnostic already started. Inspect saved evidence/results; no second submission was made.")

    evidence_path = OUT / "reconstruction-evidence.json"
    candidate = OUT / "alexia-v9-front-only-untextured-diagnostic.glb"
    partial = OUT / "alexia-v9-front-only-untextured-diagnostic.glb.partial"
    evidence = {
        "project": "Crazy Rich: World Tour",
        "character": "Alexia",
        "attempt": "v9-front-only-controlled-diagnostic",
        "purpose": "Controlled removal of inconsistent side/back views using the SAME existing V8 front reference and V8 parameters.",
        "sourceProvenance": "Existing imagegen front view derived from the previously reviewed sheet. NOT a Gemini/Nano Banana output.",
        "provider": "Tencent Hunyuan3D-2mv public ZeroGPU Space",
        "startedUtc": utc_now(),
        "params": PARAMS.copy(),
        "enabledViews": ["front"],
        "disabledViews": ["back", "left", "right"],
        "submissionLimit": 1,
        "meshApproved": False,
        "rigged": False,
        "gameAssetsReplaced": False,
        "productionMeshApproved": False,
        "status": "preflight",
        "generationReturned": False,
    }
    stage = "preflight"
    generation_returned = False
    write_json(evidence_path, evidence)
    try:
        # Prefer optional archive-local packages if present; otherwise use
        # packages installed with this interpreter. Imports stay inside main.
        if OPTIONAL_PYDEPS.is_dir():
            sys.path.insert(0, str(OPTIONAL_PYDEPS))
        import certifi
        from gradio_client import Client, handle_file
        from PIL import Image

        if not INPUT.is_file():
            raise FileNotFoundError("Existing front reference is missing: " + str(INPUT))
        with Image.open(INPUT) as image:
            image.load()
            image_info = {"format": image.format, "mode": image.mode, "size": list(image.size)}
        evidence["input"] = {
            "file": str(INPUT.relative_to(ARCHIVE_ROOT)),
            "sha256": sha256_file(INPUT),
            "image": image_info,
        }
        write_json(evidence_path, evidence)
        tls_context = ssl.create_default_context(cafile=certifi.where())
        client = Client(
            BASE,
            ssl_verify=tls_context,
            httpx_kwargs={"timeout": 120},
            verbose=False,
            analytics_enabled=False,
            # Obtain and save FileData metadata before attempting a download.
            # This prevents an export failure from hiding a successful result.
            download_files=False,
        )
        stage = "submission"
        evidence["status"] = "submitting-once"
        write_json(evidence_path, evidence)
        print("Submitting one front-only diagnostic with existing imagegen input; candidate is unapproved.", flush=True)
        result = client.predict(
            caption=None,
            image=None,
            mv_image_front=handle_file(str(INPUT.resolve())),
            mv_image_back=None,
            mv_image_left=None,
            mv_image_right=None,
            api_name="/shape_generation",
            **PARAMS,
        )
        generation_returned = True
        stage = "saving-result-metadata"
        write_json(OUT / "service-result.json", result)
        evidence.update({"status": "generated-awaiting-download", "generationReturned": True})
        if isinstance(result, (list, tuple)):
            if len(result) > 2:
                evidence["providerReportedMeshStats"] = jsonable(result[2])
            if len(result) > 3:
                evidence["actualSeed"] = jsonable(result[3])
        write_json(evidence_path, evidence)
        if not isinstance(result, (list, tuple)) or not result:
            raise ValueError("Unexpected shape_generation result structure; metadata was saved for recovery.")
        reference = file_reference(result[0])
        stage = "downloading-result"
        evidence["download"] = obtain_result_file(reference, partial, tls_context)
        stage = "validating-downloaded-glb"
        evidence["glbValidation"] = validate_glb(partial)
        evidence["sha256"] = sha256_file(partial)
        partial.replace(candidate)
        evidence.update({
            "status": "diagnostic-generated-awaiting-geometry-review",
            "mesh": candidate.name,
            "inputNote": "Only the existing V8 front was supplied. Hidden surfaces are inferred; identity/fidelity and side/back construction remain unverified.",
        })
        print(json.dumps({"mesh": str(candidate), "sha256": evidence["sha256"], "status": evidence["status"]}), flush=True)
        return 0
    except Exception as exc:
        evidence.update({
            "status": "download-failed-after-generation" if generation_returned else (
                "preflight-failed" if stage == "preflight" else "generation-or-transport-failed"
            ),
            "generationReturned": generation_returned,
            "failedStage": stage,
            "errorClass": type(exc).__name__,
            "error": str(exc),
            "recoveryInstruction": "Inspect saved service-result.json and partial/cached files. No automatic retry or second generation is permitted by this diagnostic.",
        })
        print(type(exc).__name__ + ": " + str(exc), flush=True)
        return 1
    finally:
        evidence["endedUtc"] = utc_now()
        write_json(evidence_path, evidence)


if __name__ == "__main__":
    raise SystemExit(main())
