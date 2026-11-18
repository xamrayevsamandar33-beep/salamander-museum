import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const THREE_VER = '0.160.0';
const BASIS_PATH = `https://cdn.jsdelivr.net/npm/three@${THREE_VER}/examples/jsm/libs/basis/`;
const DRACO_PATH = 'https://www.gstatic.com/draco/versioned/decoders/1.5.6/';

/* ------------------------------------------------------------------ icons */
const svg = (inner, extra = '') =>
  `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${inner}</svg>`;
const ICON = {
  help: svg('<circle cx="12" cy="12" r="9.5"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.6 2.3c-.8.4-1.2.9-1.2 1.8M12 17.2v.01"/>'),
  settings: svg('<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>'),
  layers: svg('<path d="M12 3 3 8l9 5 9-5-9-5z"/><path d="m3 12.500 9 5 9-5M3 16.500l9 5 9-5"/>'),
  vr: svg('<path d="M3 8h18v8a2 2 0 0 1-2 2h-3.500l-1.700-3h-3.600l-1.700 3H5a2 2 0 0 1-2-2V8z"/>'),
  full: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  exit: svg('<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>'),
  rotate: svg('<path d="M20 12a8 8 0 1 1-2.400-5.700M20 4v4.500h-4.500"/>'),
  orbit: svg('<path d="M20 12a8 8 0 0 0-13.700-5.600M4 4v4.500h4.500M4 12a8 8 0 0 0 13.700 5.600M20 20v-4.500h-4.500"/>', 'width="44" height="44"'),
  zoom: svg('<circle cx="10.500" cy="10.500" r="6.500"/><path d="m20 20-4.900-4.900M10.500 7.500v6M7.500 10.500h6"/>', 'width="44" height="44"'),
  pan: svg('<path d="M12 3v18M3 12h18M12 3 9 6M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/>', 'width="44" height="44"'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>', 'width="20" height="20"'),
  sphere: svg('<circle cx="12" cy="12" r="9"/><path d="M7 9a6 6 0 0 1 5-3"/>', 'width="20" height="20"'),
  drop: svg('<path d="M12 3s6 6.500 6 11a6 6 0 0 1-12 0c0-4.500 6-11 6-11z"/>', 'width="20" height="20"'),
  dots: svg('<circle cx="12" cy="12" r="9"/><path d="M8 9h.01M12 8h.01M16 9h.01M8 13h.01M12 12h.01M16 13h.01M10 16h.01M14 16h.01"/>', 'width="20" height="20"'),
  half: svg('<circle cx="12" cy="12" r="9"/><path d="M12 3v18M12 7h5M12 11h6M12 15h5M12 19h2"/>', 'width="20" height="20"'),
  wire: svg('<rect x="3.500" y="3.500" width="17" height="17"/><path d="M3.500 20.500 20.500 3.500"/>', 'width="20" height="20"'),
  normals: svg('<rect x="5" y="5" width="14" height="14"/><path d="M3 3l3 3M21 3l-3 3M3 21l3-3M21 21l-3-3"/>', 'width="20" height="20"'),
  uv: svg('<rect x="3.500" y="3.500" width="17" height="17"/><path d="M3.500 12h17M12 3.500v17"/>', 'width="20" height="20"'),
};

/* --------------------------------------------------------- inspector spec */
const SECTIONS = [
  { id: 'render', key: '1', title: 'Render', items: [
    { id: 'final', label: 'Final Render', icon: 'sphere', hint: 'Physically based lighting, tone mapping and contact shadow' },
    { id: 'nopost', label: 'No Post-Processing', icon: 'sphere', hint: 'Same lighting without tone mapping or shadow' },
  ] },
  { id: 'materials', key: '2', title: 'Material channels', items: [
    { id: 'albedo', label: 'Albedo / Base Color', icon: 'drop', need: 'albedo' },
    { id: 'specular', label: 'Specular (metalness)', icon: 'sphere', need: 'specular', missing: 'This model has no metalness texture.' },
    { id: 'gloss', label: 'Glossiness', icon: 'dots', need: 'gloss', missing: 'This model has no roughness texture.' },
    { id: 'ao', label: 'Ambient Occlusion', icon: 'half', need: 'ao', missing: 'This model has no ambient-occlusion texture.' },
  ] },
  { id: 'geometry', key: '3', title: 'Geometry', items: [
    { id: 'matcap', label: 'Matcap', icon: 'sphere' },
    { id: 'wire', label: 'Wireframe', icon: 'wire', toggle: true },
    { id: 'normals', label: 'Vertex Normals', icon: 'normals' },
  ] },
  { id: 'uv', key: '4', title: 'UV', items: [
    { id: 'uvcoords', label: 'UV Coordinates', icon: 'uv', need: 'uv', missing: 'This model has no UV coordinates.' },
    { id: 'uvchecker', label: 'UV Checker', icon: 'uv', need: 'uv', missing: 'This model has no UV coordinates.' },
  ] },
];
const WIRE_COLORS = [null, '#111111', '#c9c9c9', '#e53935', '#1e40ff', '#7cff3a', '#ffee3a'];

export function webglSupported() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
}

