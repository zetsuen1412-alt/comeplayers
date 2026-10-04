"""One controlled Pixal3D fast-final test from cached approved Alexia V2 RGBA.

Default is local provenance/signature preflight only. --submit-once checks live
public runtime, API and non-mock health, then makes one 120s decorated generation
call with community sharing disabled. No separate preprocessing or extraction
job, retries, login/token lookup, billing change or shape/quality claim.
"""
import argparse, inspect, json, pathlib, ssl, sys, urllib.parse
import reconviagen_once as core
import sf3d_once as sf

SPACE="victor/pixal3d-studio"
BASE="https://victor-pixal3d-studio.hf.space"
REVISION="ef1cb838893269417b3eaa81dd8fc635f65a5180"
NAMES=["image","prompt","seed","resolution","quality","manual_fov","share_to_community"]
FRONT_SHA="d25669c20d2f0ea544f693370f92592bbd9c873fbec585806ce8400a6e0d7dc1"


def contract(runtime,info):
    if runtime.get("id")!=SPACE or runtime.get("runtime",{}).get("stage")!="RUNNING" or runtime.get("runtime",{}).get("sha")!=REVISION:
        raise ValueError("Pixal fast runtime changed; inspect first")
    if any(runtime.get(k) for k in ["private","gated","disabled"]):
        raise ValueError("Pixal Space is not public/ungated/available")
    endpoint=info["named_endpoints"]["/generate_fast"]
    if [x["parameter_name"] for x in endpoint["parameters"]]!=NAMES or [x["python_type"]["type"] for x in endpoint["returns"]]!=["str"]:
        raise ValueError("Pixal fast public API changed")


def validate(args):
    contract(core.read_json(args.metadata_dir/"pixal-runtime.json"),core.read_json(args.metadata_dir/"pixal-info.json"))
    return validate_cached_v2_front(args)


def validate_cached_v2_front(args):
    source=args.production_root/"turnarounds/alexia/turnaround-blue-imagegen-v2.png"
    if core.digest(source.read_bytes())!=core.SOURCE_HASH:
        raise ValueError("Approved Alexia V2 source changed")
    original=core.read_json(args.recon_attempt/"reconstruction-evidence.json")
    resume=core.read_json(args.recon_attempt/"resume-generation-evidence.json")
    if original.get("source_sha256")!=core.SOURCE_HASH or resume.get("source_sha256")!=core.SOURCE_HASH:
        raise ValueError("Cached preprocessing is not traceable to approved V2")
    if core.digest((args.recon_attempt/"preprocess-result.json").read_bytes())!=resume["preprocess_result_sha256"]:
        raise ValueError("Saved preprocessing output metadata changed")
    front=[r for r in original["inputs"] if r["view"]=="front"]
    cached=[r for r in resume["cached_rgba_inputs"] if pathlib.PureWindowsPath(r["file"]).name=="front.png"]
    if len(front)!=1 or len(cached)!=1 or cached[0]["sha256"]!=FRONT_SHA:
        raise ValueError("Expected exact saved approved V2 front preprocessing")
    crop=args.recon_attempt/front[0]["file"]
    if core.digest(crop.read_bytes())!=front[0]["sha256"]:
        raise ValueError("Approved front source crop changed")
    image=args.recon_attempt/pathlib.Path(*pathlib.PureWindowsPath(cached[0]["file"]).parts)
    if core.digest(image.read_bytes())!=FRONT_SHA:
        raise ValueError("Cached actual preprocessing PNG changed")
    from PIL import Image
    with Image.open(source) as src,Image.open(crop) as c,Image.open(image) as rgba:
        if src.convert("RGB").crop(tuple(front[0]["source_pixel_box"])).tobytes()!=c.convert("RGB").tobytes():
            raise ValueError("Front crop is not exact approved source rectangle")
        if rgba.mode!="RGBA" or list(rgba.size)!=cached[0]["size"] or rgba.getchannel("A").getextrema()!=(0,255):
            raise ValueError("Cached input is not the expected genuine masked RGBA")
    return image,{"source_relative_path":str(source.relative_to(args.production_root)),"source_sha256":core.SOURCE_HASH,
        "source_front_crop":front[0],"cached_preprocess":cached[0],
        "preprocess_result_sha256":resume["preprocess_result_sha256"],
        "operation":"Reuse actual provider RGBA preprocessing of lossless approved V2 front crop. Provider resized and removed background; no new generated image or repaint."}


