"""One-shot V12 controlled Hunyuan3D 2.1 texture diagnostic.

Normal execution submits one generation_all call ONLY after the actual V11
geometry review explicitly permits controlled texture inspection and the V11
baseline and exact Nano Banana FRONT JPEG hash checks pass. --validate-only is
offline and creates no provider client, output directory or run lock.

generation_all regenerates geometry; it cannot reuse the cached V11 mesh.
Face reduction, remeshing and UV processing create a new candidate requiring
independent geometry and texture review. Result[0] is WHITE OBJ, result[1] is
textured GLB, result[3] is stats and result[4] is seed. No automatic retry.
The 584px screenshot JPEG retains a lower-right sparkle; it is not an original
PNG or certified mark-free capture. Hidden back/side surfaces remain inferred.
All final geometry, texture, rigging and game approval fields remain false.
"""

import argparse
import base64
import dataclasses
import datetime
import hashlib
import io
import json
import math
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
OUT = ARCHIVE_ROOT / "alexia" / "v12-hunyuan21-texture-diagnostic"
BASE = "https://tencent-hunyuan3d-2-1.hf.space"
API_INFO = WORK / "hunyuan21-info.json"
V11_DIR = ARCHIVE_ROOT / "alexia" / "v11-hunyuan21-diagnostic"
V11_REVIEW = V11_DIR / "geometry-review.json"
V11_MESH = V11_DIR / "alexia-v11-hunyuan21-untextured-diagnostic.glb"
EXPECTED_V11_MESH_SHA256 = "d0a0fea651079aa98d026a1610ef0a9e7f4c14c0c466cb1d949886df45c24a66"
EXPECTED_INPUT_SHA256 = "1202424fc57571aaad7b7e1389d4de1ae7ba155c1ec113bd4425b5f05ab02928"
EXPECTED_MODEL = "tencent/Hunyuan3D-2.1/hunyuan3d-dit-v2-1"
SOURCE_CONTAINER = "4bca68acb91fd063"
EXPECTED_UI_CROP_WIDTH = 584
MIN_INPUT_DIMENSION = 512
MAX_INPUT_BYTES = 32 * 1024 * 1024
MAX_DOWNLOAD_BYTES = 128 * 1024 * 1024
PARAMS = {
    "steps": 30,
    "guidance_scale": 5.0,
    "seed": 1412,
    "octree_resolution": 256,
    "check_box_rembg": True,
    "num_chunks": 8000,
    "randomize_seed": False,
}


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
    if capture_sha256 != EXPECTED_INPUT_SHA256:
        raise ValueError("Capture SHA-256 differs from the exact V10 Nano Banana JPEG; no replacement or fallback is permitted.")
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
            "intendedCrop": "generated-image area with no UI controls over the character",
            "annotationFreeVisualReviewRequired": True,
            "markFreeCaptureCertified": False,
            "visibleCaptureArtifact": "Small white sparkle in lower-right background; outside the character but retained in the exact JPEG.",
            "requestedChanges": "coherent layered hair and clean mild A-pose",
            "lowResolutionLimitation": "About 584 px UI crop; compression/capture detail is limited. Not an original full-resolution image export.",
            "multiviewConsistencyPassed": False,
            "diagnosticInputApprovedAsFinal": False,
        },
    }, payload


def shape_generation_arguments(snapshot, handle_file):
    """Exactly the 12 exposed shape args; no caption or multiview upload."""
    return {
        "image": handle_file(str(snapshot.resolve())),
        "mv_image_front": None,
        "mv_image_back": None,
        "mv_image_left": None,
        "mv_image_right": None,
        **PARAMS,
    }


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
    request = urllib.request.Request(url, headers={"User-Agent": "CRWT-hunyuan21-shape-diagnostic/1.0"})
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


