import * as THREE from 'three';

// ---------- scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(devicePixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9ec9f0);
scene.fog = new THREE.Fog(0x9ec9f0, 80, 400);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 1000);

scene.add(new THREE.HemisphereLight(0xffffff, 0x556655, 0.8));
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(50, 100, 30);
sun.castShadow = true;
sun.shadow.camera.left = sun.shadow.camera.bottom = -60;
sun.shadow.camera.right = sun.shadow.camera.top = 60;
sun.shadow.mapSize.set(2048, 2048);
scene.add(sun, sun.target);

// ---------- world ----------
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(2000, 2000),
  new THREE.MeshLambertMaterial({ color: 0x4f8a4f })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// 1 m x 1 m grid overlay (toggle with G)
const gridCanvas = document.createElement('canvas');
gridCanvas.width = gridCanvas.height = 128;
const gctx = gridCanvas.getContext('2d');
gctx.strokeStyle = 'rgba(255,255,255,0.1)';
gctx.lineWidth = 3;
gctx.strokeRect(0, 0, 128, 128);
const gridTex = new THREE.CanvasTexture(gridCanvas);
gridTex.wrapS = gridTex.wrapT = THREE.RepeatWrapping;
gridTex.repeat.set(2000, 2000); // plane is 2000 m, so 1 cell = 1 m
gridTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
const grid = new THREE.Mesh(
  new THREE.PlaneGeometry(2000, 2000),
  new THREE.MeshBasicMaterial({ map: gridTex, transparent: true, depthWrite: false })
);
grid.rotation.x = -Math.PI / 2;
grid.position.y = 0.06;
addEventListener('keydown', e => { if (e.code === 'KeyG') grid.visible = !grid.visible; });

// oval road made of a ring
const road = new THREE.Mesh(
  new THREE.RingGeometry(40, 60, 64),
  new THREE.MeshLambertMaterial({ color: 0x333333, side: THREE.DoubleSide })
);
road.rotation.x = -Math.PI / 2;
road.position.y = 0.02;
road.receiveShadow = true;
scene.add(road);

const line = new THREE.Mesh(
  new THREE.RingGeometry(49.8, 50.2, 64),
  new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
);
line.rotation.x = -Math.PI / 2;
line.position.y = 0.04;
scene.add(line);
scene.add(grid);

// static obstacles: axis-aligned box colliders {x, z, hw, hd} (half extents)
const obstacles = [];
function addBox(x, z, w, h, d, color) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
  m.position.set(x, h / 2, z);
  m.castShadow = m.receiveShadow = true;
  scene.add(m);
  obstacles.push({ x, z, hw: w / 2, hd: d / 2 });
}
for (let i = 0; i < 30; i++) {
  const a = Math.random() * Math.PI * 2;
  const r = Math.random() < 0.5 ? 10 + Math.random() * 20 : 75 + Math.random() * 80;
  addBox(Math.cos(a) * r, Math.sin(a) * r, 4 + Math.random() * 6, 4 + Math.random() * 14, 4 + Math.random() * 6,
    new THREE.Color().setHSL(Math.random(), 0.2, 0.6));
}

// ---------- car ----------
// Compact hatchback. Local +Z is forward, origin is the centre of the footprint.
const CAR = { length: 4.0, width: 1.75, wheelbase: 2.55, track: 1.5, wheelRadius: 0.3, wheelWidth: 0.2 };
const car = new THREE.Group();