def parse_result(value):
    if isinstance(value,(list,tuple)) and len(value)==1:value=value[0]
    if not isinstance(value,str):raise ValueError("Expected preserved JSON string service result")
    result=json.loads(value)
    if result.get("ok") is not True:raise RuntimeError(str(result.get("error","Pixal service returned failure")))
    if result.get("mode")!="fast_final":raise ValueError("Expected completed fast-final mesh output")
    asset=result["asset"]
    if asset.get("shared") is not False or asset.get("source_space")!=SPACE or asset.get("status")!="complete":
        raise ValueError("Unexpected shared/mock/incomplete asset; preserve metadata for review")
    url=asset.get("model_url")
    if not isinstance(url,str) or not url:raise ValueError("Service returned no model URL")
    return result,urllib.parse.urljoin(BASE+"/",url)


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--production-root",type=pathlib.Path,required=True)
    p.add_argument("--metadata-dir",type=pathlib.Path,required=True)
    p.add_argument("--recon-attempt",type=pathlib.Path,required=True)
    p.add_argument("--out-dir",type=pathlib.Path,required=True)
    p.add_argument("--pydeps",type=pathlib.Path)
    p.add_argument("--submit-once",action="store_true")
    args=p.parse_args()
    for name in ["production_root","metadata_dir","recon_attempt"]:setattr(args,name,getattr(args,name).resolve(strict=True))
    args.out_dir=args.out_dir.resolve()
    for protected in [args.production_root,args.metadata_dir,args.recon_attempt]:
        if args.out_dir==protected or args.out_dir.is_relative_to(protected) or protected.is_relative_to(args.out_dir):
            raise ValueError("Output must be distinct from protected assets/preflight/evidence")
    if args.submit_once and args.out_dir.exists() and any(args.out_dir.iterdir()):raise FileExistsError("Output nonempty; preserve earlier attempt")
    image,provenance=validate(args)
    params={"prompt":"Alexia approved V2 blue front reconstruction diagnostic","seed":1412,"resolution":1024,"quality":"balanced","manual_fov":-1.0,"share_to_community":False}
    evidence={"status":"offline-input-preflight-passed","provider":SPACE,"runtime_revision":REVISION,"input_provenance":provenance,
        "params":params,"declared_gpu_duration_seconds":120,"provider_generation_calls_attempted":0,"actual_job_started_observed":False,
        "automatic_retry":False,"authentication":"anonymous; token lookup disabled","production_approved":False,
        "provider_persistence_note":"Sharing flag false prevents community-feed publication. Provider may retain unlisted uploaded input/model files.",
        "scope":"Actual single-image new PBR mesh from approved reference. Hidden surfaces inferred; not an existing-mesh texturing endpoint."}
    if not args.submit_once:print(json.dumps(evidence),flush=True);return 0
    if args.pydeps:sys.path.insert(0,str(args.pydeps.resolve(strict=True)))
    import certifi
    context=ssl.create_default_context(cafile=certifi.where())
    args.out_dir.mkdir(parents=True,exist_ok=True);path=args.out_dir/"reconstruction-evidence.json"
    stage="live-read-only-preflight"
    try:
        runtime=core.request_json("https://huggingface.co/api/spaces/"+SPACE,context)
        info=core.request_json(BASE+"/gradio_api/info",context)
        health=core.request_json(BASE+"/health",context)
        contract(runtime,info)
        if health.get("ok") is not True or health.get("mock") is not False or health.get("fast_backend")!="local" or health.get("fast_final") is not True:
            raise ValueError("Live Pixal health is not a non-mock local fast-final backend")
        for name,value in [("live-runtime.json",runtime),("live-info.json",info),("live-health.json",health)]:core.write(args.out_dir/name,value)
        from gradio_client import Client,handle_file
        kwargs=dict(verbose=False,analytics_enabled=False,download_files=False,httpx_kwargs={"timeout":150},ssl_verify=context)
        kwargs["token" if "token" in inspect.signature(Client).parameters else "hf_token"]=False
        client=Client(BASE,**kwargs)
        with (args.out_dir/"run-started.lock").open("x",encoding="utf-8") as stream:stream.write(core.now()+"\n")
        snapshot=args.out_dir/"input-approved-v2-rgba.png";snapshot.write_bytes(image.read_bytes())
        core.write(path,evidence)
        stage="one-generation-export-call"
        evidence.update(status="one-generation-call-attempted",provider_generation_calls_attempted=1,provider_generation_submission_status="client call attempted; job start not observed")
        core.write(path,evidence)
        value=client.predict(image=handle_file(str(snapshot)),api_name="/generate_fast",**params)
        core.write(args.out_dir/"service-result.json",value)
        result,url=parse_result(value)
        evidence.update(generation_returned=True,provider_timings=result.get("timings"),asset=result["asset"])
        core.write(path,evidence)
        stage="download-returned-glb"
        # Same-origin guard intentionally stops unexpected external/bucket URLs;
        # preserve returned metadata so a download-only repair can be reviewed.
        sf.BASE=BASE
        evidence.update(sf.download([None,{"url":url}],args.out_dir/"alexia-pixal-fast-v2-diagnostic.glb",context))
        evidence["status"]="actual-textured-mesh-generated-awaiting-review"
        print(json.dumps({k:evidence[k] for k in ["status","mesh","sha256","gltf_summary"]}),flush=True);return 0
    except Exception as exc:
        evidence.update(status="controlled-attempt-failed",failed_stage=stage,error_class=type(exc).__name__,error=str(exc))
        print(json.dumps({"stage":stage,"error":str(exc)}),flush=True);return 1
    finally:
        evidence["ended_utc"]=core.now();core.write(path,evidence)


if __name__=="__main__":raise SystemExit(main())
