"""Final bounded cleanup of retained case/garment fragments after rear-calf repair.

Only the current original-core index stream is replaced. All source vertex
arrays, authored primitives/materials, nodes, skins and clips remain unchanged.
No image, COLOR or POSITION edit is performed.
"""
import sys
sys.dont_write_bytecode=True
import argparse,copy,hashlib,json,pathlib,struct
import numpy as np
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def read(p):
 raw=p.read_bytes();assert struct.unpack_from('<4sII',raw)==(b'glTF',2,len(raw));n,k=struct.unpack_from('<II',raw,12);assert k==0x4e4f534a
 size,k=struct.unpack_from('<II',raw,20+n);assert k==0x004e4942
 return json.loads(raw[20:20+n]),raw[28+n:28+n+size]
def acc(d,b,i):
 a=d['accessors'][i];v=d['bufferViews'][a['bufferView']];width={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']];dt=np.dtype({5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']])
 return np.ndarray((a['count'],width),dt,buffer=b,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',width*dt.itemsize),dt.itemsize)).copy()
def build(source,baseline,semantic,garment,output):
 assert not output.exists(),'Fresh external output required'
 paths=(source,baseline,semantic,garment);before={str(p):(sha(p),p.stat().st_mtime_ns) for p in paths}
 d,b=read(source);bd,bb=read(baseline);q=d['meshes'][0]['primitives'][0];a=q['attributes'];old=acc(d,b,q['indices']).reshape(-1,3);local=acc(d,b,a['POSITION']);world=local.astype(float)*[-1,1,-1];x,y,z=world.T;ax=abs(x+.006);rows=np.arange(len(local))
 assert len(local)==252943 and sha(baseline)=='e18cc26d9662d5ec615fa636150b5f4eddaab9c8ca4c2b3b1ea702bf1d50efca'
 assert local.tobytes()==acc(bd,bb,bd['meshes'][0]['primitives'][0]['attributes']['POSITION']).tobytes()
 s=np.load(semantic);g=np.load(garment);named={k:np.isin(rows,s[k+'_indices']) for k in ('hair','cup','mandatory_face')}
 _,cohort=np.unique(local.view(np.dtype((np.void,12))).reshape(-1),return_inverse=True);hair=np.isin(cohort,cohort[named['hair']])
 node=next(n for n in d['nodes'] if n.get('mesh')==0);skin=d['skins'][node['skin']];names=[d['nodes'][n]['name'].replace('AlexiaPrototype_','') for n in skin['joints']]
 joints=acc(d,b,a['JOINTS_0']);weights=acc(d,b,a['WEIGHTS_0']);bone={name:np.where(joints==i,weights,0).sum(1) for i,name in enumerate(names)}
 head,case=bone['Head'],bone['Suitcase'];hand=bone['HandL']+bone['HandR'];leg=sum(bone[k] for k in ('ThighL','ShinL','FootL','ThighR','ShinR','FootR'))
 # The inherited broad geometric palm box includes coat and Head-hair rows.
 # Use direct Hand assignment plus source skin hue in the actual hand region.
 original=acc(bd,bb,bd['meshes'][0]['primitives'][0]['attributes']['COLOR_0'])[:,:3].astype(float)
 rgb=np.where(original<=.0031308,original*12.92,1.055*np.power(original,1/2.4)-.055)
 warm=(rgb[:,0]>.65)&(rgb[:,2]>.40)&(rgb[:,0]-rgb[:,1]>.04)&(rgb[:,1]-rgb[:,2]>.015)
 hand_heavy=(hand>.35)&(case<.2)&(head<.1)
 hand_box=warm&(y>-.20)&(y<-.035)&(ax>.145)&(z>-.05)&(head<.1)&(case<.2)
 hand_skin=hand_box&((hand+bone['ForearmL']+bone['ForearmR'])>.25)
 false_warm_hand_box=hand_box&~hand_skin
 leg_skin=(y>-.35)&(y<-.13)&(ax>.008)&(ax<.18)&(leg>.5)&(head<.1)&(case<.1)&warm
 shirt=(y>-.04)&(y<.15)&(ax<.077)&(z>.061)&(head<.2)&(case<.1)
 protected=named['mandatory_face']|named['cup']|hair|hand_heavy|hand_skin|leg_skin|shirt
 garment_rows=np.isin(rows,np.unique(np.r_[g['coat_indices'],g['cuffs_indices'],g['shorts_indices'],g['boots_indices'],g['suitcase_indices']]))
 lowercase=(x>.195)&(y<-.18)
 case_remove=np.any(lowercase[old],1)&~np.any(protected[old],1)
 # Extend only mixed triangles touching the already authored garment; every
 # incident row remains in a bounded body/sleeve/shorts neighborhood.
 nearbody=(y>-.18)&(y<.145)&(ax<.34)&(z>-.12)&(z<.205)&(head<.1)&(case<.2)
 mixed_remove=np.any((garment_rows|false_warm_hand_box)[old],1)&np.all(nearbody[old],1)&~np.any(protected[old],1)
 case_neighborhood=(x>.16)&(y<-.14)&(y>-.45)&(z>-.08)&(z<.21)&(head<.1)
 case_touch=np.isin(rows,g['suitcase_indices'])
 mixed_case=np.any((case_touch|false_warm_hand_box)[old],1)&np.all(case_neighborhood[old],1)&~np.any(protected[old],1)
 mixed_remove|=mixed_case
 remove=case_remove|mixed_remove
 assert not np.any(protected[old[remove]])
 kept=old[~remove].astype('<u4');dd=copy.deepcopy(d);binary=bytearray(b);binary.extend(b'\0'*(-len(binary)%4));view=len(dd['bufferViews']);accessor=len(dd['accessors'])
 dd['bufferViews'].append({'buffer':0,'byteOffset':len(binary),'byteLength':kept.nbytes,'target':34963});binary.extend(kept.reshape(-1).tobytes())
 dd['accessors'].append({'bufferView':view,'componentType':5125,'count':kept.size,'type':'SCALAR'})
 dd['meshes'][0]['primitives'][0]['indices']=accessor;dd['buffers'][0]['byteLength']=len(binary);js=json.dumps(dd,separators=(',',':')).encode();js+=b' '*(-len(js)%4);binary.extend(b'\0'*(-len(binary)%4))
 result=struct.pack('<4sII',b'glTF',2,28+len(js)+len(binary))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(binary),0x004e4942)+binary
 output.mkdir(parents=True);model=output/'alexia.glb';model.open('xb').write(result)
 maskpath=output/'retained-cleanup-masks.npz';np.savez_compressed(maskpath,lowercase_candidate_row_indices=np.flatnonzero(lowercase),removed_case_triangle_indices=np.flatnonzero(case_remove),removed_mixed_garment_triangle_indices=np.flatnonzero(mixed_remove),removed_union_triangle_indices=np.flatnonzero(remove),protected_indices=np.flatnonzero(protected),actual_hand_heavy_indices=np.flatnonzero(hand_heavy),source_warm_hand_skin_indices=np.flatnonzero(hand_skin),source_leg_skin_indices=np.flatnonzero(leg_skin),false_warm_hand_box_indices=np.flatnonzero(false_warm_hand_box),removed_mixed_case_triangle_indices=np.flatnonzero(mixed_case),source_shirt_indices=np.flatnonzero(shirt))
 def bounds(flag):
  touch=np.unique(old[flag]);return [world[touch].min(0).tolist(),world[touch].max(0).tolist()] if len(touch) else None
 check={str(p):(sha(p),p.stat().st_mtime_ns) for p in paths};assert before==check
 report={'schema':'crwt.alexia_high_visual_retained_cleanup_trial.v2_final_bounded','source_sha256':sha(source),'baseline_sha256':sha(baseline),'semantic_mask_sha256':sha(semantic),'garment_mask_sha256':sha(garment),'candidate_sha256':sha(model),'cleanup_mask_sha256':sha(maskpath),'recipe_sha256':sha(pathlib.Path(__file__)),'passed':True,'approved':False,'gameIntegrated':False,'visual_accepted':False,
 'removed_lower_case_triangles':int(case_remove.sum()),'removed_mixed_garment_triangles':int(mixed_remove.sum()),'removed_union_triangles':int(remove.sum()),'removed_mixed_case_triangles':int(mixed_case.sum()),'protected_actual_warm_leg_rows':int(leg_skin.sum()),'false_warm_hand_box_rows':int(false_warm_hand_box.sum()),'retained_core_triangles':len(kept),'protected_incident_removed_triangles':int(np.any(protected[old[remove]],1).sum()),'lower_case_removed_world_bounds':bounds(case_remove),'mixed_garment_removed_world_bounds':bounds(mixed_remove),
 'case_rule':'Current retained core triangle has any source row worldX>.195 and worldY<-.18, and no protected incident row.',
 'mixed_rule':'Current retained core triangle touches authored coat/cuff/shorts/boots/case or false warm Hand-box row; all three rows in -.18<Y<.145, abs(X+.006)<.34, -.12<Z<.205, Head<.1,Suitcase<.2; no protected incidence. Separate case-touch triangle: all rows X>.16,-.45<Y<-.14,-.08<Z<.21,Head<.1; no protected incidence.',
 'protected_rule':'Mandatoryface OR cup OR exact frozen semantic-hair POSITION closure OR direct HandL+HandR>.35 (Head<.1,Suitcase<.2) OR source warm skin in -.20<Y<-.035,abs(X+.006)>.145,Z>-.05,Head<.1,Suitcase<.2 AND actual Hand+Forearm>.25 OR actual warm legskin in-.35<Y<-.13, .008<abs(X+.006)<.18, actual legweight>.5,Head/Suitcase<.1 OR central shirt predicate.',
 'source_all_arrays_attributes_colors_materials_nodes_skins_clips_BIN_prefix_exact':True,'input_hash_mtime_unchanged':True,'limits':['Analysis-derived fresh cleanup requires actual side and motion inspection.','Source warm hand-region hue is a conservative protector and may retain some inherited garment fragments.','Only original core index routing changes; new authored components are identical to the parent trial.']}
 proof=output/'retained-cleanup-proof.json';proof.open('x',encoding='utf-8').write(json.dumps(report,indent=2)+'\n')
 print(json.dumps({'candidate_path':str(model),'candidate_sha256':sha(model),'proof_sha256':sha(proof),'mask_sha256':sha(maskpath),'case_triangles':int(case_remove.sum()),'mixed_triangles':int(mixed_remove.sum()),'union_triangles':int(remove.sum()),'protected_incidence':0},indent=2))
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__)
 for key in ('source','baseline','semantic','garment','output'):p.add_argument('--'+key,type=pathlib.Path,required=True)
 a=p.parse_args();build(a.source.resolve(strict=True),a.baseline.resolve(strict=True),a.semantic.resolve(strict=True),a.garment.resolve(strict=True),a.output.resolve())