// side profile (x = along the car from the rear, y = height) extruded across the width
function profileGeometry(points, width, bevel) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: width - bevel * 2, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: 1
  });
  g.translate(-CAR.length / 2, 0, -(width - bevel * 2) / 2);
  g.rotateY(-Math.PI / 2); // shape x -> +Z (forward)
  return g;
}
const paintMat = new THREE.MeshStandardMaterial({ color: 0x9fd8f0, metalness: 0.3, roughness: 0.4 });
const glassMat = new THREE.MeshStandardMaterial({ color: 0x5f7f94, metalness: 0.6, roughness: 0.15 });
const lowerBody = new THREE.Mesh(profileGeometry([
  [0, 0.3], [0, 0.8], [0.1, 0.95], [2.9, 0.95], [3.85, 0.85], [4.0, 0.65], [4.0, 0.35]
], CAR.width, 0.06), paintMat);
const greenhouse = new THREE.Mesh(profileGeometry([
  [0.25, 0.95], [0.55, 1.42], [2.2, 1.42], [2.95, 0.95]
], CAR.width - 0.2, 0.03), glassMat);
const roof = new THREE.Mesh(new THREE.BoxGeometry(CAR.width - 0.22, 0.06, 1.65), paintMat);
roof.position.set(0, 1.45, -CAR.length / 2 + 1.375);
for (const m of [lowerBody, greenhouse, roof]) m.castShadow = true;
car.add(lowerBody, greenhouse, roof);

// lights
const headMat = new THREE.MeshStandardMaterial({ color: 0xcfcfc4, emissive: 0xfff3c0, emissiveIntensity: 0, roughness: 0.3 });
const tailMat = new THREE.MeshStandardMaterial({ color: 0x6b1a22, emissive: 0xff1a1a, emissiveIntensity: 0, roughness: 0.4 });
for (const s of [-1, 1]) {
  const hl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.06), headMat);
  hl.position.set(s * 0.6, 0.78, CAR.length / 2 + 0.05);
  const tl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.06), tailMat);
  tl.position.set(s * 0.65, 0.85, -CAR.length / 2 - 0.05);
  car.add(hl, tl);
}

// wheels: front ones sit in a steering pivot, all spin around the axle
const tyreGeo = new THREE.CylinderGeometry(CAR.wheelRadius, CAR.wheelRadius, CAR.wheelWidth, 24).rotateZ(Math.PI / 2);
const rimGeo = new THREE.CylinderGeometry(CAR.wheelRadius * 0.62, CAR.wheelRadius * 0.62, CAR.wheelWidth + 0.02, 16).rotateZ(Math.PI / 2);
const spokeGeo = new THREE.BoxGeometry(CAR.wheelWidth + 0.04, CAR.wheelRadius * 1.1, 0.05);
const tyreMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
const rimMat = new THREE.MeshStandardMaterial({ color: 0xc0c4c8, metalness: 0.9, roughness: 0.3 });
const wheels = [];
for (const sx of [-1, 1]) {
  for (const sz of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * CAR.track / 2, CAR.wheelRadius, sz * CAR.wheelbase / 2);
    const spin = new THREE.Group();
    const tyre = new THREE.Mesh(tyreGeo, tyreMat);
    tyre.castShadow = true;
    spin.add(tyre, new THREE.Mesh(rimGeo, rimMat), new THREE.Mesh(spokeGeo, tyreMat));
    pivot.add(spin);
    car.add(pivot);
    wheels.push({ pivot, spin, front: sz > 0 });
  }
}
scene.add(car);

// +Z is the car's forward in local space
// heading 0 => facing +Z; PI/2 => +X (tangent to the ring at (0,-50)); speed in m/s
const state = { x: 0, z: -50, heading: Math.PI / 2, speed: 0 };

function resetCar() {
  state.x = 0; state.z = -50; state.speed = 0; state.heading = Math.PI / 2;
}

// oriented car rectangle vs axis-aligned box (separating axis test).
// Returns a push-out vector for the car, or null when not overlapping.
function carVsBox(o) {
  const hl = CAR.length / 2, hw = CAR.width / 2;
  const fx = Math.sin(state.heading), fz = Math.cos(state.heading);
  const rx = fz, rz = -fx;
  const axes = [[1, 0], [0, 1], [fx, fz], [rx, rz]];
  let best = null;
  for (const [ax, az] of axes) {
    const carR = hl * Math.abs(fx * ax + fz * az) + hw * Math.abs(rx * ax + rz * az);
    const boxR = o.hw * Math.abs(ax) + o.hd * Math.abs(az);
    const d = (state.x - o.x) * ax + (state.z - o.z) * az;
    const overlap = carR + boxR - Math.abs(d);
    if (overlap <= 0) return null;
    if (!best || overlap < best.overlap) best = { overlap, ax: Math.sign(d || 1) * ax, az: Math.sign(d || 1) * az };
  }
  return best;
}

