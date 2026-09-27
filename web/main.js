import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.186.0/build/three.module.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x91aebc);
scene.fog = new THREE.Fog(0x91aebc, 110, 330);

const camera = new THREE.PerspectiveCamera(67, innerWidth / innerHeight, 0.1, 420);
camera.position.set(0, 7, 13);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);

const ambient = new THREE.HemisphereLight(0xcfe9f5, 0x334038, 1.25);
scene.add(ambient);
const sun = new THREE.DirectionalLight(0xffefcc, 2.35);
sun.position.set(-70, 110, 55);
sun.castShadow = true;
sun.shadow.mapSize.set(1536, 1536);
sun.shadow.camera.left = -180;
sun.shadow.camera.right = 180;
sun.shadow.camera.top = 180;
sun.shadow.camera.bottom = -180;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 350;
scene.add(sun);

const world = new THREE.Group();
scene.add(world);
const colliders = [];
const decor = new THREE.Group();
world.add(decor);

const MAT = {
  road: new THREE.MeshStandardMaterial({ color: 0x20282c, roughness: 0.96 }),
  asphaltLine: new THREE.MeshStandardMaterial({ color: 0xd9c889, roughness: 0.86 }),
  grass: new THREE.MeshStandardMaterial({ color: 0x4e6c51, roughness: 1 }),
  dirt: new THREE.MeshStandardMaterial({ color: 0x6a5744, roughness: 1 }),
  concrete: new THREE.MeshStandardMaterial({ color: 0x90989a, roughness: 0.94 }),
  concreteDark: new THREE.MeshStandardMaterial({ color: 0x616b6f, roughness: 0.98 }),
  brick: new THREE.MeshStandardMaterial({ color: 0x8a6554, roughness: 0.95 }),
  beige: new THREE.MeshStandardMaterial({ color: 0xb39e84, roughness: 0.94 }),
  white: new THREE.MeshStandardMaterial({ color: 0xd8dbd0, roughness: 0.9 }),
  blue: new THREE.MeshStandardMaterial({ color: 0x557d97, roughness: 0.86, metalness: 0.08 }),
  roof: new THREE.MeshStandardMaterial({ color: 0x3f4448, roughness: 0.97 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x86bdd0, roughness: 0.12, metalness: 0.1 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x765b45, roughness: 0.95 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x657177, roughness: 0.45, metalness: 0.7 }),
  plant: new THREE.MeshStandardMaterial({ color: 0x2f5135, roughness: 1 }),
  trunk: new THREE.MeshStandardMaterial({ color: 0x554438, roughness: 1 }),
  player: new THREE.MeshStandardMaterial({ color: 0x3e697d, roughness: 0.78, metalness: 0.12 }),
  playerDark: new THREE.MeshStandardMaterial({ color: 0x18242b, roughness: 0.65, metalness: 0.18 }),
  visor: new THREE.MeshStandardMaterial({ color: 0x9de5ff, emissive: 0x57c8ff, emissiveIntensity: 2.4, roughness: 0.18, metalness: 0.25 }),
  accent: new THREE.MeshStandardMaterial({ color: 0xd38c46, roughness: 0.56, metalness: 0.25 })
};

function addBox(size, pos, mat, group = world) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
  m.position.set(...pos);
  m.castShadow = true; m.receiveShadow = true;
  group.add(m);
  return m;
}
function addCylinder(r, h, pos, mat, group = world, radial = 12) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, radial), mat);
  m.position.set(...pos);
  m.castShadow = true; m.receiveShadow = true;
  group.add(m);
  return m;
}
function collider(x, z, w, d, padding = 0.8) { colliders.push({ x, z, w: w + padding, d: d + padding }); }
function withinCollider(x, z, c, radius) {
  return Math.abs(x - c.x) < c.w * 0.5 + radius && Math.abs(z - c.z) < c.d * 0.5 + radius;
}

function createTerrain() {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(340, 340), MAT.grass);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  world.add(ground);
  const district = addBox([220, 0.16, 220], [0, 0.03, 0], MAT.dirt);
  district.receiveShadow = true;
}

