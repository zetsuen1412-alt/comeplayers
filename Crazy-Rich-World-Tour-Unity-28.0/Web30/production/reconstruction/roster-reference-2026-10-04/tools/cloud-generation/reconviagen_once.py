"""One controlled ReconViaGen diagnostic from exact Alexia V2 pixels.

Default mode only validates saved metadata and writes lossless panel crops.
Only --submit-once calls the public Space: preprocessing once (60s declared),
then ONE generation/export call (120s declared). No auth lookup, no retries.
Use --recover-only after a returned result; it never submits a second job.
Requires Pillow; --submit-once additionally requires gradio_client + certifi.
"""
import argparse
import dataclasses
import datetime
import hashlib
import inspect
import io
import json
import pathlib
import shutil
import ssl
import struct
import sys
import urllib.parse
import urllib.request

SPACE = "Stable-X/ReconViaGen"
BASE = "https://stable-x-reconviagen.hf.space"
API = "/generate_and_extract_glb"
REVISION = "15adc5b62faa28c5bb8672ec571bedbd8818ab74"
SOURCE_HASH = "935b1f8f7d2be4a6a453a089041844f2cd4470eb64be17d9d72568efb3708933"
PARAM_NAMES = ["multiimages", "seed", "ss_guidance_strength", "ss_sampling_steps", "slat_guidance_strength", "slat_sampling_steps", "multiimage_algo", "mesh_simplify", "texture_size"]
PANELS = {
    "front": (0, 0, 510, 488),
    "front_three_quarter": (513, 0, 1021, 488),
    "left": (1025, 0, 1536, 488),
    "right": (0, 492, 510, 1024),
    "back_three_quarter": (513, 492, 1021, 1024),
    "back": (1025, 492, 1536, 1024),
}
PARAMS = dict(seed=1412, ss_guidance_strength=7.5, ss_sampling_steps=30,
              slat_guidance_strength=3.0, slat_sampling_steps=12,
              multiimage_algo="multidiffusion", mesh_simplify=0.95, texture_size=1024)
MAX_BYTES = 128 * 1024 * 1024


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def digest(payload):
    return hashlib.sha256(payload).hexdigest()


def jsonable(value):
    if isinstance(value, dict):
        return {str(k): jsonable(v) for k, v in value.items()}
    if isinstance(value, (tuple, list)):
        return [jsonable(v) for v in value]
    if dataclasses.is_dataclass(value) and not isinstance(value, type):
        return jsonable(dataclasses.asdict(value))
    if hasattr(value, "model_dump"):
        return jsonable(value.model_dump())
    if isinstance(value, pathlib.Path):
        return str(value)
    return value


def write(path, data):
    tmp = path.with_suffix(path.suffix + ".partial")
    tmp.write_text(json.dumps(jsonable(data), indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(path)


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def request_json(url, context):
    # GET metadata only; no Gradio generation endpoint here.
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "CRWT-3D-read-only-preflight/1.0"}), context=context, timeout=45) as r:
        payload = r.read(2 * 1024 * 1024 + 1)
    if len(payload) > 2 * 1024 * 1024:
        raise ValueError("Metadata exceeds 2 MiB")
    return json.loads(payload)


def check_contract(runtime, info):
    if runtime.get("id") != SPACE or runtime.get("runtime", {}).get("stage") != "RUNNING":
        raise ValueError("Expected public ReconViaGen runtime is not RUNNING")
    if runtime.get("runtime", {}).get("sha") != REVISION:
        raise ValueError("Loaded revision changed; inspect new source before submitting")
    if runtime.get("private") or runtime.get("gated") or runtime.get("disabled"):
        raise ValueError("Expected ungated public Space changed")
    ep = info["named_endpoints"][API]
    names = [x["parameter_name"] for x in ep["parameters"]]
    if names != PARAM_NAMES:
        raise ValueError("Generation API arguments changed")
    if [x["component"].lower() for x in ep["returns"]] != ["video", "litmodel3d", "downloadbutton"]:
        raise ValueError("Generation return positions changed")
    if "/preprocess_images" not in info["named_endpoints"]:
        raise ValueError("Required official image-preprocessing API missing")