// ---------- input ----------
const keys = new Set();
addEventListener('keydown', e => { keys.add(e.code); if (e.code === 'KeyR') resetCar(); if (e.code === 'Space') e.preventDefault(); });
addEventListener('keyup', e => keys.delete(e.code));
const down = (...c) => c.some(k => keys.has(k));

// ---------- predicted path ----------
// Ribbon as wide as the car, projected ahead along the arc the front tyres are pointing at, fading with distance.
const PATH_LENGTH = 18, PATH_STEP = 0.5, TRAIL_MAX = Math.ceil(PATH_LENGTH / PATH_STEP) + 1;
const PREVIEW_SPEED = 12 / 3.6; // m/s; speed assumed for the preview (light throttle taps hover around 10-12 km/h)
const trailPos = new Float32Array(TRAIL_MAX * 2 * 3);
const trailCol = new Float32Array(TRAIL_MAX * 2 * 4);
const trailGeo = new THREE.BufferGeometry();
trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3).setUsage(THREE.DynamicDrawUsage));
trailGeo.setAttribute('color', new THREE.BufferAttribute(trailCol, 4).setUsage(THREE.DynamicDrawUsage));
const trailIndex = [];
for (let i = 0; i < TRAIL_MAX - 1; i++) {
  const a = i * 2;
  trailIndex.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
}
trailGeo.setIndex(trailIndex);
trailGeo.setDrawRange(0, (TRAIL_MAX - 1) * 6);
const trailMesh = new THREE.Mesh(trailGeo, new THREE.MeshBasicMaterial({
  vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide
}));
trailMesh.frustumCulled = false;
trailMesh.renderOrder = 1;
scene.add(trailMesh);

// B bakes the current predicted path onto the ground as a permanent orange ribbon; C clears them
const baked = [];
function bakePath() {
  const g = new THREE.BufferGeometry();
  const pos = trailPos.slice();
  const col = new Float32Array(TRAIL_MAX * 2 * 4);
  for (let i = 0; i < TRAIL_MAX; i++) {
    const a = 0.55 * (1 - i / (TRAIL_MAX - 1) * 0.6);
    col.set([1, 0.6, 0.1, a, 1, 0.6, 0.1, a], i * 8);
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 4));
  g.setIndex(trailIndex);
  const m = new THREE.Mesh(g, trailMesh.material);
  m.frustumCulled = false;
  m.position.y = 0.01 * (baked.length % 5); // avoids z-fighting where baked paths overlap
  m.renderOrder = 0;
  scene.add(m);
  baked.push(m);
  toast('Path saved', true);
}
function clearBaked() {
  for (const m of baked) { scene.remove(m); m.geometry.dispose(); }
  baked.length = 0;
}
addEventListener('keydown', e => {
  if (e.repeat) return;
  if (e.code === 'KeyB') bakePath();
  if (e.code === 'KeyC') clearBaked();
});

