"""Respect the GLB default scene while retaining orphan mesh data in native files."""
import sys
sys.dont_write_bytecode=True
import json,struct,pathlib
import bpy

def require(ok,message):
    if not ok:raise ValueError(message)

def source_document(path):
    raw=pathlib.Path(path).read_bytes();length,kind=struct.unpack_from('<II',raw,12)
    require(kind==0x4e4f534a,'Actual GLB JSON required')
    return json.loads(raw[20:20+length])

def apply_default_scene(document,apply=True):
    reachable=set()
    def visit(i):
        if i in reachable:return
        reachable.add(i)
        for child in document['nodes'][i].get('children',[]):visit(child)
    for root in document['scenes'][document.get('scene',0)].get('nodes',[]):visit(root)
    names=[n.get('name') for n in document['nodes'] if 'mesh' in n]
    require(all(names) and len(names)==len(set(names)),'Named unique source mesh nodes required for visibility correspondence')
    active=[];hidden=[]
    for i,node in enumerate(document['nodes']):
        if 'mesh' not in node:continue
        obj=bpy.data.objects.get(node['name'])
        require(obj is not None and obj.type=='MESH','Actual source mesh node was not imported: '+node['name'])
        inactive=i not in reachable
        in_layer=bpy.context.view_layer.objects.get(obj.name) is not None
        require(inactive or in_layer,'Active source mesh missing from imported view layer: '+node['name'])
        if apply:
            obj.hide_render=inactive;obj.hide_viewport=inactive
            if in_layer:obj.hide_set(inactive)
        require(obj.hide_render==inactive and obj.hide_viewport==inactive and (not in_layer or obj.hide_get()==inactive),'Native source default-scene visibility differs: '+node['name'])
        (hidden if inactive else active).append(node['name'])
    return {'default_scene_index':document.get('scene',0),'active_source_mesh_objects':active,'retained_inactive_mesh_objects':hidden,'inactive_mesh_data_preserved':True,'inactive_meshes_hidden_from_viewport_and_render':True}
