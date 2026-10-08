#!/usr/bin/env python3
"""Verify the new side-colors prefix using explicit frozen source-pins.json.

CI reads actual baseline/source GLBs, protected side-color changes, render bytes,
and existing local native certificates. It does not run Blender or approve art.
"""
import argparse, ast, bisect, collections, hashlib, importlib.util, io, json, math, pathlib, re, struct, sys, zipfile, zlib
sys.dont_write_bytecode=True
PREFIX='Crazy-Rich-World-Tour-Unity-28.0/Web30/production/reconstruction/roster-side-colors-2026-10-06'
OLD_PREFIX='Crazy-Rich-World-Tour-Unity-28.0/Web30/production/reconstruction/roster-hair-sculpt-2026-10-05'
BASELINE_MANIFEST_SHA='50408387c9f4319181b6327791938779bb5b8c779296c053aab9990530ebcdc4'
BASELINE_ALEXIA_SHA='a605eedeaf86740d14f92d04553b25c016a1c0bf362a2265036fadb5aa60acd4'
INVENTORY='source-inventory.json';PINS='source-pins.json'
EXCLUDED={INVENTORY,'evidence/github-publication-receipt.json'}
IDS={'alexia','rindi','atlas','kairo','luna','mochi','nox','pip','yuna','zeno'}
VIEWS=['front','three-quarter','left','right','back']
VALIDATOR_SHA='72ef5252320ffe045415287e1101c61af032fc6574580e3c245aa4820a30a942'
COLOR_MASK_CONTRACT=json.loads('{"world_axis_signs":[-1,1,-1],"world_x_center":-0.006,"world_y_min":-0.095,"world_y_max":0.455,"world_z_min":-0.235,"world_z_max":0.035,"world_abs_centered_x_min":0.085,"world_abs_centered_x_max":0.35,"original_world_normal_z_max":0.55,"original_world_abs_normal_x_min":0.1,"semantic_upper_y_min":0.19,"semantic_upper_z_max":-0.025,"semantic_lower_z_max":-0.105,"semantic_formula":"((worldY>.19 and worldZ<-.025) or worldZ<-.105)","protected_headphone_ellipse":{"world_z_center":0.077,"world_y_center":0.258,"world_z_radius":0.068,"world_y_radius":0.107,"protected_radius_squared_max":1.44},"reference_confidence_required":true,"source_color_hair_membership_required":false,"front_protection":"worldZ>=-.025 is protected except the explicitly reference-qualified upper lateral scalp extension y>.39, |normalX|>.35, normalZ<.35. The rear source-lavender expansion has no inherited-normal restriction but is wholly behind z=-.025 and requires source+reference lavender. Core face/temple/front, body and the original headphone ellipse remain outside the union; all outside-union colors and every original normal are byte-exact.","alpha_policy":"Original alpha retained byte-exact.","upper_extension":{"world_y_min":0.39,"world_y_max":0.455,"world_z_min":-0.235,"world_z_max":0.055,"world_abs_centered_x_min":0.085,"world_abs_centered_x_max":0.35,"original_world_normal_z_max":0.35,"original_world_abs_normal_x_min":0.35,"same_protected_headphone_ellipse":true,"direct_lavender_confidence_min_exclusive":0.9,"local_lavender_support_min_exclusive":0.6,"reference_highlights_accepted":false,"reference_kernel_radius_pixels":6,"reference_kernel_sigma_pixels":2.8,"reference_support_smoothstep":[0.025,0.2]},"source_lavender_expansion":{"world_y_min":-0.095,"world_y_max":0.455,"world_z_min":-0.235,"world_z_max":-0.025,"world_abs_centered_x_min":0.075,"world_abs_centered_x_max":0.35,"original_normal_gate_required":false,"same_protected_headphone_ellipse":true,"source_gamma_rgb_scale":255,"source_palette":{"blue_minus_green_min_exclusive":14,"blue_minus_red_min_exclusive":7,"red_minus_green_min_exclusive":3,"minimum_channel_min_exclusive":70},"direct_lavender_confidence_min_exclusive":0.9,"local_lavender_support_min_exclusive":0.6,"reference_highlights_accepted":false,"reference_kernel_radius_pixels":6,"reference_kernel_sigma_pixels":2.8,"reference_support_smoothstep":[0.025,0.2],"note":"Only existing source lavender colors qualify. Foreign black/gold source paint is not in this expansion."},"allowed_mask_formula":"original_side_hair_hardmask OR reference_qualified_upper_lateral_extension OR reference_qualified_source_lavender_expansion; the same original protected ear ellipse is excluded from all three. Both extensions require direct strict-lavender reference confidence>.90 and local support>.60.","protected_critical_formula":"(worldZ>=-.025 AND NOT reference_qualified_upper_extension) OR (original_worldNormalZ>=.55 AND NOT reference_qualified_source_lavender_expansion) OR protected_headphone_ellipse; all outside final allowed mask."}')
REFERENCE_CALIBRATION=json.loads('{"coordinate_frame":"glTF world +Y up +Z front, mesh0 local_to_world=(-X,+Y,-Z); existing transforms retained.","basis":"Ear/crown/sole registration retained from prior profile audit. Main broad rear lavender row anchors independently inspected in unchanged atlas; small restrained depth warp, not solved cameras or reference precision.","plus":{"ear_pixel_x":1268,"ear_world_z":0.092,"scale":484.69,"top_pixel_y":18,"top_world_y":0.479059,"main_rear_pixel_rows":[[80,1344],[120,1351],[170,1361],[225,1374],[270,1405]],"model_rear_z_rows":[[0.0,-0.1998032784461975],[0.06,-0.20685966610908507],[0.12,-0.18080335676670076],[0.18,-0.14816372841596603],[0.24,-0.13197525590658188],[0.3,-0.12416128396987915],[0.36,-0.09410329535603523],[0.42,-0.05605357199907303]],"reference_hair_envelope":[[30,1282,1336],[80,1274,1347],[120,1295,1356],[170,1282,1402],[225,1280,1422],[270,1294,1408],[305,1310,1390]],"reference_headphone_ellipse":[1268,114,38,47]},"minus":{"ear_pixel_x":236,"ear_world_z":0.062,"scale":491.19,"top_pixel_y":507,"top_world_y":0.479059,"main_rear_pixel_rows":[[570,160],[610,153],[660,142],[715,91],[760,106]],"model_rear_z_rows":[[0.0,-0.20353180885314942],[0.06,-0.21272525191307068],[0.12,-0.19005887150764467],[0.18,-0.15360261380672455],[0.24,-0.1412310853600502],[0.3,-0.14216101169586182],[0.36,-0.10810166329145432],[0.42,-0.06988078355789185]],"reference_hair_envelope":[[525,164,245],[570,149,233],[610,145,220],[660,97,229],[715,85,225],[760,101,213],[800,121,205]],"reference_headphone_ellipse":[236,615,37,48]},"depth_factor_clamp":[0.8,1.12],"depth_factor_blend":0.6,"hair_palette_gamma_rgb":{"blue_minus_green_min":14,"blue_minus_red_min":7,"red_minus_green_min":3,"minimum_channel_min":70},"near_white_highlight_min_channel":242,"local_reference_kernel_radius_pixels":6,"local_reference_kernel_sigma_pixels":2.8,"local_support_smoothstep":[0.025,0.2],"detail_sampling":{"normalized_reference_filter_radius_pixels":3,"normalized_reference_filter_sigma_pixels":1.05,"broad_reference_filter_radius_pixels":6,"broad_reference_filter_sigma_pixels":2.8,"reference_detail_gain":1.16,"minimum_linear_sample_channel":0.18,"maximum_gamma_sample_rgb":[0.965,0.945,0.995],"kernel_note":"Read-only normalized accepted-hair reference samples; no edited raster is created. Narrow filter keeps illustrated strand flow; modest broad-relative gain and bounded highlights avoid isolated white islands."}}')
REFERENCE_SHA='935b1f8f7d2be4a6a453a089041844f2cd4470eb64be17d9d72568efb3708933'
MASK_ARRAY_NAMES=['allowed_color_indices', 'changed_color_indices', 'protected_color_indices', 'changed_weights', 'changed_reference_support', 'changed_profile_xy', 'original_side_hair_indices', 'geometric_extension_indices', 'reference_qualified_extension_indices', 'extension_direct_lavender_confidence', 'extension_local_lavender_support', 'extension_profile_xy', 'protected_critical_color_indices', 'geometric_source_lavender_expansion_indices', 'reference_qualified_source_lavender_expansion_indices', 'source_lavender_expansion_direct_confidence', 'source_lavender_expansion_local_support', 'source_lavender_expansion_profile_xy']
_SOURCE_MASK_CACHE={}
sha=lambda b:hashlib.sha256(b).hexdigest()
def require(ok,message):
    if not ok:raise ValueError(message)
