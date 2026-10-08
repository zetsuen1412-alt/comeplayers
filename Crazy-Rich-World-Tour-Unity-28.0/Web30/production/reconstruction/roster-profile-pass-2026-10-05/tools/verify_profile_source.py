#!/usr/bin/env python3
"""Verify only the new profile-pass source snapshot and pinned local evidence.

No Blender process, source mutation, network, approval or game integration.
The original ten-model manifest and reused render bytes are separate inputs.
"""
import argparse, hashlib, importlib.util, json, pathlib, re, struct, sys
sys.dont_write_bytecode=True
from restore_offline_gallery import inspect_archive, EXPECTED_BYTES
PREFIX='Crazy-Rich-World-Tour-Unity-28.0/Web30/production/reconstruction/roster-profile-pass-2026-10-05'
OLD_PREFIX='Crazy-Rich-World-Tour-Unity-28.0/Web30/production/reconstruction/roster-visual-fidelity-2026-10-05'
INVENTORY='source-inventory.json'
EXCLUDED={INVENTORY,'evidence/github-publication-receipt.json'}
BASELINE_MANIFEST_SHA='02251bcc4a385515f9836fcfa62c2bdb30d4a07fc1fb39e71e3370363db9fdf3'
ALEXIA_SHA='7ad88d0117c667e01877763e301b5cde8cca27985151cbb21be7b076b37b5cf3'
BLEND_SHA='910c03cdeca5589f87824b141b97215245306f4287a52a7ac5d811dfce887b5e'
NATIVE_REOPEN_SHA='cf04cc94b5e394dba5254701ce34789dc7aa9ba61ba50872a4ae59b668f37a44'
NATIVE_BUILD_SHA='017a2e0ec8b3db935029858c20f5ab1430989ca65fbfc8b1e1db2c455fc53389'
NATIVE_MANIFEST_SHA='eb9ee459333b070ab9c719772ea721250b43f3ab72712e93473153e330a26aef'
NATIVE_COLOR_SHA='678aecabd29b9b35150938337350a35a9eabfc4356ab1ac421f81590e40c1d25'
GALLERY_SHA='25ec72ab2ffb0cfeddd93b50e83737cc53ff6e445311721950b6ad8a60369261'
IDS={'alexia','rindi','atlas','kairo','luna','mochi','nox','pip','yuna','zeno'}
VIEWS=['front','three-quarter','left','right','back']
CLIPS={'Idle','Walk','Jump','Skill','Win','Lose'}
sha=lambda raw:hashlib.sha256(raw).hexdigest()

def require(ok,message):
    if not ok:raise ValueError(message)

def safe_relative(name):
    require(isinstance(name,str) and name and '\\' not in name and ':' not in name and not any(ord(c)<32 for c in name),'Invalid relative source path')
    p=pathlib.PurePosixPath(name)
    require(not p.is_absolute() and p.as_posix()==name and all(v not in {'','.','..','.git'} for v in name.split('/')),'Noncanonical/traversal path')
    reserved={'con','prn','aux','nul',*[f'com{i}' for i in range(1,10)],*[f'lpt{i}' for i in range(1,10)]}
    require(all(not v.endswith((' ','.')) and v.split('.')[0].casefold() not in reserved for v in p.parts),'Windows path collision')
    return name

def safe_path(base,name):
    name=safe_relative(name); base=base.resolve(strict=True); target=base/name
    for parent in [target,*target.parents]:
        if parent==base:break
        require(not parent.is_symlink() and not getattr(parent,'is_junction',lambda:False)(),'Linked source path')
    require(target.resolve().is_relative_to(base),'Path escaped source root')
    return target

def filehash(path):
    h=hashlib.sha256(); g=hashlib.sha1(b'blob '+str(path.stat().st_size).encode()+b'\0'); count=0
    with path.open('rb') as f:
        while block:=f.read(1024*1024):h.update(block);g.update(block);count+=len(block)
    return {'bytes':count,'sha256':h.hexdigest(),'git_blob_sha1':g.hexdigest()}

def json_doc(raw):
    def unique(pairs):
        d={}
        for k,v in pairs:require(k not in d,'Duplicate JSON key');d[k]=v
        return d
    def bad(v):raise ValueError('Nonfinite JSON number: '+v)
    return json.loads(raw,object_pairs_hook=unique,parse_constant=bad)

