/* =====================================================================
   M5 F90 — CITY DRIVE 2.0
   three.js (rendering, PBR, HDRI, bloom) + cannon.js RaycastVehicle (physics)
   Real GLB car models (Kenney Car Kit CC0, three.js Ferrari) + CC0 PBR textures
   ===================================================================== */
(function () {
'use strict';

/* ---------------------------------------------------------------- utils */
var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
var lerp = function (a, b, t) { return a + (b - a) * t; };
var rand = function (a, b) { return a + Math.random() * (b - a); };
var randi = function (a, b) { return Math.floor(rand(a, b + 1)); };
var TAU = Math.PI * 2;

var ASSETS = 'assets/';
/* single-file build support: resolve a path to an embedded data-URI when present */
function A(u) { return (window.__ASSETS && window.__ASSETS[u]) ? window.__ASSETS[u] : u; }
var TEX = ASSETS + 'textures/';
var MDL = ASSETS + 'models/';

/* ---------------------------------------------------------------- state */
var S = {
  quality: 1,
  timeOfDay: 'day',
  carId: 'm5',
  paused: false,
  started: false,
  headlights: false,
  camMode: 0,
  showMap: false,
  colorIndex: 0,
  fps: 60
};
var stats = { top: 0, dist: 0, drift: 0, driftCur: 0, driftTime: 0 };

/* ---------------------------------------------------------------- cars */
var RMDL = MDL + 'cars/';
var CAR_LIST = [
  { id: 'm5',          name: 'BMW M5 F90',    note: '625 л.с. · седан',     file: null,                     len: 4.97, mass: 1900, power: 1.00, paint: true },
  { id: 'ferrari',     name: 'Ferrari 458',   note: 'V8 · суперкар',        file: MDL + 'ferrari.glb',      len: 4.53, mass: 1500, power: 1.06, paint: true },
  { id: 'hypercar',    name: 'Hypercar GT',   note: '1100 л.с. · гиперкар', file: RMDL + 'hypercar.glb',    len: 4.70, mass: 1450, power: 1.16, paint: true },
  { id: 'endurance',   name: 'Endurance LMP', note: 'прототип Ле-Мана',     file: RMDL + 'endurance.glb',   len: 4.90, mass: 1050, power: 1.22, paint: true },
  { id: 'wedge',       name: 'Wedge 80s',     note: 'классика · клин',      file: RMDL + 'wedge.glb',       len: 4.40, mass: 1320, power: 0.96, paint: true },
  { id: 'rally',       name: 'Rally Raid',    note: '4x4 · внедорожный',    file: RMDL + 'rally.glb',       len: 4.60, mass: 2050, power: 0.92, paint: true },
  { id: 'streamliner', name: 'Streamliner',   note: 'рекорд скорости',      file: RMDL + 'streamliner.glb', len: 5.20, mass: 1280, power: 1.26, paint: true }
];
var PAINTS = [
  { n: 'Marina Bay Blue', c: 0x0c63b4 }, { n: 'Frozen Red', c: 0x7a1220 },
  { n: 'Alpine White', c: 0xeef1f4 },    { n: 'Black Sapphire', c: 0x0a0c10 },
  { n: 'Donington Grey', c: 0x4e5257 },  { n: 'Sao Paulo Yellow', c: 0xe0b200 },
  { n: 'Isle of Man Green', c: 0x16412a }
];

/* ---------------------------------------------------------------- renderer */
var renderer, scene, camera, composer, bloomPass, smaaPass, clock;
var sun, hemi, ambient;
var TRAFFIC_MODELS = ['hypercar_lod', 'wedge_lod', 'endurance_lod', 'streamliner_lod'];

var loaded = { tex: {}, gltf: {}, env: null };

/* ---------------------------------------------------------------- loading */
var manager = new THREE.LoadingManager();
var barFill = document.getElementById('barFill');
var loadTxt = document.getElementById('loadTxt');
manager.onProgress = function (url, a, b) {
  barFill.style.width = (a / b * 100).toFixed(0) + '%';
  loadTxt.textContent = 'загрузка ' + a + ' / ' + b;
};
manager.onError = function (url) { console.warn('load error', String(url).slice(0, 80)); };

/* --- stall guard: never let one bad asset freeze the loading screen --- */
var _pend = {}, _lastTick = Date.now();
var _itemStart = manager.itemStart.bind(manager);
var _itemEnd = manager.itemEnd.bind(manager);
manager.itemStart = function (u) { _pend[u] = (_pend[u] || 0) + 1; _lastTick = Date.now(); _itemStart(u); };
manager.itemEnd = function (u) {
  if (_pend[u]) { _pend[u]--; if (!_pend[u]) delete _pend[u]; }
  _lastTick = Date.now(); _itemEnd(u);
};

var texLoader = new THREE.TextureLoader(manager);
var gltfLoader = new THREE.GLTFLoader(manager);
var dracoLoader = new THREE.DRACOLoader();
dracoLoader.setDecoderPath(window.__DRACO_PATH__ || 'assets/lib/draco/');
dracoLoader.setDecoderConfig({ type: 'js' });
gltfLoader.setDRACOLoader(dracoLoader);
var rgbeLoader = new THREE.RGBELoader(manager);

function loadPBR(name, repeat, opts) {
  opts = opts || {};
  var t = {};
  t.map = texLoader.load(A(TEX + name + '_c.jpg'));
  t.map.encoding = THREE.sRGBEncoding;
  if (opts.normal !== false) t.normalMap = texLoader.load(A(TEX + name + '_n.jpg'));
  if (opts.rough !== false) t.roughnessMap = texLoader.load(A(TEX + name + '_r.jpg'));
  Object.keys(t).forEach(function (k) {
    var tx = t[k];
    tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
    tx.repeat.set(repeat, repeat);
    tx.anisotropy = 8;
  });
  loaded.tex[name] = t;
  return t;
}

function startLoading(done) {
  loadPBR('asphalt', 1);
  loadPBR('grass', 1);
  loadPBR('paving', 1);
  loadPBR('concrete', 1);
  loadPBR('bark', 1);
  loadPBR('rock', 1);
  loadPBR('metal', 1);
  for (var i = 1; i <= 6; i++) {
    var f = loadPBR('facade' + i, 1, { normal: false, rough: false });
    f.emissiveMap = texLoader.load(A(TEX + 'facade' + i + '_e.jpg'));
    f.emissiveMap.wrapS = f.emissiveMap.wrapT = THREE.RepeatWrapping;
  }
  loaded.tex.leaf = texLoader.load(A(TEX + 'leaf.png'));
  loaded.tex.leaf.encoding = THREE.sRGBEncoding;
  loaded.tex.marks = texLoader.load(A(TEX + 'marks.png'));
  loaded.tex.marks.wrapS = loaded.tex.marks.wrapT = THREE.RepeatWrapping;
  loaded.tex.marks.anisotropy = 8;

  rgbeLoader.load(A(ASSETS + 'env/sky.hdr'), function (hdr) { loaded.env = hdr; });

  CAR_LIST.forEach(function (c) {
    if (!c.file) return;
    gltfLoader.load(A(c.file), function (g) { loaded.gltf[c.id] = g; });
  });
  TRAFFIC_MODELS.forEach(function (m) {
    gltfLoader.load(A(MDL + 'cars/' + m + '.glb'), function (g) { loaded.gltf['t_' + m] = g; });
  });
  gltfLoader.load(A(MDL + 'cone.glb'), function (g) { loaded.gltf.cone = g; });

  var finished = false, wd = 0;
  function finish() {
    if (finished) return; finished = true;
    if (wd) clearInterval(wd);
    barFill.style.width = '100%';
    setTimeout(done, 60);
  }
  manager.onLoad = finish;
  wd = setInterval(function () {
    if (finished) { clearInterval(wd); return; }
    if (Date.now() - _lastTick > 12000) {
      var stuck = Object.keys(_pend).map(function (u) {
        return /^data:/.test(u) ? u.slice(5, 28) : u.split('/').pop();
      });
      console.warn('loading stalled, skipping:', stuck.slice(0, 6).join(', '));
      loadTxt.textContent = 'пропускаем зависшие файлы…';
      finish();
    }
  }, 1000);
}

/* ================================================================
   RENDERER / SCENE
   ================================================================ */
function initRenderer() {
  renderer = new THREE.WebGLRenderer({ antialias: S.quality < 2, powerPreference: 'high-performance', stencil: false });
  S.basePR = Math.min(devicePixelRatio || 1, S.quality >= 2 ? 2 : (S.quality >= 1 ? 1.35 : 1));
  S.resScale = 1;
  renderer.setPixelRatio(S.basePR);
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = S.quality >= 2 ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  renderer.physicallyCorrectLights = false;
  document.getElementById('app').appendChild(renderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.25, 5000);
  camera.position.set(0, 5, -10);
  clock = new THREE.Clock();

  // environment from HDRI
  var pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  if (loaded.env) {
    var envRT = pmrem.fromEquirectangular(loaded.env);
    scene.environment = envRT.texture;
    loaded.env.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = loaded.env;
  }
  pmrem.dispose();

  applyTimeOfDay();

  if (S.quality >= 2) initPost();
}

function setEnvIntensity(worldK) {
  scene.traverse(function (o) {
    if (!o.isMesh) return;
    var ms = Array.isArray(o.material) ? o.material : [o.material];
    ms.forEach(function (m) {
      if (!m || m.envMapIntensity === undefined) return;
      if (m.userData.isCar) return;
      m.envMapIntensity = worldK * (m.userData.envBase || 1);
      m.needsUpdate = false;
    });
  });
}

function applyTimeOfDay() {
  var cfg = {
    day:    { sun: 0xfff4e2, si: 1.35, hemiS: 0xbcd9ff, hemiG: 0x55503f, hi: 0.18, fog: 0xb9d1e8, fogN: 340, fogF: 2400, exp: 0.62, bg: 1.0, amb: 0.03 },
    sunset: { sun: 0xffa75c, si: 1.4, hemiS: 0xffc89a, hemiG: 0x3a3330, hi: 0.22, fog: 0xd79a6c, fogN: 180, fogF: 1600, exp: 0.62, bg: 0.55, amb: 0.08 },
    night:  { sun: 0x52719e, si: 0.18, hemiS: 0x24324f, hemiG: 0x0b0d12, hi: 0.18, fog: 0x090e16, fogN: 70,  fogF: 620,  exp: 1.0, bg: 0.09, amb: 0.05 }
  }[S.timeOfDay];

  if (!sun) {
    sun = new THREE.DirectionalLight(0xffffff, 1);
    sun.castShadow = true;
    var sz = S.quality >= 2 ? 85 : 60;
    var sm = S.quality >= 2 ? 2048 : (S.quality >= 1 ? 1536 : 1024);
    sun.shadow.mapSize.set(sm, sm);
    sun.shadow.camera.left = -sz; sun.shadow.camera.right = sz;
    sun.shadow.camera.top = sz; sun.shadow.camera.bottom = -sz;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 330;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.035;
    scene.add(sun); scene.add(sun.target);
    hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.5); scene.add(hemi);
    ambient = new THREE.AmbientLight(0xffffff, 0.15); scene.add(ambient);
  }
  sun.color.setHex(cfg.sun); sun.intensity = cfg.si;
  sun.position.set(S.timeOfDay === 'sunset' ? 320 : 150, S.timeOfDay === 'sunset' ? 70 : 230, 150);
  hemi.color.setHex(cfg.hemiS); hemi.groundColor.setHex(cfg.hemiG); hemi.intensity = cfg.hi;
  ambient.intensity = cfg.amb;
  scene.fog = new THREE.Fog(cfg.fog, cfg.fogN, cfg.fogF);
  renderer.toneMappingExposure = cfg.exp;
  if (scene.background && scene.background.isTexture) {
    if (cfg.bg < 1) { scene.background = new THREE.Color(cfg.fog); }
  }
  if (S.timeOfDay === 'night') { scene.background = new THREE.Color(0x070b12); }
  S.night = S.timeOfDay === 'night';
  S.envK = S.timeOfDay === 'night' ? 0.09 : (S.timeOfDay === 'sunset' ? 0.3 : 0.45);
  if (scene.children.length > 4) setEnvIntensity(S.envK);
}

function initPost() {
  composer = new THREE.EffectComposer(renderer);
  composer.addPass(new THREE.RenderPass(scene, camera));
  bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.42, 0.7, 0.86);
  composer.addPass(bloomPass);
  if (S.quality >= 2) {
    smaaPass = new THREE.SMAAPass(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio());
    composer.addPass(smaaPass);
  }
}

