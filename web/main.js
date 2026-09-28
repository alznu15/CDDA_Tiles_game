// Load the 3D engine defensively. A CDN failure must never leave the boot screen
// silently stuck at "Preparing scene…".
let THREE = null;
let GLTFLoader = null;
const engineSources = [
  {
    three: 'https://cdn.jsdelivr.net/npm/three@0.186.0/build/three.module.js',
    loader: 'https://cdn.jsdelivr.net/npm/three@0.186.0/examples/jsm/loaders/GLTFLoader.js'
  },
  {
    three: 'https://unpkg.com/three@0.186.0/build/three.module.js',
    loader: 'https://unpkg.com/three@0.186.0/examples/jsm/loaders/GLTFLoader.js?module'
  },
  {
    three: 'https://esm.sh/three@0.186.0?bundle',
    loader: 'https://esm.sh/three@0.186.0/examples/jsm/loaders/GLTFLoader.js?bundle'
  }
];

let engineLoaded = false;
const engineErrors = [];

for (const source of engineSources) {
  if (engineLoaded) break;
  try {
    const threeModule = await import(source.three);
    THREE = threeModule;
    try {
      const loaderModule = await import(source.loader);
      GLTFLoader = loaderModule.GLTFLoader || null;
    } catch (loaderError) {
      console.warn('Optional GLTFLoader source failed:', source.loader, loaderError);
    }
    engineLoaded = true;
  } catch (engineError) {
    engineErrors.push(String(engineError));
  }
}

if (!engineLoaded) {
  const loading = document.getElementById('loading');
  const start = document.getElementById('start');
  if (loading) loading.textContent = '3D engine failed to load. Check the browser network connection.';
  if (start) start.disabled = true;
  console.error('All Three.js engine sources failed:', engineErrors);
  throw new Error('Three.js could not be loaded from any configured source.');
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fa9b5);
scene.fog = new THREE.Fog(0x8fa9b5, 95, 280);

const camera = new THREE.PerspectiveCamera(67, innerWidth / innerHeight, 0.1, 360);
const renderer = new THREE.WebGLRenderer({ antialias:true, powerPreference:'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;
document.body.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xd9efff, 0x304139, 1.35));
const sun = new THREE.DirectionalLight(0xffe7c2, 2.25);
sun.position.set(-65, 110, 45);
sun.castShadow = true;
sun.shadow.mapSize.set(1536,1536);
sun.shadow.camera.left = -150;
sun.shadow.camera.right = 150;
sun.shadow.camera.top = 150;
sun.shadow.camera.bottom = -150;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 320;
scene.add(sun);

const world = new THREE.Group();
scene.add(world);
const staticColliders = [];
const walkableSurfaces = [];
const terrainStepHeight = .6;
const terrainSnapRate = 18;

const MAT = {
  grass:new THREE.MeshStandardMaterial({color:0x55745a,roughness:1}),
  soil:new THREE.MeshStandardMaterial({color:0x6d5a46,roughness:1}),
  road:new THREE.MeshStandardMaterial({color:0x222a2e,roughness:.95}),
  curb:new THREE.MeshStandardMaterial({color:0x9ba1a0,roughness:.92}),
  concrete:new THREE.MeshStandardMaterial({color:0x777f82,roughness:.94}),
  white:new THREE.MeshStandardMaterial({color:0xd6d9d2,roughness:.88}),
  buildingA:new THREE.MeshStandardMaterial({color:0xb49a7c,roughness:.94}),
  buildingB:new THREE.MeshStandardMaterial({color:0x7c96a3,roughness:.91}),
  buildingC:new THREE.MeshStandardMaterial({color:0x8d6e61,roughness:.94}),
  roof:new THREE.MeshStandardMaterial({color:0x3a4145,roughness:.97}),
  glass:new THREE.MeshStandardMaterial({color:0x8dc0d0,roughness:.14,metalness:.12}),
  metal:new THREE.MeshStandardMaterial({color:0x657078,roughness:.48,metalness:.65}),
  green:new THREE.MeshStandardMaterial({color:0x2f5536,roughness:1}),
  trunk:new THREE.MeshStandardMaterial({color:0x584536,roughness:1})
};

const box = (sx,sy,sz,x,y,z,mat,parent=world) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),mat);
  m.position.set(x,y,z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
};

function collider(x,z,w,d,pad=.7,h=32,passable=null) {
  staticColliders.push({x,z,w:w+pad,d:d+pad,h,passable});
}

function addWalkableSurface(x,z,w,d,height,heightAt=null){
  walkableSurfaces.push({x,z,w,d,height,heightAt});
}

function groundHeightAt(x,z){
  let height=0;
  for(const s of walkableSurfaces){
    if(
      Math.abs(x-s.x)<=s.w*.5 &&
      Math.abs(z-s.z)<=s.d*.5
    ){
      const sample=s.heightAt ? s.heightAt(x,z) : s.height;
      if(sample>height) height=sample;
    }
  }
  return height;
}

function isBlocked(x,z,r=.55) {
  if (x < -146 || x > 146 || z < -146 || z > 146) return true;
  for (const c of staticColliders) {
    if(c.passable && c.passable(x,z)) continue;
    if (Math.abs(x-c.x) < c.w*.5+r && Math.abs(z-c.z) < c.d*.5+r) return true;
  }
  return false;
}