def no_approval(d,mandatory=False):
    groups=[('approved','accepted','production_ready','production_approved','visualApproved','visual_approval'),('gameIntegrated','game_integrated','game_integration')]
    for keys in groups:
        present=[k for k in keys if k in d]
        if mandatory:require(present,'Explicit false candidate flags required')
        for key in present:require(d[key] is False,key+' must be false')

def inventory_document(raw):
    d=json_doc(raw)
    require(d.get('schema')=='crwt.alexia_profile_source_inventory.v1' and d.get('prefix')==PREFIX and d.get('html_storage')=='zip','Source snapshot schema/prefix/ZIP storage')
    no_approval(d); rows=d.get('files'); require(isinstance(rows,list) and rows,'Empty source snapshot')
    names=set();folds=set()
    for row in rows:
        name=safe_relative(row['path']); require(name not in EXCLUDED and name not in names and name.casefold() not in folds,'Duplicate/self/excluded source file')
        names.add(name);folds.add(name.casefold())
        require(type(row.get('bytes')) is int and row['bytes']>=0 and re.fullmatch('[0-9a-f]{64}',row.get('sha256','')) and re.fullmatch('[0-9a-f]{40}',row.get('git_blob_sha1','')),'Snapshot size/hash record')
        require(row.get('mode') in {'100644','100755'},'Snapshot Git mode')
    require([r['path'] for r in rows]==sorted(names),'Source snapshot paths must be sorted')
    require('OFFLINE-GALLERY.zip' in names and 'BUKA-REVIEW-MODEL.html' not in names,'Git source must store gallery ZIP instead of derived HTML')
    for name in names:
        pieces=name.split('/')
        require(not any('/'.join(pieces[:i]).casefold() in folds for i in range(1,len(pieces))),'File/directory source collision')
    return d