const isTyping = (t) => t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);

/* ------------------------------------------------------------------ viewer */
/**
 * Mounts an interactive viewer inside `container`.
 * opts: { url, urlModifier?, expectedSize?, autoRotate?, onReady?(info), onError?(err) }
 */
export function mountViewer(container, opts = {}) {
  container.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'vw';
  root.tabIndex = 0;
  root.dataset.bg = 'light';
  root.innerHTML = `
    <div class="vw-stage"></div>
    <div class="vw-loading"><div class="vw-spinner"></div><div class="vw-pct">Loading 3D model…</div><div class="vw-bar"><i></i></div></div>
    <div class="vw-error" hidden><div><strong>The 3D model could not be displayed.</strong><p class="vw-errmsg"></p><button class="btn sm" data-act="retry">Try again</button></div></div>
    <div class="vw-toast" hidden></div>
    <aside class="vw-inspector" hidden aria-label="Inspector"></aside>
    <aside class="vw-settings" hidden aria-label="Viewer settings"></aside>
    <div class="vw-toolbar">
      <button class="vw-btn" data-act="help" title="Help" aria-label="Help">${ICON.help}</button>
      <button class="vw-btn" data-act="rotate" title="Auto-rotate" aria-label="Auto-rotate" aria-pressed="false">${ICON.rotate}</button>
      <button class="vw-btn" data-act="settings" title="Settings" aria-label="Settings">${ICON.settings}</button>
      <button class="vw-btn" data-act="layers" title="Inspector (I)" aria-label="Inspector" disabled>${ICON.layers}</button>
      <button class="vw-btn" data-act="vr" title="Enter VR" aria-label="Enter VR" hidden>${ICON.vr}</button>
      <button class="vw-btn" data-act="full" title="Fullscreen" aria-label="Fullscreen">${ICON.full}</button>
    </div>
    <div class="vw-help" hidden role="dialog" aria-label="Viewer help">
      <button class="vw-x" data-act="help-close" aria-label="Close help">${ICON.close}</button>
      <div class="vw-tabs" role="tablist">
        <button role="tab" class="on" data-tab="basics">Navigation basics</button>
        <button role="tab" data-tab="all">All controls</button>
      </div>
      <div class="vw-tabbody" data-body="basics">
        <div class="vw-cols">
          <div>${ICON.orbit}<h4>Orbit around</h4><p>Left click + drag<br>or<br>One finger drag (touch)</p></div>
          <div>${ICON.zoom}<h4>Zoom</h4><p>Double click on model<br>or scroll anywhere<br>or<br>Pinch (touch)</p></div>
          <div>${ICON.pan}<h4>Pan</h4><p>Right click + drag<br>or<br>Two fingers drag (touch)</p></div>
        </div>
      </div>
      <div class="vw-tabbody" data-body="all" hidden>
        <dl class="vw-keys">
          <dt>Orbit</dt><dd>Left mouse drag · one-finger drag</dd>
          <dt>Pan</dt><dd>Right mouse drag · two-finger drag</dd>
          <dt>Zoom</dt><dd>Mouse wheel · pinch · double-click / double-tap a point</dd>
          <dt>Reset</dt><dd>Reset Camera View button · <kbd>R</kbd> · double-click empty space</dd>
          <dt>Rendering</dt><dd><kbd>1</kbd> Render &nbsp; <kbd>2</kbd> Materials &nbsp; <kbd>3</kbd> Geometry &nbsp; <kbd>4</kbd> UV<br><small>press again to cycle through the options</small></dd>
          <dt>Wireframe</dt><dd><kbd>5</kbd></dd>
          <dt>Inspector</dt><dd><kbd>I</kbd> opens / closes the inspector panel</dd>
          <dt>Close</dt><dd><kbd>Esc</kbd> closes panels</dd>
        </dl>
      </div>
      <button class="vw-reset" data-act="reset">RESET CAMERA VIEW</button>
    </div>`;
  container.appendChild(root);
  const q = (s) => root.querySelector(s);
  const stageEl = q('.vw-stage');

  const ctl = { ready: null, info: null, destroy() {}, resetView() {}, captureThumb: async () => null };

  if (!webglSupported()) {
    showFatal('Your browser or device does not support WebGL, which is required for 3D viewing.');
    return ctl;
  }

  const lowMem = !!(navigator.deviceMemory && navigator.deviceMemory <= 2);
  const state = {
    mode: 'final', wire: false, wireColor: '#111111', single: false,
    bg: 'light', quality: 'auto', exposure: 1, caps: null,
  };

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: !lowMem, alpha: true, powerPreference: 'high-performance' });
  } catch (e) {
    showFatal('The 3D engine could not start on this device.');
    return ctl;
  }
  const maxDpr = () => ({ auto: Math.min(window.devicePixelRatio || 1, lowMem ? 1 : 2), standard: 1, high: Math.min(window.devicePixelRatio || 1, 3) }[state.quality]);
  renderer.setPixelRatio(maxDpr());
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = !lowMem;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  stageEl.appendChild(renderer.domElement);
  renderer.domElement.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    showFatal('The graphics memory of this device ran out. Close other tabs and reload the page.');
  });

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
  const stage = new THREE.Group();
  scene.add(stage);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;

  const sun = new THREE.DirectionalLight(0xffffff, 1.1);
  sun.castShadow = !lowMem;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.bias = -0.0004;
  scene.add(sun, sun.target);

  const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.22 }));
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.receiveShadow = true;
  shadowPlane.raycast = () => {};
  shadowPlane.visible = false;
  scene.add(shadowPlane);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.09;
  controls.screenSpacePanning = true;
  controls.autoRotateSpeed = 2;
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

  /* ------------------------------------------------ model-dependent state */
  let model = null;
  let size = new THREE.Vector3(1, 1, 1);
  let maxDim = 1;
  let home = { pos: new THREE.Vector3(0, 0, 3), target: new THREE.Vector3() };
  const meshes = [];
  const overrides = new Map(); // `${mode}:${uuid}` -> material
  const extraMats = new Set();
  let wireMat = null;
  const wireMeshes = [];
  let matcapMat = null;
  let normalMat = null;
  let greyMat = null;
  let tween = null;
  let disposed = false;
  let loadToken = 0;

  /* --------------------------------------------------------- UI helpers */
  function showFatal(msg) {
    q('.vw-loading').hidden = true;
    q('.vw-errmsg').textContent = msg;
    q('.vw-error').hidden = false;
    opts.onError && opts.onError(new Error(msg));
  }
  let toastTimer;
  function notify(msg) {
    const t = q('.vw-toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 2600);
  }

  /* -------------------------------------------------------------- sizing */
  function resize() {
    const w = root.clientWidth, h = root.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(root);
  resize();

  function computeHome() {
    const fov = (camera.fov * Math.PI) / 180;
    const fitH = maxDim / 2 / Math.tan(fov / 2);
    const fitW = maxDim / 2 / (Math.tan(fov / 2) * camera.aspect);
    const dist = Math.max(fitH, fitW) * 1.45;
    const dir = new THREE.Vector3(0.85, 0.5, 1.1).normalize();
    home = { pos: dir.multiplyScalar(dist), target: new THREE.Vector3(0, 0, 0) };
  }

  function tweenTo(pos, target, ms = 550) {
    tween = {
      t0: performance.now(), ms,
      p0: camera.position.clone(), a0: controls.target.clone(),
      p1: pos.clone(), a1: target.clone(),
    };
  }
  function resetView() {
    if (!model) return;
    computeHome();
    tweenTo(home.pos, home.target);
  }
  controls.addEventListener('start', () => (tween = null));

  /* ------------------------------------------------------------- loading */
  const loadingEl = q('.vw-loading');
  function setProgress(p, label) {
    q('.vw-bar i').style.width = `${Math.round(p * 100)}%`;
    q('.vw-pct').textContent = label || `Loading 3D model… ${Math.round(p * 100)}%`;
  }

  const manager = new THREE.LoadingManager();
  if (opts.urlModifier) manager.setURLModifier(opts.urlModifier);
  const loader = new GLTFLoader(manager);
  const draco = new DRACOLoader(manager).setDecoderPath(DRACO_PATH);
  const ktx2 = new KTX2Loader(manager).setTranscoderPath(BASIS_PATH).detectSupport(renderer);
  loader.setDRACOLoader(draco).setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);

  function load() {
    const token = ++loadToken;
    q('.vw-error').hidden = true;
    loadingEl.hidden = false;
    setProgress(0, 'Loading 3D model…');
    loader.load(
      opts.url,
      (gltf) => {
        if (disposed || token !== loadToken) return;
        try {
          onLoaded(gltf);
        } catch (e) {
          console.error(e);
          showFatal(e.message || 'The model file could not be read.');
        }
      },
      (e) => {
        const total = e.lengthComputable ? e.total : opts.expectedSize || 0;
        if (total) setProgress(Math.min(1, e.loaded / total));
      },
      (err) => {
        console.error(err);
        const m = String((err && err.message) || err || '');
        showFatal(/404|not found/i.test(m) ? 'The model file was not found.' : 'The model file could not be loaded. Check your connection and try again.');
      }
    );
  }

  function eachMat(mesh, fn) {
    const o = mesh.userData.orig;
    (Array.isArray(o) ? o : [o]).forEach(fn);
  }

  function onLoaded(gltf) {
    model = gltf.scene;
    stage.add(model);
    let tris = 0;
    const caps = { albedo: true, specular: false, gloss: false, ao: false, uv: false };
    const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

    model.traverse((o) => {
      if (!o.isMesh) return;
      meshes.push(o);
      o.userData.orig = o.material;
      o.castShadow = true;
      const g = o.geometry;
      tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
      if (g.attributes.uv) caps.uv = true;
      eachMat(o, (m) => {
        if (m.metalnessMap) caps.specular = true;
        if (m.roughnessMap) caps.gloss = true;
        if (m.aoMap) caps.ao = true;
        ['map', 'metalnessMap', 'roughnessMap', 'aoMap', 'normalMap', 'emissiveMap'].forEach((k) => {
          if (m[k]) m[k].anisotropy = maxAniso;
        });
      });
    });
    if (!meshes.length) throw new Error('This file contains no 3D geometry.');
    state.caps = caps;

    const box = new THREE.Box3().setFromObject(model);
    if (box.isEmpty()) throw new Error('This model has no visible geometry.');
    const center = box.getCenter(new THREE.Vector3());
    box.getSize(size);
    maxDim = Math.max(size.x, size.y, size.z) || 1;
    model.position.sub(center);

    camera.near = maxDim / 200;
    camera.far = maxDim * 200;
    camera.updateProjectionMatrix();
    controls.minDistance = maxDim * 0.06;
    controls.maxDistance = maxDim * 14;

    sun.position.set(maxDim * 1.2, maxDim * 2.4, maxDim * 1.4);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -maxDim * 1.3;
    sun.shadow.camera.right = sun.shadow.camera.top = maxDim * 1.3;
    sun.shadow.camera.near = maxDim * 0.2;
    sun.shadow.camera.far = maxDim * 8;
    sun.shadow.camera.updateProjectionMatrix();
    shadowPlane.scale.setScalar(maxDim * 6);
    shadowPlane.position.y = -size.y / 2 - maxDim * 0.002;

    computeHome();
    camera.position.copy(home.pos);
    controls.target.copy(home.target);
    controls.update();

    ctl.info = { triangles: Math.round(tris), size: size.clone(), caps };
    buildInspector();
    q('[data-act="layers"]').disabled = false;
    applyMode('final');
    loadingEl.hidden = true;
    if (opts.autoRotate) toggleRotate(true);
    start();
    opts.onReady && opts.onReady(ctl.info);
  }

  /* ----------------------------------------------- inspector / rendering */
  function albedoMat(o) {
    return new THREE.MeshBasicMaterial({
      map: o.map || null, color: o.color ? o.color.clone() : 0xffffff,
      vertexColors: !!o.vertexColors, transparent: o.transparent, opacity: o.opacity,
      alphaTest: o.alphaTest, alphaMap: o.alphaMap || null, toneMapped: false,
    });
  }
  const CHANNEL = {
    specular: (o) => ({ map: o.metalnessMap, ch: 'b', f: typeof o.metalness === 'number' ? o.metalness : 0, inv: false }),
    gloss: (o) => ({ map: o.roughnessMap, ch: 'g', f: typeof o.roughness === 'number' ? o.roughness : 1, inv: true }),
    ao: (o) => ({ map: o.aoMap, ch: 'r', f: 1, inv: false }),
  };
  function channelMat(o, kind) {
    const c = CHANNEL[kind](o);
    const m = new THREE.MeshBasicMaterial({ toneMapped: false });
    if (c.map) {
      m.map = c.map;
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uF = { value: c.f };
        sh.uniforms.uInv = { value: c.inv ? 1 : 0 };
        sh.fragmentShader =
          'uniform float uF; uniform float uInv;\n' +
          sh.fragmentShader.replace(
            '#include <map_fragment>',
            `float chv = texture2D( map, vMapUv ).${c.ch} * uF; chv = mix( chv, 1.0 - chv, uInv ); diffuseColor.rgb = vec3( pow( chv, 2.2 ) );`
          );
      };
      m.customProgramCacheKey = () => 'channel-' + kind;
    } else {
      // no texture on this material: show the constant factor
      const v = c.inv ? 1 - c.f : c.f;
      const lin = Math.pow(Math.min(1, Math.max(0, v)), 2.2);
      m.color.setRGB(lin, lin, lin);
    }
    return m;
  }
  function uvMat(checker) {
    return new THREE.ShaderMaterial({
      toneMapped: false,
      uniforms: { uMode: { value: checker ? 1 : 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }',
      fragmentShader: `varying vec2 vUv; uniform float uMode;
        void main(){
          vec3 col;
          if ( uMode < 0.5 ) {
            col = vec3( vUv.x, vUv.y, 0.35 );
            vec2 g = fract( vUv * 16.0 );
            col = mix( col, vec3( 1.0 ), clamp( step( 0.96, g.x ) + step( 0.96, g.y ), 0.0, 1.0 ) * 0.35 );
          } else {
            float c = mod( floor( vUv.x * 16.0 ) + floor( vUv.y * 16.0 ), 2.0 );
            col = mix( vec3( 0.93 ), vec3( 0.25, 0.27, 0.32 ), c );
            col = mix( col, vec3( vUv, 0.5 ), 0.25 );
          }
          gl_FragColor = vec4( col, 1.0 );
          #include <colorspace_fragment>
        }`,
    });
  }
  function makeMatcap() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(100, 90, 10, 128, 128, 128);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.35, '#dcdcdc'); gr.addColorStop(0.75, '#8c8c8c'); gr.addColorStop(1, '#3a3a3a');
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  function overrideFor(mode, o, mesh) {
    if (mode === 'matcap') {
      if (!matcapMat) extraMats.add((matcapMat = new THREE.MeshMatcapMaterial({ matcap: makeMatcap(), toneMapped: false })));
      return matcapMat;
    }
    if (mode === 'normals') {
      if (!normalMat) extraMats.add((normalMat = new THREE.MeshNormalMaterial()));
      return normalMat;
    }
    const key = `${mode}:${o.uuid}`;
    let m = overrides.get(key);
    if (m) return m;
    if (mode === 'albedo') m = albedoMat(o);
    else if (mode === 'specular' || mode === 'gloss' || mode === 'ao') m = channelMat(o, mode);
    else if (mode === 'uvcoords' || mode === 'uvchecker') {
      if (mesh.geometry.attributes.uv) m = uvMat(mode === 'uvchecker');
      else {
        if (!greyMat) extraMats.add((greyMat = new THREE.MeshBasicMaterial({ color: 0x9a9a9a, toneMapped: false })));
        m = greyMat;
      }
    }
    overrides.set(key, m);
    return m;
  }

  function applySide() {
    const side = state.single ? THREE.FrontSide : THREE.DoubleSide;
    const set = (m) => { if (m.side !== side) { m.side = side; m.needsUpdate = true; } };
    meshes.forEach((mesh) => eachMat(mesh, set));
    overrides.forEach(set);
    extraMats.forEach(set);
  }

  function applyMode(mode) {
    state.mode = mode;
    const shaded = mode === 'final' || mode === 'nopost';
    renderer.toneMapping = mode === 'nopost' ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
    shadowPlane.visible = mode === 'final' && !lowMem;
    meshes.forEach((mesh) => {
      const o = mesh.userData.orig;
      if (shaded) mesh.material = o;
      else mesh.material = Array.isArray(o) ? o.map((m) => overrideFor(mode, m, mesh)) : overrideFor(mode, o, mesh);
    });
    applySide();
    updateInspectorUI();
  }

  function applyWire() {
    if (state.wire && !wireMeshes.length) {
      wireMat = new THREE.MeshBasicMaterial({
        color: state.wireColor, wireframe: true, toneMapped: false,
        polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
      });
      meshes.forEach((m) => {
        if (m.isSkinnedMesh || m.isInstancedMesh) return;
        const w = new THREE.Mesh(m.geometry, wireMat);
        w.raycast = () => {};
        w.renderOrder = 1;
        m.add(w);
        wireMeshes.push(w);
      });
    }
    if (wireMat) wireMat.color.set(state.wireColor);
    wireMeshes.forEach((w) => (w.visible = state.wire));
    updateInspectorUI();
  }

  const modeAvailable = (item) => !item.need || (state.caps && state.caps[item.need]);

  function buildInspector() {
    const el = q('.vw-inspector');
    const sw = WIRE_COLORS.map((c) => `<button class="vi-sw${c ? '' : ' none'}" data-wirecolor="${c || ''}" style="${c ? `background:${c}` : ''}" aria-label="${c ? 'Wireframe ' + c : 'Wireframe off'}"></button>`).join('');
    const sections = SECTIONS.map((s) => `
      <div class="vi-sec" data-sec="${s.id}">
        <div class="vi-h"><span>${s.title} (${s.items.length})</span><kbd>${s.key}</kbd></div>
        ${s.items.map((it) => {
          const ok = modeAvailable(it);
          return `<button class="vi-item" data-item="${it.id}" ${ok ? '' : 'disabled'} title="${ok ? (it.hint || it.label) : it.missing}">
              <span class="vi-ic">${ICON[it.icon]}</span><span class="vi-lb">${it.label}</span>${ok ? '' : '<em>Unavailable</em>'}</button>`;
        }).join('')}
      </div>`).join('');
    el.innerHTML = `
      <div class="vi-sec"><div class="vi-h"><span>Wireframe</span><kbd>5</kbd></div><div class="vi-sws">${sw}</div></div>
      <button class="vi-switch" data-act="single" role="switch" aria-checked="false"><span class="vi-knob">OFF</span><span>Single Sided</span></button>
      ${sections}`;
  }

  function updateInspectorUI() {
    const el = q('.vw-inspector');
    if (!el.children.length) return;
    el.querySelectorAll('.vi-item').forEach((b) => {
      const id = b.dataset.item;
      const on = id === 'wire' ? state.wire : id === state.mode;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on);
    });
    el.querySelectorAll('.vi-sw').forEach((b) => {
      const c = b.dataset.wirecolor;
      b.classList.toggle('on', c ? state.wire && c === state.wireColor : !state.wire);
    });
    const sw = el.querySelector('.vi-switch');
    sw.setAttribute('aria-checked', state.single);
    sw.classList.toggle('on', state.single);
    sw.querySelector('.vi-knob').textContent = state.single ? 'ON' : 'OFF';
  }

  function cycleSection(sec) {
    const items = sec.items.filter((i) => !i.toggle);
    const avail = items.filter(modeAvailable);
    if (!avail.length) return notify(items[0].missing || 'Not available for this model');
    openPanel('inspector', true);
    const cur = avail.findIndex((i) => i.id === state.mode);
    const next = avail[(cur + 1) % avail.length];
    applyMode(next.id);
  }

  /* ------------------------------------------------------------- panels */
  function openPanel(name, force) {
    const map = { inspector: q('.vw-inspector'), settings: q('.vw-settings'), help: q('.vw-help') };
    Object.entries(map).forEach(([k, el]) => {
      if (k === name) el.hidden = force === undefined ? !el.hidden : !force;
      else if (name !== 'help' && k !== 'help') el.hidden = true;
    });
    if (name === 'help' && !map.help.hidden) { map.inspector.hidden = true; map.settings.hidden = true; }
    q('[data-act="layers"]').classList.toggle('on', !map.inspector.hidden);
    q('[data-act="settings"]').classList.toggle('on', !map.settings.hidden);
    q('[data-act="help"]').classList.toggle('on', !map.help.hidden);
  }

  function buildSettings() {
    q('.vw-settings').innerHTML = `
      <div class="vs-row"><span>Auto-rotate</span><button class="vi-switch sm" data-act="rotate" role="switch" aria-checked="false"><span class="vi-knob">OFF</span></button></div>
      <div class="vs-row col"><span>Background</span><div class="vs-chips" data-set="bg">
        <button data-v="light" class="on">Light</button><button data-v="studio">Studio</button><button data-v="dark">Dark</button></div></div>
      <div class="vs-row col"><span>Exposure</span><input type="range" min="0.4" max="2" step="0.05" value="1" data-set="exposure" aria-label="Exposure"></div>
      <div class="vs-row col"><span>Resolution</span><div class="vs-chips" data-set="quality">
        <button data-v="auto" class="on">Auto</button><button data-v="standard">Standard</button><button data-v="high">High</button></div></div>`;
  }
  buildSettings();

  /* ------------------------------------------------------------ actions */
  function toggleRotate(force) {
    controls.autoRotate = force === undefined ? !controls.autoRotate : force;
    root.querySelectorAll('[data-act="rotate"]').forEach((b) => {
      b.setAttribute('aria-pressed', controls.autoRotate);
      b.setAttribute('aria-checked', controls.autoRotate);
      b.classList.toggle('on', controls.autoRotate);
      const k = b.querySelector('.vi-knob');
      if (k) k.textContent = controls.autoRotate ? 'ON' : 'OFF';
    });
  }

  const fsActive = () => document.fullscreenElement === root || document.webkitFullscreenElement === root || root.classList.contains('pseudo-fs');
  function toggleFullscreen() {
    if (fsActive()) {
      if (root.classList.contains('pseudo-fs')) {
        root.classList.remove('pseudo-fs');
        document.documentElement.classList.remove('vw-lock');
      } else (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    } else if (root.requestFullscreen || root.webkitRequestFullscreen) {
      (root.requestFullscreen || root.webkitRequestFullscreen).call(root).catch(() => pseudoFs());
    } else pseudoFs();
    setTimeout(updateFsIcon, 60);
  }
  function pseudoFs() {
    root.classList.add('pseudo-fs'); // iPhone Safari has no element fullscreen
    document.documentElement.classList.add('vw-lock');
    updateFsIcon();
  }
  function updateFsIcon() {
    const b = q('[data-act="full"]');
    const on = fsActive();
    b.innerHTML = on ? ICON.exit : ICON.full;
    b.title = on ? 'Exit fullscreen' : 'Fullscreen';
    b.setAttribute('aria-label', b.title);
    resize();
  }
  const onFsChange = () => updateFsIcon();
  document.addEventListener('fullscreenchange', onFsChange);
  document.addEventListener('webkitfullscreenchange', onFsChange);

  /* -------------------------------------------------------------- VR */
  let xrSession = null;
  if (navigator.xr && navigator.xr.isSessionSupported) {
    navigator.xr.isSessionSupported('immersive-vr').then((ok) => { if (ok && !disposed) q('[data-act="vr"]').hidden = false; }).catch(() => {});
  }
  async function toggleVR() {
    if (xrSession) return xrSession.end();
    try {
      renderer.xr.enabled = true;
      const s = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor'] });
      xrSession = s;
      await renderer.xr.setSession(s);
      const k = 0.45 / maxDim;
      stage.scale.setScalar(k);
      stage.position.set(0, 1.15, -0.8);
      shadowPlane.visible = false;
      s.addEventListener('end', () => {
        xrSession = null;
        renderer.xr.enabled = false;
        stage.scale.setScalar(1);
        stage.position.set(0, 0, 0);
        shadowPlane.visible = state.mode === 'final' && !lowMem;
        resize();
      });
    } catch (e) {
      renderer.xr.enabled = false;
      notify('VR could not be started on this device.');
    }
  }

  /* ----------------------------------------------------- double click/tap */
  const ray = new THREE.Raycaster();
  function zoomAt(clientX, clientY) {
    if (!model) return;
    const r = renderer.domElement.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), camera);
    const hit = ray.intersectObjects(meshes, false).find((h) => h.object.visible);
    if (!hit) return resetView();
    const cur = camera.position.distanceTo(hit.point);
    const next = Math.max(cur * 0.45, controls.minDistance * 1.6);
    const dir = camera.position.clone().sub(hit.point).normalize();
    tweenTo(hit.point.clone().add(dir.multiplyScalar(next)), hit.point);
  }
  const dom = renderer.domElement;
  const onDbl = (e) => { if (e.pointerType !== 'touch') zoomAt(e.clientX, e.clientY); };
  dom.addEventListener('dblclick', onDbl);
  const pointers = new Set();
  let multi = false, down = null, lastTap = { t: 0, x: 0, y: 0 };
  dom.addEventListener('pointerdown', (e) => {
    pointers.add(e.pointerId);
    if (pointers.size > 1) multi = true;
    down = { x: e.clientX, y: e.clientY, t: performance.now() };
  });
  const endPointer = (e) => {
    pointers.delete(e.pointerId);
    if (e.type === 'pointerup' && e.pointerType === 'touch' && !multi && down) {
      const now = performance.now();
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      if (moved < 10 && now - down.t < 300) {
        if (now - lastTap.t < 350 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 40) {
          zoomAt(e.clientX, e.clientY);
          lastTap.t = 0;
        } else lastTap = { t: now, x: e.clientX, y: e.clientY };
      }
    }
    if (!pointers.size) multi = false;
  };
  dom.addEventListener('pointerup', endPointer);
  dom.addEventListener('pointercancel', endPointer);

  /* ------------------------------------------------------------ events */
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'help') openPanel('help');
    else if (act === 'help-close') openPanel('help', false);
    else if (act === 'settings') openPanel('settings');
    else if (act === 'layers') openPanel('inspector');
    else if (act === 'rotate') toggleRotate();
    else if (act === 'full') toggleFullscreen();
    else if (act === 'vr') toggleVR();
    else if (act === 'reset') { resetView(); openPanel('help', false); }
    else if (act === 'retry') { meshes.length = 0; load(); }
    else if (act === 'single') { state.single = !state.single; applySide(); updateInspectorUI(); }
    else if (b.dataset.tab) {
      root.querySelectorAll('.vw-tabs button').forEach((t) => t.classList.toggle('on', t === b));
      root.querySelectorAll('.vw-tabbody').forEach((p) => (p.hidden = p.dataset.body !== b.dataset.tab));
    } else if (b.dataset.item) {
      if (b.dataset.item === 'wire') { state.wire = !state.wire; applyWire(); }
      else applyMode(b.dataset.item);
    } else if (b.dataset.wirecolor !== undefined) {
      if (b.dataset.wirecolor) { state.wire = true; state.wireColor = b.dataset.wirecolor; } else state.wire = false;
      applyWire();
    } else if (b.closest('[data-set="bg"]')) {
      state.bg = root.dataset.bg = b.dataset.v;
      b.parentElement.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    } else if (b.closest('[data-set="quality"]')) {
      state.quality = b.dataset.v;
      renderer.setPixelRatio(maxDpr());
      resize();
      b.parentElement.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    }
  });
  root.addEventListener('input', (e) => {
    if (e.target.dataset.set === 'exposure') renderer.toneMappingExposure = state.exposure = +e.target.value;
  });

  const onKey = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
    const visible = root.offsetParent !== null || root.classList.contains('pseudo-fs') || fsActive();
    if (!visible || !model) return;
    const k = e.key.toLowerCase();
    const hot = root.matches(':hover') || root.contains(document.activeElement) || fsActive();
    if (k === 'escape') { openPanel('help', false); q('.vw-inspector').hidden = true; q('.vw-settings').hidden = true; if (root.classList.contains('pseudo-fs')) toggleFullscreen(); return; }
    if (!hot) return;
    const sec = SECTIONS.find((s) => s.key === k);
    if (sec) { e.preventDefault(); cycleSection(sec); }
    else if (k === '5') { state.wire = !state.wire; applyWire(); }
    else if (k === 'i') openPanel('inspector');
    else if (k === 'r') resetView();
  };
  window.addEventListener('keydown', onKey);

  /* ------------------------------------------------------- render loop */
  let running = false;
  function frame() {
    if (tween) {
      const k = Math.min(1, (performance.now() - tween.t0) / tween.ms);
      const e = 1 - Math.pow(1 - k, 3);
      camera.position.lerpVectors(tween.p0, tween.p1, e);
      controls.target.lerpVectors(tween.a0, tween.a1, e);
      if (k >= 1) tween = null;
    }
    controls.update();
    renderer.render(scene, camera);
  }
  function start() {
    if (running || disposed) return;
    running = true;
    renderer.setAnimationLoop(frame);
  }
  function stop() {
    if (xrSession) return;
    running = false;
    renderer.setAnimationLoop(null);
  }
  const io = new IntersectionObserver((en) => { if (!model) return; en[0].isIntersecting && !document.hidden ? start() : stop(); }, { threshold: 0.01 });
  io.observe(root);
  const onVis = () => { if (!model) return; document.hidden ? stop() : start(); };
  document.addEventListener('visibilitychange', onVis);

  /* -------------------------------------------------------------- API */
  ctl.resetView = resetView;
  ctl.captureThumb = async (maxW = 900) => {
    if (!model) return null;
    renderer.render(scene, camera);
    const src = renderer.domElement;
    const w = Math.min(maxW, src.width);
    const h = Math.round((w * src.height) / src.width);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#f7f6f3'); gr.addColorStop(1, '#e4e2dc');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    g.drawImage(src, 0, 0, w, h);
    return new Promise((res) => c.toBlob(res, 'image/jpeg', 0.86));
  };
  ctl.destroy = () => {
    disposed = true;
    stop();
    io.disconnect(); ro.disconnect();
    document.removeEventListener('visibilitychange', onVis);
    document.removeEventListener('fullscreenchange', onFsChange);
    document.removeEventListener('webkitfullscreenchange', onFsChange);
    window.removeEventListener('keydown', onKey);
    document.documentElement.classList.remove('vw-lock');
    if (xrSession) xrSession.end().catch(() => {});
    controls.dispose();
    const mats = new Set([...overrides.values(), ...extraMats]);
    meshes.forEach((m) => {
      m.geometry.dispose();
      eachMat(m, (x) => mats.add(x));
    });
    mats.forEach((m) => {
      ['map', 'metalnessMap', 'roughnessMap', 'aoMap', 'normalMap', 'emissiveMap', 'alphaMap', 'matcap'].forEach((k) => m[k] && m[k].dispose && m[k].dispose());
      m.dispose();
    });
    envTex.dispose(); pmrem.dispose(); draco.dispose(); ktx2.dispose();
    renderer.dispose();
    try { renderer.forceContextLoss(); } catch { /* ignore */ }
    root.remove();
  };
  load();
  return ctl;
}
