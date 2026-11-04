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

// static obstacles: circle colliders {x, z, r}
const obstacles = [];
function addBox(x, z, w, h, d, color) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
  m.position.set(x, h / 2, z);
  m.castShadow = m.receiveShadow = true;
  scene.add(m);
  obstacles.push({ x, z, r: Math.max(w, d) / 2 });
}
for (let i = 0; i < 30; i++) {
  const a = Math.random() * Math.PI * 2;
  const r = Math.random() < 0.5 ? 10 + Math.random() * 20 : 75 + Math.random() * 80;
  addBox(Math.cos(a) * r, Math.sin(a) * r, 4 + Math.random() * 6, 4 + Math.random() * 14, 4 + Math.random() * 6,
    new THREE.Color().setHSL(Math.random(), 0.2, 0.6));
}

// ---------- car ----------
const car = new THREE.Group();
const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.6, 4), new THREE.MeshLambertMaterial({ color: 0xcc2222 }));
body.position.y = 0.6;
const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 2), new THREE.MeshLambertMaterial({ color: 0x99ccee }));
cabin.position.set(0, 1.15, -0.2);
body.castShadow = cabin.castShadow = true;
car.add(body, cabin);
const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.3, 16).rotateZ(Math.PI / 2);
const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
for (const [x, z] of [[-0.95, 1.2], [0.95, 1.2], [-0.95, -1.2], [0.95, -1.2]]) {
  const w = new THREE.Mesh(wheelGeo, wheelMat);
  w.position.set(x, 0.35, z);
  car.add(w);
}
scene.add(car);

// +Z is the car's forward in local space
// heading 0 => facing +Z; PI/2 => +X (tangent to the ring at (0,-50)); speed in m/s
const state = { x: 0, z: -50, heading: Math.PI / 2, speed: 0 };

function resetCar() {
  state.x = 0; state.z = -50; state.speed = 0; state.heading = Math.PI / 2;
}

// ---------- input ----------
const keys = new Set();
addEventListener('keydown', e => { keys.add(e.code); if (e.code === 'KeyR') resetCar(); if (e.code === 'Space') e.preventDefault(); });
addEventListener('keyup', e => keys.delete(e.code));
const down = (...c) => c.some(k => keys.has(k));

// ---------- simulation ----------
const MAX_SPEED = 45, ACCEL = 14, BRAKE = 30, DRAG = 0.4, ROLL = 3, WHEELBASE = 2.5, MAX_STEER = 0.55;
let steer = 0;

function update(dt) {
  const throttle = down('KeyW', 'ArrowUp') ? 1 : 0;
  const brake = down('KeyS', 'ArrowDown') ? 1 : 0;
  const hand = down('Space');

  if (throttle) state.speed += ACCEL * dt;
  if (brake) state.speed -= (state.speed > 0 ? BRAKE : ACCEL * 0.6) * dt;
  if (hand) state.speed -= Math.sign(state.speed) * Math.min(Math.abs(state.speed), BRAKE * 1.2 * dt);
  // drag + rolling resistance
  state.speed -= (state.speed * DRAG * dt) + Math.sign(state.speed) * Math.min(Math.abs(state.speed), ROLL * dt);
  state.speed = THREE.MathUtils.clamp(state.speed, -12, MAX_SPEED);

  // steering eases toward target and is reduced at speed
  const target = ((down('KeyA', 'ArrowLeft') ? 1 : 0) - (down('KeyD', 'ArrowRight') ? 1 : 0)) *
    MAX_STEER / (1 + Math.abs(state.speed) * 0.04);
  steer += (target - steer) * Math.min(1, 8 * dt);

  // bicycle model
  state.heading += (state.speed / WHEELBASE) * Math.tan(steer) * dt;
  state.x += Math.sin(state.heading) * state.speed * dt;
  state.z += Math.cos(state.heading) * state.speed * dt;

  // obstacle collisions
  let colliding = false;
  for (const o of obstacles) {
    const dx = state.x - o.x, dz = state.z - o.z;
    const dist = Math.hypot(dx, dz), min = o.r + 1.5;
    if (dist < min) {
      colliding = true;
      state.x = o.x + (dx / dist) * min;
      state.z = o.z + (dz / dist) * min;
      state.speed *= 0.5;
    }
  }
  if (colliding && !wasColliding) { hits++; toast('Collision!'); }
  wasColliding = colliding;

  car.position.set(state.x, 0, state.z);
  car.rotation.y = state.heading;
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
  orbit.pitch = THREE.MathUtils.clamp(orbit.pitch + e.movementY * 0.005, 0.05, 1.45);
});
renderer.domElement.addEventListener('wheel', e => {
  orbit.dist = THREE.MathUtils.clamp(orbit.dist * (1 + Math.sign(e.deltaY) * 0.1), 4, 40);
}, { passive: true });
renderer.domElement.addEventListener('dblclick', () => { orbit.yaw = 0; orbit.pitch = 0.4; orbit.dist = 9; });

function updateCamera(dt) {
  const yaw = state.heading + Math.PI + orbit.yaw;
  const desired = new THREE.Vector3(
    state.x + Math.sin(yaw) * Math.cos(orbit.pitch) * orbit.dist,
    1.2 + Math.sin(orbit.pitch) * orbit.dist,
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

let hits = 0, wasColliding = false, toastTimer = 0;
function toast(msg) {
  $('toast').textContent = msg;
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
  for (const o of obstacles) { c.beginPath(); c.arc(o.x, o.z, o.r, 0, Math.PI * 2); c.fill(); }
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
  $('wheel').style.transform = `rotate(${-steer / MAX_STEER * 120}deg)`;

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
  updateCamera(dt);
  updateHud();
  renderer.render(scene, camera);
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