def prepare(args, views):
    from PIL import Image
    payload = args.source.read_bytes()
    if digest(payload) != SOURCE_HASH:
        raise ValueError("Canonical V2 sheet bytes do not match reviewed source")
    with Image.open(io.BytesIO(payload)) as image:
        image.load()
        if image.size != (1536, 1024) or image.mode != "RGB":
            raise ValueError("Canonical sheet dimensions/mode changed")
        inputs = []
        args.out_dir.mkdir(parents=True, exist_ok=True)
        for view in views:
            path = args.out_dir / (view + ".png")
            buffer = io.BytesIO()
            image.crop(PANELS[view]).save(buffer, format="PNG")
            crop_bytes = buffer.getvalue()
            if path.exists() and path.read_bytes() != crop_bytes:
                raise ValueError("Existing crop differs; preserve it and use a fresh directory")
            if not path.exists():
                path.write_bytes(crop_bytes)
            inputs.append({"view": view, "file": path.name, "sha256": digest(crop_bytes), "source_pixel_box": list(PANELS[view]), "size": list(image.crop(PANELS[view]).size)})
    evidence = {
        "status": "prepared-offline", "prepared_utc": now(), "source_file": str(args.source),
        "source_sha256": SOURCE_HASH, "source_dimensions": [1536, 1024], "provider": SPACE,
        "runtime_revision": REVISION, "api_name": API, "source_crop_only": True,
        "crop_note": "Lossless rectangular panel crops of canonical V2; no image generation, repaint, resize, threshold mask, or substitution. Luggage remains part of the reference.",
        "inputs": inputs, "params": PARAMS, "declared_gpu_durations_seconds": {"preprocess_images": 60, "generate_and_extract_glb": 120},
        "actual_requested_duration_seconds": None, "provider_generation_submissions": 0,
        "automatic_retry": False, "authentication": "anonymous; no token lookup", "production_approved": False,
        "fidelity_note": "Six artist-generated views are not calibrated photographs; poses/hair/accessories may vary. Any true output mesh still requires independent reference and anatomy review. Single-front mode infers all hidden surfaces.",
    }
    path = args.out_dir / "reconstruction-evidence.json"
    if path.exists():
        old = read_json(path)
        if old.get("source_sha256") != SOURCE_HASH or old.get("inputs") != inputs or old.get("params") != PARAMS:
            raise ValueError("Directory belongs to different input/configuration")
        return old
    write(path, evidence)
    return evidence


def file_reference(value):
    value = jsonable(value)
    if isinstance(value, dict) and "path" not in value and "value" in value:
        value = value["value"]
    if isinstance(value, str):
        return {"path": value}
    if isinstance(value, dict) and isinstance(value.get("path"), str):
        return value
    raise ValueError("No file reference in GLB return slot")


def checked_url(url):
    p = urllib.parse.urlparse(url)
    if p.scheme != "https" or p.hostname != urllib.parse.urlparse(BASE).hostname or p.port not in (None, 443) or p.username or p.password:
        raise ValueError("Result URL must stay on the public Space HTTPS origin")
    return url


class SameOriginRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        checked_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def download_glb(result, out_dir, context):
    if not isinstance(result, (tuple, list)) or len(result) != 3:
        raise ValueError("Unexpected result; saved metadata retained, no resubmission")
    ref = file_reference(result[1])  # gr.State is excluded; Video, GLB, download.
    url = ref.get("url") or BASE + "/gradio_api/file=" + urllib.parse.quote(ref["path"], safe="/")
    url = checked_url(urllib.parse.urljoin(BASE + "/", url))
    target = out_dir / "alexia-reconviagen-v2-diagnostic.glb"
    if target.exists():
        raise FileExistsError("Existing GLB preserved; review it without re-downloading")
    partial = target.with_suffix(".glb.partial")
    opener = urllib.request.build_opener(SameOriginRedirects(), urllib.request.HTTPSHandler(context=context))
    with opener.open(url, timeout=120) as r, partial.open("wb") as f:
        declared = r.headers.get("Content-Length")
        if declared and int(declared) > MAX_BYTES:
            raise ValueError("Result exceeds 128 MiB")
        total = 0
        while chunk := r.read(1024 * 1024):
            total += len(chunk)
            if total > MAX_BYTES:
                raise ValueError("Result exceeds 128 MiB")
            f.write(chunk)
    payload = partial.read_bytes()
    if len(payload) < 20:
        raise ValueError("Truncated GLB")
    magic, version, length, chunk_size, chunk_type = struct.unpack_from("<4sIII4s", payload)
    if magic != b"glTF" or version != 2 or length != len(payload) or chunk_type != b"JSON":
        raise ValueError("Invalid GLB header")
    gltf = json.loads(payload[20:20 + chunk_size])
    meshes = gltf.get("meshes", [])
    if not meshes or not gltf.get("accessors"):
        raise ValueError("GLB has no actual mesh/accessors")
    stats = {"meshes": len(meshes), "primitives": sum(len(m.get("primitives", [])) for m in meshes),
             "materials": len(gltf.get("materials", [])), "images": len(gltf.get("images", [])),
             "textures": len(gltf.get("textures", [])), "skins": len(gltf.get("skins", [])),
             "animations": len(gltf.get("animations", []))}
    partial.replace(target)
    return {"mesh_file": target.name, "sha256": digest(payload), "bytes": len(payload), "gltf_summary": stats}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=pathlib.Path, required=True)
    parser.add_argument("--metadata-dir", type=pathlib.Path, required=True)
    parser.add_argument("--out-dir", type=pathlib.Path, required=True)
    parser.add_argument("--views", default="front,left,right,back", help="Ordered names, front first; 'front' for single-view")
    parser.add_argument("--pydeps", type=pathlib.Path)
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--submit-once", action="store_true")
    group.add_argument("--recover-only", action="store_true")
    args = parser.parse_args()
    args.source = args.source.resolve(strict=True)
    args.metadata_dir = args.metadata_dir.resolve(strict=True)
    args.out_dir = args.out_dir.resolve()
    if args.out_dir == args.source.parent or args.out_dir == args.metadata_dir or args.out_dir.is_relative_to(args.source.parent):
        raise ValueError("Output must be distinct scratch directory")
    views = args.views.split(",")
    if not views or views[0] != "front" or len(set(views)) != len(views) or any(v not in PANELS for v in views):
        raise ValueError("Unknown/duplicate view or canonical front not first")
    if args.pydeps:
        sys.path.insert(0, str(args.pydeps.resolve(strict=True)))
    if args.submit_once and (args.out_dir / "run-started.lock").exists():
        raise FileExistsError("Controlled attempt already started; preserved evidence is not overwritten. Recover a returned result, never resubmit.")
    if args.recover_only and (args.out_dir / "alexia-reconviagen-v2-diagnostic.glb").exists():
        raise FileExistsError("Recovered GLB already exists; inspect the preserved artifact")
    check_contract(read_json(args.metadata_dir / "reconviagen-runtime.json"), read_json(args.metadata_dir / "reconviagen-info.json"))
    evidence = prepare(args, views)
    path = args.out_dir / "reconstruction-evidence.json"
    if not args.submit_once and not args.recover_only:
        print(json.dumps({"status": "prepared-offline", "inputs": evidence["inputs"], "submitted": False}), flush=True)
        return 0
    import certifi
    context = ssl.create_default_context(cafile=certifi.where())
    stage = "recovery" if args.recover_only else "live-read-only-preflight"
    try:
        if args.recover_only:
            result = read_json(args.out_dir / "service-result.json")
        else:
            live_runtime = request_json("https://huggingface.co/api/spaces/" + SPACE, context)
            live_info = request_json(BASE + "/gradio_api/info", context)
            check_contract(live_runtime, live_info)
            write(args.out_dir / "live-runtime.json", live_runtime)
            write(args.out_dir / "live-info.json", live_info)
            from gradio_client import Client, handle_file
            options = dict(verbose=False, analytics_enabled=False, download_files=False,
                           httpx_kwargs={"timeout": 120}, ssl_verify=context)
            signature = inspect.signature(Client)
            auth_name = "token" if "token" in signature.parameters else "hf_token"
            options[auth_name] = False  # explicitly disable stored-token lookup.
            client = Client(BASE, **options)
            with (args.out_dir / "run-started.lock").open("x", encoding="utf-8") as f:
                f.write(now() + "\n")
            evidence.update(status="preprocessing-once", started_utc=now())
            write(path, evidence)
            # Gradio 5 Gallery API: list of GalleryImage objects, not list tuples.
            gallery = [{"image": handle_file(str((args.out_dir / i["file"]).resolve())), "caption": i["view"]} for i in evidence["inputs"]]
            stage = "provider-preprocessing"
            processed = client.predict(images=gallery, api_name="/preprocess_images")
            write(args.out_dir / "preprocess-result.json", processed)
            stage = "provider-generation"
            evidence.update(status="submitting-one-generation", provider_generation_submissions=1)
            write(path, evidence)
            result = client.predict(multiimages=processed, api_name=API, **PARAMS)
            # Save remote FileData before touching any binary. A later failure
            # is recovered with --recover-only; never submit again.
            write(args.out_dir / "service-result.json", result)
            evidence.update(status="generation-returned-awaiting-download", generation_returned=True)
            write(path, evidence)
        stage = "downloading-returned-result"
        evidence.update(download_glb(result, args.out_dir, context))
        evidence.update(status="actual-mesh-generated-awaiting-independent-review", production_approved=False)
        write(path, evidence)
        print(json.dumps({"status": evidence["status"], "mesh": evidence["mesh_file"], "sha256": evidence["sha256"], "gltf_summary": evidence["gltf_summary"]}), flush=True)
        return 0
    except Exception as exc:
        evidence.update(status="controlled-attempt-failed", failed_stage=stage, error_class=type(exc).__name__, error=str(exc),
                        recovery="Preserve all evidence/lock. If service-result.json exists, use --recover-only. Never remove the lock or automatically resubmit.")
        write(path, evidence)
        print(json.dumps({"status": evidence["status"], "stage": stage, "error_class": type(exc).__name__, "error": str(exc)}), flush=True)
        return 1
    finally:
        evidence["ended_utc"] = now()
        write(path, evidence)


if __name__ == "__main__":
    raise SystemExit(main())