function canTraverseTo(x,z,fromGround){
  if(isBlocked(x,z,playerRadius)) return false;
  return Math.abs(groundHeightAt(x,z)-fromGround)<=terrainStepHeight;
}

function addRoad(x,z,w,d) {
  box(w,.14,d,x,.07,z,MAT.road);
  addWalkableSurface(x,z,w,d,.14);
  const horizontal = w > d;
  const count = horizontal ? Math.floor((w-14)/12) : Math.floor((d-14)/12);
  for(let i=0;i<count;i++){
    if(horizontal){
      const px = x - (count-1)*6 + i*12;
      box(4.5,.004,.16,px,.142,z,MAT.white);
    }else{
      const pz = z - (count-1)*6 + i*12;
      box(.16,.004,4.5,x,.142,pz,MAT.white);
    }
  }
}

function addSidewalk(x,z,w,d){
  box(w,.18,d,x,.16,z,MAT.curb);
  addWalkableSurface(x,z,w,d,.25);
}

function addBuilding(x,z,w,d,h,mat){
  const g = new THREE.Group();
  g.position.set(x,0,z);
  world.add(g);

  box(w,h,d,0,h/2,0,mat,g);
  box(w+.5,.55,d+.5,0,h+.27,0,MAT.roof,g);

  const frontZ = d/2+.035;
  const backZ = -d/2-.035;
  const rows = Math.max(2,Math.floor(w/4.2));
  for(let i=0;i<rows;i++){
    const px = -w/2 + 2.3 + i*4.2;
    if(px>w/2-1.4) continue;
    box(1.8,1.35,.08,px,Math.min(h-1.5, h*.62),frontZ,MAT.glass,g);
    if(i%2===0) box(1.8,1.35,.08,px,Math.min(h-1.5, h*.62),backZ,MAT.glass,g);
  }
  box(Math.min(6,w*.42),Math.min(3.8,h*.48),.12,0,Math.min(2.1,h*.38),frontZ-.01,MAT.buildingC,g);
  collider(x,z,w,d,1.2,h);
}

function addTree(x,z,s=1){
  const g = new THREE.Group();
  g.position.set(x,0,z);
  g.scale.setScalar(s);
  world.add(g);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.38,.48,3.5,8),MAT.trunk);
  trunk.position.y=1.75; trunk.castShadow=true; trunk.receiveShadow=true; g.add(trunk);
  const crown = new THREE.Mesh(new THREE.DodecahedronGeometry(2.5,1),MAT.green);
  crown.position.y=5; crown.scale.y=1.15; crown.castShadow=true; crown.receiveShadow=true; g.add(crown);
}

function addCentralFountain(){
  const g=new THREE.Group();
  g.position.set(0,.25,0);
  world.add(g);

  const basinMat=new THREE.MeshStandardMaterial({color:0x48545a,roughness:.42,metalness:.42});
  const trimMat=new THREE.MeshStandardMaterial({color:0xc1d2d6,roughness:.24,metalness:.62});
  const waterMat=new THREE.MeshStandardMaterial({
    color:0x48c7e8,
    roughness:.06,
    metalness:.14,
    transparent:true,
    opacity:.72,
    depthWrite:false
  });
  const glowMat=new THREE.MeshStandardMaterial({
    color:0x72e0f4,
    emissive:0x1b7992,
    emissiveIntensity:1.6,
    roughness:.18,
    metalness:.2
  });
  const rippleMat=()=>new THREE.MeshBasicMaterial({
    color:0xbaf5ff,
    transparent:true,
    opacity:.45,
    depthWrite:false,
    side:THREE.DoubleSide
  });

  const base=new THREE.Mesh(new THREE.CylinderGeometry(5.35,5.75,.46,48),basinMat);
  base.position.y=.23;
  base.castShadow=true;
  base.receiveShadow=true;
  g.add(base);

  const lowerTrim=new THREE.Mesh(new THREE.TorusGeometry(5.25,.18,10,56),trimMat);
  lowerTrim.rotation.x=Math.PI/2;
  lowerTrim.position.y=.48;
  lowerTrim.castShadow=true;
  g.add(lowerTrim);

  const inner=new THREE.Mesh(new THREE.CylinderGeometry(4.66,4.78,.13,48),waterMat);
  inner.position.y=.53;
  inner.receiveShadow=true;
  g.add(inner);

  const ring=new THREE.Mesh(new THREE.TorusGeometry(4.92,.16,10,56),trimMat);
  ring.rotation.x=Math.PI/2;
  ring.position.y=.70;
  ring.castShadow=true;
  g.add(ring);

  const pedestal=new THREE.Mesh(new THREE.CylinderGeometry(1.18,1.5,1.58,24),trimMat);
  pedestal.position.y=1.22;
  pedestal.castShadow=true;
  pedestal.receiveShadow=true;
  g.add(pedestal);

  const pedestalGlow=new THREE.Mesh(new THREE.TorusGeometry(1.16,.08,8,32),glowMat);
  pedestalGlow.rotation.x=Math.PI/2;
  pedestalGlow.position.y=1.42;
  g.add(pedestalGlow);

  const core=new THREE.Mesh(new THREE.SphereGeometry(.72,24,16),glowMat);
  core.position.y=2.06;
  core.castShadow=true;
  g.add(core);

  const coreRing=new THREE.Mesh(new THREE.TorusGeometry(.88,.055,8,32),glowMat);
  coreRing.rotation.x=Math.PI/2;
  coreRing.position.y=2.06;
  g.add(coreRing);

  const jets=[];
  const jetDroplets=[];
  for(const [idx,p] of [[0,[1.02,0]],[1,[0,1.02]],[2,[-1.02,0]],[3,[0,-1.02]]]){
    const jet=new THREE.Mesh(new THREE.CylinderGeometry(.055,.12,1.25,10),waterMat);
    jet.position.set(p[0],1.46,p[1]);
    jet.castShadow=true;
    g.add(jet);
    jets.push(jet);

    const dropMat=waterMat.clone();
    dropMat.opacity=.72;
    const drop=new THREE.Mesh(new THREE.SphereGeometry(.075,10,8),dropMat);
    drop.position.set(p[0],2.04,p[1]);
    g.add(drop);
    jetDroplets.push({mesh:drop,phase:idx*.7});
  }

  const ripples=[];
  for(let i=0;i<4;i++){
    const ripple=new THREE.Mesh(
      new THREE.TorusGeometry(.85+i*.45,.035,6,32),
      rippleMat()
    );
    ripple.rotation.x=Math.PI/2;
    ripple.position.y=.625;
    g.add(ripple);
    ripples.push(ripple);
  }

  // Low-angle ramp: walk onto the fountain instead of jumping onto it.
  const rampWidth=2.7;
  const rampStartZ=-7.0;
  const rampEndZ=-4.05;
  const rampStartY=.25;
  const rampEndY=.67;
  const rampLength=rampEndZ-rampStartZ;
  const rampAngle=-Math.atan2(rampEndY-rampStartY,rampLength);
  const ramp=box(
    rampWidth,.18,rampLength,
    0,(rampStartY+rampEndY)/2,(rampStartZ+rampEndZ)/2,
    basinMat,g
  );
  ramp.rotation.x=rampAngle;

  addWalkableSurface(
    0,(rampStartZ+rampEndZ)/2,rampWidth,rampLength,rampStartY,
    (x,z)=>{
      const t=THREE.MathUtils.clamp((z-rampStartZ)/(rampEndZ-rampStartZ),0,1);
      return THREE.MathUtils.lerp(rampStartY,rampEndY,t);
    }
  );

  // Approximate the circular fountain collision, with the south ramp as the opening.
  collider(0,0,11.5,11.5,.25,2.8,(x,z)=>z<-4.0 && Math.abs(x)<1.45);

  const light=new THREE.PointLight(0x76eaff,2.0,12,2);
  light.position.set(0,2.1,0);
  g.add(light);

  g.userData.jets=jets;
  g.userData.jetDroplets=jetDroplets;
  g.userData.ripples=ripples;
  g.userData.coreRing=coreRing;
  g.userData.waterSurface=inner;
  world.userData.fountain=g;
}

