"""Read-only actual GLB preservation audit for the isolated Pip casing pass."""
from __future__ import annotations
import argparse
import hashlib
import json
import math
import struct
from pathlib import Path

V8_SHA = "abef291c518c0ea34625678644910270fc9594e1d107ca80988db2059609fb32"
TARGET_SUFFIXES = {
    "rounded turquoise shell", "plain rear lid", "ivory front face",
    "gold screen surround", "white screen bezel", "recessed black glass screen",
    "central gold compass badge", "west blue globe land stamp", "east blue globe land stamp",
    "upper left rounded patch", "upper right rounded patch", "lower left rounded patch",
    "blue rounded airplane patch", "white airplane patch silhouette",
    "upper left hollow star icon", "upper right hollow star icon", "lower left hollow star icon",
    "source-guided gold angular lower panel", "left lower panel fine tile seam",
    "middle lower panel fine tile seam", "right lower panel fine tile seam",
    "broad cyan lower right armor",
}
TARGETS = {label+" "+part for label in ("Main", "Companion") for part in TARGET_SUFFIXES}
REMOVED = {label+" subtle lower panel seam" for label in ("Main", "Companion")}
WIDTH = {"SCALAR":1,"VEC2":2,"VEC3":3,"VEC4":4,"MAT4":16}
COMP = {5120:("b",1),5121:("B",1),5122:("h",2),5123:("H",2),5125:("I",4),5126:("f",4)}

def digest(raw): return hashlib.sha256(raw).hexdigest()

