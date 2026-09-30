#!/usr/bin/env python3
import json, math, struct, pathlib
import numpy as np

ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'assets'/'characters'/'glb'
OUT.mkdir(parents=True,exist_ok=True)

CHARS={
 'alexia': dict(name='Alexia', hair='#eef2ff', body='#ffd24f', accent='#343b58', accessory='headphones'),
 'rindi': dict(name='Rindi', hair='#ff8faf', body='#ff73a4', accent='#fff1f6', accessory='bow'),
 'kairo': dict(name='Kairo', hair='#55bcc2', body='#43b6a4', accent='#216d79', accessory='cap'),
 'luna': dict(name='Luna', hair='#ff85ad', body='#8d74ff', accent='#ffe36b', accessory='star'),
 'nox': dict(name='Nox', hair='#2f374d', body='#56617d', accent='#171b28', accessory='glasses'),
 'atlas': dict(name='Atlas', hair='#2b7b94', body='#4dbac7', accent='#ffcf5b', accessory='scarf'),
}

def rgba(hexv,a=1.0):
    h=hexv.lstrip('#');
    if len(h)==3: h=''.join(c*2 for c in h)
    n=int(h,16)
    return [((n>>16)&255)/255,((n>>8)&255)/255,(n&255)/255,a]

def quat_xyz(rx=0,ry=0,rz=0):
    cx,sx=math.cos(rx/2),math.sin(rx/2); cy,sy=math.cos(ry/2),math.sin(ry/2); cz,sz=math.cos(rz/2),math.sin(rz/2)
    x=sx*cy*cz+cx*sy*sz
    y=cx*sy*cz-sx*cy*sz
    z=cx*cy*sz+sx*sy*cz
    w=cx*cy*cz-sx*sy*sz
    return [x,y,z,w]

def T(x,y,z):
    m=np.eye(4,dtype=np.float32); m[:3,3]=[x,y,z]; return m

def add_box(pos,norm,col,joints,weights,indices,center,size,joint,colorv):
    cx,cy,cz=center; sx,sy,sz=[v/2 for v in size]
    faces=[
      ((0,0,1), [(-sx,-sy,sz),(sx,-sy,sz),(sx,sy,sz),(-sx,sy,sz)]),
      ((0,0,-1),[(sx,-sy,-sz),(-sx,-sy,-sz),(-sx,sy,-sz),(sx,sy,-sz)]),
      ((0,1,0),[(-sx,sy,sz),(sx,sy,sz),(sx,sy,-sz),(-sx,sy,-sz)]),
      ((0,-1,0),[(-sx,-sy,-sz),(sx,-sy,-sz),(sx,-sy,sz),(-sx,-sy,sz)]),
      ((1,0,0),[(sx,-sy,sz),(sx,-sy,-sz),(sx,sy,-sz),(sx,sy,sz)]),
      ((-1,0,0),[(-sx,-sy,-sz),(-sx,-sy,sz),(-sx,sy,sz),(-sx,sy,-sz)]),
    ]
    for normal,verts in faces:
        base=len(pos)
        for vx,vy,vz in verts:
            pos.append((cx+vx,cy+vy,cz+vz)); norm.append(normal); col.append(colorv); joints.append((joint,0,0,0)); weights.append((1,0,0,0))
        indices.extend((base,base+1,base+2,base,base+2,base+3))

