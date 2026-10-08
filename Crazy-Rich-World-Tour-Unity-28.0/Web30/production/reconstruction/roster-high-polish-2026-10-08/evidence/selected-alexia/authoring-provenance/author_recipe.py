"""Create the new self-contained polish recipe from audited geometric utilities."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OLD = ROOT / 'alexia-high-visual-2026-10-08/geometry/build_clean_hair_final_waves.py'
# Explicit one-time authoring copy; the generated recipe has no historical imports.
OLD = Path('work/alexia-high-visual-2026-10-08/geometry/build_clean_hair_final_waves.py').resolve()
OUT = Path(__file__).resolve().parent / 'build_polished_hair.py'
prefix = OLD.read_text(encoding='utf-8').split('def main():')[0]
prefix = prefix[prefix.index('import argparse,'):]
prefix = prefix.replace("SOURCE_PIN='e18cc26d9662d5ec615fa636150b5f4eddaab9c8ca4c2b3b1ea702bf1d50efca'", "SOURCE_PIN='e88b27e4a71058a4576fb4ab1b3d6d24a621d771175ce700a9a3e959729daf52'")
prefix = prefix.replace("'half_depth':.0095", "'half_depth':.016")
prefix = prefix.replace("'width_scale':1.", "'width_scale':1.02")
prefix = prefix.replace("'color_gamma':[.825,.752,.925]", "'color_gamma':[.805,.727,.914]")
prefix = prefix.replace("rib=.025*", "rib=.012*")
prefix = prefix.replace('count=145;radial=24', 'count=181;radial=40')
prefix = prefix.replace('*(1-.980*smooth(.72,1,t))', '*(1-.995*smooth(.63,1,t))')
old = "th=2*math.pi*k/radial;pos.append(centers[j]+width[j]*(hw[j]*math.cos(th))+depth[j]*(hd[j]*math.sin(th)));uv.append([k/radial,t[j]])"
new = """th=2*math.pi*k/radial;u=math.cos(th);outer=max(math.sin(th),0.)**3
   # Shallow connected strand valleys follow the long sheet, fading before
   # roots and fine tips. They are actual relief, not dark texture stripes.
   valley=sum(math.exp(-((u-c)/.085)**2) for c in [-.58,-.13,.36,.73])
   amplitude=.00115*float(smooth(.18,.38,t[j]))*(1-float(smooth(.78,.96,t[j])))
   pos.append(centers[j]+width[j]*(hw[j]*u)+depth[j]*(hd[j]*math.sin(th)-amplitude*valley*outer));uv.append([t[j],k/radial])"""
assert old in prefix
prefix = prefix.replace(old, new)
prefix += r'''

def polished_guides(spec):
 result=guides(spec)
 for i,guide in enumerate(result):
  cp=guide['points'].copy();side=-1. if np.median(cp[:,0])<-.006 else 1.
  # Preserve the upper attachment/cup region. Shape only the lower drape into
  # staggered inward hooks, with a fine ascending tip rather than blunt blades.
  cp[-3,0]+=side*(.009+.003*math.sin(i*1.7))
  cp[-2,0]-=side*.008
  cp[-1,0]-=side*(.022+.005*math.cos(i))
  cp[-1,1]+=.012+.004*math.sin(i*1.9)
  cp[-1,2]-=.008
  guide['points']=cp
 return result

def tangent_space(p,n,uv,f):
 e1=p[f[:,1]]-p[f[:,0]];e2=p[f[:,2]]-p[f[:,0]]
 u1=uv[f[:,1]]-uv[f[:,0]];u2=uv[f[:,2]]-uv[f[:,0]]
 # V wraps around the sheet cross section; U follows the actual hair flow.
 for a in (u1,u2):a[:,1]-=np.round(a[:,1])
 det=u1[:,0]*u2[:,1]-u1[:,1]*u2[:,0];valid=abs(det)>1e-10;r=np.zeros_like(det);r[valid]=1/det[valid]
 ta=(e1*u2[:,1,None]-e2*u1[:,1,None])*r[:,None];bi=(e2*u1[:,0,None]-e1*u2[:,0,None])*r[:,None]
 ts=np.zeros_like(p);bs=np.zeros_like(p)
 for k in range(3):np.add.at(ts,f[:,k],ta);np.add.at(bs,f[:,k],bi)
 ts-=n*(ts*n).sum(1)[:,None];bad=np.linalg.norm(ts,axis=1)<1e-9
 axis=np.tile([0.,0.,1.],(len(p),1));axis[abs(n[:,2])>.9]=[0,1.,0]
 ts[bad]=unit(np.cross(axis,n))[bad];ts=unit(ts)
 sign=np.where((np.cross(n,ts)*bs).sum(1)<0,-1.,1.)
 result=np.column_stack((ts,sign)).astype('<f4')
 need(np.isfinite(result).all() and abs((ts*n).sum(1)).max()<1e-6,'Finite orthogonal tangent space')
 return result

def main():
 ap=argparse.ArgumentParser(description=__doc__)
 ap.add_argument('--source',type=pathlib.Path,required=True)
 ap.add_argument('--reference',type=pathlib.Path,required=True)
 ap.add_argument('--output-parent',type=pathlib.Path,required=True)
 a=ap.parse_args();src=a.source.resolve(strict=True);ref=a.reference.resolve(strict=True);out=a.output_parent.resolve()
 need(not out.exists() and not out.is_relative_to(src.parent) and out!=src,'Fresh external output required')
 raw=src.read_bytes();refraw=ref.read_bytes();pins=(sha(raw),src.stat().st_mtime_ns,sha(refraw),ref.stat().st_mtime_ns)
 need(pins[0]==SOURCE_PIN and pins[2]==REFERENCE_PIN,'Pinned e88/reference inputs')
 original,oldbin=read_glb(raw);d=copy.deepcopy(original);b=bytearray(oldbin)
 before=original['meshes'][0]['primitives'][1]
 need(before['material']==8 and get(original,oldbin,before['attributes']['POSITION']).shape==(58514,3),'Only actual authored hair primitive1/material8')
 need(original['materials'][8]['name'].startswith('Alexia authored rounded lavender scalp'),'Authored material identity')
 headnode=next(i for i,n in enumerate(d['nodes']) if n.get('name')=='AlexiaPrototype_Head');head=d['skins'][0]['joints'].index(headnode);need(head==5,'Actual Head joint slot')
 spec=VARIANTS['crown-waves'];parts=[];records=[]
 q,n,u,f,r=cap();parts.append((q,n,u,colors(q,n,spec,True),f));records.append(r)
 for guide in polished_guides(spec):
  q,n,u,f,r=sheet(guide,spec);parts.append((q,n,u,colors(q,n,spec,False),f));records.append(r)
 arrays=[[],[],[],[],[]];offset=0
 for q,n,u,c,f in parts:
  for destination,value in zip(arrays,(q,n,u,c,f+offset)):destination.append(value)
  offset+=len(q)
 p,n,u,c,f=[np.concatenate(values) for values in arrays]
 replacement=primitive(d,b,(p,n,u,c,f),8,head)
 tangent=tangent_space(p*AXES,n*AXES,u,f)
 replacement['attributes']['TANGENT']=append(d,b,tangent,34962)
 d['meshes'][0]['primitives'][1]=replacement
 material=copy.deepcopy(original['materials'][8]);material['name']='Alexia polished rounded lavender waves Oct8'
 material['pbrMetallicRoughness']['roughnessFactor']=.59
 material['extensions']['KHR_materials_anisotropy']={'anisotropyStrength':.18,'anisotropyRotation':0.0}
 d['materials'][8]=material;d['buffers'][0]['byteLength']=len(b)
 need(b[:len(oldbin)]==oldbin,'Original BIN prefix exact')
 need(d['accessors'][:len(original['accessors'])]==original['accessors'] and d['bufferViews'][:len(original['bufferViews'])]==original['bufferViews'],'Original array records exact')
 for key in original:
  if key not in ['meshes','materials','accessors','bufferViews','buffers']:need(d[key]==original[key],'Protected document exact '+key)
 need(d['meshes'][1:]==original['meshes'][1:],'Other meshes exact')
 need(all(q==original['meshes'][0]['primitives'][i] for i,q in enumerate(d['meshes'][0]['primitives']) if i!=1),'Every nonhair primitive exact')
 need(all(q==original['materials'][i] for i,q in enumerate(d['materials']) if i!=8),'Every nonhair material exact')
 j=json.dumps(d,separators=(',',':')).encode();j+=b' '*((-len(j))%4);b+=b'\0'*((-len(b))%4)
 result=struct.pack('<4sII',b'glTF',2,28+len(j)+len(b))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(b),0x004e4942)+b
 out.mkdir(parents=True);model=out/'alexia.glb';model.write_bytes(result)
 proof={'schema':'crwt.alexia.high_polish_hair.v1','passed':True,'visual_accepted':False,
  'source_sha256':pins[0],'reference_sha256':pins[2],'candidate_sha256':sha(result),'candidate_bytes':len(result),
  'recipe_sha256':sha(pathlib.Path(__file__).read_bytes()),'source_hair_mesh':0,'source_hair_primitive':1,'source_hair_material':8,
  'affected_primitive_name':'authored cap and sixteen rounded waves','affected_material_name':material['name'],
  'source_BIN_prefix_and_all_original_accessors_bufferViews_exact':True,
  'all_nonhair_primitives_materials_and_meshes_exact':True,'source_core_face_fringe_body_cups_unchanged':True,
  'nodes_skins_bind_matrices_animations_images_textures_default_scene_exact':True,
  'existing_original_hair_streams_stored_exact_rendered_hair_replaced':True,
  'new_all_actual_Head_rigid_joint_slot':head,'new_weight_rows_normalized':True,
  'old_hair_vertices':58514,'old_hair_triangles':116960,'new_hair_vertices':len(p),'new_hair_triangles':len(f),
  'closed_components':len(records),'components':records,'world_bounds':[p.min(0).tolist(),p.max(0).tolist()],
  'maximum_shallow_strand_valley_depth':.00115,'material_roughness':.59,'material_anisotropy_strength':.18,
  'limits':['Closed components overlap at cap attachments; exhaustive global intersections are not certified.',
            'Front identity and body are preserved; this hair pass does not repair their remaining artifacts.',
            'Manual original-character hair design uses only the reference quality direction, not the reference avatar geometry.'],
  'gameIntegrated':False}
 need((sha(src.read_bytes()),src.stat().st_mtime_ns,sha(ref.read_bytes()),ref.stat().st_mtime_ns)==pins,'Frozen inputs SHA/mtime unchanged')
 proof['source_reference_SHA_mtime_unchanged']=True
 (out/'hair-polish-proof.json').write_bytes((json.dumps(proof,indent=2)+'
').encode('utf-8'))
 print(json.dumps({k:proof[k] for k in ['candidate_sha256','candidate_bytes','new_hair_vertices','new_hair_triangles','closed_components','world_bounds']}))
if __name__=='__main__':main()
'''
# Correct the source literal into a single escaped newline in the generated file.
prefix = prefix.replace("json.dumps(proof,indent=2)+'\n'", "json.dumps(proof,indent=2)+'\\n'")
header = '"""Round only the e88 authored hair, with closed S waves and fine strand relief.\n\nStandalone: Python and NumPy; no historical imports or external services.\nOriginal face, body, hardware, source arrays, skeleton and clips stay exact.\n"""\n'
assert not OUT.exists()
OUT.write_bytes((header + prefix).encode('utf-8'))
compile(OUT.read_text(encoding='utf-8'), str(OUT), 'exec')
print(OUT)
