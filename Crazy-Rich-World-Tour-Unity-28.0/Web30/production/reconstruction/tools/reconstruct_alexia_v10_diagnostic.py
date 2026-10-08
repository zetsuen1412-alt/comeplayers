"""One-shot V10 Nano Banana FRONT capture diagnostic.

Running normally submits at most one free Hunyuan Space shape call. For offline
input validation only, run with --validate-only; that mode never creates a
provider client, output folder, or run lock.

The expected JPEG is an annotation-free UI crop of the actual corrected FRONT
image displayed by Gemini in container 4bca68acb91fd063. It was captured at about
584 px, NOT exported as the original full-size PNG. Record the capture JPEG's
SHA-256 from its exact bytes; never substitute the earlier imagegen front.
This low-resolution screenshot source is diagnostic and unapproved. Back/side
views stay disabled until a separate multiview-consistency review passes.
Do not rerun after a transport/export failure; recover saved service metadata.
"""

import argparse
import dataclasses
import datetime
import hashlib
import io
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
INPUT = ARCHIVE_ROOT / "alexia" / "nano-banana-ui-review" / "nano-banana-front-capture.jpg"
OUT = ARCHIVE_ROOT / "alexia" / "v10-nano-banana-front-diagnostic"
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
SOURCE_CONTAINER = "4bca68acb91fd063"
EXPECTED_UI_CROP_WIDTH = 584
MIN_INPUT_DIMENSION = 512
MAX_INPUT_BYTES = 32 * 1024 * 1024
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


def validate_input(path=INPUT):
    """Decode exact capture bytes, enforce JPEG >=512 on both axes, record hash.

    This helper has no provider/network calls. A valid file is not proof that
    the crop is annotation-free or source-faithful; those require visual review.
    Returned bytes are later snapshotted so the upload matches the recorded hash.
    """
    if not path.is_file():
        raise FileNotFoundError("Required Nano Banana FRONT UI capture is missing; no fallback: " + str(path))
    if path.stat().st_size > MAX_INPUT_BYTES:
        raise ValueError("Capture exceeds the diagnostic's 32 MiB input limit.")
    payload = path.read_bytes()
    if len(payload) > MAX_INPUT_BYTES or not payload.startswith(b"\xff\xd8\xff"):
        raise ValueError("Input must be an actual JPEG capture, not a renamed PNG or other format.")
    # Keep Pillow available to offline validation without importing API clients.
    if OPTIONAL_PYDEPS.is_dir():
        sys.path.insert(0, str(OPTIONAL_PYDEPS))
    from PIL import Image

    with Image.open(io.BytesIO(payload)) as image:
        image.load()
        if image.format != "JPEG":
            raise ValueError("Decoded capture format is not JPEG.")
        if min(image.size) < MIN_INPUT_DIMENSION:
            raise ValueError("Capture width and height must each be at least 512 px.")
        image_info = {"format": image.format, "mode": image.mode, "size": list(image.size)}
    capture_sha256 = hashlib.sha256(payload).hexdigest()
    return {
        "file": str(path),
        "sha256": capture_sha256,
        "sourceImageCaptureJpegSha256": capture_sha256,
        "bytes": len(payload),
        "image": image_info,
        "captureProvenance": {
            "provider": "Gemini Apps / Nano Banana UI",
            "correctedFrontContainer": SOURCE_CONTAINER,
            "captureKind": "screenshot-cropped JPEG",
            "expectedUiCropWidthPx": EXPECTED_UI_CROP_WIDTH,
            "originalFullSizePng": False,
            "intendedCrop": "annotation-free generated-image area",
            "annotationFreeVisualReviewRequired": True,
            "requestedChanges": "coherent layered hair and clean mild A-pose",
            "lowResolutionLimitation": "About 584 px UI crop; compression/capture detail is limited. Not an original full-resolution image export.",
            "multiviewConsistencyPassed": False,
            "diagnosticInputApprovedAsFinal": False,
        },
    }, payload


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
    request = urllib.request.Request(url, headers={"User-Agent": "CRWT-nano-banana-front-diagnostic/1.0"})
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