def validate_source_gate(review_path=None, mesh_path=None):
    review_path = V11_REVIEW if review_path is None else pathlib.Path(review_path)
    mesh_path = V11_MESH if mesh_path is None else pathlib.Path(mesh_path)
    payload = review_path.read_bytes()
    review = json.loads(payload)
    if review.get("textureCandidateEligible") is not True:
        raise ValueError("Actual V11 geometry review does not explicitly permit a controlled texture diagnostic.")
    if review.get("meshSha256") != EXPECTED_V11_MESH_SHA256:
        raise ValueError("V11 review refers to a different mesh hash; no provider call is permitted.")
    if not mesh_path.is_file() or sha256_file(mesh_path) != EXPECTED_V11_MESH_SHA256:
        raise ValueError("Preserved V11 mesh is missing or its actual hash changed.")
    provenance = review.get("provenance", {})
    if provenance.get("inputSha256") != EXPECTED_INPUT_SHA256:
        raise ValueError("V11 review input hash is not the exact Nano Banana FRONT JPEG.")
    return {
        "file": str(review_path), "reviewSha256": hashlib.sha256(payload).hexdigest(),
        "textureCandidateEligible": True, "reviewVerdict": review.get("verdict"),
        "gateScope": review.get("gateScope"), "baselineMesh": str(mesh_path),
        "baselineMeshSha256": EXPECTED_V11_MESH_SHA256, "baselineHashVerified": True,
        "permissionForDiagnosticOnly": True, "gateTransfersToNewGeometry": False,
    }


def validate_api_contract():
    payload = API_INFO.read_bytes()
    endpoint = json.loads(payload)["named_endpoints"]["/generation_all"]
    names = [p["parameter_name"] for p in endpoint["parameters"]]
    expected = ["image", "mv_image_front", "mv_image_back", "mv_image_left", "mv_image_right",
                "steps", "guidance_scale", "seed", "octree_resolution", "check_box_rembg",
                "num_chunks", "randomize_seed"]
    if names != expected or set(shape_generation_arguments(INPUT, lambda path: path)) != set(names):
        raise ValueError("Cached generation_all API is not the expected 12-argument contract.")
    components = [item["component"] for item in endpoint["returns"]]
    if components != ["File", "File", "Html", "Json", "Slider"]:
        raise ValueError("Cached generation_all return slots differ from WHITE OBJ / textured GLB / HTML / stats / seed.")
    defaults = {p["parameter_name"]: p.get("parameter_default") for p in endpoint["parameters"]}
    for name in ("steps", "guidance_scale", "octree_resolution", "check_box_rembg", "num_chunks"):
        if defaults.get(name) != PARAMS[name]:
            raise ValueError("Standard diagnostic default mismatch for " + name)
    if PARAMS["seed"] != 1412 or PARAMS["randomize_seed"] is not False:
        raise ValueError("Fixed diagnostic seed changed.")
    return {"file": str(API_INFO), "sha256": hashlib.sha256(payload).hexdigest(),
            "endpoint": "/generation_all", "parameterNames": names, "parameterCount": 12,
            "returnComponents": components, "offlineContractValidated": True,
            "captionParameterSupplied": False, "allMultiviewSlotsDisabled": True}


def generation_all_result(result):
    if not isinstance(result, (tuple, list)) or len(result) != 5:
        raise ValueError("generation_all must return exactly five slots; saved metadata is available for recovery.")
    stats = jsonable(result[3])
    if not isinstance(stats, dict):
        raise ValueError("generation_all stats must be an object at index 3.")
    return {"whiteObj": file_reference(result[0]), "texturedGlb": file_reference(result[1]),
            "stats": stats, "seed": jsonable(result[4])}


def inspect_obj(path):
    vertices = faces = texture_coordinates = normals = polygon_faces = fan_triangles = 0
    max_positive_index = 0
    with path.open("r", encoding="utf-8-sig") as stream:
        for line in stream:
            fields = line.split("#", 1)[0].split()
            if not fields:
                continue
            if fields[0] == "v":
                if len(fields) < 4 or not all(math.isfinite(float(v)) for v in fields[1:4]):
                    raise ValueError("OBJ contains an invalid/non-finite vertex.")
                vertices += 1
            elif fields[0] == "vt":
                texture_coordinates += 1
            elif fields[0] == "vn":
                normals += 1
            elif fields[0] == "f":
                if len(fields) < 4:
                    raise ValueError("OBJ face has fewer than three vertices.")
                for value in fields[1:]:
                    index = int(value.split("/", 1)[0])
                    if index == 0 or (index < 0 and -index > vertices):
                        raise ValueError("OBJ face references an invalid vertex index.")
                    max_positive_index = max(max_positive_index, index)
                faces += 1
                fan_triangles += len(fields) - 3
                polygon_faces += int(len(fields) > 4)
    if vertices == 0 or faces == 0 or max_positive_index > vertices:
        raise ValueError("OBJ has no usable geometry or references missing vertices.")
    return {"vertices": vertices, "faces": faces, "polygonFaces": polygon_faces,
            "trianglesIfFanTriangulated": fan_triangles, "textureCoordinates": texture_coordinates,
            "vertexNormals": normals, "basis": "Actual downloaded OBJ v/f records; n-gons remain face records."}