function addPlazaFurniture(){
  const benchMat=new THREE.MeshStandardMaterial({color:0x3b464b,roughness:.72,metalness:.25});
  const seatMat=new THREE.MeshStandardMaterial({color:0x7c8d93,roughness:.62,metalness:.18});

  for(const [x,z,rot] of [
    [-8,0,Math.PI/2],[8,0,-Math.PI/2],[0,-8,0],[0,8,Math.PI]
  ]){
    const g=new THREE.Group();
    g.position.set(x,.28,z);
    g.rotation.y=rot;
    world.add(g);
    box(3.4,.22,.7,0,.2,0,seatMat,g);
    box(2.7,.8,.18,0,-.25,-.25,benchMat,g);
    box(.16,.45,.55,-1.2,-.1,.18,benchMat,g);
    box(.16,.45,.55,1.2,-.1,.18,benchMat,g);

    const benchAlongX=Math.abs(Math.sin(rot))<0.5;
    collider(x,z,benchAlongX?3.8:.95,benchAlongX?.95:3.8,.12,1.1);
  }

  const planterMat=new THREE.MeshStandardMaterial({color:0x536067,roughness:.8});
  const plantMat=new THREE.MeshStandardMaterial({color:0x365f42,roughness:1});
  for(const [x,z] of [[-10,-10],[10,-10],[-10,10],[10,10]]){
    const pot=new THREE.Mesh(new THREE.CylinderGeometry(.72,.82,.8,14),planterMat);
    pot.position.set(x,.64,z);
    pot.castShadow=true;
    pot.receiveShadow=true;
    world.add(pot);

    const plant=new THREE.Mesh(new THREE.DodecahedronGeometry(1.1,1),plantMat);
    plant.position.set(x,1.65,z);
    plant.scale.y=1.15;
    plant.castShadow=true;
    plant.receiveShadow=true;
    world.add(plant);
    collider(x,z,1.75,1.75,.12,1.6);
  }
}

