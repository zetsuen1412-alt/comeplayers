"""Direct baseline COLOR-only semantic palette polish; no raster/geometry edits.

Read-only six-view pixels provide coarse hair/garment confidence. Broad normal-derived lighting and coherent
procedural lavender, charcoal/gold, cuff and cup fields replace projected smear.
The central face/shirt, skin protection and all meshes1/2 remain exact.
"""
import argparse, copy, hashlib, io, json, pathlib, struct
import numpy as np
from PIL import Image

SOURCE_PIN='aa2a57b3e8c15535d0b29914fdfe0b7da18289f91dbf99fce515346795394000'
REFERENCE_PIN='935b1f8f7d2be4a6a453a089041844f2cd4470eb64be17d9d72568efb3708933'
sha=lambda raw:hashlib.sha256(raw).hexdigest()
MASK={'world_axis_signs':[-1,1,-1],'world_x_center':-.006,
      'mandatory_face_core':{'y_min':.135,'z_min':.035,'abs_world_x_max':.12},
      'face_core':{'y_min':.135,'z_min':.035,'abs_x_max':.12},
      'face_cheek':{'y_min':.145,'z_min':.12,'abs_x_max':.17},
      'central_shirt':{'y_min':-.065,'y_max':.145,'z_min':.11,'abs_x_max':.10},
      'hands':{'y_max':-.065,'abs_x_min':.215,'z_min':-.01},
      'inner_hands':{'y_min':-.24,'y_max':-.065,'abs_x_min':.155,'z_min':.02},
      'head_skin':{'y_min':.13,'y_max':.39,'source_gamma_r_min':.65,'source_gamma_blue_min':.40,'r_minus_g_min':.04,'g_minus_b_min':.015},
      'hair_seed':{'y_min':-.12,'y_max':.478,'z_max':.08,'abs_x_min':.045,'abs_x_max':.31,'source_blue_minus_green_min':.025,'source_blue_minus_red_min':.014,'source_red_minus_green_min':.006,'source_minimum_channel':.28},
      'hair_near_cup':{'y_min':.13,'y_max':.40,'z_max':.055,'abs_x_min':.105,'abs_x_max':.31},
      'upper_hair':{'y_min':.30,'y_max':.478,'z_max':.05,'abs_x_min':.10,'abs_x_max':.31},
      'hair_reference_extension':{'y_min':-.12,'y_max':.478,'z_min':-.235,'z_max':.08,'abs_x_min':.06,'abs_x_max':.31,'confidence_min':.60},
      'central_rear_hair':{'y_min':-.10,'y_max':.478,'z_max':-.08,'abs_x_max':.31,'any_source_above_y':.12,'otherwise_source_lavender_or_reference_confidence_min':.55},
      'cup':{'plus_z_center':.092,'minus_z_center':.062,'y_center':.258,'z_radius':.039,'y_radius':.054,'abs_x_min':.13,'radius_max':1.12},
      'jacket_body':{'y_min':-.15,'y_max':.12,'abs_x_min':.08,'abs_x_max':.185,'z_min':-.035,'z_max':.16},
      'jacket_sleeve':{'y_min':-.065,'y_max':.10,'abs_x_min':.185,'abs_x_max':.32,'z_min':.015,'z_max':.195},
      'jacket_reference_confidence_min':.35,
      'cuff':{'y_min':-.065,'y_max':.01,'abs_x_min':.16,'abs_x_max':.32,'z_min':.02,'reference_white_confidence_min':.35},
      'priority':'protected > cup > hair > cuff > jacket; jacket is never allowed to paint selected/source-lavender/reference-hair vertices',
      'alpha_policy':'Original alpha byte-exact.'}
CALIBRATION={'plus':{'ear_pixel_x':1268,'ear_world_z':.092,'scale':484.69,'top_pixel_y':18,'top_world_y':.479059,
                    'hair_envelope':[[30,1282,1336],[80,1274,1347],[120,1295,1356],[170,1282,1402],[225,1280,1422],[270,1294,1408],[305,1310,1390]],
                    'garment_envelope':[[178,1205,1305],[225,1205,1310],[270,1190,1310],[325,1210,1300]]},
             'minus':{'ear_pixel_x':236,'ear_world_z':.062,'scale':491.19,'top_pixel_y':507,'top_world_y':.479059,
                     'hair_envelope':[[525,164,245],[570,149,233],[610,145,220],[660,97,229],[715,85,225],[760,101,213],[800,121,205]],
                     'garment_envelope':[[672,214,295],[715,204,305],[760,210,310],[815,220,305]]},
             'reference_kernel_radius_pixels':2,'reference_kernel_sigma_pixels':1.0,
             'basis':'Manual profile ear/crown registration, semantic confidence only; no exact camera/fidelity claim.'}