def valid_sha(value):return isinstance(value,str) and bool(re.fullmatch('[0-9a-f]{64}',value)) and value!='0'*64
def safe_relative(name):
    require(isinstance(name,str) and name and '\\' not in name and ':' not in name and not any(ord(c)<32 for c in name),'Invalid relative path')
    p=pathlib.PurePosixPath(name);require(not p.is_absolute() and p.as_posix()==name and all(v not in {'','.','..','.git'} for v in name.split('/')),'Unsafe/noncanonical source path')
    reserved={'con','prn','aux','nul',*[f'com{i}' for i in range(1,10)],*[f'lpt{i}' for i in range(1,10)]}
    require(all(not v.endswith((' ','.')) and v.split('.')[0].casefold() not in reserved for v in p.parts),'Windows path collision')
    return name
def safe_path(base,name):
    base=base.resolve(strict=True);target=base/safe_relative(name)
    for parent in [target,*target.parents]:
        if parent==base:break
        require(not parent.is_symlink() and not getattr(parent,'is_junction',lambda:False)(),'Linked source path')
    require(target.resolve().is_relative_to(base),'Source path escapes root');return target
def filehash(path):
    size=path.stat().st_size;h=hashlib.sha256();g=hashlib.sha1(b'blob '+str(size).encode()+b'\0');count=0
    with path.open('rb') as f:
        while block:=f.read(1024*1024):count+=len(block);h.update(block);g.update(block)
    require(count==size,'Source changed while hashing');return {'bytes':count,'sha256':h.hexdigest(),'git_blob_sha1':g.hexdigest()}
def document(raw):
    def pairs(items):
        d={}
        for k,v in items:require(k not in d,'Duplicate JSON key');d[k]=v
        return d
    def bad(value):raise ValueError('Nonfinite JSON constant: '+value)
    return json.loads(raw,object_pairs_hook=pairs,parse_constant=bad)
def no_approval(d,mandatory=False):
    for keys in [('approved','accepted','production_ready','production_approved','visualApproved','visual_approval'),('gameIntegrated','game_integrated','game_integration')]:
        present=[k for k in keys if k in d]
        if mandatory:require(present,'Explicit false candidate flags required')
        for k in present:require(d[k] is False,k+' must be false')
def pointer(d,path):
    require(isinstance(path,str) and path.startswith('/'),'Explicit JSON pointer required')
    for token in path[1:].split('/'):
        token=token.replace('~1','/').replace('~0','~')
        if isinstance(d,list):require(token.isdigit() and int(token)<len(d),'Bad list JSON pointer');d=d[int(token)]
        else:require(isinstance(d,dict) and token in d,'Missing JSON pointer '+path);d=d[token]
    return d
def same(a,b):return json.dumps(a,sort_keys=True,separators=(',',':'))==json.dumps(b,sort_keys=True,separators=(',',':'))
def inventory_document(raw):
    d=document(raw);require(d.get('schema')=='crwt.alexia_side_colors_source_inventory.v1' and d.get('prefix')==PREFIX and d.get('html_storage')=='zip-parts','Inventory schema/prefix/storage')
    no_approval(d);rows=d.get('files');require(isinstance(rows,list) and rows,'Empty source inventory');seen=set();folds=set()
    for r in rows:
        name=safe_relative(r['path']);require(name not in EXCLUDED and name not in seen and name.casefold() not in folds,'Duplicate/self source inventory path');seen.add(name);folds.add(name.casefold())
        require(type(r.get('bytes')) is int and r['bytes']>=0 and valid_sha(r.get('sha256')) and re.fullmatch('[0-9a-f]{40}',r.get('git_blob_sha1','')) and r.get('mode') in {'100644','100755'},'Bad inventory size/hash/mode')
    require([r['path'] for r in rows]==sorted(seen) and PINS in seen and {'OFFLINE-GALLERY.zip.part-01','OFFLINE-GALLERY.zip.part-02'}<=seen and 'OFFLINE-GALLERY.zip' not in seen and 'BUKA-REVIEW-MODEL.html' not in seen,'Sorted inventory/pins/split-ZIP layout')
    for name in seen:
        bits=name.split('/');require(not any('/'.join(bits[:i]).casefold() in folds for i in range(1,len(bits))),'File/directory path collision')
    return d