function addUrbanDetails(){
  const detailMat=new THREE.MeshStandardMaterial({color:0x606a6f,roughness:.66,metalness:.48});
  const darkMat=new THREE.MeshStandardMaterial({color:0x20272b,roughness:.9,metalness:.18});
  const lightMat=new THREE.MeshStandardMaterial({color:0xc9d4d6,roughness:.42,metalness:.2});

  // Crosswalks and small flush street details around the central junction.
  for(const z of [-11.2,11.2]){
    for(let i=-4;i<=4;i++) box(1.6,.012,.34,i*2,z,lightMat);
  }
  for(const x of [-11.2,11.2]){
    for(let i=-4;i<=4;i++) box(.34,.012,1.6,x,i*2,lightMat);
  }

  for(const [x,z] of [[-7,-7],[7,-7],[-7,7],[7,7]]){
    const manhole=new THREE.Mesh(new THREE.CylinderGeometry(.62,.62,.035,24),darkMat);
    manhole.position.set(x,.155,z);
    manhole.receiveShadow=true;
    world.add(manhole);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.62,.03,6,24),detailMat);
    ring.rotation.x=Math.PI/2;
    ring.position.set(x,.176,z);
    world.add(ring);
  }

  for(const [x,z] of [[-18,-18],[18,-18],[-18,18],[18,18]]){
    const post=new THREE.Mesh(new THREE.CylinderGeometry(.13,.16,.85,12),detailMat);
    post.position.set(x,.43,z);
    post.castShadow=true;
    world.add(post);
    const cap=new THREE.Mesh(new THREE.CylinderGeometry(.18,.18,.08,12),lightMat);
    cap.position.set(x,.86,z);
    world.add(cap);
    collider(x,z,.38,.38,.06,.9);
  }
}

function buildMap(){
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(300,300),MAT.grass);
  ground.rotation.x=-Math.PI/2;
  ground.receiveShadow=true;
  world.add(ground);
  // Keep soil below grass to prevent z-fighting.
  box(220,.08,220,0,-.05,0,MAT.soil);

  // Fresh road layout. Nothing from the previous map is reused.
  addRoad(0,0,22,220);
  addRoad(0,0,220,22);
  addSidewalk(-15,0,5,220);
  addSidewalk(15,0,5,220);
  addSidewalk(0,-15,220,5);
  addSidewalk(0,15,220,5);

  // Four clean neighborhood blocks.
  addBuilding(-46,-45,20,15,8,MAT.buildingA);
  addBuilding(-46,-5,20,15,9,MAT.buildingB);
  addBuilding(-46,45,20,15,10,MAT.buildingC);
  addBuilding(46,-45,20,15,9,MAT.buildingB);
  addBuilding(46,-5,20,15,8,MAT.buildingA);
  addBuilding(46,45,20,15,10,MAT.buildingC);
  addBuilding(-78,-48,17,20,11,MAT.buildingB);
  addBuilding(78,48,17,20,11,MAT.buildingB);

  // Small open central plaza; deliberately no fountain or repeating floating bars.
  box(34,.10,34,0,.19,0,MAT.concrete);
  addWalkableSurface(0,0,34,34,.24);
  box(27,.008,27,0,.244,0,MAT.white);
  addWalkableSurface(0,0,27,27,.248);

  for(const p of [
    [-31,-27],[-31,27],[31,-27],[31,27],
    [-83,-18],[-83,18],[83,-18],[83,18],
    [-22,-82],[22,-82],[-22,82],[22,82]
  ]) addTree(p[0],p[1],.9);

  // Central landmark: a solid sci-fi fountain with a shallow basin and four animated water jets.
  addCentralFountain();

  // Environmental details keep the district visually rich without cluttering traversal lanes.
  addPlazaFurniture();
  addUrbanDetails();
}
buildMap();

const ASSET_ROOT='https://raw.githubusercontent.com/chongdashu/vibejam-starter-pack/main/projects/toonshooter/public/assets/toonshooter/';
const loader=GLTFLoader ? new GLTFLoader() : null;

async function loadExternalProp(path,targetScale=1){
  if(!loader) return null;
  try{
    const gltf=await loader.loadAsync(ASSET_ROOT+path);
    const root=gltf.scene;
    root.scale.setScalar(targetScale);
    root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
    return root;
  }catch(err){
    console.warn('Optional asset failed:',path,err);
    return null;
  }
}

async function addStreetAssets(){
  const template=await loadExternalProp('Environment/glTF/StreetLight.gltf',1);
  if(!template) return;
  for(const p of [
    [-17,-72],[-17,72],[17,-72],[17,72],
    [-72,-17],[72,-17],[-72,17],[72,17]
  ]){
    const g=template.clone(true);
    const box3=new THREE.Box3().setFromObject(g);
    const h=box3.max.y-box3.min.y;
    if(h>0) g.scale.multiplyScalar(6.2/h);
    g.position.set(p[0],0,p[1]);
    world.add(g);
  }
}

const player = new THREE.Group();
player.position.set(0,0,76);
world.add(player);

let characterRoot=null;
let characterBaseScale=1;
let mixer=null;
let actions={};
let currentAction=null;
let characterReady=false;

function setAction(name,fade=.18){
  const next=actions[name] || actions.Idle;
  if(!next) return;
  if(currentAction===next) return;
  if(currentAction) currentAction.fadeOut(fade);
  next.reset().fadeIn(fade).play();
  currentAction=next;
}