VARIANTS={'soft-volume-protected':{'hair':.97,'jacket':.97,'cuff':.98,'cup':.98},
          'soft-volume-overlay':{'hair':1.,'jacket':1.,'cuff':1.,'cup':1.}}
HAIR_FIELD={'normal_filter_policy':'continuous trilinear Gaussian-weighted 3D voxel average of source normals; temporary COLOR lighting only','normal_voxel_cell_size':.025,'normal_grid_kernel_radius':2,'normal_grid_kernel_sigma':1.05,'volume_light_world':[-.35,.75,.45],'gamma_base':.835,'gamma_diffuse_scale':.070,'gamma_up_normal_scale':.020,'ribbon_azimuth_frequency':4.0,'ribbon_y_swing_amplitude':.22,'ribbon_y_frequency':8.0,'gamma_highlight_amplitude':.030,'gamma_shadow_amplitude':.035,'gamma_clip':[.69,.94],'source_normal_stream_changes':0}

def require(ok,message):
 if not ok:raise ValueError(message)
def smooth(a,b,x):
 t=np.clip((x-a)/(b-a),0,1);return t*t*(3-2*t)
def to_linear(c):return np.where(c<=.04045,c/12.92,((c+.055)/1.055)**2.4)
def to_gamma(c):return np.where(c<=.0031308,12.92*c,1.055*np.power(c,1/2.4)-.055)
def read_glb(raw):
 require(struct.unpack_from('<4sII',raw)==(b'glTF',2,len(raw)),'GLB header');n,k=struct.unpack_from('<II',raw,12);require(k==0x4e4f534a,'JSON chunk');d=json.loads(raw[20:20+n]);nb,k=struct.unpack_from('<II',raw,20+n);require(k==0x004e4942 and len(raw)==28+n+nb,'BIN chunk');return d,raw[28+n:]