/* ================================================================
   PHYSICS WORLD
   ================================================================ */
var pworld, groundMat, wheelMat;
function initPhysics() {
  pworld = new CANNON.World();
  pworld.gravity.set(0, -9.82, 0);
  pworld.broadphase = new CANNON.SAPBroadphase(pworld);
  pworld.defaultContactMaterial.friction = 0.25;
  pworld.solver.iterations = 10;

  groundMat = new CANNON.Material('ground');
  wheelMat = new CANNON.Material('wheel');
  pworld.addContactMaterial(new CANNON.ContactMaterial(wheelMat, groundMat, {
    friction: 0.0, restitution: 0, contactEquationStiffness: 1000
  }));

  var g = new CANNON.Body({ mass: 0, material: groundMat });
  g.addShape(new CANNON.Plane());
  g.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
  pworld.addBody(g);
}

function addStaticBox(x, y, z, hx, hy, hz) {
  var b = new CANNON.Body({ mass: 0, material: groundMat });
  b.addShape(new CANNON.Box(new CANNON.Vec3(hx, hy, hz)));
  b.position.set(x, y, z);
  pworld.addBody(b);
  return b;
}

/* ================================================================
   WORLD / MAP
   ================================================================ */
var BLOCK = 118, ROADW = 20, GRID = 5, HALF = 2;
var roadPos = [], cityExtent = HALF * BLOCK + BLOCK / 2;
var RING = cityExtent + 190;
var roadRects = [], buildingsMM = [];
var mats = {};

function M(texName, over) {
  var t = loaded.tex[texName] || {};
  var p = { roughness: 1, metalness: 0 };
  if (t.map) p.map = t.map.clone(), p.map.needsUpdate = true;
  if (t.normalMap) p.normalMap = t.normalMap.clone(), p.normalMap.needsUpdate = true;
  if (t.roughnessMap) p.roughnessMap = t.roughnessMap.clone(), p.roughnessMap.needsUpdate = true;
  if (t.emissiveMap) p.emissiveMap = t.emissiveMap.clone(), p.emissiveMap.needsUpdate = true;
  p.envMapIntensity = 0.35;
  var m = new THREE.MeshStandardMaterial(Object.assign(p, over || {}));
  return m;
}
function setRepeat(mat, rx, ry) {
  ['map', 'normalMap', 'roughnessMap', 'emissiveMap'].forEach(function (k) {
    if (mat[k]) { mat[k].wrapS = mat[k].wrapT = THREE.RepeatWrapping; mat[k].repeat.set(rx, ry); mat[k].anisotropy = 8; mat[k].needsUpdate = true; }
  });
  return mat;
}

function buildWorld() {
  for (var i = -HALF; i <= HALF; i++) roadPos.push(i * BLOCK);

  /* ---------- ground ---------- */
  mats.grass = setRepeat(M('grass', { roughness: 1, polygonOffset: true, polygonOffsetFactor: 4, polygonOffsetUnits: 8 }), 420, 420);
  var ground = new THREE.Mesh(new THREE.PlaneGeometry(4200, 4200), mats.grass);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  /* ---------- roads ---------- */
  mats.road = M('asphalt', { roughness: 0.95, metalness: 0.0 });
  mats.marks = new THREE.MeshBasicMaterial({ map: loaded.tex.marks, transparent: true, depthWrite: false, opacity: 0.95, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 });

  roadPos.forEach(function (p) {
    addRoad(p, 0, ROADW, cityExtent * 2);
    addRoad(0, p, cityExtent * 2, ROADW);
  });
  // connectors to the ring road
  var cl = RING - cityExtent + 160;
  addRoad(0, (cityExtent + RING) / 2 + 20, ROADW, cl);
  addRoad(0, -((cityExtent + RING) / 2 + 20), ROADW, cl);
  addRoad((cityExtent + RING) / 2 + 20, 0, cl, ROADW);
  addRoad(-((cityExtent + RING) / 2 + 20), 0, cl, ROADW);

  buildRing();

  /* ---------- city blocks ---------- */
  mats.walk = M('paving', { roughness: 0.92 });
  mats.concrete = M('concrete', { roughness: 0.92 });
  mats.rock = setRepeat(M('rock', { roughness: 1 }), 6, 6);
  mats.metal = M('metal', { roughness: 0.4, metalness: 0.9 });
  mats.bark = setRepeat(M('bark', { roughness: 0.95 }), 1, 3);
  mats.leaf = new THREE.MeshStandardMaterial({
    map: loaded.tex.leaf, transparent: true, alphaTest: 0.42, side: THREE.DoubleSide,
    roughness: 0.95, metalness: 0, envMapIntensity: 0.25, color: 0xbfd6a8
  });

  mats.facade = [];
  for (var f = 1; f <= 6; f++) {
    mats.facade.push(M('facade' + f, {
      roughness: 0.78, metalness: 0.04,
      emissive: new THREE.Color(0xffe9bd), emissiveIntensity: 0
    }));
  }

  var treeData = [], lampData = [];

  for (var bi = -HALF; bi < HALF; bi++) {
    for (var bj = -HALF; bj < HALF; bj++) {
      var cx = bi * BLOCK + BLOCK / 2, cz = bj * BLOCK + BLOCK / 2;
      var inner = BLOCK - ROADW - 8;
      addSidewalk(cx, cz, inner + 9, inner + 9);

      var isPark = Math.random() < 0.2;
      if (isPark) {
        for (var k = 0; k < 16; k++)
          treeData.push([cx + rand(-inner / 2 + 4, inner / 2 - 4), cz + rand(-inner / 2 + 4, inner / 2 - 4), rand(0.85, 1.6)]);
        addFountain(cx, cz);
      } else {
        var cells = Math.random() < 0.45 ? 2 : 3, cs = inner / cells;
        for (var a = 0; a < cells; a++) for (var b = 0; b < cells; b++) {
          if (Math.random() < 0.1) continue;
          var bx = cx - inner / 2 + cs / 2 + a * cs, bz = cz - inner / 2 + cs / 2 + b * cs;
          var w = cs * rand(0.68, 0.92), d = cs * rand(0.68, 0.92);
          var centerW = clamp(1 - Math.hypot(cx, cz) / (cityExtent * 1.25), 0.05, 1);
          addBuilding(bx, bz, w, d, rand(12, 24) + centerW * rand(14, 78));
        }
        for (var t = 0; t < 5; t++) {
          var o = inner / 2 + 3.6;
          var ang = t / 5 * TAU;
          treeData.push([cx + Math.cos(ang) * o * rand(0.7, 1), cz + Math.sin(ang) * o * rand(0.7, 1), rand(0.9, 1.3)]);
        }
      }
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (s, idx) {
        lampData.push([cx + s[0] * (inner / 2 + 4.6), cz + s[1] * (inner / 2 + 4.6), idx * Math.PI / 2]);
      });
    }
  }

  // countryside trees
  for (var ct = 0; ct < 300; ct++) {
    var aa = Math.random() * TAU, rr = rand(cityExtent + 30, RING + 300);
    treeData.push([Math.cos(aa) * rr, Math.sin(aa) * rr, rand(1.0, 2.1)]);
  }

  mergeCityGeometry();
  buildTrees(treeData);
  buildLamps(lampData);
  buildMountains();
  placeParkedCars();
  placeCones();
}

function scaleUV(geo, su, sv) {
  var uv = geo.attributes.uv;
  for (var i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  uv.needsUpdate = true;
  return geo;
}

function addRoad(x, z, w, d) {
  var geo = scaleUV(new THREE.PlaneGeometry(w, d), w / 4.5, d / 4.5);
  var mesh = new THREE.Mesh(geo, mats.road);
  mesh.name = 'road';
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, 0.05, z);
  mesh.receiveShadow = true;
  scene.add(mesh);
  roadRects.push({ x: x, z: z, w: w, d: d });

  var vertical = d > w;
  var mg = scaleUV(new THREE.PlaneGeometry(vertical ? w : d, vertical ? d : w), 1, (vertical ? d : w) / 22);
  var dec = new THREE.Mesh(mg, mats.marks);
  dec.rotation.x = -Math.PI / 2;
  if (!vertical) dec.rotation.z = Math.PI / 2;
  dec.position.set(x, 0.085, z);
  dec.renderOrder = 2;
  scene.add(dec);
}

function addSidewalk(x, z, w, d) {
  var geo = scaleUV(new THREE.BoxGeometry(w, 0.3, d), w / 5, d / 5);
  var mesh = new THREE.Mesh(geo, mats.walk);
  mesh.position.set(x, 0.15, z);
  mesh.receiveShadow = true;
  scene.add(mesh);
}

var bldBuckets = null, roofGeos = null;
function addBuilding(x, z, w, d, h) {
  var mi = randi(0, mats.facade.length - 1);
  var geo = new THREE.BoxGeometry(w, h, d);
  var uv = geo.attributes.uv;
  var su = [d / 7, d / 7, w / 7, w / 7, w / 7, w / 7];
  var sv = [h / 7, h / 7, d / 7, d / 7, h / 7, h / 7];
  for (var f = 0; f < 6; f++) {
    for (var i = f * 4; i < f * 4 + 4; i++) uv.setXY(i, uv.getX(i) * su[f], uv.getY(i) * sv[f]);
  }
  uv.needsUpdate = true;
  geo.translate(x, h / 2, z);
  if (!bldBuckets) { bldBuckets = []; roofGeos = []; }
  (bldBuckets[mi] = bldBuckets[mi] || []).push(geo);

  var roof = scaleUV(new THREE.BoxGeometry(w + 0.8, 0.7, d + 0.8), w / 6, d / 6);
  roof.translate(x, h + 0.35, z);
  roofGeos.push(roof);
  if (Math.random() < 0.6) {
    var ac = new THREE.BoxGeometry(rand(2, 5), rand(1.6, 3.2), rand(2, 5));
    ac.translate(x + rand(-w / 4, w / 4), h + 1.6, z + rand(-d / 4, d / 4));
    roofGeos.push(ac);
  }
  addStaticBox(x, h / 2, z, w / 2, h / 2, d / 2);
  buildingsMM.push({ x: x, z: z, hx: w / 2, hz: d / 2 });
}

