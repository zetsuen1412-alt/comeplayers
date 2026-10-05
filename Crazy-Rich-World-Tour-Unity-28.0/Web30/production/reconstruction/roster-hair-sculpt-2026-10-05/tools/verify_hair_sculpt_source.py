#!/usr/bin/env python3
"""Verify the new hair-sculpt prefix using explicit frozen source-pins.json.

CI reads actual baseline/source GLBs, protected rear-hair changes, render bytes,
and existing local native certificates. It does not run Blender or approve art.
"""
import argparse, collections, hashlib, importlib.util, json, math, pathlib, re, struct, sys
sys.dont_write_bytecode=True
PREFIX='Crazy-Rich-World-Tour-Unity-28.0/Web30/production/reconstruction/roster-hair-sculpt-2026-10-05'
OLD_PREFIX='Crazy-Rich-World-Tour-Unity-28.0/Web30/production/reconstruction/roster-hair-strands-2026-10-05'
BASELINE_MANIFEST_SHA='02b7cffa243f3f28f8e0a559092d447fb583b3a4f2cba70fdd8483ad0c3bdc91'
BASELINE_ALEXIA_SHA='19f007950c8651e81ee2c49374f28af3785e3710171f142324bf67cb7ce74b24'
INVENTORY='source-inventory.json';PINS='source-pins.json'
EXCLUDED={INVENTORY,'evidence/github-publication-receipt.json'}
IDS={'alexia','rindi','atlas','kairo','luna','mochi','nox','pip','yuna','zeno'}
VIEWS=['front','three-quarter','left','right','back']
VALIDATOR_SHA='72ef5252320ffe045415287e1101c61af032fc6574580e3c245aa4820a30a942'
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
    d=document(raw);require(d.get('schema')=='crwt.alexia_hair_sculpt_source_inventory.v1' and d.get('prefix')==PREFIX and d.get('html_storage')=='zip','Inventory schema/prefix/storage')
    no_approval(d);rows=d.get('files');require(isinstance(rows,list) and rows,'Empty source inventory');seen=set();folds=set()
    for r in rows:
        name=safe_relative(r['path']);require(name not in EXCLUDED and name not in seen and name.casefold() not in folds,'Duplicate/self source inventory path');seen.add(name);folds.add(name.casefold())
        require(type(r.get('bytes')) is int and r['bytes']>=0 and valid_sha(r.get('sha256')) and re.fullmatch('[0-9a-f]{40}',r.get('git_blob_sha1','')) and r.get('mode') in {'100644','100755'},'Bad inventory size/hash/mode')
    require([r['path'] for r in rows]==sorted(seen) and PINS in seen and 'OFFLINE-GALLERY.zip' in seen and 'BUKA-REVIEW-MODEL.html' not in seen,'Sorted inventory/pins/ZIP layout')
    for name in seen:
        bits=name.split('/');require(not any('/'.join(bits[:i]).casefold() in folds for i in range(1,len(bits))),'File/directory path collision')
    return d
def pins_document(raw):
    p=document(raw);require(p.get('schema')=='crwt.alexia_hair_sculpt_source_pins.v1' and p.get('template_only') is not True and p.get('prefix')==PREFIX,'Final pins required');no_approval(p,True)
    b=p['baseline'];require(b['prefix']==OLD_PREFIX and b['manifest_sha256']==BASELINE_MANIFEST_SHA and b['alexia_sha256']==BASELINE_ALEXIA_SHA and b['commit']=='cae6727d66f806ec81fa2c8d5ad129d58a5adb95' and b['tree']=='1970915cbdb1acc07afd27663f5d799496deeb34' and b['repository_blobs_preserved_by_parent']==4221,'Pinned previous checkpoint')
    require(p['review']['path']=='review-manifest.json' and valid_sha(p['review']['sha256']) and valid_sha(p['review']['candidate_sha256']) and isinstance(p['review']['schema'],str),'Final review pin')
    g=p['gallery'];require(g['archive']=='OFFLINE-GALLERY.zip' and g['entry']=='BUKA-REVIEW-MODEL.html' and g['receipt']=='BUKA-REVIEW-MODEL.viewer-receipt.json' and all(valid_sha(g[k]) for k in ['archive_sha256','html_sha256','receipt_sha256']) and type(g['html_bytes']) is int and g['html_bytes']>0,'Final gallery pins')
    require(set(p['proofs'])>={'selected','independent','native_build','native_reopen','native_certificate'},'Required selected/geometry/independent/native proof roles')
    require(p['proofs']['independent']['expected_fields'].get('/passed') is True and p['proofs']['independent']['expected_fields'].get('/visual_accepted') is True,'Selected candidate must have explicit passing numeric and accepted actual-render visual audit')
    for role,r in p['proofs'].items():
        safe_relative(r['path']);require(valid_sha(r['sha256']) and isinstance(r['schema'],str) and r['schema'] and isinstance(r.get('expected_fields'),dict) and r['expected_fields'],'Explicit proof SHA/schema/assertions: '+role)
        if 'candidate_sha256' in r:require(valid_sha(r['candidate_sha256']),'Proof candidate override SHA')
        if 'source_sha256' in r:require(valid_sha(r['source_sha256']),'Proof source override SHA')
        for bound in r.get('bound_files',[]):safe_relative(bound['path']);require(isinstance(bound['sha_pointer'],str) and bound['sha_pointer'].startswith('/'),'Proof-bound supporting file SHA pointer')
    for r in [p['native']['blend'],p['native']['editable_manifest'],p['render_selection']]:safe_relative(r['path']);require(valid_sha(r['sha256']),'Final file pin')
    require(isinstance(p['geometry'].get('mask_parameters'),dict),'Explicit independently derived source hairmask parameters')
    require(isinstance(p['native']['mesh_fingerprints'],dict) and p['native']['mesh_fingerprints'] and type(p['native']['active_FILE_images']) is int and p['native']['active_FILE_images']>=0,'Dynamic native fingerprints/image count')
    return p
