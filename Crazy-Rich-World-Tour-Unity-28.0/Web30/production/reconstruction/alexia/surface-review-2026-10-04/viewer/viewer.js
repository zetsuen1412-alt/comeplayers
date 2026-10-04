const payload = JSON.parse(document.getElementById('payload').textContent);
const $ = id => document.getElementById(id);
const state = {ready: false, selected: null, errors: [], visualFinalApproved: false, gameIntegrated: false};
window.CRWT_MESH_INSPECTOR = state;
function status(text, error = false) { $('status').textContent = text; $('status').classList.toggle('error', error); }
function decode64(s) { const text = atob(s); const bytes = new Uint8Array(text.length); for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i); return bytes; }
async function modelBytes(metadata) {
  const packed = decode64(metadata.base64);
  if (metadata.encoding !== 'zlib') return packed;
  if (typeof DecompressionStream !== 'function') throw new Error('Browser ini belum mendukung pembacaan model terkompresi. Gunakan browser desktop yang diperbarui.');
  const stream = new Blob([packed]).stream().pipeThrough(new DecompressionStream('deflate'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  if (bytes.byteLength !== metadata.bytes) throw new Error('Ukuran model setelah pembacaan tidak sesuai sumber.');
  return bytes;
}
function vendorText(key) { return new TextDecoder().decode(decode64(payload.vendor[key])); }
function moduleURL(source) { return URL.createObjectURL(new Blob([source], {type: 'text/javascript'})); }
async function start() {
  const core = moduleURL(vendorText('core'));
  const three = moduleURL(vendorText('three').replaceAll("'./three.core.js'", JSON.stringify(core)));
  const adapt = text => text.replaceAll("from 'three'", 'from ' + JSON.stringify(three));
  const utils = moduleURL(adapt(vendorText('utils')));
  const orbit = moduleURL(adapt(vendorText('orbit')));
  const loader = moduleURL(adapt(vendorText('loader')).replaceAll("'../utils/BufferGeometryUtils.js'", JSON.stringify(utils)));
  const [THREE, {OrbitControls}, {GLTFLoader}] = await Promise.all([import(three), import(orbit), import(loader)]);
  state.threeRevision = THREE.REVISION;
  const renderer = new THREE.WebGLRenderer({canvas: $('view'), antialias: true, powerPreference: 'high-performance'});
  const compatibility = new URLSearchParams(location.search).has('compat');
  renderer.setPixelRatio(compatibility ? .65 : Math.min(devicePixelRatio || 1, 1.25));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#e9eef2');
  scene.add(new THREE.HemisphereLight('#ffffff', '#7d8490', 2.1));
  const key = new THREE.DirectionalLight('#ffffff', 2.5); key.position.set(-3, 5, 5); scene.add(key);
  const fill = new THREE.DirectionalLight('#d8e7fb', 1.1); fill.position.set(4, 2, -4); scene.add(fill);
  const camera = new THREE.PerspectiveCamera(34, 1, .01, 100);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = .09; controls.autoRotateSpeed = .8;
  controls.minDistance = .2; controls.maxDistance = 15;
  let active = null, container = null, sceneRadius = 1, selectedToken = 0;
  const displayMaterials = new Map(), originalMaterials = new Map();
  const selector = $('model');
  for (const metadata of payload.models) {
    const option = document.createElement('option'); option.value = metadata.id; option.textContent = metadata.label; selector.appendChild(option);
  }
  if (!payload.models.some(m => m.id === 'cleanup')) {
    const option = document.createElement('option'); option.value = 'cleanup'; option.disabled = true; option.textContent = 'Pembersihan · belum dimuat'; selector.appendChild(option);
  }
  function disposal(root, clearMaps = true) {
    const geometries = new Set(), materials = new Set(), textures = new Set();
    root.traverse(object => { if (object.geometry) geometries.add(object.geometry); const list = Array.isArray(object.material) ? object.material : [object.material]; for (const material of list) if (material) materials.add(material); });
    if (clearMaps) {
      for (const material of originalMaterials.values()) for (const value of Array.isArray(material) ? material : [material]) materials.add(value);
      for (const material of displayMaterials.values()) materials.add(material);
    }
    for (const material of materials) for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    for (const geometry of geometries) geometry.dispose();
    for (const texture of textures) { texture.image?.close?.(); texture.dispose(); }
    for (const material of materials) material.dispose();
    if (clearMaps) { originalMaterials.clear(); displayMaterials.clear(); }
  }
  function presentation() {
    if (!active) return;
    active.scene.traverse(object => {
      if (!object.isMesh) return;
      object.material = $('gray').checked ? displayMaterials.get(object.uuid) : originalMaterials.get(object.uuid);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.wireframe = $('wireframe').checked;
    });
    state.wireframe = $('wireframe').checked; state.grayGeometry = $('gray').checked;
  }
  function pose(name = 'quarter') {
    const directions = {front: [0, 0, 1], back: [0, 0, -1], left: [-1, 0, 0], right: [1, 0, 0], quarter: [.7, .16, 1], top: [0, 1, .0001], bottom: [0, -1, .0001]};
    const direction = new THREE.Vector3(...(directions[name] || directions.quarter)).normalize();
    const distance = sceneRadius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) / Math.min(1, camera.aspect) * 1.1;
    controls.target.set(0, 0, 0); camera.position.copy(direction).multiplyScalar(distance); controls.update(); state.cameraView = name;
    document.querySelectorAll('[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === name));
  }
  function modelInfo(metadata, actual) {
    const fragments = [metadata.filename, actual.faces.toLocaleString('id-ID') + ' segitiga · ' + actual.vertices.toLocaleString('id-ID') + ' vertex unik per accessor', actual.skins + ' skin · ' + actual.animations + ' animasi', 'SHA-256 berkas sumber'];
    const info = $('info'); info.replaceChildren();
    for (let i = 0; i < fragments.length; i++) { const line = document.createElement(i === 0 ? 'strong' : 'div'); line.textContent = fragments[i]; info.appendChild(line); }
    const hash = document.createElement('code'); hash.textContent = metadata.sha256; info.appendChild(hash);
  }
  async function load(id) {
    const metadata = payload.models.find(model => model.id === id); if (!metadata) return;
    const token = ++selectedToken; state.ready = false; status('Membuka GLB asli yang disertakan…'); selector.disabled = true;
    try {
      const bytes = await modelBytes(metadata);
      if (globalThis.crypto?.subtle) {
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        const actualHash = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
        if (actualHash !== metadata.sha256) throw new Error('SHA-256 model tidak sesuai berkas sumber.');
        state.sourceHashVerified = true;
      } else state.sourceHashVerified = false;
      const gltf = await new Promise((resolve, reject) => new GLTFLoader().parse(bytes.buffer, '', resolve, reject));
      if (token !== selectedToken) { disposal(gltf.scene, false); return; }
      if (container) { scene.remove(container); disposal(container); }
      active = gltf;
      let faces = 0, vertices = 0; const positionArrays = new Set();
      gltf.scene.traverse(object => {
        if (!object.isMesh) return;
        const geometry = object.geometry;
        faces += (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;
        const position = geometry.attributes.position;
        if (!positionArrays.has(position.array)) { vertices += position.count; positionArrays.add(position.array); }
        if (!geometry.attributes.normal) geometry.computeVertexNormals();
        originalMaterials.set(object.uuid, object.material);
        displayMaterials.set(object.uuid, new THREE.MeshStandardMaterial({color: '#8c929a', roughness: .9, metalness: 0, side: THREE.DoubleSide}));
      });
      if (faces !== metadata.faces) throw new Error('Jumlah segitiga tidak sesuai identitas GLB.');
      const bounds = new THREE.Box3().setFromObject(gltf.scene, true);
      const size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
      const extent = Math.max(size.x, size.y, size.z); if (!(extent > 0)) throw new Error('Model tidak memiliki bounds valid.');
      // Presentation transform only. GLB POSITION/indices/file bytes are not rewritten.
      container = new THREE.Group(); container.add(gltf.scene); container.scale.setScalar(2 / extent); gltf.scene.position.sub(center); scene.add(container);
      const sphere = new THREE.Box3().setFromObject(container, true).getBoundingSphere(new THREE.Sphere()); sceneRadius = sphere.radius;
      $('gray').checked = metadata.images === 0;
      presentation(); pose('front');
      const actual = {faces, vertices, skins: metadata.skins, animations: gltf.animations.length};
      modelInfo(metadata, actual); status(metadata.note); state.selected = id; state.ready = true; state.source = {filename: metadata.filename, sha256: metadata.sha256, bytes: metadata.bytes}; state.geometry = actual;
    } catch (error) { const text = String(error.message || error); state.errors.push(text); status('Model gagal dibuka: ' + text, true); }
    finally { if (token === selectedToken) selector.disabled = false; }
  }
  selector.onchange = () => load(selector.value);
  document.querySelectorAll('[data-view]').forEach(button => button.onclick = () => pose(button.dataset.view));
  $('reset').onclick = () => pose('front'); $('wireframe').onchange = presentation; $('gray').onchange = presentation;
  $('rotate').onchange = () => { controls.autoRotate = $('rotate').checked; state.autoRotate = controls.autoRotate; };
  function resize() { const rect = $('viewport').getBoundingClientRect(); renderer.setSize(rect.width, rect.height, false); camera.aspect = rect.width / rect.height; camera.updateProjectionMatrix(); if (active) pose(state.cameraView || 'front'); }
  new ResizeObserver(resize).observe($('viewport')); resize();
  controls.addEventListener('start', () => { state.cameraView = 'orbit'; document.querySelectorAll('[data-view]').forEach(button => button.classList.remove('active')); });
  function render() { requestAnimationFrame(render); controls.update(); renderer.render(scene, camera); } render();
  state.inspect = () => ({ready: state.ready, selected: state.selected, source: state.source, sourceHashVerified: state.sourceHashVerified, geometry: state.geometry, camera: state.cameraView, errors: state.errors.slice(), threeRevision: state.threeRevision, trianglesRendered: renderer.info.render.triangles, grayGeometry: state.grayGeometry, wireframe: state.wireframe, visualFinalApproved: false, gameIntegrated: false, networkRequired: false});
  state.select = async id => { selector.value = id; await load(id); return state.inspect(); };
  state.view = name => { pose(name); return state.inspect(); };
  selector.value = 'projection';
  await load('projection');
}
start().catch(error => { const message = String(error.message || error); state.errors.push(message); status('Penampil gagal dimulai: ' + message + '. Coba browser dengan WebGL2 aktif.', true); });
document.getElementById('open-reference').onclick = () => document.getElementById('reference-view').showModal();
document.getElementById('close-reference').onclick = () => document.getElementById('reference-view').close();