def pins_document(raw):
    p=document(raw);require(p.get('schema')=='crwt.alexia_side_colors_source_pins.v1' and p.get('template_only') is not True and p.get('prefix')==PREFIX,'Final pins required');no_approval(p,True)
    b=p['baseline'];require(b['prefix']==OLD_PREFIX and b['manifest_sha256']==BASELINE_MANIFEST_SHA and b['alexia_sha256']==BASELINE_ALEXIA_SHA and b['commit']=='7550673d37e385034eef33da07fce82a704001ae' and b['tree']=='25cdefaade223a6ce05c888df0e2b455347d6201' and b['repository_blobs_preserved_by_parent']==4376,'Pinned previous checkpoint')
    require(p['review']['path']=='review-manifest.json' and valid_sha(p['review']['sha256']) and valid_sha(p['review']['candidate_sha256']) and isinstance(p['review']['schema'],str),'Final review pin')
    g=p['gallery'];require(g['archive']=='OFFLINE-GALLERY.zip' and g['entry']=='BUKA-REVIEW-MODEL.html' and g['receipt']=='BUKA-REVIEW-MODEL.viewer-receipt.json' and all(valid_sha(g[k]) for k in ['archive_sha256','html_sha256','receipt_sha256']) and type(g['html_bytes']) is int and g['html_bytes']>0,'Final gallery pins')
    require(g.get('archive_storage')=='split' and type(g.get('archive_bytes')) is int and g['archive_bytes']>0 and isinstance(g.get('archive_parts'),list) and len(g['archive_parts'])==2,'Two pinned gallery parts required')
    for index,row in enumerate(g['archive_parts'],1):
        require(set(row)=={'path','bytes','sha256'} and row['path']==f'OFFLINE-GALLERY.zip.part-{index:02d}' and type(row['bytes']) is int and 0<row['bytes']<=22000000 and valid_sha(row['sha256']),'Gallery part path/size/SHA contract')
    require(sum(row['bytes'] for row in g['archive_parts'])==g['archive_bytes'],'Logical gallery ZIP part sizes differ')
    require(set(p['proofs'])>={'selected','independent','native_build','native_reopen','native_certificate'},'Required selected/geometry/independent/native proof roles')
    require(p['proofs']['independent']['expected_fields'].get('/passed') is True and p['proofs']['independent']['expected_fields'].get('/visual_accepted') is True,'Selected candidate must have explicit passing numeric and accepted actual-render visual audit')
    for role,r in p['proofs'].items():
        safe_relative(r['path']);require(valid_sha(r['sha256']) and isinstance(r['schema'],str) and r['schema'] and isinstance(r.get('expected_fields'),dict) and r['expected_fields'],'Explicit proof SHA/schema/assertions: '+role)
        if 'candidate_sha256' in r:require(valid_sha(r['candidate_sha256']),'Proof candidate override SHA')
        if 'source_sha256' in r:require(valid_sha(r['source_sha256']),'Proof source override SHA')
        for bound in r.get('bound_files',[]):safe_relative(bound['path']);require(isinstance(bound['sha_pointer'],str) and bound['sha_pointer'].startswith('/'),'Proof-bound supporting file SHA pointer')
    for r in [p['native']['blend'],p['native']['editable_manifest'],p['render_selection']]:safe_relative(r['path']);require(valid_sha(r['sha256']),'Final file pin')
    require(p['geometry'].get('mask_parameters')==COLOR_MASK_CONTRACT and p['geometry'].get('reference_calibration')==REFERENCE_CALIBRATION,'Exact independently agreed source side-color mask/calibration parameters')
    require(isinstance(p['native']['mesh_fingerprints'],dict) and p['native']['mesh_fingerprints'] and type(p['native']['active_FILE_images']) is int and p['native']['active_FILE_images']>=0,'Dynamic native fingerprints/image count')
    return p
def reference_rgb(raw):
    require(raw[:8]==b'\x89PNG\r\n\x1a\n','Reference PNG signature')
    offset=8;compressed=[];header=None;ended=False
    while offset<len(raw):
        require(offset+12<=len(raw),'Reference PNG truncated chunk')
        size=struct.unpack_from('>I',raw,offset)[0];kind=raw[offset+4:offset+8];end=offset+8+size
        require(end+4<=len(raw),'Reference PNG chunk bounds')
        data=raw[offset+8:end]
        require(zlib.crc32(kind+data)&0xffffffff==struct.unpack_from('>I',raw,end)[0],'Reference PNG CRC')
        if kind==b'IHDR':require(header is None,'Duplicate PNG header');header=struct.unpack('>IIBBBBB',data)
        elif kind==b'IDAT':compressed.append(data)
        elif kind==b'IEND':ended=True;require(size==0 and end+4==len(raw),'Reference PNG end');break
        offset=end+4
    require(header==(1536,1024,8,2,0,0,0) and ended and compressed,'Pinned reference PNG layout')
    width,height=header[:2];stride=width*3;decoded=zlib.decompress(b''.join(compressed))
    require(len(decoded)==height*(stride+1),'Reference decoded length')
    rgb=bytearray(height*stride);previous=bytearray(stride)
    for y in range(height):
        start=y*(stride+1);filter=decoded[start];row=bytearray(decoded[start+1:start+1+stride]);require(filter<=4,'Reference PNG filter')
        if filter:
            for i in range(stride):
                left=row[i-3] if i>=3 else 0;up=previous[i];ul=previous[i-3] if i>=3 else 0
                if filter==1:prediction=left
                elif filter==2:prediction=up
                elif filter==3:prediction=(left+up)//2
                else:
                    p=left+up-ul;a=abs(p-left);b=abs(p-up);c=abs(p-ul)
                    prediction=left if a<=b and a<=c else up if b<=c else ul
                row[i]=(row[i]+prediction)&255
        rgb[y*stride:(y+1)*stride]=row;previous=row
    return width,height,bytes(rgb)
def interpolate(x,rows):
    if x<=rows[0][0]:return rows[0][1]
    if x>=rows[-1][0]:return rows[-1][1]
    i=bisect.bisect_right([r[0] for r in rows],x);a,b=rows[i-1],rows[i]
    return a[1]+(x-a[0])*(b[1]-a[1])/(b[0]-a[0])
def profile_coordinate(world,side,cal):
    c=cal[side];y,z=world[1:3];v=c['top_pixel_y']+(c['top_world_y']-y)*c['scale']
    edge=interpolate(v,c['main_rear_pixel_rows']);model=interpolate(y,c['model_rear_z_rows'])
    factor=abs(edge-c['ear_pixel_x'])/max(.001,abs(model-c['ear_world_z'])*c['scale'])
    lo,hi=cal['depth_factor_clamp'];factor=1+cal['depth_factor_blend']*(min(hi,max(lo,factor))-1)
    u=c['ear_pixel_x']+(-1 if side=='plus' else 1)*(z-c['ear_world_z'])*c['scale']*factor
    return u,v