def inspect_textured_glb(path):
    header = validate_glb(path)
    with path.open("rb") as stream:
        stream.seek(12)
        json_length, chunk_type = struct.unpack("<I4s", stream.read(8))
        document = json.loads(stream.read(json_length))
        binary_chunk_bytes = 0
        while stream.tell() < header["bytes"]:
            chunk_header = stream.read(8)
            if len(chunk_header) != 8:
                raise ValueError("GLB contains a truncated chunk header.")
            length, kind = struct.unpack("<I4s", chunk_header)
            if stream.tell() + length > header["bytes"]:
                raise ValueError("GLB contains a truncated data chunk.")
            if kind == b"BIN\x00":
                binary_chunk_bytes += length
            stream.seek(length, 1)
    if document.get("asset", {}).get("version") != "2.0":
        raise ValueError("GLB JSON does not declare glTF 2.0.")
    accessors = document.get("accessors", [])
    positions = set()
    faces = primitives = textured_primitives = 0
    materials = document.get("materials", [])
    textures = document.get("textures", [])
    images = document.get("images", [])
    if not materials or not textures or not images:
        raise ValueError("Returned GLB JSON contains no materials/textures/images.")
    for texture in textures:
        image_index = texture.get("source")
        if not isinstance(image_index, int) or not 0 <= image_index < len(images):
            raise ValueError("GLB texture refers to a missing image.")
    views, buffers = document.get("bufferViews", []), document.get("buffers", [])
    image_records = []
    for image in images:
        uri = image.get("uri")
        if isinstance(uri, str) and uri.startswith("data:image/"):
            prefix, separator, encoded = uri.partition(",")
            if not separator or ";base64" not in prefix or not base64.b64decode(encoded, validate=True):
                raise ValueError("Embedded GLB image data URI is empty or invalid.")
            image_records.append({"storage": "embedded-data-uri", "declaredMediaType": prefix[5:].split(";", 1)[0]})
        elif isinstance(image.get("bufferView"), int):
            index = image["bufferView"]
            if not 0 <= index < len(views):
                raise ValueError("GLB image bufferView is missing.")
            view = views[index]
            buffer_index = view.get("buffer", 0)
            if not isinstance(buffer_index, int) or not 0 <= buffer_index < len(buffers):
                raise ValueError("GLB image buffer is missing.")
            offset, length = view.get("byteOffset", 0), view.get("byteLength", 0)
            if buffers[buffer_index].get("uri") is not None or length <= 0 or offset < 0 or offset + length > binary_chunk_bytes:
                raise ValueError("GLB image is external or its bufferView is truncated.")
            image_records.append({"storage": "embedded-buffer-view", "declaredMediaType": image.get("mimeType"), "bytes": length})
        else:
            raise ValueError("GLB image is external or missing; preserve an inspectable self-contained artifact.")
    for mesh in document.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            primitives += 1
            position_index = primitive.get("attributes", {}).get("POSITION")
            if not isinstance(position_index, int) or not 0 <= position_index < len(accessors):
                raise ValueError("GLB primitive has no valid POSITION accessor.")
            position_accessor = accessors[position_index]
            if position_accessor.get("type") != "VEC3" or not isinstance(position_accessor.get("count"), int) or position_accessor["count"] <= 0:
                raise ValueError("GLB POSITION accessor is invalid.")
            positions.add(position_index)
            index_accessor = primitive.get("indices")
            count = position_accessor["count"]
            if index_accessor is not None:
                if not isinstance(index_accessor, int) or not 0 <= index_accessor < len(accessors):
                    raise ValueError("GLB index accessor is missing.")
                count = accessors[index_accessor].get("count")
            if primitive.get("mode", 4) != 4 or not isinstance(count, int) or count <= 0 or count % 3:
                raise ValueError("GLB geometry is not a valid triangle-list primitive.")
            faces += count // 3
            material_index = primitive.get("material")
            if isinstance(material_index, int) and 0 <= material_index < len(materials):
                pbr = materials[material_index].get("pbrMetallicRoughness", {})
                for slot in ("baseColorTexture", "metallicRoughnessTexture"):
                    if slot in pbr:
                        texture_index = pbr[slot].get("index")
                        if not isinstance(texture_index, int) or not 0 <= texture_index < len(textures):
                            raise ValueError("GLB PBR material references a missing texture.")
                textured_primitives += int("baseColorTexture" in pbr)
    if not faces or not textured_primitives:
        raise ValueError("GLB has no triangle geometry with assigned base-color texture.")
    return {"glbValidation": header, "geometry": {"faces": faces,
            "positionAccessorVertices": sum(accessors[i]["count"] for i in positions),
            "meshes": len(document.get("meshes", [])), "primitives": primitives,
            "basis": "Downloaded GLB JSON triangle/accessor counts; UV seam vertices can be duplicated; not unique welded vertices."},
            "materials": len(materials), "textures": len(textures), "images": len(images),
            "texturedPrimitives": textured_primitives, "imageStorage": image_records,
            "validationLimit": "Header, JSON structure, embedded image presence and declared geometry counts; rendered texture fidelity and decoded mesh topology require separate inspection."}


