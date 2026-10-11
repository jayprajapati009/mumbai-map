import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// -----------------------------------------------------------------------
// Procedural Mumbai — a real-time 3D city view built from OpenStreetMap
// building footprints, roads, water and parks, plus simulated traffic.
// Inspired by jeantimex/tokyo (https://github.com/jeantimex/tokyo); no code
// from that project is reused.
// -----------------------------------------------------------------------

const loadingEl = document.getElementById('loading');
const loadingFill = document.getElementById('loading-fill');
const loadingStatus = document.getElementById('loading-status');

function setProgress(pct, label) {
  loadingFill.style.width = `${Math.round(pct * 100)}%`;
  if (label) loadingStatus.textContent = label;
}

const app = document.getElementById('app');

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 1, 40000);
camera.position.set(650, 520, 820);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 40;
controls.maxDistance = 16000; // far enough to see the whole ~10km mapped area from top-down
controls.maxPolarAngle = Math.PI * 0.49;
controls.target.set(0, 20, 0);
controls.update();

// --- Lights -------------------------------------------------------------
const hemi = new THREE.HemisphereLight(0x6f8fae, 0x1a1c22, 0.55);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffffff, 1.0);
sun.position.set(-400, 600, 300);
scene.add(sun);

const ambient = new THREE.AmbientLight(0xffffff, 0.18);
scene.add(ambient);

// --- Postprocessing (bloom for lit windows / night mode) ---------------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.9, 0.55, 0.15
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

// --- Ground ---------------------------------------------------------------
const groundGeo = new THREE.PlaneGeometry(20000, 20000);
const groundMat = new THREE.MeshStandardMaterial({ color: 0x14181d, roughness: 1, metalness: 0 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.3;
scene.add(ground);

// -----------------------------------------------------------------------
// Color palettes (day vs night)
// -----------------------------------------------------------------------
const PALETTES = {
  night: {
    bg: 0x05070a,
    fog: 0x05070a,
    fogNear: 5000,
    fogFar: 19000,
    hemiSky: 0x33475c,
    hemiGround: 0x0a0b0d,
    hemiIntensity: 0.35,
    sunColor: 0x9ec9ff,
    sunIntensity: 0.35,
    ambient: 0.12,
    ground: 0x0b0d10,
    water: 0x0d3a52,
    waterEmissive: 0x0f5c82,
    park: 0x0e2318,
    bloom: 0.9,
    windowOpacity: 1.0,
  },
  day: {
    bg: 0x9fc7e0,
    fog: 0xb9d9ec,
    fogNear: 6000,
    fogFar: 23000,
    hemiSky: 0xbfe0f5,
    hemiGround: 0x4a4536,
    hemiIntensity: 0.9,
    sunColor: 0xfff3d6,
    sunIntensity: 1.3,
    ambient: 0.35,
    ground: 0x2f3a2d,
    water: 0x2e7da6,
    waterEmissive: 0x000000,
    park: 0x3c7a4a,
    bloom: 0.0,
    windowOpacity: 0.0,
  },
};

let currentMode = 'night';
let windowLightsMesh = null;
let waterMat = null;

function applyPalette(mode) {
  const p = PALETTES[mode];
  scene.background = new THREE.Color(p.bg);
  scene.fog = new THREE.Fog(p.fog, p.fogNear, p.fogFar);
  hemi.color.setHex(p.hemiSky);
  hemi.groundColor.setHex(p.hemiGround);
  hemi.intensity = p.hemiIntensity;
  sun.color.setHex(p.sunColor);
  sun.intensity = p.sunIntensity;
  ambient.intensity = p.ambient;
  groundMat.color.setHex(p.ground);
  bloomPass.strength = p.bloom;
  if (waterMat) {
    waterMat.color.setHex(p.water);
    waterMat.emissive.setHex(p.waterEmissive);
  }
  if (windowLightsMesh) {
    windowLightsMesh.material.opacity = p.windowOpacity;
    windowLightsMesh.visible = p.windowOpacity > 0.01;
  }
  currentMode = mode;
  document.getElementById('btn-day').classList.toggle('active', mode === 'day');
  document.getElementById('btn-night').classList.toggle('active', mode === 'night');
}

// -----------------------------------------------------------------------
// Geometry builders
// -----------------------------------------------------------------------

/** Build a flat extruded mesh from a list of {pts:[[x,y],...]} closed rings. */
function buildFlatShapes(items, { y = 0 } = {}) {
  const geoms = [];
  for (const item of items) {
    const pts = item.pts;
    if (!pts || pts.length < 3) continue;
    try {
      const shape = new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], p[1])));
      const geo = new THREE.ShapeGeometry(shape);
      geo.rotateX(-Math.PI / 2);
      geo.translate(0, y, 0);
      geoms.push(geo);
    } catch (e) {
      // skip malformed / self-intersecting OSM polygons
    }
  }
  if (!geoms.length) return null;
  return mergeGeometries(geoms, false);
}

