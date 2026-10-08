#!/usr/bin/env python3
"""Verify the new hair-strands prefix using explicit frozen source-pins.json.

CI reads actual baseline/source GLBs, appended closed volumes, render bytes,
and existing local native certificates. It does not run Blender or approve art.
"""
import argparse, collections, hashlib, importlib.util, json, math, pathlib, re, struct, sys
sys.dont_write_bytecode=True
PREFIX='Crazy-Rich-World-Tour-Unity-28.0/Web30/production/reconstruction/roster-hair-strands-2026-10-05'
OLD_PREFIX='Crazy-Rich-World-Tour-Unity-28.0/Web30/production/reconstruction/roster-profile-pass-2026-10-05'
BASELINE_MANIFEST_SHA='f04487f660a5ac3b1f537fb620785cdb82ae6e4fbd6266120e0218e18f9a2063'
BASELINE_ALEXIA_SHA='7ad88d0117c667e01877763e301b5cde8cca27985151cbb21be7b076b37b5cf3'
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
    d=document(raw);require(d.get('schema')=='crwt.alexia_hair_strands_source_inventory.v1' and d.get('prefix')==PREFIX and d.get('html_storage')=='zip','Inventory schema/prefix/storage')
    no_approval(d);rows=d.get('files');require(isinstance(rows,list) and rows,'Empty source inventory');seen=set();folds=set()
    for r in rows:
        name=safe_relative(r['path']);require(name not in EXCLUDED and name not in seen and name.casefold() not in folds,'Duplicate/self source inventory path');seen.add(name);folds.add(name.casefold())
        require(type(r.get('bytes')) is int and r['bytes']>=0 and valid_sha(r.get('sha256')) and re.fullmatch('[0-9a-f]{40}',r.get('git_blob_sha1','')) and r.get('mode') in {'100644','100755'},'Bad inventory size/hash/mode')
    require([r['path'] for r in rows]==sorted(seen) and PINS in seen and 'OFFLINE-GALLERY.zip' in seen and 'BUKA-REVIEW-MODEL.html' not in seen,'Sorted inventory/pins/ZIP layout')
    for name in seen:
        bits=name.split('/');require(not any('/'.join(bits[:i]).casefold() in folds for i in range(1,len(bits))),'File/directory path collision')
    return d
def pins_document(raw):
    p=document(raw);require(p.get('schema')=='crwt.alexia_hair_strands_source_pins.v1' and p.get('template_only') is not True and p.get('prefix')==PREFIX,'Final pins required');no_approval(p,True)
    b=p['baseline'];require(b['prefix']==OLD_PREFIX and b['manifest_sha256']==BASELINE_MANIFEST_SHA and b['alexia_sha256']==BASELINE_ALEXIA_SHA,'Pinned previous checkpoint')
    require(p['review']['path']=='review-manifest.json' and valid_sha(p['review']['sha256']) and valid_sha(p['review']['candidate_sha256']) and isinstance(p['review']['schema'],str),'Final review pin')
    g=p['gallery'];require(g['archive']=='OFFLINE-GALLERY.zip' and g['entry']=='BUKA-REVIEW-MODEL.html' and g['receipt']=='BUKA-REVIEW-MODEL.viewer-receipt.json' and all(valid_sha(g[k]) for k in ['archive_sha256','html_sha256','receipt_sha256']) and type(g['html_bytes']) is int and g['html_bytes']>0,'Final gallery pins')
    require(set(p['proofs'])>={'selected','geometry','independent','native_build','native_reopen','native_certificate'},'Required selected/geometry/independent/native proof roles')
    for role,r in p['proofs'].items():
        safe_relative(r['path']);require(valid_sha(r['sha256']) and isinstance(r['schema'],str) and r['schema'] and isinstance(r.get('expected_fields'),dict) and r['expected_fields'],'Explicit proof SHA/schema/assertions: '+role)
        if 'candidate_sha256' in r:require(valid_sha(r['candidate_sha256']),'Proof candidate override SHA')
        if 'source_sha256' in r:require(valid_sha(r['source_sha256']),'Proof source override SHA')
    for r in [p['native']['blend'],p['native']['editable_manifest'],p['render_selection']]:safe_relative(r['path']);require(valid_sha(r['sha256']),'Final file pin')
    geo=p['geometry'];require(type(geo['parent_node_index']) is int and geo['parent_node_index']>=0 and all(type(geo[k]) is int and geo[k]>0 for k in ['added_meshes','added_nodes','added_materials','added_vertices','added_triangles','closed_locks']),'Explicit appended geometry counts')
    require(isinstance(p['native']['mesh_fingerprints'],dict) and p['native']['mesh_fingerprints'] and type(p['native']['active_FILE_images']) is int and p['native']['active_FILE_images']>=0,'Dynamic native fingerprints/image count')
    return p