/* склеиваем все дома в несколько мешей — сотни draw call превращаются в единицы */
function mergeCityGeometry() {
  if (!bldBuckets) return;
  var BGU = THREE.BufferGeometryUtils;
  for (var mi = 0; mi < bldBuckets.length; mi++) {
    var list = bldBuckets[mi];
    if (!list || !list.length) continue;
    var merged = BGU.mergeBufferGeometries(list, false);
    list.forEach(function (g) { g.dispose(); });
    var mesh = new THREE.Mesh(merged, mats.facade[mi]);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    scene.add(mesh);
  }
  if (roofGeos.length) {
    var rmg = BGU.mergeBufferGeometries(roofGeos, false);
    roofGeos.forEach(function (g) { g.dispose(); });
    var rm = new THREE.Mesh(rmg, mats.concrete);
    rm.castShadow = true; rm.receiveShadow = true;
    rm.frustumCulled = false;
    scene.add(rm);
  }
  bldBuckets = null; roofGeos = null;
}

function addFountain(x, z) {
  var base = new THREE.Mesh(new THREE.CylinderGeometry(5, 5.4, 0.8, 24), mats.concrete);
  base.position.set(x, 0.4, z); base.castShadow = base.receiveShadow = true; scene.add(base);
  var water = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.5, 0.4, 24),
    new THREE.MeshStandardMaterial({ color: 0x2e6c8f, roughness: 0.08, metalness: 0.2, envMapIntensity: 1.4 }));
  water.position.set(x, 0.75, z); scene.add(water);
  var col = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 3, 14), mats.concrete);
  col.position.set(x, 2, z); col.castShadow = true; scene.add(col);
  addStaticBox(x, 1, z, 5, 1, 5);
}

/* ---------- trees (instanced trunks + crossed leaf cards) ---------- */
function buildTrees(data) {
  var trunkGeo = new THREE.CylinderGeometry(0.17, 0.3, 2.9, 7);
  trunkGeo.translate(0, 1.45, 0);
  var trunks = new THREE.InstancedMesh(trunkGeo, mats.bark, data.length);
  trunks.castShadow = true; trunks.receiveShadow = true;

  // crown: 3 crossed quads + 2 blobs
  var planes = [];
  for (var i = 0; i < 3; i++) {
    var p = new THREE.PlaneGeometry(5.0, 4.4);
    p.rotateY(i * Math.PI / 3);
    p.translate(0, 3.5, 0);
    planes.push(p);
  }
  var cap = new THREE.PlaneGeometry(4.4, 4.4);
  cap.rotateX(-Math.PI / 2); cap.translate(0, 4.6, 0);
  planes.push(cap);
  var crownGeo = THREE.BufferGeometryUtils.mergeBufferGeometries(planes);
  var crowns = new THREE.InstancedMesh(crownGeo, mats.leaf, data.length);
  crowns.castShadow = true;

  var dm = new THREE.Object3D();
  for (var k = 0; k < data.length; k++) {
    var d = data[k];
    dm.position.set(d[0], 0, d[1]);
    dm.rotation.y = Math.random() * TAU;
    dm.scale.setScalar(d[2]);
    dm.updateMatrix();
    trunks.setMatrixAt(k, dm.matrix);
    crowns.setMatrixAt(k, dm.matrix);
    addStaticBox(d[0], 2 * d[2], d[1], 0.4 * d[2], 2 * d[2], 0.4 * d[2]);
  }
  scene.add(trunks); scene.add(crowns);
}

/* ---------- street lamps ---------- */
var lampLights = [];
function buildLamps(data) {
  var poleGeo = new THREE.CylinderGeometry(0.12, 0.17, 7.4, 8);
  poleGeo.translate(0, 3.7, 0);
  var armGeo = new THREE.BoxGeometry(2.2, 0.15, 0.15); armGeo.translate(1.1, 7.2, 0);
  var geo = THREE.BufferGeometryUtils.mergeBufferGeometries([poleGeo, armGeo]);
  var poles = new THREE.InstancedMesh(geo, mats.metal, data.length);
  poles.castShadow = true;

  var headGeo = new THREE.BoxGeometry(1.2, 0.22, 0.5); headGeo.translate(2.05, 7.05, 0);
  var headMat = new THREE.MeshStandardMaterial({ color: 0x15181c, emissive: 0xffe1a8, emissiveIntensity: 0 });
  mats.lampHead = headMat;
  var heads = new THREE.InstancedMesh(headGeo, headMat, data.length);

  var dm = new THREE.Object3D();
  for (var i = 0; i < data.length; i++) {
    dm.position.set(data[i][0], 0, data[i][1]);
    dm.rotation.y = data[i][2];
    dm.scale.setScalar(1);
    dm.updateMatrix();
    poles.setMatrixAt(i, dm.matrix);
    heads.setMatrixAt(i, dm.matrix);
  }
  scene.add(poles); scene.add(heads);
  lampLights = data;
}

function buildMountains() {
  var geoCache = [];
  for (var v = 0; v < 4; v++) geoCache.push(new THREE.ConeGeometry(1, 1, 6 + v % 3, 2));
  var snowMat = new THREE.MeshStandardMaterial({ color: 0xe9f1f7, roughness: 0.85, flatShading: true });
  var rockMat = mats.rock.clone(); rockMat.flatShading = true;
  for (var i = 0; i < 52; i++) {
    var a = i / 52 * TAU + rand(-0.04, 0.04);
    var r = rand(1500, 1850), h = rand(150, 420), rad = rand(150, 290);
    var m = new THREE.Mesh(geoCache[i % 4], rockMat);
    m.scale.set(rad, h, rad);
    m.position.set(Math.cos(a) * r, h / 2 - 15, Math.sin(a) * r);
    m.rotation.y = Math.random() * TAU;
    scene.add(m);
    if (h > 290) {
      var c = new THREE.Mesh(geoCache[i % 4], snowMat);
      c.scale.set(rad * 0.34, h * 0.28, rad * 0.34);
      c.position.set(m.position.x, h - h * 0.14 - 15, m.position.z);
      c.rotation.y = m.rotation.y;
      scene.add(c);
    }
  }
}

/* ---------- ring highway ---------- */
var ringCurve;
function buildRing() {
  var pts = [], segs = 90, rw = 24;
  for (var i = 0; i < segs; i++) {
    var a = i / segs * TAU;
    var r = RING + Math.sin(a * 3) * 60 + Math.cos(a * 5) * 28;
    pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
  }
  ringCurve = new THREE.CatmullRomCurve3(pts, true);
  var steps = 500, pos = [], uv = [], idx = [], up = new THREE.Vector3(0, 1, 0);
  for (var s = 0; s <= steps; s++) {
    var t = s / steps, p = ringCurve.getPoint(t), tan = ringCurve.getTangent(t).normalize();
    var side = new THREE.Vector3().crossVectors(up, tan).normalize().multiplyScalar(rw / 2);
    pos.push(p.x - side.x, 0.05, p.z - side.z, p.x + side.x, 0.05, p.z + side.z);
    uv.push(0, t * 290, 1, t * 290);
    if (s < steps) { var o = s * 2; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
  }
  var geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx); geo.computeVertexNormals();
  var rm = mats.road;
  var mesh = new THREE.Mesh(geo, rm);
  mesh.receiveShadow = true;
  scene.add(mesh);

  // guard rails (instanced posts + rail ribbon)
  var postGeo = new THREE.BoxGeometry(0.22, 1.1, 0.22); postGeo.translate(0, 0.55, 0);
  var n = 220;
  var posts = new THREE.InstancedMesh(postGeo, mats.metal, n * 2);
  posts.castShadow = true;
  var dm = new THREE.Object3D(), ci = 0;
  for (var q = 0; q < n; q++) {
    var tt = q / n, pp = ringCurve.getPoint(tt), tg = ringCurve.getTangent(tt).normalize();
    var sd = new THREE.Vector3().crossVectors(up, tg).normalize();
    for (var sgn = -1; sgn <= 1; sgn += 2) {
      dm.position.set(pp.x + sd.x * sgn * (rw / 2 + 1.3), 0, pp.z + sd.z * sgn * (rw / 2 + 1.3));
      dm.rotation.y = Math.atan2(tg.x, tg.z);
      dm.scale.setScalar(1); dm.updateMatrix();
      posts.setMatrixAt(ci++, dm.matrix);
    }
  }
  scene.add(posts);
}

/* ---------- parked cars + cones ---------- */
var dynamicProps = [];
function prepModel(gltf, targetLen) {
  // returns {root, wheels:[{obj,pos,radius,rest}], chassis:{hx,hy,hz,center}}
  var src = gltf.scene.clone(true);
  src.updateMatrixWorld(true);
  var bb = new THREE.Box3().setFromObject(src);
  var size = bb.getSize(new THREE.Vector3());
  if (size.x > size.z) { src.rotation.y = Math.PI / 2; src.updateMatrixWorld(true); bb = new THREE.Box3().setFromObject(src); size = bb.getSize(new THREE.Vector3()); }
  var scale = targetLen / size.z;
  src.scale.multiplyScalar(scale);
  src.updateMatrixWorld(true);
  return src;
}

function placeParkedCars() {
  var available = TRAFFIC_MODELS.filter(function (m) { return loaded.gltf['t_' + m]; });
  if (!available.length) return;
  var COUNT = S.quality >= 2 ? 34 : 22;
  var placements = {};
  for (var i = 0; i < COUNT; i++) {
    var name = available[randi(0, available.length - 1)];
    var rp = roadPos[randi(0, roadPos.length - 1)];
    var along = rand(-cityExtent + 30, cityExtent - 30);
    var vertical = Math.random() < 0.5;
    var offs = (Math.random() < 0.5 ? -1 : 1) * (ROADW / 2 - 2.1);
    var px, pz, ry;
    if (vertical) { px = rp + offs; pz = along; ry = offs > 0 ? Math.PI : 0; }
    else { px = along; pz = rp + offs; ry = offs > 0 ? -Math.PI / 2 : Math.PI / 2; }
    (placements[name] = placements[name] || []).push([px, pz, ry, vertical]);
  }

  Object.keys(placements).forEach(function (name) {
    var tpl = prepModel(loaded.gltf['t_' + name], 4.6);
    tpl.updateMatrixWorld(true);
    var box = new THREE.Box3().setFromObject(tpl);
    var sz = box.getSize(new THREE.Vector3());
    var yFix = -box.min.y;
    var parts = [];
    tpl.traverse(function (o) {
      if (!o.isMesh) return;
      var g = o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      parts.push({ geo: g, mat: o.material });
    });
    var list = placements[name], n = list.length;
    var dummy = new THREE.Object3D();
    parts.forEach(function (pt) {
      var inst = new THREE.InstancedMesh(pt.geo, pt.mat, n);
      inst.castShadow = S.quality >= 1; inst.receiveShadow = true;
      inst.frustumCulled = false;
      for (var k = 0; k < n; k++) {
        dummy.position.set(list[k][0], yFix, list[k][1]);
        dummy.rotation.set(0, list[k][2], 0);
        dummy.updateMatrix();
        inst.setMatrixAt(k, dummy.matrix);
      }
      inst.instanceMatrix.needsUpdate = true;
      scene.add(inst);
    });
    for (var k2 = 0; k2 < n; k2++) {
      var vertical2 = list[k2][3];
      addStaticBox(list[k2][0], sz.y / 2, list[k2][1],
        (vertical2 ? sz.x : sz.z) / 2 * 0.92, sz.y / 2, (vertical2 ? sz.z : sz.x) / 2 * 0.92);
    }
  });
}