/** Building color: warm sandstone for low buildings, cooling toward tall ones. */
const LOW_COLOR = new THREE.Color(0xd9c3a1);
const MID_COLOR = new THREE.Color(0xb7ab9a);
const HIGH_COLOR = new THREE.Color(0xdfe6ea);
const tmpColor = new THREE.Color();

function colorForHeight(h, jitter) {
  let c;
  if (h < 12) c = tmpColor.copy(LOW_COLOR).lerp(MID_COLOR, h / 12);
  else if (h < 36) c = tmpColor.copy(MID_COLOR).lerp(HIGH_COLOR, (h - 12) / 24);
  else c = tmpColor.copy(HIGH_COLOR);
  const j = 1 + jitter;
  return [
    Math.min(1, c.r * j),
    Math.min(1, c.g * j),
    Math.min(1, c.b * j),
  ];
}

/** Extrude every building footprint and merge into one colored geometry, plus
 *  sample "window light" quads along facades for the night-mode glow. */
function buildBuildings(buildings) {
  const geoms = [];
  const windowPositions = [];
  const windowNormals = [];
  const MAX_WINDOW_INSTANCES = 60000;
  let windowBudgetUsed = 0;

  for (const b of buildings) {
    const pts = b.pts;
    const h = b.h;
    if (!pts || pts.length < 4 || !(h > 0)) continue;

    let geo;
    try {
      const shape = new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], p[1])));
      geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 1 });
    } catch (e) {
      continue;
    }
    geo.rotateX(-Math.PI / 2);

    const jitter = (Math.sin(pts[0][0] * 12.9898 + pts[0][1] * 78.233) * 0.5) * 0.08;
    const [r, g, bl] = colorForHeight(h, jitter);
    const count = geo.attributes.position.count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = r; colors[i * 3 + 1] = g; colors[i * 3 + 2] = bl;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geoms.push(geo);

    // Sample window-light points along the footprint perimeter, a few per floor,
    // but only for buildings tall enough to read as multi-storey.
    if (h > 7 && windowBudgetUsed < MAX_WINDOW_INSTANCES) {
      const floors = Math.max(1, Math.round(h / 3.4));
      const n = pts.length - 1; // last point duplicates first
      for (let f = 1; f < floors; f++) {
        const fy = (f / floors) * h;
        for (let i = 0; i < n; i++) {
          // skip most edge points for sparsity; density scales with perimeter
          if (Math.random() > 0.35) continue;
          const a = pts[i], b2 = pts[(i + 1) % n];
          const t = Math.random();
          const x = a[0] + (b2[0] - a[0]) * t;
          const z = a[1] + (b2[1] - a[1]) * t;
          const ex = b2[0] - a[0], ez = b2[1] - a[1];
          const len = Math.hypot(ex, ez) || 1;
          // outward normal (rotate edge 90deg) — good enough without ring winding checks
          const nx = ez / len, nz = -ex / len;
          windowPositions.push(x + nx * 0.15, fy, -z - nz * 0.15); // world Z = -north
          windowNormals.push(nx, 0, -nz);
          windowBudgetUsed++;
          if (windowBudgetUsed >= MAX_WINDOW_INSTANCES) break;
        }
        if (windowBudgetUsed >= MAX_WINDOW_INSTANCES) break;
      }
    }
  }

  const merged = geoms.length ? mergeGeometries(geoms, false) : null;
  return { geometry: merged, windowPositions, windowNormals };
}