def reference_palette_mask(width,height,rgb,side,cal,include_white=False):
    c=cal[side];envelope=c['reference_hair_envelope'];mask=bytearray(width*height)
    cx,cy,rx,ry=c['reference_headphone_ellipse'];p=cal['hair_palette_gamma_rgb']
    leftrows=[[row[0],row[1]] for row in envelope];rightrows=[[row[0],row[2]] for row in envelope]
    for y in range(max(0,math.ceil(envelope[0][0])),min(height-1,math.floor(envelope[-1][0]))+1):
        left=max(0,math.ceil(interpolate(y,leftrows)));right=min(width-1,math.floor(interpolate(y,rightrows)))
        for x in range(left,right+1):
            if ((x-cx)/rx)**2+((y-cy)/ry)**2<=1.05**2:continue
            i=(y*width+x)*3;r,g,b=rgb[i:i+3]
            colored=b-g>p['blue_minus_green_min'] and b-r>p['blue_minus_red_min'] and r-g>p['red_minus_green_min'] and min(r,g,b)>p['minimum_channel_min']
            if colored or (include_white and min(r,g,b)>cal['near_white_highlight_min_channel']):mask[y*width+x]=1
    return bytes(mask)
def bilinear_mask(width,height,mask,u,v):
    u=min(width-1.001,max(0,u));v=min(height-1.001,max(0,v));x=math.floor(u);y=math.floor(v);du=u-x;dv=v-y
    return ((1-du)*(1-dv)*mask[y*width+x]+du*(1-dv)*mask[y*width+x+1]+(1-du)*dv*mask[(y+1)*width+x]+du*dv*mask[(y+1)*width+x+1])
def confidence_and_support(width,height,mask,xy,cal):
    u,v=xy;direct=bilinear_mask(width,height,mask,u,v)
    radius=cal['local_reference_kernel_radius_pixels'];sigma=cal['local_reference_kernel_sigma_pixels'];weighted=total=0.
    for dy in range(-radius,radius+1):
        for dx in range(-radius,radius+1):
            k=math.exp(-(dx*dx+dy*dy)/(2*sigma*sigma));total+=k;weighted+=k*bilinear_mask(width,height,mask,u+dx,v+dy)
    a,b=cal['local_support_smoothstep'];t=min(1.,max(0.,(weighted/total-a)/(b-a)))
    return direct,t*t*(3-2*t)


def accessor_bytes(doc,binary,accessor_id):
    """Raw attribute elements, including exact FLOAT bit patterns."""
    a=doc['accessors'][accessor_id];v=doc['bufferViews'][a['bufferView']]
    require('sparse' not in a and a['type'] in {'SCALAR','VEC2','VEC3','VEC4'},'Direct color accessor layout')
    sizes={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4};widths={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}
    width=sizes[a['componentType']]*widths[a['type']];stride=v.get('byteStride',width);start=v.get('byteOffset',0)+a.get('byteOffset',0)
    return [binary[start+i*stride:start+i*stride+width] for i in range(a['count'])]

def source_color_regions(validator,doc,binary,parameters,reference_raw):
    """Derive geometric membership and actual atlas-qualified union independently."""
    require(parameters==COLOR_MASK_CONTRACT,'Exact root/auditor-frozen source mask contract')
    require(sha(reference_raw)==REFERENCE_SHA,'Actual unchanged935b reference pixels required')
    cache_key=(sha(binary),sha(reference_raw))
    if cache_key in _SOURCE_MASK_CACHE:return _SOURCE_MASK_CACHE[cache_key]
    prim=doc['meshes'][0]['primitives'][0];a=validator.Accessors(doc,binary)
    positions=a.read(prim['attributes']['POSITION']);normals=a.read(prim['attributes']['NORMAL']);colors=a.read(prim['attributes']['COLOR_0'])
    require(len(positions)==len(normals)==len(colors),'Source mask array cardinality')
    rotations=[n for n in doc['nodes'] if n.get('rotation')==[0,1,0,0] and 0 in n.get('children',[])]
    require(len(rotations)==1 and 1 in doc['nodes'][0].get('children',[]) and doc['nodes'][1].get('mesh')==0,'Actual source world transform')
    world=[(-p[0],p[1],-p[2]) for p in positions];normal=[(-n[0],n[1],-n[2]) for n in normals]
    base=set();upper_geom=set();lavender_geom_full=set();cups=set();center=-.006
    for i,(p,n,c) in enumerate(zip(world,normal,colors)):
        x,y,z=p;nx,ny,nz=n;absx=abs(x-center);cup=((z-.077)/.068)**2+((y-.258)/.107)**2
        if cup<=1.44:cups.add(i)
        if -.095<y<.455 and -.235<z<.035 and .085<absx<.35 and nz<.55 and abs(nx)>.10 and ((y>.19 and z<-.025) or z<-.105) and cup>1.44:base.add(i)
        if .39<y<.455 and -.235<z<.055 and .085<absx<.35 and nz<.35 and abs(nx)>.35 and cup>1.44:upper_geom.add(i)
        if -.095<y<.455 and -.235<z<-.025 and .075<absx<.35 and cup>1.44:
            r,g,b=[(12.92*t if t<=.0031308 else 1.055*t**(1/2.4)-.055)*255 for t in c[:3]]
            if b-g>14 and b-r>7 and r-g>3 and min(r,g,b)>70:lavender_geom_full.add(i)
    upper_geom-=base
    width,height,rgb=reference_rgb(reference_raw)
    masks={side:reference_palette_mask(width,height,rgb,side,REFERENCE_CALIBRATION,False) for side in ['plus','minus']}
    confidence_cache={}
    def qualify(indices):
        qualified=set();samples={}
        for i in sorted(indices):
            p=world[i];side='plus' if p[0]>center else 'minus';xy=profile_coordinate(p,side,REFERENCE_CALIBRATION);key=(side,*xy)
            if key not in confidence_cache:confidence_cache[key]=confidence_and_support(width,height,masks[side],xy,REFERENCE_CALIBRATION)
            direct,support=confidence_cache[key];samples[i]=(xy,direct,support)
            if direct>.90 and support>.60:qualified.add(i)
        return qualified,samples
    upper,upper_samples=qualify(upper_geom)
    lavender_geom=lavender_geom_full-base-upper;lavender,lavender_samples=qualify(lavender_geom)
    allowed=base|upper|lavender
    critical={i for i,(p,n) in enumerate(zip(world,normal)) if (p[2]>=-.025 and i not in upper) or (n[2]>=.55 and i not in lavender) or i in cups}
    require(allowed and critical and not allowed&critical,'Source allowed/critical mask overlap')
    counts={'original_side_hair':len(base),'geometric_upper_extension':len(upper_geom),'qualified_upper_extension':len(upper),'geometric_source_lavender_expansion':len(lavender_geom),'qualified_source_lavender_expansion':len(lavender),'protected_critical':len(critical)}
    result={'allowed':allowed,'critical':critical,'base':base,'upper_geom':upper_geom,'upper':upper,'lavender_geom':lavender_geom,'lavender':lavender,'upper_samples':upper_samples,'lavender_samples':lavender_samples,'world':world,'counts':counts}
    _SOURCE_MASK_CACHE.clear();_SOURCE_MASK_CACHE[cache_key]=result
    return result

def color_masks(validator,doc,binary,parameters,reference_raw):
    require(reference_raw is not None,'Actual reference bytes required for confidence-qualified mask')
    r=source_color_regions(validator,doc,binary,parameters,reference_raw)
    return r['allowed'],r['critical'],r['counts']