function placeCones() {
  var g = loaded.gltf.cone;
  if (!g) return;
  for (var i = 0; i < 30; i++) {
    var m = prepModel(g, 0.75);
    var rp = roadPos[randi(0, roadPos.length - 1)];
    var along = rand(-cityExtent, cityExtent);
    var px, pz;
    if (Math.random() < 0.5) { px = rp + rand(-6, 6); pz = along; } else { px = along; pz = rp + rand(-6, 6); }
    m.traverse(function (o) { if (o.isMesh) o.castShadow = false; });
    m.position.set(px, 0, pz);
    scene.add(m);
    var body = new CANNON.Body({ mass: 2, material: groundMat });
    body.addShape(new CANNON.Box(new CANNON.Vec3(0.35, 0.4, 0.35)), new CANNON.Vec3(0, 0.4, 0));
    body.position.set(px, 0.05, pz);
    body.linearDamping = 0.25; body.angularDamping = 0.3;
    pworld.addBody(body);
    dynamicProps.push({ mesh: m, body: body });
  }
}

/* ================================================================
   VEHICLE
   ================================================================ */
var V = {
  spec: null, vehicle: null, chassis: null, root: null, wheelMeshes: [],
  paintMats: [], tailMats: [], headMats: [], headlights: [], brakeOn: false,
  steer: 0, engine: 0, wheelRadius: 0.35, resetAt: 0
};

function buildProceduralM5() {
  /* ---- stylised but properly-shaped F90: extruded side profile + details ---- */
  var g = new THREE.Group();
  var L = 4.97, W = 1.96, HW = W / 2;
  var WHR = 0.38;                      // wheel radius
  var WBF = 1.49, WBR = -1.49;         // wheel centres (z)

  var paint = new THREE.MeshPhysicalMaterial({
    color: PAINTS[S.colorIndex].c, metalness: 0.75, roughness: 0.26,
    clearcoat: 1.0, clearcoatRoughness: 0.06, envMapIntensity: 1.1
  });
  var dark = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.55, metalness: 0.3, envMapIntensity: 0.6 });
  var carbon = new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.42, metalness: 0.5, envMapIntensity: 0.7 });
  var chrome = new THREE.MeshStandardMaterial({ color: 0xc8ced6, metalness: 1, roughness: 0.16, envMapIntensity: 1.3 });
  var glass = new THREE.MeshPhysicalMaterial({ color: 0x070b11, metalness: 0.1, roughness: 0.06,
    transparent: true, opacity: 0.74, clearcoat: 1, envMapIntensity: 1.4 });
  var head = new THREE.MeshStandardMaterial({ color: 0xd8e6ff, emissive: 0xbcd8ff, emissiveIntensity: 0.9, roughness: 0.12, metalness: 0.2 });
  var tail = new THREE.MeshStandardMaterial({ color: 0x4a0a0e, emissive: 0xff1800, emissiveIntensity: 0.6, roughness: 0.25 });

  function extrude(shape, width, bevel) {
    var geo = new THREE.ExtrudeGeometry(shape, {
      depth: width - (bevel ? bevel * 2 : 0), bevelEnabled: !!bevel,
      bevelSize: bevel || 0, bevelThickness: bevel || 0, bevelSegments: 3, curveSegments: 14
    });
    geo.translate(0, 0, -(width - (bevel ? bevel * 2 : 0)) / 2);
    geo.rotateY(-Math.PI / 2);
    return geo;
  }
  function arch(sh, cz, cy, r, fromLeft) {
    var steps = 14;
    for (var i = 0; i <= steps; i++) {
      var a = Math.PI - (i / steps) * Math.PI;         // 180° -> 0°
      if (!fromLeft) a = (i / steps) * Math.PI;
      sh.lineTo(cz + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
  }

  /* ---------- lower body (no greenhouse) ---------- */
  var b = new THREE.Shape();
  b.moveTo(2.44, 0.32);
  b.lineTo(2.475, 0.58);
  b.quadraticCurveTo(2.46, 0.86, 2.34, 0.96);     // nose
  b.lineTo(1.62, 1.05);                           // hood
  b.quadraticCurveTo(1.22, 1.08, 1.02, 1.12);     // cowl
  b.lineTo(-0.10, 1.145);                         // beltline
  b.lineTo(-1.28, 1.135);
  b.quadraticCurveTo(-1.95, 1.11, -2.22, 1.02);   // boot
  b.lineTo(-2.42, 0.90);                          // tail
  b.lineTo(-2.475, 0.58);
  b.lineTo(-2.40, 0.30);
  b.lineTo(-2.12, 0.27);
  arch(b, WBR, 0.33, 0.62, true);
  b.lineTo(-0.80, 0.21);
  b.lineTo(0.80, 0.21);
  arch(b, WBF, 0.33, 0.62, true);
  b.lineTo(2.38, 0.28);
  b.closePath();
  var body = new THREE.Mesh(extrude(b, W, 0.08), paint);
  body.castShadow = true; body.receiveShadow = true;
  g.add(body);

  /* ---------- greenhouse ---------- */
  var c = new THREE.Shape();
  c.moveTo(1.03, 1.10);
  c.quadraticCurveTo(0.66, 1.28, 0.12, 1.405);     // windscreen rake
  c.lineTo(-0.76, 1.415);                          // roof
  c.quadraticCurveTo(-1.26, 1.35, -1.72, 1.12);    // rear screen
  c.lineTo(-1.30, 1.08);
  c.closePath();
  var cab = new THREE.Mesh(extrude(c, W * 0.72, 0.03), glass);
  cab.castShadow = true;
  g.add(cab);

  // interior (so the cabin isn't hollow)
  var interior = new THREE.Mesh(new THREE.BoxGeometry(W * 0.66, 0.34, 1.9),
    new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.95, envMapIntensity: 0.2 }));
  interior.position.set(0, 1.12, -0.26);
  g.add(interior);
  var seats = new THREE.Mesh(new THREE.BoxGeometry(W * 0.56, 0.3, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.8 }));
  seats.position.set(0, 1.26, -0.1); g.add(seats);

  // carbon roof panel + pillars
  var r = new THREE.Shape();
  r.moveTo(0.14, 1.398);
  r.lineTo(-0.78, 1.408);
  r.lineTo(-0.78, 1.345);
  r.lineTo(0.14, 1.335);
  r.closePath();
  var roofPanel = new THREE.Mesh(extrude(r, W * 0.76, 0.02), carbon);
  roofPanel.castShadow = true; g.add(roofPanel);

  function pillar(x, z0, y0, z1, y1, w, mat) {
    var dz = z1 - z0, dy = y1 - y0, len = Math.hypot(dz, dy);
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, len), mat || paint);
    m.position.set(x, (y0 + y1) / 2, (z0 + z1) / 2);
    m.rotation.x = -Math.atan2(dy, dz);
    m.castShadow = true; g.add(m);
    return m;
  }
  [-1, 1].forEach(function (sgn) {
    var x = sgn * (W * 0.36);
    pillar(x, 1.03, 1.10, 0.13, 1.40, 0.07);        // A pillar
    pillar(x, -0.77, 1.412, -1.70, 1.13, 0.07);     // C pillar
    pillar(x, 0.13, 1.40, -0.77, 1.412, 0.075);     // roof rail
  });

  /* ---------- front detail ---------- */
  function box(w, h, d, mat, x, y, z, rx) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); if (rx) m.rotation.x = rx;
    m.castShadow = true; m.receiveShadow = true; g.add(m); return m;
  }
  var FZ = 2.495, RZ = -2.495;          // body nose / tail planes

  // kidney grille (protrudes slightly from the nose)
  [-0.30, 0.30].forEach(function (x) {
    var fr = box(0.58, 0.46, 0.06, chrome, x, 0.80, FZ - 0.01);
    fr.rotation.x = -0.05;
    var k = box(0.52, 0.40, 0.08, dark, x, 0.80, FZ + 0.015);
    k.rotation.x = -0.05;
    for (var i = 0; i < 5; i++) {
      var bar = box(0.03, 0.36, 0.06, chrome, x - 0.2 + i * 0.1, 0.80, FZ + 0.035);
      bar.rotation.x = -0.05;
    }
  });
  // slim laser headlights
  [-1, 1].forEach(function (sgn) {
    var hl = box(0.64, 0.16, 0.1, head, sgn * 0.63, 1.00, FZ - 0.03);
    hl.rotation.z = sgn * 0.05;
    box(0.68, 0.045, 0.07, dark, sgn * 0.63, 0.905, FZ - 0.02);
  });
  // lower intakes + splitter
  box(0.64, 0.26, 0.08, dark, -0.68, 0.54, FZ + 0.005);
  box(0.64, 0.26, 0.08, dark, 0.68, 0.54, FZ + 0.005);
  box(W * 0.95, 0.06, 0.34, carbon, 0, 0.36, FZ - 0.13);
  // M badge
  box(0.05, 0.04, 0.03, new THREE.MeshStandardMaterial({ color: 0x1668b8 }), -0.05, 1.045, FZ + 0.02);
  box(0.05, 0.04, 0.03, new THREE.MeshStandardMaterial({ color: 0xd4202c }), 0.05, 1.045, FZ + 0.02);

  /* ---------- rear detail ---------- */
  [-1, 1].forEach(function (sgn) {
    box(0.68, 0.19, 0.08, tail, sgn * 0.6, 0.95, RZ - 0.015);     // L-shaped tail lamps
    box(0.26, 0.09, 0.07, tail, sgn * 0.28, 0.95, RZ - 0.01);
  });
  box(W * 0.92, 0.22, 0.1, carbon, 0, 0.45, RZ - 0.02);            // diffuser plate
  for (var fi = 0; fi < 7; fi++) box(0.045, 0.2, 0.22, dark, -0.56 + fi * 0.19, 0.44, RZ - 0.1);
  [-0.78, -0.56, 0.56, 0.78].forEach(function (x) {
    var e = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.095, 0.3, 14), chrome);
    e.rotation.x = Math.PI / 2; e.position.set(x, 0.56, RZ - 0.06);
    e.castShadow = true; g.add(e);
  });
  var sp = box(W * 0.86, 0.045, 0.3, carbon, 0, 1.195, RZ + 0.3); sp.rotation.x = 0.17;

  /* ---------- sides ---------- */
  [-1, 1].forEach(function (sgn) {
    var x = sgn * (HW - 0.02);
    box(0.09, 0.14, 2.5, carbon, sgn * (HW - 0.05), 0.31, -0.1);          // skirt
    var mir = box(0.24, 0.1, 0.14, paint, sgn * (HW + 0.13), 1.2, 0.84);
    mir.rotation.y = sgn * 0.22;
    box(0.12, 0.04, 0.05, dark, sgn * (HW + 0.03), 1.18, 0.8);
    box(0.04, 0.05, 0.26, chrome, sgn * (HW + 0.01), 1.07, 0.3);          // door handles
    box(0.04, 0.05, 0.26, chrome, sgn * (HW + 0.01), 1.07, -0.72);
    box(0.035, 0.12, 0.34, dark, sgn * (HW + 0.01), 0.95, 1.5);           // side gill
    [WBF, WBR].forEach(function (wz) {                                     // arch trim
      var t = new THREE.Mesh(new THREE.TorusGeometry(0.625, 0.03, 6, 20, Math.PI),
        new THREE.MeshStandardMaterial({ color: 0x0d0f12, roughness: 0.9 }));
      t.position.set(sgn * (HW - 0.03), 0.34, wz);
      t.rotation.y = -sgn * Math.PI / 2;
      g.add(t);
    });
  });

  V.paintMats = [paint];
  V.tailMats = [tail];
  V.headMats = [head];

  var wheels = [];
  for (var wi = 0; wi < 4; wi++) wheels.push(buildWheelMesh(WHR, 0.32));
  return {
    root: g, wheels: wheels, radius: WHR,
    wheelPos: [[-0.84, WBF], [0.84, WBF], [-0.84, WBR], [0.84, WBR]],
    chassis: { hx: 0.92, hy: 0.52, hz: 2.32, yOffset: 0.80 }
  };
}

