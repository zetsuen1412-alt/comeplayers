exec(open(__file__.replace('inspect_cup_projection.py','inspect.py')).read().replace("pathlib.Path(__file__).resolve().parents[3]","pathlib.Path(__file__).resolve().parents[3]"))
from PIL import ImageDraw
canvas=Image.new('RGB',(1200,700),'white');draw=ImageDraw.Draw(canvas)
for panel,side,c,n in zip([0,1],[-1,1],[[-.202,.259,.058],[.164,.259,.091]],[[-.94,0,.34],[.75,0,.66]]):
 n=np.array(n);n/=np.linalg.norm(n);u=np.cross([0,1,0],n);q=v-np.array(c);roi=(v[:,0]*side>.13)&(v[:,1]>.20)&(v[:,1]<.315)&(v[:,2]>.01)
 for grid in range(-5,6):
  draw.line((300+600*panel+grid*50,50,300+600*panel+grid*50,650),fill='#dddddd');draw.line((50+600*panel,350+grid*50,550+600*panel,350+grid*50),fill='#dddddd')
 for xx,yy,rgb in zip(q[roi]@u,q[roi,1],col[roi]):
  x,y=300+600*panel+xx*5000,350-yy*5000;draw.ellipse((x-4,y-4,x+4,y+4),fill=tuple(map(int,rgb)))
 draw.text((100+600*panel,15),'Source cup projected vertices '+str(side),fill='black')
canvas.save(pathlib.Path(__file__).parent/'source-cup-geometry.png')
