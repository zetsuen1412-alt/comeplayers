"""Author smooth coat, cuff, shoe and suitcase surfaces with preserved source rig.

Explicit source permits composition with a separately reviewed hair replacement.
This is a visual trial, not a selected checkpoint or universal topology certificate.
"""
import sys
sys.dont_write_bytecode=True
import argparse,copy,hashlib,json,math,pathlib,struct
import numpy as np

AXIS=np.array([-1.,1.,-1.])
def require(ok,msg):
    if not ok:raise ValueError(msg)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def acc(d,b,k):
    a=d['accessors'][k];v=d['bufferViews'][a['bufferView']];width={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']];dt=np.dtype({5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']])
    return np.ndarray((a['count'],width),dt,buffer=b,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',width*dt.itemsize),dt.itemsize)).copy()
def sphere(center,radius,segments=40,rings=18):
    v=[np.array(center)+[0,radius[1],0]]
    for row in range(1,rings):
        phi=math.pi*row/rings
        for col in range(segments):
            theta=2*math.pi*col/segments
            v.append(np.array(center)+np.array([math.sin(phi)*math.sin(theta),math.cos(phi),math.sin(phi)*math.cos(theta)])*radius)
    v.append(np.array(center)-[0,radius[1],0]);last=len(v)-1;t=[]
    for col in range(segments):t.append([0,1+col,1+(col+1)%segments])
    for row in range(rings-2):
        for col in range(segments):
            a=1+row*segments+col;b=1+row*segments+(col+1)%segments;c=a+segments;e=b+segments
            t.extend([[a,c,b],[b,c,e]])
    for col in range(segments):t.append([last,last-segments+(col+1)%segments,last-segments+col])
    return np.asarray(v),np.asarray(t)
def rounded_box(center,size,radius,grid=10):
    center=np.asarray(center);half=np.asarray(size)/2;inner=half-radius;v=[];t=[];lookup={}
    for fixed in range(3):
        free=[k for k in range(3) if k!=fixed]
        for sign in (-1,1):
            ids=[]
            for iy in range(grid+1):
                for ix in range(grid+1):
                    p=np.zeros(3);p[fixed]=sign*half[fixed];p[free[0]]=(2*ix/grid-1)*half[free[0]];p[free[1]]=(2*iy/grid-1)*half[free[1]]
                    q=np.clip(p,-inner,inner);delta=p-q;p=center+q+delta/np.linalg.norm(delta)*radius
                    key=tuple(np.round(p,12));idx=lookup.get(key)
                    if idx is None:idx=len(v);lookup[key]=idx;v.append(p)
                    ids.append(idx)
            for iy in range(grid):
                for ix in range(grid):
                    a=ids[iy*(grid+1)+ix];b=ids[iy*(grid+1)+ix+1];c=ids[(iy+1)*(grid+1)+ix];e=ids[(iy+1)*(grid+1)+ix+1]
                    for tri in ([a,b,c],[b,e,c]):
                        if np.dot(np.cross(np.array(v[tri[1]])-v[tri[0]],np.array(v[tri[2]])-v[tri[0]]),np.array(v)[tri].mean(0)-center)<0:tri.reverse()
                        t.append(tri)
    return np.asarray(v),np.asarray(t)
def tube(points,radii,segments=24):
    points=np.asarray(points);radii=np.broadcast_to(radii,(len(points),));v=[]
    for row,p in enumerate(points):
        tangent=points[min(row+1,len(points)-1)]-points[max(row-1,0)];tangent/=np.linalg.norm(tangent)
        axis=np.array([0.,0.,1.]) if abs(tangent[2])<.9 else np.array([1.,0.,0.]);side=np.cross(tangent,axis);side/=np.linalg.norm(side);up=np.cross(tangent,side)
        for col in range(segments):
            theta=2*math.pi*col/segments;v.append(p+radii[row]*(math.cos(theta)*side+math.sin(theta)*up))
    t=[]
    for row in range(len(points)-1):
        for col in range(segments):
            a=row*segments+col;b=row*segments+(col+1)%segments;c=a+segments;e=b+segments;t.extend([[a,b,c],[b,e,c]])
    v.extend([points[0],points[-1]]);first,last=len(v)-2,len(v)-1
    for col in range(segments):t.extend([[first,(col+1)%segments,col],[last,(len(points)-1)*segments+col,(len(points)-1)*segments+(col+1)%segments]])
    return np.asarray(v),np.asarray(t)
def coat_panel(side):
    ny,nt=20,36;v=[]
    ys=np.linspace(-.15,.116,ny+1);angles=np.linspace(math.radians(39),math.pi,nt+1)*side
    for inner in (False,True):
        for y in ys:
            rx=np.interp(y,[-.15,-.035,.06,.116],[.159,.127,.132,.111]);rz=np.interp(y,[-.15,-.035,.06,.116],[.083,.076,.095,.073]);thick=.005 if inner else 0
            for theta in angles:v.append([-.006+(rx-thick)*math.sin(theta),y,.055+(rz-thick)*math.cos(theta)])
    block=(ny+1)*(nt+1);t=[]
    for layer in (0,1):
        for row in range(ny):
            for col in range(nt):
                a=layer*block+row*(nt+1)+col;b=a+1;c=a+nt+1;e=c+1
                t.extend([[a,b,c],[b,e,c]] if layer==0 else [[a,c,b],[b,c,e]])
    outline=[i for i in range(nt+1)]+[row*(nt+1)+nt for row in range(1,ny+1)]+[ny*(nt+1)+col for col in range(nt-1,-1,-1)]+[row*(nt+1) for row in range(ny-1,0,-1)]
    for i,a in enumerate(outline):b=outline[(i+1)%len(outline)];t.extend([[a,a+block,b],[b,a+block,b+block]])
    return np.asarray(v),np.asarray(t)
def star(center,outer=.038,inner=.018,depth=.006):
    center=np.asarray(center);outline=[]
    for i in range(10):
        theta=math.pi/2+i*math.pi/5;r=outer if i%2==0 else inner;outline.append([r*math.cos(theta),r*math.sin(theta),0])
    v=[center+np.asarray(p)+[0,0,-depth/2] for p in outline]+[center+np.asarray(p)+[0,0,depth/2] for p in outline]+[center+[0,0,-depth/2],center+[0,0,depth/2]];t=[]
    for i in range(10):j=(i+1)%10;t.extend([[20,j,i],[21,10+i,10+j],[i,j,10+i],[j,10+j,10+i]])
    return np.asarray(v),np.asarray(t)

def shoe_profile(footx,sole=False):
    zs=np.array([-.031,-.012,.015,.045,.071,.092,.118,.15,.185,.214,.234])
    widths=np.array([.026,.044,.048,.048,.050,.059,.065,.066,.060,.046,.021])
    tops=np.array([-.361,-.333,-.316,-.310,-.311,-.345,-.374,-.391,-.401,-.409,-.420])
    bottoms=np.array([-.431,-.434,-.435,-.435,-.435,-.435,-.435,-.435,-.434,-.432,-.429])
    zgrid=np.linspace(zs[0],zs[-1],54);v=[];seg=40
    for z in zgrid:
        width=np.interp(z,zs,widths);top=np.interp(z,zs,tops);bottom=np.interp(z,zs,bottoms)
        if sole:width+=.002;top=-.4305;bottom=-.4445
        for col in range(seg):
            th=2*math.pi*col/seg;sn=math.sin(th);cs=math.cos(th)
            xx=width*np.sign(sn)*abs(sn)**.78;yy=(top+bottom)/2+(top-bottom)/2*np.sign(cs)*abs(cs)**.78
            v.append([footx+xx,yy,z])
    t=[]
    for row in range(len(zgrid)-1):
        for col in range(seg):
            a=row*seg+col;b=row*seg+(col+1)%seg;c=a+seg;e=b+seg;t.extend([[a,b,c],[b,e,c]])
    v.extend([[footx,(v[0][1]+v[seg//2][1])/2,zgrid[0]],[footx,(v[-seg][1]+v[-seg//2][1])/2,zgrid[-1]]]);first,last=len(v)-2,len(v)-1
    for col in range(seg):t.extend([[first,(col+1)%seg,col],[last,(len(zgrid)-1)*seg+col,(len(zgrid)-1)*seg+(col+1)%seg]])
    return np.asarray(v),np.asarray(t)
def shoe_surface(footx,xx,z):
    zs=np.array([-.031,-.012,.015,.045,.071,.092,.118,.15,.185,.214,.234]);widths=np.array([.026,.044,.048,.048,.050,.059,.065,.066,.060,.046,.021]);tops=np.array([-.361,-.333,-.316,-.310,-.311,-.345,-.374,-.391,-.401,-.409,-.420]);bottoms=np.array([-.431,-.434,-.435,-.435,-.435,-.435,-.435,-.435,-.434,-.432,-.429]);rx=np.interp(z,zs,widths);top=np.interp(z,zs,tops);bottom=np.interp(z,zs,bottoms)
    sn=np.clip(abs(xx)/rx,0,.98)**(1/.78);cs=np.sqrt(1-sn*sn);return (top+bottom)/2+(top-bottom)/2*cs**.78
def shorts_leg(side):
    ys=np.linspace(-.067,-.154,14);seg=40;v=[]
    for y in ys:
        u=(y+.067)/(-.087);rx=.071-u*.015;rz=.092-u*.010
        for c in range(seg):
            th=2*math.pi*c/seg;v.append([side*.071+rx*math.sin(th),y,.060+rz*math.cos(th)])
    t=[]
    for row in range(len(ys)-1):
        for c in range(seg):
            a=row*seg+c;b=row*seg+(c+1)%seg;cc=a+seg;e=b+seg;t.extend([[a,b,cc],[b,e,cc]])
    v.extend([[side*.071,ys[0],.060],[side*.071,ys[-1],.060]]);first,last=len(v)-2,len(v)-1
    for c in range(seg):t.extend([[first,(c+1)%seg,c],[last,(len(ys)-1)*seg+c,(len(ys)-1)*seg+(c+1)%seg]])
    return np.asarray(v),np.asarray(t)
def waistband():
    seg=64;v=[]
    for rad in (0,.004):
        for yy in (-.059,-.039):
            for c in range(seg):
                th=2*math.pi*c/seg;v.append([-.006+(.132-rad)*math.sin(th),yy,.066+(.094-rad)*math.cos(th)])
    t=[]
    for c in range(seg):
        j=(c+1)%seg
        t.extend([[c,j,seg+c],[j,seg+j,seg+c],[2*seg+c,3*seg+c,2*seg+j],[2*seg+j,3*seg+c,3*seg+j],[c,2*seg+c,j],[j,2*seg+c,2*seg+j],[seg+c,seg+j,3*seg+c],[seg+j,3*seg+j,3*seg+c]])
    return np.asarray(v),np.asarray(t)

def build(source,mask_path,output):
    require(not output.exists(),'Fresh external output required')
    inputs={str(p):(sha(p),p.stat().st_mtime_ns) for p in (source,mask_path)}
    raw=source.read_bytes();n=struct.unpack_from('<I',raw,12)[0];d=json.loads(raw[20:20+n]);binary=raw[28+n:]
    core=d['meshes'][0]['primitives'][0];attrs=core['attributes'];local=acc(d,binary,attrs['POSITION']);require(len(local)==252943,'Known original core required')
    p=local.astype(float)*AXIS;color=acc(d,binary,attrs['COLOR_0']);old_indices=acc(d,binary,core['indices']).reshape(-1,3);rows=np.arange(len(p))
    frozen=np.load(mask_path);sets={k:np.isin(rows,frozen[k+'_indices']) for k in ('hair','cup','cuff','mandatory_face')}
    keys=np.ascontiguousarray(local,dtype='<f4').view(np.dtype((np.void,12))).reshape(-1);_,inverse=np.unique(keys,return_inverse=True);hair=np.isin(inverse,np.unique(inverse[sets['hair']]))
    node=next(n for n in d['nodes'] if n.get('mesh')==0);skin=d['skins'][node['skin']];names=[d['nodes'][k]['name'].replace('AlexiaPrototype_','') for k in skin['joints']]
    slot={name:i for i,name in enumerate(names)};j=acc(d,binary,attrs['JOINTS_0']);w=acc(d,binary,attrs['WEIGHTS_0']);sums={name:np.where(j==idx,w,0).sum(1) for name,idx in slot.items()}
    x,y,z=p.T;ax=np.abs(x+.006);head=sums['Head'];case=sums['Suitcase'];leg=sum(sums[s] for s in ('ThighL','ShinL','FootL','ThighR','ShinR','FootR'));arm=sum(sums[s] for s in ('UpperArmL','ForearmL','HandL','UpperArmR','ForearmR','HandR'))
    palms=(y>-.18)&(y<-.06)&(z>-.04)&(case<.1)&((ax>.195)|((ax>.155)&((sums['HandL']+sums['HandR']+sums['ForearmL']+sums['ForearmR'])>.3)))
    shirt=(y>-.04)&(y<.15)&(ax<.077)&(z>.061)&(head<.2)&(case<.1)
    legs=(y>-.34)&(y<-.153)&(ax>.008)&(ax<.155)&(leg>.5)&(case<.1)
    critical=sets['mandatory_face']|sets['cup']|hair|palms|shirt|legs
    cuff=(sets['cuff']|((y>-.10)&(y<-.004)&(ax>.177)&(ax<.295)&(z>.005)&(z<.16)&(arm>.5)&(head<.1)))&~critical&(case<.1)
    upper=(y>-.058)&(y<.145)&(ax>.066)&(ax<.33)&(z>-.07)&(z<.20)&(head<.1)&(case<.1)&~critical&~cuff
    lower=(y>-.17)&(y<-.025)&(ax>.108)&(ax<.29)&(z>-.11)&(z<.185)&(head<.1)&(case<.1)&~critical&~cuff
    shorts=(y>-.153)&(y<-.035)&(ax<.14)&(z>-.02)&(z<.17)&(head<.1)&(case<.1)&~critical&~cuff
    boots=(y<-.34)&(ax<.20)&(z>-.07)&(head<.1)&(case<.1)&~critical
    suitcase=(case>.9)&~critical
    masks={'coat':upper|lower,'cuffs':cuff,'shorts':shorts,'boots':boots,'suitcase':suitcase};allowed=np.logical_or.reduce(list(masks.values()));require(not (allowed&critical).any(),'Protected body contamination')
    painted=color.copy();palette={'coat':[.018,.022,.030],'cuffs':[.88,.89,.93],'shorts':[.013,.016,.022],'boots':[.85,.88,.93],'suitcase':[.025,.045,.085]}
    for name,selected in masks.items():painted[selected,:3]=palette[name]
    require(painted[:,3].tobytes()==color[:,3].tobytes() and painted[critical].tobytes()==color[critical].tobytes(),'Protected/alpha changed')
    # Remove only triangles whose three original vertices are in the authored part.
    remove_mask=masks['coat']|masks['cuffs']|masks['shorts']|masks['boots']|masks['suitcase'];remove=np.all(remove_mask[old_indices],1)
    require(not np.any(remove&np.any(critical[old_indices],1)),'Protected incident triangle removed')
    dd=copy.deepcopy(d);bb=bytearray(binary)
    def stream(array,type_name,component,target=None):
        array=np.ascontiguousarray(array);bb.extend(b'\0'*(-len(bb)%4));vi=len(dd['bufferViews']);ai=len(dd['accessors']);view={'buffer':0,'byteOffset':len(bb),'byteLength':array.nbytes}
        if target:view['target']=target
        dd['bufferViews'].append(view);bb.extend(array.tobytes());accessor={'bufferView':vi,'componentType':component,'count':len(array),'type':type_name}
        if type_name=='VEC3' and target==34962:accessor.update(min=array.min(0).astype(float).tolist(),max=array.max(0).astype(float).tolist())
        dd['accessors'].append(accessor);return ai
    dd['meshes'][0]['primitives'][0]['attributes']['COLOR_0']=stream(painted.astype('<f4'),'VEC4',5126,34962)
    dd['meshes'][0]['primitives'][0]['indices']=stream(old_indices[~remove].reshape(-1).astype('<u4'),'SCALAR',5125,34963)
    materials={}
    for name,factor,rough,metal in [('charcoal',[.028,.034,.046,1],.65,.0),('leather',[.022,.026,.034,1],.40,.06),('gold',[.73,.38,.055,1],.38,.65),('white',[.82,.85,.90,1],.60,.02),('navy',[.025,.055,.115,1],.32,.24),('rubber',[.012,.016,.023,1],.65,.02)]:
        materials[name]=len(dd['materials']);dd['materials'].append({'name':'Alexia authored '+name,'pbrMetallicRoughness':{'baseColorFactor':factor,'metallicFactor':metal,'roughnessFactor':rough}})
    records=[]
    def add(name,geometry,material,weights):
        v,t=geometry;v=np.asarray(v,float);t=np.asarray(t,int)
        area=np.cross(v[t[:,1]]-v[t[:,0]],v[t[:,2]]-v[t[:,0]])
        volume=np.einsum('ij,ij->i',v[t[:,0]],np.cross(v[t[:,1]],v[t[:,2]])).sum()/6
        if volume<0:t=t[:,[0,2,1]];area=-area;volume=-volume
        require(np.all(np.isfinite(v)) and np.all(np.linalg.norm(area,axis=1)>1e-12),'Invalid authored triangles '+name)
        normals=np.zeros_like(v)
        for col in range(3):np.add.at(normals,t[:,col],area)
        length=np.linalg.norm(normals,axis=1);require(np.all(length>1e-12),'Zero authored normal '+name);normals/=length[:,None]
        js=np.zeros((len(v),4),dtype='<u2');ws=np.zeros((len(v),4),dtype='<f4')
        if isinstance(weights,str):js[:,0]=slot[weights];ws[:,0]=1
        else:
            for col,(joint,val) in enumerate(weights(v)):js[:,col]=slot[joint];ws[:,col]=val
            ws/=ws.sum(1)[:,None]
        at={'POSITION':stream((v*AXIS).astype('<f4'),'VEC3',5126,34962),'NORMAL':stream((normals*AXIS).astype('<f4'),'VEC3',5126,34962),
            'JOINTS_0':stream(js,'VEC4',5123,34962),'WEIGHTS_0':stream(ws,'VEC4',5126,34962)}
        dd['meshes'][0]['primitives'].append({'attributes':at,'indices':stream(t.reshape(-1).astype('<u4'),'SCALAR',5125,34963),'material':materials[material],'mode':4})
        records.append({'name':name,'material':material,'vertices':len(v),'triangles':len(t),'world_bounds':[v.min(0).tolist(),v.max(0).tolist()],'signed_volume':float(volume)})
    bodyweights=lambda v:[('Pelvis',np.clip((.075-v[:,1])/.17,0,1)),('Chest',np.clip((v[:,1]+.095)/.17,0,1))]
    for side,label in [(-1,'L'),(1,'R')]:
        add('continuous '+label+' coat panel',coat_panel(side),'charcoal',bodyweights)
        yy=np.linspace(-.148,.114,24);rx=np.interp(yy,[-.15,-.035,.06,.116],[.159,.127,.132,.111]);rz=np.interp(yy,[-.15,-.035,.06,.116],[.083,.076,.095,.073]);theta=side*math.radians(39)
        edge=np.c_[-.006+rx*np.sin(theta),yy,.055+rz*np.cos(theta)+.002]
        add(label+' clean gold lapel rail',tube(edge,.0028,12),'gold',bodyweights)
        angles=np.linspace(side*math.radians(39),side*math.pi,32);hem=np.c_[-.006+.16*np.sin(angles),np.full(32,-.148),.055+.084*np.cos(angles)]
        add(label+' gold hem rail',tube(hem,.0026,12),'gold',bodyweights)
        start=np.array([side*.139,.073,.045]);elbow=np.array([side*.19,-.006,.075]);end=np.array([side*.221,-.054,.085]);points=np.vstack([np.linspace(start,elbow,9),np.linspace(elbow,end,8)[1:]])
        def sleeveweights(v,label=label):
            blend=np.clip((.025-v[:,1])/.08,0,1);return [('UpperArm'+label,1-blend),('Forearm'+label,blend)]
        add(label+' rounded shoulder join',sphere([side*.139,.070,.045],[.051,.043,.047],32,14),'charcoal',lambda v,label=label:[('Chest',np.full(len(v),.35)),('UpperArm'+label,np.full(len(v),.65))])
        add(label+' smooth sleeve',tube(points,np.linspace(.045,.037,len(points)),32),'charcoal',sleeveweights)
        cuffpoints=np.linspace(end,end+np.array([side*.008,-.02,.005]),5)
        add(label+' rolled white cuff',tube(cuffpoints,[.042,.049,.049,.049,.042],32),'white','Forearm'+label)
        add(label+' cuff gold seam',tube([cuffpoints[-1]+[0,.002,0],cuffpoints[-1]],[.045,.045],24),'gold','Forearm'+label)
        # Intentional reference cues on the authored coat, not projected noise.
        add(label+' leather epaulet base',rounded_box([side*.140,.107,.051],[.066,.012,.060],.005,6),'leather',sleeveweights)
        add(label+' gold epaulet',rounded_box([side*.140,.115,.051],[.053,.005,.052],.0022,6),'gold',sleeveweights)
        add(label+' shoulder badge backing',rounded_box([side*.184,.059,.064],[.008,.042,.043],.003,6),'leather',sleeveweights)
        badge_center=np.array([side*.190,.059,.064]);badge,bt=star([0,0,0],.016,.0075,.0025);badge=badge[:,[2,1,0]]*np.array([side,1,1])+badge_center
        add(label+' raised shoulder star',(badge,bt),'gold',sleeveweights)
        lapel=np.array([[side*.054,.124,.139],[side*.080,.076,.150],[side*.104,.045,.137],[side*.121,.112,.126]])
        lv=np.vstack([lapel,lapel-[0,0,.004]]);lt=np.array([[0,1,2],[0,2,3],[4,6,5],[4,7,6],[0,4,1],[1,4,5],[1,5,2],[2,5,6],[2,6,3],[3,6,7],[3,7,0],[0,7,4]])
        add(label+' folded leather lapel',(lv,lt),'leather',bodyweights)
        add(label+' lapel fine gold edge',tube(np.vstack([lapel,lapel[0]])+[0,0,.0015],.0014,10),'gold',bodyweights)
        for yy in (.054,.012,-.030):
            add(label+' raised coat button',sphere([side*.087,yy,.144],[.0038,.0038,.0024],16,8),'gold',bodyweights)
        add(label+' leather pocket flap',rounded_box([side*.125,-.105,.110],[.045,.027,.008],.003,6),'leather',bodyweights)
        add(label+' pocket gold piping',tube([[side*.104,-.092,.115],[side*.146,-.092,.115]],.0016,10),'gold',bodyweights)
        add(label+' pocket button',sphere([side*.125,-.101,.116],[.003,.003,.0018],16,8),'gold',bodyweights)
        def shortweights(v,label=label):
            blend=np.clip((-.095-v[:,1])/.08,0,.65);return [('Pelvis',1-blend),('Thigh'+label,blend)]
        add(label+' separate fitted shorts leg',shorts_leg(side),'charcoal',shortweights)
        hem_angles=np.linspace(0,2*math.pi,48);hem_path=np.c_[side*.071+.057*np.sin(hem_angles),np.full(48,-.1515),.06+.082*np.cos(hem_angles)]
        add(label+' shorts fine gold hem',tube(hem_path,.0015,10),'gold',shortweights)
        footx=side*.09
        add(label+' curved fitted sneaker sole',shoe_profile(footx,True),'white','Foot'+label)
        add(label+' authored tall sneaker upper',shoe_profile(footx),'white','Foot'+label)
        # A fitted closed black tongue follows the top surface from ankle to instep.
        tongue_z=np.linspace(.044,.155,24);tongue_x=np.linspace(-.025,.025,7);tv=[]
        for back in (False,True):
            for zz in tongue_z:
                for xx in tongue_x:tv.append([footx+xx,shoe_surface(footx,xx,zz)+(.002 if not back else .0002),zz])
        rows,cols=len(tongue_z),len(tongue_x);block=rows*cols;tt=[]
        for layer in (0,1):
            for r in range(rows-1):
                for c in range(cols-1):
                    a=layer*block+r*cols+c;b=a+1;cc=a+cols;e=cc+1;tt.extend([[a,b,cc],[b,e,cc]] if layer==0 else [[a,cc,b],[b,cc,e]])
        outline=list(range(cols))+[r*cols+cols-1 for r in range(1,rows)]+[(rows-1)*cols+c for c in range(cols-2,-1,-1)]+[r*cols for r in range(rows-2,0,-1)]
        for k,a in enumerate(outline):b=outline[(k+1)%len(outline)];tt.extend([[a,a+block,b],[b,a+block,b+block]])
        add(label+' fitted black tongue',(np.asarray(tv),np.asarray(tt)),'rubber','Foot'+label)
        for lace in range(4):
            for slope in (-1,1):
                lx=np.linspace(-.030,.030,15);lz=.086+lace*.019+slope*lx*.21;ly=np.array([shoe_surface(footx,xx,zz) for xx,zz in zip(lx,lz)])+.0042
                add(label+' white cross lace '+str(lace)+' '+str(slope),tube(np.c_[footx+lx,ly,lz],.0019,10),'white','Foot'+label)
        panel=np.array([[side*.052,-.351,.069],[side*.060,-.376,.122],[side*.063,-.399,.116],[side*.058,-.393,.077],[side*.046,-.376,.045]])
        panel[:,0]+=footx;pv=np.vstack([panel,panel+np.array([side*.0018,0,0])]);pt=[]
        for k in range(1,4):pt.extend([[0,k,k+1],[5,5+k+1,5+k]])
        for k in range(5):j=(k+1)%5;pt.extend([[k,j,5+k],[j,5+j,5+k]])
        add(label+' gold sneaker side panel',(pv,np.asarray(pt)),'gold','Foot'+label)
        guard_x=np.linspace(-.039,.039,20);guard_z=np.full(20,.212);guard_y=np.array([shoe_surface(footx,xx,.212) for xx in guard_x])+.001
        add(label+' subtle gold toe guard',tube(np.c_[footx+guard_x,guard_y,guard_z],.00135,10),'gold','Foot'+label)
    add('tailored black waist belt',waistband(),'leather','Pelvis')
    add('buckle black backing',rounded_box([-.006,-.049,.163],[.038,.023,.007],.0025,5),'leather','Pelvis')
    for xx in (-.025,.013):add('gold buckle vertical edge',rounded_box([xx,-.049,.170],[.004,.024,.005],.0015,4),'gold','Pelvis')
    for yy in (-.060,-.038):add('gold buckle horizontal edge',rounded_box([-.006,yy,.170],[.040,.004,.005],.0015,4),'gold','Pelvis')
    for xx in (-.095,-.065,-.035,.024,.054,.084):
        zz=.066+.094*math.sqrt(1-((xx+.006)/.132)**2)+.002
        add('belt gold eyelet',sphere([xx,-.049,zz],[.0018,.0018,.0014],12,6),'gold','Pelvis')
    add('rounded navy suitcase shell',rounded_box([.249,-.291,.075],[.144,.282,.156],.014,12),'navy','Suitcase')
    for xx in (.208,.290):
        add('suitcase gold vertical rail',tube([[xx,-.415,.156],[xx,-.167,.156]],.0036,16),'gold','Suitcase')
    add('raised gold star emblem',star([.249,-.284,.158]),'gold','Suitcase')
    for xx in (.194,.304):
        for zz in (.022,.127):add('suitcase wheel',sphere([xx,-.435,zz],[.010,.011,.010],20,10),'rubber','Suitcase')
    handle=[ [.219,-.151,.075],[.219,-.116,.075],[.279,-.116,.075],[.279,-.151,.075] ]
    add('suitcase rigid carry handle',tube(handle,.006,16),'rubber','Suitcase')
    dd['buffers'][0]['byteLength']=len(bb);js=json.dumps(dd,separators=(',',':')).encode();js+=b' '*(-len(js)%4);bb+=b'\0'*(-len(bb)%4)
    result=struct.pack('<4sII',b'glTF',2,28+len(js)+len(bb))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(bb),0x004e4942)+bb
    output.mkdir(parents=True);target=output/'alexia.glb';target.write_bytes(result)
    np.savez_compressed(output/'clean-garment-masks.npz',**{k+'_indices':np.flatnonzero(v) for k,v in masks.items()},protected_indices=np.flatnonzero(critical),geometric_palms_indices=np.flatnonzero(palms),removed_original_triangle_indices=np.flatnonzero(remove))
    require(inputs=={str(p):(sha(p),p.stat().st_mtime_ns) for p in (source,mask_path)},'Frozen source inputs changed')
    proof={'schema':'crwt.alexia_clean_garment_visual_trial.v4_profile_sneakers','visual_trial_only':True,'source_sha256':sha(source),'candidate_sha256':sha(target),'source_semantic_mask_sha256':sha(mask_path),
           'source_original_BIN_prefix_exact':True,'all_original_position_normal_UV_weights_skeleton_IBMs_clips_material_image_prefix_exact':True,
           'protected_face_hair_cup_shirt_palms_legskin_color_and_incident_triangles_exact':True,'source_alpha_exact':True,
           'color_region_vertices':{k:int(v.sum()) for k,v in masks.items()},'protected_vertices':int(critical.sum()),'geometric_palms_vertices':int(palms.sum()),
           'removed_original_triangles':int(remove.sum()),'new_components':records,'new_vertices':sum(r['vertices'] for r in records),'new_triangles':sum(r['triangles'] for r in records),
           'input_hash_mtime_unchanged':True,'recipe_sha256':sha(pathlib.Path(__file__)),'approved':False,'gameIntegrated':False,
           'limits':['This trial requires actual front/side/motion inspection before selection.','New garment segmentation and fit are authored approximations, not measured anatomical ground truth.','Manual inherited19-joint rig and in-place IdleBreath/Walk remain; no cloth simulation, foot IK or collision certification.','Protected original skin/face geometry remains, but new garment occlusion must be visually checked.']}
    (output/'clean-garment-proof.json').open('x',encoding='utf-8').write(json.dumps(proof,indent=2)+'\n')
    return {'candidate_sha256':sha(target),'candidate_path':str(target),'removed_original_triangles':int(remove.sum()),'new_vertices':proof['new_vertices'],'new_triangles':proof['new_triangles']}

if __name__=='__main__':
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--source',type=pathlib.Path,required=True);ap.add_argument('--semantic-mask',type=pathlib.Path,required=True);ap.add_argument('--output',type=pathlib.Path,required=True);a=ap.parse_args()
    print(json.dumps(build(a.source.resolve(strict=True),a.semantic_mask.resolve(strict=True),a.output.resolve()),indent=2))