def color_gate(validator,oldraw,newraw,expected,reference_raw=None):
    old,oldbin=validator.parse_glb(oldraw);new,newbin=validator.parse_glb(newraw)
    require(newbin[:len(oldbin)]==oldbin,'Original BIN prefix changed')
    require(len(old['meshes'])==len(new['meshes'])==3,'All three baseline meshes remain')
    require(set(old)==set(new),'Top-level document key set changed')
    for key in set(old)-{'accessors','bufferViews','buffers','meshes'}:require(new[key]==old[key],'Original document records changed: '+key)
    require(len(new['accessors'])==len(old['accessors'])+1 and new['accessors'][:-1]==old['accessors'],'Only one appended accessor record permitted')
    require(len(new['bufferViews'])==len(old['bufferViews'])+1 and new['bufferViews'][:-1]==old['bufferViews'],'Only one appended bufferView permitted')
    require(len(new['buffers'])==len(old['buffers'])==1,'Embedded buffer cardinality')
    require({k:v for k,v in new['buffers'][0].items() if k!='byteLength'}=={k:v for k,v in old['buffers'][0].items() if k!='byteLength'},'Embedded buffer metadata changed')
    require(new['meshes'][1:]==old['meshes'][1:],'mesh1/2 records changed')
    require(len(old['meshes'][0]['primitives'])==len(new['meshes'][0]['primitives'])==1,'Existing core primitive cardinality')
    om=old['meshes'][0];nm=new['meshes'][0];op=om['primitives'][0];np=new['meshes'][0]['primitives'][0]
    require({k:v for k,v in om.items() if k!='primitives'}=={k:v for k,v in nm.items() if k!='primitives'},'Core mesh metadata changed')
    require({k:v for k,v in op.items() if k!='attributes'}=={k:v for k,v in np.items() if k!='attributes'},'Core indices/material/mode changed')
    require(set(op['attributes'])==set(np['attributes']),'Core attribute set changed')
    for key in set(op['attributes'])-{'COLOR_0'}:require(op['attributes'][key]==np['attributes'][key],'Core geometry/UV/other attribute routing changed')
    ni=np['attributes']['COLOR_0'];require(ni==len(old['accessors']),'Core COLOR_0 must use only appended accessor')
    na=new['accessors'][ni];aa=old['accessors'][op['attributes']['COLOR_0']]
    require(na.get('componentType')==aa.get('componentType')==5126 and na.get('type')==aa.get('type')=='VEC4' and na.get('count')==aa.get('count') and not na.get('normalized',False) and na.get('byteOffset',0)==0,'Replacement COLOR type/count/offset')
    require(na['bufferView']==len(old['bufferViews']),'Only appended COLOR bufferView may be used')
    view=new['bufferViews'][na['bufferView']]
    require(view.get('buffer')==0 and view.get('byteOffset',0)==len(oldbin) and view.get('byteLength')==na['count']*16 and view.get('byteStride',16)==16 and view.get('target',34962)==34962,'Replacement COLOR must be tight FLOAT/VEC4 appended after original BIN')
    end=len(oldbin)+na['count']*16
    require(new['buffers'][0]['byteLength']==end and len(newbin)==end,'Exactly one appended COLOR stream without unrelated bytes required')
    changed=set();unchanged=[]
    for mi,mesh in enumerate(old['meshes']):
        for pi,prim in enumerate(mesh['primitives']):
            actual=new['meshes'][mi]['primitives'][pi]
            for key,ai in list(prim['attributes'].items())+[('indices',prim['indices'])]:
                accessor_id=actual['indices'] if key=='indices' else actual['attributes'][key]
                before=accessor_bytes(old,oldbin,ai);after=accessor_bytes(new,newbin,accessor_id)
                require(len(before)==len(after),'Mesh attribute count changed')
                if mi==0 and key=='COLOR_0':
                    for i,(a,b) in enumerate(zip(before,after)):
                        require(a[12:16]==b[12:16],'COLOR alpha bits changed')
                        rgba=struct.unpack('<4f',b);require(all(math.isfinite(c) and 0<=c<=1 for c in rgba),'Replacement COLOR finite/range')
                        if a!=b:changed.add(i)
                else:require(before==after,'Unchanged actual accessor bytes differ: '+key);unchanged.append(f'mesh{mi}/primitive{pi}/{key}')
    allowed,protected,regions=color_masks(validator,old,oldbin,expected['mask_parameters'],reference_raw)
    require(changed,'Selected candidate has no core COLOR changes')
    require(changed<=allowed,'COLOR changed outside independently derived source side-color mask')
    require(not changed&protected,'Protected front COLOR bytes changed')
    oldstats=validator.validate_model(oldraw);newstats=validator.validate_model(newraw)
    for k in ('faces','vertices','meshes','skins','clips','images'):require(oldstats[k]==newstats[k],'Actual source geometry/rig/image counts changed: '+k)
    return {'original_BIN_prefix_exact':True,'original_accessor_and_bufferView_records_exact':True,'exactly_one_appended_COLOR_stream':True,'all3mesh_topology_counts_exact':True,'mesh0_POSITION_NORMAL_UV_indices_material_exact':True,'mesh1_mesh2_all_actual_accessor_bytes_exact':True,'nodes_materials_images_textures_skins_animations_exact':True,'actual_unchanged_accessor_paths':unchanged,'actual_baseline_stats':oldstats,'actual_candidate_stats':newstats,'source_editable_color_mask_vertices':len(allowed),'source_protected_critical_mask_vertices':len(protected),'source_regions':regions,'changed_COLOR_vertices':len(changed),'alpha_bits_exact':True,'protected_critical_COLOR_bytes_exact':True,'all_color_changes_within_source_masks':True,'new_meshes':0,'new_vertices':0,'new_faces':0,'mask_parameters':expected['mask_parameters'],'visual_approval':False}