def main(validate_only=False):
    # Gate/input/contract validation occurs before a client, output folder or lock.
    try:
        source_gate = validate_source_gate()
        api_contract = validate_api_contract()
        input_info, capture_bytes = validate_input(INPUT)
    except Exception as exc:
        print(json.dumps({"status": "offline-preflight-validation-failed", "errorClass": type(exc).__name__,
                          "error": str(exc), "submitted": False, "fallbackUsed": False}), flush=True)
        return 2
    if validate_only:
        print(json.dumps({"status": "offline-preflight-validation-passed", "sourceGate": source_gate,
                          "apiContract": api_contract, "input": input_info, "submitted": False}), flush=True)
        return 0
    if OUT.is_dir() and any(OUT.iterdir()):
        raise SystemExit("V12 output directory already contains saved results. Preserve them; no second submission was made.")
    OUT.mkdir(parents=True, exist_ok=True)
    with (OUT / "run-started.lock").open("x", encoding="utf-8") as lock:
        lock.write(utc_now() + "\n")
    evidence_path = OUT / "reconstruction-evidence.json"
    snapshot = OUT / "input-capture.jpg"
    white_obj = OUT / "alexia-v12-hunyuan21-white-diagnostic.obj"
    textured_glb = OUT / "alexia-v12-hunyuan21-textured-diagnostic.glb"
    evidence = {"project": "Crazy Rich: World Tour", "character": "Alexia",
        "attempt": "v12-hunyuan21-controlled-texture-diagnostic", "provider": "Tencent official Hunyuan3D 2.1 public ZeroGPU Space",
        "spaceOrigin": BASE, "endpoint": "/generation_all", "startedUtc": utc_now(),
        "sourceGate": source_gate, "apiContract": api_contract, "input": input_info, "params": PARAMS.copy(),
        "baselineV11MeshSha256": EXPECTED_V11_MESH_SHA256, "cachedV11GeometryReused": False,
        "geometryProcessing": "generation_all regenerates shape, reduces faces, then texture pipeline remeshes and unwraps UVs. Returned geometry is a NEW candidate; V11 approval does not transfer.",
        "expectedProviderModel": EXPECTED_MODEL, "providerModelIdentityConfirmed": False,
        "providerReportedMeshCountNote": "Provider shape counts can precede reduction/remeshing; use actual downloaded OBJ/GLB counts recorded below.",
        "submissionLimit": 1, "automaticRetry": False, "textureGenerationRequested": True,
        "allMultiviewSlotsDisabled": True, "captionParameterSupplied": False,
        "meshApproved": False, "sourceFidelityApproved": False, "textureApproved": False,
        "newGeometryGatePassed": False, "rigged": False, "readyForRigging": False,
        "gameAssetsReplaced": False, "readyForGame": False, "productionMeshApproved": False,
        "status": "preflight", "generationReturned": False,
        "inputNote": "Exact V10/V11 584px Nano Banana FRONT screenshot JPEG retains lower-right sparkle; not an original full-size PNG or certified mark-free capture. Hidden back/side surfaces remain inferred."}
    stage, generation_returned = "preflight", False
    write_json(evidence_path, evidence)
    try:
        with snapshot.open("xb") as stream:
            stream.write(capture_bytes)
        if sha256_file(snapshot) != EXPECTED_INPUT_SHA256:
            raise ValueError("Snapshotted JPEG no longer matches pinned source hash.")
        evidence["input"]["submittedSnapshot"] = snapshot.name
        evidence["input"]["submittedSnapshotSha256"] = EXPECTED_INPUT_SHA256
        # Recheck the eligibility and unchanged baseline immediately before client creation.
        evidence["sourceGate"] = validate_source_gate()
        write_json(evidence_path, evidence)
        if OPTIONAL_PYDEPS.is_dir():
            sys.path.insert(0, str(OPTIONAL_PYDEPS))
        import certifi
        from gradio_client import Client, handle_file
        tls_context = ssl.create_default_context(cafile=certifi.where())
        stage = "provider-client-initialization"
        client = Client(BASE, ssl_verify=tls_context, httpx_kwargs={"timeout": 240},
                        verbose=False, analytics_enabled=False, download_files=False)
        stage = "submission"
        evidence["status"] = "submitting-once"
        write_json(evidence_path, evidence)
        print("Submitting ONE eligible controlled V12 texture diagnostic; shape is regenerated and all final approvals remain false.", flush=True)
        result = client.predict(api_name="/generation_all", **shape_generation_arguments(snapshot, handle_file))
        generation_returned = True
        stage = "saving-result-metadata"
        write_json(OUT / "service-result.json", result)
        evidence.update({"status": "generated-awaiting-download", "generationReturned": True})
        write_json(evidence_path, evidence)
        parsed = generation_all_result(result)
        evidence["providerReportedMeshStats"], evidence["actualSeed"] = parsed["stats"], parsed["seed"]
        reported_model = parsed["stats"].get("model", {}).get("shapegen")
        evidence["providerReportedModel"] = reported_model
        evidence["providerModelIdentityConfirmed"] = reported_model == EXPECTED_MODEL
        write_json(evidence_path, evidence)
        stage = "downloading-white-obj"
        partial_obj = white_obj.with_suffix(".obj.partial")
        obj_download = obtain_result_file(parsed["whiteObj"], partial_obj, tls_context)
        stage = "validating-white-obj"
        obj_info = {"sha256": sha256_file(partial_obj), "bytes": partial_obj.stat().st_size,
                    "geometry": inspect_obj(partial_obj), "download": obj_download}
        partial_obj.replace(white_obj)
        obj_info["file"] = white_obj.name
        evidence["whiteObj"] = obj_info
        write_json(evidence_path, evidence)
        stage = "downloading-textured-glb"
        partial_glb = textured_glb.with_suffix(".glb.partial")
        glb_download = obtain_result_file(parsed["texturedGlb"], partial_glb, tls_context)
        stage = "validating-textured-glb"
        glb_info = inspect_textured_glb(partial_glb)
        glb_info.update({"sha256": sha256_file(partial_glb), "bytes": partial_glb.stat().st_size, "download": glb_download})
        partial_glb.replace(textured_glb)
        glb_info["file"] = textured_glb.name
        evidence["texturedGlb"] = glb_info
        evidence["baselineV11MeshHashVerifiedAfterRun"] = sha256_file(V11_MESH) == EXPECTED_V11_MESH_SHA256
        evidence.update({"status": "texture-diagnostic-generated-awaiting-independent-geometry-and-texture-review",
                         "mesh": textured_glb.name, "sha256": glb_info["sha256"]})
        print(json.dumps({"whiteObj": str(white_obj), "texturedGlb": str(textured_glb),
                          "sha256": glb_info["sha256"], "faces": glb_info["geometry"]["faces"],
                          "materials": glb_info["materials"], "textures": glb_info["textures"],
                          "images": glb_info["images"], "status": evidence["status"]}), flush=True)
        return 0
    except Exception as exc:
        evidence.update({"status": "download-failed-after-generation" if generation_returned else (
                            "preflight-failed" if stage == "preflight" else "generation-or-transport-failed"),
                         "generationReturned": generation_returned, "failedStage": stage,
                         "errorClass": type(exc).__name__, "error": str(exc),
                         "recoveryInstruction": "Preserve service-result.json, completed artifacts, partial files and run lock. Recover existing results; never resubmit automatically or delete the lock to force another generation."})
        print(type(exc).__name__ + ": " + str(exc), flush=True)
        return 1
    finally:
        evidence["endedUtc"] = utc_now()
        write_json(evidence_path, evidence)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--validate-only", action="store_true", help="Check V11 eligibility/hash, cached generation_all API, exact JPEG offline; no provider client/output/lock.")
    raise SystemExit(main(validate_only=parser.parse_args().validate_only))