async function loadCharacter(){
  const loading=document.getElementById('loading');
  if(!loader){
    loading.textContent='Character asset skipped; gameplay is available.';
    return;
  }
  try{
    loading.textContent='Loading character asset…';
    const gltf=await loader.loadAsync(
      'https://raw.githubusercontent.com/chongdashu/vibejam-starter-pack/main/projects/toonshooter/public/assets/toonshooter/Characters/glTF/Character_Soldier.gltf'
    );

    characterRoot=gltf.scene;
    characterRoot.traverse(o=>{
      if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}
    });

    characterRoot.visible=true;
    characterRoot.scale.setScalar(1);

    // Normalize against the real rendered bounds, then put the feet exactly on the ground.
    const initialBox=new THREE.Box3().setFromObject(characterRoot);
    const initialSize=initialBox.getSize(new THREE.Vector3());
    const initialHeight=initialSize.y;
    if(initialHeight>0){
      characterBaseScale=1.95/initialHeight;
      characterRoot.scale.setScalar(characterBaseScale);
    }

    // The gameplay direction is already correct; align the character model forward with it.
    characterRoot.rotation.y=0;

    // Scaling/rotation can move the model bounds below y=0. Recompute after scaling
    // and lift it so the rendered feet sit exactly on the ground.
    characterRoot.updateMatrixWorld(true);
    const finalBox=new THREE.Box3().setFromObject(characterRoot);
    if(Number.isFinite(finalBox.min.y)) characterRoot.position.y=-finalBox.min.y;

    player.add(characterRoot);
    characterRoot.updateMatrixWorld(true);

    mixer=new THREE.AnimationMixer(characterRoot);
    for(const clip of gltf.animations){
      const key=clip.name.toLowerCase();
      const action=mixer.clipAction(clip);

      if(key.includes('jump') || key.includes('fall') || key.includes('air')){
        if(!actions.Jump) actions.Jump=action;
      }else if(key.includes('idle')){
        if(!actions.Idle) actions.Idle=action;
      }else if(key.includes('walk')){
        if(!actions.Walk) actions.Walk=action;
      }else if(key.includes('run')){
        if(!actions.Run) actions.Run=action;
      }
    }
    setAction('Idle',0);
    characterReady=true;
    loading.textContent='Character ready.';
    console.log('Character loaded:', {
      height: (new THREE.Box3().setFromObject(characterRoot).max.y - new THREE.Box3().setFromObject(characterRoot).min.y).toFixed(2),
      position: characterRoot.position.toArray(),
      scale: characterRoot.scale.toArray()
    });
  }catch(err){
    console.error('Character load failed',err);
    loading.textContent='Character asset failed to load; gameplay remains available.';
  }
}

const spawnRing=new THREE.Mesh(
  new THREE.RingGeometry(1.05,1.17,40),
  new THREE.MeshBasicMaterial({color:0x9de5ff,transparent:true,opacity:.8,side:THREE.DoubleSide})
);
spawnRing.rotation.x=-Math.PI/2;
spawnRing.position.y=.025;
player.add(spawnRing);

let started=false;
let yaw=0;
let pitch=.18;
let cameraDistance=4.8;
const cameraDistanceMin=3.2;
const cameraDistanceMax=8.5;
let cameraHeight=1.9;
let shoulderSide=1;
const cameraShoulder=1.22;
const cameraAimOffset=.95;
const cameraCollisionRadius=.24;
const cameraCollisionSkin=.16;
const cameraMinClearance=1.45;
const cameraRay=new THREE.Ray();
const cameraBox=new THREE.Box3();
const cameraHitPoint=new THREE.Vector3();
let verticalVelocity=0;
let grounded=true;
const gravity=-24;
const jumpSpeed=8.4;
const playerRadius=.58;
let spawnTime=performance.now();

function lockMouse(){
  if(started && document.pointerLockElement!==renderer.domElement){
    renderer.domElement.requestPointerLock?.();
  }
}

// Single-source keyboard input driver.
// No Set, no key-combination inference, and no modifier-dependent jump logic.
const input={
  w:false,
  a:false,
  s:false,
  d:false,
  shift:false,
  space:false
};
let jumpRequest=false;
let lastSpaceDown=0;

// Live keyboard diagnostics. This records the actual DOM keyboard events separately
// from the game's logical input state, so W+Shift+Space can be verified directly.
const inputDiag={
  W:{down:false,keydown:0,keyup:0,last:''},
  A:{down:false,keydown:0,keyup:0,last:''},
  S:{down:false,keydown:0,keyup:0,last:''},
  D:{down:false,keydown:0,keyup:0,last:''},
  Shift:{down:false,keydown:0,keyup:0,last:''},
  Space:{down:false,keydown:0,keyup:0,keypress:0,last:''}
};
const inputDiagLog=[];
function recordInputEvent(type,e,code){
  const key =
    code==='KeyW' ? 'W' :
    code==='KeyA' ? 'A' :
    code==='KeyS' ? 'S' :
    code==='KeyD' ? 'D' :
    (code==='ShiftLeft'||code==='ShiftRight') ? 'Shift' :
    code==='Space' ? 'Space' : '';
  if(!key) return;
  const d=inputDiag[key];
  if(type==='keydown'){
    d.keydown++;
    d.down=true;
  }else if(type==='keyup'){
    d.keyup++;
    d.down=false;
  }else if(type==='keypress'){
    d.keypress++;
  }
  d.last=type+' '+(e.code||'')+' key='+JSON.stringify(e.key||'')+
    ' repeat='+!!e.repeat+' shiftKey='+!!e.shiftKey+
    ' ctrl='+!!e.ctrlKey+' alt='+!!e.altKey;
  inputDiagLog.unshift({
    t:performance.now(),
    type,key,
    code:e.code||'',
    key:e.key||'',
    repeat:!!e.repeat,
    shiftKey:!!e.shiftKey
  });
  if(inputDiagLog.length>12) inputDiagLog.pop();
}

