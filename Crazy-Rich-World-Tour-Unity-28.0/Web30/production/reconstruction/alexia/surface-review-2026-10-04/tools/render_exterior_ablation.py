"""Measure finite visible changes in an exterior-island ablation review variant.

All edits remain candidates. Pixel changes must lie on the projected removed
islands in each finite view; this does not establish source/design fidelity.
"""
import argparse,hashlib,json,pathlib,sys
ROOT=pathlib.Path(__file__).resolve().parent
import numpy as np
from PIL import Image,ImageDraw
from render_glb_islands import read_geometry,Renderer,rotation_x,rotation_y
SOURCE_SHA='dae2b0784b190649e5ae69ef2854aa06798468d2244eb5982d61a759c0c54af0'

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('original',type=pathlib.Path)
    parser.add_argument('candidate',type=pathlib.Path)
    parser.add_argument('--expected-candidate-sha256',required=True)
    parser.add_argument('--out',required=True,type=pathlib.Path)
    args=parser.parse_args()
    raw,points,faces,normals,_,groups=read_geometry(args.original)
    other,other_points,other_faces,other_normals,_,other_groups=read_geometry(args.candidate)
    assert hashlib.sha256(raw).hexdigest()==SOURCE_SHA
    assert hashlib.sha256(other).hexdigest()==args.expected_candidate_sha256
    assert len(faces)==449164 and len(other_faces)==448252
    assert np.array_equal(points,other_points)
    used=np.unique(other_faces)
    assert np.array_equal(normals[used],other_normals[used])
    # All remaining triangles retain original order. Independent row-set check.
    kept={tuple(row) for row in other_faces.tolist()}
    removed=np.asarray([row for row in faces.tolist() if tuple(row) not in kept],dtype='i8')
    assert len(removed)==912
    assert np.array_equal(np.asarray([row for row in faces.tolist() if tuple(row) in kept]),other_faces)
    renderer=Renderer()
    colors=np.tile(np.array([.60,.63,.68]),(len(points),1))
    views=[('front',np.eye(3)),('three-quarter',rotation_x(10)@rotation_y(45)),('left',rotation_y(90)),('right',rotation_y(-90)),('back',rotation_y(180)),('top',rotation_x(90)),('bottom',rotation_x(-90))]
    views += [(f'orbit-{a:03d}',rotation_x(8)@rotation_y(a)) for a in range(0,360,10)]
    args.out.mkdir(parents=True,exist_ok=True)
    evidence=[]
    sheet=Image.new('RGB',(512*4,690*2),'#f8f9fb');draw=ImageDraw.Draw(sheet)
    back_panels=None
    for i,(name,rotation) in enumerate(views):
        before,_=renderer.render(points,faces,normals,colors,(512,640),rotation,bounds_points=points)
        after,_=renderer.render(other_points,other_faces,other_normals,colors,(512,640),rotation,bounds_points=points)
        islands,_=renderer.render(points,removed,normals,colors,(512,640),rotation,bounds_points=points)
        a,b,c=np.asarray(before),np.asarray(after),np.asarray(islands)
        diff=np.any(a!=b,axis=2)
        coverage=np.any(c!=c[0,0],axis=2)
        assert not np.any(diff & ~coverage),'Change outside projected removed islands'
        silhouette=np.any(a!=a[0,0],axis=2)^np.any(b!=b[0,0],axis=2)
        evidence.append({'view':name,'different_pixels':int(diff.sum()),'silhouette_changed_pixels':int(silhouette.sum()),'pixels_outside_removed_projection':int((diff&~coverage).sum()),'before_rgb_sha256':hashlib.sha256(a.tobytes()).hexdigest(),'after_rgb_sha256':hashlib.sha256(b.tobytes()).hexdigest()})
        if i<7:
            before.save(args.out/(name+'-before.png'));after.save(args.out/(name+'-after.png'))
            x,y=(i%4)*512,(i//4)*690;sheet.paste(after,(x,y))
            draw.text((x+12,y+654),f'{name}: {int(diff.sum())} changed pixels',fill='#1d2433')
        if name=='back':
            delta=Image.new('RGB',before.size,'#f8f9fb');delta_array=np.asarray(delta).copy();delta_array[diff]=[218,57,74]
            overlay=a.copy();overlay[diff]=[218,57,74]
            back_panels=[before,after,Image.fromarray(overlay),Image.fromarray(delta_array)]
    sheet.save(args.out/'exterior-candidate-seven-views.png')
    back=Image.new('RGB',(512*4,690),'#f8f9fb');d=ImageDraw.Draw(back)
    for i,(panel,label) in enumerate(zip(back_panels,['Before: interior cleanup','After: 3 exterior islands omitted','Changed pixels on before','Only changed pixels'])):
        back.paste(panel,(i*512,0));d.text((i*512+10,654),label,fill='#1d2433')
    back.save(args.out/'back-ablation-comparison.png')
    assert evidence[0]['different_pixels']==0,'Front changed: inspect before presenting'
    report={'status':'finite-exterior-ablation-review-only','source_sha256':SOURCE_SHA,'candidate_sha256':args.expected_candidate_sha256,'removed_faces':912,'retained_faces':448252,'position_pool_byte_equivalent':True,'retained_normals_identical':True,'retained_triangle_order_identical':True,'front_pixels_identical':True,'tested_views':43,'all_changes_within_removed_island_projection':True,'renderer':renderer.ctx.info.get('GL_RENDERER'),'size':[512,640],'views':evidence,'production_geometry_approved':False,'full_hair_repair':False,'limits':'Finite gray views. Exterior removal is a comparison variant, not proof of intended hairstyle. Main-component loops/eyes/hands/cuff remain.'}
    (args.out/'exterior-render-evidence.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8',newline='\n')
    renderer.ctx.release()
    print(json.dumps({k:report[k] for k in ('candidate_sha256','front_pixels_identical','tested_views','all_changes_within_removed_island_projection','renderer')}))

if __name__=='__main__':main()