// T starts/stops recording the driven path as a green ribbon on the ground; X clears recordings
const REC_MAX = 6000, REC_STEP = 0.3;
const recordings = [];
let rec = null;
function startRecording() {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(REC_MAX * 6), col = new Float32Array(REC_MAX * 8);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('color', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
  const idx = [];
  for (let i = 0; i < REC_MAX - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  g.setIndex(idx);
  g.setDrawRange(0, 0);
  const m = new THREE.Mesh(g, trailMesh.material);
  m.frustumCulled = false;
  m.position.y = 0.01 * (recordings.length % 5);
  scene.add(m);
  rec = { mesh: m, pos, col, count: 0, x: Infinity, z: Infinity };
  recordings.push(rec);
  addRecordingPoint();
  $('recState').style.display = '';
  toast('Recording path', true);
}
function stopRecording() {
  rec = null;
  $('recState').style.display = 'none';
  toast('Recording stopped', true);
}
function clearRecordings() {
  for (const r of recordings) { scene.remove(r.mesh); r.mesh.geometry.dispose(); }
  recordings.length = 0;
  if (rec) { rec = null; $('recState').style.display = 'none'; }
}
function addRecordingPoint() {
  if (rec.count >= REC_MAX) return stopRecording();
  const half = CAR.width / 2, rx = Math.cos(state.heading) * half, rz = -Math.sin(state.heading) * half;
  const i = rec.count++;
  rec.pos.set([state.x + rx, 0.08, state.z + rz, state.x - rx, 0.08, state.z - rz], i * 6);
  rec.col.set([0.3, 1, 0.45, 0.5, 0.3, 1, 0.45, 0.5], i * 8);
  rec.x = state.x; rec.z = state.z;
  const g = rec.mesh.geometry;
  g.setDrawRange(0, Math.max(0, rec.count - 1) * 6);
  g.attributes.position.needsUpdate = true;
  g.attributes.color.needsUpdate = true;
}
function updateRecording() {
  if (rec && Math.hypot(state.x - rec.x, state.z - rec.z) >= REC_STEP) addRecordingPoint();
}
addEventListener('keydown', e => {
  if (e.repeat) return;
  if (e.code === 'KeyT') rec ? stopRecording() : startRecording();
  if (e.code === 'KeyX') clearRecordings();
});

const PREVIEW_SPEED_REVERSE = 7 / 3.6; // reversing is driven slower, so it gets more steering lock
let pathDir = 1;
function updateTrail() {
  // arc the front tyres will follow at the assumed driving speed: the steering limit depends on speed, so the
  // preview uses the limit at PREVIEW_SPEED instead of the instantaneous (often zero) speed
  // direction of travel; when (nearly) stopped keep the last one, or follow the pedal (S = reverse, W = forward)
  if (state.speed < -0.5) pathDir = -1;
  else if (state.speed > 0.5) pathDir = 1;
  else if (down('KeyS', 'ArrowDown') && !down('KeyW', 'ArrowUp')) pathDir = -1;
  else if (down('KeyW', 'ArrowUp')) pathDir = 1;
  const dir = pathDir;
  const limit = WHEEL_LOCK / (1 + (dir < 0 ? PREVIEW_SPEED_REVERSE : PREVIEW_SPEED) * 0.04);
  const curvature = Math.tan(wheelToSteer(THREE.MathUtils.clamp(wheelAngle, -limit, limit))) / WHEELBASE;
  const half = CAR.width / 2;
  let x = state.x, z = state.z, h = state.heading;
  for (let i = 0; i < TRAIL_MAX; i++) {
    const rx = Math.cos(h) * half, rz = -Math.sin(h) * half;
    const alpha = (1 - i / (TRAIL_MAX - 1)) * 0.45;
    trailPos.set([x + rx, 0.08, z + rz, x - rx, 0.08, z - rz], i * 6);
    trailCol.set([0.3, 0.8, 1, alpha, 0.3, 0.8, 1, alpha], i * 8);
    const ds = dir * PATH_STEP;
    h += curvature * ds;
    x += Math.sin(h) * ds;
    z += Math.cos(h) * ds;
  }
  trailGeo.attributes.position.needsUpdate = true;
  trailGeo.attributes.color.needsUpdate = true;
}

// ---------- simulation ----------
const MAX_SPEED = 45, ACCEL = 14, BRAKE = 30, DRAG = 0.4, ROLL = 3, WHEELBASE = 2.55, MAX_STEER = 0.55;
let wheelAngle = 0; // steering wheel angle in degrees, + = left
let steer = 0; // resulting road-wheel angle in radians, derived from wheelAngle
const WHEEL_LOCK = 540; // steering wheel degrees each side of centre (1.5 turns, 3 turns lock to lock)

function stepSpeed(speed, throttle, brake, hand, dt) {
  if (throttle) speed += ACCEL * dt;
  if (brake) speed -= (speed > 0 ? BRAKE : ACCEL * 0.6) * dt;
  if (hand) speed -= Math.sign(speed) * Math.min(Math.abs(speed), BRAKE * 1.2 * dt);
  // drag + rolling resistance
  speed -= (speed * DRAG * dt) + Math.sign(speed) * Math.min(Math.abs(speed), ROLL * dt);
  return THREE.MathUtils.clamp(speed, -12, MAX_SPEED);
}

// the driver turns the steering wheel at a limited rate (deg/s); keyboard can't turn it as far at speed
function stepWheel(angle, speed, input, dt) {
  const target = input * WHEEL_LOCK / (1 + Math.abs(speed) * 0.04);
  const counter = input !== 0 && Math.sign(target) !== Math.sign(angle) && angle !== 0;
  const rate = (input === 0 ? 300 : counter ? 600 : 400) * dt;
  return angle + THREE.MathUtils.clamp(target - angle, -rate, rate);
}
const wheelToSteer = a => (a / WHEEL_LOCK) * MAX_STEER;

function update(dt) {
  const throttle = down('KeyW', 'ArrowUp') ? 1 : 0;
  const brake = down('KeyS', 'ArrowDown') ? 1 : 0;
  const hand = down('Space');
  const input = (down('KeyA', 'ArrowLeft') ? 1 : 0) - (down('KeyD', 'ArrowRight') ? 1 : 0);

  state.speed = stepSpeed(state.speed, throttle, brake, hand, dt);
  wheelAngle = stepWheel(wheelAngle, state.speed, input, dt);
  steer = wheelToSteer(wheelAngle);

  // bicycle model
  state.heading += (state.speed / WHEELBASE) * Math.tan(steer) * dt;
  state.x += Math.sin(state.heading) * state.speed * dt;
  state.z += Math.cos(state.heading) * state.speed * dt;

  // obstacle collisions
  let colliding = false;
  for (const o of obstacles) {
    const hit = carVsBox(o);
    if (hit) {
      colliding = true;
      state.x += hit.ax * hit.overlap;
      state.z += hit.az * hit.overlap;
      state.speed *= 0.5;
    }
  }
  if (colliding && !wasColliding) { hits++; toast('Collision!'); }
  wasColliding = colliding;

  car.position.set(state.x, 0, state.z);
  car.rotation.y = state.heading;
  // headlights glow while moving, tail lights glow when braking
  headMat.emissiveIntensity = Math.abs(state.speed) > 0.5 ? 0.8 : 0;
  const braking = brake || hand;
  tailMat.emissiveIntensity = braking ? 1.2 : (Math.abs(state.speed) > 0.5 ? 0.25 : 0);
  for (const w of wheels) {
    w.spin.rotation.x += (state.speed / CAR.wheelRadius) * dt;
    if (w.front) w.pivot.rotation.y = steer;
  }
}

const camPos = new THREE.Vector3();
// mouse drag orbits the camera around the car, wheel zooms, double-click recentres
const orbit = { yaw: 0, pitch: 0.4, dist: 9, dragging: false };
addEventListener('contextmenu', e => e.preventDefault());
renderer.domElement.addEventListener('pointerdown', e => { orbit.dragging = true; renderer.domElement.setPointerCapture(e.pointerId); });
renderer.domElement.addEventListener('pointerup', () => { orbit.dragging = false; });
renderer.domElement.addEventListener('pointermove', e => {
  if (!orbit.dragging) return;
  orbit.yaw -= e.movementX * 0.005;
  orbit.pitch = THREE.MathUtils.clamp(orbit.pitch + e.movementY * 0.005, -0.4, 1.45);
});
renderer.domElement.addEventListener('wheel', e => {
  orbit.dist = THREE.MathUtils.clamp(orbit.dist * (1 + Math.sign(e.deltaY) * 0.1), 4, 40);
}, { passive: true });
renderer.domElement.addEventListener('dblclick', () => { orbit.yaw = 0; orbit.pitch = 0.4; orbit.dist = 9; });

function updateCamera(dt) {
  // while driving (and not dragging) ease the orbit back to the default chase view
  if (!orbit.dragging && Math.abs(state.speed) > 0.5) {
    const k = 1 - Math.exp(-3 * dt);
    orbit.yaw = THREE.MathUtils.euclideanModulo(orbit.yaw + Math.PI, Math.PI * 2) - Math.PI;
    orbit.yaw -= orbit.yaw * k;
    orbit.pitch += (0.4 - orbit.pitch) * k;
  }
  const yaw = state.heading + Math.PI + orbit.yaw;
  const desired = new THREE.Vector3(
    state.x + Math.sin(yaw) * Math.cos(orbit.pitch) * orbit.dist,
    Math.max(0.12, 1.2 + Math.sin(orbit.pitch) * orbit.dist),
    state.z + Math.cos(yaw) * Math.cos(orbit.pitch) * orbit.dist
  );
  camPos.lerp(desired, 1 - Math.exp(-(orbit.dragging ? 30 : 5) * dt));
  camera.position.copy(camPos);
  camera.lookAt(state.x, 1.2, state.z);
  sun.position.set(state.x + 50, 100, state.z + 30);
  sun.target.position.set(state.x, 0, state.z);
}
camPos.set(0, 4, -59);

// ---------- HUD ----------
const $ = id => document.getElementById(id);
const SPEED_LIMIT = 60; // km/h
const GAUGE_MAX = 180;
const gaugeCtx = document.querySelector('#gauge canvas').getContext('2d');
const mapCtx = document.querySelector('#minimap canvas').getContext('2d');
$('limit').textContent = SPEED_LIMIT;
addEventListener('keydown', e => { if (e.code === 'KeyH') $('help').style.display = $('help').style.display === 'none' ? '' : 'none'; });

// The HUD is DOM, so it is rasterised with html2canvas (loaded on first use) and drawn over the 3D frame.
// html2canvas ignores backdrop-filter, so panels look slightly flatter in the image.
const snapHud = $('snapHud');
snapHud.checked = localStorage.getItem('snapHud') === '1';
snapHud.addEventListener('change', () => localStorage.setItem('snapHud', snapHud.checked ? '1' : '0'));

let saving = false;
async function saveFrame() {
  if (saving) return;
  saving = true;
  try {
    renderer.render(scene, camera); // re-render so the canvas isn't blank (no preserveDrawingBuffer needed)
    const out = document.createElement('canvas');
    out.width = renderer.domElement.width;
    out.height = renderer.domElement.height;
    const ctx = out.getContext('2d');
    ctx.drawImage(renderer.domElement, 0, 0);

    if (snapHud.checked) {
      try {
        const { default: html2canvas } = await import('https://cdn.jsdelivr.net/npm/html2canvas-pro@1.5.8/+esm');
        const hudCanvas = await html2canvas($('hud'), {
          backgroundColor: null,
          width: innerWidth, height: innerHeight,
          scale: out.width / innerWidth,
          ignoreElements: el => el.id === 'snapBox' || el.id === 'toast'
        });
        ctx.drawImage(hudCanvas, 0, 0, out.width, out.height);
      } catch (err) {
        console.error(err);
        toast('HUD capture failed, saved 3D view only', true);
      }
    }

    const blob = await new Promise(res => out.toBlob(res, 'image/png'));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `drive-sim-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
    a.click();
    URL.revokeObjectURL(a.href);
    if (!$('toast').classList.contains('show')) toast('Frame saved', true);
  } finally {
    saving = false;
  }
}
$('snap').addEventListener('click', e => { e.currentTarget.blur(); saveFrame(); });
addEventListener('keydown', e => { if (e.code === 'KeyP' && !e.repeat) saveFrame(); });

let hits = 0, wasColliding = false, toastTimer = 0;
function toast(msg, info = false) {
  $('toast').textContent = msg;
  $('toast').classList.toggle('info', info);
  $('toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('show'), 1500);
}

function drawGauge(kmh) {
  const c = gaugeCtx, S = 440, cx = S / 2, cy = S / 2, R = 190;
  const a0 = Math.PI * 0.75, sweep = Math.PI * 1.5;
  const ang = v => a0 + sweep * Math.min(v / GAUGE_MAX, 1);
  c.clearRect(0, 0, S, S);
  c.lineCap = 'round';
  c.lineWidth = 16;
  c.strokeStyle = '#ffffff22';
  c.beginPath(); c.arc(cx, cy, R, a0, a0 + sweep); c.stroke();
  c.strokeStyle = kmh > SPEED_LIMIT ? '#ff5252' : '#4fc3f7';
  c.beginPath(); c.arc(cx, cy, R, a0, ang(kmh)); c.stroke();
  // limit marker + ticks
  c.fillStyle = '#fff'; c.font = '20px Segoe UI, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  for (let v = 0; v <= GAUGE_MAX; v += 20) {
    const a = ang(v), ca = Math.cos(a), sa = Math.sin(a);
    c.lineWidth = 3; c.strokeStyle = '#fffa';
    c.beginPath(); c.moveTo(cx + ca * (R - 16), cy + sa * (R - 16)); c.lineTo(cx + ca * (R - 30), cy + sa * (R - 30)); c.stroke();
    c.fillText(v, cx + ca * (R - 54), cy + sa * (R - 54));
  }
  const la = ang(SPEED_LIMIT);
  c.lineWidth = 6; c.strokeStyle = '#ffeb3b';
  c.beginPath(); c.moveTo(cx + Math.cos(la) * (R - 12), cy + Math.sin(la) * (R - 12)); c.lineTo(cx + Math.cos(la) * (R + 12), cy + Math.sin(la) * (R + 12)); c.stroke();
}

const MAP_SCALE = 1.2; // pixels per metre (map canvas is 340px)
function drawMap() {
  const c = mapCtx, S = 340;
  c.save();
  c.clearRect(0, 0, S, S);
  c.translate(S / 2, S / 2);
  // rotate so the car always points up
  c.rotate(Math.PI + state.heading);
  c.scale(MAP_SCALE, MAP_SCALE);
  c.translate(-state.x, -state.z);
  c.fillStyle = '#2e5a2e'; c.fillRect(state.x - 200, state.z - 200, 400, 400);
  c.lineWidth = 20; c.strokeStyle = '#555';
  c.beginPath(); c.arc(0, 0, 50, 0, Math.PI * 2); c.stroke();
  c.lineWidth = 0.6; c.strokeStyle = '#fff';
  c.beginPath(); c.arc(0, 0, 50, 0, Math.PI * 2); c.stroke();
  c.fillStyle = '#b0b0b0';
  for (const o of obstacles) c.fillRect(o.x - o.hw, o.z - o.hd, o.hw * 2, o.hd * 2);
  c.restore();
  // car marker
  c.fillStyle = '#ff5252';
  c.beginPath(); c.moveTo(S / 2, S / 2 - 14); c.lineTo(S / 2 + 9, S / 2 + 10); c.lineTo(S / 2 - 9, S / 2 + 10); c.closePath(); c.fill();
}

function updateHud() {
  const kmh = Math.abs(state.speed) * 3.6;
  $('speed').textContent = Math.round(kmh);
  $('gear').textContent = kmh < 1 ? 'P' : state.speed < 0 ? 'R' : 'D';
  $('limit').classList.toggle('over', kmh > SPEED_LIMIT + 2);
  $('thr').firstElementChild.style.height = (down('KeyW', 'ArrowUp') ? 100 : 0) + '%';
  $('brk').firstElementChild.style.height = (down('KeyS', 'ArrowDown', 'Space') ? 100 : 0) + '%';
  $('wheel').style.transform = `rotate(${-wheelAngle}deg)`;

  const r = Math.hypot(state.x, state.z);
  const onRoad = r > 40 && r < 60;
  $('roadState').textContent = onRoad ? 'On road' : 'Off road';
  $('roadState').className = onRoad ? 'ok' : 'bad';
  $('hits').textContent = `Collisions: ${hits}`;

  drawGauge(kmh);
  drawMap();
}

let last = performance.now();
renderer.setAnimationLoop(now => {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  update(dt);
  updateTrail();
  updateRecording();
  updateCamera(dt);
  updateHud();
  renderer.render(scene, camera);
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