function updateInputDiagnostics(){
  const panel=document.getElementById('inputDiag');
  if(!panel) return;
  const rows=['W','A','S','D','Shift','Space'].map(k=>{
    const d=inputDiag[k];
    const down=d.down;
    return '<tr>'+
      '<td>'+k+'</td>'+
      '<td class="'+(down?'pressed':'released')+'">'+(down?'DOWN':'UP')+'</td>'+
      '<td>'+d.keydown+'</td>'+
      '<td>'+d.keyup+'</td>'+
      '<td>'+(k==='Space'?d.keypress:'—')+'</td>'+
    '</tr>';
  }).join('');
  const comboW=inputDiag.W.down;
  const comboShift=inputDiag.Shift.down;
  const comboSpace=inputDiag.Space.down;
  const spaceEvents=inputDiag.Space.keydown+inputDiag.Space.keyup+inputDiag.Space.keypress;
  const recent=inputDiagLog.slice(0,5).map(x=>
    x.type+' '+x.key+' ['+x.code+']'+(x.repeat?' repeat':'')
  ).join('<br>');
  panel.innerHTML=
    '<div class="diagTitle">INPUT DIAGNOSTIC</div>'+
    '<div class="diagCombo">W '+(comboW?'✓':'·')+
      ' &nbsp; SHIFT '+(comboShift?'✓':'·')+
      ' &nbsp; SPACE '+(comboSpace?'✓':'·')+
    '</div>'+
    '<table><thead><tr><th>KEY</th><th>NOW</th><th>DOWN</th><th>UP</th><th>PRESS</th></tr></thead>'+
    '<tbody>'+rows+'</tbody></table>'+
    '<div class="diagResult">SPACE EVENTS RECEIVED: <b>'+spaceEvents+
      '</b> &nbsp; | &nbsp; GAME SPACE STATE: <b>'+(input.space?'DOWN':'UP')+'</b></div>'+
    '<div class="diagRecent">'+(recent||'No keyboard events yet.')+'</div>';
}

// Dedicated W+Shift sprint-jump state machine.
// This is intentionally separate from the normal jump path.
const sprintJump={
  active:false,
  phase:0,
  timer:0,
  lastTrigger:0,
  cooldown:260
};

function setInput(code,down){
  switch(code){
    case 'KeyW': input.w=down; break;
    case 'KeyA': input.a=down; break;
    case 'KeyS': input.s=down; break;
    case 'KeyD': input.d=down; break;
    case 'ShiftLeft':
    case 'ShiftRight':
      input.shift=down;
      break;
    case 'Space':
      input.space=down;
      break;
  }
}

function normalizeCode(e){
  if(e.code) return e.code;
  if(e.key==='w'||e.key==='W') return 'KeyW';
  if(e.key==='a'||e.key==='A') return 'KeyA';
  if(e.key==='s'||e.key==='S') return 'KeyS';
  if(e.key==='d'||e.key==='D') return 'KeyD';
  if(e.key==='v'||e.key==='V') return 'KeyV';
  if(e.key==='Shift') return e.shiftKey ? 'ShiftLeft' : 'ShiftRight';
  if(e.key===' '||e.key==='Spacebar'||e.which===32||e.keyCode===32) return 'Space';
  return '';
}

function requestJump(){
  jumpRequest=true;
  lastSpaceDown=performance.now();
}

function handleKeyDown(e){
  const code=normalizeCode(e);

  if(code==='KeyV'){
    shoulderSide*=-1;
    updateShoulderStatus();
    e.preventDefault();
    return;
  }
  recordInputEvent('keydown',e,code);
  updateInputDiagnostics();

  if(code==='Space'){
    e.preventDefault();

    setInput('Space',true);

    if(!e.repeat){
      performJump();
      requestJump();
    }
    return;
  }

  if(code==='KeyW'||code==='KeyA'||code==='KeyS'||code==='KeyD'||
     code==='ShiftLeft'||code==='ShiftRight'){
    setInput(code,true);
    // Prevent browser shortcuts/scroll only for movement keys.
    e.preventDefault();
  }
}

function performJump(){
  if(!started || !grounded) return false;

  const now=performance.now();
  const sprinting=input.w && input.shift;

  if(sprinting && now-sprintJump.lastTrigger<sprintJump.cooldown) return false;

  verticalVelocity=jumpSpeed;
  grounded=false;
  jumpRequest=false;

  // Sprint is completely independent from Jump.
  // Space only decides "jump"; the current sprint state decides
  // whether the special sprint-jump animation path is used.
  if(sprinting){
    sprintJump.active=true;
    sprintJump.phase=0;
    sprintJump.timer=now;
    sprintJump.lastTrigger=now;
  }

  return true;
}

function handleKeyUp(e){
  const code=normalizeCode(e);
  recordInputEvent('keyup',e,code);
  updateInputDiagnostics();

  // Compatibility path: some keyboard/browser combinations expose Space
  // on keyup but not keydown. Treat that Space as a real jump event too.
  if(code==='Space' && started && grounded){
    performJump();
  }

  if(code) setInput(code,false);
}

addEventListener('keydown',handleKeyDown,true);
addEventListener('keypress',e=>{
  const code=normalizeCode(e);
  recordInputEvent('keypress',e,code);
  updateInputDiagnostics();
  if(code==='Space'){
    e.preventDefault();
    if(!e.repeat) performJump();
  }
},true);
addEventListener('keyup',handleKeyUp,true);

