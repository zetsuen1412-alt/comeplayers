"""Give only the newly authored hair a soft directional PBR highlight.

KHR_materials_anisotropy requires a defined tangent space: explicit finite
orthogonal TANGENT vectors are appended for the new hair primitive. Existing
face, fringe, precision cups, cloth, bind matrices and clip streams stay exact.
"""
import argparse,copy,hashlib,json,math,pathlib,struct
import numpy as np
from build_clean_headband import read,acc,append,unit,sha

def tangents(p,n,uv,f):
    e1=p[f[:,1]]-p[f[:,0]];e2=p[f[:,2]]-p[f[:,0]]
    u1=uv[f[:,1]]-uv[f[:,0]];u2=uv[f[:,2]]-uv[f[:,0]]
    # U is periodic around closed cap/sheet sections. Keep seam derivatives
    # local instead of differentiating across the complete texture interval.
    for a in (u1,u2):a[:,0]-=np.round(a[:,0])
    determinant=u1[:,0]*u2[:,1]-u1[:,1]*u2[:,0];valid=abs(determinant)>1e-10
    r=np.zeros_like(determinant);r[valid]=1/determinant[valid]
    t=(e1*u2[:,1,None]-e2*u1[:,1,None])*r[:,None];bit=(e2*u1[:,0,None]-e1*u2[:,0,None])*r[:,None]
    t=np.nan_to_num(t);bit=np.nan_to_num(bit);ts=np.zeros_like(p);bs=np.zeros_like(p)
    for k in range(3):np.add.at(ts,f[:,k],t);np.add.at(bs,f[:,k],bit)
    ts-=n*(ts*n).sum(1)[:,None];bad=np.linalg.norm(ts,axis=1)<1e-8
    axis=np.tile([0.,0.,1.],(len(p),1));axis[abs(n[:,2])>.9]=[0,1.,0]
    fallback=unit(np.cross(axis,n));ts[bad]=fallback[bad];ts=unit(ts)
    sign=np.where((np.cross(n,ts)*bs).sum(1)<0,-1.,1.)
    out=np.column_stack((ts,sign)).astype('<f4')
    assert np.isfinite(out).all() and np.max(abs((ts*n).sum(1)))<1e-5
    return out,int(bad.sum())
def main():
    q=argparse.ArgumentParser();q.add_argument('--source',required=True,type=pathlib.Path);q.add_argument('--output',required=True,type=pathlib.Path);q.add_argument('--roughness',type=float,default=.5);a=q.parse_args();assert not a.output.exists() and .35<=a.roughness<=.65
    raw=a.source.read_bytes();d,old=read(raw);original=copy.deepcopy(d);b=bytearray(old);changes=[]
    for mi,m in enumerate(d['materials']):
        if not m.get('name','').startswith('Alexia authored rounded lavender scalp and S sheets'):continue
        assert 'KHR_materials_unlit' not in m.get('extensions',{})
        m['pbrMetallicRoughness']['roughnessFactor']=a.roughness
        m.setdefault('extensions',{})['KHR_materials_anisotropy']={'anisotropyStrength':.35,'anisotropyRotation':0.0}
        for mesh in d['meshes']:
            for pr in mesh['primitives']:
                if pr.get('material')!=mi:continue
                attrs=pr['attributes'];p=acc(d,old,attrs['POSITION']).astype(float);n=unit(acc(d,old,attrs['NORMAL']).astype(float));uv=acc(d,old,attrs['TEXCOORD_0']).astype(float);f=acc(d,old,pr['indices']).reshape(-1,3)
                t,fall=tangents(p,n,uv,f);attrs['TANGENT']=append(d,b,t,34962)
                changes.append({'material_index':mi,'vertices':len(t),'finite_unit_tangents':True,'max_normal_dot_tangent':float(np.max(abs((n*t[:,:3]).sum(1)))),'fallback_pole_or_degenerate_uv_vertices':fall})
    assert len(changes)==1,'One authored hair primitive required'
    used=d.setdefault('extensionsUsed',[])
    if 'KHR_materials_anisotropy' not in used:used.append('KHR_materials_anisotropy')
    for k in ['nodes','skins','animations','images','textures','samplers']:assert d.get(k)==original.get(k)
    assert b[:len(old)]==old;d['buffers'][0]['byteLength']=len(b);j=json.dumps(d,separators=(',',':')).encode();j+=b' '*((-len(j))%4);b+=b'\0'*((-len(b))%4)
    out=struct.pack('<4sII',b'glTF',2,28+len(j)+len(b))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(b),0x004e4942)+b;a.output.parent.mkdir(parents=True,exist_ok=True);a.output.open('xb').write(out)
    proof={'schema':'crwt.alexia_authored_hair_material.v1','source_sha256':sha(raw),'candidate_sha256':sha(out),'candidate_bytes':len(out),'new_hair_roughness':a.roughness,'new_hair_anisotropy_strength':.35,'explicit_tangent_space':changes,'source_geometry_normals_colors_skins_clips_images_original_BIN_exact':True,'source_hash_unchanged':sha(a.source.read_bytes())==sha(raw),'visual_accepted':False,'gameIntegrated':False}
    a.output.with_suffix('.material-proof.json').open('x',encoding='utf-8').write(json.dumps(proof,indent=2)+'\n');print(json.dumps(proof))
if __name__=='__main__':main()
