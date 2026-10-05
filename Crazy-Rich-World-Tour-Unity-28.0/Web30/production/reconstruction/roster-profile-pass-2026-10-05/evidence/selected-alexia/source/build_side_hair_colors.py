"""Append side-reference colors on a true mesh; leave geometry and reference images intact."""
import argparse, copy, hashlib, importlib.util, io, json, math, pathlib, struct
ROOT=pathlib.Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('reader',ROOT/'work/model-rebuild/Mochi-tail/inspect_components.py')
rd=importlib.util.module_from_spec(spec);spec.loader.exec_module(rd)
spec=importlib.util.spec_from_file_location('sampler',ROOT/'work/reference-fidelity-2026-10-05/build_blended_vertex_reference.py')
sampler=importlib.util.module_from_spec(spec);spec.loader.exec_module(sampler)
from PIL import Image
sha=lambda b:hashlib.sha256(b).hexdigest()
def interp(y,pairs):
 for (a,b),(c,d) in zip(pairs,pairs[1:]):
  if y<=c:return b+(d-b)*(y-a)/(c-a)
 a,b=pairs[-2];c,d=pairs[-1];return b+(d-b)*(y-a)/(c-a)
def linear_rgb(c):
 return tuple(round(255*(12.92*v if v<=.0031308 else 1.055*v**(1/2.4)-.055)) for v in c[:3])
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--source',type=pathlib.Path,required=True);ap.add_argument('--source-sha256',required=True);ap.add_argument('--out',type=pathlib.Path,required=True);ap.add_argument('--depth-scale',type=float,default=1);ap.add_argument('--weight',type=float,default=1);a=ap.parse_args()
 raw,d,b=rd.read_glb(a.source);assert sha(raw)==a.source_sha256 and not a.out.exists()
 refpath=ROOT/'outputs/model-review-2026-10-05-pass2/references/alexia-blue-v2-turnaround.png'
 refraw=refpath.read_bytes();assert sha(refraw)=='935b1f8f7d2be4a6a453a089041844f2cd4470eb64be17d9d72568efb3708933'
 im=Image.open(io.BytesIO(refraw)).convert('RGB')
 p=d['meshes'][0]['primitives'][0];at=p['attributes'];pos=rd.accessor(d,b,at['POSITION']);norm=rd.accessor(d,b,at['NORMAL']);colors=rd.accessor(d,b,at['COLOR_0'])
 cfg=json.loads((ROOT/'work/reference-fidelity-2026-10-05/front-projection-v8.json').read_bytes())
 new=[];picked=[];full=[];side_counts={'plus_x':0,'minus_x':0};samples=[]
 for i,(lp,ln,c) in enumerate(zip(pos,norm,colors)):
  x,y,z=-lp[0],lp[1],-lp[2];nx,ny,nz=-ln[0],ln[1],-ln[2];rgb=linear_rgb(c)
  nlen=math.sqrt(nx*nx+ny*ny+nz*nz);nx/=nlen;nz/=nlen
  weight=0;px=py=None;sampled=None
  color_hair=rgb[2]-rgb[1]>11 and rgb[2]-rgb[0]>5 and min(rgb)>72
  spatial_hair=(y>.14 and z<.08) or (z<-.070 and y>-.108 and abs(x)<.30)
  if -.108<y<.465 and z<.080 and abs(x)<.34 and (color_hair or spatial_hair):
   # Side-normal support only; the front and back-facing color work stays intact.
   # Smooth circumferential coordinates avoid imprinting the source's bumpy
   # triangle-normal pattern into the color transitions on merged clumps.
   radial=abs(x+.006)/max(.001,math.hypot(x+.006,z+.045))
   weight=sampler.smooth(.43,.82,radial)*(1-sampler.smooth(.86,.98,abs(nz)))
   weight*=sampler.smooth(-.108,-.060,y)*(1-sampler.smooth(.405,.465,y))*a.weight
   # Reuse the independent manual ear/crown/sole calibration for both sides.
   # These are separate illustrated profile anchors, not solved cameras.
   if x>-.006:
    scale=484.69*a.depth_scale;px=1268-(z-.092)*scale;py=18+(.479059-y)*484.69;valid=1028<px<1532 and 4<py<485;side='plus_x'
   else:
    scale=491.19*a.depth_scale;px=236+(z-.062)*scale;py=507+(.479059-y)*491.19;valid=4<px<508 and 494<py<1019;side='minus_x'
   if valid and weight>.0001:
    srgb=im.getpixel((round(px),round(py)))
    # Avoid printing the grey reference background or headphone hardware onto hair.
    if srgb[2]-srgb[1]>14 and srgb[2]-srgb[0]>7 and min(srgb)>72:
     sampled=sampler.sample(im,px,py);side_counts[side]+=1
    else:weight=0
   else:weight=0
  cc=(*sampler.lerp(c[:3],sampled,weight),c[3]) if sampled is not None and weight else c
  new.append(cc)
  if weight>.0001:
   picked.append(i)
   if weight>.98:full.append(i)
   if len(samples)<50:samples.append({'vertex':i,'world':[x,y,z],'normal':[nx,ny/nlen,nz],'pixel':[px,py],'source_color_linear':c,'sampled_color_linear':sampled,'weight':weight,'result_float32':struct.unpack('<4f',struct.pack('<4f',*cc))})
 assert len(picked)>2000
 doc=copy.deepcopy(d);binary=bytearray(b)
 while len(binary)%4:binary.append(0)
 vi=len(doc['bufferViews']);doc['bufferViews'].append({'buffer':0,'byteOffset':len(binary),'byteLength':len(new)*16,'target':34962})
 binary.extend(struct.pack('<'+'f'*len(new)*4,*[v for q in new for v in q]));ai=len(doc['accessors']);doc['accessors'].append({'bufferView':vi,'componentType':5126,'count':len(new),'type':'VEC4'})
 doc['meshes'][0]['primitives'][0]['attributes']['COLOR_0']=ai;doc['buffers'][0]['byteLength']=len(binary)
 clone=copy.deepcopy(d);clone['meshes'][0]['primitives'][0]['attributes']['COLOR_0']=ai
 assert doc['meshes']==clone['meshes'] and binary[:len(b)]==b
 for key in ('nodes','scenes','images','textures','materials','skins','animations'):assert doc.get(key)==d.get(key)
 outside=[i for i in range(len(new)) if i not in set(picked)] if False else len(new)-len(picked)
 js=json.dumps(doc,separators=(',',':')).encode();js+=b' '*((-len(js))%4);binary+=b'\0'*((-len(binary))%4)
 result=struct.pack('<4sII',b'glTF',2,28+len(js)+len(binary))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(binary),0x004e4942)+binary
 a.out.parent.mkdir(parents=True,exist_ok=True);a.out.write_bytes(result)
 proof={'schema':'crwt.alexia.side_hair_reference_colors.v1','source_sha256':sha(raw),'candidate_sha256':sha(result),'candidate_bytes':len(result),'reference_sha256':sha(refraw),'builder_sha256':sha(pathlib.Path(__file__).read_bytes()),'depth_scale':a.depth_scale,'maximum_weight':a.weight,'changed_color_vertices':len(picked),'fully_sampled_vertices':len(full),'unchanged_color_vertices':outside,'side_counts':side_counts,'source_bin_prefix_preserved':True,'positions_normals_uv_indices_materials_images_nodes_exact':True,'reference_pixels_unchanged':True,'samples':samples,'approved':False,'gameIntegrated':False,'limits':['Manual side view depth calibration; no camera solve or precision percentage.','Fixed surface colors blend inconsistent illustrated views and retain baked shading.','Side-hair-only recoloring adds no geometry, strands, anatomy or rig.']}
 a.out.with_suffix('.side-color-proof.json').write_text(json.dumps(proof,indent=2)+'\n')
 assert sha(a.source.read_bytes())==a.source_sha256 and sha(refpath.read_bytes())==proof['reference_sha256']
 print(json.dumps({k:v for k,v in proof.items() if k not in ('samples','limits')}))
if __name__=='__main__':main()