def accessor_bytes(doc,binary,accessor_id):
    """Raw attribute elements, including exact FLOAT bit patterns."""
    a=doc['accessors'][accessor_id];v=doc['bufferViews'][a['bufferView']]
    require('sparse' not in a and a['type'] in {'SCALAR','VEC2','VEC3','VEC4'},'Direct sculpt accessor layout')
    sizes={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4};widths={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}
    width=sizes[a['componentType']]*widths[a['type']];stride=v.get('byteStride',width);start=v.get('byteOffset',0)+a.get('byteOffset',0)
    return [binary[start+i*stride:start+i*stride+width] for i in range(a['count'])]

def hair_masks(validator,doc,binary,parameters):
    """Derive source hair membership from actual baseline positions/normals/colors."""
    required={'world_axis_signs','rear_z_max','abs_x_max','y_min','y_max','blue_minus_green_min','blue_minus_red_min','minimum_rgb','normal_world_z_max','normal_policy'}
    require(set(parameters)==required,'Explicit complete sculpt mask contract')
    require(parameters['world_axis_signs']==[-1,1,-1],'Actual source 180-degree Y orientation mask')
    require(parameters['normal_policy'] in {'same_hair_mask','incident_changed_faces_within_hair_envelope'},'Normal hair-mask policy')
    # Enforce protection bounds independently of the candidate recipe.
    require(parameters['rear_z_max']<=-.095 and parameters['abs_x_max']<=.245 and parameters['y_min']>=-.065 and parameters['y_max']<=.365,'Mask exceeds authorized rear-hair protection envelope')
    require(parameters['blue_minus_green_min']>=.008 and parameters['blue_minus_red_min']>=-.005 and parameters['minimum_rgb']>=.075 and parameters['normal_world_z_max']<=-.12,'Mask exceeds authorized color/normal filter')
    mesh=doc['meshes'][0];require(len(mesh['primitives'])==1,'Single existing core primitive')
    prim=mesh['primitives'][0];a=validator.Accessors(doc,binary)
    pos=a.read(prim['attributes']['POSITION']);norm=a.read(prim['attributes']['NORMAL']);color=a.read(prim['attributes']['COLOR_0'])
    require(len(pos)==len(norm)==len(color),'Actual hair mask source cardinality')
    # Assert the baseline transform that this explicit mask uses.
    rotations=[n for n in doc['nodes'] if n.get('rotation')==[0,1,0,0] and 0 in n.get('children',[])]
    require(len(rotations)==1 and doc['nodes'][0].get('children') and 1 in doc['nodes'][0]['children'] and doc['nodes'][1].get('mesh')==0,'Baseline world transform for mesh0 mask changed')
    envelope=set();hair=set()
    for i,(p,n,c) in enumerate(zip(pos,norm,color)):
        x,y,z=(-p[0],p[1],-p[2]);r,g,b=c[:3]
        inside=z<parameters['rear_z_max'] and abs(x)<parameters['abs_x_max'] and parameters['y_min']<y<parameters['y_max']
        colored=b-g>parameters['blue_minus_green_min'] and b-r>parameters['blue_minus_red_min'] and min(r,g,b)>parameters['minimum_rgb']
        if inside and colored:envelope.add(i)
        if inside and colored and -n[2]<parameters['normal_world_z_max']:hair.add(i)
    require(hair,'Actual source rear-hair mask is empty')
    return hair,envelope