def build_mesh(cfg):
    pos=[]; norm=[]; col=[]; joints=[]; weights=[]; indices=[]
    skin=rgba('#ffd8c4'); hair=rgba(cfg['hair']); body=rgba(cfg['body']); accent=rgba(cfg['accent']); shoe=rgba('#27364d')
    # joint slots: 0 hips,1 spine,2 head,3 LArm,4 LLeg,5 RLeg,6 RArm
    add_box(pos,norm,col,joints,weights,indices,(0,1.22,0),(.68,.72,.40),1,body)
    add_box(pos,norm,col,joints,weights,indices,(0,1.82,.02),(.58,.56,.52),2,skin)
    add_box(pos,norm,col,joints,weights,indices,(0,2.05,-.04),(.63,.20,.57),2,hair)
    add_box(pos,norm,col,joints,weights,indices,(-.27,1.91,-.13),(.13,.38,.46),2,hair)
    add_box(pos,norm,col,joints,weights,indices,(.27,1.91,-.13),(.13,.38,.46),2,hair)
    add_box(pos,norm,col,joints,weights,indices,(-.47,1.35,0),(.19,.60,.20),3,body)
    add_box(pos,norm,col,joints,weights,indices,(.47,1.35,0),(.19,.60,.20),6,body)
    add_box(pos,norm,col,joints,weights,indices,(-.18,.31,0),(.25,.67,.26),4,rgba('#f4f7ff'))
    add_box(pos,norm,col,joints,weights,indices,(.18,.31,0),(.25,.67,.26),5,rgba('#f4f7ff'))
    add_box(pos,norm,col,joints,weights,indices,(-.18,-.055,.04),(.29,.16,.38),4,shoe)
    add_box(pos,norm,col,joints,weights,indices,(.18,-.055,.04),(.29,.16,.38),5,shoe)
    # face eyes
    add_box(pos,norm,col,joints,weights,indices,(-.11,1.86,.285),(.055,.065,.025),2,rgba('#172033'))
    add_box(pos,norm,col,joints,weights,indices,(.11,1.86,.285),(.055,.065,.025),2,rgba('#172033'))
    # accessories
    a=cfg['accessory']
    if a=='headphones':
        add_box(pos,norm,col,joints,weights,indices,(-.34,1.88,.0),(.12,.32,.30),2,accent); add_box(pos,norm,col,joints,weights,indices,(.34,1.88,.0),(.12,.32,.30),2,accent); add_box(pos,norm,col,joints,weights,indices,(0,2.17,-.02),(.58,.08,.12),2,accent)
    elif a=='bow':
        add_box(pos,norm,col,joints,weights,indices,(-.26,2.18,.03),(.23,.18,.10),2,accent); add_box(pos,norm,col,joints,weights,indices,(-.06,2.18,.03),(.23,.18,.10),2,accent)
    elif a=='cap':
        add_box(pos,norm,col,joints,weights,indices,(0,2.19,-.02),(.65,.14,.58),2,accent); add_box(pos,norm,col,joints,weights,indices,(0,2.11,.34),(.42,.07,.24),2,accent)
    elif a=='star':
        add_box(pos,norm,col,joints,weights,indices,(.30,2.17,.12),(.18,.18,.07),2,accent); add_box(pos,norm,col,joints,weights,indices,(.30,2.17,.12),(.07,.26,.07),2,accent)
    elif a=='glasses':
        add_box(pos,norm,col,joints,weights,indices,(-.13,1.87,.315),(.20,.11,.035),2,accent); add_box(pos,norm,col,joints,weights,indices,(.13,1.87,.315),(.20,.11,.035),2,accent); add_box(pos,norm,col,joints,weights,indices,(0,1.87,.315),(.08,.035,.035),2,accent)
    elif a=='scarf':
        add_box(pos,norm,col,joints,weights,indices,(0,1.53,.04),(.58,.12,.44),1,accent); add_box(pos,norm,col,joints,weights,indices,(.24,1.19,-.18),(.13,.60,.12),1,accent)
    return pos,norm,col,joints,weights,indices

NODE_NAMES=['Hips','Spine','Head','LeftArm','LeftLeg','RightLeg','RightArm']
NODE_IDS={name:i+1 for i,name in enumerate(NODE_NAMES)}
JOINT_NODE_IDS=[1,2,3,4,5,6,7]
REST_LOCAL={
  1:([0,.55,0],quat_xyz()),
  2:([0,.58,0],quat_xyz()),
  3:([0,.68,0],quat_xyz()),
  4:([-.40,.42,0],quat_xyz()),
  5:([-.18,-.58,0],quat_xyz()),
  6:([.18,-.58,0],quat_xyz()),
  7:([.40,.42,0],quat_xyz()),
}
PARENTS={1:0,2:1,3:2,4:2,5:1,6:1,7:2}