def verify(roster,baseline,inventory):
    roster=roster.resolve(strict=True);baseline=baseline.resolve(strict=True);inventory=inventory.resolve(strict=True)
    require(inventory==roster/INVENTORY and roster!=baseline,'Snapshot source roots')
    inventory_raw=inventory.read_bytes(); doc=inventory_document(inventory_raw); inputs={inventory:filehash(inventory)}
    records={r['path']:r for r in doc['files']}
    actual=set()
    for path in roster.rglob('*'):
        require(not path.is_symlink() and not getattr(path,'is_junction',lambda:False)(),'Link in new source snapshot')
        if path.is_file():actual.add(path.relative_to(roster).as_posix())
    derived=set()
    if 'BUKA-REVIEW-MODEL.html' in actual:
        html=roster/'BUKA-REVIEW-MODEL.html';digest=filehash(html)
        require(digest['sha256']==GALLERY_SHA and digest['bytes']==EXPECTED_BYTES,'Optional restored HTML differs from exact gallery')
        inputs[html]=digest;derived.add('BUKA-REVIEW-MODEL.html')
    require(actual-EXCLUDED-derived==set(records),'New source snapshot file set differs')
    for name,row in records.items():
        path=safe_path(roster,name);require(path.is_file(),'Missing snapshot file')
        digest=filehash(path);require(all(digest[k]==row[k] for k in digest),'Source snapshot byte/hash mismatch: '+name);inputs[path]=digest
    def raw(name,base=roster,pin=None):
        path=safe_path(base,name);data=path.read_bytes();digest=filehash(path);inputs[path]=digest
        require(digest['sha256']==sha(data),'Source changed while reading')
        if pin:require(digest['sha256']==pin,'Pinned input mismatch: '+name)
        return data
    review_raw=raw('review-manifest.json');review=json_doc(review_raw)
    require(review.get('schema')=='crwt.alexia_profile_review.v1' and review.get('changed_models')==1 and review.get('baseline_manifest_sha256')==BASELINE_MANIFEST_SHA,'Selected review contract')
    no_approval(review,True)
    old=json_doc(raw('review-manifest.json',baseline,BASELINE_MANIFEST_SHA));no_approval(old,True)
    require(len(old['models'])==10 and {r['id'] for r in old['models']}==IDS,'Baseline roster')
    oldrows={r['id']:r for r in old['models']};rows=review.get('models',[])
    require(len(rows)==10 and {r['id'] for r in rows}==IDS,'Selected ten-model roster')
    require(review.get('unchanged_models')==sorted(IDS-{'alexia'}),'Nine unchanged model IDs')
    validator_path=safe_path(roster,'tools/validate_roster_candidate.py')
    require(filehash(validator_path)['sha256']=='72ef5252320ffe045415287e1101c61af032fc6574580e3c245aa4820a30a942','Frozen GLB validator pin')
    spec=importlib.util.spec_from_file_location('profile_glb_validator',validator_path);validator=importlib.util.module_from_spec(spec);spec.loader.exec_module(validator)
    counts={};modelraw={}
    for row in rows:
        id=row['id'];no_approval(row,True)
        require(row.get('path')==f'viewer/models/{id}.glb' and row.get('reference')==f'viewer/references/{id}.png','Canonical model/reference path')
        require(row.get('baseline_sha256')==oldrows[id]['sha256'],'Model baseline SHA differs')
        require(row.get('refined_in_this_checkpoint') is (id=='alexia'),'Changed model marker')
        require(row.get('sha256')==(ALEXIA_SHA if id=='alexia' else oldrows[id]['sha256']),'Exactly one selected model change')
        require(row.get('referenceSha256')==oldrows[id]['referenceSha256'],'Reference changed')
        data=raw(row['path'],pin=row['sha256']);raw(row['reference'],pin=row['referenceSha256']);counts[id]=validator.validate_model(data);modelraw[id]=data
        for key,value in row['expected'].items():require(counts[id].get(key)==value,'Actual model count mismatch: '+id+'/'+key)
        require((counts[id]['skins'],counts[id]['clips'])==((1,6) if id=='pip' else (0,0)),'Static nine / Pip clips')
    pip,_=validator.parse_glb(modelraw['pip']);require(len(pip['skins'])==1 and len(pip['skins'][0]['joints'])==13 and set(counts['pip']['clip_names'])==CLIPS,'Pip13 joints/six actual clips')
    # The active Alexia representation is direct float COLOR_0; old unused images may remain embedded.
    gltf,_=validator.parse_glb(modelraw['alexia']); main=gltf['meshes'][0]['primitives'][0]
    color=gltf['accessors'][main['attributes']['COLOR_0']]
    require(color['componentType']==5126 and color['type']=='VEC4' and color['count']==gltf['accessors'][main['attributes']['POSITION']]['count'],'Direct float32 COLOR_0')
    material=gltf['materials'][main['material']];require('KHR_materials_unlit' in material.get('extensions',{}),'Reference-color unlit material')
    def has_texture(value):
        if isinstance(value,dict):return any(k.endswith('Texture') or has_texture(v) for k,v in value.items())
        if isinstance(value,list):return any(has_texture(v) for v in value)
        return False
    active_materials={p['material'] for m in gltf['meshes'] for p in m['primitives'] if 'material' in p}
    require(not any(has_texture(gltf['materials'][i]) for i in active_materials),'Unexpected active Alexia image texture')
    # Frozen local native certificate, not a new CI Blender/GPU reopen.
    editable_raw=raw('alexia-editable-manifest.json',pin=NATIVE_MANIFEST_SHA);editable=json_doc(editable_raw);no_approval(editable,True)
    require(editable['models']==[{'id':'alexia','path':'viewer/models/alexia.glb','sha256':ALEXIA_SHA}],'Portable one-character native manifest')
    raw('editable/Alexia-profile-review.blend',pin=BLEND_SHA)
    build=json_doc(raw('editable/Alexia-profile-review.workspace-proof.json',pin=NATIVE_BUILD_SHA))
    reopen=json_doc(raw('evidence/native-reopen.json',pin=NATIVE_REOPEN_SHA))
    certificate=json_doc(raw('evidence/selected-alexia-native-certificate.json'));no_approval(certificate,True)
    require(certificate.get('schema')=='crwt.selected_alexia_native.v1' and certificate.get('passed') is True and certificate.get('candidate_sha256')==ALEXIA_SHA and certificate.get('blend_sha256')==BLEND_SHA,'Selected native certificate')
    require(certificate.get('build_proof_sha256')==NATIVE_BUILD_SHA and certificate.get('reopen_proof_sha256')==NATIVE_REOPEN_SHA and certificate.get('editable_manifest_sha256')==NATIVE_MANIFEST_SHA,'Native certificate proof/hash chain')
    require(certificate.get('native_build_proof_path')=='editable/Alexia-profile-review.workspace-proof.json' and certificate.get('native_reopen_proof_path')=='evidence/native-reopen.json','Canonical native proof paths')
    require(all(certificate.get(k) is True for k in ['all_file_images_packed','read_only_reopen','native_color_attributes_preserved']) and certificate.get('packed_active_image_count')==0 and certificate.get('single_character')=='alexia','Native certificate integrity flags')
    require(build.get('schema')=='crwt.editable_roster_review_workspace.v1' and build.get('character_count')==1 and build.get('accepted') is False and build.get('production_ready') is False and build.get('output_blend_sha256')==BLEND_SHA and build.get('manifest_sha256')==NATIVE_MANIFEST_SHA,'Native build contract')
    require(all(build.get(k) is True for k in ['all_source_files_unchanged','imported_material_graphs_unchanged','all_file_images_packed']) and build.get('geometry_uv_texture_or_rig_edits_performed') is False,'Native build invariance')
    characters=build['characters'];require(len(characters)==1 and characters[0]['id']=='alexia' and characters[0]['source_sha256']==ALEXIA_SHA and characters[0]['accepted'] is False and characters[0]['rig_added'] is False and characters[0]['imported_armatures']==characters[0]['imported_actions']==0,'Native Alexia static import')
    fingerprints=characters[0]['native_imported_mesh_material_slot_uv_fingerprints'];require(len(fingerprints)==2 and sum(m['vertices'] for m in fingerprints.values())==258703 and sum(m['polygons'] for m in fingerprints.values())==451712,'Native actual geometry counts')
    buildcolors=[v for m in fingerprints.values() for v in m['color_attributes']]
    expected_color={'name':'Color','domain':'CORNER','data_type':'BYTE_COLOR','float32_color_sha256':NATIVE_COLOR_SHA}
    require(buildcolors==[expected_color],'Imported native COLOR fingerprint')
    no_approval(reopen,True)
    require(reopen.get('schema')=='crwt.alexia_profile_native_reopen.v1' and reopen.get('passed') is True and reopen.get('blend_sha256')==BLEND_SHA and reopen.get('candidate_sha256')==ALEXIA_SHA and reopen.get('manifest_sha256')==NATIVE_MANIFEST_SHA and reopen.get('character_count')==1,'Local read-only native reopen chain')
    require(all(reopen.get(k) is True for k in ['all_mesh_normal_uv_material_fingerprints_equal','color_attribute_fingerprints_equal','all_file_images_packed','portable_manifest_relative_sources','read_only','no_source_or_blend_writes']) and reopen.get('historical_absolute_source_paths_used') is False and reopen.get('packed_active_image_count')==0 and reopen.get('images')=={},'Native reopen invariance/color/0 active FILE images')
    require([v for mesh in reopen['native_color_attributes'] for v in mesh]==[expected_color],'Reopened native COLOR fingerprint')
    # Five new selected views and forty-five exact reused views.
    selection=json_doc(raw('evidence/render-selection-receipt.json'));no_approval(selection,True)
    require(selection.get('schema')=='crwt.profile_render_selection.v1' and selection.get('new_actual_png_count')==5 and selection.get('reused_actual_png_count')==45,'Actual render selection scope')
    selected_rows=selection.get('characters',[]);require(len(selected_rows)==10 and {r['id'] for r in selected_rows}==IDS,'Render selection roster')
    render_rows={r['id']:r for r in selected_rows};image_hashes={};new_views=reused=0
    for row in rows:
        id=row['id'];entry=render_rows[id];require(entry['glb_sha256']==row['sha256'],'Render source model SHA')
        proof_raw=raw(f'renders/{id}/render-evidence.json',pin=entry['render_proof_sha256']);render=json_doc(proof_raw)
        require(render.get('input_sha256')==row['sha256'] and render.get('production_approved') is False and render.get('orbit_frames')==0 and [v[0] for v in render.get('views',[])]==VIEWS and render.get('polygons')==counts[id]['faces'],'Actual five-view proof/model counts')
        require(entry.get('source_accessor_vertices')==counts[id]['vertices'] and entry.get('imported_blender_vertices')==render['vertices'],'Imported/source vertex representation accounting')
        if id!='alexia':require(proof_raw==raw(f'actual-five-views/{id}/render-evidence.json',baseline),'Reused render proof differs from frozen baseline')
        for view in VIEWS:
            name=f'renders/{id}/{view}.png';png=raw(name);require(png[:8]==b'\x89PNG\r\n\x1a\n' and struct.unpack('>II',png[16:24])==(640,640),'Actual render PNG dimensions')
            image_hashes[name]=sha(png)
            if id=='alexia':new_views+=1
            else:require(png==raw(f'actual-five-views/{id}/{view}.png',baseline),'Reused PNG differs from original baseline');reused+=1
    require(new_views==5 and reused==45,'Actual view totals')
    receipt=json_doc(raw('BUKA-REVIEW-MODEL.viewer-receipt.json'))
    require(receipt.get('schema')=='crwt.offline_character_review_receipt.v1' and receipt.get('viewer_sha256')==GALLERY_SHA and receipt.get('manifest_sha256')==sha(review_raw),'Frozen gallery/manifest receipt')
    require(receipt.get('visual_approval') is False and receipt.get('game_integration') is False and receipt.get('requires_network') is False,'Frozen gallery flags')
    require(len(receipt.get('models',[]))==10 and {r['id']:r['sha256'] for r in receipt['models']}=={r['id']:r['sha256'] for r in rows},'Frozen gallery selected model hashes')
    zip_path=safe_path(roster,'OFFLINE-GALLERY.zip');zip_report=inspect_archive(zip_path)
    require(zip_report['archive_sha256']==inputs[zip_path]['sha256'] and zip_report['html_sha256']==receipt['viewer_sha256'] and zip_report['html_bytes']==receipt['viewer_bytes'],'Gallery ZIP/frozen receipt mismatch')
    for path,digest in inputs.items():require(filehash(path)==digest,'Input changed during verification: '+str(path))
    return {'schema':'crwt.alexia_profile_source_verification.v1','passed':True,'source_inventory_sha256':sha(inventory_raw),
            'prefix':PREFIX,'files_checked':len(records),'source_file_hashes_and_Git_blob_SHA1_checked':True,
            'review_manifest_sha256':sha(review_raw),'baseline_manifest_sha256':BASELINE_MANIFEST_SHA,
            'model_count':10,'changed_models':{'alexia':ALEXIA_SHA},'unchanged_model_count':9,'model_counts':counts,
            'new_actual_views':new_views,'reused_actual_views':reused,'actual_render_image_sha256':image_hashes,
            'native_blend_sha256':BLEND_SHA,'native_reopen_proof_sha256':NATIVE_REOPEN_SHA,'native_COLOR_representation':'Blender CORNER BYTE_COLOR save/reopen; exact float32 COLOR_0 retained in GLB',
            'packed_active_FILE_images':0,'frozen_local_reopen_verified':'certificate and hashes; CI did not run Blender/GPU',
            'expected_gallery_sha256':GALLERY_SHA,'html_storage':'zip','gallery_archive':zip_report,'optional_exact_derived_HTML_present':bool(derived),
            'inputs_unchanged':True,'approved':False,'gameIntegrated':False,
            'scope':'New prefix only. Parent publisher verifies preservation of all previous3950 repository blobs.'}

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--roster',type=pathlib.Path,required=True);p.add_argument('--baseline-roster',type=pathlib.Path,required=True);p.add_argument('--inventory',type=pathlib.Path,required=True);p.add_argument('--receipt',type=pathlib.Path)
    a=p.parse_args()
    if a.receipt:
        receipt=a.receipt.resolve();require(not receipt.exists() and not receipt.is_relative_to(a.roster.resolve()) and not receipt.is_relative_to(a.baseline_roster.resolve()),'Verification receipt must be fresh outside source roots')
    report=verify(a.roster,a.baseline_roster,a.inventory)
    if a.receipt:
        receipt.parent.mkdir(parents=True,exist_ok=True)
        with receipt.open('x',encoding='utf-8',newline='\n') as f:f.write(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))
if __name__=='__main__':main()
