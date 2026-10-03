/* =====================================================================
   M5 F90 — CITY DRIVE 3.0
   Движок: Babylon.js 9 (PBR + IBL + CSM + ACES)
   Физика: Havok + собственная модель автомобиля (подвеска, шины Pacejka,
           перенос масс, коробка передач, сцепление, ABS/TCS)
   ===================================================================== */
(function () {
'use strict';

var BJ = BABYLON;
var V3 = BJ.Vector3, Q = BJ.Quaternion;

/* ------------------------------------------------------------------ пути */
var ASSETS = 'assets/';
var TEX = ASSETS + 'textures/';
var MDL = ASSETS + 'models/';
var RMDL = MDL + 'cars/';
function A(u) { return (window.__ASSETS && window.__ASSETS[u]) ? window.__ASSETS[u] : u; }

/* ------------------------------------------------------------------ мир */
var ROADW = 13, BLOCK = 76, GRID = 5, HALF = (GRID - 1) / 2;
var STEP = BLOCK + ROADW;
var cityExtent = HALF * STEP + BLOCK / 2;
var PAINTS = [
  { n: 'Marina Bay Blue', c: '#1b5fb4' }, { n: 'Frozen Red', c: '#8e1420' },
  { n: 'Alpine White', c: '#e8ecef' }, { n: 'Black Sapphire', c: '#0b0e14' },
  { n: 'Donington Grey', c: '#5b6269' }, { n: 'Sao Paulo Yellow', c: '#d6b400' },
  { n: 'Isle of Man Green', c: '#0e4231' }
];

var CARS = [
  { id: 'm5',          name: 'BMW M5 F90',    note: '625 л.с. · V8 · AWD', file: null,                 len: 4.97, mass: 1900, torque: 750, redline: 7200, drive: 'awd', gears: [4.71, 3.14, 2.11, 1.67, 1.29, 1.0, 0.84, 0.67], fd: 3.15 },
  { id: 'hypercar',    name: 'Hypercar GT',   note: '1100 л.с. · AWD',  file: RMDL + 'hypercar.glb',    len: 4.70, mass: 1480, torque: 900, redline: 8200, drive: 'awd', gears: [3.1, 2.1, 1.58, 1.26, 1.03, 0.86, 0.74], fd: 3.7 },
  { id: 'ferrari',     name: 'Ferrari 458',   note: 'V8 · RWD',         file: MDL + 'ferrari.glb',      len: 4.53, mass: 1430, torque: 620, redline: 9000, drive: 'rwd', gears: [3.08, 2.19, 1.63, 1.29, 1.03, 0.84, 0.69], fd: 4.1 },
  { id: 'endurance',   name: 'Endurance LMP', note: 'прототип · RWD',   file: RMDL + 'endurance.glb',   len: 4.90, mass: 1050, torque: 700, redline: 9500, drive: 'rwd', gears: [2.9, 2.0, 1.55, 1.24, 1.0, 0.82], fd: 4.0 },
  { id: 'wedge',       name: 'Wedge 80s',     note: 'классика · RWD',   file: RMDL + 'wedge.glb',       len: 4.40, mass: 1320, torque: 460, redline: 7200, drive: 'rwd', gears: [3.4, 2.2, 1.6, 1.22, 0.95], fd: 3.9 },
  { id: 'rally',       name: 'Rally Raid',    note: '4x4 · внедорожник', file: RMDL + 'rally.glb',      len: 4.60, mass: 1950, torque: 720, redline: 6800, drive: 'awd', gears: [3.8, 2.4, 1.72, 1.3, 1.0, 0.82], fd: 4.3 },
  { id: 'streamliner', name: 'Streamliner',   note: 'рекорд · RWD',     file: RMDL + 'streamliner.glb', len: 5.20, mass: 1280, torque: 820, redline: 8600, drive: 'rwd', gears: [3.0, 2.05, 1.5, 1.2, 0.98, 0.8, 0.66], fd: 3.4 }
];

var S = {
  quality: 1, timeOfDay: 'day', carId: 'm5', paint: 0,
  started: false, paused: false, night: false, headlights: false,
  camMode: 0, fps: 0, top: 0, dist: 0, bestDrift: 0, map: true
};

/* ------------------------------------------------------------------ query */
var qs = {};
location.search.replace(/^\?/, '').split('&').forEach(function (kv) {
  if (!kv) return; var p = kv.split('='); qs[p[0]] = decodeURIComponent(p[1] || '');
});

var canvas = document.getElementById('app');
var engine, scene, camera, sun, csm, pipeline, hkPlugin, physEngine;
var mats = {}, loadedCars = {}, env = null;
var buildingsMM = [], roadPos = [], SPAWN = new BABYLON.Vector3(0, 0.75, 0);
var el = function (id) { return document.getElementById(id); };

/* ================================================================== LOADING */
var pending = 0, donePending = 0;
function track(p) {
  pending++; upd();
  return p.then(function (r) { donePending++; upd(); return r; },
                function (e) { donePending++; upd(); console.warn('asset fail', e); return null; });
}
function upd() {
  var k = pending ? donePending / pending : 0;
  el('barFill').style.width = (k * 100).toFixed(0) + '%';
  el('loadTxt').textContent = 'загрузка ' + donePending + ' / ' + pending;
}

function tex(name, scale, opts) {
  opts = opts || {};
  var m = new BJ.PBRMaterial(name, scene);
  m.albedoTexture = new BJ.Texture(A(TEX + name + '_c.jpg'), scene);
  if (opts.normal !== false) {
    m.bumpTexture = new BJ.Texture(A(TEX + name + '_n.jpg'), scene);
    m.invertNormalMapX = true; m.invertNormalMapY = true;
  }
  if (opts.rough !== false) {
    m.metallicTexture = new BJ.Texture(A(TEX + name + '_r.jpg'), scene);
    m.useRoughnessFromMetallicTextureGreen = false;
    m.useRoughnessFromMetallicTextureAlpha = false;
  }
  m.metallic = opts.metallic !== undefined ? opts.metallic : 0.0;
  m.roughness = opts.roughness !== undefined ? opts.roughness : 0.85;
  [m.albedoTexture, m.bumpTexture, m.metallicTexture].forEach(function (t) {
    if (!t) return;
    t.uScale = t.vScale = scale;
    t.wrapU = t.wrapV = BJ.Texture.WRAP_ADDRESSMODE;
    t.anisotropicFilteringLevel = S.quality >= 1 ? 8 : 4;
  });
  m.environmentIntensity = 0.75;
  return m;
}

function loadCarGLB(spec) {
  var url = A(spec.file);
  var isData = url.indexOf('data:') === 0;
  return track(BJ.SceneLoader.ImportMeshAsync('', isData ? '' : url.substring(0, url.lastIndexOf('/') + 1),
      isData ? url : url.substring(url.lastIndexOf('/') + 1), scene, null, '.glb')
    .then(function (res) {
      var root = res.meshes[0];
      root.setEnabled(false);
      loadedCars[spec.id] = { root: root, meshes: res.meshes };
      return res;
    }));
}

/* ================================================================== BOOT */
function initEngine() {
  engine = new BJ.Engine(canvas, S.quality >= 1, {
    stencil: true, powerPreference: 'high-performance',
    preserveDrawingBuffer: false, antialias: S.quality >= 1
  }, true);
  engine.setHardwareScalingLevel(S.quality >= 2 ? 1 / Math.min(devicePixelRatio || 1, 2)
    : (S.quality >= 1 ? 1 / Math.min(devicePixelRatio || 1, 1.3) : 1));

  scene = new BJ.Scene(engine);
  scene.useRightHandedSystem = true;
  scene.clearColor = new BJ.Color4(0.55, 0.68, 0.84, 1);
  scene.collisionsEnabled = false;
  scene.blockMaterialDirtyMechanism = true;

  camera = new BJ.UniversalCamera('cam', new V3(0, 3, -8), scene);
  camera.fov = 0.80;
  camera.minZ = 0.25; camera.maxZ = 1800;
  camera.inputs.clear();
  scene.activeCamera = camera;

  BJ.DracoCompression.DefaultNumWorkers = 0;      // без worker — работает в песочнице
  if (window.__DRACO_URLS) BJ.DracoCompression.Configuration.decoder = window.__DRACO_URLS;
}

function initLights() {
  var hemi = new BJ.HemisphericLight('hemi', new V3(0.2, 1, 0.1), scene);
  hemi.intensity = 0.22; hemi.diffuse = new BJ.Color3(0.72, 0.82, 1);
  hemi.groundColor = new BJ.Color3(0.26, 0.24, 0.2);
  mats.hemi = hemi;

  sun = new BJ.DirectionalLight('sun', new V3(-0.45, -0.78, -0.44), scene);
  sun.position = new V3(120, 190, 115);
  sun.intensity = 3.2;
  sun.shadowMinZ = 1; sun.shadowMaxZ = 260;

  var res = S.quality >= 2 ? 2048 : (S.quality >= 1 ? 1536 : 1024);
  csm = new BJ.CascadedShadowGenerator(res, sun);
  csm.numCascades = S.quality >= 1 ? 4 : 2;
  csm.lambda = 0.85;
  csm.stabilizeCascades = true;
  csm.shadowMaxZ = S.quality >= 1 ? 190 : 110;
  csm.depthClamp = true;
  csm.autoCalcDepthBounds = true;
  csm.bias = 0.012; csm.normalBias = 0.022;
  csm.usePercentageCloserFiltering = true;
  csm.filteringQuality = S.quality >= 2 ? BJ.ShadowGenerator.QUALITY_HIGH : BJ.ShadowGenerator.QUALITY_MEDIUM;
}

function initPost() {
  pipeline = new BJ.DefaultRenderingPipeline('def', true, scene, [camera]);
  pipeline.samples = S.quality >= 2 ? 4 : (S.quality >= 1 ? 2 : 1);
  pipeline.fxaaEnabled = S.quality < 2;
  pipeline.bloomEnabled = S.quality >= 1;
  pipeline.bloomThreshold = 0.85; pipeline.bloomWeight = 0.35; pipeline.bloomKernel = 48;
  pipeline.imageProcessing.toneMappingEnabled = true;
  pipeline.imageProcessing.toneMappingType = BJ.ImageProcessingConfiguration.TONEMAPPING_ACES;
  pipeline.imageProcessing.exposure = 1.1;
  pipeline.imageProcessing.contrast = 1.12;
  pipeline.imageProcessing.vignetteEnabled = true;
  pipeline.imageProcessing.vignetteWeight = 1.6;
  pipeline.sharpenEnabled = S.quality >= 1;
  if (pipeline.sharpen) { pipeline.sharpen.edgeAmount = 0.22; pipeline.sharpen.colorAmount = 1; }

  if (S.quality >= 2 && BJ.SSAO2RenderingPipeline.IsSupported) {
    var ssao = new BJ.SSAO2RenderingPipeline('ssao', scene, { ssaoRatio: 0.6, blurRatio: 1 }, [camera]);
    ssao.radius = 1.4; ssao.totalStrength = 1.0; ssao.expensiveBlur = false; ssao.samples = 12;
  }
}

function applyTimeOfDay() {
  var cfg = {
    day:    { sun: [1, 0.96, 0.9], si: 3.4, hi: 0.22, fog: [0.72, 0.80, 0.9], fogD: 0.0016, exp: 1.1, envI: 0.85 },
    sunset: { sun: [1, 0.62, 0.3], si: 2.6, hi: 0.18, fog: [0.85, 0.62, 0.45], fogD: 0.0028, exp: 1.15, envI: 0.55 },
    night:  { sun: [0.35, 0.45, 0.7], si: 0.25, hi: 0.07, fog: [0.03, 0.045, 0.08], fogD: 0.006, exp: 1.5, envI: 0.12 }
  }[S.timeOfDay];
  sun.diffuse = new BJ.Color3(cfg.sun[0], cfg.sun[1], cfg.sun[2]);
  sun.intensity = cfg.si;
  if (S.timeOfDay === 'sunset') sun.direction = new V3(-0.85, -0.3, -0.35).normalize();
  else sun.direction = new V3(-0.45, -0.78, -0.44).normalize();
  mats.hemi.intensity = cfg.hi;
  scene.fogMode = BJ.Scene.FOGMODE_EXP2;
  scene.fogDensity = cfg.fogD;
  scene.fogColor = new BJ.Color3(cfg.fog[0], cfg.fog[1], cfg.fog[2]);
  scene.clearColor = new BJ.Color4(cfg.fog[0], cfg.fog[1], cfg.fog[2], 1);
  scene.environmentIntensity = cfg.envI;
  if (pipeline) pipeline.imageProcessing.exposure = cfg.exp;
  S.night = S.timeOfDay === 'night';
  if (mats.skybox) mats.skybox.setFloat('ambient', 1);
  if (mats.facades) mats.facades.forEach(function (m) {
    m.emissiveColor = S.night ? new BJ.Color3(0.85, 0.72, 0.45)
      : (S.timeOfDay === 'sunset' ? new BJ.Color3(0.25, 0.2, 0.12) : BJ.Color3.Black());
  });
  if (mats.lampHead) mats.lampHead.emissiveColor = (S.night || S.timeOfDay === 'sunset')
    ? new BJ.Color3(1, 0.86, 0.6) : BJ.Color3.Black();
  if (mats.sky) mats.sky.setEnabled(S.timeOfDay === 'day');
}

/* ================================================================== PHYSICS util */
var MASK_WORLD = 2, MASK_CAR = 1;
function staticBox(x, y, z, hx, hy, hz) {
  var tn = new BJ.TransformNode('sb', scene);
  tn.position.set(x, y, z);
  var body = new BJ.PhysicsBody(tn, BJ.PhysicsMotionType.STATIC, false, scene);
  var shape = new BJ.PhysicsShapeBox(V3.Zero(), Q.Identity(), new V3(hx * 2, hy * 2, hz * 2), scene);
  shape.material = { friction: 0.9, restitution: 0.05 };
  shape.filterMembershipMask = MASK_WORLD;
  shape.filterCollideMask = 0xffffffff;
  body.shape = shape;
  return body;
}

/* ================================================================== WORLD */
function rand(a, b) { return a + Math.random() * (b - a); }
function randi(a, b) { return Math.floor(rand(a, b + 1)); }

function buildWorld() {
  /* --- земля --- */
  mats.grass = tex('grass', 220, { metallic: 0, roughness: 0.95 });
  var ground = BJ.MeshBuilder.CreateGround('ground', { width: 3000, height: 3000, subdivisions: 1 }, scene);
  ground.material = mats.grass;
  ground.receiveShadows = true;
  ground.position.y = -0.02;
  staticBox(0, -5.02, 0, 4000, 5, 4000);

  /* --- материалы --- */
  mats.road = tex('asphalt', 1, { roughness: 0.62 });
  mats.road.albedoTexture.uScale = 6; mats.road.albedoTexture.vScale = 60;
  if (mats.road.bumpTexture) { mats.road.bumpTexture.uScale = 6; mats.road.bumpTexture.vScale = 60; }
  if (mats.road.metallicTexture) { mats.road.metallicTexture.uScale = 6; mats.road.metallicTexture.vScale = 60; }
  mats.road.environmentIntensity = 1.0;

  mats.walk = tex('paving', 26, { roughness: 0.8 });
  mats.concrete = tex('concrete', 8, { roughness: 0.9 });
  mats.bark = tex('bark', 2, { roughness: 0.95 });
  mats.metalM = tex('metal', 2, { metallic: 0.9, roughness: 0.35 });

  mats.facades = [];
  for (var f = 1; f <= 6; f++) {
    var fm = new BJ.PBRMaterial('fac' + f, scene);
    fm.albedoTexture = new BJ.Texture(A(TEX + 'facade' + f + '_c.jpg'), scene);
    fm.emissiveTexture = new BJ.Texture(A(TEX + 'facade' + f + '_e.jpg'), scene);
    fm.emissiveColor = BJ.Color3.Black();
    fm.metallic = 0.05; fm.roughness = 0.72;
    fm.albedoTexture.wrapU = fm.albedoTexture.wrapV = BJ.Texture.WRAP_ADDRESSMODE;
    fm.emissiveTexture.wrapU = fm.emissiveTexture.wrapV = BJ.Texture.WRAP_ADDRESSMODE;
    fm.environmentIntensity = 0.7;
    mats.facades.push(fm);
  }

  mats.leaf = new BJ.PBRMaterial('leaf', scene);
  mats.leaf.albedoTexture = new BJ.Texture(A(TEX + 'leaf.png'), scene);
  mats.leaf.albedoTexture.hasAlpha = true;
  mats.leaf.useAlphaFromAlbedoTexture = true;
  mats.leaf.transparencyMode = BJ.PBRMaterial.PBRMATERIAL_ALPHATEST;
  mats.leaf.alphaCutOff = 0.45;
  mats.leaf.backFaceCulling = false;
  mats.leaf.metallic = 0; mats.leaf.roughness = 0.9;
  mats.leaf.albedoColor = new BJ.Color3(0.72, 0.84, 0.62);

  mats.markM = new BJ.PBRMaterial('mark', scene);
  mats.markM.albedoColor = new BJ.Color3(0.86, 0.84, 0.62);
  mats.markM.metallic = 0; mats.markM.roughness = 0.7;
  mats.markM.zOffset = -2;

  mats.lampHead = new BJ.PBRMaterial('lampHead', scene);
  mats.lampHead.albedoColor = new BJ.Color3(0.08, 0.09, 0.1);
  mats.lampHead.metallic = 0.6; mats.lampHead.roughness = 0.4;

  /* --- сетка дорог --- */
  roadPos = [];
  for (var i = -HALF; i <= HALF; i++) roadPos.push(i * STEP);
  SPAWN = new V3(roadPos[Math.floor(roadPos.length / 2)] + ROADW * 0.25, 0.75, -cityExtent + 26);

  var roadParts = [], walkParts = [], markParts = [];
  var L = cityExtent + STEP;
  roadPos.forEach(function (p) {
    var r1 = BJ.MeshBuilder.CreateBox('r', { width: ROADW, height: 0.1, depth: L * 2 }, scene);
    r1.position.set(p, 0.05, 0);
    var r2 = BJ.MeshBuilder.CreateBox('r', { width: L * 2, height: 0.1, depth: ROADW }, scene);
    r2.position.set(0, 0.05, p);
    roadParts.push(r1, r2);

    [-1, 1].forEach(function (s) {
      var w1 = BJ.MeshBuilder.CreateBox('w', { width: 3.2, height: 0.22, depth: L * 2 }, scene);
      w1.position.set(p + s * (ROADW / 2 + 1.6), 0.11, 0);
      var w2 = BJ.MeshBuilder.CreateBox('w', { width: L * 2, height: 0.22, depth: 3.2 }, scene);
      w2.position.set(0, 0.11, p + s * (ROADW / 2 + 1.6));
      walkParts.push(w1, w2);
    });

    for (var t = -L; t < L; t += 9) {
      var m1 = BJ.MeshBuilder.CreateBox('m', { width: 0.18, height: 0.02, depth: 4 }, scene);
      m1.position.set(p, 0.105, t);
      var m2 = BJ.MeshBuilder.CreateBox('m', { width: 4, height: 0.02, depth: 0.18 }, scene);
      m2.position.set(t, 0.105, p);
      markParts.push(m1, m2);
    }
  });

  var road = BJ.Mesh.MergeMeshes(roadParts, true, true, undefined, false, false);
  road.material = mats.road; road.receiveShadows = true; road.name = 'roads';
  var walk = BJ.Mesh.MergeMeshes(walkParts, true, true, undefined, false, false);
  walk.material = mats.walk; walk.receiveShadows = true;
  var mk = BJ.Mesh.MergeMeshes(markParts, true, true, undefined, false, false);
  mk.material = mats.markM; mk.receiveShadows = false;

  /* --- кварталы --- */
  var bldParts = [], roofParts = [], treeData = [], lampData = [];
  for (var gx = -HALF; gx < HALF; gx++) {
    for (var gz = -HALF; gz < HALF; gz++) {
      var cx = (gx + 0.5) * STEP, cz = (gz + 0.5) * STEP;
      var inner = BLOCK - 9;
      var isPark = (Math.abs(gx) + Math.abs(gz)) % 4 === 1 && Math.random() < 0.8;
      if (isPark) {
        for (var k = 0; k < 10; k++)
          treeData.push([cx + rand(-inner / 2 + 3, inner / 2 - 3), cz + rand(-inner / 2 + 3, inner / 2 - 3), rand(0.9, 1.5)]);
      } else {
        var cells = Math.random() < 0.5 ? 2 : 3, cs = inner / cells;
        for (var a = 0; a < cells; a++) for (var b = 0; b < cells; b++) {
          if (Math.random() < 0.1) continue;
          var bx = cx - inner / 2 + cs / 2 + a * cs, bz = cz - inner / 2 + cs / 2 + b * cs;
          var w = cs * rand(0.7, 0.92), d = cs * rand(0.7, 0.92);
          var centerW = Math.max(0.05, 1 - Math.hypot(cx, cz) / (cityExtent * 1.3));
          var h = rand(10, 20) + centerW * rand(12, 62);
          var mi = randi(0, 5);
          var bm = BJ.MeshBuilder.CreateBox('b', { width: w, height: h, depth: d }, scene);
          bm.position.set(bx, h / 2, bz);
          var uv = new BJ.Vector4(0, 0, 1, 1);
          bm.material = mats.facades[mi];
          scaleBoxUV(bm, w / 6, h / 6, d / 6);
          (bldParts[mi] = bldParts[mi] || []).push(bm);

          var rf = BJ.MeshBuilder.CreateBox('rf', { width: w + 0.6, height: 0.6, depth: d + 0.6 }, scene);
          rf.position.set(bx, h + 0.3, bz);
          roofParts.push(rf);
          staticBox(bx, h / 2, bz, w / 2, h / 2, d / 2);
          buildingsMM.push({ x: bx, z: bz, hx: w / 2, hz: d / 2 });
        }
        for (var t2 = 0; t2 < 4; t2++) {
          var ang = t2 / 4 * Math.PI * 2;
          treeData.push([cx + Math.cos(ang) * (inner / 2 + 3), cz + Math.sin(ang) * (inner / 2 + 3), rand(0.9, 1.3)]);
        }
      }
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (s) {
        lampData.push([cx + s[0] * (inner / 2 + 3.4), cz + s[1] * (inner / 2 + 3.4)]);
      });
    }
  }
  for (var ct = 0; ct < 220; ct++) {
    var aa = Math.random() * Math.PI * 2, rr = rand(cityExtent + 25, cityExtent + 420);
    treeData.push([Math.cos(aa) * rr, Math.sin(aa) * rr, rand(1.0, 2.0)]);
  }

  bldParts.forEach(function (list, mi) {
    if (!list || !list.length) return;
    var m = BJ.Mesh.MergeMeshes(list, true, true, undefined, false, false);
    m.material = mats.facades[mi];
    m.receiveShadows = true;
    csm.addShadowCaster(m);
  });
  var roofs = BJ.Mesh.MergeMeshes(roofParts, true, true, undefined, false, false);
  roofs.material = mats.concrete; roofs.receiveShadows = true; csm.addShadowCaster(roofs);

  buildTrees(treeData);
  buildLamps(lampData);
  buildMountains();
}

function scaleBoxUV(mesh, su, sv, sw) {
  var uvs = mesh.getVerticesData(BJ.VertexBuffer.UVKind);
  if (!uvs) return;
  var sc = [[sw, sv], [sw, sv], [su, sv], [su, sv], [su, sw], [su, sw]];
  for (var f = 0; f < 6; f++) {
    for (var i = f * 4; i < f * 4 + 4; i++) {
      uvs[i * 2] *= sc[f][0]; uvs[i * 2 + 1] *= sc[f][1];
    }
  }
  mesh.setVerticesData(BJ.VertexBuffer.UVKind, uvs);
}

function buildTrees(data) {
  if (!data.length) return;
  var trunk = BJ.MeshBuilder.CreateCylinder('trunk', { diameterTop: 0.34, diameterBottom: 0.6, height: 3, tessellation: 7 }, scene);
  trunk.material = mats.bark;
  trunk.bakeTransformIntoVertices(BJ.Matrix.Translation(0, 1.5, 0));

  var crownParts = [];
  for (var i = 0; i < 3; i++) {
    var pl = BJ.MeshBuilder.CreatePlane('cp', { width: 5, height: 4.4, sideOrientation: BJ.Mesh.DOUBLESIDE }, scene);
    pl.rotation.y = i / 3 * Math.PI;
    pl.position.y = 3.6;
    crownParts.push(pl);
  }
  var cap = BJ.MeshBuilder.CreatePlane('cp', { width: 4.6, height: 4.6, sideOrientation: BJ.Mesh.DOUBLESIDE }, scene);
  cap.rotation.x = Math.PI / 2; cap.position.y = 4.7; crownParts.push(cap);
  var crown = BJ.Mesh.MergeMeshes(crownParts, true, true, undefined, false, false);
  crown.material = mats.leaf;

  var mt = new Float32Array(16 * data.length), mc = new Float32Array(16 * data.length);
  data.forEach(function (d, i) {
    var m = BJ.Matrix.Compose(new V3(d[2], d[2], d[2]), Q.RotationAxis(V3.Up(), Math.random() * 6.28), new V3(d[0], 0, d[1]));
    m.copyToArray(mt, i * 16); m.copyToArray(mc, i * 16);
  });
  trunk.thinInstanceSetBuffer('matrix', mt, 16);
  crown.thinInstanceSetBuffer('matrix', mc, 16);
  trunk.receiveShadows = true;
  csm.addShadowCaster(trunk); csm.addShadowCaster(crown);
}

function buildLamps(data) {
  if (!data.length) return;
  var pole = BJ.MeshBuilder.CreateCylinder('pole', { diameter: 0.2, height: 7.5, tessellation: 7 }, scene);
  pole.bakeTransformIntoVertices(BJ.Matrix.Translation(0, 3.75, 0));
  var arm = BJ.MeshBuilder.CreateBox('arm', { width: 2.0, height: 0.14, depth: 0.14 }, scene);
  arm.bakeTransformIntoVertices(BJ.Matrix.Translation(0.9, 7.4, 0));
  var merged = BJ.Mesh.MergeMeshes([pole, arm], true, true, undefined, false, false);
  merged.material = mats.metalM;

  var head = BJ.MeshBuilder.CreateBox('head', { width: 1.1, height: 0.18, depth: 0.5 }, scene);
  head.bakeTransformIntoVertices(BJ.Matrix.Translation(1.6, 7.25, 0));
  head.material = mats.lampHead;

  var m1 = new Float32Array(16 * data.length), m2 = new Float32Array(16 * data.length);
  data.forEach(function (d, i) {
    var m = BJ.Matrix.Compose(V3.One(), Q.RotationAxis(V3.Up(), Math.atan2(-d[0], -d[1])), new V3(d[0], 0, d[1]));
    m.copyToArray(m1, i * 16); m.copyToArray(m2, i * 16);
  });
  merged.thinInstanceSetBuffer('matrix', m1, 16);
  head.thinInstanceSetBuffer('matrix', m2, 16);
  csm.addShadowCaster(merged);
}

function buildMountains() {
  var parts = [];
  for (var i = 0; i < 26; i++) {
    var a = i / 26 * Math.PI * 2 + rand(-0.08, 0.08);
    var r = rand(1050, 1320);
    var h = rand(90, 240);
    var m = BJ.MeshBuilder.CreateCylinder('mt', { diameterTop: 0, diameterBottom: rand(260, 520), height: h, tessellation: 5 }, scene);
    m.position.set(Math.cos(a) * r, h / 2 - 6, Math.sin(a) * r);
    m.rotation.y = Math.random() * 3;
    parts.push(m);
  }
  var mm = BJ.Mesh.MergeMeshes(parts, true, true, undefined, false, false);
  var mat = new BJ.PBRMaterial('mount', scene);
  mat.albedoColor = new BJ.Color3(0.36, 0.38, 0.42);
  mat.metallic = 0; mat.roughness = 1;
  mm.material = mat;
  mm.isPickable = false;
  mm.receiveShadows = false;
  mm.freezeWorldMatrix();
}

/* ============================================= припаркованный трафик */
function placeTraffic() {
  var ids = ['hypercar', 'wedge', 'endurance', 'streamliner'].filter(function (i) { return loadedCars[i]; });
  if (!ids.length) return;
  var n = S.quality >= 2 ? 30 : 20;
  for (var i = 0; i < n; i++) {
    var id = ids[randi(0, ids.length - 1)];
    var src = loadedCars[id];
    var rp = roadPos[randi(0, roadPos.length - 1)];
    var along = rand(-cityExtent + 20, cityExtent - 20);
    var vertical = Math.random() < 0.5;
    var offs = (Math.random() < 0.5 ? -1 : 1) * (ROADW / 2 - 1.6);
    var px, pz, ry;
    if (vertical) { px = rp + offs; pz = along; ry = offs > 0 ? Math.PI : 0; }
    else { px = along; pz = rp + offs; ry = offs > 0 ? -Math.PI / 2 : Math.PI / 2; }
    if (Math.hypot(px - SPAWN.x, pz - SPAWN.z) < 30) { i--; continue; }
    var holder = new BJ.TransformNode('traffic', scene);
    holder.position.set(px, 0, pz);
    holder.rotation.y = ry;
    src.meshes.forEach(function (m) {
      if (!m.getTotalVertices || !m.getTotalVertices()) return;
      var inst = m.createInstance('ti');
      inst.parent = holder;
      inst.position.copyFrom(m.position);
      inst.rotationQuaternion = m.rotationQuaternion ? m.rotationQuaternion.clone() : null;
      inst.rotation.copyFrom(m.rotation);
      inst.scaling.copyFrom(m.scaling);
      inst.setEnabled(true);
      if (S.quality >= 1) csm.addShadowCaster(inst);
    });
    staticBox(px, 0.75, pz, vertical ? 1.0 : 2.3, 0.75, vertical ? 2.3 : 1.0);
  }
}

/* ================================================================== VEHICLE */
var V = {
  spec: null, node: null, body: null, model: null, wheels: [], wheelMeshes: [],
  rpm: 900, gear: 1, speed: 0, steer: 0, throttle: 0, brake: 0, hbrake: 0,
  drift: 0, driftScore: 0, paintMats: [], tailMats: [], headLights: []
};

var WHEEL = {
  rest: 0.34, travel: 0.20, k: 46000, cBump: 4200, cReb: 5200,
  arb: 16000, Iw: 1.6, muRoad: 1.55
};

/* ================================================================== BMW M5 F90 (процедурная)
   Профиль кузова строится 2D-контуром и выдавливается по X (собственная триангуляция ушами).
   Возвращает ту же структуру, что и prepareCarModel(): {root, wheels, size, bb, paintMats, tailMats}
*/
function Prof() { this.p = []; }
Prof.prototype.m = function (z, y) { this.p.push([z, y]); return this; };
Prof.prototype.l = Prof.prototype.m;
Prof.prototype.q = function (cz, cy, z, y) {
  var a = this.p[this.p.length - 1];
  for (var i = 1; i <= 8; i++) {
    var t = i / 8, u = 1 - t;
    this.p.push([u * u * a[0] + 2 * u * t * cz + t * t * z, u * u * a[1] + 2 * u * t * cy + t * t * y]);
  }
  return this;
};
Prof.prototype.arch = function (cz, cy, r) {   /* полукруг от (cz-r) к (cz+r) выпуклостью вверх */
  for (var i = 0; i <= 14; i++) {
    var a = Math.PI - (i / 14) * Math.PI;
    this.p.push([cz + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return this;
};

function _ptInTri(p, a, b, c) {
  var d1 = (p[0] - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (p[1] - b[1]);
  var d2 = (p[0] - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (p[1] - c[1]);
  var d3 = (p[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (p[1] - a[1]);
  var neg = (d1 < 0) || (d2 < 0) || (d3 < 0), pos = (d1 > 0) || (d2 > 0) || (d3 > 0);
  return !(neg && pos);
}
function _earClip(pts) {
  var n = pts.length, idx = [], tri = [], area = 0, i;
  for (i = 0; i < n; i++) { var a = pts[i], b = pts[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
  for (i = 0; i < n; i++) idx.push(area > 0 ? i : n - 1 - i);
  var guard = 0;
  while (idx.length > 3 && guard++ < 20000) {
    var cut = false;
    for (i = 0; i < idx.length; i++) {
      var i0 = idx[(i + idx.length - 1) % idx.length], i1 = idx[i], i2 = idx[(i + 1) % idx.length];
      var A = pts[i0], B = pts[i1], C = pts[i2];
      var cr = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
      if (cr <= 1e-10) continue;
      var ok = true;
      for (var j = 0; j < idx.length; j++) {
        var k = idx[j];
        if (k === i0 || k === i1 || k === i2) continue;
        if (_ptInTri(pts[k], A, B, C)) { ok = false; break; }
      }
      if (!ok) continue;
      tri.push(i0, i1, i2); idx.splice(i, 1); cut = true; break;
    }
    if (!cut) break;
  }
  if (idx.length === 3) tri.push(idx[0], idx[1], idx[2]);
  return tri;
}
/* выдавливание контура (z,y) по оси X на ширину w, с фаской bevel */
function extrudeProfile(name, prof, w, mat, scn, bevel) {
  var pts = prof.p, n = pts.length, hw = w / 2, i, s;
  var cz = 0, cy = 0;
  for (i = 0; i < n; i++) { cz += pts[i][0]; cy += pts[i][1]; }
  cz /= n; cy /= n;
  var bv = bevel === undefined ? 0.07 : bevel;
  var slices = bv > 0
    ? [[-hw, 0.955], [-hw + bv, 1], [hw - bv, 1], [hw, 0.955]]
    : [[-hw, 1], [hw, 1]];
  var pos = [], ind = [], uv = [];
  var cap = _earClip(pts);
  function slicePt(sl, k) {
    var p = pts[k];
    return [sl[0], cy + (p[1] - cy) * sl[1], cz + (p[0] - cz) * sl[1]];
  }
  /* торцы */
  var first = pos.length / 3;
  for (i = 0; i < n; i++) { var a = slicePt(slices[0], i); pos.push(a[0], a[1], a[2]); uv.push(a[2] * 0.2, a[1] * 0.2); }
  for (i = 0; i < cap.length; i += 3) ind.push(first + cap[i], first + cap[i + 1], first + cap[i + 2]);
  var last = pos.length / 3;
  for (i = 0; i < n; i++) { var c2 = slicePt(slices[slices.length - 1], i); pos.push(c2[0], c2[1], c2[2]); uv.push(c2[2] * 0.2, c2[1] * 0.2); }
  for (i = 0; i < cap.length; i += 3) ind.push(last + cap[i], last + cap[i + 2], last + cap[i + 1]);
  /* боковые пояса */
  for (s = 0; s < slices.length - 1; s++) {
    for (i = 0; i < n; i++) {
      var k2 = (i + 1) % n;
      var p0 = slicePt(slices[s], i), p1 = slicePt(slices[s], k2);
      var p2 = slicePt(slices[s + 1], k2), p3 = slicePt(slices[s + 1], i);
      var base = pos.length / 3;
      pos.push(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], p2[0], p2[1], p2[2], p3[0], p3[1], p3[2]);
      uv.push(0, 0, 1, 0, 1, 1, 0, 1);
      ind.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  var vd = new BJ.VertexData();
  vd.positions = pos; vd.indices = ind; vd.uvs = uv;
  var nor = []; BJ.VertexData.ComputeNormals(pos, ind, nor); vd.normals = nor;
  var mesh = new BJ.Mesh(name, scn);
  vd.applyToMesh(mesh, false);
  mesh.material = mat;
  mesh.receiveShadows = true;
  return mesh;
}

function buildM5() {
  var scn = scene;
  var L = 4.97, W = 1.96, HW = W / 2, WHR = 0.37, WBF = 1.49, WBR = -1.49;
  var root = new BJ.TransformNode('m5', scn);
  var parts = [];

  function pbr(name, o) {
    var m = new BJ.PBRMaterial(name, scn);
    m.albedoColor = BJ.Color3.FromHexString(o.c || '#888888');
    m.metallic = o.m === undefined ? 0.2 : o.m;
    m.roughness = o.r === undefined ? 0.5 : o.r;
    m.environmentIntensity = o.ei === undefined ? 1.0 : o.ei;
    if (o.cc) { m.clearCoat.isEnabled = true; m.clearCoat.intensity = 1; m.clearCoat.roughness = 0.05; }
    if (o.e) { m.emissiveColor = BJ.Color3.FromHexString(o.e); m.emissiveIntensity = o.ei2 || 1; }
    if (o.a !== undefined) { m.alpha = o.a; m.transparencyMode = BJ.PBRMaterial.PBRMATERIAL_ALPHABLEND; }
    return m;
  }
  var paint  = pbr('m5paint',  { c: PAINTS[S.paint % PAINTS.length].c, m: 0.78, r: 0.22, ei: 1.15, cc: 1 });
  var dark   = pbr('m5dark',   { c: '#14161a', m: 0.35, r: 0.55, ei: 0.6 });
  var carbon = pbr('m5carbon', { c: '#15171b', m: 0.55, r: 0.4, ei: 0.7 });
  var chrome = pbr('m5chrome', { c: '#c8ced6', m: 1.0, r: 0.14, ei: 1.3 });
  var glass  = pbr('m5glass',  { c: '#070b11', m: 0.2, r: 0.04, ei: 1.5, a: 0.45 });
  var head   = pbr('m5head',   { c: '#d8e6ff', m: 0.2, r: 0.12, e: '#bcd8ff', ei2: 1.2 });
  var tail   = pbr('m5tail',   { c: '#4a0a0e', m: 0.2, r: 0.25, e: '#ff1800', ei2: 0.7 });
  var cabin  = pbr('m5cabin',  { c: '#0c0d10', m: 0.0, r: 0.95, ei: 0.2 });

  /* ---------------- нижний кузов ---------------- */
  var b = new Prof();
  b.m(2.44, 0.32).l(2.475, 0.58).q(2.46, 0.86, 2.34, 0.96)
   .l(1.62, 1.05).q(1.22, 1.08, 1.02, 1.12)
   .l(-0.10, 1.145).l(-1.28, 1.135).q(-1.95, 1.11, -2.22, 1.02)
   .l(-2.42, 0.90).l(-2.475, 0.58).l(-2.40, 0.30).l(-2.12, 0.27);
  b.arch(WBR, 0.30, 0.64);
  b.l(-0.80, 0.21).l(0.80, 0.21);
  b.arch(WBF, 0.30, 0.64);
  b.l(2.38, 0.28);
  parts.push(extrudeProfile('m5body', b, W, paint, scn, 0.09));

  /* ---------------- стеклянная теплица ---------------- */
  var c = new Prof();
  c.m(1.03, 1.10).q(0.66, 1.28, 0.12, 1.405)
   .l(-0.76, 1.415).q(-1.26, 1.35, -1.72, 1.12)
   .l(-1.30, 1.08);
  parts.push(extrudeProfile('m5cab', c, W * 0.74, glass, scn, 0.05));

  /* крыша-карбон */
  var r2 = new Prof();
  r2.m(0.14, 1.398).l(-0.78, 1.408).l(-0.78, 1.33).l(0.14, 1.32);
  parts.push(extrudeProfile('m5roof', r2, W * 0.78, carbon, scn, 0.02));

  function box(w, h, d, mat, x, y, z, rx, ry, rz) {
    var m = BJ.MeshBuilder.CreateBox('p', { width: w, height: h, depth: d }, scn);
    m.position.set(x, y, z);
    m.rotation.set(rx || 0, ry || 0, rz || 0);
    m.material = mat; m.receiveShadows = true;
    parts.push(m); return m;
  }
  function cyl(dT, dB, h, tess, mat, x, y, z, rx, rz) {
    var m = BJ.MeshBuilder.CreateCylinder('c', { diameterTop: dT, diameterBottom: dB, height: h, tessellation: tess }, scn);
    m.position.set(x, y, z); m.rotation.set(rx || 0, 0, rz || 0);
    m.material = mat; m.receiveShadows = true;
    parts.push(m); return m;
  }

  /* салон */
  box(W * 0.66, 0.34, 1.9, cabin, 0, 1.12, -0.26);
  box(W * 0.56, 0.30, 0.5, dark, 0, 1.26, -0.10);

  /* стойки */
  function pillar(x, z0, y0, z1, y1, w) {
    var dz = z1 - z0, dy = y1 - y0, len = Math.hypot(dz, dy);
    box(w, 0.06, len, paint, x, (y0 + y1) / 2, (z0 + z1) / 2, -Math.atan2(dy, dz));
  }
  [-1, 1].forEach(function (s) {
    var x = s * (W * 0.365);
    pillar(x, 1.03, 1.10, 0.13, 1.40, 0.07);
    pillar(x, -0.77, 1.412, -1.70, 1.13, 0.07);
    pillar(x, 0.13, 1.40, -0.77, 1.412, 0.075);
  });

  var FZ = 2.495, RZ = -2.495;
  /* решётка «ноздри» */
  [-0.30, 0.30].forEach(function (x) {
    box(0.58, 0.46, 0.06, chrome, x, 0.80, FZ - 0.01, -0.05);
    box(0.52, 0.40, 0.08, dark,   x, 0.80, FZ + 0.015, -0.05);
    for (var i = 0; i < 5; i++) box(0.03, 0.36, 0.06, chrome, x - 0.2 + i * 0.1, 0.80, FZ + 0.035, -0.05);
  });
  /* лазерные фары */
  [-1, 1].forEach(function (s) {
    box(0.64, 0.16, 0.10, head, s * 0.63, 1.00, FZ - 0.03, 0, 0, s * 0.05);
    box(0.68, 0.045, 0.07, dark, s * 0.63, 0.905, FZ - 0.02);
  });
  box(0.64, 0.26, 0.08, dark, -0.68, 0.54, FZ + 0.005);
  box(0.64, 0.26, 0.08, dark,  0.68, 0.54, FZ + 0.005);
  box(W * 0.95, 0.06, 0.34, carbon, 0, 0.36, FZ - 0.13);
  box(0.05, 0.04, 0.03, pbr('mb1', { c: '#1668b8' }), -0.05, 1.045, FZ + 0.02);
  box(0.05, 0.04, 0.03, pbr('mb2', { c: '#d4202c' }),  0.05, 1.045, FZ + 0.02);

  /* корма */
  [-1, 1].forEach(function (s) {
    box(0.68, 0.19, 0.08, tail, s * 0.60, 0.95, RZ - 0.015);
    box(0.26, 0.09, 0.07, tail, s * 0.28, 0.95, RZ - 0.010);
  });
  box(W * 0.92, 0.22, 0.10, carbon, 0, 0.45, RZ - 0.02);
  for (var fi = 0; fi < 7; fi++) box(0.045, 0.2, 0.22, dark, -0.56 + fi * 0.19, 0.44, RZ - 0.10);
  [-0.78, -0.56, 0.56, 0.78].forEach(function (x) {
    cyl(0.17, 0.19, 0.3, 14, chrome, x, 0.56, RZ - 0.06, Math.PI / 2);
  });
  box(W * 0.86, 0.045, 0.30, carbon, 0, 1.195, RZ + 0.30, 0.17);

  /* борта */
  [-1, 1].forEach(function (s) {
    box(0.09, 0.14, 2.5, carbon, s * (HW - 0.05), 0.31, -0.10);
    box(0.24, 0.10, 0.14, paint, s * (HW + 0.13), 1.20, 0.84, 0, s * 0.22);
    box(0.12, 0.04, 0.05, dark, s * (HW + 0.03), 1.18, 0.80);
    box(0.04, 0.05, 0.26, chrome, s * (HW + 0.01), 1.07, 0.30);
    box(0.04, 0.05, 0.26, chrome, s * (HW + 0.01), 1.07, -0.72);
    box(0.035, 0.12, 0.34, dark, s * (HW + 0.01), 0.95, 1.50);
  });

  parts.forEach(function (m) { m.parent = root; m.isPickable = false; });

  /* ---------------- колёса ---------------- */
  var tireM = pbr('m5tire', { c: '#0b0c0e', m: 0.0, r: 0.93, ei: 0.3 });
  var rimM  = pbr('m5rim',  { c: '#3a3f46', m: 1.0, r: 0.25, ei: 1.4 });
  var discM = pbr('m5disc', { c: '#6a6e73', m: 0.9, r: 0.45 });
  var calM  = pbr('m5cal',  { c: '#a81d22', m: 0.25, r: 0.45 });

  function wheelMesh(name) {
    var h = new BJ.TransformNode(name, scn), ws = 0.31, wp = [];
    function add(m) { m.parent = h; m.isPickable = false; wp.push(m); return m; }
    var t = BJ.MeshBuilder.CreateCylinder(name + '_t', { diameter: WHR * 2, height: ws, tessellation: 30 }, scn);
    t.rotation.z = Math.PI / 2; t.material = tireM; add(t);
    var rim = BJ.MeshBuilder.CreateCylinder(name + '_r', { diameter: WHR * 1.48, height: ws * 0.94, tessellation: 26 }, scn);
    rim.rotation.z = Math.PI / 2; rim.material = rimM; add(rim);
    for (var i = 0; i < 5; i++) for (var k = -1; k <= 1; k += 2) {
      var sp = BJ.MeshBuilder.CreateBox(name + '_s', { width: ws * 0.46, height: WHR * 1.34, depth: 0.05 }, scn);
      sp.material = rimM;
      sp.rotation.z = Math.PI / 2;
      var hold = new BJ.TransformNode(name + '_h', scn);
      sp.parent = hold; sp.isPickable = false;
      hold.rotation.x = i / 5 * Math.PI * 2 + k * 0.17;
      hold.parent = h; wp.push(sp);
    }
    var d = BJ.MeshBuilder.CreateCylinder(name + '_d', { diameter: WHR * 1.2, height: 0.05, tessellation: 22 }, scn);
    d.rotation.z = Math.PI / 2; d.material = discM; add(d);
    var hub = BJ.MeshBuilder.CreateCylinder(name + '_hb', { diameter: WHR * 0.34, height: ws, tessellation: 16 }, scn);
    hub.rotation.z = Math.PI / 2; hub.material = discM; add(hub);
    var cal = BJ.MeshBuilder.CreateBox(name + '_c', { width: 0.055, height: 0.34, depth: 0.16 }, scn);
    cal.position.y = 0.2; cal.material = calM; add(cal);
    h.__meshes = wp;
    return h;
  }

  var wheels = [], defs = [['FL', -0.84, WBF], ['FR', 0.84, WBF], ['RL', -0.84, WBR], ['RR', 0.84, WBR]];
  defs.forEach(function (d) {
    var h = wheelMesh('m5w_' + d[0]);
    h.position.set(d[1], WHR, d[2]);
    h.parent = root;
    wheels.push({ key: d[0], node: h, radius: WHR, pos: new V3(d[1], WHR, d[2]) });
  });

  root.computeWorldMatrix(true);
  var bb = root.getHierarchyBoundingVectors(true);
  var size = bb.max.subtract(bb.min);

  if (typeof csm !== 'undefined' && csm && S.quality >= 1) {
    root.getChildMeshes().forEach(function (m) { csm.addShadowCaster(m); });
  }

  return { root: root, wheels: wheels, size: size, bb: bb, paintMats: [paint], tailMats: [tail] };
}

function prepareCarModel(spec) {
  var src = loadedCars[spec.id];
  if (!src) return null;
  var root = src.root.clone('car_' + spec.id, null, false);
  root.setEnabled(true);
  root.getChildMeshes().forEach(function (m) { m.setEnabled(true); m.isPickable = false; });

  /* масштаб по длине */
  root.computeWorldMatrix(true);
  var bb = root.getHierarchyBoundingVectors(true);
  var size = bb.max.subtract(bb.min);
  var k = spec.len / Math.max(size.z, 0.01);
  root.scaling.scaleInPlace(k);
  root.computeWorldMatrix(true);
  bb = root.getHierarchyBoundingVectors(true);
  size = bb.max.subtract(bb.min);

  /* колёса по именам *_FL_*, *_FR_*, *_RL_*, *_RR_* */
  var corners = { FL: [], FR: [], RL: [], RR: [] };
  root.getChildMeshes().forEach(function (m) {
    var mm = /_(FL|FR|RL|RR)(_|$|\.)/i.exec(m.name || '');
    if (mm) corners[mm[1].toUpperCase()].push(m);
  });

  var wheels = [];
  ['FL', 'FR', 'RL', 'RR'].forEach(function (key) {
    var list = corners[key];
    if (!list.length) return;
    var holder = new BJ.TransformNode('wh_' + key, scene);
    var min = null, max = null;
    list.forEach(function (m) {
      m.computeWorldMatrix(true);
      var b = m.getBoundingInfo().boundingBox;
      if (!min) { min = b.minimumWorld.clone(); max = b.maximumWorld.clone(); }
      else { min = V3.Minimize(min, b.minimumWorld); max = V3.Maximize(max, b.maximumWorld); }
    });
    var c = min.add(max).scale(0.5);
    var sz = max.subtract(min);
    holder.position.copyFrom(c);
    list.forEach(function (m) {
      var wm = m.getWorldMatrix().clone();
      m.parent = holder;
      m.position.set(wm.getTranslation().x - c.x, wm.getTranslation().y - c.y, wm.getTranslation().z - c.z);
    });
    wheels.push({ key: key, node: holder, radius: Math.max(sz.y, sz.z) / 2, pos: c.clone() });
  });

  var paintMats = [], tailMats = [];
  root.getChildMeshes().forEach(function (m) {
    var mat = m.material;
    if (!mat) return;
    var nm = (mat.name || '') + ' ' + (m.name || '');
    if (mat.getClassName && mat.getClassName().indexOf('PBR') >= 0) {
      mat.environmentIntensity = 1.1;
      if (/paint|graphite|liquid|body/i.test(nm) && !/trim|carbon|glass|tyre|void/i.test(nm)) {
        mat.clearCoat.isEnabled = true;
        mat.clearCoat.intensity = 1.0;
        mat.clearCoat.roughness = 0.05;
        mat.metallic = 0.75; mat.roughness = 0.22;
        if (paintMats.indexOf(mat) < 0) paintMats.push(mat);
      }
      if (/light_red|taillight|brightring|lightline/i.test(nm)) {
        if (tailMats.indexOf(mat) < 0) tailMats.push(mat);
      }
      if (/glass|canopy/i.test(nm)) {
        mat.alpha = 0.42; mat.transparencyMode = BJ.PBRMaterial.PBRMATERIAL_ALPHABLEND;
        mat.metallic = 0.1; mat.roughness = 0.04;
      }
      if (/tyre|tire/i.test(nm)) { mat.metallic = 0; mat.roughness = 0.95; }
    }
    if (S.quality >= 1) csm.addShadowCaster(m);
  });

  return { root: root, wheels: wheels, size: size, bb: bb, paintMats: paintMats, tailMats: tailMats };
}

function spawnCar(id) {
  var spec = null;
  CARS.forEach(function (c) { if (c.id === id) spec = c; });
  if (!spec) spec = CARS[0];
  V.spec = spec;

  if (V.node) { if (V.body) V.body.dispose(); V.node.dispose(false, false); }
  V.wheels = [];

  var built = spec.file ? prepareCarModel(spec) : buildM5();
  if (!built) { console.warn('нет модели', id); return; }

  var model = built.root;
  var bb = built.bb, size = built.size;

  var node = new BJ.TransformNode('chassis', scene);
  node.rotationQuaternion = Q.Identity();
  node.position.set(SPAWN.x, SPAWN.y + size.y * 0.42 + 0.15, SPAWN.z);
  var centre = bb.min.add(bb.max).scale(0.5);
  var groundY = bb.min.y;
  model.parent = node;
  model.position.set(-centre.x, -groundY - size.y * 0.42, -centre.z);

  /* колёса — вынимаем из модели, двигаем сами */
  V.wheelMeshes = [];
  var wheelInfo = [];
  built.wheels.forEach(function (w) {
    w.node.parent = null;
    var rel = w.pos.subtract(new V3(centre.x, groundY + size.y * 0.42, centre.z));
    wheelInfo.push({
      key: w.key, radius: w.radius, node: w.node,
      local: new V3(rel.x, rel.y, rel.z),
      front: w.key[0] === 'F',
      left: w.key[1] === 'L',
      comp: 0, prevComp: 0, omega: 0, onGround: false, load: 0, slip: 0, lat: 0,
      contact: new V3(0, 0, 0), normal: new V3(0, 1, 0)
    });
    V.wheelMeshes.push(w.node);
  });
  if (wheelInfo.length < 4) { console.warn('мало колёс', wheelInfo.length); }

  var hx = size.x / 2 * 0.95, hy = size.y / 2 * 0.72, hz = size.z / 2 * 0.98;
  var body = new BJ.PhysicsBody(node, BJ.PhysicsMotionType.DYNAMIC, false, scene);
  var shape = new BJ.PhysicsShapeBox(new V3(0, 0.05, 0), Q.Identity(), new V3(hx * 2, hy * 2, hz * 2), scene);
  shape.material = { friction: 0.35, restitution: 0.02 };
  shape.filterMembershipMask = MASK_CAR;
  shape.filterCollideMask = 0xffffffff;
  body.shape = shape;
  var m = spec.mass;
  body.setMassProperties({
    mass: m,
    centerOfMass: new V3(0, -size.y * 0.16, -0.05),
    inertia: new V3(m * (size.y * size.y + size.z * size.z) / 12 * 0.9,
                    m * (size.x * size.x + size.z * size.z) / 12 * 0.95,
                    m * (size.x * size.x + size.y * size.y) / 12 * 0.8),
    inertiaOrientation: Q.Identity()
  });
  body.setLinearDamping(0.02);
  body.setAngularDamping(0.25);


  V.node = node; V.body = body; V.model = model;
  V.wheels = wheelInfo;
  V.paintMats = built.paintMats; V.tailMats = built.tailMats;
  V.rpm = 900; V.gear = 1; V.speed = 0;
  applyPaint();

  /* фары */
  V.headLights.forEach(function (l) { l.dispose(); });
  V.headLights = [];
  for (var i = 0; i < 2; i++) {
    var sp = new BJ.SpotLight('hl' + i, new V3(0, 0, 0), new V3(0, -0.1, 1), 1.1, 12, scene);
    sp.intensity = 0; sp.range = 70;
    sp.diffuse = new BJ.Color3(1, 0.96, 0.88);
    V.headLights.push(sp);
  }
}

function applyPaint() {
  var hex = PAINTS[S.paint % PAINTS.length].c;
  var c = BJ.Color3.FromHexString(hex);
  V.paintMats.forEach(function (m) { m.albedoColor = c; });
}

/* ---------------------------------------------------------------- шины */
function pacejka(slip, B, C, D, E) {
  var Bs = B * slip;
  return D * Math.sin(C * Math.atan(Bs - E * (Bs - Math.atan(Bs))));
}

var ray = new BJ.PhysicsRaycastResult();
var tmpV = new V3(), up = new V3(0, 1, 0);

function torqueCurve(spec, rpm) {
  var r = rpm / spec.redline;
  if (r < 0.1) return spec.torque * 0.4;
  var t = spec.torque * (0.55 + 0.75 * Math.sin(Math.min(1, r * 1.15) * Math.PI * 0.82));
  if (rpm > spec.redline) t *= Math.max(0, 1 - (rpm - spec.redline) / 600);
  return Math.max(0, t);
}

function vehicleStep(dt) {
  if (!V.body || !V.node) return;
  dt = Math.min(dt, 1 / 30);
  var body = V.body, node = V.node;
  node.computeWorldMatrix(true);
  var wm = node.getWorldMatrix();
  var fwd = V3.TransformNormal(new V3(0, 0, 1), wm).normalize();
  var right = V3.TransformNormal(new V3(1, 0, 0), wm).normalize();
  var upv = V3.TransformNormal(new V3(0, 1, 0), wm).normalize();
  var pos = node.getAbsolutePosition();

  var lv = body.getLinearVelocity();
  var av = body.getAngularVelocity();
  var vLong = V3.Dot(lv, fwd);
  var speed = lv.length();
  V.speed = speed;
  var kmh = Math.abs(vLong) * 3.6;

  /* --- руль: чем быстрее, тем меньше угол --- */
  var maxSteer = 0.58 / (1 + kmh * 0.011);
  var target = (keys.left ? 1 : 0) - (keys.right ? 1 : 0);
  var rate = 3.2 * dt * (1 + 1.2 * (1 - Math.min(1, kmh / 120)));
  V.steer += Math.max(-rate, Math.min(rate, target * maxSteer - V.steer));
  V.steer = Math.max(-maxSteer, Math.min(maxSteer, V.steer));

  V.throttle += ((keys.up ? 1 : 0) - V.throttle) * Math.min(1, dt * 9);
  V.brake += ((keys.down ? 1 : 0) - V.brake) * Math.min(1, dt * 12);
  V.hbrake = keys.hb ? 1 : 0;

  /* --- коробка --- */
  var spec = V.spec;
  var gearRatio = spec.gears[V.gear - 1] * spec.fd;
  var avgWheelR = V.wheels.length ? V.wheels[0].radius : 0.34;
  var wheelOmegaAvg = 0, driven = 0;
  V.wheels.forEach(function (w) {
    var isDriven = spec.drive === 'awd' || (spec.drive === 'rwd' ? !w.front : w.front);
    if (isDriven) { wheelOmegaAvg += w.omega; driven++; }
  });
  if (driven) wheelOmegaAvg /= driven;
  var rpmWheel = Math.abs(wheelOmegaAvg) * gearRatio * 60 / (2 * Math.PI);
  var vAbs = Math.abs(vLong);

  /* гидротрансформатор: на старте сцепление замкнуто, обороты подхватывают */
  var converter = vAbs < 8 && V.throttle > 0.05;
  var rpmTarget = Math.max(850, Math.min(spec.redline + 200, rpmWheel));
  if (converter) rpmTarget = Math.max(rpmTarget, 1400 + V.throttle * 3200);
  V.rpm += (rpmTarget - V.rpm) * Math.min(1, dt * 14);

  /* переключения — по оборотам от колёс, с блокировкой */
  V.shiftT = Math.max(0, (V.shiftT || 0) - dt);
  if (V.shiftT <= 0) {
    if (rpmWheel > spec.redline * 0.95 && V.gear < spec.gears.length && V.throttle > 0.15) { V.gear++; V.shiftT = 0.35; }
    else if (rpmWheel < spec.redline * 0.40 && V.gear > 1 && !converter) { V.gear--; V.shiftT = 0.35; }
    else if (converter && V.gear > 1 && vAbs < 4) { V.gear = 1; V.shiftT = 0.3; }
  }
  var clutch = converter ? 1 : Math.min(1, Math.max(0, (V.rpm - 850) / 500));
  var engineTorque = torqueCurve(spec, V.rpm) * V.throttle * (V.shiftT > 0.22 ? 0 : 1) * clutch;
  var driveTorquePerWheel = driven ? engineTorque * gearRatio * 0.92 / driven : 0;

  /* --- подвеска + шины --- */
  var totalLoad = 0;
  var comps = {};
  V.wheels.forEach(function (w) {
    var wpWorld = V3.TransformCoordinates(w.local, wm);
    var from = wpWorld.add(upv.scale(0.12));
    var to = wpWorld.subtract(upv.scale(WHEEL.rest + w.radius));
    physEngine.raycastToRef(from, to, ray, { collideWith: MASK_WORLD });
    if (ray.hasHit) {
      var hp = ray.hitPointWorld;
      var dist = V3.Distance(from, hp);
      var comp = (WHEEL.rest + w.radius + 0.12) - dist;
      w.comp = Math.max(0, Math.min(WHEEL.rest, comp));
      w.onGround = true;
      w.contact.copyFrom(hp);
      w.normal.copyFrom(ray.hitNormalWorld);
    } else {
      w.comp = 0; w.onGround = false;
    }
    comps[w.key] = w.comp;
  });

  V.wheels.forEach(function (w) {
    var mesh = w.node;
    var wpWorld = V3.TransformCoordinates(w.local, wm);

    if (!w.onGround) {
      w.load = 0;
      w.omega *= (1 - dt * 0.6);
      w.omega += driveTorquePerWheel / WHEEL.Iw * dt *
        ((spec.drive === 'awd' || (spec.drive === 'rwd' ? !w.front : w.front)) ? 1 : 0);
      if (mesh) {
        var dropPos = wpWorld.subtract(upv.scale(WHEEL.rest));
        mesh.position.copyFrom(dropPos);
        setWheelRotation(w, mesh, fwd, upv);
      }
      return;
    }

    /* пружина + демпфер */
    var vel = pointVelocity(lv, av, w.contact, pos);
    var vNormal = V3.Dot(vel, w.normal);
    var damper = (vNormal < 0 ? WHEEL.cBump : WHEEL.cReb);
    var Fz = WHEEL.k * w.comp - damper * vNormal;

    /* стабилизатор поперечной устойчивости */
    var other = w.front ? (w.left ? comps.FR : comps.FL) : (w.left ? comps.RR : comps.RL);
    Fz += WHEEL.arb * (w.comp - (other || 0));
    Fz = Math.max(0, Math.min(Fz, spec.mass * 16));
    w.load = Fz;
    totalLoad += Fz;
    body.applyImpulse(w.normal.scale(Fz * dt), w.contact);

    /* направления в плоскости контакта */
    var steerAngle = w.front ? V.steer * (w.left ? 1.0 : 0.88) : 0;
    var wf = rotateAround(fwd, upv, steerAngle);
    var cf = wf.subtract(w.normal.scale(V3.Dot(wf, w.normal)));
    if (cf.lengthSquared() < 1e-6) return;
    cf.normalize();
    var cr = V3.Cross(w.normal, cf).normalize();

    var vLongW = V3.Dot(vel, cf);
    var vLatW = V3.Dot(vel, cr);

    /* проскальзывание */
    var slipRatio = (w.omega * w.radius - vLongW) / Math.max(Math.abs(vLongW), 2.2);
    var slipAngle = Math.atan2(-vLatW, Math.max(Math.abs(vLongW), 1.2));
    w.slip = slipRatio; w.lat = slipAngle;

    var mu = WHEEL.muRoad * (1 - Math.min(0.32, (Fz / (spec.mass * 9.81)) * 0.22));
    var Fx = pacejka(slipRatio, 11, 1.62, mu * Fz, 0.92);
    var Fy = pacejka(slipAngle, 8.4, 1.42, mu * Fz, 0.95);
    if (!w.front && V.hbrake) { Fx *= 0.35; Fy *= 0.48; }

    /* круг сцепления */
    var mag = Math.hypot(Fx, Fy), lim = mu * Fz;
    if (mag > lim && mag > 1e-3) { var s = lim / mag; Fx *= s; Fy *= s; }

    body.applyImpulse(cf.scale(Fx * dt).add(cr.scale(Fy * dt)), w.contact);

    /* динамика колеса */
    var isDriven = spec.drive === 'awd' || (spec.drive === 'rwd' ? !w.front : w.front);
    var Tdrive = isDriven ? driveTorquePerWheel : 0;
    var brakeTorque = V.brake * (w.front ? 3400 : 2300) + (V.hbrake && !w.front ? 4200 : 0);
    /* ABS */
    if (Math.abs(slipRatio) > 0.22 && V.brake > 0 && !V.hbrake) brakeTorque *= 0.35;
    /* TCS */
    if (slipRatio > 0.35 && V.throttle > 0) Tdrive *= 0.45;

    var Treaction = -Fx * w.radius;
    var dOmega = (Tdrive + Treaction) / WHEEL.Iw * dt;
    w.omega += dOmega;
    var bt = brakeTorque / WHEEL.Iw * dt;
    if (Math.abs(w.omega) <= bt) w.omega = 0; else w.omega -= Math.sign(w.omega) * bt;
    if (V.throttle < 0.02 && !V.brake) w.omega *= (1 - dt * 0.25);  /* торможение двигателем */

    if (mesh) {
      mesh.position.copyFrom(w.contact.add(w.normal.scale(w.radius)));
      setWheelRotation(w, mesh, cf, w.normal);
      w.spin = (w.spin || 0) + w.omega * dt;
    }
  });

  /* аэродинамика */
  if (speed > 0.5) {
    var drag = lv.normalizeToNew().scale(-0.42 * speed * speed * dt);
    body.applyImpulse(drag, pos);
    body.applyImpulse(upv.scale(-0.95 * vLong * vLong * dt), pos.subtract(fwd.scale(0.3)));
  }

  /* задний ход */
  if (V.brake > 0.5 && vLong < 0.6 && V.gear === 1) {
    body.applyImpulse(fwd.scale(-spec.mass * 3.2 * V.brake * dt), pos);
  }

  /* дрифт */
  var slipAng = Math.abs(Math.atan2(V3.Dot(lv, right), Math.max(0.6, vLong)));
  if (kmh > 35 && slipAng > 0.24) {
    V.drift += dt; V.driftScore += dt * kmh * slipAng * 0.9;
  } else if (V.drift > 0) {
    if (V.driftScore > S.bestDrift) S.bestDrift = V.driftScore;
    V.drift = 0; V.driftScore *= 0.0;
  }

  S.top = Math.max(S.top, kmh);
  S.dist += Math.abs(vLong) * dt;

  /* фары */
  V.headLights.forEach(function (l, i) {
    var o = pos.add(fwd.scale(V.spec.len * 0.42)).add(right.scale((i ? 1 : -1) * 0.6)).add(upv.scale(0.25));
    l.position.copyFrom(o);
    l.direction = fwd.add(upv.scale(-0.12)).normalize();
    l.intensity = S.headlights ? (S.night ? 220 : 90) : 0;
  });
  V.tailMats.forEach(function (m) {
    m.emissiveColor = (V.brake > 0.1) ? new BJ.Color3(1.6, 0.05, 0.03)
      : (S.night || S.headlights ? new BJ.Color3(0.45, 0.02, 0.01) : new BJ.Color3(0.12, 0.01, 0.01));
  });
}

function setWheelRotation(w, mesh, fwdDir, normal) {
  var r = V3.Cross(normal, fwdDir).normalize();
  var f = V3.Cross(r, normal).normalize();
  var m = BJ.Matrix.FromValues(
    r.x, r.y, r.z, 0,
    normal.x, normal.y, normal.z, 0,
    f.x, f.y, f.z, 0,
    0, 0, 0, 1);
  var q = Q.FromRotationMatrix(m);
  var spin = Q.RotationAxis(new V3(1, 0, 0), -(w.spin || 0));
  mesh.rotationQuaternion = q.multiply(spin);
}

function pointVelocity(lv, av, point, com) {
  var r = point.subtract(com);
  return lv.add(V3.Cross(av, r));
}

function rotateAround(v, axis, angle) {
  var q = Q.RotationAxis(axis, angle);
  var m = new BJ.Matrix();
  BJ.Matrix.FromQuaternionToRef(q, m);
  return V3.TransformNormal(v, m).normalize();
}

/* ================================================================== CAMERA */
var camPos = new V3(0, 5, -10), camTarget = new V3(0, 0, 0);
function updateCamera(dt) {
  if (!V.node) return;
  V.node.computeWorldMatrix(true);
  var wm = V.node.getWorldMatrix();
  var fwd = V3.TransformNormal(new V3(0, 0, 1), wm).normalize();
  var upv = V3.TransformNormal(new V3(0, 1, 0), wm).normalize();
  var pos = V.node.getAbsolutePosition();
  var kmh = V.speed * 3.6;
  var desired, look;

  if (S.camMode === 0) {         /* погоня — близко */
    var back = V.spec.len * 0.72 + 2.5 + Math.min(1.7, kmh / 110);
    desired = pos.subtract(fwd.scale(back)).add(new V3(0, 2.18, 0));
    look = pos.add(fwd.scale(9)).add(new V3(0, 0.9, 0));
  } else if (S.camMode === 1) {  /* капот */
    desired = pos.add(fwd.scale(0.05)).add(upv.scale(0.62));
    look = pos.add(fwd.scale(16)).add(upv.scale(0.5));
  } else if (S.camMode === 2) {  /* бампер */
    desired = pos.add(fwd.scale(V.spec.len * 0.45)).add(upv.scale(0.12));
    look = pos.add(fwd.scale(18));
  } else {                        /* кино */
    desired = pos.subtract(fwd.scale(7.5)).add(new V3(0, 3.1, 0));
    look = pos.add(fwd.scale(4));
  }
  var k = 1 - Math.pow(0.0015, dt);
  if (S.camMode === 1 || S.camMode === 2) k = 1;
  camPos = V3.Lerp(camPos, desired, k);
  camTarget = V3.Lerp(camTarget, look, Math.min(1, k * 1.5));
  camera.position.copyFrom(camPos);
  camera.setTarget(camTarget);
  camera.fov = 0.78 + Math.min(0.16, kmh / 1600);
}

/* ================================================================== HUD */
var mmCtx = null;
function initHUD() {
  var c = el('minimap');
  if (c) { c.width = 168; c.height = 168; mmCtx = c.getContext('2d'); }
  el('mapWrap').classList.toggle('on', S.map);
}
var hudT = 0;
function updateHUD(dt) {
  hudT += dt;
  var kmh = Math.round(Math.abs(V.speed * 3.6));
  el('spd').textContent = kmh;
  el('gear').textContent = V.gear;
  el('rpmfill').style.width = Math.min(100, V.rpm / V.spec.redline * 100) + '%';
  var d = el('drift');
  if (V.drift > 0.35) { d.style.opacity = '1'; el('driftScore').textContent = Math.round(V.driftScore); }
  else d.style.opacity = '0';
  if (hudT > 0.2 && mmCtx) { hudT = 0; drawMap(); }
}
function drawMap() {
  if (!S.map || !V.node) return;
  var ctx = mmCtx, R = 84, SC = R / 240;
  ctx.clearRect(0, 0, 168, 168);
  ctx.fillStyle = '#0b1018'; ctx.fillRect(0, 0, 168, 168);
  var p = V.node.getAbsolutePosition();
  var wm = V.node.getWorldMatrix();
  var fwd = V3.TransformNormal(new V3(0, 0, 1), wm);
  var ang = Math.atan2(fwd.x, fwd.z);
  ctx.save(); ctx.translate(R, R); ctx.rotate(ang);
  ctx.strokeStyle = '#2a3a52'; ctx.lineWidth = ROADW * SC;
  roadPos.forEach(function (rp) {
    ctx.beginPath();
    ctx.moveTo((rp - p.x) * SC, (-cityExtent - p.z) * SC);
    ctx.lineTo((rp - p.x) * SC, (cityExtent - p.z) * SC); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo((-cityExtent - p.x) * SC, (rp - p.z) * SC);
    ctx.lineTo((cityExtent - p.x) * SC, (rp - p.z) * SC); ctx.stroke();
  });
  ctx.fillStyle = '#39465c';
  buildingsMM.forEach(function (b) {
    var dx = (b.x - p.x) * SC, dz = (b.z - p.z) * SC;
    if (Math.abs(dx) > R || Math.abs(dz) > R) return;
    ctx.fillRect(dx - b.hx * SC, dz - b.hz * SC, b.hx * 2 * SC, b.hz * 2 * SC);
  });
  ctx.restore();
  ctx.fillStyle = '#4ea8ff';
  ctx.beginPath(); ctx.moveTo(R, R - 7); ctx.lineTo(R - 5, R + 6); ctx.lineTo(R + 5, R + 6);
  ctx.closePath(); ctx.fill();
}

function toast(txt) {
  var t = el('toast');
  t.textContent = txt; t.style.opacity = '1';
  clearTimeout(toast._t);
  toast._t = setTimeout(function () { t.style.opacity = '0'; }, 1400);
}

/* ================================================================== INPUT */
var keys = { up: 0, down: 0, left: 0, right: 0, hb: 0 };
addEventListener('keydown', function (e) {
  var c = e.code;
  if (c === 'KeyW' || c === 'ArrowUp') keys.up = 1;
  else if (c === 'KeyS' || c === 'ArrowDown') keys.down = 1;
  else if (c === 'KeyA' || c === 'ArrowLeft') keys.left = 1;
  else if (c === 'KeyD' || c === 'ArrowRight') keys.right = 1;
  else if (c === 'Space') keys.hb = 1;
  else if (c === 'KeyC') { S.camMode = (S.camMode + 1) % 4; toast(['погоня', 'капот', 'бампер', 'кино'][S.camMode]); }
  else if (c === 'KeyH') { S.headlights = !S.headlights; toast('фары ' + (S.headlights ? 'вкл' : 'выкл')); }
  else if (c === 'KeyV') { S.paint = (S.paint + 1) % PAINTS.length; applyPaint(); toast(PAINTS[S.paint].n); }
  else if (c === 'KeyR') respawn();
  else if (c === 'Tab') { S.map = !S.map; el('mapWrap').classList.toggle('on', S.map); e.preventDefault(); }
  else if (c === 'KeyF') toggleFullscreen();
  else if (c === 'Escape') togglePause();
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(c) >= 0) e.preventDefault();
});
addEventListener('keyup', function (e) {
  var c = e.code;
  if (c === 'KeyW' || c === 'ArrowUp') keys.up = 0;
  else if (c === 'KeyS' || c === 'ArrowDown') keys.down = 0;
  else if (c === 'KeyA' || c === 'ArrowLeft') keys.left = 0;
  else if (c === 'KeyD' || c === 'ArrowRight') keys.right = 0;
  else if (c === 'Space') keys.hb = 0;
});
Array.prototype.forEach.call(document.querySelectorAll('.tbtn'), function (b) {
  var k = b.getAttribute('data-k');
  var map = { t: 'up', b: 'down', l: 'left', r: 'right', hb: 'hb' };
  var set = function (v) { return function (e) { keys[map[k]] = v; e.preventDefault(); }; };
  b.addEventListener('touchstart', set(1)); b.addEventListener('touchend', set(0));
  b.addEventListener('mousedown', set(1)); b.addEventListener('mouseup', set(0));
});

function respawn() {
  if (!V.body) return;
  var p = new V3(SPAWN.x, SPAWN.y + 0.9, SPAWN.z);
  V.body.setLinearVelocity(V3.Zero());
  V.body.setAngularVelocity(V3.Zero());
  V.node.position.copyFrom(p);
  V.node.rotationQuaternion = Q.Identity();
  V.body.setTargetTransform(p, Q.Identity());
  V.wheels.forEach(function (w) { w.omega = 0; });
  V.gear = 1; V.rpm = 900;
  toast('на старт');
}

function toggleFullscreen() {
  if (!document.fullscreenElement) (document.documentElement.requestFullscreen || function () {}).call(document.documentElement);
  else document.exitFullscreen();
}
function togglePause() {
  if (!S.started) return;
  S.paused = !S.paused;
  el('pause').classList.toggle('hidden', !S.paused);
  if (S.paused) {
    el('pTop').textContent = Math.round(S.top) + ' км/ч';
    el('pDist').textContent = (S.dist / 1000).toFixed(2) + ' км';
    el('pDrift').textContent = Math.round(S.bestDrift);
    el('pFps').textContent = Math.round(S.fps);
  }
}

/* ================================================================== BOOT SEQ */
function buildGarage() {
  var box = el('cars');
  box.innerHTML = '';
  CARS.forEach(function (c) {
    if (c.file && !loadedCars[c.id]) return;
    var d = document.createElement('div');
    d.className = 'carOpt' + (c.id === S.carId ? ' sel' : '');
    d.innerHTML = c.name + '<small>' + c.note + '</small>';
    d.onclick = function () {
      Array.prototype.forEach.call(box.children, function (x) { x.classList.remove('sel'); });
      d.classList.add('sel');
      S.carId = c.id;
      if (S.started) spawnCar(S.carId);
    };
    box.appendChild(d);
  });
}

async function boot() {
  initEngine();
  initLights();

  /* окружение */
  var hdr = new BJ.HDRCubeTexture(A(ASSETS + 'env/sky.hdr'), scene, 256, false, true, false, true);
  scene.environmentTexture = hdr;
  mats.sky = scene.createDefaultSkybox(hdr, true, 1600, 0.08, false);

  /* физика */
  var hkOpts = {};
  if (window.__HAVOK_WASM) hkOpts.wasmBinary = window.__HAVOK_WASM;
  else hkOpts.locateFile = function (f) { return 'lib/' + f; };
  var hk = await HavokPhysics(hkOpts);
  hkPlugin = new BJ.HavokPlugin(true, hk);
  scene.enablePhysics(new V3(0, -9.81, 0), hkPlugin);
  physEngine = scene.getPhysicsEngine();
  physEngine.setTimeStep(1 / 120);

  /* модели */
  await Promise.all(CARS.filter(function (c) { return !!c.file; }).map(loadCarGLB));
  el('loadTxt').textContent = 'готово';
  el('loading').style.display = 'none';
  el('ready').style.display = 'block';
  buildGarage();

  if (qs.auto) {
    if (qs.car) S.carId = qs.car;
    if (qs.q !== undefined) S.quality = parseInt(qs.q, 10);
    if (qs.tod) S.timeOfDay = qs.tod;
    if (qs.cam) S.camMode = parseInt(qs.cam, 10);
    start();
  }
}

var started = false;
function start() {
  if (started) {
    spawnCar(S.carId);
    S.started = true;
    el('menu').classList.add('hidden');
    el('hud').classList.add('show');
    return;
  }
  started = true;
  el('menu').classList.add('hidden');
  el('hud').classList.add('show');

  initPost();
  applyTimeOfDay();
  buildWorld();
  if (!qs.notraffic) placeTraffic();
  spawnCar(S.carId);
  initHUD();
  S.started = true;

  if (qs.phys) { runPhysBench(); return; }

  scene.onBeforePhysicsObservable.add(function () {
    if (S.paused || !S.started) return;
    vehicleStep(engine.getDeltaTime() / 1000);
  });

  var fpsT = performance.now(), frames = 0;
  engine.resize();
  setTimeout(function () { engine.resize(); }, 100);
  engine.runRenderLoop(function () {
    var dt = Math.min(engine.getDeltaTime() / 1000, 0.1);
    if (S.started && !S.paused) { updateCamera(dt); updateHUD(dt); }
    scene.render();
    frames++;
    var now = performance.now();
    if (now - fpsT > 500) { S.fps = frames * 1000 / (now - fpsT); frames = 0; fpsT = now; }
  });
  addEventListener('resize', function () { engine.resize(); });
}

el('startBtn').onclick = function () {
  S.quality = parseInt(el('qSel').value, 10);
  S.timeOfDay = el('tSel').value;
  if (el('fsCheck').checked) toggleFullscreen();
  start();
  setTimeout(function () { var h = el('hint'); if (h) h.style.opacity = '0'; }, 9000);
};
el('resumeBtn').onclick = togglePause;
el('fsBtn').onclick = toggleFullscreen;
el('respawnBtn').onclick = function () { respawn(); togglePause(); };
el('garageBtn').onclick = function () {
  S.paused = false; S.started = false;
  el('pause').classList.add('hidden');
  el('menu').classList.remove('hidden');
  el('hud').classList.remove('show');
};

/* ---- headless-стенд: физика без рендера (для отладки и настройки) ---- */
function runPhysBench() {
  var dt = 1 / 120, secs = parseFloat(qs.secs || '14');
  var n = Math.round(secs / dt), i = 0;
  var log = [], t0 = 0, t100 = 0, t200 = 0, topS = 0, heights = [];
  keys.up = qs.throttle === '0' ? 0 : 1;
  function chunk() {
    var end = Math.min(n, i + 2000);
    for (; i < end; i++) {
      if (!qs.nosusp) vehicleStep(dt);
      physEngine._step(dt);
      var kmh = Math.abs(V.speed * 3.6);
      if (kmh > topS) topS = kmh;
      if (!t100 && kmh >= 100) t100 = i * dt;
      if (!t200 && kmh >= 200) t200 = i * dt;
      if (i % 120 === 0) {
        log.push({ t: +(i * dt).toFixed(1), kmh: +kmh.toFixed(1), y: +V.node.position.y.toFixed(2),
                   gear: V.gear, rpm: Math.round(V.rpm),
                   gnd: V.wheels.map(function (w) { return w.onGround ? 1 : 0; }).join(''),
                   load: Math.round(V.wheels.reduce(function (a, w) { return a + w.load; }, 0)),
                   vy: +V.body.getLinearVelocity().y.toFixed(2) });
      }
    }
    if (i < n) setTimeout(chunk, 0);
    else window.__phys = { t100: +t100.toFixed(2), t200: +t200.toFixed(2), top: +topS.toFixed(1), log: log };
  }
  chunk();
}

window.__dbg = function () {
  return {
    started: S.started, car: S.carId, fps: +S.fps.toFixed(1),
    pos: V.node ? [+V.node.position.x.toFixed(2), +V.node.position.y.toFixed(2), +V.node.position.z.toFixed(2)] : null,
    kmh: +(V.speed * 3.6).toFixed(1), gear: V.gear, rpm: Math.round(V.rpm),
    wheels: V.wheels.map(function (w) { return [w.onGround ? 1 : 0, Math.round(w.load)]; }),
    meshes: scene ? scene.meshes.length : 0,
    draws: engine ? engine._drawCalls && engine._drawCalls.current : 0
  };
};

boot().catch(function (e) {
  console.error('boot error', e && e.stack ? e.stack.slice(0,600) : e);
  el('loadTxt').textContent = 'ошибка загрузки: ' + e.message;
});

})();
