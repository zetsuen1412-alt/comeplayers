from pathlib import Path
HERE = Path(__file__).resolve().parent
source = (HERE / 'build_polished_hair.py').read_text(encoding='utf-8')
start = source.index('def polished_guides(spec):')
end = source.index('def tangent_space(', start)
replacement = '''def polished_guides(spec):
 result=guides(spec)
 for i,guide in enumerate(result):
  cp=guide['points'].copy();side=-1. if np.median(cp[:,0])<-.006 else 1.
  if guide['name'].startswith('rear-wave'):
   # Broad lower overlap avoids deep comb gaps. Central strands descend into
   # short rounded ends; hooked side waves keep the shoulder silhouette.
   xbase=np.linspace(-.188,.188,6)[i];phase=guide['phase']
   ts=np.linspace(0,1,len(cp))
   for k in range(len(cp)):
    blend=float(smooth(.23,.025,cp[k,1]))
    target=-.006+xbase*.98+.018*math.sin(2*math.pi*ts[k]+phase)
    cp[k,0]=cp[k,0]*(1-blend)+target*blend
   if i in (1,2,3,4):
    stagger=[-.005,.008,.001,-.007][i-1]
    cp[-3:,1]=np.array([.024,-.010,-.042])+stagger
    cp[-3:,2]=np.array([-.181,-.187,-.181])
    cp[-2:,0]=[-.006+xbase*.98,-.006+xbase*.96]
   else:
    cp[-1,1]+=.010;cp[-1,0]-=side*.015
   guide['taper_start']=.78
  else:
   cp[-3,0]+=side*(.009+.003*math.sin(i*1.7))
   cp[-2,0]-=side*.008
   cp[-1,0]-=side*(.022+.005*math.cos(i))
   cp[-1,1]+=.012+.004*math.sin(i*1.9)
   cp[-1,2]-=.008
  guide['points']=cp
 for side in [-1,1]:
  x=np.array([.108,.126,.143,.151,.159,.166])
  y=np.array([.450,.431,.404,.376,.349,.327])
  z=np.array([.111,.134,.154,.158,.136,.108])
  result.append({'name':'temple-fringe-'+('minus' if side<0 else 'plus'),
    'points':np.column_stack((-.006+side*x,y,z)), 'width':.027,
    'depth_axis':np.array([0.,0.,1.]), 'phase':.3,
    'taper_start':.54, 'temple_fringe':True})
 return result

'''
source = source[:start] + replacement + source[end:]
source = source.replace('*(1-.995*smooth(.63,1,t))', "*(1-.995*smooth(guide.get('taper_start',.63),1,t))")
old = "q,n,u,f,r=sheet(guide,spec);parts.append((q,n,u,colors(q,n,spec,False),f));records.append(r)"
new = "local_spec=dict(spec)\n  if guide.get('temple_fringe'):local_spec.update(half_depth=.009,color_gamma=[.865,.802,.953])\n  q,n,u,f,r=sheet(guide,local_spec);parts.append((q,n,u,colors(q,n,local_spec,False),f));records.append(r)"
assert old in source
source = source.replace(old,new)
source = source.replace('crwt.alexia.high_polish_hair.v1','crwt.alexia.high_polish_hair.v2_integrated_lower_and_temples')
source = source.replace('authored cap and sixteen rounded waves','authored cap, sixteen rounded waves and two tapered temple fringes')
source = source.replace('Alexia polished rounded lavender waves Oct8','Alexia polished rounded lavender waves and temple fringes Oct8')
source = source.replace("'closed_components':len(records)", "'temple_fringe_components':2,'temple_fringe_occludes_source_black_hair_only_by_actual_review':True,'central_rear_shortened_round_tips':True,'closed_components':len(records)")
out = HERE / 'build_polished_hair_v2.py'
assert not out.exists()
compile(source,str(out),'exec')
out.write_bytes(source.encode('utf-8'))
print(out)
