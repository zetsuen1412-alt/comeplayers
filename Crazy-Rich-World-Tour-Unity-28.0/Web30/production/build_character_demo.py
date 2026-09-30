"""Package the real-GLB viewer as one offline HTML, preserving every mesh byte."""
from pathlib import Path
import base64,json,re

def build(root:Path,output:Path)->None:
    source=(root/'character-demo.html').read_text()
    vendor=root/'vendor/three';cache={};active=set()
    pattern=re.compile(r'((?:from\s*|import\s*)[\x27\x22])([^\x27\x22]+)([\x27\x22])')
    def module(path:Path)->str:
        path=path.resolve()
        if not path.is_relative_to(vendor.resolve()):raise ValueError('Dependency outside pinned package')
        if path in cache:return cache[path]
        if path in active:raise ValueError('Cyclic relative module: '+str(path))
        active.add(path);text=path.read_text()
        def replace(m):
            dep=m.group(2)
            return m.group(1)+(module(path.parent/dep) if dep.startswith('.') else dep)+m.group(3)
        text=pattern.sub(replace,text)
        url='data:text/javascript;base64,'+base64.b64encode(text.encode()).decode()
        cache[path]=url;active.remove(path);return url
    paths={'three':'build/three.module.js','three/addons/controls/OrbitControls.js':'examples/jsm/controls/OrbitControls.js','three/addons/loaders/GLTFLoader.js':'examples/jsm/loaders/GLTFLoader.js','three/addons/environments/RoomEnvironment.js':'examples/jsm/environments/RoomEnvironment.js'}
    mapping={'imports':{k:module(vendor/v) for k,v in paths.items()}}
    source=re.sub(r'<script type="importmap">.*?</script>',lambda m:'<script type="importmap">'+json.dumps(mapping,separators=(',',':'))+'</script>',source,flags=re.S)
    old="await loader.loadAsync('./roster.glb',event=>{if(event.total)$('progress').firstElementChild.style.width=`${Math.round(event.loaded/event.total*100)}%`;})"
    new="await loader.parseAsync(Uint8Array.from(atob(document.getElementById('embedded-glb').textContent.trim()),c=>c.charCodeAt(0)).buffer,'')"
    if old not in source:raise ValueError('Viewer loading code changed; refusing partial conversion')
    source=source.replace(old,new).replace('Koneksi internet diperlukan untuk pustaka penampil.','Semua pustaka penampil sudah disertakan dalam file ini.')
    payload=base64.b64encode((root/'roster.glb').read_bytes()).decode()
    source=source.replace('<script type="module">','<script id="embedded-glb" type="application/octet-stream">'+payload+'</script>\n<script type="module">',1)
    guard="<script>window.addEventListener('error',function(e){var s=document.getElementById('status');if(s&&/WebGL|module|import|fetch/i.test(e.message||'')){s.classList.remove('hide');s.classList.add('error');s.textContent='Penampil 3D gagal dimuat: '+e.message;}});</script>"
    source=source.replace('</body>',guard+'</body>');output.write_text(source)
    assert (root/'roster.glb').read_bytes()==base64.b64decode(payload)
    print(json.dumps({'html_bytes':output.stat().st_size,'embedded_modules':len(cache),'glb_bytes':(root/'roster.glb').stat().st_size,'external_runtime_dependencies':False}))

if __name__=='__main__':
    import sys
    build(Path(sys.argv[1]),Path(sys.argv[2]))