function road(x, z, w, d) {
  addBox([w, 0.12, d], [x, 0.16, z], MAT.road);
  if (w > d) {
    for (let px = x - w/2 + 8; px < x + w/2 - 8; px += 10) addBox([4.2, .025, .18], [px, .225, z], MAT.asphaltLine, decor);
  } else {
    for (let pz = z - d/2 + 8; pz < z + d/2 - 8; pz += 10) addBox([.18, .025, 4.2], [x, .225, pz], MAT.asphaltLine, decor);
  }
}

function sidewalk(x, z, w, d) { addBox([w, .18, d], [x, .28, z], MAT.concrete); }

function windowRow(cx, cy, cz, width, count, gap, mat = MAT.glass, horizontal = true) {
  for (let i = 0; i < count; i++) {
    const p = (i - (count - 1) / 2) * gap;
    if (horizontal) addBox([width, .7, .08], [cx + p, cy, cz], mat, decor);
    else addBox([.08, .7, width], [cx, cy, cz + p], mat, decor);
  }
}

function house(x, z, rot = 0, palette = 0) {
  const w = 17, d = 13, h = 6.6;
  const group = new THREE.Group();
  group.position.set(x, 0, z); group.rotation.y = rot;
  world.add(group);
  const wall = palette === 0 ? MAT.beige : palette === 1 ? MAT.white : MAT.brick;
  const roof = palette === 2 ? MAT.roof : MAT.concreteDark;
  addBox([w, h, d], [0, h/2, 0], wall, group);
  addBox([w + .7, .7, d + .7], [0, h + .35, 0], roof, group);
  addBox([3.6, 3.9, .2], [0, 2.05, d/2 + .12], MAT.wood, group);
  windowRow(-4.7, 3.55, d/2 + .1, 2.8, 2, 4.3, MAT.glass, false);
  windowRow(4.7, 3.55, d/2 + .1, 2.8, 2, 4.3, MAT.glass, false);
  addBox([.8, 3.8, 3.0], [-w/2 - .05, 2.0, 0], MAT.glass, group);
  addBox([.8, 3.8, 3.0], [w/2 + .05, 2.0, 0], MAT.glass, group);
  collider(x, z, w, d, 1.4);
}

function warehouse(x, z, rot = 0) {
  const w = 32, d = 22, h = 10;
  const group = new THREE.Group(); group.position.set(x, 0, z); group.rotation.y = rot; world.add(group);
  addBox([w, h, d], [0, h/2, 0], MAT.concreteDark, group);
  addBox([w + 1, 1.2, d + 1], [0, h + .6, 0], MAT.roof, group);
  for (let x0 = -w/2 + 5; x0 < w/2 - 4; x0 += 7) addBox([.18, h - 1.4, d + .12], [x0, h/2, 0], MAT.metal, group);
  addBox([8, 6, .35], [0, 3.2, d/2 + .2], MAT.blue, group);
  addBox([7, 5, .4], [0, 2.6, -d/2 - .22], MAT.glass, group);
  collider(x, z, w, d, 1.5);
}

function office(x, z, rot = 0) {
  const w = 24, d = 17, h = 15;
  const group = new THREE.Group(); group.position.set(x, 0, z); group.rotation.y = rot; world.add(group);
  addBox([w, h, d], [0, h/2, 0], MAT.blue, group);
  addBox([w + .8, .45, d + .8], [0, h + .24, 0], MAT.concreteDark, group);
  windowRow(0, 11.7, d/2 + .08, 3.2, 5, 4.1, MAT.glass, false);
  windowRow(0, 7.1, d/2 + .08, 3.2, 5, 4.1, MAT.glass, false);
  addBox([5, 6.5, .26], [0, 3.2, d/2 + .16], MAT.wood, group);
  collider(x, z, w, d, 1.7);
}