def append_gate(validator,oldraw,newraw,expected):
    old,oldbin=validator.parse_glb(oldraw);new,newbin=validator.parse_glb(newraw)
    require(newbin[:len(oldbin)]==oldbin,'Original BIN prefix changed')
    for key in ['accessors','bufferViews','meshes','materials','images','textures','samplers','skins','animations']:
        require(new.get(key,[])[:len(old.get(key,[]))]==old.get(key,[]),'Original JSON array changed: '+key)
    require(new.get('scene')==old.get('scene') and new.get('scenes')==old.get('scenes'),'Source scene/default roots changed')
    parent=expected['parent_node_index'];require(parent<len(old['nodes']),'Parent node index invalid')
    oldnodes=old['nodes'];newnodes=new['nodes'];require(len(newnodes)-len(oldnodes)==expected['added_nodes'],'Appended node count')
    for i,node in enumerate(oldnodes):
        actual=newnodes[i]
        if i!=parent:require(actual==node,'Original node changed');continue
        stripped=dict(actual);stripped['children']=node.get('children',[])
        if 'children' not in node:stripped.pop('children')
        require(stripped==node,'Original parent properties/transforms changed')
        children=actual.get('children',[]);original=node.get('children',[])
        require(children[:len(original)]==original and len(children)-len(original)==expected['added_nodes'] and set(children[len(original):])==set(range(len(oldnodes),len(newnodes))),'Only append new parent children permitted')
    added=new['meshes'][len(old['meshes']):];require(len(added)==expected['added_meshes'] and len(new['materials'])-len(old['materials'])==expected['added_materials'],'Appended mesh/material count')
    require({n.get('mesh') for n in newnodes[len(oldnodes):]}==set(range(len(old['meshes']),len(new['meshes']))),'New nodes must use only added meshes')
    values=validator.Accessors(new,newbin);positions={};triangles=[];vertex_count=0
    for mi,mesh in enumerate(added,start=len(old['meshes'])):
        for pi,prim in enumerate(mesh['primitives']):
            require(prim.get('mode',4)==4 and 'indices' in prim and 'NORMAL' in prim['attributes'] and 'COLOR_0' in prim['attributes'],'New locks require indexed volumetric triangle mesh/normals/colors')
            pos=values.read(prim['attributes']['POSITION']);vertex_count+=len(pos);ids=[v[0] for v in values.read(prim['indices'])]
            require(len(ids)%3==0,'New triangle index layout')
            for i,v in enumerate(pos):positions[(mi,pi,i)]=struct.pack('<3f',*v)
            for j in range(0,len(ids),3):triangles.append([positions[(mi,pi,i)] for i in ids[j:j+3]])
    require(vertex_count==expected['added_vertices'] and len(triangles)==expected['added_triangles'],'Actual added vertices/triangles')
    parent_map={v:v for tri in triangles for v in tri}
    def find(v):
        while parent_map[v]!=v:parent_map[v]=parent_map[parent_map[v]];v=parent_map[v]
        return v
    def union(a,b):
        a,b=find(a),find(b)
        if a!=b:parent_map[b]=a
    edges=collections.Counter();directed=collections.Counter();areas=[];volumes=collections.defaultdict(float)
    def cross(a,b):return (a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])
    def dot(a,b):return sum(x*y for x,y in zip(a,b))
    def sub(a,b):return tuple(x-y for x,y in zip(a,b))
    for tri in triangles:
        require(len(set(tri))==3,'Repeated new triangle vertex');union(tri[0],tri[1]);union(tri[0],tri[2])
        a,b,c=[struct.unpack('<3f',v) for v in tri];normal=cross(sub(b,a),sub(c,a));area=math.sqrt(dot(normal,normal))/2;require(area>1e-12 and math.isfinite(area),'Degenerate appended triangle');areas.append(area)
        for u,v in zip(tri,tri[1:]+tri[:1]):edges[tuple(sorted((u,v)))]+=1;directed[(u,v)]+=1
    require(all(count==2 and directed[(u,v)]==directed[(v,u)]==1 for (u,v),count in edges.items()),'New lock surfaces not closed/oriented')
    for tri in triangles:
        a,b,c=[struct.unpack('<3f',v) for v in tri];volumes[find(tri[0])]+=dot(a,cross(b,c))/6
    require(len(volumes)==expected['closed_locks'] and all(math.isfinite(v) and v>0 for v in volumes.values()),'Added closed lock component/positive volume count')
    return {'original_BIN_prefix_exact':True,'original_mesh_attributes_positions_normals_UV_colors_indices_exact':True,'original_materials_images_records_exact':True,'original_nodes_only_parent_children_appended':True,'scenes_default_roots_exact':True,'original_vertices_deformed':0,'added_vertices':vertex_count,'added_triangles':len(triangles),'closed_oriented_added_components':len(volumes),'minimum_added_triangle_area':min(areas),'signed_component_volumes':sorted(volumes.values()),'global_collision_certificate':False}
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
    spec=importlib.util.spec_from_file_location('hair_strands_glb_validator',validator_path);validator=importlib.util.module_from_spec(spec);spec.loader.exec_module(validator)
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
    appended=append_gate(validator,old_alexia,modelraw['alexia'],pins['geometry'])
    proofdocs={}
    for role,r in pins['proofs'].items():
        d=document(item(r));require(d.get('schema')==r['schema'],'Pinned proof schema: '+role);no_approval(d)
        for field,value in r['expected_fields'].items():require(same(pointer(d,field),value),'Proof assertion differs: '+role+field)
        if 'candidate_sha_pointer' in r:require(pointer(d,r['candidate_sha_pointer'])==r.get('candidate_sha256',pins['review']['candidate_sha256']),'Proof candidate binding: '+role)
        if 'source_sha_pointer' in r:require(pointer(d,r['source_sha_pointer'])==r.get('source_sha256',BASELINE_ALEXIA_SHA),'Proof source binding: '+role)
        if 'blend_sha_pointer' in r:require(pointer(d,r['blend_sha_pointer'])==pins['native']['blend']['sha256'],'Proof blend binding: '+role)
        if 'manifest_sha_pointer' in r:require(pointer(d,r['manifest_sha_pointer'])==pins['native']['editable_manifest']['sha256'],'Proof native manifest binding: '+role)
        proofdocs[role]=d
    for role in ['selected','geometry','independent']:require('candidate_sha_pointer' in pins['proofs'][role] and 'source_sha_pointer' in pins['proofs'][role],'Selected/geometry/audit proof SHA bindings required')
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
    require(receipt['viewer_sha256']==gallery['html_sha256'] and receipt['viewer_bytes']==gallery['html_bytes'] and receipt['manifest_sha256']==sha(review_raw) and receipt['visual_approval'] is False and receipt['game_integration'] is False and receipt['requires_network'] is False,'Frozen gallery receipt')
    require(len(receipt['models'])==10 and {r['id']:r['sha256'] for r in receipt['models']}=={r['id']:r['sha256'] for r in rows},'Gallery selected model SHA map')
    from restore_offline_gallery import inspect_archive
    archive=inspect_archive(safe_path(roster,gallery['archive']),gallery);require(archive['archive_sha256']==gallery['archive_sha256'],'Gallery source archive SHA')
    for path,d in inputs.items():require(filehash(path)==d,'Input changed during verification: '+str(path))
    return {'schema':'crwt.alexia_hair_strands_source_verification.v1','passed':True,'prefix':PREFIX,'files_checked':len(records),'source_inventory_sha256':sha(invraw),'source_pins_sha256':sha(pinsraw),'review_manifest_sha256':sha(review_raw),'baseline_manifest_sha256':BASELINE_MANIFEST_SHA,'selected_alexia_sha256':pins['review']['candidate_sha256'],'changed_models':1,'unchanged_models':9,'model_counts':counts,'actual_append_gate':appended,'native_mesh_count':len(fingerprints),'native_COLOR_attribute_count':len(colors),'native_blend_sha256':n['blend']['sha256'],'packed_active_FILE_images':n['active_FILE_images'],'native_reopen_scope':'Pinned local certificate and dynamic fingerprints; CI did not run Blender/GPU','new_actual_views':5,'reused_actual_views':45,'actual_render_png_sha256':pngsha,'gallery_archive':archive,'optional_exact_derived_HTML_present':bool(derived),'all_inputs_unchanged':True,'approved':False,'gameIntegrated':False,'limits':['Native imported COLOR representation is fingerprinted across save/reopen; this does not claim native byte identity with GLB float COLOR_0.','Appended edge closure/orientation is not exhaustive intersection or visual approval.','Complete4090 prior repository blob preservation is parent publisher scope.']}
def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--roster',type=pathlib.Path,required=True);p.add_argument('--baseline-roster',type=pathlib.Path,required=True);p.add_argument('--inventory',type=pathlib.Path,required=True);p.add_argument('--pins',type=pathlib.Path);p.add_argument('--receipt',type=pathlib.Path);a=p.parse_args()
    if a.receipt:require(not a.receipt.resolve().exists() and not a.receipt.resolve().is_relative_to(a.roster.resolve()) and not a.receipt.resolve().is_relative_to(a.baseline_roster.resolve()),'Fresh external verification receipt required')
    report=verify(a.roster,a.baseline_roster,a.inventory,a.pins)
    if a.receipt:
        a.receipt.parent.mkdir(parents=True,exist_ok=True)
        with a.receipt.open('x',encoding='utf-8',newline='\n') as f:f.write(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))
if __name__=='__main__':main()