function buildWindowLights(positions, normals) {
  const instCount = positions.length / 3;
  if (instCount === 0) return null;
  // Sized well past a real window (~1.2m) on purpose: at typical camera
  // distance (500-1500m) a realistic size rasterizes to a sub-pixel speck
  // that's effectively invisible even with bloom. This is a stylized glow,
  // not a literal window.
  const quad = new THREE.PlaneGeometry(2.6, 2.6);
  const mesh = new THREE.InstancedMesh(
    quad,
    new THREE.MeshBasicMaterial({
      color: 0xffd9a0,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      // dummy.lookAt() below points the quad's local -Z outward, which means
      // its default front face (+Z normal) ends up facing INTO the building.
      // Without DoubleSide every window light is back-face-culled and
      // invisible from any normal exterior viewing angle.
      side: THREE.DoubleSide,
    }),
    instCount
  );
  const dummy = new THREE.Object3D();
  const warm = new THREE.Color(0xffdca8);
  const cool = new THREE.Color(0x9fe3ff);
  const colorArray = new Float32Array(instCount * 3);
  for (let i = 0; i < instCount; i++) {
    const px = positions[i * 3], py = positions[i * 3 + 1], pz = positions[i * 3 + 2];
    const nx = normals[i * 3], ny = normals[i * 3 + 1], nz = normals[i * 3 + 2];
    dummy.position.set(px, py, pz);
    dummy.lookAt(px + nx, py + ny, pz + nz);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    const c = Math.random() > 0.82 ? cool : warm;
    const flicker = 0.6 + Math.random() * 0.6;
    colorArray[i * 3] = c.r * flicker;
    colorArray[i * 3 + 1] = c.g * flicker;
    colorArray[i * 3 + 2] = c.b * flicker;
  }
  // mesh.instanceColor alone makes Three.js apply per-instance color
  // automatically (it's gated on object.instanceColor existing, independent
  // of material.vertexColors). Do NOT also set material.vertexColors = true
  // here: that flag asks the shader for a per-VERTEX `color` attribute on
  // the geometry, which this plain PlaneGeometry doesn't have — WebGL
  // defaults a missing attribute to (0,0,0,1), silently multiplying every
  // instance's color down to black.
  mesh.instanceColor = new THREE.InstancedBufferAttribute(colorArray, 3);
  return mesh;
}