function tree(x, z, scale = 1) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(scale); decor.add(g);
  addCylinder(.55, 4.8, [0, 2.4, 0], MAT.trunk, g, 9);
  const crown = new THREE.Mesh(new THREE.DodecahedronGeometry(3.4, 1), MAT.plant);
  crown.position.set(0, 6.1, 0); crown.scale.y = 1.15; crown.castShadow = true; crown.receiveShadow = true; g.add(crown);
}
function rock(x, z, scale = 1) {
  const g = new THREE.Group(); g.position.set(x, .5, z); g.scale.setScalar(scale); decor.add(g);
  const r = new THREE.Mesh(new THREE.DodecahedronGeometry(1.7, 1), MAT.concreteDark);
  r.scale.set(1.4, .75, 1); r.rotation.y = (x * 0.31 + z * 0.17); r.castShadow = true; r.receiveShadow = true; g.add(r);
}
function lamp(x, z) {
  const g = new THREE.Group(); g.position.set(x, 0, z); decor.add(g);
  addCylinder(.1, 5.6, [0, 2.8, 0], MAT.metal, g, 8);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(.18,10,8), MAT.visor); bulb.position.set(1.1,5.5,0); bulb.castShadow = true; g.add(bulb);
}
function planter(x, z, rot = 0) {
  const g = new THREE.Group(); g.position.set(x, .55, z); g.rotation.y = rot; decor.add(g);
  addBox([1.8, .8, 1.2], [0,0,0], MAT.concreteDark, g);
  for (let i=0;i<3;i++) addCylinder(.13,1.1,[(-.5+i*.5),.85,0],MAT.trunk,g,8);
  const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(.75,1), MAT.plant); crown.position.set(0,1.55,0); crown.castShadow = true; g.add(crown);
}

function buildMap() {
  createTerrain();
  road(0, 0, 24, 210); road(0, 0, 210, 24);
  road(-78, 0, 16, 118); road(78, 0, 16, 118);
  road(0, -76, 130, 14); road(0, 76, 130, 14);
  sidewalk(-15, 0, 5, 210); sidewalk(15, 0, 5, 210); sidewalk(0, -15, 210, 5); sidewalk(0, 15, 210, 5);

  house(-43, -40, .05, 0);
  house(-43, -5, -.03, 1);
  house(-43, 40, .02, 2);
  house(40, -42, Math.PI, 1);
  house(40, -5, Math.PI, 0);
  house(40, 42, Math.PI, 2);
  warehouse(-63, 65, Math.PI * .5);
  warehouse(63, -66, -Math.PI * .5);
  office(58, 30, Math.PI);
  office(-58, -28, 0);

  // Central plaza: one self-contained module, rebuilt from the ground up.
  const centralPlaza = new THREE.Group();
  world.add(centralPlaza);

  // Raised floor covers the old road/decor geometry beneath this square.
  addBox([46,.18,46],[0,.10,0],MAT.concreteDark,centralPlaza);
  addBox([41.8,.10,41.8],[0,.20,0],MAT.white,centralPlaza);

  // Thick white square frame.
  addBox([44,.28,1.25],[0,.18,-22.35],MAT.white,centralPlaza);
  addBox([44,.28,1.25],[0,.18,22.35],MAT.white,centralPlaza);
  addBox([1.25,.28,44],[-22.35,.18,0],MAT.white,centralPlaza);
  addBox([1.25,.28,44],[22.35,.18,0],MAT.white,centralPlaza);

  // Plain inset stone surface. No floating blue bars are generated here.
  const inset = new THREE.Mesh(
    new THREE.PlaneGeometry(36,36),
    new THREE.MeshStandardMaterial({color:0xaeb5b7,roughness:.9})
  );
  inset.rotation.x = -Math.PI/2;
  inset.position.y = .255;
  inset.receiveShadow = true;
  centralPlaza.add(inset);

  // Fountain.
  const fountain = new THREE.Group();
  centralPlaza.add(fountain);

  const basinOuter = new THREE.Mesh(
    new THREE.CylinderGeometry(8.8,8.8,.65,64),
    MAT.concreteDark
  );
  basinOuter.position.y = .55;
  basinOuter.castShadow = true;
  basinOuter.receiveShadow = true;
  fountain.add(basinOuter);

  const basinInner = new THREE.Mesh(
    new THREE.CylinderGeometry(7.35,7.35,.34,64),
    MAT.white
  );
  basinInner.position.y = .90;
  basinInner.castShadow = true;
  basinInner.receiveShadow = true;
  fountain.add(basinInner);

  const waterMat = new THREE.MeshStandardMaterial({
    color:0x3f9fbb,
    roughness:.08,
    metalness:.12,
    transparent:true,
    opacity:.94
  });
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(6.85,64),
    waterMat
  );
  water.rotation.x = -Math.PI/2;
  water.position.y = 1.09;
  water.receiveShadow = true;
  fountain.add(water);

  const pedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(1.25,1.55,1.65,32),
    MAT.concreteDark
  );
  pedestal.position.y = 1.91;
  pedestal.castShadow = true;
  pedestal.receiveShadow = true;
  fountain.add(pedestal);

  const jetMat = new THREE.MeshStandardMaterial({
    color:0x8be8ff,
    emissive:0x227f9c,
    emissiveIntensity:.8,
    transparent:true,
    opacity:.78
  });

  const mainJet = new THREE.Mesh(
    new THREE.CylinderGeometry(.18,.28,3.1,16),
    jetMat
  );
  mainJet.position.y = 3.48;
  mainJet.castShadow = true;
  fountain.add(mainJet);

  const crown = new THREE.Mesh(
    new THREE.TorusGeometry(1.5,.11,10,48),
    MAT.white
  );
  crown.rotation.x = Math.PI/2;
  crown.position.y = 3.50;
  crown.castShadow = true;
  fountain.add(crown);

  // Four low nozzle heads sit directly on the basin; they are not floating bars.
  const nozzlePositions = [[2.7,0],[-2.7,0],[0,2.7],[0,-2.7]];
  for (const [x,z] of nozzlePositions) {
    const nozzle = new THREE.Mesh(
      new THREE.CylinderGeometry(.28,.34,.34,20),
      jetMat
    );
    nozzle.position.set(x,1.30,z);
    nozzle.castShadow = true;
    fountain.add(nozzle);
  }

  collider(0,0,15.5,15.5,.4); // keep the player out of the fountain basin
  collider(0, 105, 210, 2, 0);
}
buildMap();

