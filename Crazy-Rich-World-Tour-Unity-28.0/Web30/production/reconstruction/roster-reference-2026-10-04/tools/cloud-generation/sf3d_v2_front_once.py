"""One SF3D generation from the exact cached approved Alexia V2 front RGBA.

Default: local source/crop/derived-input hashes only. --submit-once establishes
fresh genuine CPU alpha state, then one correctly aligned Run Button generation.
No repeated Recon preprocessing, RGB repaint, login, billing or retry loop.
"""
import argparse, inspect, json, pathlib, ssl, sys
import reconviagen_once as core
import sf3d_once as sf
from pixal_fast_once import validate_cached_v2_front


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--production-root",type=pathlib.Path,required=True)
    p.add_argument("--metadata-dir",type=pathlib.Path,required=True)
    p.add_argument("--recon-attempt",type=pathlib.Path,required=True)
    p.add_argument("--out-dir",type=pathlib.Path,required=True)
    p.add_argument("--pydeps",type=pathlib.Path)
    p.add_argument("--texture-size",type=int,choices=[1024,2048],default=2048)
    p.add_argument("--submit-once",action="store_true")
    args=p.parse_args()
    for name in ["production_root","metadata_dir","recon_attempt"]:setattr(args,name,getattr(args,name).resolve(strict=True))
    args.out_dir=args.out_dir.resolve()
    for protected in [args.production_root,args.metadata_dir,args.recon_attempt]:
        if args.out_dir==protected or args.out_dir.is_relative_to(protected) or protected.is_relative_to(args.out_dir):
            raise ValueError("Output must be distinct from protected assets/evidence")
    if args.submit_once and args.out_dir.exists() and any(args.out_dir.iterdir()):raise FileExistsError("Output nonempty; preserve previous attempt")
    image,provenance=validate_cached_v2_front(args)
    sf.check_contract(core.read_json(args.metadata_dir/"sf3d-runtime.json"),core.read_json(args.metadata_dir/"sf3d-info-v4.json"))
    wire_ids=sf.check_wire(core.read_json(args.metadata_dir/"sf3d-config.json"))
    evidence={"status":"offline-derived-v2-front-preflight-passed","character":"alexia","provider":sf.SPACE,"runtime_revision":sf.REVISION,
        "input_provenance":provenance,"input_snapshot_sha256":core.digest(image.read_bytes()),
        "upload_is_exact_cached_provider_preprocessed_rgba":True,"upload_rgb_exact_original_crop":False,"source_rgb_repainted":False,
        "derived_input_note":"Approved V2 lossless front crop was resized/background-removed by the previously completed Recon preprocessing; reuse exact saved518x518RGBA bytes, including intact navy suitcase. SF3D CPU foreground framing may resize again.",
        "transport":"Run Button plus five public positional args; standard client inserts hidden State at wire index2",
        "frontend_wire_component_ids":wire_ids,"frontend_wire_types":sf.WIRE_TYPES,
        "params":{"foreground_ratio":0.85,"remesh_option":"None","vertex_count":-1,"texture_size":args.texture_size},
        "authentication":"anonymous; token lookup disabled","declared_gpu_duration_seconds":60,
        "provider_generation_calls_attempted":0,"actual_job_started_observed":False,"provider_generation_submission_status":"not attempted",
        "automatic_retry":False,"production_approved":False,"scope":"True single-image textured mesh diagnostic. Hidden surfaces inferred; source identity, hair, hands and suitcase require actual mesh review."}
    if not args.submit_once:print(json.dumps(evidence),flush=True);return 0
    if args.pydeps:sys.path.insert(0,str(args.pydeps.resolve(strict=True)))
    import certifi
    context=ssl.create_default_context(cafile=certifi.where())
    args.out_dir.mkdir(parents=True,exist_ok=True);path=args.out_dir/"reconstruction-evidence.json"
    stage="live-read-only-preflight"
    try:
        runtime=core.request_json("https://huggingface.co/api/spaces/"+sf.SPACE,context)
        info=core.request_json(sf.BASE+"/info",context)
        config=core.request_json(sf.BASE+"/config",context)
        sf.check_contract(runtime,info);sf.check_wire(config)
        for name,value in [("live-runtime.json",runtime),("live-info.json",info),("live-config.json",config)]:core.write(args.out_dir/name,value)
        from gradio_client import Client,handle_file
        kwargs=dict(verbose=False,analytics_enabled=False,download_files=False,httpx_kwargs={"timeout":120},ssl_verify=context)
        kwargs["token" if "token" in inspect.signature(Client).parameters else "hf_token"]=False
        client=Client(sf.BASE,**kwargs)
        with (args.out_dir/"run-started.lock").open("x",encoding="utf-8") as stream:stream.write(core.now()+"\n")
        snapshot=args.out_dir/"input-approved-v2-rgba.png";snapshot.write_bytes(image.read_bytes())
        core.write(path,evidence)
        stage="setting-genuine-alpha-state"
        state_result=client.predict(image=handle_file(str(snapshot)),fr=0.85,api_name="/requires_bg_remove")
        core.write(args.out_dir/"alpha-state-result.json",state_result)
        stage="provider-generation"
        evidence.update(status="one-generation-call-attempted",provider_generation_calls_attempted=1,provider_generation_submission_status="client call attempted; job start not observed")
        core.write(path,evidence)
        result=client.predict("Run",handle_file(str(snapshot)),0.85,"None",-1,args.texture_size,api_name="/run_button")
        core.write(args.out_dir/"service-result.json",result)
        evidence.update(generation_returned=True,provider_generation_submission_status="result returned")
        core.write(path,evidence)
        stage="download-returned-glb"
        evidence.update(sf.download(result,args.out_dir/"alexia-sf3d-approved-v2-diagnostic.glb",context))
        evidence["status"]="actual-textured-mesh-generated-awaiting-review"
        print(json.dumps({k:evidence[k] for k in ["status","mesh","sha256","gltf_summary"]}),flush=True);return 0
    except Exception as exc:
        evidence.update(status="controlled-attempt-failed",failed_stage=stage,error_class=type(exc).__name__,error=str(exc))
        print(json.dumps({"stage":stage,"error":str(exc)}),flush=True);return 1
    finally:
        evidence["ended_utc"]=core.now();core.write(path,evidence)


if __name__=="__main__":raise SystemExit(main())