def animation_specs():
    I=quat_xyz
    return {
      'Idle': [
        (1,'translation',[0,1,2],[[0,.55,0],[0,.59,0],[0,.55,0]]),
        (3,'rotation',[0,1,2],[I(0,-.08,0),I(0,.08,0),I(0,-.08,0)]),
        (4,'rotation',[0,1,2],[I(0,0,-.08),I(0,0,.08),I(0,0,-.08)]),
        (7,'rotation',[0,1,2],[I(0,0,.08),I(0,0,-.08),I(0,0,.08)]),
      ],
      'Walk': [
        (1,'translation',[0,.2,.4,.6,.8],[[0,.55,0],[0,.61,0],[0,.55,0],[0,.61,0],[0,.55,0]]),
        (4,'rotation',[0,.2,.4,.6,.8],[I(.65,0,0),I(0,0,0),I(-.65,0,0),I(0,0,0),I(.65,0,0)]),
        (7,'rotation',[0,.2,.4,.6,.8],[I(-.65,0,0),I(0,0,0),I(.65,0,0),I(0,0,0),I(-.65,0,0)]),
        (5,'rotation',[0,.2,.4,.6,.8],[I(-.55,0,0),I(0,0,0),I(.55,0,0),I(0,0,0),I(-.55,0,0)]),
        (6,'rotation',[0,.2,.4,.6,.8],[I(.55,0,0),I(0,0,0),I(-.55,0,0),I(0,0,0),I(.55,0,0)]),
      ],
      'Jump': [
        (1,'translation',[0,.15,.35,.55,.75],[[0,.55,0],[0,.78,0],[0,1.05,0],[0,.78,0],[0,.55,0]]),
        (4,'rotation',[0,.25,.5,.75],[I(0,0,0),I(0,0,-1.1),I(0,0,-1.25),I(0,0,0)]),
        (7,'rotation',[0,.25,.5,.75],[I(0,0,0),I(0,0,1.1),I(0,0,1.25),I(0,0,0)]),
      ],
      'Skill': [
        (2,'rotation',[0,.25,.5,.75,1],[I(),I(0,-.35,0),I(0,.35,0),I(0,-.18,0),I()]),
        (7,'rotation',[0,.25,.5,.75,1],[I(),I(-.4,0,-1.15),I(-.7,0,-1.5),I(-.35,0,-.7),I()]),
        (1,'translation',[0,.5,1],[[0,.55,0],[0,.68,0],[0,.55,0]]),
      ],
      'Win': [
        (1,'translation',[0,.3,.6,.9,1.2],[[0,.55,0],[0,.90,0],[0,.55,0],[0,.88,0],[0,.55,0]]),
        (4,'rotation',[0,.2,1.2],[I(),I(0,0,-1.65),I(0,0,-1.45)]),
        (7,'rotation',[0,.2,1.2],[I(),I(0,0,1.65),I(0,0,1.45)]),
      ],
      'Lose': [
        (2,'rotation',[0,.4,.8,1.2],[I(),I(.28,0,0),I(.48,0,0),I(.48,0,0)]),
        (3,'rotation',[0,.4,.8,1.2],[I(),I(.20,0,0),I(.48,0,0),I(.48,0,0)]),
        (1,'translation',[0,.5,1.2],[[0,.55,0],[0,.44,0],[0,.40,0]]),
      ],
    }

def global_rest():
    globals={0:np.eye(4,dtype=np.float32)}
    for node in JOINT_NODE_IDS:
        tr,_=REST_LOCAL[node]
        globals[node]=globals[PARENTS[node]]@T(*tr)
    return globals

COMP_FLOAT=5126; COMP_UBYTE=5121; COMP_USHORT=5123