const player = new THREE.Group();
player.position.set(0, 0, 68);
world.add(player);

const model = new THREE.Group();
player.add(model);

const hips = new THREE.Group(); hips.position.y = 1.15; model.add(hips);
const pelvis = new THREE.Mesh(new THREE.CapsuleGeometry(.46,.38,5,10), MAT.playerDark); pelvis.scale.set(.95,.72,1); pelvis.castShadow = true; hips.add(pelvis);
const spine = new THREE.Group(); spine.position.y = .47; hips.add(spine);
const torso = new THREE.Mesh(new THREE.CapsuleGeometry(.48,.76,6,12), MAT.player); torso.scale.set(1,1.06,.82); torso.castShadow = true; spine.add(torso);
const chest = new THREE.Mesh(new THREE.TorusGeometry(.46,.055,8,20), MAT.accent); chest.rotation.x = Math.PI/2; chest.position.y = .25; chest.scale.set(.92,.8,1); chest.castShadow = true; spine.add(chest);
const neck = new THREE.Mesh(new THREE.CylinderGeometry(.16,.16,.18,10), MAT.playerDark); neck.position.y = .96; neck.castShadow = true; spine.add(neck);
const head = new THREE.Group(); head.position.y = 1.2; spine.add(head);
const headMesh = new THREE.Mesh(new THREE.SphereGeometry(.37,16,12), MAT.playerDark); headMesh.scale.set(.95,1.08,.9); headMesh.castShadow = true; head.add(headMesh);
const visor = new THREE.Mesh(new THREE.SphereGeometry(.31,16,10,0,Math.PI*2,0,Math.PI*.48), MAT.visor); visor.position.set(0,.05,.26); visor.rotation.x = Math.PI; visor.scale.set(1,.72,.5); head.add(visor);

