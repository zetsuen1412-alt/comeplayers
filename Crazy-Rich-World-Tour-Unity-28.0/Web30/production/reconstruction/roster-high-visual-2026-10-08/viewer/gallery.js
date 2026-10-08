const $ = id => document.getElementById(id);
const payload = JSON.parse($('payload').textContent);
const state = {ready: false, selected: null, mode: 'model', cameraView: 'front',
  errors: [], loadedIds: [], visualApproved: false, gameIntegrated: false};
window.CRWT_MODEL_REVIEW = state;
function message(text, error = false) { $('status').textContent = text; $('status').classList.toggle('error', error); }
function decode64(value) { const raw = atob(value); const bytes = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i); return bytes; }
async function modelBytes(metadata) {
  const packed = decode64(metadata.base64);
  if (metadata.encoding !== 'zlib') return packed;
  if (typeof DecompressionStream !== 'function') throw new Error('Browser belum mendukung model terkompresi. Buka file ini di Chrome atau Edge yang diperbarui.');
  const stream = new Blob([packed]).stream().pipeThrough(new DecompressionStream('deflate'));
  const result = new Uint8Array(await new Response(stream).arrayBuffer());
  if (result.byteLength !== metadata.bytes) throw new Error('Ukuran GLB tidak sesuai berkas sumber.');
  return result;
}
function dataImage(metadata) { return metadata ? 'data:' + metadata.mime + ';base64,' + metadata.base64 : ''; }
function moduleURL(source) { return URL.createObjectURL(new Blob([source], {type: 'text/javascript'})); }
function sourceText(key) { return new TextDecoder().decode(decode64(payload.vendor[key])); }