def verify_color_mask_archive(validator,oldraw,newraw,archive_raw,parameters,reference_raw):
    """Actual18NPZ arrays and original-atlas qualification; no NumPy in CI."""
    expected=set(MASK_ARRAY_NAMES)
    old,oldbin=validator.parse_glb(oldraw);new,newbin=validator.parse_glb(newraw)
    core_count=old['accessors'][old['meshes'][0]['primitives'][0]['attributes']['COLOR_0']]['count'];arrays={}
    with zipfile.ZipFile(io.BytesIO(archive_raw)) as z:
        infos=z.infolist();require(len(infos)==len(expected) and {i.filename for i in infos}=={n+'.npy' for n in expected},'Exact18selected mask NPZ arrays required')
        for info in infos:
            require(not info.is_dir() and not info.flag_bits&1 and 0<info.file_size<8*1024*1024,'Unsafe/oversized mask array')
            data=z.read(info);require(data[:6]==b'\x93NUMPY' and data[6:8] in {b'\x01\x00',b'\x02\x00'},'Mask array NPY format')
            width=2 if data[6]==1 else 4;length=int.from_bytes(data[8:8+width],'little');start=8+width+length
            require(0<length<65536 and start<=len(data),'Mask array header length')
            header=ast.literal_eval(data[8+width:start].decode('latin1'))
            require(set(header)=={'descr','fortran_order','shape'} and header['fortran_order'] is False and header['descr'] in {'<i8','<f8'},'Mask array scalar dtype/layout')
            shape=header['shape'];require(isinstance(shape,tuple) and 1<=len(shape)<=2 and all(type(n)is int and 0<n<=core_count for n in shape),'Mask array dimensions')
            size=math.prod(shape);require(len(data)-start==size*8,'Mask array payload size')
            fmt='<q' if header['descr']=='<i8' else '<d';values=[row[0] for row in struct.iter_unpack(fmt,data[start:])]
            arrays[info.filename[:-4]]={'shape':shape,'dtype':header['descr'],'values':values}
    r=source_color_regions(validator,old,oldbin,parameters,reference_raw)
    op=old['meshes'][0]['primitives'][0];np=new['meshes'][0]['primitives'][0]
    before=accessor_bytes(old,oldbin,op['attributes']['COLOR_0']);after=accessor_bytes(new,newbin,np['attributes']['COLOR_0'])
    changed={i for i,(a,b) in enumerate(zip(before,after)) if a!=b}
    groups={'allowed_color_indices':r['allowed'],'changed_color_indices':changed,'protected_color_indices':set(range(len(before)))-r['allowed'],
            'original_side_hair_indices':r['base'],'geometric_extension_indices':r['upper_geom'],'reference_qualified_extension_indices':r['upper'],
            'protected_critical_color_indices':r['critical'],'geometric_source_lavender_expansion_indices':r['lavender_geom'],
            'reference_qualified_source_lavender_expansion_indices':r['lavender']}
    for key,actual in groups.items():
        row=arrays[key];require(row['dtype']=='<i8' and len(row['shape'])==1 and row['values']==sorted(actual),'Actual selected source/reference mask indices differ: '+key)
    for key in ['changed_weights','changed_reference_support']:
        row=arrays[key];require(row['dtype']=='<f8' and row['shape']==(len(changed),) and all(math.isfinite(x) and 0<x<=1 for x in row['values']),'Actual changed support/weight must be finite and positive: '+key)
    xy=arrays['changed_profile_xy'];require(xy['dtype']=='<f8' and xy['shape']==(len(changed),2) and all(math.isfinite(x) for x in xy['values']),'Actual changed projected profile coordinates')
    maximum_xy_error=maximum_direct_error=maximum_support_error=0.
    for j,i in enumerate(sorted(changed)):
        p=r['world'][i];side='plus' if p[0]>-.006 else 'minus';actual=profile_coordinate(p,side,REFERENCE_CALIBRATION)
        maximum_xy_error=max(maximum_xy_error,abs(actual[0]-xy['values'][2*j]),abs(actual[1]-xy['values'][2*j+1]))
    for prefix,samples,index_key,direct_key,support_key,xy_key in [
        ('upper',r['upper_samples'],'geometric_extension_indices','extension_direct_lavender_confidence','extension_local_lavender_support','extension_profile_xy'),
        ('source_lavender',r['lavender_samples'],'geometric_source_lavender_expansion_indices','source_lavender_expansion_direct_confidence','source_lavender_expansion_local_support','source_lavender_expansion_profile_xy')]:
        ids=arrays[index_key]['values'];direct=arrays[direct_key];support=arrays[support_key];xyrow=arrays[xy_key]
        require(direct['dtype']==support['dtype']==xyrow['dtype']=='<f8' and direct['shape']==support['shape']==(len(ids),) and xyrow['shape']==(len(ids),2),'Reference-qualified extension array shapes: '+prefix)
        require(all(math.isfinite(x) and 0<=x<=1 for x in direct['values']+support['values']) and all(math.isfinite(x) for x in xyrow['values']),'Reference-qualified extension scalar values')
        for j,i in enumerate(ids):
            xy,d,s=samples[i];maximum_xy_error=max(maximum_xy_error,abs(xy[0]-xyrow['values'][2*j]),abs(xy[1]-xyrow['values'][2*j+1]));maximum_direct_error=max(maximum_direct_error,abs(d-direct['values'][j]));maximum_support_error=max(maximum_support_error,abs(s-support['values'][j]))
    require(maximum_xy_error<1e-9 and maximum_direct_error<1e-9 and maximum_support_error<1e-9,'Actual original-reference profile/qualification replay differs')
    return {'passed':True,'mask_npz_sha256':sha(archive_raw),'actual18array_index_sets_exact':True,'original935b_reference_resampled':True,
            'all_changed_profile_coordinates_recomputed':True,'all_extension_direct_confidence_and_local_support_recomputed':True,
            'maximum_profile_coordinate_error':maximum_xy_error,'maximum_direct_confidence_error':maximum_direct_error,'maximum_local_support_error':maximum_support_error,
            'changed_reference_support_and_weights_positive':True,'allowed_vertices':len(r['allowed']),'changed_vertices':len(changed),'protected_vertices':len(before)-len(r['allowed']),
            'protected_critical_vertices':len(r['critical']),'source_regions':r['counts']}