function arm(side) {
  const shoulder = new THREE.Group(); shoulder.position.set(.5*side,.67,0); spine.add(shoulder);
  const upper = new THREE.Mesh(new THREE.CapsuleGeometry(.14,.55,4,8), MAT.player); upper.position.y = -.34; upper.castShadow = true; shoulder.add(upper);
  const elbow = new THREE.Group(); elbow.position.y = -.7; shoulder.add(elbow);
  const lower = new THREE.Mesh(new THREE.CapsuleGeometry(.12,.54,4,8), MAT.playerDark); lower.position.y = -.31; lower.castShadow = true; elbow.add(lower);
  const hand = new THREE.Mesh(new THREE.SphereGeometry(.14,10,8), MAT.accent); hand.position.y = -.62; hand.castShadow = true; elbow.add(hand);
  return { shoulder, elbow };
}
function leg(side) {
  const hip = new THREE.Group(); hip.position.set(.29*side,1.02,0); hips.add(hip);
  const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(.17,.62,4,8), MAT.playerDark); thigh.position.y = -.47; thigh.castShadow = true; hip.add(thigh);
  const knee = new THREE.Group(); knee.position.y = -.91; hip.add(knee);
  const shin = new THREE.Mesh(new THREE.CapsuleGeometry(.145,.65,4,8), MAT.player); shin.position.y = -.48; shin.castShadow = true; knee.add(shin);
  const foot = new THREE.Mesh(new THREE.SphereGeometry(.22,12,8), MAT.playerDark); foot.scale.set(1.25,.55,1.8); foot.position.set(0,-.95,.12); foot.castShadow = true; knee.add(foot);
  return { hip, knee };
}
const armL = arm(-1), armR = arm(1), legL = leg(-1), legR = leg(1);

const spawnGlow = new THREE.Mesh(new THREE.TorusGeometry(1.0,.07,12,36),
  new THREE.MeshStandardMaterial({ color:0x74dcff, emissive:0x57c8ff, emissiveIntensity:3.2, transparent:true, opacity:.88 }));
spawnGlow.rotation.x = Math.PI/2; spawnGlow.position.y = .25; player.add(spawnGlow);

const playerRadius = .62;
const keys = new Set();
let started = false;
let spawnTime = performance.now();
let yaw = Math.PI;
let pitch = 0.18;
let cameraDistance = 8.8;
let cameraHeight = 4.6;
let dragging = false;
let lastPointer = null;

const startButton = document.getElementById('start');
const boot = document.getElementById('boot');
const status = document.getElementById('status');

function lockMouse() {
  if (started && document.pointerLockElement !== renderer.domElement) {
    renderer.domElement.requestPointerLock?.();
  }
}

startButton.addEventListener('click', () => {
  started = true;
  spawnTime = performance.now();
  boot.classList.add('hidden');
  status.textContent = 'WASD MOVE  •  SHIFT SPRINT  •  MOUSE LOOK  •  ESC RELEASE';
  lockMouse();
});