def main(validate_only=False):
    # Validate before locking/importing a network client. A missing/invalid crop
    # never submits, never uses old imagegen, and never consumes the run marker.
    try:
        input_info, capture_bytes = validate_input(INPUT)
    except Exception as exc:
        print(json.dumps({
            "status": "offline-input-validation-failed",
            "errorClass": type(exc).__name__,
            "error": str(exc),
            "submitted": False,
            "fallbackUsed": False,
        }), flush=True)
        return 2
    if validate_only:
        print(json.dumps({
            "status": "offline-input-validation-passed",
            "input": input_info,
            "submitted": False,
            "note": "JPEG/size/hash only; visual crop and identity approval remain separate.",
        }), flush=True)
        return 0

    if OUT.is_dir() and any(OUT.iterdir()):
        raise SystemExit("Diagnostic output directory already contains saved results. Preserve them; use a separate fresh archive copy for a new diagnostic.")
    OUT.mkdir(parents=True, exist_ok=True)
    marker = OUT / "run-started.lock"
    try:
        with marker.open("x", encoding="utf-8") as lock:
            lock.write(utc_now() + "\n")
    except FileExistsError:
        raise SystemExit("This V10 diagnostic already started. Recover saved evidence/results; no second submission was made.")

    evidence_path = OUT / "reconstruction-evidence.json"
    candidate = OUT / "alexia-v10-nano-banana-front-untextured-diagnostic.glb"
    partial = candidate.with_suffix(candidate.suffix + ".partial")
    snapshot = OUT / "input-capture.jpg"
    evidence = {
        "project": "Crazy Rich: World Tour",
        "character": "Alexia",
        "attempt": "v10-nano-banana-front-capture-controlled-diagnostic",
        "purpose": "Compare changed Nano Banana corrected FRONT hair/A-pose input with V9 using unchanged Hunyuan parameters; front only until multiview consistency passes.",
        "sourceProvenance": "Actual Gemini corrected FRONT container 4bca68acb91fd063 captured as an annotation-free intended 584 px UI JPEG crop; NOT original full-size PNG and NOT the prior imagegen input.",
        "provider": "Tencent Hunyuan3D-2mv public ZeroGPU Space",
        "startedUtc": utc_now(),
        "params": PARAMS.copy(),
        "enabledViews": ["front"],
        "disabledViews": ["back", "left", "right"],
        "submissionLimit": 1,
        "automaticRetry": False,
        "input": input_info,
        "meshApproved": False,
        "sourceFidelityApproved": False,
        "textureApproved": False,
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
        # Preserve exactly the decoded/hashed capture bytes, even if the original
        # UI-capture file later changes. This snapshot is the sole upload input.
        with snapshot.open("xb") as stream:
            stream.write(capture_bytes)
        evidence["input"]["submittedSnapshot"] = snapshot.name
        evidence["input"]["submittedSnapshotSha256"] = sha256_file(snapshot)
        if evidence["input"]["submittedSnapshotSha256"] != input_info["sha256"]:
            raise ValueError("Snapshot hash differs from validated JPEG capture.")
        write_json(evidence_path, evidence)

        if OPTIONAL_PYDEPS.is_dir():
            sys.path.insert(0, str(OPTIONAL_PYDEPS))
        import certifi
        from gradio_client import Client, handle_file

        tls_context = ssl.create_default_context(cafile=certifi.where())
        stage = "provider-client-initialization"
        client = Client(
            BASE,
            ssl_verify=tls_context,
            httpx_kwargs={"timeout": 120},
            verbose=False,
            analytics_enabled=False,
            # Save FileData metadata before any result download, as in V9.
            download_files=False,
        )
        stage = "submission"
        evidence["status"] = "submitting-once"
        write_json(evidence_path, evidence)
        print("Submitting one V10 Nano Banana UI-capture FRONT diagnostic; low-resolution candidate is unapproved.", flush=True)
        result = client.predict(
            caption=None,
            image=None,
            mv_image_front=handle_file(str(snapshot.resolve())),
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
            "inputNote": "Only the low-resolution Nano Banana corrected FRONT UI capture was supplied. Hidden surfaces are inferred; source-fidelity and side/back construction remain unverified.",
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
            "recoveryInstruction": "Inspect saved service-result.json, partial files and cache. Do not delete the run lock or resubmit; recover the already returned result if available. No automatic retry or second generation is permitted.",
        })
        print(type(exc).__name__ + ": " + str(exc), flush=True)
        return 1
    finally:
        evidence["endedUtc"] = utc_now()
        write_json(evidence_path, evidence)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--validate-only", action="store_true", help="Decode/check/hash the JPEG offline; no provider call, output directory or run lock.")
    args = parser.parse_args()
    raise SystemExit(main(validate_only=args.validate_only))

