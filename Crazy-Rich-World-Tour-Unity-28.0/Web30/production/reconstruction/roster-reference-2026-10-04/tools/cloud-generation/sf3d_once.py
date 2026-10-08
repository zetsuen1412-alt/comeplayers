"""One SF3D mesh generation from a genuine canonical alpha-mask input.

Default: local hash/pixel/schema checks only. --submit-once: same-client CPU
requires_bg_remove then one GPU run_button call (default 60s), anonymous.
Preserves results and stops on any failure; no rerun, quotas/billing changes.
"""
import argparse, hashlib, inspect, io, json, pathlib, ssl, struct, sys, urllib.parse, urllib.request
import reconviagen_once as core

SPACE = "stabilityai/stable-fast-3d"
BASE = "https://stabilityai-stable-fast-3d.hf.space"
REVISION = "da5709055c2e0e08983d1a8b98172db008a91609"
NAMES = ["input_image", "foreground_ratio", "remesh_option", "vertex_count", "texture_size"]
WIRE_TYPES = ["button", "image", "state", "slider", "radio", "slider", "slider"]


def validate(args):
    from PIL import Image, ImageChops
    entries = core.read_json(args.inputs / "input-provenance.json")
    matches = [x for x in entries if x["character"] == args.character]
    if len(matches) != 1:
        raise ValueError("Expected one canonical input-provenance entry")
    rec = matches[0]
    source = (args.production_root / rec["source"]).resolve(strict=True)
    if not source.is_relative_to(args.production_root):
        raise ValueError("Canonical source escapes production root")
    alpha_path = args.inputs / (args.character + "-canonical-alpha.png")
    crop_path = args.inputs / (args.character + "-canonical-crop.png")
    for path, key in [(source, "source_sha256"), (crop_path, "crop_sha256"), (alpha_path, "alpha_sha256")]:
        if core.digest(path.read_bytes()) != rec[key]:
            raise ValueError("Source/crop/alpha exact byte hash changed: " + key)
    with Image.open(source) as src, Image.open(crop_path) as crop, Image.open(alpha_path) as alpha:
        src.load(); crop.load(); alpha.load()
        expected = src.convert("RGB").crop(tuple(rec["crop_xyxy"]))
        if alpha.mode != "RGBA" or alpha.size != expected.size or crop.convert("RGB").tobytes() != expected.tobytes():
            raise ValueError("Mask/crop layout differs from exact canonical source rectangle")
        # rembg's naive cutout attenuates edge RGB with its alpha. Preserve that
        # original file, but upload straight RGBA made from canonical crop RGB
        # plus precisely this mask. Fully opaque foreground must match source.
        opaque = alpha.getchannel("A").point(lambda a: 255 if a == 255 else 0)
        if ImageChops.difference(Image.composite(alpha.convert("RGB"), expected, opaque), expected).getbbox():
            raise ValueError("Opaque foreground RGB differs from canonical crop")
        extrema = alpha.getchannel("A").getextrema()
        if extrema[0] != 0 or extrema[1] != 255:
            raise ValueError("Input lacks genuine transparent foreground mask")
    return rec, alpha_path, crop_path


def check_contract(runtime, info):
    if runtime.get("id") != SPACE or runtime.get("runtime", {}).get("stage") != "RUNNING" or runtime.get("runtime", {}).get("sha") != REVISION:
        raise ValueError("Loaded public SF3D runtime changed; inspect before submission")
    if runtime.get("private") or runtime.get("gated") or runtime.get("disabled"):
        raise ValueError("Space is no longer public/ungated/available")
    endpoints = info["named_endpoints"]
    if [x["parameter_name"] for x in endpoints["/run_button"]["parameters"]] != NAMES:
        raise ValueError("SF3D public run API changed")
    if [x["parameter_name"] for x in endpoints["/requires_bg_remove"]["parameters"]] != ["image", "fr"]:
        raise ValueError("SF3D alpha-state API changed")
    if [x["component"].lower() for x in endpoints["/run_button"]["returns"]] != ["image", "litmodel3d"]:
        raise ValueError("SF3D result slots changed")