function buildWheelMesh(radius, width) {
  var g = new THREE.Group();
  var tireMat = new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 0.92, metalness: 0.0, envMapIntensity: 0.3 });
  var rimMat = new THREE.MeshStandardMaterial({ color: 0x3a3f46, metalness: 1, roughness: 0.25, envMapIntensity: 1.4 });
  var discMat = new THREE.MeshStandardMaterial({ color: 0x6a6e73, metalness: 0.9, roughness: 0.45 });

  var tire = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 30, 1, false), tireMat);
  tire.rotation.z = Math.PI / 2; tire.castShadow = true; g.add(tire);
  // sidewall bevel
  [-1, 1].forEach(function (s2) {
    var side = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.93, radius * 0.08, 8, 26), tireMat);
    side.position.x = s2 * width / 2; side.rotation.y = Math.PI / 2; g.add(side);
  });
  var rim = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.74, radius * 0.74, width * 0.92, 26), rimMat);
  rim.rotation.z = Math.PI / 2; g.add(rim);
  // 5 double spokes
  for (var i = 0; i < 5; i++) {
    for (var k = -1; k <= 1; k += 2) {
      var sp = new THREE.Mesh(new THREE.BoxGeometry(width * 0.5, radius * 1.38, 0.055), rimMat);
      sp.rotation.z = Math.PI / 2;
      var holder = new THREE.Group();
      holder.add(sp);
      holder.rotation.x = i / 5 * Math.PI * 2 + k * 0.17;
      g.add(holder);
    }
  }
  var disc = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.6, radius * 0.6, 0.05, 22), discMat);
  disc.rotation.z = Math.PI / 2; g.add(disc);
  var hub = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.17, radius * 0.17, width * 0.98, 16), discMat);
  hub.rotation.z = Math.PI / 2; g.add(hub);
  var cal = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.34, 0.16),
    new THREE.MeshStandardMaterial({ color: 0xa81d22, roughness: 0.45, metalness: 0.25 }));
  cal.position.set(0, 0.2, 0); g.add(cal);
  return g;
}

function buildFromGLTF(spec) {
  var src = gltfPrepared(spec);
  if (!src) return buildProceduralM5();
  return src;
}

function gltfPrepared(spec) {
  var gltf = loaded.gltf[spec.id];
  if (!gltf) { console.log('GLTF missing for', spec.id); return null; }
  var root = gltf.scene.clone(true);
  root.updateMatrixWorld(true);

  var bb = new THREE.Box3().setFromObject(root);
  var size = bb.getSize(new THREE.Vector3());
  if (size.x > size.z) { root.rotation.y = Math.PI / 2; root.updateMatrixWorld(true); bb = new THREE.Box3().setFromObject(root); size = bb.getSize(new THREE.Vector3()); }
  var scale = spec.len / size.z;
  root.scale.multiplyScalar(scale);
  root.updateMatrixWorld(true);

  // find wheels — модели вида Name_Wheel_FL_Tyre: собираем части каждого колеса в группу
  var wheelNodes = [];
  var corners = { FL: [], FR: [], RL: [], RR: [] };
  root.traverse(function (o) {
    if (!o.isMesh) return;
    var mm = /_(FL|FR|RL|RR)(_|$)/i.exec(o.name || '');
    if (mm) corners[mm[1].toUpperCase()].push(o);
  });
  if (corners.FL.length && corners.FR.length && corners.RL.length && corners.RR.length) {
    ['FL', 'FR', 'RL', 'RR'].forEach(function (k) {
      var g = new THREE.Group();
      g.name = 'wheelGroup_' + k;
      root.add(g);
      corners[k].forEach(function (mesh) { g.attach(mesh); });
      wheelNodes.push(g);
    });
    root.updateMatrixWorld(true);
  }
  if (!wheelNodes.length)
  root.traverse(function (o) {
    if (/wheel/i.test(o.name) && !/steering/i.test(o.name)) {
      var hasGeo = false;
      o.traverse(function (c) { if (c.isMesh) hasGeo = true; });
      if (hasGeo) {
        var covered = wheelNodes.some(function (w) { return isAncestor(w, o); });
        if (!covered) wheelNodes.push(o);
      }
    }
  });
  if (wheelNodes.length < 4) return null;

  var info = wheelNodes.map(function (o) {
    var b = new THREE.Box3().setFromObject(o);
    var c = b.getCenter(new THREE.Vector3());
    return { obj: o, center: c, size: b.getSize(new THREE.Vector3()) };
  });
  info.sort(function (a, b) { return b.size.y - a.size.y; });
  info = info.slice(0, 4);

  var zAvgFront = 0;
  var zs = info.map(function (i) { return i.center.z; }).sort(function (a, b) { return a - b; });
  var zMid = (zs[0] + zs[3]) / 2;
  var front = info.filter(function (i) { return i.center.z > zMid; });
  var frontNamed = info.filter(function (i) { return /front|_f|fl|fr/i.test(i.obj.name); });
  var flip = false;
  if (frontNamed.length === 2) {
    var nf = (frontNamed[0].center.z + frontNamed[1].center.z) / 2;
    if (nf < zMid) flip = true;
  }
  if (flip) {
    root.rotation.y += Math.PI;
    root.updateMatrixWorld(true);
    info.forEach(function (i) {
      var b = new THREE.Box3().setFromObject(i.obj);
      i.center = b.getCenter(new THREE.Vector3());
      i.size = b.getSize(new THREE.Vector3());
    });
  }

  var radius = Math.max(info[0].size.y, info[0].size.z) / 2;

  // detach wheels, build wheel meshes centred at origin
  var wheelMeshes = [], wheelPos = [];
  info.forEach(function (i) {
    var o = i.obj;
    o.updateWorldMatrix(true, true);
    var holder = new THREE.Group();
    var clone = o.clone(true);
    clone.matrix.copy(o.matrixWorld);
    clone.matrix.decompose(clone.position, clone.quaternion, clone.scale);
    clone.position.sub(i.center);
    holder.add(clone);
    wheelMeshes.push(holder);
    wheelPos.push([i.center.x, i.center.z]);
    o.visible = false;
  });

  // body bbox without wheels
  var bodyBox = new THREE.Box3();
  root.traverse(function (o) {
    if (o.isMesh && o.visible) {
      var p = o;
      var hidden = false;
      while (p) { if (p.visible === false) hidden = true; p = p.parent; }
      if (!hidden) bodyBox.expandByObject(o);
    }
  });
  if (bodyBox.isEmpty()) bodyBox = new THREE.Box3().setFromObject(root);
  var bSize = bodyBox.getSize(new THREE.Vector3());
  var bCenter = bodyBox.getCenter(new THREE.Vector3());

  // collect paint / light materials
  var paintMats = [], tailMats = [], headMats = [];
  root.traverse(function (o) {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    var mt = Array.isArray(o.material) ? o.material : [o.material];
    mt.forEach(function (m, idx) {
      var nm = (m.name || '') + ' ' + (o.name || '');
      var cl = m.clone();
      cl.envMapIntensity = 1.3;
      if (/body_color|body|paint|graphite|liquid/i.test(nm) && !/trim|carbon|glass|tyre|void/i.test(nm) && spec.paint) { cl.metalness = 0.85; cl.roughness = 0.22; paintMats.push(cl); }
      if (/taillight|lights_red|rear_light|light_red|brightring|lightline/i.test(nm)) { cl.emissive = new THREE.Color(0xff1400); cl.emissiveIntensity = 0.6; tailMats.push(cl); }
      if (/projector|headlight|light_white|lights$|^lights/i.test(nm)) { cl.emissive = new THREE.Color(0xcfe3ff); cl.emissiveIntensity = 0.8; headMats.push(cl); }
      if (/glass/i.test(nm)) { cl.transparent = true; cl.opacity = Math.min(cl.opacity, 0.6); cl.roughness = 0.05; cl.metalness = 0; }
      if (Array.isArray(o.material)) o.material[idx] = cl; else o.material = cl;
    });
  });

  V.paintMats = paintMats; V.tailMats = tailMats; V.headMats = headMats;

  // normalise wheel positions relative to body centre (x,z) — body origin at (bCenter.x, 0, bCenter.z)
  var wp = wheelPos.map(function (p) { return [p[0] - bCenter.x, p[1] - bCenter.z]; });
  root.position.x -= bCenter.x;
  root.position.z -= bCenter.z;
  root.position.y -= bodyBox.min.y;   // sit on ground at y=0

  var holder = new THREE.Group();
  holder.add(root);

  return {
    root: holder, wheels: wheelMeshes, radius: radius,
    wheelPos: wp,
    chassis: { hx: bSize.x / 2 * 0.95, hy: bSize.y / 2 * 0.6, hz: bSize.z / 2 * 0.95, yOffset: bSize.y * 0.45 }
  };
}

function isAncestor(a, b) { var p = b.parent; while (p) { if (p === a) return true; p = p.parent; } return false; }