def write_glb(char_id,cfg):
    pos,norm,col,joints,weights,indices=build_mesh(cfg)
    binary=bytearray(); bufferViews=[]; accessors=[]
    def align4():
        while len(binary)%4: binary.append(0)
    def add_blob(data,target=None):
        align4(); off=len(binary); binary.extend(data); align4(); idx=len(bufferViews); v={'buffer':0,'byteOffset':off,'byteLength':len(data)}
        if target: v['target']=target
        bufferViews.append(v); return idx
    def add_accessor(data,component,type_name,count,components,target=None,minv=None,maxv=None,fmt='f'):
        flat=[]
        if components==1: flat=list(data)
        else:
            for x in data: flat.extend(x)
        if component==COMP_FLOAT: raw=struct.pack('<'+'f'*len(flat),*map(float,flat))
        elif component==COMP_UBYTE: raw=struct.pack('<'+'B'*len(flat),*map(int,flat))
        elif component==COMP_USHORT: raw=struct.pack('<'+'H'*len(flat),*map(int,flat))
        else: raise ValueError(component)
        bv=add_blob(raw,target); a={'bufferView':bv,'componentType':component,'count':count,'type':type_name}
        if minv is not None:a['min']=minv
        if maxv is not None:a['max']=maxv
        ai=len(accessors);accessors.append(a);return ai
    parr=np.asarray(pos,np.float32)
    a_pos=add_accessor(pos,COMP_FLOAT,'VEC3',len(pos),3,34962,parr.min(0).tolist(),parr.max(0).tolist())
    a_norm=add_accessor(norm,COMP_FLOAT,'VEC3',len(norm),3,34962)
    a_col=add_accessor(col,COMP_FLOAT,'VEC4',len(col),4,34962)
    a_joints=add_accessor(joints,COMP_UBYTE,'VEC4',len(joints),4,34962)
    a_weights=add_accessor(weights,COMP_FLOAT,'VEC4',len(weights),4,34962)
    a_idx=add_accessor(indices,COMP_USHORT,'SCALAR',len(indices),1,34963,[int(min(indices))],[int(max(indices))])
    # inverse bind matrices
    gr=global_rest(); ibms=[]
    for node in JOINT_NODE_IDS:
        inv=np.linalg.inv(gr[node]).astype(np.float32)
        ibms.append(inv.T.reshape(-1).tolist()) # glTF flat column-major from row-major numpy -> transpose
    a_ibm=add_accessor(ibms,COMP_FLOAT,'MAT4',len(ibms),16)

    nodes=[
      {'name':'CharacterRoot','mesh':0,'skin':0,'children':[1]},
      {'name':'Hips','translation':REST_LOCAL[1][0],'children':[2,5,6]},
      {'name':'Spine','translation':REST_LOCAL[2][0],'children':[3,4,7]},
      {'name':'Head','translation':REST_LOCAL[3][0]},
      {'name':'LeftArm','translation':REST_LOCAL[4][0]},
      {'name':'LeftLeg','translation':REST_LOCAL[5][0]},
      {'name':'RightLeg','translation':REST_LOCAL[6][0]},
      {'name':'RightArm','translation':REST_LOCAL[7][0]},
    ]
    anims=[]
    for name,tracks in animation_specs().items():
        samplers=[];channels=[]
        for node,path,times,values in tracks:
            a_t=add_accessor(times,COMP_FLOAT,'SCALAR',len(times),1,None,[min(times)],[max(times)])
            comps=4 if path=='rotation' else 3
            a_v=add_accessor(values,COMP_FLOAT,'VEC4' if comps==4 else 'VEC3',len(values),comps)
            si=len(samplers);samplers.append({'input':a_t,'output':a_v,'interpolation':'LINEAR'})
            channels.append({'sampler':si,'target':{'node':node,'path':path}})
        anims.append({'name':name,'samplers':samplers,'channels':channels})

    gltf={
      'asset':{'version':'2.0','generator':'ComePlayers CRWT23 Character Generator'},
      'scene':0,'scenes':[{'nodes':[0]}],
      'nodes':nodes,
      'meshes':[{'name':cfg['name']+'Mesh','primitives':[{'attributes':{'POSITION':a_pos,'NORMAL':a_norm,'COLOR_0':a_col,'JOINTS_0':a_joints,'WEIGHTS_0':a_weights},'indices':a_idx,'mode':4}]}],
      'skins':[{'name':cfg['name']+'Rig','inverseBindMatrices':a_ibm,'joints':JOINT_NODE_IDS,'skeleton':1}],
      'animations':anims,
      'buffers':[{'byteLength':len(binary)}],
      'bufferViews':bufferViews,'accessors':accessors,
      'extras':{'crwtCharacterId':char_id,'clips':['Idle','Walk','Jump','Skill','Win','Lose'],'lod':'production-placeholder'}
    }
    js=json.dumps(gltf,separators=(',',':')).encode('utf-8')
    while len(js)%4: js+=b' '
    while len(binary)%4: binary.append(0)
    total=12+8+len(js)+8+len(binary)
    out=bytearray(struct.pack('<4sII',b'glTF',2,total))
    out+=struct.pack('<I4s',len(js),b'JSON')+js
    out+=struct.pack('<I4s',len(binary),b'BIN\x00')+binary
    path=OUT/f'{char_id}.glb'; path.write_bytes(out)
    return path,len(pos),len(indices),len(out)

manifest={'version':1,'pipeline':'CRWT23','format':'glTF 2.0 / GLB','characters':{}}
for cid,cfg in CHARS.items():
    p,v,i,s=write_glb(cid,cfg)
    manifest['characters'][cid]={
      'name':cfg['name'],'file':f'glb/{cid}.glb','scale':0.38,'groundOffset':0.06,
      'clips':{'idle':'Idle','walk':'Walk','jump':'Jump','skill':'Skill','win':'Win','lose':'Lose'},
      'vertices':v,'indices':i,'bytes':s,'fallback':'procedural'
    }
(ROOT/'assets'/'characters'/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print(json.dumps(manifest,indent=2))