def sculpt_gate(validator,oldraw,newraw,expected):
    old,oldbin=validator.parse_glb(oldraw);new,newbin=validator.parse_glb(newraw)
    require(newbin[:len(oldbin)]==oldbin,'Original BIN prefix changed')
    require(len(old['meshes'])==len(new['meshes'])==3,'All three baseline meshes remain')
    require(set(old)==set(new),'Top-level document key set changed')
    for key in set(old)-{'accessors','bufferViews','buffers','meshes'}:require(new[key]==old[key],'Original document records changed: '+key)
    require(len(new['accessors'])==len(old['accessors'])+2 and new['accessors'][:len(old['accessors'])]==old['accessors'],'Only2 appended accessor records permitted')
    require(len(new['bufferViews'])==len(old['bufferViews'])+2 and new['bufferViews'][:len(old['bufferViews'])]==old['bufferViews'],'Only2 appended bufferViews permitted')
    require(len(new['buffers'])==len(old['buffers'])==1,'Embedded buffer cardinality')
    require({k:v for k,v in new['buffers'][0].items() if k!='byteLength'}=={k:v for k,v in old['buffers'][0].items() if k!='byteLength'},'Embedded buffer metadata changed')
    require(new['meshes'][1:]==old['meshes'][1:],'mesh1/2 records changed')
    require(len(old['meshes'][0]['primitives'])==len(new['meshes'][0]['primitives'])==1,'Existing core primitive cardinality')
    om=old['meshes'][0];nm=new['meshes'][0];op=om['primitives'][0];np=nm['primitives'][0]
    require({k:v for k,v in om.items() if k!='primitives'}=={k:v for k,v in nm.items() if k!='primitives'},'Core mesh metadata changed')
    require({k:v for k,v in op.items() if k!='attributes'}=={k:v for k,v in np.items() if k!='attributes'},'Core indices/material/mode changed')
    require(set(op['attributes'])==set(np['attributes']),'Core attribute set changed')
    for key in set(op['attributes'])-{'POSITION','NORMAL'}:require(op['attributes'][key]==np['attributes'][key],'Core UV/COLOR/other attribute routing changed')
    new_ids={np['attributes'][key] for key in ('POSITION','NORMAL')}
    require(new_ids==set(range(len(old['accessors']),len(new['accessors']))),'Core POSITION/NORMAL must use only two appended accessors')
    differences={};unchanged=[]
    for mi,mesh in enumerate(old['meshes']):
        for pi,prim in enumerate(mesh['primitives']):
            actual=new['meshes'][mi]['primitives'][pi]
            for key,ai in list(prim['attributes'].items())+[('indices',prim['indices'])]:
                ni=actual['indices'] if key=='indices' else actual['attributes'][key]
                before=accessor_bytes(old,oldbin,ai);after=accessor_bytes(new,newbin,ni)
                require(len(before)==len(after),'Mesh attribute count changed')
                if mi==0 and key in {'POSITION','NORMAL'}:
                    aa=old['accessors'][ai];na=new['accessors'][ni];view=new['bufferViews'][na['bufferView']]
                    require(na.get('componentType')==aa.get('componentType')==5126 and na.get('type')==aa.get('type')=='VEC3' and na.get('count')==aa.get('count') and not na.get('normalized',False),'Replacement attribute type/count')
                    require(na['bufferView']>=len(old['bufferViews']) and view.get('byteOffset',0)>=len(oldbin),'Replacement stream must be appended past original BIN')
                    differences[key]={i for i,(a,b) in enumerate(zip(before,after)) if a!=b}
                else:require(before==after,'Unchanged actual accessor bytes differ');unchanged.append(f'mesh{mi}/primitive{pi}/{key}')
    hair,envelope=hair_masks(validator,old,oldbin,expected['mask_parameters'])
    changed=differences['POSITION'];normal_changed=differences['NORMAL'];require(changed,'Selected candidate does not sculpt core hair')
    require(changed<=hair,'POSITION changed outside independently derived source hairmask')
    normal_allowed=hair
    if expected['mask_parameters']['normal_policy']=='incident_changed_faces_within_hair_envelope':
        inds=[r[0] for r in validator.Accessors(old,oldbin).read(op['indices'])];incident=set()
        for j in range(0,len(inds),3):
            tri=set(inds[j:j+3])
            if tri&changed:incident.update(tri)
        normal_allowed=incident&envelope
    require(normal_changed<=normal_allowed,'NORMAL changed outside independently derived rear-hair mask')
    oldstats=validator.validate_model(oldraw);newstats=validator.validate_model(newraw)
    for k in ('faces','vertices','meshes','skins','clips','images'):require(oldstats[k]==newstats[k],'Actual source geometry/rig/image counts changed: '+k)
    allowed_view_ids={new['accessors'][i]['bufferView'] for i in new_ids};require(allowed_view_ids==set(range(len(old['bufferViews']),len(new['bufferViews']))),'Only replacement POS/NORMAL views appended')
    return {'original_BIN_prefix_exact':True,'original_accessor_and_bufferView_records_exact':True,'all3mesh_topology_counts_exact':True,'mesh0_UV_COLOR_indices_material_exact':True,'mesh1_mesh2_all_actual_accessor_bytes_exact':True,'nodes_materials_images_textures_skins_animations_exact':True,'actual_unchanged_accessor_paths':unchanged,'actual_baseline_stats':oldstats,'actual_candidate_stats':newstats,'source_hair_mask_vertices':len(hair),'source_normal_mask_vertices':len(normal_allowed),'changed_position_vertices':len(changed),'changed_normal_vertices':len(normal_changed),'all_position_normal_changes_within_source_rear_hair_masks':True,'new_meshes':0,'new_vertices':0,'new_faces':0,'mask_parameters':expected['mask_parameters'],'visual_approval':False}


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
    spec=importlib.util.spec_from_file_location('hair_sculpt_glb_validator',validator_path);validator=importlib.util.module_from_spec(spec);spec.loader.exec_module(validator)
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
    sculpted=sculpt_gate(validator,old_alexia,modelraw['alexia'],pins['geometry'])
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
    require(bindings>={'/recipe_sha256','/mask_npz_sha256','/reference_sha256','/source_sha256'},'Selected recipe, mask, exact source-reference and packaged baseline file bindings required')
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
    archive=inspect_archive(safe_path(roster,gallery['archive']),gallery);require(archive['archive_sha256']==gallery['archive_sha256'],'Gallery source archive SHA')
    for path,d in inputs.items():require(filehash(path)==d,'Input changed during verification: '+str(path))
    return {'schema':'crwt.alexia_hair_sculpt_source_verification.v1','passed':True,'prefix':PREFIX,'files_checked':len(records),'source_inventory_sha256':sha(invraw),'source_pins_sha256':sha(pinsraw),'review_manifest_sha256':sha(review_raw),'baseline_manifest_sha256':BASELINE_MANIFEST_SHA,'selected_alexia_sha256':pins['review']['candidate_sha256'],'changed_models':1,'unchanged_models':9,'model_counts':counts,'actual_sculpt_gate':sculpted,'native_mesh_count':len(fingerprints),'native_COLOR_attribute_count':len(colors),'native_blend_sha256':n['blend']['sha256'],'packed_active_FILE_images':n['active_FILE_images'],'native_reopen_scope':'Pinned local certificate and dynamic fingerprints; CI did not run Blender/GPU','new_actual_views':5,'reused_actual_views':45,'actual_render_png_sha256':pngsha,'gallery_archive':archive,'optional_exact_derived_HTML_present':bool(derived),'all_inputs_unchanged':True,'approved':False,'gameIntegrated':False,'limits':['Native imported COLOR representation is fingerprinted across save/reopen; this does not claim native byte identity with GLB float COLOR_0.','Protected rear-hair sculpt integrity is not a visual or exhaustive intersection approval.','Complete4221 prior repository blob preservation is parent publisher scope.']}
def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--roster',type=pathlib.Path,required=True);p.add_argument('--baseline-roster',type=pathlib.Path,required=True);p.add_argument('--inventory',type=pathlib.Path,required=True);p.add_argument('--pins',type=pathlib.Path);p.add_argument('--receipt',type=pathlib.Path);a=p.parse_args()
    if a.receipt:require(not a.receipt.resolve().exists() and not a.receipt.resolve().is_relative_to(a.roster.resolve()) and not a.receipt.resolve().is_relative_to(a.baseline_roster.resolve()),'Fresh external verification receipt required')
    report=verify(a.roster,a.baseline_roster,a.inventory,a.pins)
    if a.receipt:
        a.receipt.parent.mkdir(parents=True,exist_ok=True)
        with a.receipt.open('x',encoding='utf-8',newline='\n') as f:f.write(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))
if __name__=='__main__':main()