function spawnCar(id) {
  var spec = CAR_LIST.filter(function (c) { return c.id === id; })[0] || CAR_LIST[0];
  V.spec = spec;

  // clean previous
  if (V.root) scene.remove(V.root);
  V.wheelMeshes.forEach(function (w) { scene.remove(w); });
  if (V.vehicle) { V.vehicle.removeFromWorld(pworld); }
  V.headlights.forEach(function (l) { scene.remove(l); scene.remove(l.target); });
  V.headlights = [];

  var built = spec.file ? buildFromGLTF(spec) : buildProceduralM5();
  if (!built) built = buildProceduralM5();

  var modelHolder = built.root;
  V.root = new THREE.Group();
  V.root.add(modelHolder);
  modelHolder.position.y -= built.chassis.yOffset;   // body origin = chassis centre
  scene.add(V.root);
  V.modelHolder = modelHolder;

  V.wheelMeshes = built.wheels;
  V.wheelMeshes.forEach(function (w) {
    w.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(w);
  });
  V.wheelRadius = built.radius;

  // physics chassis
  var c = built.chassis;
  var body = new CANNON.Body({ mass: spec.mass });
  body.addShape(new CANNON.Box(new CANNON.Vec3(c.hx, c.hy, c.hz)), new CANNON.Vec3(0, 0.12, 0));
  body.angularDamping = 0.35;
  body.linearDamping = 0.0;
  V.chassis = body;

  var vehicle = new CANNON.RaycastVehicle({
    chassisBody: body, indexRightAxis: 0, indexUpAxis: 1, indexForwardAxis: 2
  });
  var opt = {
    radius: built.radius,
    directionLocal: new CANNON.Vec3(0, -1, 0),
    suspensionStiffness: 42,
    suspensionRestLength: 0.32,
    frictionSlip: 3.2,
    dampingRelaxation: 2.6,
    dampingCompression: 4.6,
    maxSuspensionForce: 200000,
    rollInfluence: 0.03,
    axleLocal: new CANNON.Vec3(-1, 0, 0),
    chassisConnectionPointLocal: new CANNON.Vec3(),
    maxSuspensionTravel: 0.32,
    customSlidingRotationalSpeed: -40,
    useCustomSlidingRotationalSpeed: true
  };
  built.wheelPos.forEach(function (p) {
    opt.chassisConnectionPointLocal = new CANNON.Vec3(p[0], -c.yOffset + built.radius + 0.22, p[1]);
    vehicle.addWheel(Object.assign({}, opt));
  });
  vehicle.addToWorld(pworld);
  vehicle.wheelInfos.forEach(function (w) { w.material = wheelMat; });
  V.vehicle = vehicle;
  V.front = [];
  // wheels with largest z are the front ones
  var zs = built.wheelPos.map(function (p, i) { return { i: i, z: p[1] }; }).sort(function (a, b) { return b.z - a.z; });
  V.front = [zs[0].i, zs[1].i];
  V.rear = [zs[2].i, zs[3].i];

  // headlight spot lights
  for (var k = 0; k < 2; k++) {
    var sp = new THREE.SpotLight(0xe8f1ff, 0, 90, 0.5, 0.55, 1.3);
    sp.castShadow = false;
    scene.add(sp); scene.add(sp.target);
    V.headlights.push(sp);
  }

  var carEnv = S.timeOfDay === 'night' ? 0.22 : (S.timeOfDay === 'sunset' ? 0.7 : 1.0);
  V.root.traverse(function (o) {
    if (!o.isMesh) return;
    var ms = Array.isArray(o.material) ? o.material : [o.material];
    ms.forEach(function (m) { if (m) { m.userData.isCar = true; if (m.envMapIntensity !== undefined) m.envMapIntensity *= carEnv; } });
  });
  V.wheelMeshes.forEach(function (wm) {
    wm.traverse(function (o) {
      if (!o.isMesh) return;
      var ms = Array.isArray(o.material) ? o.material : [o.material];
      ms.forEach(function (m) { if (m) { m.userData.isCar = true; if (m.envMapIntensity !== undefined) m.envMapIntensity *= carEnv; } });
    });
  });
  applyPaint();
  respawn();
}

function applyPaint() {
  if (!V.spec || !V.spec.paint) return;
  var col = PAINTS[S.colorIndex].c;
  V.paintMats.forEach(function (m) { m.color.setHex(col); });
}

function respawn() {
  var b = V.chassis;
  b.position.set(5, 1.6, -cityExtent + 60);
  b.quaternion.set(0, 0, 0, 1);
  b.velocity.set(0, 0, 0);
  b.angularVelocity.set(0, 0, 0);
  b.wakeUp();
}

/* ================================================================
   INPUT
   ================================================================ */
var keys = {}, touch = { t: 0, b: 0, l: 0, r: 0, hb: 0 };
addEventListener('keydown', function (e) {
  if (!keys[e.code]) onKeyPress(e.code);
  keys[e.code] = true;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].indexOf(e.code) >= 0) e.preventDefault();
}, { passive: false });
addEventListener('keyup', function (e) { keys[e.code] = false; });
addEventListener('blur', function () { keys = {}; });

function onKeyPress(code) {
  if (!S.started) return;
  switch (code) {
    case 'KeyR': respawn(); toast('на старт'); break;
    case 'KeyC': S.camMode = (S.camMode + 1) % 4; toast(['камера: погоня', 'камера: капот', 'камера: бампер', 'камера: кино'][S.camMode]); break;
    case 'KeyH': S.headlights = !S.headlights; toast('фары: ' + (S.headlights ? 'вкл' : 'выкл')); break;
    case 'KeyV':
      if (V.spec.paint) { S.colorIndex = (S.colorIndex + 1) % PAINTS.length; applyPaint(); toast(PAINTS[S.colorIndex].n); }
      else toast('у этой модели фиксированная окраска');
      break;
    case 'Tab': S.showMap = !S.showMap; document.getElementById('mapWrap').classList.toggle('on', S.showMap); break;
    case 'KeyF': toggleFullscreen(); break;
    case 'Escape': togglePause(); break;
  }
}

document.querySelectorAll('.tbtn').forEach(function (el) {
  var k = el.dataset.k;
  var on = function (e) { e.preventDefault(); touch[k] = 1; el.classList.add('on'); };
  var off = function (e) { e.preventDefault(); touch[k] = 0; el.classList.remove('on'); };
  el.addEventListener('touchstart', on, { passive: false });
  el.addEventListener('touchend', off, { passive: false });
  el.addEventListener('mousedown', on); el.addEventListener('mouseup', off); el.addEventListener('mouseleave', off);
});

/* ================================================================
   DRIVING
   ================================================================ */
var engineRpm = 900, gearNum = 1, speedKmh = 0;
var GEARS = [0, 22, 42, 66, 94, 128, 170, 330];

function updateVehicle(dt) {
  var th = (keys.KeyW || keys.ArrowUp || touch.t) ? 1 : 0;
  var br = (keys.KeyS || keys.ArrowDown || touch.b) ? 1 : 0;
  var lf = (keys.KeyA || keys.ArrowLeft || touch.l) ? 1 : 0;
  var rt = (keys.KeyD || keys.ArrowRight || touch.r) ? 1 : 0;
  var hb = (keys.Space || touch.hb) ? 1 : 0;

  var vel = V.chassis.velocity;
  var fwdVec = new CANNON.Vec3(0, 0, 1);
  V.chassis.vectorToWorldFrame(fwdVec, fwdVec);
  var vLong = vel.x * fwdVec.x + vel.z * fwdVec.z;
  var speed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
  speedKmh = speed * 3.6;

  // steering (speed sensitive, smoothed)
  var maxSteer = lerp(0.52, 0.11, clamp(speed / 55, 0, 1));
  var tgt = (lf - rt) * maxSteer;
  V.steer = lerp(V.steer, tgt, 1 - Math.pow(0.0008, dt));
  V.front.forEach(function (i) { V.vehicle.setSteeringValue(V.steer, i); });

  // engine
  var vmax = 95 * V.spec.power;
  var curve = 1 - Math.pow(clamp(Math.abs(vLong) / vmax, 0, 1), 1.6);
  var maxForce = 9000 * V.spec.power * (V.spec.mass / 1900);
  var force = 0, brakeF = 0;
  if (th) {
    force = -maxForce * curve;                      // negative = forward in cannon's axis convention here
  }
  if (br) {
    if (vLong > 1.0) brakeF = 55;
    else force = maxForce * 0.5;                     // reverse
  }
  if (!th && !br) brakeF = 1.6;                      // engine braking
  if (hb) brakeF = 0;

  V.vehicle.wheelInfos.forEach(function (w, i) {
    var isFront = V.front.indexOf(i) >= 0;
    V.vehicle.applyEngineForce(force * (isFront ? 0.4 : 0.6), i);   // xDrive-ish AWD split
    var bf = brakeF;
    if (hb && !isFront) bf = 18;
    V.vehicle.setBrake(bf, i);
    // grip: handbrake & surface
    var onR = onRoad(V.chassis.position.x, V.chassis.position.z);
    var base = onR ? 3.3 : 1.9;
    if (hb && !isFront) base = 1.1;
    w.frictionSlip = base;
  });

  // aero: downforce + drag
  var downforce = -0.9 * speed * speed;
  V.chassis.applyForce(new CANNON.Vec3(0, downforce, 0), V.chassis.position);
  var drag = 0.35 * speed * speed;
  if (speed > 0.1) {
    V.chassis.applyForce(new CANNON.Vec3(-vel.x / speed * drag, 0, -vel.z / speed * drag), V.chassis.position);
  }

  // anti-flip assist
  var up = new CANNON.Vec3(0, 1, 0);
  V.chassis.vectorToWorldFrame(new CANNON.Vec3(0, 1, 0), up);
  if (up.y < 0.25) {
    V.resetAt += dt;
    if (V.resetAt > 2.2) { respawn(); V.resetAt = 0; toast('перевернулся — респаун'); }
  } else V.resetAt = 0;

  // drift detection (slip angle)
  var side = new CANNON.Vec3(1, 0, 0);
  V.chassis.vectorToWorldFrame(new CANNON.Vec3(1, 0, 0), side);
  var vLat = vel.x * side.x + vel.z * side.z;
  var drifting = Math.abs(vLat) > 3.4 && speed > 7;
  if (drifting) {
    stats.driftCur += Math.abs(vLat) * speed * dt * 0.5;
    stats.driftTime = 1.2;
  } else if (stats.driftTime > 0) {
    stats.driftTime -= dt;
    if (stats.driftTime <= 0) { stats.drift = Math.max(stats.drift, stats.driftCur); stats.driftCur = 0; }
  }
  var dEl = document.getElementById('drift');
  dEl.style.opacity = drifting ? 1 : 0;
  document.getElementById('driftScore').textContent = Math.round(stats.driftCur);

  // tyre smoke + skids
  var slipping = (hb && speed > 6) || drifting || (th && speed < 9 && Math.abs(vLong) > 1.5);
  if (slipping) emitSmokeAndSkid(speed);

  // stats
  stats.top = Math.max(stats.top, speedKmh);
  stats.dist += speed * dt;

  // transmission (visual)
  var g = 1;
  for (var i = 1; i < GEARS.length; i++) if (speedKmh >= GEARS[i - 1]) g = i;
  gearNum = clamp(g, 1, 7);
  var lo = GEARS[gearNum - 1], hi = GEARS[gearNum];
  var targetRpm = lerp(1200, 7400, clamp((speedKmh - lo) / (hi - lo), 0, 1));
  if (speedKmh < 2) targetRpm = th ? 4200 : 900;
  engineRpm = lerp(engineRpm, targetRpm * (th ? 1 : 0.78), 1 - Math.pow(0.02, dt));

  // lights
  var em = br ? 3.4 : (S.headlights ? 1.6 : (S.night ? 0.9 : 0.45));
  V.tailMats.forEach(function (m) { m.emissiveIntensity = em; });
  V.headMats.forEach(function (m) { m.emissiveIntensity = S.headlights ? 2.4 : 0.7; });
  V.brakeOn = !!br;
  V.throttle = th;
  V.handbrake = hb;
  return speed;
}