async function start() {
  const coreURL = moduleURL(sourceText('core'));
  const threeURL = moduleURL(sourceText('three').replaceAll("'./three.core.js'", JSON.stringify(coreURL)));
  const adapt = text => text.replaceAll("from 'three'", 'from ' + JSON.stringify(threeURL));
  const utilsURL = moduleURL(adapt(sourceText('utils')));
  const orbitURL = moduleURL(adapt(sourceText('orbit')));
  const loaderURL = moduleURL(adapt(sourceText('loader')).replaceAll("'../utils/BufferGeometryUtils.js'", JSON.stringify(utilsURL)));
  const [THREE, {OrbitControls}, {GLTFLoader}] = await Promise.all([import(threeURL), import(orbitURL), import(loaderURL)]);
  state.threeRevision = THREE.REVISION;
  const renderer = new THREE.WebGLRenderer({canvas: $('view'), antialias: true, powerPreference: 'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMappingExposure = 1;
  renderer.setClearColor('#111a27', 1);
  const scene = new THREE.Scene();
  const ambient = new THREE.HemisphereLight('#e5f2ff', '#626b7b', .65); scene.add(ambient);
  const key = new THREE.DirectionalLight('#fff3df', .65); key.position.set(-3, 5, 5); scene.add(key);
  const fill = new THREE.DirectionalLight('#b4d9f4', .35); fill.position.set(4, 2, 3); scene.add(fill);
  const rim = new THREE.DirectionalLight('#a9f1e7', .45); rim.position.set(-2, 3, -4); scene.add(rim);
  const grid = new THREE.GridHelper(5, 20, '#36556a', '#263748');
  grid.visible = false;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({color:'#cbd2de',roughness:1,metalness:0}));
  floor.rotation.x = -Math.PI/2; floor.receiveShadow = true; scene.add(floor);
  key.castShadow = true; key.shadow.mapSize.set(1024,1024); key.shadow.radius=8; key.shadow.intensity=.35;
  Object.assign(key.shadow.camera,{left:-2.5,right:2.5,top:2.5,bottom:-2.5,near:.1,far:20});
  key.shadow.bias = -.00007; key.shadow.normalBias = .008;
  scene.add(key.target);
  const LIGHTING_PROFILES = {"warm":{"label":"Key hangat \u00b7 rim dingin","background":"#e7edf3","floor":"#cbd2de","sky":"#fff5e8","ground":"#8892a3","ambient":1.55,"keyColor":"#fff0d9","key":3,"keyPosition":[-2,6.5,3],"fillColor":"#c5ddfa","fill":1.1,"fillPosition":[4,1.5,2.2],"rimColor":"#90bffd","rim":1.8,"rimPosition":[1.6,2.2,-3.6],"exposure":0.9},"balanced":{"label":"Studio seimbang","background":"#eef0f4","floor":"#d1d7e1","sky":"#f6fbff","ground":"#959cb0","ambient":1.8,"keyColor":"#fff8f0","key":2.6,"keyPosition":[-2.2,6,3.8],"fillColor":"#dfeaff","fill":1.3,"fillPosition":[3,2,4],"rimColor":"#e3ecff","rim":1.25,"rimPosition":[-2,3,-4],"exposure":0.9}};
  let lightingProfile = payload.defaultLightingProfile || 'balanced';
  $('lighting-profile').value = lightingProfile;
  for (const material of Array.isArray(grid.material) ? grid.material : [grid.material]) { material.transparent = true; material.opacity = .24; }
  scene.add(grid);
  const camera = new THREE.PerspectiveCamera(33, 1, .005, 100);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = .085; controls.autoRotateSpeed = .7;
  controls.minDistance = .4; controls.maxDistance = 20;
  const clock = new THREE.Clock();
  let active = null, container = null, mixer = null, radius = 1, token = 0, framingBounds = null, framingPoints = null;
  const originalMaterials = new Map(), grayMaterials = new Map();

  function actualRestVertexSamples(root) {
    root.updateMatrixWorld(true);
    const values=[],point=new THREE.Vector3();
    root.traverse(object => {
      if(!object.isMesh||!object.visible)return;
      object.skeleton?.update();
      const geometry=object.geometry,index=geometry.index,seen=new Set();
      const total=index?index.count:geometry.attributes.position.count;
      const start=geometry.drawRange.start||0,end=Math.min(total,start+(Number.isFinite(geometry.drawRange.count)?geometry.drawRange.count:total));
      for(let k=start;k<end;k++) {
        const vertex=index?index.getX(k):k;if(seen.has(vertex))continue;seen.add(vertex);
        object.getVertexPosition(vertex,point);point.applyMatrix4(object.matrixWorld);values.push(point.x,point.y,point.z);
      }
    });
    return new Float32Array(values);
  }
  function sampleBounds(points) {
    const box=new THREE.Box3(),p=new THREE.Vector3();
    for(let i=0;i<points.length;i+=3)box.expandByPoint(p.set(points[i],points[i+1],points[i+2]));
    return box;
  }

  function dispose(root, includePresentation = false) {
    const geometries = new Set(), materials = new Set(), textures = new Set(), images = new Set();
    root.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) if (material) materials.add(material);
    });
    if (includePresentation) {
      for (const value of originalMaterials.values()) for (const material of Array.isArray(value) ? value : [value]) if (material) materials.add(material);
      for (const material of grayMaterials.values()) materials.add(material);
      originalMaterials.clear(); grayMaterials.clear();
    }
    for (const material of materials) for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    for (const texture of textures) { if (texture.image) images.add(texture.image); texture.dispose(); }
    for (const image of images) image.close?.();
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
  }

  function applyPresentation() {
    const profile = LIGHTING_PROFILES[lightingProfile], clay = $('gray').checked;
    document.querySelector('.stage').dataset.character=state.selected||'';
    const alexia = state.selected==='alexia';
    $('lighting-profile').closest('.animation-box').hidden=!alexia;
    floor.visible=alexia; grid.visible=!alexia; key.castShadow=alexia;
    if (!alexia) {
      const baselineLit=state.selected==='rindi'||state.selected==='pip';
      renderer.toneMapping=baselineLit||clay?THREE.ACESFilmicToneMapping:THREE.NoToneMapping;
      renderer.toneMappingExposure=baselineLit||clay?1.1:1;
      renderer.setClearColor('#111a27',1);
      ambient.color.set('#e5f2ff');ambient.groundColor.set('#626b7b');ambient.intensity=baselineLit||clay?2.2:.65;
      key.color.set('#fff3df');key.position.set(-3,5,5);key.intensity=baselineLit||clay?3:.65;
      fill.color.set('#b4d9f4');fill.position.set(4,2,3);fill.intensity=baselineLit||clay?1.7:.35;
      rim.color.set('#a9f1e7');rim.position.set(-2,3,-4);rim.intensity=baselineLit||clay?2:.45;
      state.materialPresentation=clay?'lit-clay':baselineLit?'baseline-pbr':'reference-colors';
      state.toneMapping=baselineLit||clay?'ACESFilmic':'None';state.outputColorSpace='sRGB';state.presentationExposure=renderer.toneMappingExposure;
      state.realGeometryShadows=false;state.unlitToneMapBypass=false;state.lightingProfile='preserved-baseline';
      return;
    }
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = profile.exposure;
    renderer.setClearColor(profile.background,1);
    ambient.color.set(profile.sky); ambient.groundColor.set(profile.ground); ambient.intensity=profile.ambient;
    key.color.set(profile.keyColor); key.intensity=profile.key; key.position.fromArray(profile.keyPosition);
    fill.color.set(profile.fillColor); fill.intensity=profile.fill; fill.position.fromArray(profile.fillPosition);
    rim.color.set(profile.rimColor); rim.intensity=profile.rim; rim.position.fromArray(profile.rimPosition);
    floor.material.color.set(profile.floor);
    state.lightingProfile=lightingProfile; state.materialPresentation=clay?'lit-clay':'authored-materials';
    state.toneMapping='ACESFilmic'; state.outputColorSpace='sRGB'; state.presentationExposure=renderer.toneMappingExposure;
    state.realGeometryShadows=true; state.shadowFilter='PCF radius8'; state.shadowIntensity=.35; state.unlitToneMapBypass=true;
  }

  function present() {
    if (!active) return;
    applyPresentation();
    active.scene.traverse(object => {
      if (!object.isMesh) return;
      object.material = $('gray').checked ? grayMaterials.get(object.uuid) : originalMaterials.get(object.uuid);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) if (material) material.wireframe = $('wireframe').checked;
    });
    state.grayGeometry = $('gray').checked; state.wireframe = $('wireframe').checked;
  }

  function pose(name = 'front') {
    const directions = {front: [0, 0, 1], back: [0, 0, -1], left: [-1, 0, 0], right: [1, 0, 0], quarter: [.75, .18, 1]};
    const direction = new THREE.Vector3(...(directions[name] || directions.front)).normalize();
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),direction).normalize();
    const up = new THREE.Vector3().crossVectors(direction,right).normalize();
    let distance = radius;
    if (framingPoints) for (let i=0;i<framingPoints.length;i+=3) {
      const x=framingPoints[i],y=framingPoints[i+1],z=framingPoints[i+2];
      const depth=x*direction.x+y*direction.y+z*direction.z;
      const vertical=x*up.x+y*up.y+z*up.z,horizontal=x*right.x+y*right.y+z*right.z;
      distance=Math.max(distance,depth+Math.abs(vertical)/(tan*.84),depth+Math.abs(horizontal)/(tan*camera.aspect*.94));
    }
    if(state.selected!=='alexia')distance=radius/Math.sin(THREE.MathUtils.degToRad(camera.fov/2))/Math.min(1,camera.aspect)*1.06;
    state.cameraFit={method:state.selected==='alexia'?'projected-actual-rest-vertices':'preserved-baseline-sphere',vertexSamples:framingPoints?.length/3,verticalOccupancy:.84,horizontalOccupancy:.94,distance};
    controls.target.set(0, 0, 0); camera.position.copy(direction).multiplyScalar(distance); controls.update();
    state.cameraView = name;
    document.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === name)));
  }

  function resize() {
    const rect = $('viewport').getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    renderer.setSize(rect.width, rect.height, false); camera.aspect = rect.width/rect.height; camera.updateProjectionMatrix();
    if (state.ready && state.cameraView !== 'orbit') pose(state.cameraView);
  }

  function mode(value) {
    if (!['model', 'compare', 'reference'].includes(value)) return;
    state.mode = value;
    $('visual').classList.toggle('compare', value === 'compare');
    $('viewport').hidden = value === 'reference'; $('reference-pane').hidden = value === 'model';
    $('model-toolbar').hidden = value === 'reference';
    document.querySelectorAll('[data-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === value)));
    requestAnimationFrame(resize);
  }

  function reference(metadata) {
    const value = payload.references[metadata.id];
    $('reference-image').hidden = !value; $('reference-empty').hidden = Boolean(value);
    if (value) { $('reference-image').src = dataImage(value); $('reference-image').alt = 'Referensi desain 2D ' + metadata.name; }
    else $('reference-image').removeAttribute('src');
    state.referenceAvailable = Boolean(value);
  }

  function metadataInfo(metadata, actual) {
    $('faces').textContent = actual.faces.toLocaleString('id-ID');
    $('vertices').textContent = actual.vertices.toLocaleString('id-ID');
    $('textures').textContent = metadata.images ? metadata.images + ' gambar' : 'Tanpa tekstur';
    const animate = active.animations.length > 0;
    $('motion').textContent = animate ? active.animations.length + ' clip' : 'Statis';
    $('character-subtitle').textContent = animate ? (metadata.id === 'pip' ? 'Model koper · animasi mekanis tersedia' : 'Model 3D · animasi tulang prototipe') : 'Model 3D · pose statis';
    const details = $('source-details'); details.replaceChildren();
    for (const text of [metadata.filename, metadata.bytes.toLocaleString('id-ID') + ' byte · ' + metadata.skins + ' skin',
      state.sourceHashVerified ? 'SHA-256 sumber terverifikasi' : 'SHA-256 sumber tercatat dalam paket']) {
      const div = document.createElement('div'); div.textContent = text; details.appendChild(div);
    }
    const code = document.createElement('code'); code.textContent = metadata.sha256; details.appendChild(code);
    const note = document.createElement('div'); note.textContent = 'Statistik berasal dari mesh aktif. Normal tampilan dapat dihitung saat sumber tidak menyertakannya.'; details.appendChild(note);
  }

  function animation(name) {
    if (!active || !mixer) return;
    mixer.stopAllAction(); mixer.timeScale=1; state.animationPaused=false;
    const clip = active.animations.find(clip => clip.name === name);
    if (clip) { mixer.clipAction(clip).reset().setLoop(THREE.LoopRepeat, Infinity).play(); state.animation = clip.name; }
    else state.animation = null;
    $('animation').value = state.animation || '';
    message(state.animation ? 'Animasi aktif: ' + state.animation : 'Model 3D siap · pose statis.');
  }

  function setupAnimations(metadata) {
    const selector = $('animation'); selector.replaceChildren();
    const option = document.createElement('option'); option.value = ''; option.textContent = 'Pose statis'; selector.appendChild(option);
    const allowed = active.animations.length > 0;
    $('animation-box').hidden = !allowed;
    document.querySelector('label[for="animation"]').textContent = 'Animasi ' + metadata.name;
    document.querySelector('.animation-help').textContent = metadata.id === 'pip' ? 'Klip mekanis asli Pip. Pilih pose statis untuk membandingkan desain.' : 'Gerak tulang prototipe. Pilih pose statis untuk membandingkan desain; bentuk sendi masih perlu ditinjau.';
    const labels = {Idle: 'Idle · diam', IdleBreath: 'Idle · bernapas', Walk: 'Walk · berjalan', Wave: 'Wave · menyapa', Jump: 'Jump · melompat', Skill: 'Skill · aksi', Win: 'Win · menang', Lose: 'Lose · kalah'};
    if (allowed) for (const clip of active.animations) {
      const option = document.createElement('option'); option.value = clip.name; option.textContent = labels[clip.name] || clip.name; selector.appendChild(option);
    }
    mixer = allowed ? new THREE.AnimationMixer(active.scene) : null;
    state.animation = null; state.animationClips = allowed ? active.animations.map(clip => clip.name) : [];
    if (allowed && metadata.id !== 'pip') {
      const idle = active.animations.find(clip => clip.name === 'IdleBreath' || clip.name === 'Idle');
      if (idle) animation(idle.name);
    }
  }

  for (const metadata of payload.models) {
    const button = document.createElement('button'); button.className = 'character'; button.dataset.character = metadata.id; button.setAttribute('aria-pressed', 'false');
    const avatar = document.createElement('span'); avatar.className = 'avatar';
    if (payload.references[metadata.id]) { const image = document.createElement('img'); image.src = dataImage(payload.references[metadata.id]); image.alt = ''; avatar.appendChild(image); }
    else avatar.textContent = metadata.name.slice(0, 1);
    const text = document.createElement('span'), name = document.createElement('div'), subtitle = document.createElement('div');
    name.className = 'character-name'; name.textContent = metadata.name; subtitle.className = 'character-small'; subtitle.textContent = metadata.animations ? (metadata.id === 'pip' ? 'Clip mekanis' : 'Animasi tulang') : 'Model statis';
    text.append(name, subtitle); button.append(avatar, text); button.onclick = () => load(metadata.id); $('roster').appendChild(button);
  }

  async function load(id) {
    const metadata = payload.models.find(model => model.id === id); if (!metadata) return;
    const current = ++token; state.ready = false; state.loading = id;
    state.source = null; state.geometry = null; state.sourceHashVerified = false;
    state.animation = null; state.animationClips = [];
    for (const field of ['faces', 'vertices', 'textures', 'motion']) $(field).textContent = '—';
    $('source-details').textContent = 'Memuat identitas berkas…';
    if (container) container.visible = false;
    $('loading').hidden = false; $('loading-label').textContent = 'Membuka model ' + metadata.name + '…';
    $('character-title').textContent = metadata.name; $('view').setAttribute('aria-label', 'Model tiga dimensi ' + metadata.name + ' yang dapat diputar');
    $('character-note').textContent = metadata.note || 'Kandidat model 3D. Bentuk dan bagian yang tidak terlihat pada referensi perlu ditinjau.';
    $('character-number').textContent = String(payload.models.indexOf(metadata)+1).padStart(2, '0');
    $('animation-box').hidden = true; reference(metadata);
    document.querySelectorAll('[data-character]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.character === id)));
    message('Membaca GLB yang disertakan dalam paket…');
    let parsed = null, hashVerified = false;
    try {
      const bytes = await modelBytes(metadata);
      if (globalThis.crypto?.subtle) {
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        const actualHash = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
        if (actualHash !== metadata.sha256) throw new Error('Hash GLB berbeda dari sumber.');
        hashVerified = true;
      }
      parsed = await new Promise((resolve, reject) => new GLTFLoader().parse(bytes.buffer, '', resolve, reject));
      if (current !== token) { dispose(parsed.scene); return; }
      let faces = 0, vertices = 0, meshCount = 0; const arrays = new Set();
      parsed.scene.traverse(object => {
        if (!object.isMesh) return;
        meshCount++;
        const geometry = object.geometry, position = geometry.attributes.position;
        faces += (geometry.index ? geometry.index.count : position.count)/3;
        if (!arrays.has(position.array)) { arrays.add(position.array); vertices += position.count; }
        if (!geometry.attributes.normal) geometry.computeVertexNormals();
      });
      if (faces !== metadata.faces) throw new Error('Jumlah segitiga aktif tidak sesuai GLB.');
      if (parsed.animations.length !== metadata.animations) throw new Error('Jumlah clip tidak sesuai GLB.');
      parsed.scene.updateMatrixWorld(true);
      const bounds = id==='alexia'?sampleBounds(actualRestVertexSamples(parsed.scene)):new THREE.Box3().setFromObject(parsed.scene,true);
      const size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
      const extent = Math.max(size.x, size.y, size.z);
      if (!(extent > 0) || !Number.isFinite(extent)) throw new Error('Bounds model tidak valid.');
      if (mixer && active) { mixer.stopAllAction(); mixer.uncacheRoot(active.scene); mixer = null; }
      if (container) { scene.remove(container); dispose(container, true); }
      active = parsed;
      active.scene.traverse(object => {
        if (!object.isMesh) return;
        originalMaterials.set(object.uuid, object.material);
        object.castShadow=id==='alexia'; object.receiveShadow=id==='alexia';
        for (const material of Array.isArray(object.material)?object.material:[object.material]) {
          if (id==='alexia' && material?.isMeshBasicMaterial) material.toneMapped=false;
        }
        grayMaterials.set(object.uuid, new THREE.MeshStandardMaterial({color: '#bbc7d4', roughness: .8, metalness: 0, side: THREE.DoubleSide}));
      });
      const offset = new THREE.Group(); offset.position.copy(center).multiplyScalar(-1); offset.add(active.scene);
      container = new THREE.Group(); container.scale.setScalar(2/extent); container.add(offset); scene.add(container); container.updateMatrixWorld(true);
      framingPoints=id==='alexia'?actualRestVertexSamples(active.scene):null;
      const normalized = id==='alexia'?sampleBounds(framingPoints):new THREE.Box3().setFromObject(container,true);
      radius = normalized.getBoundingSphere(new THREE.Sphere()).radius;
      grid.position.y = normalized.min.y-.008;
      floor.position.y=normalized.min.y-.018; framingBounds=normalized.clone();
      const types = {}; active.scene.traverse(object => {if(object.isMesh) for(const m of Array.isArray(object.material)?object.material:[object.material]) {types[m.type]=(types[m.type]||0)+1;}});
      state.authoredMaterialTypes=types;
      state.selected = id; state.sourceHashVerified = hashVerified;
      state.source = {filename: metadata.filename, bytes: metadata.bytes, sha256: metadata.sha256};
      state.geometry = {faces, vertices, meshes: meshCount, skins: metadata.skins, animations: parsed.animations.length};
      $('gray').checked = false; present(); setupAnimations(metadata); metadataInfo(metadata, state.geometry);
      resize(); pose('front'); state.ready = true; state.loading = null;
      if (!state.loadedIds.includes(id)) state.loadedIds.push(id);
      message(state.animation ? 'Animasi aktif: ' + state.animation : state.animationClips.length ? 'Model 3D siap. Pilih animasi untuk melihat gerak.' : 'Model 3D siap · pose statis.');
      $('loading').hidden = true;
    } catch (error) {
      if (parsed && parsed !== active) dispose(parsed.scene);
      if (current !== token) return;
      const text = String(error.message || error); state.errors.push({id, message: text}); state.loading = null;
      $('loading-label').textContent = 'Model belum dapat dibuka'; message('Gagal membuka ' + metadata.name + ': ' + text, true);
    }
  }

  document.querySelectorAll('[data-mode]').forEach(button => button.onclick = () => mode(button.dataset.mode));
  document.querySelectorAll('[data-view]').forEach(button => button.onclick = () => { $('rotate').checked = false; controls.autoRotate = false; state.autoRotate = false; pose(button.dataset.view); });
  $('reset').onclick = () => { $('rotate').checked = false; controls.autoRotate = false; state.autoRotate = false; animation(''); pose('front'); };
  $('rotate').onchange = () => { controls.autoRotate = $('rotate').checked; state.autoRotate = controls.autoRotate; };
  $('lighting-profile').onchange = () => {lightingProfile=$('lighting-profile').value; present();};
  $('wireframe').onchange = present; $('gray').onchange = present; $('animation').onchange = () => animation($('animation').value);
  $('details-toggle').onclick = () => { const open = $('source-details').hidden; $('source-details').hidden = !open; $('details-toggle').setAttribute('aria-expanded', String(open)); };
  controls.addEventListener('start', () => { state.cameraView = 'orbit'; document.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-pressed', 'false')); });
  new ResizeObserver(resize).observe($('viewport')); resize();
  state.inspect = () => ({ready: state.ready, selected: state.selected, loading: state.loading, mode: state.mode,
    cameraView: state.cameraView, source: state.source, sourceHashVerified: state.sourceHashVerified, geometry: state.geometry,
    animation: state.animation, animationClips: state.animationClips, loadedIds: state.loadedIds.slice(), errors: state.errors.slice(),
    grayGeometry: state.grayGeometry, wireframe: state.wireframe, referenceAvailable: state.referenceAvailable,
    authoredMaterialTypes:state.authoredMaterialTypes, lightingProfile:state.lightingProfile, shadowFilter:state.shadowFilter,shadowIntensity:state.shadowIntensity, outputColorSpace:state.outputColorSpace, realGeometryShadows:state.realGeometryShadows, unlitToneMapBypass:state.unlitToneMapBypass, cameraFit:state.cameraFit, animationPaused:state.animationPaused, threeRevision: state.threeRevision, materialPresentation: state.materialPresentation, toneMapping: state.toneMapping, presentationExposure: state.presentationExposure, visualApproved: false, gameIntegrated: false, networkRequired: false});
  state.select = async id => { await load(id); return state.inspect(); };
  state.view = name => { pose(name); return state.inspect(); };
  state.setMode = value => { mode(value); return state.inspect(); };
  state.play = name => { animation(name); return state.inspect(); };
  state.setProfile = name => {if(!LIGHTING_PROFILES[name]) throw new Error('Unknown lighting profile'); lightingProfile=name; $('lighting-profile').value=name; present(); return state.inspect();};
  state.sample = (name,time) => {animation(name);if(mixer){mixer.setTime(time);mixer.timeScale=0;state.animationPaused=true;}return state.inspect();};
  function frame() {
    requestAnimationFrame(frame); const delta = Math.min(clock.getDelta(), .08);
    if (mixer && state.ready && state.mode !== 'reference') mixer.update(delta);
    controls.update(); if (state.mode !== 'reference') renderer.render(scene, camera);
  }
  frame();
  await load(payload.models[0].id);
}
start().catch(error => { const text = String(error.message || error); state.errors.push({id: null, message: text}); $('loading-label').textContent = 'Penampil belum dapat dimulai'; message('Penampil gagal: ' + text + '. Gunakan browser dengan WebGL2 aktif.', true); });