def check_wire(config):
    # /info skips the Button while the client inserts only hidden State. The
    # actual public frontend contract includes the ordinary 'Run' Button label.
    endpoints = [d for d in config["dependencies"] if d.get("api_name") == "run_button"]
    if len(endpoints) != 1:
        raise ValueError("Expected one public SF3D run dependency")
    dep = endpoints[0]
    components = {c["id"]:c for c in config["components"]}
    if [components[x]["type"] for x in dep["inputs"]] != WIRE_TYPES:
        raise ValueError("SF3D frontend wire input types changed")
    if dep.get("show_api") is not True or dep.get("zerogpu") is not True or components[dep["inputs"][0]]["props"].get("value") != "Run":
        raise ValueError("SF3D public Button/GPU contract changed")
    return dep["inputs"]


def validate_cpu_resume(args, rec):
    previous_dir=args.resume_before_generation.resolve(strict=True)
    if args.out_dir==previous_dir or args.out_dir.is_relative_to(previous_dir) or previous_dir.is_relative_to(args.out_dir):
        raise ValueError("CPU resume output must preserve a distinct previous attempt directory")
    previous=core.read_json(previous_dir/"reconstruction-evidence.json")
    expected={"status":"controlled-attempt-failed","character":args.character,"provider":SPACE,"runtime_revision":REVISION,
              "failed_stage":"setting-genuine-alpha-state","error_class":"RemoteProtocolError","provider_generation_calls_attempted":0,
              "canonical_provenance":rec,"params":{"foreground_ratio":0.85,"remesh_option":"None","vertex_count":-1,"texture_size":args.texture_size}}
    if any(previous.get(k)!=v for k,v in expected.items()) or previous.get("generation_returned") or (previous_dir/"service-result.json").exists():
        raise ValueError("CPU resume requires a proven pre-generation disconnect with zero generation calls")
    if "Server disconnected without sending a response" not in previous.get("error",""):
        raise ValueError("Previous failure is not the known CPU transport disconnect")
    snapshot=previous_dir/"input-alpha.png"
    if core.digest(snapshot.read_bytes())!=previous["input_snapshot_sha256"]:
        raise ValueError("Preserved pre-generation upload snapshot changed")
    names=["reconstruction-evidence.json","input-alpha.png","run-started.lock"]
    return {"previous_attempt_directory":str(previous_dir),"previous_failure_stage":previous["failed_stage"],
            "previous_generation_calls_attempted":0,"previous_input_snapshot_sha256":previous["input_snapshot_sha256"],
            "previous_file_sha256":{name:core.digest((previous_dir/name).read_bytes()) for name in names},
            "reason":"Known CPU state/upload disconnect before any generation call. Fresh client establishes genuine State again; exactly one generation call remains authorized."}