/** Roads as flat ribbon strips, width per class, merged into one geometry. */
function buildRoads(roads) {
  const positions = [];
  const colors = [];
  const darkRoad = new THREE.Color(0x303236);
  const majorRoad = new THREE.Color(0x4a4b50);

  for (const r of roads) {
    const pts = r.pts;
    if (!pts || pts.length < 2) continue;
    const halfW = r.w / 2;
    const major = ['motorway', 'trunk', 'primary', 'secondary'].includes(r.c);
    const col = major ? majorRoad : darkRoad;

    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[i + 1];
      let dx = x1 - x0, dy = y1 - y0;
      const len = Math.hypot(dx, dy);
      if (len < 1e-4) continue;
      dx /= len; dy /= len;
      const nx = -dy * halfW, ny = dx * halfW;

      // two triangles forming the quad, in world space (x, -y -> z)
      const p0 = [x0 + nx, -(y0 + ny)];
      const p1 = [x0 - nx, -(y0 - ny)];
      const p2 = [x1 - nx, -(y1 - ny)];
      const p3 = [x1 + nx, -(y1 + ny)];

      positions.push(
        p0[0], 0, p0[1], p1[0], 0, p1[1], p2[0], 0, p2[1],
        p0[0], 0, p0[1], p2[0], 0, p2[1], p3[0], 0, p3[1]
      );
      for (let k = 0; k < 6; k++) colors.push(col.r, col.g, col.b);
    }
  }
  if (!positions.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

// -----------------------------------------------------------------------
// Traffic: simple simulated vehicles following the real road network.
// Not real traffic data (no such public feed exists) — cars are spawned
// onto road polylines we already have and animated along them each frame,
// the same way jeantimex/tokyo's traffic is a simulation layer on top of
// static geometry rather than sourced data.
// -----------------------------------------------------------------------
let traffic = null;
const trafficDummy = new THREE.Object3D();
const CAR_LENGTH = 4.0, CAR_WIDTH = 1.8, CAR_HEIGHT = 1.5;
const VEHICLE_CLASSES = new Set([
  'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential',
  'unclassified', 'living_street', 'motorway_link', 'trunk_link',
  'primary_link', 'secondary_link', 'tertiary_link',
]);
const CAR_COLORS = [0xd8d8d8, 0xb0b4ba, 0x8a3b3b, 0x2f4a6b, 0x3a3a3a, 0xc9a227, 0x5a6b4a];

function buildTraffic(roads) {
  const lanes = []; // { pts: [[x,z],...], cum: [0,...], total }
  for (const r of roads) {
    if (!VEHICLE_CLASSES.has(r.c)) continue;
    const pts = r.pts;
    if (!pts || pts.length < 2) continue;
    // same north -> -z convention as buildRoads/buildBuildings
    const worldPts = pts.map(([x, y]) => [x, -y]);
    const cum = [0];
    let total = 0;
    for (let i = 0; i < worldPts.length - 1; i++) {
      const dx = worldPts[i + 1][0] - worldPts[i][0];
      const dz = worldPts[i + 1][1] - worldPts[i][1];
      total += Math.hypot(dx, dz);
      cum.push(total);
    }
    if (total < 20) continue; // skip tiny stub ways
    lanes.push({ pts: worldPts, cum, total });
  }
  if (!lanes.length) return null;

  const totalLength = lanes.reduce((s, l) => s + l.total, 0);
  const carCount = Math.max(60, Math.min(1400, Math.round(totalLength / 22)));

  // Weighted lane picker so longer roads naturally carry proportionally more cars.
  const laneCumWeight = [];
  { let s = 0; for (const l of lanes) { s += l.total; laneCumWeight.push(s); } }
  function pickLane() {
    const r = Math.random() * totalLength;
    let lo = 0, hi = laneCumWeight.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (laneCumWeight[mid] < r) lo = mid + 1; else hi = mid; }
    return lo;
  }

  const geo = new THREE.BoxGeometry(CAR_WIDTH, CAR_HEIGHT, CAR_LENGTH);
  geo.translate(0, CAR_HEIGHT / 2, 0); // sit on the ground instead of centered through it
  // No material.vertexColors here — mesh.instanceColor below applies
  // per-instance color automatically; vertexColors would instead ask for a
  // per-vertex geometry `color` attribute this box doesn't have, which
  // WebGL defaults to black and silences every car's color (see
  // buildWindowLights for the same gotcha).
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.2 });
  const mesh = new THREE.InstancedMesh(geo, mat, carCount);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  const colorArray = new Float32Array(carCount * 3);
  const tmpColor = new THREE.Color();
  const cars = [];
  for (let i = 0; i < carCount; i++) {
    cars.push({
      lane: pickLane(),
      t: Math.random(),
      speed: 5 + Math.random() * 6, // m/s (~18-40 km/h): city-street pace
      dir: Math.random() < 0.5 ? 1 : -1,
    });
    tmpColor.setHex(CAR_COLORS[(Math.random() * CAR_COLORS.length) | 0]);
    colorArray[i * 3] = tmpColor.r; colorArray[i * 3 + 1] = tmpColor.g; colorArray[i * 3 + 2] = tmpColor.b;
  }
  mesh.instanceColor = new THREE.InstancedBufferAttribute(colorArray, 3);
  mesh.frustumCulled = false; // instances are spread across the whole city; a single bounding sphere isn't useful

  return { mesh, lanes, cars };
}

function sampleLane(lane, distAlong) {
  const cum = lane.cum;
  let i = 0;
  while (i < cum.length - 2 && cum[i + 1] < distAlong) i++;
  const segLen = cum[i + 1] - cum[i];
  const localT = segLen > 1e-5 ? (distAlong - cum[i]) / segLen : 0;
  const a = lane.pts[i], b = lane.pts[i + 1];
  const x = a[0] + (b[0] - a[0]) * localT;
  const z = a[1] + (b[1] - a[1]) * localT;
  let tx = b[0] - a[0], tz = b[1] - a[1];
  const tl = Math.hypot(tx, tz) || 1;
  return { x, z, tx: tx / tl, tz: tz / tl };
}