function onRoad(x, z) {
  for (var i = 0; i < roadPos.length; i++) {
    var p = roadPos[i];
    if (Math.abs(x - p) < ROADW / 2 && Math.abs(z) < cityExtent) return true;
    if (Math.abs(z - p) < ROADW / 2 && Math.abs(x) < cityExtent) return true;
  }
  var r = Math.hypot(x, z), a = Math.atan2(z, x);
  var rr = RING + Math.sin(a * 3) * 60 + Math.cos(a * 5) * 28;
  if (Math.abs(r - rr) < 13) return true;
  if (Math.abs(x) < ROADW / 2 && Math.abs(z) < RING + 80) return true;
  if (Math.abs(z) < ROADW / 2 && Math.abs(x) < RING + 80) return true;
  return false;
}

/* ---------- skid marks & smoke ---------- */
var skidMesh, skidIdx = 0, SKID_MAX = 1200, skidDummy = new THREE.Object3D();
var smokePool = [], smokeIdx = 0;
function initEffects() {
  var geo = new THREE.PlaneGeometry(0.3, 0.7);
  var mat = new THREE.MeshBasicMaterial({ color: 0x0a0a0b, transparent: true, opacity: 0.5, depthWrite: false });
  skidMesh = new THREE.InstancedMesh(geo, mat, SKID_MAX);
  skidMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  skidMesh.count = 0; skidMesh.frustumCulled = false; skidMesh.renderOrder = 2;
  scene.add(skidMesh);

  var smokeTex = makeSmokeTexture();
  for (var i = 0; i < 46; i++) {
    var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, opacity: 0, depthWrite: false, color: 0xd8d8d8 }));
    s.visible = false; scene.add(s);
    smokePool.push({ sp: s, life: 0 });
  }
}
function makeSmokeTexture() {
  var c = document.createElement('canvas'); c.width = c.height = 128;
  var x = c.getContext('2d');
  var g = x.createRadialGradient(64, 64, 2, 64, 64, 62);
  g.addColorStop(0, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.3)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
function emitSmokeAndSkid(speed) {
  for (var i = 0; i < 4; i++) {
    if (V.rear.indexOf(i) < 0) continue;
    var w = V.vehicle.wheelInfos[i];
    if (!w.raycastResult.hitPointWorld) continue;
    var p = w.raycastResult.hitPointWorld;
    if (!w.isInContact) continue;
    skidDummy.position.set(p.x, 0.1, p.z);
    skidDummy.rotation.set(-Math.PI / 2, 0, -carYaw());
    skidDummy.updateMatrix();
    skidMesh.setMatrixAt(skidIdx, skidDummy.matrix);
    skidIdx = (skidIdx + 1) % SKID_MAX;
    skidMesh.count = Math.min(SKID_MAX, skidMesh.count + 1);
    skidMesh.instanceMatrix.needsUpdate = true;
    if (Math.random() < 0.3) {
      var s = smokePool[smokeIdx]; smokeIdx = (smokeIdx + 1) % smokePool.length;
      s.sp.position.set(p.x, 0.3, p.z); s.sp.visible = true; s.life = 1;
      s.sp.scale.setScalar(1.1);
    }
  }
}
function carYaw() {
  var e = new THREE.Euler().setFromQuaternion(
    new THREE.Quaternion(V.chassis.quaternion.x, V.chassis.quaternion.y, V.chassis.quaternion.z, V.chassis.quaternion.w), 'YXZ');
  return e.y;
}

/* ================================================================
   CAMERA
   ================================================================ */
var camPos = new THREE.Vector3(0, 6, -12), camLook = new THREE.Vector3();
function updateCamera(dt, speed) {
  var p = V.chassis.position;
  var q = new THREE.Quaternion(V.chassis.quaternion.x, V.chassis.quaternion.y, V.chassis.quaternion.z, V.chassis.quaternion.w);
  var fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
  var flat = new THREE.Vector3(fwd.x, 0, fwd.z).normalize();
  var sp01 = clamp(speed / 85, 0, 1);

  if (S.camMode === 0) {
    var back = 9.0 + sp01 * 3.0, hgt = 3.7 + sp01 * 1.1;
    var want = new THREE.Vector3(p.x - flat.x * back, p.y + hgt, p.z - flat.z * back);
    camPos.lerp(want, 1 - Math.pow(0.0006, dt));
    camera.position.copy(camPos);
    camLook.lerp(new THREE.Vector3(p.x + flat.x * 9, p.y + 1.5, p.z + flat.z * 9), 1 - Math.pow(0.0015, dt));
    camera.lookAt(camLook);
    camera.fov = lerp(camera.fov, 60 + sp01 * 18, 1 - Math.pow(0.02, dt));
  } else if (S.camMode === 1) {
    var off = new THREE.Vector3(0, 0.62, 0.15).applyQuaternion(q);
    camera.position.set(p.x + off.x, p.y + off.y, p.z + off.z);
    camera.lookAt(p.x + fwd.x * 40, p.y + fwd.y * 40 + 0.4, p.z + fwd.z * 40);
    camera.fov = lerp(camera.fov, 66 + sp01 * 16, 1 - Math.pow(0.02, dt));
    camPos.copy(camera.position);
  } else if (S.camMode === 2) {
    var off2 = new THREE.Vector3(0, -0.15, 2.6).applyQuaternion(q);
    camera.position.set(p.x + off2.x, Math.max(0.35, p.y + off2.y), p.z + off2.z);
    camera.lookAt(p.x + fwd.x * 40, p.y + 0.6, p.z + fwd.z * 40);
    camera.fov = lerp(camera.fov, 72 + sp01 * 14, 1 - Math.pow(0.02, dt));
    camPos.copy(camera.position);
  } else {
    var t = performance.now() * 0.00013;
    var want2 = new THREE.Vector3(p.x + Math.cos(t) * 13, p.y + 4.5, p.z + Math.sin(t) * 13);
    camPos.lerp(want2, 1 - Math.pow(0.004, dt));
    camera.position.copy(camPos);
    camera.lookAt(p.x, p.y + 0.7, p.z);
    camera.fov = lerp(camera.fov, 42, 1 - Math.pow(0.02, dt));
  }
  camera.updateProjectionMatrix();

  // sun / shadow follows the car
  sun.position.set(p.x + 150, 230, p.z + 150);
  if (S.timeOfDay === 'sunset') sun.position.set(p.x + 320, p.y + 70, p.z + 150);
  sun.target.position.set(p.x, 0, p.z);
  sun.target.updateMatrixWorld();
}

/* ================================================================
   HUD
   ================================================================ */
var elSpd = document.getElementById('spd'), elGear = document.getElementById('gear');
var elRpm = document.getElementById('rpmfill'), elToast = document.getElementById('toast');
var mmCanvas = document.getElementById('minimap'), mmCtx = mmCanvas.getContext('2d');
var toastT = 0;
function toast(msg) { elToast.textContent = msg; elToast.style.opacity = '1'; toastT = 1.8; }

function updateHUD(dt) {
  elSpd.textContent = Math.round(speedKmh);
  var vLongSign = 1;
  elGear.textContent = speedKmh < 1.5 ? 'N' : (isReversing() ? 'R' : gearNum);
  var r = clamp(engineRpm / 7600, 0, 1);
  elRpm.style.width = (r * 100) + '%';
  elRpm.style.background = r > 0.9 ? 'linear-gradient(90deg,#ff9f0a,#ff3b30)' : 'linear-gradient(90deg,#49b8ff,#2d7dff)';
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) elToast.style.opacity = '0'; }
  if (S.showMap) drawMinimap();
}
function isReversing() {
  var vel = V.chassis.velocity;
  var f = new CANNON.Vec3(0, 0, 1); V.chassis.vectorToWorldFrame(f, f);
  return (vel.x * f.x + vel.z * f.z) < -0.6;
}

var MMR = 430;
function drawMinimap() {
  var w = mmCanvas.width, h = mmCanvas.height, x = mmCtx;
  var cx = V.chassis.position.x, cz = V.chassis.position.z, yaw = carYaw();
  x.clearRect(0, 0, w, h);
  x.save();
  x.beginPath(); x.arc(w / 2, h / 2, w / 2, 0, TAU); x.clip();
  x.fillStyle = '#16251a'; x.fillRect(0, 0, w, h);
  var sc = (w / 2) / MMR;
  x.translate(w / 2, h / 2); x.rotate(yaw); x.translate(-cx * sc, cz * sc);
  x.fillStyle = '#3f444b';
  for (var i = 0; i < roadRects.length; i++) {
    var rr = roadRects[i];
    x.fillRect(rr.x * sc - rr.w * sc / 2, -rr.z * sc - rr.d * sc / 2, rr.w * sc, rr.d * sc);
  }
  x.strokeStyle = '#3f444b'; x.lineWidth = 24 * sc; x.beginPath();
  for (var k = 0; k <= 70; k++) {
    var a = k / 70 * TAU, r = RING + Math.sin(a * 3) * 60 + Math.cos(a * 5) * 28;
    var px = Math.cos(a) * r * sc, py = -Math.sin(a) * r * sc;
    k ? x.lineTo(px, py) : x.moveTo(px, py);
  }
  x.stroke();
  x.fillStyle = 'rgba(165,175,190,.5)';
  for (var b = 0; b < buildingsMM.length; b++) {
    var bb = buildingsMM[b];
    if (Math.abs(bb.x - cx) > MMR + 50 || Math.abs(bb.z - cz) > MMR + 50) continue;
    x.fillRect(bb.x * sc - bb.hx * sc, -bb.z * sc - bb.hz * sc, bb.hx * 2 * sc, bb.hz * 2 * sc);
  }
  x.restore();
  x.save(); x.translate(w / 2, h / 2);
  x.fillStyle = '#ff3b30';
  x.beginPath(); x.moveTo(0, -11); x.lineTo(8, 9); x.lineTo(0, 5); x.lineTo(-8, 9); x.closePath(); x.fill();
  x.restore();
}

/* ================================================================
   AUDIO (synth V8)
   ================================================================ */