def download(result, target, context):
    if target.exists():
        raise FileExistsError("Existing GLB preserved")
    if not isinstance(result, (list, tuple)) or len(result) != 2:
        raise ValueError("SF3D result has unexpected shape; metadata preserved")
    ref = core.file_reference(result[1])
    url = ref.get("url") or BASE + "/file=" + urllib.parse.quote(ref["path"], safe="/")
    url = urllib.parse.urljoin(BASE + "/", url)
    # Reuse strict same-origin redirect checks without changing the source file.
    core.BASE = BASE
    core.checked_url(url)
    partial = target.with_suffix(".glb.partial")
    opener = urllib.request.build_opener(core.SameOriginRedirects(), urllib.request.HTTPSHandler(context=context))
    with opener.open(url, timeout=120) as response, partial.open("wb") as stream:
        if int(response.headers.get("Content-Length", "0")) > core.MAX_BYTES:
            raise ValueError("GLB exceeds 128 MiB")
        total = 0
        while chunk := response.read(1024 * 1024):
            total += len(chunk)
            if total > core.MAX_BYTES:
                raise ValueError("GLB exceeds 128 MiB")
            stream.write(chunk)
    payload = partial.read_bytes()
    if len(payload) < 20:
        raise ValueError("Truncated GLB")
    magic, version, length, size, kind = struct.unpack_from("<4sIII4s", payload)
    if (magic, version, length, kind) != (b"glTF", 2, len(payload), b"JSON") or size + 20 > len(payload):
        raise ValueError("Invalid GLB header")
    gltf = json.loads(payload[20:20 + size])
    if not gltf.get("meshes") or not gltf.get("accessors"):
        raise ValueError("GLB does not contain an actual mesh")
    partial.replace(target)
    return {"mesh": target.name, "bytes": len(payload), "sha256": core.digest(payload), "gltf_summary": {k:len(gltf.get(k, [])) for k in ["meshes", "materials", "images", "textures", "skins", "animations"]}}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--production-root", type=pathlib.Path, required=True)
    p.add_argument("--inputs", type=pathlib.Path, required=True)
    p.add_argument("--character", required=True)
    p.add_argument("--metadata-dir", type=pathlib.Path, required=True)
    p.add_argument("--out-dir", type=pathlib.Path, required=True)
    p.add_argument("--pydeps", type=pathlib.Path)
    p.add_argument("--texture-size", type=int, choices=[1024,2048], default=1024,
                   help="Texture atlas size; 2048 is exposed by the live Space but not yet timed on this character")
    p.add_argument("--resume-before-generation", type=pathlib.Path,
                   help="Preserved prior CPU-state RemoteProtocolError attempt with zero generation calls; requires a distinct output directory")
    g = p.add_mutually_exclusive_group(); g.add_argument("--submit-once", action="store_true"); g.add_argument("--recover-only", action="store_true")
    args = p.parse_args()
    for name in ["production_root", "inputs", "metadata_dir"]:
        setattr(args, name, getattr(args, name).resolve(strict=True))
    args.out_dir = args.out_dir.resolve()
    if args.out_dir.is_relative_to(args.production_root) or args.out_dir == args.inputs or args.out_dir.is_relative_to(args.inputs) or args.out_dir == args.metadata_dir:
        raise ValueError("Output must be separate scratch directory")
    if args.pydeps:
        sys.path.insert(0, str(args.pydeps.resolve(strict=True)))
    lock = args.out_dir / "run-started.lock"
    if args.submit_once and lock.exists():
        raise FileExistsError("Attempt already started; preserve evidence and do not resubmit")
    rec, alpha_path, crop_path = validate(args)
    check_contract(core.read_json(args.metadata_dir / "sf3d-runtime.json"), core.read_json(args.metadata_dir / "sf3d-info-v4.json"))
    wire_ids = check_wire(core.read_json(args.metadata_dir / "sf3d-config.json"))
    evidence = {"status":"offline-input-preflight-passed", "character":args.character, "provider":SPACE, "runtime_revision":REVISION, "canonical_provenance":rec,
                "upload_rgb_pixels_match_source_rectangle":True, "source_rgb_repainted":False, "upload_operation":"original crop RGB + exact u2net mask alpha; straight RGBA, original cutout preserved", "authentication":"anonymous; token lookup disabled", "declared_gpu_duration_seconds":60,
                "transport":"Six positional args: ordinary Run Button plus five public args; standard client inserts None State at wire index2", "frontend_wire_component_ids":wire_ids, "frontend_wire_types":WIRE_TYPES,
                "params":{"foreground_ratio":0.85,"remesh_option":"None","vertex_count":-1,"texture_size":args.texture_size}, "provider_generation_calls_attempted":0,
                "actual_job_started_observed":False, "provider_generation_submission_status":"not attempted", "production_approved":False,"automatic_retry":False,
                "scope":"Actual single-image textured-mesh diagnostic. Hidden surfaces inferred; source identity, hair, hands and props require actual mesh review."}
    if args.resume_before_generation:
        if args.recover_only:
            raise ValueError("CPU resume and returned-result recovery are distinct operations")
        evidence["cpu_state_resume"]=validate_cpu_resume(args,rec)
    if not args.submit_once and not args.recover_only:
        print(json.dumps(evidence), flush=True); return 0
    args.out_dir.mkdir(parents=True, exist_ok=True)
    path = args.out_dir / "reconstruction-evidence.json"
    if args.recover_only:
        evidence=core.read_json(path)
        path=args.out_dir/"reconstruction-recovery-evidence.json"
    if path.exists():
        raise FileExistsError("Evidence already exists; preserve attempt in this directory")
    import certifi
    context = ssl.create_default_context(cafile=certifi.where())
    stage = "live-read-only-preflight"
    try:
        if args.recover_only:
            result = core.read_json(args.out_dir / "service-result.json")
        else:
            rt=core.request_json("https://huggingface.co/api/spaces/"+SPACE, context)
            info=core.request_json(BASE+"/info", context)
            check_contract(rt,info)
            config=core.request_json(BASE+"/config", context)
            check_wire(config)
            core.write(args.out_dir/"live-runtime.json",rt); core.write(args.out_dir/"live-info.json",info); core.write(args.out_dir/"live-config.json",config)
            from gradio_client import Client, handle_file
            kwargs=dict(verbose=False,analytics_enabled=False,download_files=False,httpx_kwargs={"timeout":120},ssl_verify=context)
            kwargs["token" if "token" in inspect.signature(Client).parameters else "hf_token"]=False
            client=Client(BASE,**kwargs)
            with lock.open("x",encoding="utf-8") as f: f.write(core.now()+"\n")
            from PIL import Image
            with Image.open(crop_path) as crop, Image.open(alpha_path) as mask:
                straight=crop.convert("RGBA"); straight.putalpha(mask.getchannel("A"))
                buffer=io.BytesIO();straight.save(buffer,format="PNG")
            upload_payload=buffer.getvalue(); snapshot=args.out_dir/"input-alpha.png"; snapshot.write_bytes(upload_payload)
            evidence["input_snapshot_sha256"]=core.digest(upload_payload)
            if args.resume_before_generation and evidence["input_snapshot_sha256"]!=evidence["cpu_state_resume"]["previous_input_snapshot_sha256"]:
                raise ValueError("Fresh upload bytes differ from preserved pre-generation snapshot")
            core.write(path,evidence)
            stage="setting-genuine-alpha-state"  # CPU handler, no spaces.GPU decorator.
            state_result=client.predict(image=handle_file(str(snapshot)),fr=0.85,api_name="/requires_bg_remove")
            core.write(args.out_dir/"alpha-state-result.json",state_result)
            stage="provider-generation"
            evidence.update(status="one-generation-call-attempted",provider_generation_calls_attempted=1,provider_generation_submission_status="client call attempted; job start not observed")
            core.write(path,evidence)
            # The Gradio-generated five-argument /info signature omits Button.
            # Its actual seven-input dependency requires Run + Image + State +
            # four settings. Client inserts State, so supply the other six.
            result=client.predict("Run",handle_file(str(snapshot)),0.85,"None",-1,args.texture_size,api_name="/run_button")
            core.write(args.out_dir/"service-result.json",result)
            evidence.update(generation_returned=True,provider_generation_submission_status="result returned")
            core.write(path,evidence)
        stage="download-returned-glb"
        evidence.update(download(result,args.out_dir/(args.character+"-sf3d-canonical-diagnostic.glb"),context))
        evidence["status"]="actual-textured-mesh-generated-awaiting-review"
        print(json.dumps({k:evidence[k] for k in ["status","mesh","sha256","gltf_summary"]}),flush=True)
        return 0
    except Exception as exc:
        evidence.update(status="controlled-attempt-failed",failed_stage=stage,error_class=type(exc).__name__,error=str(exc))
        print(json.dumps({"stage":stage,"error":str(exc)}),flush=True);return 1
    finally:
        if args.resume_before_generation:
            resume=evidence["cpu_state_resume"];previous_dir=pathlib.Path(resume["previous_attempt_directory"])
            evidence["previous_cpu_attempt_unchanged"]=all(core.digest((previous_dir/name).read_bytes())==sha for name,sha in resume["previous_file_sha256"].items())
        evidence["ended_utc"]=core.now();core.write(path,evidence)


if __name__=="__main__":raise SystemExit(main())