def verify(roster,baseline,inventory,pins_path=None):
    roster=roster.resolve(strict=True);baseline=baseline.resolve(strict=True);inventory=inventory.resolve(strict=True);pins_path=(pins_path or roster/PINS).resolve(strict=True)
    require(inventory==roster/INVENTORY and pins_path==roster/PINS and roster!=baseline,'Canonical source roots/inventory/pins')
    invraw=inventory.read_bytes();inv=inventory_document(invraw);pinsraw=pins_path.read_bytes();pins=pins_document(pinsraw);inputs={inventory:filehash(inventory),pins_path:filehash(pins_path)}
    records={r['path']:r for r in inv['files']};actual=set()
    for path in roster.rglob('*'):
        require(not path.is_symlink() and not getattr(path,'is_junction',lambda:False)(),'Link in source snapshot')
        if path.is_file():actual.add(path.relative_to(roster).as_posix())
    derived=set()
    if 'BUKA-REVIEW-MODEL.html' in actual:
        path=roster/'BUKA-REVIEW-MODEL.html';d=filehash(path);require(d['sha256']==pins['gallery']['html_sha256'] and d['bytes']==pins['gallery']['html_bytes'],'Derived HTML differs');inputs[path]=d;derived.add(path.name)
    require(actual-EXCLUDED-derived==set(records),'Source inventory file set differs')
    for name,row in records.items():
        path=safe_path(roster,name);d=filehash(path);require(all(d[k]==row[k] for k in d),'Inventory source hash/size differs: '+name);inputs[path]=d
        if name.endswith(('.png','.jpg','.jpeg')):
            with path.open('rb') as f:header=f.read(8)
            require(header==b'\x89PNG\r\n\x1a\n' if name.endswith('.png') else header[:3]==b'\xff\xd8\xff','Image extension/signature mismatch: '+name)
    def raw(name,base=roster,pin=None):
        path=safe_path(base,name);data=path.read_bytes();d=filehash(path);require(d['sha256']==sha(data) and (pin is None or d['sha256']==pin),'Pinned file changed: '+name);inputs[path]=d;return data
    def item(r):return raw(r['path'],pin=r['sha256'])
    review_raw=item(pins['review']);review=document(review_raw);no_approval(review,True)
    require(review.get('schema')==pins['review']['schema'] and type(review.get('changed_models')) is int and review['changed_models']==1 and review.get('baseline_manifest_sha256')==BASELINE_MANIFEST_SHA,'Selected review schema/count/baseline')
    old=document(raw('review-manifest.json',baseline,BASELINE_MANIFEST_SHA));no_approval(old,True)
    rows=review['models'];require(len(rows)==10 and {r['id'] for r in rows}==IDS and len(old['models'])==10 and {r['id'] for r in old['models']}==IDS,'Ten exact character IDs')
    oldrows={r['id']:r for r in old['models']};require(oldrows['alexia']['sha256']==BASELINE_ALEXIA_SHA and review.get('unchanged_models')==sorted(IDS-{'alexia'}),'Pinned old Alexia and nine unchanged IDs')
    validator_path=safe_path(roster,'tools/validate_roster_candidate.py');require(filehash(validator_path)['sha256']==VALIDATOR_SHA,'Frozen GLB validator')
    spec=importlib.util.spec_from_file_location('side_colors_glb_validator',validator_path);validator=importlib.util.module_from_spec(spec);spec.loader.exec_module(validator)
    counts={};modelraw={}
    for r in rows:
        id=r['id'];no_approval(r,True);require(r['path']==f'viewer/models/{id}.glb' and r['reference']==f'viewer/references/{id}.png','Canonical model/reference paths')
        require(r.get('baseline_sha256')==oldrows[id]['sha256'] and r.get('refined_in_this_checkpoint') is (id=='alexia'),'Model baseline/refinement markers')
        require(r['sha256']==(pins['review']['candidate_sha256'] if id=='alexia' else oldrows[id]['sha256']) and r['referenceSha256']==oldrows[id]['referenceSha256'],'Selected model/reference SHA')
        data=raw(r['path'],pin=r['sha256']);modelraw[id]=data;counts[id]=validator.validate_model(data);raw(r['reference'],pin=r['referenceSha256'])
        for k,v in r['expected'].items():require(counts[id].get(k)==v,'Actual model counts differ: '+id+'/'+k)
        require((counts[id]['skins'],counts[id]['clips'])==((1,6) if id=='pip' else (0,0)),'Static nine and Pip animation count')
    pip,_=validator.parse_glb(modelraw['pip']);require(len(pip['skins'])==1 and len(pip['skins'][0]['joints'])==13 and set(counts['pip']['clip_names'])=={'Idle','Walk','Jump','Skill','Win','Lose'},'Pip13 joints/six clips')
    old_alexia=raw('viewer/models/alexia.glb',baseline,BASELINE_ALEXIA_SHA)
    reference_raw=raw('references/alexia-blue-v2-turnaround.png',pin=REFERENCE_SHA)
    colored=color_gate(validator,old_alexia,modelraw['alexia'],pins['geometry'],reference_raw)
    proofdocs={}
    for role,r in pins['proofs'].items():
        d=document(item(r));require(d.get('schema')==r['schema'],'Pinned proof schema: '+role);no_approval(d)
        for field,value in r['expected_fields'].items():require(same(pointer(d,field),value),'Proof assertion differs: '+role+field)
        if 'candidate_sha_pointer' in r:require(pointer(d,r['candidate_sha_pointer'])==r.get('candidate_sha256',pins['review']['candidate_sha256']),'Proof candidate binding: '+role)
        if 'source_sha_pointer' in r:require(pointer(d,r['source_sha_pointer'])==r.get('source_sha256',BASELINE_ALEXIA_SHA),'Proof source binding: '+role)
        if 'blend_sha_pointer' in r:require(pointer(d,r['blend_sha_pointer'])==pins['native']['blend']['sha256'],'Proof blend binding: '+role)
        if 'manifest_sha_pointer' in r:require(pointer(d,r['manifest_sha_pointer'])==pins['native']['editable_manifest']['sha256'],'Proof native manifest binding: '+role)
        for bound in r.get('bound_files',[]):raw(bound['path'],pin=pointer(d,bound['sha_pointer']))
        proofdocs[role]=d
    for role in ['selected','independent']:require('candidate_sha_pointer' in pins['proofs'][role] and 'source_sha_pointer' in pins['proofs'][role],'Selected/geometry/audit proof SHA bindings required')
    selected=proofdocs['selected']
    bindings={r['sha_pointer'] for r in pins['proofs']['selected'].get('bound_files',[])}
    require(bindings>={'/recipe_sha256','/reference_sha256','/source_sha256'} and bool(bindings&{'/mask_npz_sha256','/frozen_mask_npz_sha256'}),'Selected recipe, actual mask, exact source-reference and packaged baseline file bindings required')
    mask_binding=[r for r in pins['proofs']['selected']['bound_files'] if r['sha_pointer'] in {'/mask_npz_sha256','/frozen_mask_npz_sha256'}]
    require(len(mask_binding)==1,'Exactly one selected mask archive must be proof-bound')
    mb=mask_binding[0];mask_gate=verify_color_mask_archive(validator,old_alexia,modelraw['alexia'],raw(mb['path'],pin=pointer(selected,mb['sha_pointer'])),pins['geometry']['mask_parameters'],reference_raw)
    for i,row in enumerate(selected.get('recipe_helpers',[])):
        helper_name=row['path'].replace('\\','/').split('/')[-1];expected_path='evidence/selected-alexia/recipes/'+helper_name
        require({'path':expected_path,'sha_pointer':f'/recipe_helpers/{i}/sha256'} in pins['proofs']['selected'].get('bound_files',[]),'Every proof-declared helper script must be bound by basename')
    for role in ['native_build','native_reopen','native_certificate']:require(all(k in pins['proofs'][role] for k in ['candidate_sha_pointer','blend_sha_pointer','manifest_sha_pointer']),'Native proof hash bindings required')
    n=pins['native'];item(n['blend']);editable=document(item(n['editable_manifest']));no_approval(editable,True)
    require(editable['models']==[{'id':'alexia','path':'viewer/models/alexia.glb','sha256':pins['review']['candidate_sha256']}],'Portable selected editable manifest')
    build=proofdocs['native_build'];fingerprints=pointer(build,n['build_fingerprint_pointer']);require(same(fingerprints,n['mesh_fingerprints']) and len(fingerprints)==counts['alexia']['meshes'],'All dynamic native mesh fingerprints')
    require(build.get('character_count')==1 and len(build['characters'])==1 and build['characters'][0]['id']=='alexia' and build['characters'][0]['imported_armatures']==build['characters'][0]['imported_actions']==0 and build['characters'][0]['rig_added'] is False,'Single unrigged native Alexia')
    require(sum(m['vertices'] for m in fingerprints.values())==counts['alexia']['vertices'] and sum(m['polygons'] for m in fingerprints.values())==counts['alexia']['faces'],'Actual native geometry totals')
    colors=[]
    for m in fingerprints.values():
        require(valid_sha(m['position_float32_sha256']) and valid_sha(m['corner_normal_float32_sha256']) and isinstance(m['color_attributes'],list),'Native geometry/normal/COLOR records')
        for c in m['color_attributes']:require(valid_sha(c['float32_color_sha256']) and c['domain'] in {'CORNER','POINT'} and c['data_type'] in {'BYTE_COLOR','FLOAT_COLOR'},'Native COLOR fingerprint');colors.append(c)
    reopen=proofdocs['native_reopen'];reopened=[c for mesh in pointer(reopen,n['reopen_color_pointer']) for c in mesh]
    require(sorted(json.dumps(c,sort_keys=True) for c in colors)==sorted(json.dumps(c,sort_keys=True) for c in reopened),'All reopened native COLOR fingerprints')
    require(pointer(reopen,n['active_image_count_pointer'])==n['active_FILE_images'],'Dynamic active FILE-image count')
    renderpins=pins['render_selection'];selection=document(item(renderpins));no_approval(selection,True)
    require(selection['schema']==renderpins['schema'] and selection['new_actual_png_count']==5 and selection['reused_actual_png_count']==45 and len(selection['characters'])==10 and {r['id'] for r in selection['characters']}==IDS,'Five new /45 reused actual render scope')
    renderrows={r['id']:r for r in selection['characters']};pngsha={}
    for r in rows:
        id=r['id'];entry=renderrows[id];require(entry['glb_sha256']==r['sha256'],'Actual render source SHA');proofraw=raw(f'renders/{id}/render-evidence.json',pin=entry['render_proof_sha256']);d=document(proofraw)
        require(d['input_sha256']==r['sha256'] and d['production_approved'] is False and d['orbit_frames']==0 and [v[0] for v in d['views']]==VIEWS and d['polygons']==counts[id]['faces'],'Actual five-view geometry proof')
        require(entry['source_accessor_vertices']==counts[id]['vertices'] and entry['imported_blender_vertices']==d['vertices'],'Native/source render vertex accounting')
        if id!='alexia':require(proofraw==raw(f'renders/{id}/render-evidence.json',baseline),'Reused render proof changed')
        for view in VIEWS:
            name=f'renders/{id}/{view}.png';png=raw(name);require(png[:8]==b'\x89PNG\r\n\x1a\n' and struct.unpack('>II',png[16:24])==(640,640),'Actual PNG dimensions/signature');pngsha[name]=sha(png)
            if id!='alexia':require(png==raw(name,baseline),'Reused actual PNG changed')
    gallery=pins['gallery'];receipt=document(raw(gallery['receipt'],pin=gallery['receipt_sha256']))
    visual=proofdocs['independent'];require(visual['render_proof_sha256']==renderrows['alexia']['render_proof_sha256'] and visual['actual_png_sha256']=={view:pngsha[f'renders/alexia/{view}.png'] for view in VIEWS},'Independent accepted visual verdict must bind all five exact final PNG/proof bytes')
    require(receipt['viewer_sha256']==gallery['html_sha256'] and receipt['viewer_bytes']==gallery['html_bytes'] and receipt['manifest_sha256']==sha(review_raw) and receipt['visual_approval'] is False and receipt['game_integration'] is False and receipt['requires_network'] is False,'Frozen gallery receipt')
    require(len(receipt['models'])==10 and {r['id']:r['sha256'] for r in receipt['models']}=={r['id']:r['sha256'] for r in rows},'Gallery selected model SHA map')
    from restore_offline_gallery import inspect_archive
    for part in gallery['archive_parts']:
        require(part['path'] in records and all(records[part['path']][key]==part[key] for key in ['bytes','sha256']),'Inventory gallery part differs from explicit pins')
    archive=inspect_archive(safe_path(roster,gallery['archive']),gallery);require(archive['archive_sha256']==gallery['archive_sha256'],'Gallery source archive SHA')
    for path,d in inputs.items():require(filehash(path)==d,'Input changed during verification: '+str(path))
    return {'schema':'crwt.alexia_side_colors_source_verification.v1','passed':True,'prefix':PREFIX,'files_checked':len(records),'source_inventory_sha256':sha(invraw),'source_pins_sha256':sha(pinsraw),'review_manifest_sha256':sha(review_raw),'baseline_manifest_sha256':BASELINE_MANIFEST_SHA,'selected_alexia_sha256':pins['review']['candidate_sha256'],'changed_models':1,'unchanged_models':9,'model_counts':counts,'actual_color_gate':colored,'actual_selected_mask_archive':mask_gate,'native_mesh_count':len(fingerprints),'native_COLOR_attribute_count':len(colors),'native_blend_sha256':n['blend']['sha256'],'packed_active_FILE_images':n['active_FILE_images'],'native_reopen_scope':'Pinned local certificate and dynamic fingerprints; CI did not run Blender/GPU','new_actual_views':5,'reused_actual_views':45,'actual_render_png_sha256':pngsha,'gallery_archive':archive,'optional_exact_derived_HTML_present':bool(derived),'all_inputs_unchanged':True,'approved':False,'gameIntegrated':False,'limits':['Native imported COLOR representation is fingerprinted across save/reopen; this does not claim native byte identity with GLB float COLOR_0.','Protected side-color integrity is not a visual or exhaustive intersection approval.','Complete4376 prior repository blob preservation is parent publisher scope.']}
def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--roster',type=pathlib.Path,required=True);p.add_argument('--baseline-roster',type=pathlib.Path,required=True);p.add_argument('--inventory',type=pathlib.Path,required=True);p.add_argument('--pins',type=pathlib.Path);p.add_argument('--receipt',type=pathlib.Path);a=p.parse_args()
    if a.receipt:require(not a.receipt.resolve().exists() and not a.receipt.resolve().is_relative_to(a.roster.resolve()) and not a.receipt.resolve().is_relative_to(a.baseline_roster.resolve()),'Fresh external verification receipt required')
    report=verify(a.roster,a.baseline_roster,a.inventory,a.pins)
    if a.receipt:
        a.receipt.parent.mkdir(parents=True,exist_ok=True)
        with a.receipt.open('x',encoding='utf-8',newline='\n') as f:f.write(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))
if __name__=='__main__':main()
