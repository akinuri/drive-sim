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
  for (const o of obstacles) {
    const dx = state.x - o.x, dz = state.z - o.z;
    const dist = Math.hypot(dx, dz), min = o.r + 1.5;
    if (dist < min) {
      state.x = o.x + (dx / dist) * min;
      state.z = o.z + (dz / dist) * min;
      state.speed *= 0.5;
    }
  }

  car.position.set(state.x, 0, state.z);
  car.rotation.y = state.heading;
}

const camPos = new THREE.Vector3();
function updateCamera(dt) {
  const back = new THREE.Vector3(-Math.sin(state.heading), 0, -Math.cos(state.heading));
  const desired = new THREE.Vector3(state.x, 4, state.z).addScaledVector(back, 9);
  camPos.lerp(desired, 1 - Math.exp(-5 * dt));
  camera.position.copy(camPos);
  camera.lookAt(state.x, 1.2, state.z);
  sun.position.set(state.x + 50, 100, state.z + 30);
  sun.target.position.set(state.x, 0, state.z);
}
camPos.set(0, 4, -59);

const speedEl = document.getElementById('speed');
let last = performance.now();
renderer.setAnimationLoop(now => {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  update(dt);
  updateCamera(dt);
  speedEl.textContent = Math.round(Math.abs(state.speed) * 3.6);
  renderer.render(scene, camera);
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
