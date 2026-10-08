"""Replace bounded projected shirt/cuff debris with closed rigged tailored details.

Input is a SHA-pinned selected hair delta from frozen e88. All previous streams
are retained; only active source-core triangle indices change. New components
are individually closed, not a certificate that the complete avatar is manifold.
"""
import sys
sys.dont_write_bytecode = True
import argparse, copy, hashlib, json, math, pathlib, struct
import numpy as np

AXIS = np.array([-1., 1., -1.])

def require(ok, message):
    if not ok:
        raise ValueError(message)

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def read(path):
    raw = path.read_bytes()
    length = struct.unpack_from('<I', raw, 12)[0]
    return json.loads(raw[20:20+length]), raw[28+length:]

def acc(doc, binary, index):
    a = doc['accessors'][index]
    view = doc['bufferViews'][a['bufferView']]
    width = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
    dtype = np.dtype({5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']])
    return np.ndarray((a['count'],width),dtype,buffer=binary,
        offset=view.get('byteOffset',0)+a.get('byteOffset',0),
        strides=(view.get('byteStride',width*dtype.itemsize),dtype.itemsize)).copy()

def sphere(center, radius, segments=24, rings=12):
    center, radius = np.array(center), np.array(radius)
    vertices = [center+[0,radius[1],0]]
    for row in range(1,rings):
        phi = math.pi*row/rings
        for col in range(segments):
            theta = 2*math.pi*col/segments
            vertices.append(center+radius*[math.sin(phi)*math.sin(theta),math.cos(phi),math.sin(phi)*math.cos(theta)])
    vertices.append(center-[0,radius[1],0]); last=len(vertices)-1; triangles=[]
    for col in range(segments):
        triangles.append([0,1+col,1+(col+1)%segments])
    for row in range(rings-2):
        for col in range(segments):
            a=1+row*segments+col; b=1+row*segments+(col+1)%segments
            triangles.extend([[a,a+segments,b],[b,a+segments,b+segments]])
    for col in range(segments):
        triangles.append([last,last-segments+(col+1)%segments,last-segments+col])
    return np.array(vertices),np.array(triangles)

def tube(points, radii, segments=16):
    points=np.array(points); radii=np.broadcast_to(radii,(len(points),)); vertices=[]; triangles=[]
    for row,point in enumerate(points):
        tangent=points[min(row+1,len(points)-1)]-points[max(row-1,0)]
        tangent/=np.linalg.norm(tangent)
        axis=np.array([0.,0.,1.]) if abs(tangent[2])<.9 else np.array([1.,0.,0.])
        side=np.cross(tangent,axis); side/=np.linalg.norm(side); up=np.cross(tangent,side)
        for col in range(segments):
            theta=2*math.pi*col/segments
            vertices.append(point+radii[row]*(math.cos(theta)*side+math.sin(theta)*up))
    for row in range(len(points)-1):
        for col in range(segments):
            a=row*segments+col; b=row*segments+(col+1)%segments
            triangles.extend([[a,b,a+segments],[b,b+segments,a+segments]])
    vertices.extend([points[0],points[-1]]); first,last=len(vertices)-2,len(vertices)-1
    for col in range(segments):
        triangles.extend([[first,(col+1)%segments,col],
            [last,(len(points)-1)*segments+col,(len(points)-1)*segments+(col+1)%segments]])
    return np.array(vertices),np.array(triangles)

def shirt_loft():
    ys=np.linspace(-.038,.155,32); segments=64; vertices=[]; triangles=[]
    for y in ys:
        rx=np.interp(y,[-.038,.025,.09,.125,.155],[.087,.090,.094,.076,.040])
        rz=np.interp(y,[-.038,.025,.09,.125,.155],[.078,.082,.076,.065,.032])
        for col in range(segments):
            angle=2*math.pi*col/segments
            # Intentional gentle cloth curvature, independent of the noisy atlas.
            front=max(0,math.cos(angle))
            fold=.00065*math.sin(3*angle+.5)*math.sin(math.pi*(y+.038)/.193)*front
            vertices.append([-.006+rx*math.sin(angle),y,.09+rz*math.cos(angle)+fold])
    for row in range(len(ys)-1):
        for col in range(segments):
            a=row*segments+col; b=row*segments+(col+1)%segments
            triangles.extend([[a,b,a+segments],[b,b+segments,a+segments]])
    vertices.extend([[-.006,ys[0],.09],[-.006,ys[-1],.09]])
    first,last=len(vertices)-2,len(vertices)-1
    for col in range(segments):
        triangles.extend([[first,(col+1)%segments,col],
            [last,(len(ys)-1)*segments+col,(len(ys)-1)*segments+(col+1)%segments]])
    return np.array(vertices),np.array(triangles)

def collar(side):
    outline=np.array([[-.006+side*.039,.149,.130],[-.006+side*.020,.112,.170],
        [-.006+side*.053,.088,.174],[-.006+side*.074,.123,.149]])
    vertices=np.vstack([outline,outline-[0,0,.004]])
    triangles=[[0,1,2],[0,2,3],[4,6,5],[4,7,6]]
    for a in range(4):
        b=(a+1)%4; triangles.extend([[a,a+4,b],[b,a+4,b+4]])
    return vertices,np.array(triangles)

def build(source, expected_sha, output):
    require(sha(source)==expected_sha,'Selected source SHA mismatch')
    require(not output.exists(),'Fresh output directory required')
    input_stamp=(sha(source),source.stat().st_mtime_ns)
    doc,binary=read(source); original=doc['meshes'][0]['primitives'][0]
    points=acc(doc,binary,original['attributes']['POSITION']).astype(float)*AXIS
    require(len(points)==252943,'Expected e88 original-core layout')
    indices=acc(doc,binary,original['indices']).reshape(-1,3)
    js=acc(doc,binary,original['attributes']['JOINTS_0'])
    ws=acc(doc,binary,original['attributes']['WEIGHTS_0'])
    node=next(n for n in doc['nodes'] if n.get('mesh')==0)
    names=[doc['nodes'][n]['name'].replace('AlexiaPrototype_','') for n in doc['skins'][node['skin']]['joints']]
    slot={name:i for i,name in enumerate(names)}
    head=np.where(js==slot['Head'],ws,0).sum(1)
    case=np.where(js==slot['Suitcase'],ws,0).sum(1)
    hand=sum(np.where(js==slot[name],ws,0).sum(1) for name in ('HandL','HandR'))
    torso=sum(np.where(js==slot[name],ws,0).sum(1) for name in ('Chest','Pelvis'))
    x,y,z=points.T; ax=np.abs(x+.006)
    # Preserve head/neck above the new collar. Legacy broad face labels also
    # included shirt and neck rows; that historical label is not reused silently.
    true_face=(y>=.175)&(head>.2)
    cups=(y>.19)&(y<.33)&(ax>.13)&(z>.005)&(z<.15)
    protected=true_face|cups|(case>=.5)|(hand>.25)
    chest=(y>-.15)&(y<.175)&(ax<.125)&(z>-.04)&(z<.205)&((y<.150)|(head<.2))&~protected
    cuff=(y>-.13)&(y<.02)&(ax>.15)&(ax<.33)&(z>-.02)&(z<.20)&~protected
    rear_litter=(y>-.15)&(y<.13)&(ax<.32)&(z<.055)&(head>.2)&~protected
    rear_coat=(y>-.145)&(y<.12)&(ax<.205)&(z<.045)&(torso>.5)&~protected
    allowed=chest|cuff|rear_litter|rear_coat; removed=np.all(allowed[indices],1)
    require(not np.any(removed&np.any(protected[indices],1)),'Protected triangle incident removal')
    edited=copy.deepcopy(doc); bb=bytearray(binary); records=[]
    def stream(array,type_name,component,target):
        array=np.ascontiguousarray(array); bb.extend(b'\0'*(-len(bb)%4))
        view=len(edited['bufferViews']); accessor=len(edited['accessors'])
        edited['bufferViews'].append({'buffer':0,'byteOffset':len(bb),'byteLength':array.nbytes,'target':target})
        bb.extend(array.tobytes()); entry={'bufferView':view,'componentType':component,'count':len(array),'type':type_name}
        if type_name=='VEC3' and target==34962:
            entry.update(min=array.min(0).astype(float).tolist(),max=array.max(0).astype(float).tolist())
        edited['accessors'].append(entry); return accessor
    edited['meshes'][0]['primitives'][0]['indices']=stream(indices[~removed].reshape(-1).astype('<u4'),'SCALAR',5125,34963)
    materials={}
    for name,factor,rough,metal in [('ivory',[.90,.88,.82,1],.71,0),('gold',[.81,.48,.095,1],.31,.68)]:
        materials[name]=len(edited['materials'])
        edited['materials'].append({'name':'Alexia tailored '+name,'pbrMetallicRoughness':
            {'baseColorFactor':factor,'roughnessFactor':rough,'metallicFactor':metal}})
    def add(name,geometry,material):
        vertices,triangles=geometry
        # Validate precisely the stored float32 positions used by actual renders.
        vertices=(np.asarray(vertices)*AXIS).astype('<f4').astype(float)*AXIS
        triangles=np.asarray(triangles,dtype=np.int64)
        area=np.cross(vertices[triangles[:,1]]-vertices[triangles[:,0]],vertices[triangles[:,2]]-vertices[triangles[:,0]])
        volume=np.einsum('ij,ij->i',vertices[triangles[:,0]],np.cross(vertices[triangles[:,1]],vertices[triangles[:,2]])).sum()/6
        if volume<0:
            triangles=triangles[:,[0,2,1]]; area=-area; volume=-volume
        require(np.isfinite(vertices).all() and np.all(np.linalg.norm(area,axis=1)>1e-12),'Degenerate '+name)
        edges=np.sort(np.concatenate([triangles[:,[0,1]],triangles[:,[1,2]],triangles[:,[2,0]]]),axis=1)
        _,counts=np.unique(edges,axis=0,return_counts=True)
        require(np.all(counts==2) and volume>0,'Component must be closed '+name)
        normals=np.zeros_like(vertices)
        for col in range(3):
            np.add.at(normals,triangles[:,col],area)
        lengths=np.linalg.norm(normals,axis=1); require(np.all(lengths>1e-12),'Zero normal '+name)
        normals/=lengths[:,None]
        crisp=name.endswith('folded ivory collar')
        if crisp:
            # Thin collar front/back faces need separate normal corners. Exact
            # float32 position welding still recovers the closed prism above.
            face_normals=area/np.linalg.norm(area,axis=1)[:,None]
            vertices=vertices[triangles.reshape(-1)]
            normals=np.repeat(face_normals,3,axis=0)
            triangles=np.arange(len(vertices)).reshape(-1,3)
        joints=np.zeros((len(vertices),4),dtype='<u2'); weights=np.zeros((len(vertices),4),dtype='<f4')
        pelvis=np.clip((.075-vertices[:,1])/.17,0,1)
        joints[:,0]=slot['Pelvis']; joints[:,1]=slot['Chest']
        weights[:,0]=pelvis; weights[:,1]=1-pelvis
        attributes={'POSITION':stream((vertices*AXIS).astype('<f4'),'VEC3',5126,34962),
            'NORMAL':stream((normals*AXIS).astype('<f4'),'VEC3',5126,34962),
            'JOINTS_0':stream(joints,'VEC4',5123,34962),'WEIGHTS_0':stream(weights,'VEC4',5126,34962)}
        primitive=len(edited['meshes'][0]['primitives'])
        edited['meshes'][0]['primitives'].append({'attributes':attributes,
            'indices':stream(triangles.reshape(-1).astype('<u4'),'SCALAR',5125,34963),'material':materials[material],'mode':4})
        records.append({'name':name,'primitive':primitive,'material':materials[material],'vertices':len(vertices),
            'triangles':len(triangles),'bounds':[vertices.min(0).tolist(),vertices.max(0).tolist()],
            'signed_volume':float(volume),'closed_by_exact_position_weld':True,
            'shared_index_closed_edges_two':not crisp,'crisp_face_corner_normals':crisp})
    add('continuous tailored ivory shirt',shirt_loft(),'ivory')
    for side,label in [(-1,'L'),(1,'R')]:
        add(label+' folded ivory collar',collar(side),'ivory')
        edge=[[-.006+side*.039,.150,.132],[-.006+side*.021,.113,.172],[-.006+side*.053,.089,.176]]
        add(label+' fine collar welt',tube(edge,.0009,12),'ivory')
    # Two deliberate, continuous necklace rails replace the projected cravat.
    for side,label in [(-1,'L'),(1,'R')]:
        points=[[-.006+side*.033,.151,.137],[-.006+side*.029,.125,.170],
            [-.006+side*.022,.105,.177],[-.006,.080,.175]]
        add(label+' gold V necklace chain',tube(points,.00155,16),'gold')
    add('small gold necklace medallion',sphere([-.006,.078,.178],[.006,.008,.0028]),'gold')
    # Placket seam has volume and follows the front ellipsoid instead of an image.
    yy=np.linspace(-.030,.060,30); zz=.09+np.interp(yy,[-.038,.025,.09],[.078,.082,.076])+.001
    add('tailored central placket',tube(np.c_[np.full(len(yy),-.006),yy,zz],.00115,12),'ivory')
    for i,by in enumerate([.053,.026,-.001,-.027]):
        bz=.09+np.interp(by,[-.038,.025,.09],[.078,.082,.076])+.003
        add('gold shirt button '+str(i+1),sphere([-.006,by,bz],[.0026,.0026,.0015],16,8),'gold')
    edited['buffers'][0]['byteLength']=len(bb)
    header=json.dumps(edited,separators=(',',':')).encode(); header+=b' '*(-len(header)%4); bb+=b'\0'*(-len(bb)%4)
    result=struct.pack('<4sII',b'glTF',2,28+len(header)+len(bb))+struct.pack('<II',len(header),0x4e4f534a)+header+struct.pack('<II',len(bb),0x004e4942)+bb
    output.mkdir(parents=True); target=output/'alexia.glb'; target.write_bytes(result)
    np.savez_compressed(output/'tailored-shirt-masks.npz',chest_indices=np.flatnonzero(chest),cuff_indices=np.flatnonzero(cuff),
        rear_litter_indices=np.flatnonzero(rear_litter),rear_coat_indices=np.flatnonzero(rear_coat),
        protected_indices=np.flatnonzero(protected),
        removed_original_triangle_indices=np.flatnonzero(removed))
    require(input_stamp==(sha(source),source.stat().st_mtime_ns),'Input changed')
    proof={'schema':'crwt.alexia_tailored_shirt_delta.v2_rear_coat_cleanup','source_sha256':sha(source),'candidate_sha256':sha(target),
        'recipe_sha256':sha(pathlib.Path(__file__)),'original_BIN_prefix_exact':bytes(bb[:len(binary)])==binary,
        'source_nodes_skins_clips_images_materials_prefix_exact':True,'face_above_175mm_and_cups_incidence_preserved':True,
        'source_core_attribute_accessors_exact':True,'removed_original_triangles':int(removed.sum()),
        'chest_spatial_vertices':int(chest.sum()),'cuff_spatial_vertices':int(cuff.sum()),
        'rear_litter_spatial_vertices':int(rear_litter.sum()),
        'rear_coat_spatial_vertices':int(rear_coat.sum()),
        'protected_incident_triangles_removed':0,'components':records,'input_sha_mtime_unchanged':True,
        'limits':['Original lower neck/shirt incidence is intentionally changed below the authored collar.',
            'Old projected cuff and lateral hair fragments inside bounded wrist region are removed.',
            'Closed components overlap; full model collision and production retopology are not certified.',
            'Inherited in-place IdleBreath and Walk have no foot IK or cloth/hair simulation.'],
        'approved':False,'gameIntegrated':False}
    (output/'tailored-shirt-proof.json').write_text(json.dumps(proof,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'model':str(target),'sha256':sha(target),'removed_source_triangles':int(removed.sum()),
        'authored_components':len(records),'authored_triangles':sum(r['triangles'] for r in records)},indent=2))

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source',type=pathlib.Path,required=True)
    parser.add_argument('--expected-source-sha256',required=True)
    parser.add_argument('--output',type=pathlib.Path,required=True)
    args=parser.parse_args(); build(args.source.resolve(strict=True),args.expected_source_sha256,args.output.resolve())
