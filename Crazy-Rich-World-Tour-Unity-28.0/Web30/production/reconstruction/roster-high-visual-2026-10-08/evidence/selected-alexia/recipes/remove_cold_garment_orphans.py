"""Remove diagnostic-confirmed cold retained garment/case orphan triangles.

The exact anatomical protector is frozen by the preceding cleanup. Every
triangle vertex must lie inside the bounded body/leg/case neighborhood, and no
red/orange/white/blue anatomical or hair row may be incident. Source streams,
all authored primitives, materials, bones, skins and clips remain byte exact.
"""
import sys
sys.dont_write_bytecode=True
import argparse,copy,hashlib,json,pathlib,struct
import numpy as np
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def read(p):
 r=p.read_bytes();assert struct.unpack_from('<4sII',r)==(b'glTF',2,len(r));n,k=struct.unpack_from('<II',r,12);assert k==0x4e4f534a
 size,k=struct.unpack_from('<II',r,20+n);assert k==0x004e4942
 return json.loads(r[20:20+n]),r[28+n:28+n+size]
def acc(d,b,i):
 a=d['accessors'][i];v=d['bufferViews'][a['bufferView']];width={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']];dt=np.dtype({5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']])
 return np.ndarray((a['count'],width),dt,buffer=b,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',width*dt.itemsize),dt.itemsize)).copy()
def build(source,semantic,protector,output):
 assert not output.exists();paths=(source,semantic,protector);before={str(p):(sha(p),p.stat().st_mtime_ns) for p in paths};d,b=read(source);q=d['meshes'][0]['primitives'][0];a=q['attributes'];local=acc(d,b,a['POSITION']);world=local.astype(float)*[-1,1,-1];x,y,z=world.T;ax=abs(x+.006);rows=np.arange(len(local));old=acc(d,b,q['indices']).reshape(-1,3)
 sem=np.load(semantic);m=np.load(protector);protected=np.isin(rows,m['protected_indices']);assert len(m['source_leg_skin_indices'])==8468
 assert np.isin(np.r_[sem['mandatory_face_indices'],sem['cup_indices']],m['protected_indices']).all()
 _,cohort=np.unique(local.view(np.dtype((np.void,12))).reshape(-1),return_inverse=True);hair=np.isin(cohort,cohort[sem['hair_indices']]);assert protected[hair].all()
 node=next(n for n in d['nodes'] if n.get('mesh')==0);skin=d['skins'][node['skin']];names=[d['nodes'][n]['name'].replace('AlexiaPrototype_','') for n in skin['joints']];j=acc(d,b,a['JOINTS_0']);w=acc(d,b,a['WEIGHTS_0']);bone={name:np.where(j==i,w,0).sum(1) for i,name in enumerate(names)};head,case=bone['Head'],bone['Suitcase'];leg=sum(bone[n] for n in ('ThighL','ShinL','FootL','ThighR','ShinR','FootR'))
 body=(y>-.23)&(y<.13)&(ax>.06)&(ax<.35)&(z>-.14)&(z<.22)&(head<.1)&(case<.2)
 limbs=(y>-.36)&(y<-.13)&(ax<.18)&(z>-.12)&(z<.21)&(leg>.5)&(head<.1)&(case<.1)
 luggage=(x>.16)&(y>-.45)&(y<-.14)&(z>-.08)&(z<.21)&(head<.1)
 allowed=(body|limbs|luggage)&~protected;remove=np.all(allowed[old],1);assert not np.any(protected[old[remove]])
 dd=copy.deepcopy(d);bb=bytearray(b);bb.extend(b'\0'*(-len(bb)%4));kept=old[~remove].reshape(-1).astype('<u4');vi=len(dd['bufferViews']);ai=len(dd['accessors']);dd['bufferViews'].append({'buffer':0,'byteOffset':len(bb),'byteLength':kept.nbytes,'target':34963});bb.extend(kept.tobytes());dd['accessors'].append({'bufferView':vi,'componentType':5125,'count':len(kept),'type':'SCALAR'});dd['meshes'][0]['primitives'][0]['indices']=ai;dd['buffers'][0]['byteLength']=len(bb);js=json.dumps(dd,separators=(',',':')).encode();js+=b' '*(-len(js)%4);bb.extend(b'\0'*(-len(bb)%4));raw=struct.pack('<4sII',b'glTF',2,28+len(js)+len(bb))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(bb),0x004e4942)+bb
 output.mkdir(parents=True);target=output/'alexia.glb';target.open('xb').write(raw);mp=output/'cold-orphan-masks.npz';np.savez_compressed(mp,allowed_cold_row_indices=np.flatnonzero(allowed),protected_indices=np.flatnonzero(protected),removed_current_core_triangle_indices=np.flatnonzero(remove),source_warm_leg_indices=m['source_leg_skin_indices'],source_warm_hand_skin_indices=m['source_warm_hand_skin_indices'],actual_Hand_heavy_indices=m['actual_hand_heavy_indices'],source_shirt_indices=m['source_shirt_indices']);touch=np.unique(old[remove])
 assert before=={str(p):(sha(p),p.stat().st_mtime_ns) for p in paths}
 report={'schema':'crwt.alexia_high_visual_cold_orphan_cleanup.v1','source_sha256':sha(source),'candidate_sha256':sha(target),'semantic_mask_sha256':sha(semantic),'anatomical_protector_sha256':sha(protector),'cleanup_mask_sha256':sha(mp),'recipe_sha256':sha(pathlib.Path(__file__)),'passed':True,'visual_accepted':False,'visual_motion_accepted':False,'approved':False,'gameIntegrated':False,'removed_current_core_triangles':int(remove.sum()),'retained_current_core_triangles':int((~remove).sum()),'removed_protected_incidence':0,'touched_original_row_count':len(touch),'touched_original_world_bounds':[world[touch].min(0).tolist(),world[touch].max(0).tolist()] if len(touch) else None,'all_original_arrays_COLORS_materials_nodes_skins_clips_BIN_prefix_exact':True,'all_preexisting_authored_primitives_exact':True,'actual_warm_leg_rows_retained':8468,'rule':'Every vertex of a current original-core triangle is inside the union body(-.23<Y<.13,.06<abs(X+.006)<.35,-.14<Z<.22,Head<.1,Suitcase<.2), legs(-.36<Y<-.13,abs(X+.006)<.18,-.12<Z<.21,actual legweight>.5,Head/Suitcase<.1), case(X>.16,-.45<Y<-.14,-.08<Z<.21,Head<.1); no frozen anatomical/hair protector row is incident. No authored garment-touch requirement.', 'input_hash_mtime_unchanged':True,'limits':['Scope follows saturated actual geometry diagnostics; new real rest/Walk views are still required.','Frozen warm hand/leg and shirt rows remain even if their inherited reconstruction is coarse.','Original arrays remain stored exactly; only current original-core triangle index routing changes.']};proof=output/'cold-orphan-proof.json';proof.open('x',encoding='utf-8').write(json.dumps(report,indent=2)+'\n');print(json.dumps({'candidate_path':str(target),'candidate_sha256':sha(target),'proof_sha256':sha(proof),'mask_sha256':sha(mp),'removed':int(remove.sum()),'protected_incidence':0},indent=2))
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__)
 for key in ('source','semantic','protector','output'):p.add_argument('--'+key,type=pathlib.Path,required=True)
 a=p.parse_args();build(a.source.resolve(strict=True),a.semantic.resolve(strict=True),a.protector.resolve(strict=True),a.output.resolve())