// Additional compatibility path for browsers that expose a printable Space
// key through beforeinput instead of the expected keyboard event.
addEventListener('beforeinput',e=>{
  if(e.inputType==='insertText' && (e.data===' ' || e.data===null)){
    e.preventDefault();
    performJump();
  }
},false);

addEventListener('blur',()=>{
  input.w=input.a=input.s=input.d=input.shift=input.space=false;
  inputDiag.W.down=inputDiag.A.down=inputDiag.S.down=inputDiag.D.down=false;
  inputDiag.Shift.down=inputDiag.Space.down=false;
  jumpRequest=false;
  updateInputDiagnostics();
});

window.__INPUT_STATE__=()=>({
  ...input,
  grounded,
  verticalVelocity,
  jumpRequest,
  lastSpaceDown
});

const startButton=document.getElementById('start');
const boot=document.getElementById('boot');
const status=document.getElementById('status');

function updateShoulderStatus(){
  if(!started) return;
  status.textContent=(shoulderSide>0?'SHOULDER: LEFT • ':'SHOULDER: RIGHT • ') +
    'V SWITCH  •  WASD MOVE  •  SHIFT SPRINT  •  SPACE JUMP  •  MOUSE LOOK';
}

startButton.disabled=false;
document.getElementById('loading').textContent='Ready.';
loadCharacter().catch(()=>{});
addStreetAssets().catch(()=>{});

startButton.addEventListener('click',()=>{
  started=true;
  spawnTime=performance.now();
  boot.classList.add('hidden');
  updateShoulderStatus();
  lockMouse();
});

renderer.domElement.addEventListener('pointerdown',()=>{if(started) lockMouse();});
renderer.domElement.addEventListener('pointermove',e=>{
  if(!started || document.pointerLockElement!==renderer.domElement) return;
  yaw-=e.movementX*.0028;
  pitch=THREE.MathUtils.clamp(pitch+e.movementY*.0022,-1.42,1.42);
});
document.addEventListener('pointerlockchange',()=>{
  if(!started)return;
  status.textContent=document.pointerLockElement===renderer.domElement
    ? ((shoulderSide>0?'SHOULDER: LEFT • ':'SHOULDER: RIGHT • ')+'V SWITCH  •  WASD MOVE  •  SHIFT SPRINT  •  SPACE JUMP  •  MOUSE LOOK')
    : 'CLICK GAME TO LOCK MOUSE  •  V SWITCH SHOULDER  •  WASD MOVE  •  SHIFT SPRINT  •  SPACE JUMP';
});
addEventListener('wheel',e=>{
  cameraDistance=THREE.MathUtils.clamp(cameraDistance+e.deltaY*.006,cameraDistanceMin,cameraDistanceMax);
},{passive:true});

let sprintJumpComboArmed=false;
function updateSprintJumpArm(){
  const combo=input.w && input.shift;
  if(combo && !sprintJumpComboArmed){
    sprintJumpComboArmed=true;
  }
  if(!combo){
    sprintJumpComboArmed=false;
  }
}

function updatePlayer(dt,time){
  updateSprintJumpArm();

  const forward=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw));
  const right=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
  const move=new THREE.Vector3();
  if(input.w) move.add(forward);
  if(input.s) move.sub(forward);
  if(input.d) move.add(right);
  if(input.a) move.sub(right);

  const moving=move.lengthSq()>1e-5;
  if(moving) move.normalize();

  const sprint=input.shift;
  const speed=sprint?10.5:6.2;

  if(moving && started){
    const currentGround=groundHeightAt(player.position.x,player.position.z);
    const step=move.clone().multiplyScalar(speed*dt);
    const nx=player.position.x+step.x;
    const nz=player.position.z+step.z;

    if(canTraverseTo(nx,player.position.z,currentGround)){
      player.position.x=nx;
    }
    if(canTraverseTo(player.position.x,nz,groundHeightAt(player.position.x,player.position.z))){
      player.position.z=nz;
    }

    const targetYaw=Math.atan2(step.x,step.z);
    const diff=THREE.MathUtils.euclideanModulo(targetYaw-player.rotation.y+Math.PI,Math.PI*2)-Math.PI;
    player.rotation.y+=diff*Math.min(1,dt*12);
  }

  const surfaceY=groundHeightAt(player.position.x,player.position.z);

  if(started){
    // Tiny compatibility queue for platforms that deliver Space slightly late.
    if(jumpRequest && grounded && performance.now()-lastSpaceDown<220){
      performJump();
      jumpRequest=false;
    }else if(jumpRequest && performance.now()-lastSpaceDown>=220){
      jumpRequest=false;
    }

    if(grounded){
      // Terrain traversal is automatic: small road/sidewalk height changes are
      // absorbed as a smooth footstep/step-up animation instead of requiring jump.
      verticalVelocity=0;
      player.position.y=THREE.MathUtils.damp(
        player.position.y,
        surfaceY,
        terrainSnapRate,
        dt
      );
    }else{
      verticalVelocity+=gravity*dt;
      const nextY=player.position.y+verticalVelocity*dt;
      if(nextY<=surfaceY){
        player.position.y=surfaceY;
        verticalVelocity=0;
        grounded=true;
      }else{
        player.position.y=nextY;
        grounded=false;
      }
    }
  }

  const spawnProgress=THREE.MathUtils.clamp((time-spawnTime)/900,0,1);
  const ease=1-Math.pow(1-spawnProgress,3);
  if(characterRoot) characterRoot.scale.setScalar(characterBaseScale);
  spawnRing.scale.setScalar(1.2-.2*ease);
  spawnRing.material.opacity=.72*(1-ease);

  if(mixer) mixer.update(dt);

  const fountain=world.userData.fountain;
  if(fountain){
    const cycle=time*.003;
    fountain.userData.jets.forEach((jet,i)=>{
      const wave=.88+.16*Math.sin(cycle*2.2+i*.9);
      jet.scale.y=wave;
      jet.rotation.z=Math.sin(cycle*1.5+i)*.015;
    });

    fountain.userData.jetDroplets.forEach((item)=>{
      const t=(cycle*1.4+item.phase)%1;
      item.mesh.position.y=2.22-(t*t)*1.72;
      item.mesh.scale.setScalar(.72+.28*Math.sin(Math.PI*t));
      item.mesh.material.opacity=.24+.48*(1-t);
    });

    fountain.userData.ripples.forEach((r,i)=>{
      const t=(cycle*.52+i*.25)%1;
      r.scale.setScalar(.55+t*1.85);
      r.material.opacity=.42*(1-t);
    });

    fountain.userData.coreRing.rotation.z=cycle*.55;
    fountain.userData.waterSurface.rotation.y=cycle*.08;
  }

  if(characterReady){
    if(sprintJump.active){
      const jumpAction=actions.Jump||actions.Run||actions.Idle;
      if(jumpAction) setAction(jumpAction,.06);
      sprintJump.phase=Math.min(1,(performance.now()-sprintJump.timer)/620);
      if(sprintJump.phase>=1 && grounded) sprintJump.active=false;
    }else{
      setAction(moving?(sprint?'Run':'Walk'):'Idle',.15);
    }
  }
}