addEventListener('keydown', (e) => {
  if (['KeyW','KeyA','KeyS','KeyD','ShiftLeft','ShiftRight'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
});
addEventListener('keyup', (e) => keys.delete(e.code));
renderer.domElement.addEventListener('pointerdown', () => {
  if (started) lockMouse();
});
renderer.domElement.addEventListener('pointermove', (e) => {
  if (!started || document.pointerLockElement !== renderer.domElement) return;
  yaw -= e.movementX * .0028;
  pitch = THREE.MathUtils.clamp(pitch + e.movementY * .0022, -0.18, .78);
});
document.addEventListener('pointerlockchange', () => {
  if (!started) return;
  const locked = document.pointerLockElement === renderer.domElement;
  status.textContent = locked
    ? 'WASD MOVE  •  SHIFT SPRINT  •  MOUSE LOOK  •  ESC RELEASE'
    : 'CLICK GAME TO LOCK MOUSE  •  WASD MOVE  •  SHIFT SPRINT';
});
addEventListener('wheel', (e) => {
  cameraDistance = THREE.MathUtils.clamp(cameraDistance + e.deltaY * .006, 5.5, 12);
}, { passive:true });

function blocked(x, z) {
  if (x < -155 || x > 155 || z < -155 || z > 155) return true;
  for (const c of colliders) if (withinCollider(x,z,c,playerRadius)) return true;
  return false;
}

const clock = new THREE.Clock();
let walkCycle = 0;
function updatePlayer(dt, time) {
  const forward = new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw));
  const right = new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
  const move = new THREE.Vector3();
  if (keys.has('KeyW')) move.sub(forward);
  if (keys.has('KeyS')) move.add(forward);
  if (keys.has('KeyD')) move.add(right);
  if (keys.has('KeyA')) move.sub(right);
  const moving = move.lengthSq() > 0.0001;
  if (moving) move.normalize();
  const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const speed = sprint ? 10.2 : 6.1;
  const targetRot = moving ? Math.atan2(move.x, move.z) : yaw + Math.PI;
  const angleDelta = THREE.MathUtils.euclideanModulo(targetRot - player.rotation.y + Math.PI, Math.PI*2) - Math.PI;
  player.rotation.y += angleDelta * Math.min(1, dt * 11);

  if (moving && started) {
    const velocity = move.multiplyScalar(speed * dt);
    const nextX = player.position.x + velocity.x;
    const nextZ = player.position.z + velocity.z;
    if (!blocked(nextX, player.position.z)) player.position.x = nextX;
    if (!blocked(player.position.x, nextZ)) player.position.z = nextZ;
    walkCycle += dt * (sprint ? 11.5 : 8.3);
  }

  const spawnProgress = THREE.MathUtils.clamp((time - spawnTime) / 1200, 0, 1);
  const spawnEase = 1 - Math.pow(1 - spawnProgress, 3);
  const desiredY = moving ? Math.abs(Math.sin(walkCycle)) * .08 : 0;
  model.position.y = THREE.MathUtils.lerp(model.position.y, desiredY, Math.min(1,dt*10));
  model.scale.setScalar(0.88 + spawnEase * 0.12);
  spawnGlow.scale.setScalar(1.15 - spawnEase * .15 + Math.sin(time*.006)*.035);
  spawnGlow.material.opacity = .5 + (1-spawnEase)*.45;
  spawnGlow.position.y = .22 + (1-spawnEase)*.15;

  const cycle = walkCycle;
  const amp = moving ? (sprint ? .72 : .58) : .06;
  const bob = moving ? Math.abs(Math.sin(cycle))*.055 : Math.sin(time*.004)*.02;
  hips.position.y = 1.15 + bob;
  spine.rotation.z = moving ? Math.sin(cycle)*.025 : Math.sin(time*.0017)*.01;
  spine.rotation.x = moving && sprint ? -0.12 : 0;
  head.rotation.y = Math.sin(time*.0013)*.045;
  head.rotation.x = Math.sin(time*.0011)*.018;
  armL.shoulder.rotation.x = Math.sin(cycle)*amp;
  armR.shoulder.rotation.x = -Math.sin(cycle)*amp;
  armL.elbow.rotation.x = .13 + Math.max(0,Math.sin(cycle))*.2;
  armR.elbow.rotation.x = .13 + Math.max(0,-Math.sin(cycle))*.2;
  legL.hip.rotation.x = -Math.sin(cycle)*amp;
  legR.hip.rotation.x = Math.sin(cycle)*amp;
  legL.knee.rotation.x = Math.max(0, Math.sin(cycle))*0.32;
  legR.knee.rotation.x = Math.max(0,-Math.sin(cycle))*0.32;
}

function updateCamera(dt) {
  const target = new THREE.Vector3(player.position.x, player.position.y + 2.35, player.position.z);
  const horiz = Math.cos(pitch) * cameraDistance;
  const offset = new THREE.Vector3(
    Math.sin(yaw) * horiz,
    Math.sin(pitch) * cameraDistance + cameraHeight*.25,
    Math.cos(yaw) * horiz
  );
  const desired = target.clone().add(offset);
  camera.position.lerp(desired, 1 - Math.pow(.001, dt));
  camera.lookAt(target);
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), .05);
  const now = performance.now();
  updatePlayer(dt, now);
  updateCamera(dt);
  renderer.render(scene, camera);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

window.__GAME_READY__ = true;
window.__GAME_STATE__ = () => ({
  ready: true,
  player: { x: player.position.x, y: player.position.y, z: player.position.z },
  colliders: colliders.length,
  worldChildren: world.children.length,
  renderer: renderer.capabilities.isWebGL2 ? 'webgl2' : 'webgl1'
});

animate();