def accessor(d,b,k):
 a=d['accessors'][k];v=d['bufferViews'][a['bufferView']];require('sparse' not in a and v.get('buffer',0)==0,'Simple accessor');w={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']];dt={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']];size=np.dtype(dt).itemsize;return np.ndarray((a['count'],w),dtype=dt,buffer=b,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',w*size),size)).copy()
def envelope(shape,rows):
 y,x=np.mgrid[:shape[0],:shape[1]];r=np.asarray(rows);return (y>=r[0,0])&(y<=r[-1,0])&(x>=np.interp(y,r[:,0],r[:,1]))&(x<=np.interp(y,r[:,0],r[:,2]))
def bilinear(im,x,y):
 h,w=im.shape;x=np.clip(x,0,w-1.001);y=np.clip(y,0,h-1.001);ix=x.astype(int);iy=y.astype(int);fx=x-ix;fy=y-iy;return im[iy,ix]*(1-fx)*(1-fy)+im[iy,ix+1]*fx*(1-fy)+im[iy+1,ix]*(1-fx)*fy+im[iy+1,ix+1]*fx*fy
def semantic_reference(p,rgb):
 scores=np.zeros((len(p),4));xy=np.zeros((len(p),2));c=rgb/255;r,g,b=c[:,:,0],c[:,:,1],c[:,:,2];lav=(b-g>14/255)&(b-r>7/255)&(r-g>3/255)&(c.min(2)>70/255);white=(c.min(2)>.77)&(c.max(2)-c.min(2)<.20);dark=(c.max(2)<.43)&~lav;gold=(r-g>.10)&(g-b>.10)&(r>.43)&(g>.23)&(b<.70)
 for side in ['plus','minus']:
  cfg=CALIBRATION[side];ids=np.flatnonzero((p[:,0]>MASK['world_x_center']) if side=='plus' else (p[:,0]<MASK['world_x_center']));py=cfg['top_pixel_y']+(cfg['top_world_y']-p[ids,1])*cfg['scale'];px=cfg['ear_pixel_x']+(-1 if side=='plus' else 1)*(p[ids,2]-cfg['ear_world_z'])*cfg['scale'];xy[ids]=np.column_stack((px,py));he=envelope(rgb.shape,cfg['hair_envelope']);ge=envelope(rgb.shape,cfg['garment_envelope']);images=[he&(lav|(c.min(2)>.945)),ge&dark,ge&gold,ge&white&~lav]
  total=0.;local=np.zeros((len(ids),4))
  for dy in range(-2,3):
   for dx in range(-2,3):
    weight=np.exp(-(dx*dx+dy*dy)/2);total+=weight
    for j,im in enumerate(images):local[:,j]+=weight*bilinear(im.astype(float),px+dx,py+dy)
  scores[ids]=local/total
 return scores,xy

def derive_masks(p,colors,scores):
 x,y,z=p.T;ax=np.abs(x-MASK['world_x_center']);gamma=to_gamma(colors[:,:3].astype(float));r,g,b=gamma.T;m=MASK
 protected=((y>m['mandatory_face_core']['y_min'])&(z>m['mandatory_face_core']['z_min'])&(np.abs(x)<m['mandatory_face_core']['abs_world_x_max']))|((y>m['face_core']['y_min'])&(z>m['face_core']['z_min'])&(ax<m['face_core']['abs_x_max']))|((y>m['face_cheek']['y_min'])&(z>m['face_cheek']['z_min'])&(ax<m['face_cheek']['abs_x_max']))
 shirt=(y>-.065)&(y<.145)&(z>.11)&(ax<.10);hands=((y<-.065)&(ax>.215)&(z>-.01))|((y>-.24)&(y<-.065)&(ax>.155)&(z>.02));headskin=(y>.13)&(y<.39)&(r>.65)&(b>.40)&(r-g>.04)&(g-b>.015);protected|=shirt|hands|headskin
 zc=np.where(x>MASK['world_x_center'],.092,.062);cup_r=np.hypot((z-zc)/.039,(y-.258)/.054);cup=(ax>.13)&(cup_r<1.12)&~protected
 source_lav=(b-g>.025)&(b-r>.014)&(r-g>.006)&(gamma.min(1)>.28)
 seed=(y>-.12)&(y<.478)&(z<.08)&(ax>.045)&(ax<.31)&source_lav
 near=(y>.13)&(y<.40)&(z<.055)&(ax>.105)&(ax<.31)
 upper=(y>.30)&(y<.478)&(z<.05)&(ax>.10)&(ax<.31)
 refhair=(y>-.12)&(y<.478)&(z>-.235)&(z<.08)&(ax>.06)&(ax<.31)&(scores[:,0]>.60)
 rear=(y>-.10)&(y<.478)&(z<-.08)&(ax<.31)&(source_lav|(y>.12)|(scores[:,0]>.55))
 hair=(seed|near|upper|refhair|rear)&~cup&~protected
 body=(y>-.15)&(y<.12)&(ax>.08)&(ax<.185)&(z>-.035)&(z<.16)
 sleeve=(y>-.065)&(y<.10)&(ax>.185)&(ax<.32)&(z>.015)&(z<.195)
 cuff=(y>-.065)&(y<.01)&(ax>.16)&(ax<.32)&(z>.02)&(scores[:,3]>.35)&~hair&~cup&~protected
 jacket=(body|sleeve)&((scores[:,1]+scores[:,2])>.35)&~hair&~cup&~cuff&~protected&~source_lav&(scores[:,0]<.20)
 return {'protected':protected,'hair':hair,'cup':cup,'cuff':cuff,'jacket':jacket,'source_lavender':source_lav,'mandatory_face':(y>.135)&(z>.035)&(np.abs(x)<.12),'hands':hands},cup_r

def filtered_hair_normals(p,original_world_normals,indices,hair_mask):
 # Only a temporary COLOR lighting field is filtered; original NORMAL stays exact.
 ids=np.flatnonzero(hair_mask);size=HAIR_FIELD['normal_voxel_cell_size'];origin=p[ids].min(0)-3*size;cell=np.floor((p[ids]-origin)/size).astype(int);shape=cell.max(0)+4;flat=np.ravel_multi_index(cell.T,shape);grid=np.zeros(tuple(shape)+(4,))
 for axis in range(3):grid[...,axis]=np.bincount(flat,weights=original_world_normals[ids,axis],minlength=int(np.prod(shape))).reshape(shape)
 grid[...,3]=np.bincount(flat,minlength=int(np.prod(shape))).reshape(shape)
 radius=HAIR_FIELD['normal_grid_kernel_radius'];sigma=HAIR_FIELD['normal_grid_kernel_sigma'];kernel=np.exp(-np.arange(-radius,radius+1)**2/(2*sigma*sigma));kernel/=kernel.sum()
 for axis in range(3):
  padding=[(0,0)]*4;padding[axis]=(radius,radius);padded=np.pad(grid,padding);blur=np.zeros_like(grid)
  for j,w in enumerate(kernel):blur+=w*np.take(padded,np.arange(grid.shape[axis])+j,axis=axis)
  grid=blur
 field=grid[...,:3]/np.maximum(grid[...,3,None],1e-12);coord=(p[ids]-origin)/size-.5;base=np.floor(coord).astype(int);frac=coord-base;value=np.zeros((len(ids),3))
 for dx in [0,1]:
  for dy in [0,1]:
   for dz in [0,1]:
    delta=np.array([dx,dy,dz]);w=np.prod(np.where(delta,frac,1-frac),axis=1);value+=w[:,None]*field[tuple((base+delta).T)]
 length=np.linalg.norm(value,axis=1);good=length>1e-8;value[good]/=length[good,None];value[~good]=original_world_normals[ids[~good]];n=original_world_normals.astype(float).copy();n[ids]=value;return n

def targets(p,masks,cup_r,scores,shade_normals):
 x,y,z=p.T;light=np.array(HAIR_FIELD['volume_light_world']);light/=np.linalg.norm(light);diffuse=shade_normals@light;angle=np.arctan2(x-MASK['world_x_center'],-(z+.01));phase=(angle+.22*np.sin((y+.02)*8))*4.;crest=(phase-.55+np.pi)%(2*np.pi)-np.pi;valley=(phase+1.25+np.pi)%(2*np.pi)-np.pi;highlight=.030*np.exp(-(crest/.65)**2);shadow=.035*np.exp(-(valley/.55)**2);v=np.clip(.835+.070*diffuse+.020*shade_normals[:,1]+highlight-shadow,.69,.94);hair=np.column_stack((v,v-.048,v+.076));hair=np.clip(hair,0,.992)
 dark=np.tile([55/255,45/255,47/255],(len(p),1));dark+=(.014*np.sin(y*8)+.008*smooth(.06,.20,z))[:,None];gold=np.tile([188/255,130/255,74/255],(len(p),1));localized=smooth(.48,.88,scores[:,2]);jacket=dark*(1-localized[:,None])+gold*localized[:,None]
 cuff=np.tile([.93,.918,.95],(len(p),1));cup=np.tile([.105,.083,.125],(len(p),1));silver=np.tile([.85,.84,.89],(len(p),1));goldcup=np.tile([.84,.57,.28],(len(p),1));inner=np.tile([.055,.043,.066],(len(p),1));silver_w=smooth(.54,.63,cup_r)*(1-smooth(.82,.90,cup_r));gold_w=1-smooth(.40,.50,cup_r);inner_w=1-smooth(.15,.22,cup_r);cup=cup*(1-silver_w[:,None])+silver*silver_w[:,None];cup=cup*(1-gold_w[:,None])+goldcup*gold_w[:,None];cup=cup*(1-inner_w[:,None])+inner*inner_w[:,None]
 return {'hair':to_linear(hair),'cup':to_linear(cup),'jacket':to_linear(np.clip(jacket,0,1)),'cuff':to_linear(cuff)}

def main():
 ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--source',type=pathlib.Path,required=True);ap.add_argument('--reference',type=pathlib.Path,required=True);ap.add_argument('--output-parent',type=pathlib.Path,required=True);ap.add_argument('--variant',choices=list(VARIANTS),required=True);a=ap.parse_args();source=a.source.resolve(strict=True);reference=a.reference.resolve(strict=True);outdir=a.output_parent.resolve()/a.variant;require(not outdir.exists(),'Fresh variant directory required');raw=source.read_bytes();refraw=reference.read_bytes();require(sha(raw)==SOURCE_PIN and sha(refraw)==REFERENCE_PIN,'Pinned source/reference');original,oldbin=read_glb(raw);require(original['nodes'][2]['rotation']==[0,1,0,0] and len(original['meshes'])==3,'Source transform/mesh count');attr=original['meshes'][0]['primitives'][0]['attributes'];p=accessor(original,oldbin,attr['POSITION']).astype(float)*[-1,1,-1];colors=accessor(original,oldbin,attr['COLOR_0']);uv=accessor(original,oldbin,attr['TEXCOORD_0']);require(colors.shape==(252943,4) and uv.shape==(252943,2),'Source stream sizes');rgb=np.asarray(Image.open(io.BytesIO(refraw)).convert('RGB'),float);require(rgb.shape==(1024,1536,3),'Original six-view size');scores,xy=semantic_reference(p,rgb);masks,cup_r=derive_masks(p,colors,scores);world_normals=accessor(original,oldbin,attr['NORMAL']).astype(float)*[-1,1,-1];indices=accessor(original,oldbin,original['meshes'][0]['primitives'][0]['indices']).reshape(-1);shade_normals=filtered_hair_normals(p,world_normals,indices,masks['hair']);target=targets(p,masks,cup_r,scores,shade_normals);result=colors.copy();allowed=np.zeros(len(p),bool);layer=np.zeros(len(p),np.uint8);weights=np.zeros(len(p));variant=VARIANTS[a.variant];palette_codes={'hair':[.02,.9,.08],'cup':[.96,.43,.02],'jacket':[.02,.65,.95],'cuff':[.85,.02,.7]}
 for code,name in enumerate(['hair','cup','cuff','jacket'],1):
  ids=np.flatnonzero(masks[name]);allowed[ids]=True;layer[ids]=code;w=np.full(len(ids),variant[name]);
  if name=='hair':w*=1-smooth(.462,.478,p[ids,1])
  if name=='jacket':w*=smooth(.35,.62,scores[ids,1]+scores[ids,2])
  if name=='cup':w*=1-smooth(1.0,1.12,cup_r[ids])
  if a.variant=='soft-volume-overlay':result[ids,:3]=palette_codes[name];w=np.ones(len(ids))
  else:result[ids,:3]=(colors[ids,:3]*(1-w[:,None])+target[name][ids]*w[:,None]).astype('<f4')
  weights[ids]=w
 changed=np.any(result!=colors,axis=1);require(np.all(allowed[changed]) and not np.any(allowed&masks['protected']),'Protected scope');require(np.array_equal(result[masks['protected']],colors[masks['protected']]) and np.array_equal(result[:,3],colors[:,3]) and np.isfinite(result).all() and result.min()>=0 and result.max()<=1,'Protected/alpha/finite');d=copy.deepcopy(original);binary=bytearray(oldbin);vi=len(d['bufferViews']);ai=len(d['accessors']);data=result.astype('<f4').tobytes();d['bufferViews'].append({'buffer':0,'byteOffset':len(binary),'byteLength':len(data),'target':34962});binary.extend(data);d['accessors'].append({'bufferView':vi,'componentType':5126,'count':len(result),'type':'VEC4'});d['meshes'][0]['primitives'][0]['attributes']['COLOR_0']=ai;d['buffers'][0]['byteLength']=len(binary);expected=copy.deepcopy(original['meshes']);expected[0]['primitives'][0]['attributes']['COLOR_0']=ai;require(d['meshes']==expected and d['accessors'][:-1]==original['accessors'] and d['bufferViews'][:-1]==original['bufferViews'] and binary[:len(oldbin)]==oldbin,'Original mesh/accessor/BIN preservation')
 for key in original:
  if key not in ('meshes','accessors','bufferViews','buffers'):require(d[key]==original[key],'Original metadata '+key)
 js=json.dumps(d,separators=(',',':')).encode();js+=b' '*((-len(js))%4);binary+=b'\0'*((-len(binary))%4);output=struct.pack('<4sII',b'glTF',2,28+len(js)+len(binary))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(binary),0x004e4942)+binary;outdir.mkdir(parents=True);out=outdir/('alexia-mask-overlay.glb' if a.variant=='soft-volume-overlay' else 'alexia.glb');out.write_bytes(output);npz=outdir/'semantic-masks.npz';np.savez_compressed(npz,allowed_color_indices=np.flatnonzero(allowed),changed_color_indices=np.flatnonzero(changed),protected_critical_indices=np.flatnonzero(masks['protected']),hair_indices=np.flatnonzero(masks['hair']),cup_indices=np.flatnonzero(masks['cup']),jacket_indices=np.flatnonzero(masks['jacket']),cuff_indices=np.flatnonzero(masks['cuff']),source_lavender_indices=np.flatnonzero(masks['source_lavender']),filtered_hair_color_normals=shade_normals[masks['hair']],mandatory_face_indices=np.flatnonzero(masks['mandatory_face']),hands_indices=np.flatnonzero(masks['hands']),layer_code=layer,changed_weights=weights[changed],reference_scores=scores[allowed],reference_profile_xy=xy[allowed]);report={'schema':'crwt.alexia.semantic_palette_polish.v4_spatial_soft_volume','passed':True,'approved':False,'gameIntegrated':False,'diagnostic_overlay_only':a.variant=='soft-volume-overlay','variant':a.variant,'source_sha256':SOURCE_PIN,'reference_sha256':REFERENCE_PIN,'candidate_path':str(out),'candidate_sha256':sha(output),'candidate_bytes':len(output),'recipe_path':str(pathlib.Path(__file__).resolve()),'recipe_sha256':sha(pathlib.Path(__file__).read_bytes()),'recipe_helpers':[],'mask_parameters':MASK,'calibration':CALIBRATION,'variant_parameters':variant,'hair_color_field':HAIR_FIELD,'mask_npz_sha256':sha(npz.read_bytes()),'allowed_color_vertices':int(allowed.sum()),'changed_color_vertices':int(changed.sum()),'protected_critical_vertices':int(masks['protected'].sum()),'semantic_layer_vertices':{k:int(masks[k].sum()) for k in ['hair','cup','jacket','cuff']},'source_BIN_byte_prefix_identical':True,'original_accessors_and_bufferViews_identical':True,'positions_normals_uv_indices_materials_images_nodes_rig_clips_exact':True,'whole_mesh1_mesh2_exact':True,'alpha_byte_exact':True,'protected_face_skin_shirt_hands_colors_exact':True,'mandatory_face_box_vertices':int(masks['mandatory_face'].sum()),'mandatory_face_box_color_byte_exact':bool(np.array_equal(result[masks['mandatory_face']],colors[masks['mandatory_face']])),'protected_hands_vertices':int(masks['hands'].sum()),'protected_hands_bounds_world':[p[masks['hands']].min(0).tolist(),p[masks['hands']].max(0).tolist()],'protected_hands_color_byte_exact':bool(np.array_equal(result[masks['hands']],colors[masks['hands']])),'reference_pixels_unchanged':True,'original_core_vertices':len(p),'mesh_count_before_after':[3,3],'added_geometry':0,'scope':'Procedural vertex-COLOR semantic hair/cup/jacket/cuff cleanup from pinned current baseline. Existing mesh shape and all other attributes remain source-exact. No raster edit, texture image replacement, fake image plane or rig change.','limits':['Manual geometry/reference semantic classification; actual overlays and matched views must be independently inspected before selection.','Source merged geometry may make semantic boundaries ambiguous; central face/shirt/skin/hands stay protected.','Fine reference embroidery, separated strands, leather seams and anatomy cannot be recovered fully from the coarse merged source mesh by a palette change.','Suitcase, legs/shoes and residual protected detail are outside this first palette cleanup.','Overlay artificial colors are analysis-only and must never be selected.']};(outdir/'alexia.semantic-palette-proof.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');require(sha(source.read_bytes())==SOURCE_PIN and sha(reference.read_bytes())==REFERENCE_PIN,'Input mutation');print(json.dumps({k:report[k] for k in ['variant','candidate_path','candidate_sha256','allowed_color_vertices','changed_color_vertices','protected_critical_vertices','semantic_layer_vertices']}))

if __name__=='__main__':main()