class Glb:
    def __init__(self,path):
        self.path=path.resolve(strict=True);raw=self.path.read_bytes();self.sha=digest(raw)
        magic,version,length=struct.unpack_from("<III",raw)
        assert (magic,version,length)==(0x46546c67,2,len(raw)),"Invalid GLB header"
        size,kind=struct.unpack_from("<II",raw,12);assert kind==0x4e4f534a
        self.doc=json.loads(raw[20:20+size]);offset=20+size
        size,kind=struct.unpack_from("<II",raw,offset);assert kind==0x004e4942
        self.binary=raw[offset+8:offset+8+size]
        assert offset+8+size==len(raw),"Unexpected extra GLB chunk"
        self.parts={}
        for node in self.doc["nodes"]:
            if "mesh" not in node:continue
            name=node["extras"]["part"]
            assert name not in self.parts,"Duplicate part"
            self.parts[name]=node

    def accessor(self,index):
        a=self.doc["accessors"][index];assert "sparse" not in a
        v=self.doc["bufferViews"][a["bufferView"]];assert v.get("buffer",0)==0
        code,size=COMP[a["componentType"]];width=WIDTH[a["type"]];unit=size*width
        start=v.get("byteOffset",0)+a.get("byteOffset",0);stride=v.get("byteStride",unit)
        assert stride>=unit
        end=start+(a["count"]-1)*stride+unit if a["count"] else start
        assert end<=v.get("byteOffset",0)+v["byteLength"]<=len(self.binary),"Accessor out of range"
        raw=b"".join(self.binary[start+i*stride:start+i*stride+unit] for i in range(a["count"]))
        return a,raw,code,width

    def values(self,index):
        a,raw,code,width=self.accessor(index)
        return list(struct.iter_unpack("<"+code*width,raw))

    def signature(self,name,exact=False):
        node=self.parts[name];rows=[]
        for primitive in self.doc["meshes"][node["mesh"]]["primitives"]:
            fields={}
            for key,index in {**primitive["attributes"],"indices":primitive["indices"]}.items():
                a,raw,_,_=self.accessor(index)
                if not exact and key.startswith("TEXCOORD_"):continue
                if not exact and key=="indices":
                    # Blender may reorder triangles while exporting a primitive.
                    # Retain winding, canonicalize only cyclic rotation/order.
                    indices=[row[0] for row in self.values(index)]
                    triangles=[]
                    for i in range(0,len(indices),3):
                        tri=tuple(indices[i:i+3])
                        triangles.append(min(tri,tri[1:]+tri[:1],tri[2:]+tri[:2]))
                    raw=json.dumps(sorted(triangles),separators=(",",":")).encode()
                fields[key]={"type":a["type"],"componentType":a["componentType"],"count":a["count"],
                             "normalized":a.get("normalized",False),"sha256":digest(raw)}
            rows.append({"attributes":fields,"mode":primitive.get("mode",4),
                         "material":self.doc["materials"][primitive["material"]]})
        return {"transforms":{k:node.get(k) for k in ("matrix","translation","rotation","scale")},
                "bone":node["extras"]["mechanical_bone"],"primitives":rows}

    def validate(self):
        totals={"triangles":0,"exported_vertices":0,"min_weight_sum":1.0,"max_weight_sum":1.0}
        for name,node in self.parts.items():
            for p in self.doc["meshes"][node["mesh"]]["primitives"]:
                assert p.get("mode",4)==4
                positions=self.values(p["attributes"]["POSITION"])
                assert all(math.isfinite(v) for row in positions for v in row),name
                indices=[row[0] for row in self.values(p["indices"])]
                assert len(indices)%3==0 and all(0<=i<len(positions) for i in indices),name
                weights=self.values(p["attributes"]["WEIGHTS_0"])
                joints=self.values(p["attributes"]["JOINTS_0"])
                assert len(weights)==len(joints)==len(positions),name
                for ws,js in zip(weights,joints):
                    assert all(math.isfinite(w) and 0<=w<=1 for w in ws),name
                    assert abs(sum(ws)-1)<1e-6,name
                    assert all(0<=j<13 for j in js),name
                    totals["min_weight_sum"]=min(totals["min_weight_sum"],sum(ws))
                    totals["max_weight_sum"]=max(totals["max_weight_sum"],sum(ws))
                totals["triangles"]+=len(indices)//3;totals["exported_vertices"]+=len(positions)
        return totals

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--baseline",type=Path,required=True)
    ap.add_argument("--candidate",type=Path,required=True)
    ap.add_argument("--expected-candidate-sha256",required=True)
    ap.add_argument("--output",type=Path,required=True)
    cfg=ap.parse_args();baseline=Glb(cfg.baseline);candidate=Glb(cfg.candidate)
    assert baseline.sha==V8_SHA,"Frozen V8 mismatch"
    assert candidate.sha==cfg.expected_candidate_sha256,"Candidate mismatch"
    before=set(baseline.parts);after=set(candidate.parts)
    assert before-after==REMOVED and not after-before,"Unexpected added/removed part"
    changed={n for n in after if baseline.signature(n)!=candidate.signature(n)}
    assert changed==TARGETS,("Unexpected changed or missing change",sorted(changed-TARGETS),sorted(TARGETS-changed))
    untouched=after-changed
    raw_identical=0;max_uv_delta=0.0;uv_parts=[]
    for name in untouched:
        if baseline.signature(name,exact=True)==candidate.signature(name,exact=True):raw_identical+=1
        bm=baseline.doc["meshes"][baseline.parts[name]["mesh"]]["primitives"]
        cm=candidate.doc["meshes"][candidate.parts[name]["mesh"]]["primitives"]
        for bp,cp in zip(bm,cm):
            uvkeys={k for k in bp["attributes"] if k.startswith("TEXCOORD_")}
            assert uvkeys=={k for k in cp["attributes"] if k.startswith("TEXCOORD_")}
            for key in uvkeys:
                buv=baseline.values(bp["attributes"][key]);cuv=candidate.values(cp["attributes"][key])
                assert len(buv)==len(cuv)
                delta=max(abs(x-y) for b,c in zip(buv,cuv) for x,y in zip(b,c))
                assert delta<=1e-7,(name,"UV drift",delta)
                if delta:uv_parts.append(name)
                max_uv_delta=max(max_uv_delta,delta)
    result={"schema":"crwt.pip-actual-glb-preservation.v1","approved":False,"gameIntegrated":False,
            "baseline_sha256":baseline.sha,"candidate_sha256":candidate.sha,
            "baseline":baseline.validate(),"candidate":candidate.validate(),
            "mesh_parts_before":len(before),"mesh_parts_after":len(after),
            "changed_parts":sorted(changed),"removed_parts":sorted(REMOVED),
            "unchanged_parts":sorted(untouched),
            "untouched_position_normal_skin_transform_material_bytes_identical":True,
            "untouched_oriented_triangle_sets_identical":True,
            "untouched_all_raw_accessor_bytes_identical_count":raw_identical,
            "procedural_uv_float_roundoff":{"max_absolute_delta":max_uv_delta,"parts":sorted(set(uv_parts)),
                "limit":1e-7,"material_texture_usage":False},
            "material_definitions_identical":baseline.doc["materials"]==candidate.doc["materials"],
            "limits":"Actual geometry preservation and valid skin data; visual fidelity needs rendered comparison and user approval."}
    assert result["material_definitions_identical"],"Palette changed"
    cfg.output=cfg.output.resolve()
    assert cfg.output.is_relative_to(Path(__file__).resolve().parent) and not cfg.output.exists(),"Use a fresh isolated proof path"
    cfg.output.write_text(json.dumps(result,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({"changed":len(changed),"unchanged":len(after-changed),"removed":len(REMOVED),
                      "triangles":result["candidate"]["triangles"],"output":str(cfg.output)}))

if __name__=="__main__":main()
