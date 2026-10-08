"""Small standard-library integrity helpers shared by the HIGH source tools."""
import sys
sys.dont_write_bytecode=True
import hashlib,json,pathlib,subprocess,os
BASELINE_INVENTORY_SHA='cf73d4b043a7a7beb6da2ceef6c41c6cd9c92481604b8c47a13d5c3a667b3b02'
SOURCE_SCHEMA='crwt.alexia_high_visual_source_inventory.v1'
LAYOUT_SCHEMA='crwt.alexia_high_visual_source_layout.v1'
PAYLOAD_SCHEMA='crwt.alexia_high_visual_source_payload.v1'
PART_BYTES=22_000_000
def need(ok,message):
 if not ok:raise ValueError(message)
def safe(name):
 need(isinstance(name,str) and name and '\\' not in name and ':' not in name and not any(ord(c)<32 for c in name),'Unsafe relative path')
 p=pathlib.PurePosixPath(name);need(not p.is_absolute() and all(x not in ('','.','..') and not x.endswith((' ','.')) for x in name.split('/')),'Unsafe path: '+name)
 forbidden={'con','prn','aux','nul',*[f'com{i}'for i in range(1,10)],*[f'lpt{i}'for i in range(1,10)]}
 need(all(x.split('.')[0].casefold() not in forbidden for x in p.parts),'Unsafe Windows path')
 need(not any(x in {'.git','__pycache__','node_modules'}for x in p.parts) and p.suffix.lower() not in {'.pyc','.pyo'},'Generated/repository file in payload')
 return name.casefold()
def hashes(raw):return {'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'git_blob_sha1':hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()}
def scan(root):
 result={};keys=set()
 for p in sorted(root.rglob('*')):
  need(not p.is_symlink() and not getattr(p,'is_junction',lambda:False)(),'Links are not regular payload')
  if not p.is_file():continue
  name=p.relative_to(root).as_posix();key=safe(name);need(key not in keys,'Case-colliding file');keys.add(key);result[name]=hashes(p.read_bytes())
 return result
def json_read(path):return json.loads(path.read_bytes())
def write_json(path,value):
 path.parent.mkdir(parents=True,exist_ok=True);path.open('x',encoding='utf-8').write(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
def fresh(path,*protected):
 path=path.resolve();need(not path.exists(),'Fresh destination required: '+str(path))
 for q in protected:
  q=q.resolve();need(not path.is_relative_to(q) and not q.is_relative_to(path),'Destination overlaps an input')
 return path
def command(argv,label):
 env=None
 if os.name=='nt' and len(argv)>2 and pathlib.Path(str(argv[2])).suffix=='.py':
  directory=str(pathlib.Path(str(argv[2])).resolve().parent);prefix=chr(92)*2+'?'+chr(92)
  extended=directory if directory.startswith(prefix)else prefix+('UNC'+directory[1:] if directory.startswith(chr(92)*2)else directory)
  env=os.environ.copy();env['PYTHONPATH']=extended+(os.pathsep+env['PYTHONPATH'] if env.get('PYTHONPATH')else '')
 r=subprocess.run([str(x)for x in argv],capture_output=True,env=env)
 need(r.returncode==0,label+' failed: '+(r.stdout+r.stderr).decode('utf-8',errors='replace')[-4500:]);return {'check':label,'passed':True}
def source_pins(root):
 doc=json_read(root/'source-inventory.json');need(doc['schema']==SOURCE_SCHEMA and doc['approved'] is False and doc['gameIntegrated'] is False,'HIGH source inventory schema/flags')
 rows=doc['files'];expected={};seen=set()
 for row in rows:
  key=safe(row['path']);need(key not in seen and row['path']!='source-inventory.json' and row['mode']=='100644','Source inventory duplicate/self/mode');seen.add(key);expected[row['path']]={k:row[k]for k in ('bytes','sha256','git_blob_sha1')}
 actual=scan(root);ipin=actual.pop('source-inventory.json');need(actual==expected,'Full HIGH source file inventory differs');return expected,ipin
def baseline_restore(baseline,output,expected_sha=BASELINE_INVENTORY_SHA):
 need(hashes((baseline/'source-inventory.json').read_bytes())['sha256']==expected_sha,'Frozen baseline inventory differs')
 command([sys.executable,'-B',baseline/'tools/restore_side_quality.py','--source',baseline,'--out-dir',output],'frozen sibling baseline restore')
 return output
def baseline_catalog(baseline,expected_sha=BASELINE_INVENTORY_SHA):
 need(hashes((baseline/'source-inventory.json').read_bytes())['sha256']==expected_sha,'Baseline inventory SHA differs')
 d=json_read(baseline/'review-payload.json');return {r['path']:{k:r[k]for k in ('bytes','sha256')}for r in d['files']}