function updateTraffic(dt) {
  if (!traffic) return;
  const { mesh, lanes, cars } = traffic;
  for (let i = 0; i < cars.length; i++) {
    const car = cars[i];
    const lane = lanes[car.lane];
    car.t += (car.speed * dt) / lane.total;
    if (car.t > 1) car.t -= 1;
    const distAlong = (car.dir > 0 ? car.t : 1 - car.t) * lane.total;
    const { x, z, tx, tz } = sampleLane(lane, distAlong);
    const hx = tx * car.dir, hz = tz * car.dir; // heading, flipped for the oncoming direction
    const nx = -hz, nz = hx; // perpendicular, to offset opposing traffic off the centerline
    const lateral = 1.6 * car.dir;
    trafficDummy.position.set(x + nx * lateral, 0.15, z + nz * lateral);
    trafficDummy.rotation.set(0, Math.atan2(hx, hz), 0);
    trafficDummy.updateMatrix();
    mesh.setMatrixAt(i, trafficDummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
}

// -----------------------------------------------------------------------
// Load data and build the scene
// -----------------------------------------------------------------------
async function init() {
  setProgress(0.05, 'fetching city data…');
  const res = await fetch('./data/city-data.json');
  if (!res.ok) throw new Error('failed to load city-data.json');
  const data = await res.json();
  setProgress(0.25, `${data.buildings.length.toLocaleString()} buildings · ${data.roads.length.toLocaleString()} roads`);

  await new Promise(r => setTimeout(r, 0));

  // Water
  const waterGeo = buildFlatShapes(data.water, { y: 0.05 });
  if (waterGeo) {
    waterMat = new THREE.MeshStandardMaterial({
      color: PALETTES[currentMode].water,
      emissive: PALETTES[currentMode].waterEmissive,
      roughness: 0.25,
      metalness: 0.15,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
    });
    scene.add(new THREE.Mesh(waterGeo, waterMat));
  }
  setProgress(0.4, 'laying down water & parks…');
  await new Promise(r => setTimeout(r, 0));

  // Parks
  const parkGeo = buildFlatShapes(data.parks, { y: 0.03 });
  if (parkGeo) {
    const parkMat = new THREE.MeshStandardMaterial({ color: PALETTES[currentMode].park, roughness: 1, side: THREE.DoubleSide });
    scene.add(new THREE.Mesh(parkGeo, parkMat));
  }
  setProgress(0.55, 'painting roads…');
  await new Promise(r => setTimeout(r, 0));

  // Roads
  const roadGeo = buildRoads(data.roads);
  if (roadGeo) {
    const roadMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide });
    const roadMesh = new THREE.Mesh(roadGeo, roadMat);
    roadMesh.position.y = 0.08;
    scene.add(roadMesh);
  }
  traffic = buildTraffic(data.roads);
  if (traffic) scene.add(traffic.mesh);
  setProgress(0.7, `extruding ${data.buildings.length.toLocaleString()} buildings…`);
  await new Promise(r => setTimeout(r, 0));

  // Buildings (pts are [x, north] as stored; buildBuildings maps north -> -z
  // internally, matching the convention used by buildFlatShapes/buildRoads).
  const { geometry: buildingGeo, windowPositions, windowNormals } = buildBuildings(data.buildings);
  if (buildingGeo) {
    const buildingMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05, side: THREE.DoubleSide });
    scene.add(new THREE.Mesh(buildingGeo, buildingMat));
  }
  setProgress(0.9, 'lighting windows…');
  await new Promise(r => setTimeout(r, 0));

  windowLightsMesh = buildWindowLights(windowPositions, windowNormals);
  if (windowLightsMesh) scene.add(windowLightsMesh);

  applyPalette(currentMode);
  setProgress(1, 'done');
  await new Promise(r => setTimeout(r, 250));
  loadingEl.classList.add('hidden');
}

// -----------------------------------------------------------------------
// UI
// -----------------------------------------------------------------------
document.getElementById('btn-day').addEventListener('click', () => applyPalette('day'));
document.getElementById('btn-night').addEventListener('click', () => applyPalette('night'));

let autoRotate = false;
document.getElementById('btn-spin').addEventListener('click', (e) => {
  autoRotate = !autoRotate;
  controls.autoRotate = autoRotate;
  controls.autoRotateSpeed = 0.6;
  e.target.classList.toggle('active', autoRotate);
});

const DEFAULT_CAM = camera.position.clone();
document.getElementById('btn-reset').addEventListener('click', () => {
  camera.position.copy(DEFAULT_CAM);
  controls.target.set(0, 20, 0);
  controls.update();
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1); // clamp so a stalled/backgrounded tab doesn't make cars jump
  updateTraffic(dt);
  controls.update();
  composer.render();
}

init()
  .then(animate)
  .catch(err => {
    console.error(err);
    loadingStatus.textContent = 'failed to load — see console';
  });