var actx = null, aud = null;
function initAudio() {
  if (actx) return;
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    var master = actx.createGain(); master.gain.value = 0.0; master.connect(actx.destination);
    var o1 = actx.createOscillator(); o1.type = 'sawtooth';
    var o2 = actx.createOscillator(); o2.type = 'square';
    var o3 = actx.createOscillator(); o3.type = 'triangle';
    var g1 = actx.createGain(); g1.gain.value = 0.55;
    var g2 = actx.createGain(); g2.gain.value = 0.22;
    var g3 = actx.createGain(); g3.gain.value = 0.3;
    var lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 800;
    var noise = actx.createBufferSource();
    var buf = actx.createBuffer(1, actx.sampleRate * 2, actx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
    noise.buffer = buf; noise.loop = true;
    var ng = actx.createGain(); ng.gain.value = 0.0;
    var nf = actx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 900; nf.Q.value = 0.6;
    o1.connect(g1); o2.connect(g2); o3.connect(g3);
    g1.connect(lp); g2.connect(lp); g3.connect(lp); lp.connect(master);
    noise.connect(nf); nf.connect(ng); ng.connect(master);
    o1.start(); o2.start(); o3.start(); noise.start();
    aud = { master: master, o1: o1, o2: o2, o3: o3, lp: lp, ng: ng, nf: nf };
  } catch (e) { console.warn('audio', e); }
}
function updateAudio() {
  if (!aud) return;
  var t = actx.currentTime;
  var f = 36 + engineRpm * 0.03;
  aud.master.gain.setTargetAtTime(S.paused ? 0 : 0.14, t, 0.1);
  aud.o1.frequency.setTargetAtTime(f, t, 0.04);
  aud.o2.frequency.setTargetAtTime(f * 0.5, t, 0.04);
  aud.o3.frequency.setTargetAtTime(f * 2.01, t, 0.04);
  aud.lp.frequency.setTargetAtTime(420 + engineRpm * 0.36, t, 0.08);
  aud.ng.gain.setTargetAtTime(clamp(speedKmh / 320, 0, 1) * 0.16, t, 0.1);
  aud.nf.frequency.setTargetAtTime(500 + speedKmh * 6, t, 0.1);
}

/* ================================================================
   MENUS / FLOW
   ================================================================ */
function toggleFullscreen() {
  var d = document;
  if (!d.fullscreenElement && !d.webkitFullscreenElement) {
    var e = d.documentElement;
    (e.requestFullscreen || e.webkitRequestFullscreen || function () {}).call(e);
  } else (d.exitFullscreen || d.webkitExitFullscreen || function () {}).call(d);
}
function togglePause() {
  S.paused = !S.paused;
  document.getElementById('pause').classList.toggle('hidden', !S.paused);
  document.getElementById('pTop').textContent = Math.round(stats.top) + ' км/ч';
  document.getElementById('pDist').textContent = (stats.dist / 1000).toFixed(2) + ' км';
  document.getElementById('pDrift').textContent = Math.round(Math.max(stats.drift, stats.driftCur));
  document.getElementById('pFps').textContent = Math.round(S.fps);
}

function buildGarageUI() {
  var box = document.getElementById('cars');
  box.innerHTML = '';
  CAR_LIST.forEach(function (c) {
    if (c.file && !loaded.gltf[c.id]) return;
    var d = document.createElement('div');
    d.className = 'carOpt' + (c.id === S.carId ? ' sel' : '');
    d.innerHTML = c.name + '<small>' + c.note + '</small>';
    d.onclick = function () {
      S.carId = c.id;
      box.querySelectorAll('.carOpt').forEach(function (e) { e.classList.remove('sel'); });
      d.classList.add('sel');
      if (S.started) spawnCar(S.carId);
    };
    box.appendChild(d);
  });
}

/* ================================================================
   MAIN LOOP
   ================================================================ */
var accum = 0, frames = 0, fpsT0 = performance.now(), FIXED = 1 / 60, stepCount = 0;
function animate() {
  requestAnimationFrame(animate);
  var dt = Math.min(clock.getDelta(), 0.05);

  if (!S.paused && S.started) {
    accum += dt;
    var guard = 0;
    while (accum >= FIXED && guard < 3) {
      pworld.step(FIXED); stepCount++;
      accum -= FIXED; guard++;
    }
    if (accum > FIXED * 3) accum = 0;
    var speed = updateVehicle(dt);
    syncVisuals();
    updateCamera(dt, speed);
    updateHUD(dt);
    updateAudio();
    updateSmoke(dt);
  }

  if (sun && V.root) {
    var cp = V.root.position;
    sun.target.position.set(cp.x, 0, cp.z);
    sun.target.updateMatrixWorld();
    sun.position.set(cp.x + 120, 190, cp.z + 115);
  }

  frames++;
  var now = performance.now();
  if (now - fpsT0 >= 500) {
    S.fps = frames * 1000 / (now - fpsT0); frames = 0; fpsT0 = now;
    autoRes();
  }

  if (composer) composer.render(); else renderer.render(scene, camera);
}

/* динамическое разрешение: держим плавность, подстраивая масштаб буфера */
var resCool = 0;
function autoRes() {
  if (!S.started || S.paused) return;
  if (resCool > 0) { resCool--; return; }
  var changed = 0;
  if (S.fps < 45 && S.resScale > 0.6) { S.resScale = Math.max(0.6, S.resScale - 0.12); changed = 1; }
  else if (S.fps > 58 && S.resScale < 1) { S.resScale = Math.min(1, S.resScale + 0.08); changed = 1; }
  if (changed) {
    resCool = 4;
    renderer.setPixelRatio(S.basePR * S.resScale);
    if (composer) composer.setPixelRatio(S.basePR * S.resScale);
  }
}

function syncVisuals() {
  var p = V.chassis.position, q = V.chassis.quaternion;
  V.root.position.set(p.x, p.y, p.z);
  V.root.quaternion.set(q.x, q.y, q.z, q.w);
  for (var i = 0; i < V.vehicle.wheelInfos.length; i++) {
    V.vehicle.updateWheelTransform(i);
    var t = V.vehicle.wheelInfos[i].worldTransform;
    var m = V.wheelMeshes[i];
    if (!m) continue;
    m.position.set(t.position.x, t.position.y, t.position.z);
    m.quaternion.set(t.quaternion.x, t.quaternion.y, t.quaternion.z, t.quaternion.w);
  }
  // props
  for (var k = 0; k < dynamicProps.length; k++) {
    var d = dynamicProps[k];
    d.mesh.position.set(d.body.position.x, d.body.position.y, d.body.position.z);
    d.mesh.quaternion.set(d.body.quaternion.x, d.body.quaternion.y, d.body.quaternion.z, d.body.quaternion.w);
  }
  // headlights
  if (V.headlights.length) {
    var qq = new THREE.Quaternion(q.x, q.y, q.z, q.w);
    for (var h = 0; h < 2; h++) {
      var off = new THREE.Vector3((h ? 1 : -1) * 0.62, 0.25, 1.9).applyQuaternion(qq);
      var L = V.headlights[h];
      L.position.set(p.x + off.x, p.y + off.y, p.z + off.z);
      var dir = new THREE.Vector3(0, -0.12, 1).applyQuaternion(qq);
      L.target.position.set(p.x + dir.x * 40, p.y + dir.y * 40, p.z + dir.z * 40);
      L.target.updateMatrixWorld();
      L.intensity = S.headlights ? (S.night ? 4.0 : 2.0) : 0;
    }
  }
  // city night lights
  if (mats.lampHead) mats.lampHead.emissiveIntensity = S.night || S.timeOfDay === 'sunset' ? 2.2 : 0;
  if (mats.facade) mats.facade.forEach(function (m) { m.emissiveIntensity = S.night ? 1.5 : (S.timeOfDay === 'sunset' ? 0.55 : 0.0); });
}

function updateSmoke(dt) {
  for (var i = 0; i < smokePool.length; i++) {
    var s = smokePool[i];
    if (s.life > 0) {
      s.life -= dt * 1.15;
      s.sp.position.y += dt * 1.6;
      var k = 1.1 + (1 - s.life) * 3.4;
      s.sp.scale.setScalar(k);
      s.sp.material.opacity = Math.max(0, s.life * 0.4);
      if (s.life <= 0) s.sp.visible = false;
    }
  }
}

addEventListener('resize', function () {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  if (composer) composer.setSize(innerWidth, innerHeight);
});

/* ================================================================
   BOOT
   ================================================================ */
var qs = {};
location.search.replace(/^\?/, '').split('&').forEach(function (kv) {
  if (!kv) return; var p = kv.split('='); qs[p[0]] = decodeURIComponent(p[1] || '');
});

/* подбираем стартовый пресет графики под железо */
(function () {
  var weak = (navigator.hardwareConcurrency || 4) <= 4 ||
             /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) ||
             (devicePixelRatio || 1) > 2.5;
  var sel = document.getElementById('qSel');
  if (sel && weak) sel.value = '0';
})();

startLoading(function () {
  document.getElementById('loading').style.display = 'none';
  document.getElementById('ready').style.display = 'block';
  buildGarageUI();
  if (qs.auto) {
    if (qs.car) S.carId = qs.car;
    if (qs.q !== undefined) S.quality = parseInt(qs.q, 10);
    if (qs.tod) S.timeOfDay = qs.tod;
    if (qs.cam) S.camMode = parseInt(qs.cam, 10);
    document.getElementById('menu').classList.add('hidden');
    document.getElementById('hud').classList.add('show');
    bootGame();
  }
});

document.getElementById('startBtn').onclick = function () {
  S.quality = parseInt(document.getElementById('qSel').value, 10);
  S.timeOfDay = document.getElementById('tSel').value;
  var wantFs = document.getElementById('fsCheck').checked;
  document.getElementById('menu').classList.add('hidden');
  document.getElementById('hud').classList.add('show');
  if (wantFs) toggleFullscreen();
  bootGame();
  setTimeout(function () { var h = document.getElementById('hint'); if (h) h.style.opacity = '0'; }, 9000);
};
document.getElementById('resumeBtn').onclick = togglePause;
document.getElementById('fsBtn').onclick = toggleFullscreen;
document.getElementById('respawnBtn').onclick = function () { respawn(); togglePause(); };
document.getElementById('garageBtn').onclick = function () {
  S.paused = false;
  document.getElementById('pause').classList.add('hidden');
  document.getElementById('menu').classList.remove('hidden');
  document.getElementById('hud').classList.remove('show');
  S.started = false;
};

var booted = false;
function bootGame() {
  if (!booted) {
    initRenderer();
    initPhysics();
    buildWorld();
    initEffects();
    booted = true;
    setEnvIntensity(S.envK || 0.45);
  } else {
    applyTimeOfDay();
  }
  spawnCar(S.carId);
  initAudio();
  if (actx && actx.state === 'suspended') actx.resume();
  S.started = true;
  S.paused = false;
  if (!animStarted) { animStarted = true; animate(); }
}
var animStarted = false;

/* lightweight hook for automated testing */
window.__dbg = function () {
  return {
    started: S.started,
    car: S.carId,
    pos: V.chassis ? [+V.chassis.position.x.toFixed(2), +V.chassis.position.y.toFixed(2), +V.chassis.position.z.toFixed(2)] : null,
    kmh: +speedKmh.toFixed(1),
    fps: +S.fps.toFixed(1),
    objects: scene ? scene.children.length : 0,
    calls: renderer ? renderer.info.render.calls : 0,
    tris: renderer ? renderer.info.render.triangles : 0
  };
};

})();