function getCameraClearDistance(target,desired){
  const offset=desired.clone().sub(target);
  const distance=offset.length();
  if(distance<=1e-4) return 0;

  const direction=offset.normalize();
  cameraRay.origin.copy(target);
  cameraRay.direction.copy(direction);

  let safeDistance=distance;

  for(const c of staticColliders){
    cameraBox.min.set(
      c.x-c.w*.5-cameraCollisionRadius,
      -cameraCollisionRadius,
      c.z-c.d*.5-cameraCollisionRadius
    );
    cameraBox.max.set(
      c.x+c.w*.5+cameraCollisionRadius,
      (Number.isFinite(c.h)?c.h:32)+cameraCollisionRadius,
      c.z+c.d*.5+cameraCollisionRadius
    );

    const hit=cameraRay.intersectBox(cameraBox,cameraHitPoint);
    if(hit){
      const hitDistance=hit.distanceTo(target);
      if(hitDistance>cameraMinClearance){
        safeDistance=Math.min(safeDistance,hitDistance-cameraCollisionSkin);
      }
    }
  }

  return THREE.MathUtils.clamp(safeDistance,cameraMinClearance,distance);
}

function updateCamera(dt){
  const target=new THREE.Vector3(
    player.position.x,
    player.position.y+1.18,
    player.position.z
  );

  const horiz=Math.cos(pitch)*cameraDistance;
  const desired=target.clone().add(new THREE.Vector3(
    Math.sin(yaw)*horiz,
    Math.sin(pitch)*cameraDistance+cameraHeight,
    Math.cos(yaw)*horiz
  ));

  const shoulderRight=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
  desired.addScaledVector(shoulderRight,cameraShoulder*shoulderSide);

  const safeDistance=getCameraClearDistance(target,desired);
  if(safeDistance<desired.distanceTo(target)){
    const fromTarget=desired.clone().sub(target).normalize();
    desired.copy(target).addScaledVector(fromTarget,safeDistance);
  }

  // The ground itself is solid. Prevent the camera body from dropping below
  // the terrain, including when looking almost straight down.
  const floorY=groundHeightAt(desired.x,desired.z)+cameraCollisionRadius;
  if(desired.y<floorY){
    desired.y=floorY;
  }

  camera.position.lerp(desired,1-Math.pow(.001,dt));

  const lookTarget=target.clone().addScaledVector(shoulderRight,cameraAimOffset*shoulderSide);
  camera.lookAt(lookTarget);
}

const clock=new THREE.Clock();
let lastDiagPaint=0;
function animate(){
  requestAnimationFrame(animate);
  const dt=Math.min(clock.getDelta(),.05);
  const now=performance.now();
  updatePlayer(dt,now);
  updateCamera(dt);
  if(now-lastDiagPaint>80){
    updateInputDiagnostics();
    lastDiagPaint=now;
  }
  renderer.render(scene,camera);
}
animate();

addEventListener('resize',()=>{
  camera.aspect=innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);
});

window.__GAME_READY__=true;
window.__GAME_STATE__=()=>({
  ready:true,
  cleanRebuild:true,
  player:{x:player.position.x,y:player.position.y,z:player.position.z},
  grounded,
  characterReady,
  animation:currentAction?currentAction.getClip().name:null,
  characterPosition:characterRoot?characterRoot.position.toArray():null,
  characterScale:characterRoot?characterRoot.scale.toArray():null,
  colliders:staticColliders.length,
  worldChildren:world.children.length,
  webgl2:renderer.capabilities.isWebGL2,
  shoulderSide,
  shoulderLabel:shoulderSide>0?'left':'right'
});