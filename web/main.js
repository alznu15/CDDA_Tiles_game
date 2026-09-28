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
scene.fog = new THREE.Fog(0x8fa9b5, 120, 340);

const camera = new THREE.PerspectiveCamera(67, innerWidth / innerHeight, 0.1, 430);
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
sun.shadow.camera.left = -190;
sun.shadow.camera.right = 190;
sun.shadow.camera.top = 190;
sun.shadow.camera.bottom = -190;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 320;
scene.add(sun);

const world = new THREE.Group();
scene.add(world);
const staticColliders = [];
const walkableSurfaces = [];
const terrainStepHeight = .82;
const terrainSnapRate = 18;

const TEXTURE_CDN='https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/';
const textureLoader=new THREE.TextureLoader();
textureLoader.setCrossOrigin('anonymous');

function bindPBR(material,slug,repeatX=4,repeatY=4,normalScale=.45){
  const load=(suffix,isColor=false)=>{
    const tex=textureLoader.load(
      TEXTURE_CDN+slug+'/'+slug+'_'+suffix+'_1k.jpg',
      ()=>{ material.needsUpdate=true; },
      undefined,
      ()=>{ console.warn('PBR texture failed:',slug,suffix); }
    );
    tex.wrapS=THREE.RepeatWrapping;
    tex.wrapT=THREE.RepeatWrapping;
    tex.repeat.set(repeatX,repeatY);
    const maxAniso=textureLoader.manager ? Math.min(renderer.capabilities.getMaxAnisotropy?.()||1,8) : 1;
    tex.anisotropy=maxAniso;
    if(isColor) tex.colorSpace=THREE.SRGBColorSpace;
    return tex;
  };
  material.map=load('diff',true);
  material.normalMap=load('nor_gl');
  material.roughnessMap=load('rough');
  material.normalScale.set(normalScale,normalScale);
  material.needsUpdate=true;
}

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
  glass:new THREE.MeshPhysicalMaterial({color:0x8dc0d0,roughness:.11,metalness:.16,transparent:true,opacity:.76,transmission:.1,ior:1.45,thickness:.03,clearcoat:.55,clearcoatRoughness:.12}),
  metal:new THREE.MeshStandardMaterial({color:0x657078,roughness:.48,metalness:.65}),
  green:new THREE.MeshStandardMaterial({color:0x2f5536,roughness:1}),
  trunk:new THREE.MeshStandardMaterial({color:0x584536,roughness:1}),
  wood:new THREE.MeshStandardMaterial({color:0x765542,roughness:.82}),
  brick:new THREE.MeshStandardMaterial({color:0x713f34,roughness:.88}),
  stone:new THREE.MeshStandardMaterial({color:0x687174,roughness:.82}),
  hedge:new THREE.MeshStandardMaterial({color:0x31553a,roughness:.94}),
  parkPath:new THREE.MeshStandardMaterial({color:0x737a7c,roughness:.88}),
  door:new THREE.MeshStandardMaterial({color:0x30383d,roughness:.46,metalness:.42})
};

bindPBR(MAT.road,'asphalt_07',7,28,.38);
bindPBR(MAT.curb,'concrete_pavement_02',4,18,.55);
bindPBR(MAT.concrete,'concrete_pavement_03',5,5,.5);
bindPBR(MAT.buildingA,'plastered_wall',5,4,.34);
bindPBR(MAT.buildingB,'exterior_wall_cladding_02',4,4,.42);
bindPBR(MAT.buildingC,'red_brick',5,5,.52);
bindPBR(MAT.roof,'roof_tiles',4,4,.45);
bindPBR(MAT.trunk,'pine_bark',2.2,4.2,.7);
bindPBR(MAT.wood,'wooden_planks',3.5,3.5,.55);
bindPBR(MAT.brick,'red_brick',5,4,.48);
bindPBR(MAT.stone,'stone_pavers',4,4,.55);
bindPBR(MAT.parkPath,'concrete_pavement_03',8,8,.45);

const box = (sx,sy,sz,x,y,z,mat,parent=world) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),mat);
  m.position.set(x,y,z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
};

function collider(x,z,w,d,pad=.7,h=32,passable=null) {
  staticColliders.push({shape:'box',x,z,w:w+pad,d:d+pad,h,passable});
}

function circleCollider(x,z,r,h=32,passable=null) {
  staticColliders.push({shape:'circle',x,z,radius:r,h,passable});
}

function addWalkableSurface(x,z,w,d,height,heightAt=null,contains=null){
  walkableSurfaces.push({x,z,w,d,height,heightAt,contains});
}

function groundHeightAt(x,z){
  let height=0;
  for(const s of walkableSurfaces){
    const inside=s.contains
      ? s.contains(x,z)
      : (Math.abs(x-s.x)<=s.w*.5 && Math.abs(z-s.z)<=s.d*.5);
    if(inside){
      const sample=s.heightAt ? s.heightAt(x,z) : s.height;
      if(sample>height) height=sample;
    }
  }
  return height;
}

function isBlocked(x,z,r=.55) {
  if (x < -176 || x > 176 || z < -176 || z > 176) return true;
  for (const c of staticColliders) {
    if(c.passable && c.passable(x,z)) continue;
    if(c.shape==='circle'){
      const dx=x-c.x;
      const dz=z-c.z;
      if(dx*dx+dz*dz < (c.radius+r)*(c.radius+r)) return true;
    }else if(Math.abs(x-c.x) < c.w*.5+r && Math.abs(z-c.z) < c.d*.5+r){
      return true;
    }
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

  const horizontal=w>d;
  const edge=horizontal
    ? new THREE.Mesh(new THREE.BoxGeometry(w,.12,.08),MAT.metal)
    : new THREE.Mesh(new THREE.BoxGeometry(.08,.12,d),MAT.metal);
  edge.position.set(x,.25,z);
  edge.castShadow=true;
  edge.receiveShadow=true;
  world.add(edge);
}

function addBuilding(x,z,w,d,h,mat){
  const g=new THREE.Group();
  g.position.set(x,0,z);
  world.add(g);

  box(w,h,d,0,h/2,0,mat,g);

  // Mixed facade treatment: every building gets a plinth, corner strips and
  // one secondary material so the district does not read as cloned boxes.
  const accent=mat===MAT.buildingC ? MAT.buildingA :
    (mat===MAT.buildingB ? MAT.wood : MAT.brick);

  box(w+.36,.62,d+.36,0,.31,0,MAT.stone,g);
  box(.28,h-.7,.18,-w/2+.16,h/2, d/2+.04,accent,g);
  box(.28,h-.7,.18,w/2-.16,h/2, d/2+.04,accent,g);

  // Roof fascia.
  box(w+.5,.46,d+.5,0,h+.23,0,MAT.roof,g);

  const frontZ=d/2+.035;
  const backZ=-d/2-.035;
  const rows=Math.max(2,Math.floor(w/4.2));
  const windowRows=h>=10?2:1;

  const frameMat=new THREE.MeshStandardMaterial({
    color:0x253037,
    roughness:.4,
    metalness:.7
  });
  const sillMat=new THREE.MeshStandardMaterial({
    color:0x8d989a,
    roughness:.58,
    metalness:.28
  });
  const doorMat=new THREE.MeshStandardMaterial({
    color:0x30383d,
    roughness:.46,
    metalness:.42
  });
  const darkInsetMat=new THREE.MeshStandardMaterial({
    color:0x13232b,
    roughness:.3,
    metalness:.32
  });

  const addWindow=(px,py,pz,rotY)=>{
    const inset=box(1.96,1.5,.06,px,py,pz,darkInsetMat,g);
    inset.rotation.y=rotY;
    const glass=box(1.72,1.24,.045,px,py,pz-.035,MAT.glass,g);
    glass.rotation.y=rotY;

    const parts=[
      box(1.96,.07,.11,px,py+.69,pz-.065,frameMat,g),
      box(1.96,.07,.11,px,py-.69,pz-.065,frameMat,g),
      box(.07,1.44,.11,px-.945,py,pz-.065,frameMat,g),
      box(.07,1.44,.11,px+.945,py,pz-.065,frameMat,g),
      box(.055,1.23,.08,px,py,pz-.082,frameMat,g),
      box(2.04,.06,.18,px,py-.79,pz-.08,sillMat,g)
    ];
    parts.forEach(o=>o.rotation.y=rotY);
  };

  for(let row=0;row<windowRows;row++){
    const py=windowRows===1?Math.min(h-1.55,h*.62):(row===0?h*.42:h*.70);
    for(let i=0;i<rows;i++){
      const px=-w/2+2.3+i*4.2;
      if(px>w/2-1.4) continue;
      addWindow(px,py,frontZ,0);
      if(i%2===0) addWindow(px,py,backZ,Math.PI);
    }
  }

  // Main entrance with a projecting material break.
  box(Math.min(2.7,w*.22),3.15,.11,0,1.58,frontZ-.06,doorMat,g);
  box(Math.min(3.3,w*.27),.18,.8,0,3.18,frontZ-.35,MAT.wood,g);

  const plaque=new THREE.Mesh(new THREE.BoxGeometry(.72,.42,.035),MAT.metal);
  plaque.position.set(Math.min(w*.32,4),2.15,frontZ-.09);
  plaque.castShadow=true;
  g.add(plaque);

  collider(x,z,w,d,1.2,h);
}

function addTree(x,z,s=1){
  const g=new THREE.Group();
  g.position.set(x,0,z);
  g.scale.setScalar(s);
  world.add(g);

  const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.38,.48,3.7,9),MAT.trunk);
  trunk.position.y=1.85;
  trunk.castShadow=true;
  trunk.receiveShadow=true;
  g.add(trunk);

  for(const [bx,bz,lean] of [[-.34,.02,-.34],[.32,.02,.34],[-.14,.18,-.16],[.12,.2,.14]]){
    const branch=new THREE.Mesh(new THREE.CylinderGeometry(.095,.17,1.9,7),MAT.trunk);
    branch.position.set(bx,3.25,bz);
    branch.rotation.z=lean;
    branch.rotation.x=bz*.55;
    branch.castShadow=true;
    branch.receiveShadow=true;
    g.add(branch);
  }

  const leafMats=[
    new THREE.MeshStandardMaterial({color:0x23482d,roughness:.92}),
    new THREE.MeshStandardMaterial({color:0x315d38,roughness:.94}),
    new THREE.MeshStandardMaterial({color:0x3e6b43,roughness:.94})
  ];
  const crowns=[
    [-.72,4.65,.78,1.45],
    [.74,4.82,.98,1.35],
    [0,5.28,1.15,1.5],
    [-.12,5.9,.7,1.1]
  ];
  crowns.forEach(([cx,cy,cz,sc],i)=>{
    const crown=new THREE.Mesh(new THREE.DodecahedronGeometry(1.65,1),leafMats[i%leafMats.length]);
    crown.position.set(cx,cy,cz);
    crown.scale.set(1.05*sc,1.02*sc,.96*sc);
    crown.castShadow=true;
    crown.receiveShadow=true;
    g.add(crown);
  });

  circleCollider(x,z,1.05*s,4.5);
}

function addParkPathRing(inner,outer,y=.21){
  const mesh=new THREE.Mesh(
    new THREE.RingGeometry(inner,outer,96),
    MAT.parkPath
  );
  mesh.rotation.x=-Math.PI/2;
  mesh.position.y=y;
  mesh.receiveShadow=true;
  world.add(mesh);
  addWalkableSurface(0,0,outer*2,outer*2,y,null,(x,z)=>{
    const r2=x*x+z*z;
    return r2>=inner*inner && r2<=outer*outer;
  });
}

function addParkPath(x,z,w,d,y=.21){
  box(w,.12,d,x,y,z,MAT.parkPath);
  addWalkableSurface(x,z,w,d,y);
}

function addLowWall(x,z,w,d,h=.95,rot=0,mat=MAT.stone){
  const g=new THREE.Group();
  g.position.set(x,h*.5,z);
  g.rotation.y=rot;
  world.add(g);
  box(w,h,d,0,0,0,mat,g);
  collider(x,z,w,d,.08,h);
  return g;
}

function addPlanterCover(x,z,r=.95,h=1.0){
  const planter=new THREE.Mesh(
    new THREE.CylinderGeometry(r,r*1.08,h,16),
    MAT.stone
  );
  planter.position.set(x,h*.5,z);
  planter.castShadow=true;
  planter.receiveShadow=true;
  world.add(planter);
  collider(x,z,r*2.05,r*2.05,.08,h);
  return planter;
}

function addParkBench(x,z,rot=0){
  const g=new THREE.Group();
  g.position.set(x,.28,z);
  g.rotation.y=rot;
  world.add(g);

  box(2.9,.22,.68,0,.2,0,MAT.wood,g);
  box(2.45,.72,.16,0,.54,-.26,MAT.wood,g);
  box(.14,.42,.5,-1.05,-.02,.12,MAT.stone,g);
  box(.14,.42,.5,1.05,-.02,.12,MAT.stone,g);

  const c=Math.cos(rot),s=Math.sin(rot);
  addWalkableSurface(x,z,2.9,.68,.5,null,(px,pz)=>{
    const lx=(px-x)*c+(pz-z)*s;
    const lz=-(px-x)*s+(pz-z)*c;
    return Math.abs(lx)<=1.45 && Math.abs(lz)<=.34;
  });
}

function addHedgeCluster(x,z,sx=2.6,sz=1.4){
  const g=new THREE.Group();
  g.position.set(x,0,z);
  world.add(g);
  for(const [ox,oz,scale] of [
    [-.8,0,.92],[0,.08,1.12],[.85,-.02,.9]
  ]){
    const bush=new THREE.Mesh(new THREE.DodecahedronGeometry(1.2,1),MAT.hedge);
    bush.position.set(ox*sx*.25,1.1,oz*sz*.35);
    bush.scale.set(scale*sx*.5,scale*.9,scale*sz*.5);
    bush.castShadow=true;
    bush.receiveShadow=true;
    g.add(bush);
  }
  // Dense foliage obscures sight but is not a hard projectile wall.
  return g;
}

function addParkPavilion(x,z,rot=0){
  const g=new THREE.Group();
  g.position.set(x,0,z);
  g.rotation.y=rot;
  world.add(g);

  const wood=MAT.wood;
  const stone=MAT.stone;
  const postPositions=[[-2.7,-2.0],[2.7,-2.0],[-2.7,2.0],[2.7,2.0]];
  postPositions.forEach(([px,pz])=>box(.26,2.8,.26,px,1.4,pz,wood,g));
  box(6.1,.24,4.7,0,3.02,0,MAT.roof,g);
  box(5.4,.12,4.05,0,3.15,0,wood,g);

  // Two partial back walls: strong enough for combat cover but open like a real park pavilion.
  box(5.5,1.45,.18,0,.73,1.95,stone,g);
  box(.18,1.2,3.5,-2.65,.6,0,stone,g);
  collider(x,z,5.8,4.1,.1,2.8);
}

function addParkKiosk(x,z,rot=0){
  const g=new THREE.Group();
  g.position.set(x,0,z);
  g.rotation.y=rot;
  world.add(g);
  box(4.2,2.7,3.2,0,1.35,0,MAT.wood,g);
  box(4.5,.25,3.5,0,2.85,0,MAT.roof,g);
  box(2.2,1.1,.12,0,1.55,1.64,MAT.glass,g);
  box(1.2,2.0,.12,-1.45,1.0,1.64,MAT.door,g);
  collider(x,z,4.3,3.3,.08,2.8);
}

function addParkBin(x,z){
  const bin=new THREE.Mesh(new THREE.CylinderGeometry(.28,.34,.8,12),MAT.metal);
  bin.position.set(x,.4,z);
  bin.castShadow=true;
  world.add(bin);
  collider(x,z,.68,.68,.05,.8);
}

function addParkTreeLine(points,s=.88){
  points.forEach(([x,z,scale])=>addTree(x,z,scale||s));
}

function addCentralFountain(){
  const g=new THREE.Group();
  world.add(g);

  const basinMat=new THREE.MeshStandardMaterial({
    color:0x48545a,
    roughness:.42,
    metalness:.42
  });
  const trimMat=new THREE.MeshStandardMaterial({
    color:0xc1d2d6,
    roughness:.24,
    metalness:.62
  });
  const poolMat=new THREE.MeshStandardMaterial({
    color:0x12576d,
    roughness:.12,
    metalness:.08,
    transparent:true,
    opacity:.72,
    depthWrite:false
  });
  const waterMat=new THREE.MeshStandardMaterial({
    color:0xbcefff,
    emissive:0x194e61,
    emissiveIntensity:.35,
    roughness:.08,
    metalness:.03,
    transparent:true,
    opacity:.82,
    depthWrite:false
  });
  const waterBrightMat=new THREE.MeshStandardMaterial({
    color:0xe6fbff,
    emissive:0x2f8197,
    emissiveIntensity:.42,
    roughness:.05,
    metalness:.02,
    transparent:true,
    opacity:.9,
    depthWrite:false
  });
  const glowMat=new THREE.MeshStandardMaterial({
    color:0x72e0f4,
    emissive:0x1b7992,
    emissiveIntensity:1.55,
    roughness:.18,
    metalness:.2
  });

  const base=new THREE.Mesh(
    new THREE.CylinderGeometry(6.05,6.45,.46,48),
    basinMat
  );
  base.position.y=.23;
  base.castShadow=true;
  base.receiveShadow=true;
  g.add(base);

  const lowerTrim=new THREE.Mesh(
    new THREE.TorusGeometry(5.95,.18,10,56),
    trimMat
  );
  lowerTrim.rotation.x=Math.PI/2;
  lowerTrim.position.y=.48;
  lowerTrim.castShadow=true;
  g.add(lowerTrim);

  const pool=new THREE.Mesh(
    new THREE.CylinderGeometry(5.35,5.42,.06,48),
    poolMat
  );
  pool.position.y=.55;
  pool.receiveShadow=true;
  g.add(pool);

  const ring=new THREE.Mesh(
    new THREE.TorusGeometry(5.58,.16,10,56),
    trimMat
  );
  ring.rotation.x=Math.PI/2;
  ring.position.y=.70;
  ring.castShadow=true;
  g.add(ring);

  const pedestal=new THREE.Mesh(
    new THREE.CylinderGeometry(1.18,1.5,1.58,24),
    trimMat
  );
  pedestal.position.y=1.22;
  pedestal.castShadow=true;
  pedestal.receiveShadow=true;
  g.add(pedestal);

  const pedestalGlow=new THREE.Mesh(
    new THREE.TorusGeometry(1.16,.08,8,32),
    glowMat
  );
  pedestalGlow.rotation.x=Math.PI/2;
  pedestalGlow.position.y=1.42;
  g.add(pedestalGlow);


  // Fountain nozzle assembly: a small machined metal outlet makes the
  // particle emitter feel physically anchored to the pedestal.
  const nozzleMat=new THREE.MeshStandardMaterial({
    color:0x39474c,
    roughness:.26,
    metalness:.82
  });
  const nozzleDarkMat=new THREE.MeshStandardMaterial({
    color:0x172126,
    roughness:.2,
    metalness:.68
  });
  const nozzlePlate=new THREE.Mesh(
    new THREE.CylinderGeometry(1.02,1.08,.12,40),
    nozzleMat
  );
  nozzlePlate.position.y=2.06;
  nozzlePlate.castShadow=true;
  nozzlePlate.receiveShadow=true;
  g.add(nozzlePlate);

  const nozzleInset=new THREE.Mesh(
    new THREE.CylinderGeometry(.72,.78,.075,40),
    nozzleDarkMat
  );
  nozzleInset.position.y=2.13;
  g.add(nozzleInset);

  const nozzleLip=new THREE.Mesh(
    new THREE.TorusGeometry(.56,.075,8,36),
    trimMat
  );
  nozzleLip.rotation.x=Math.PI/2;
  nozzleLip.position.y=2.175;
  g.add(nozzleLip);

  const nozzleCore=new THREE.Mesh(
    new THREE.CylinderGeometry(.20,.26,.22,20),
    nozzleDarkMat
  );
  nozzleCore.position.y=2.22;
  nozzleCore.castShadow=true;
  g.add(nozzleCore);

  // Eight tiny radial recesses read as machining/fastener details without
  // competing with the water.
  for(let i=0;i<8;i++){
    const a=i*Math.PI/4;
    const detail=new THREE.Mesh(
      new THREE.BoxGeometry(.18,.026,.055),
      nozzleDarkMat
    );
    detail.position.set(Math.cos(a)*.83,2.128,Math.sin(a)*.83);
    detail.rotation.y=-a;
    g.add(detail);
  }

  // Subtle basin micro-texture: procedurally generated so it remains tiny,
  // stable and cheap while giving the stone/metal surface something to catch
  // the light from the moving water.
  const textureCanvas=document.createElement('canvas');
  textureCanvas.width=128;
  textureCanvas.height=128;
  const textureCtx=textureCanvas.getContext('2d');
  textureCtx.fillStyle='#626c70';
  textureCtx.fillRect(0,0,128,128);
  for(let i=0;i<1700;i++){
    const x=Math.random()*128;
    const y=Math.random()*128;
    const shade=72+Math.floor(Math.random()*58);
    const alpha=.08+Math.random()*.16;
    textureCtx.fillStyle='rgba('+shade+','+(shade+6)+','+(shade+8)+','+alpha.toFixed(3)+')';
    const size=Math.random()*.9+0.2;
    textureCtx.fillRect(x,y,size,size);
  }
  const basinTexture=new THREE.CanvasTexture(textureCanvas);
  basinTexture.wrapS=THREE.RepeatWrapping;
  basinTexture.wrapT=THREE.RepeatWrapping;
  basinTexture.repeat.set(3.5,3.5);
  basinTexture.colorSpace=THREE.SRGBColorSpace;
  basinMat.map=basinTexture;
  basinMat.needsUpdate=true;

  // Keep metal details on the dry fountain structure, not on the water.
  const serviceMat=new THREE.MeshStandardMaterial({
    color:0x4b585d,
    roughness:.24,
    metalness:.8
  });
  for(let i=0;i<8;i++){
    const a=i*Math.PI/4;
    const bolt=new THREE.Mesh(
      new THREE.CylinderGeometry(.07,.07,.035,10),
      serviceMat
    );
    bolt.position.set(Math.cos(a)*5.72,.63,Math.sin(a)*5.72);
    bolt.castShadow=true;
    g.add(bolt);
  }

  // ------------------------------------------------------------
  // Water is particle-only. There is no solid water stream mesh.
  // The visual language follows mature fountain particle systems:
  // emitter -> velocity -> gravity -> lifetime -> respawn.
  // ------------------------------------------------------------
  const dropletGeometry=new THREE.SphereGeometry(1,7,5);

  function createParticleSystem(count,material,config){
    const mesh=new THREE.InstancedMesh(dropletGeometry,material,count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled=false;
    g.add(mesh);

    const positions=new Float32Array(count*3);
    const velocities=new Float32Array(count*3);
    const ages=new Float32Array(count);
    const lives=new Float32Array(count);
    const sizes=new Float32Array(count);
    const seeds=new Float32Array(count*4);
    const dummy=new THREE.Object3D();
    const up=new THREE.Vector3(0,1,0);
    const dir=new THREE.Vector3();

    const system={mesh,positions,velocities,ages,lives,sizes,seeds,dummy,up,dir,config};

    function reset(i,initial=false){
      const v=i*3;
      const s=i*4;
      const a=Math.random()*Math.PI*2;
      const ringBias=Math.random();
      const startR=config.startRadius
        ? config.startRadius[0]+Math.random()*(config.startRadius[1]-config.startRadius[0])
        : 0;

      let x,y,z;
      if(config.spawnMode==='orb'){
        const phi=Math.acos(THREE.MathUtils.randFloatSpread(2));
        const r=.18+Math.random()*.48;
        x=Math.sin(phi)*Math.cos(a)*r;
        y=config.spawnY+(Math.cos(phi)*r*.72);
        z=Math.sin(phi)*Math.sin(a)*r;
      }else if(config.spawnMode==='impact'){
        const r=startR;
        x=Math.cos(a)*r;
        y=config.spawnY+Math.random()*.025;
        z=Math.sin(a)*r;
      }else{
        const r=startR;
        x=Math.cos(a)*r;
        y=config.spawnY+(Math.random()-.5)*config.spawnSpreadY;
        z=Math.sin(a)*r;
      }

      positions[v]=x;
      positions[v+1]=y;
      positions[v+2]=z;

      const speedOut=config.speedOut[0]+Math.random()*(config.speedOut[1]-config.speedOut[0]);
      const speedY=config.speedY[0]+Math.random()*(config.speedY[1]-config.speedY[0]);
      const tangent=(Math.random()-.5)*config.tangent;
      velocities[v]=Math.cos(a)*speedOut + Math.cos(a+Math.PI*.5)*tangent;
      velocities[v+1]=speedY;
      velocities[v+2]=Math.sin(a)*speedOut + Math.sin(a+Math.PI*.5)*tangent;

      ages[i]=initial ? Math.random()*(config.life[0]+(config.life[1]-config.life[0])) : 0;
      lives[i]=config.life[0]+Math.random()*(config.life[1]-config.life[0]);
      sizes[i]=config.size[0]+Math.random()*(config.size[1]-config.size[0]);

      seeds[s]=Math.random();
      seeds[s+1]=Math.random();
      seeds[s+2]=Math.random();
      seeds[s+3]=ringBias;
    }

    for(let i=0;i<count;i++) reset(i,true);

    return {
      system,
      reset,
      update(dt){
        for(let i=0;i<count;i++){
          if(ages[i]>=lives[i]){
            reset(i,false);
          }

          const v=i*3;
          ages[i]+=dt;

          positions[v]+=velocities[v]*dt;
          positions[v+1]+=velocities[v+1]*dt;
          positions[v+2]+=velocities[v+2]*dt;

          velocities[v]+=config.windX*dt;
          velocities[v+1]+=config.gravity*dt;
          velocities[v+2]+=config.windZ*dt;

          const lifeT=THREE.MathUtils.clamp(ages[i]/lives[i],0,1);
          const fadeIn=Math.min(1,ages[i]*14);
          const fadeOut=Math.min(1,(1-lifeT)*10);
          const visibility=fadeIn*fadeOut;

          const vx=velocities[v];
          const vy=velocities[v+1];
          const vz=velocities[v+2];
          const speed=Math.sqrt(vx*vx+vy*vy+vz*vz);
          dir.set(vx,vy,vz);
          if(dir.lengthSq()>1e-6) dir.normalize();

          dummy.position.set(
            positions[v],
            positions[v+1],
            positions[v+2]
          );
          dummy.quaternion.setFromUnitVectors(up,dir);

          const baseSize=sizes[i]*(.72+.28*visibility);
          const stretch=config.stretchBase + Math.min(config.stretchMax, speed*config.stretchSpeed);
          dummy.scale.set(
            baseSize,
            baseSize*stretch,
            baseSize
          );
          dummy.updateMatrix();
          mesh.setMatrixAt(i,dummy.matrix);

          // Kill particles as soon as they visibly reach the pool surface.
          if(config.killBelow!==undefined && positions[v+1]<=config.killBelow){
            ages[i]=lives[i];
          }
        }
        mesh.instanceMatrix.needsUpdate=true;
      }
    };
  }

  // Dense main fountain: large droplets travel on wide ballistic arcs.
  const main=createParticleSystem(
    650,
    waterMat,
    {
      spawnMode:'emitter',
      spawnY:2.18,
      spawnSpreadY:.18,
      startRadius:[.08,.48],
      speedOut:[1.45,2.65],
      speedY:[4.1,5.25],
      tangent:.55,
      gravity:-7.9,
      windX:.035,
      windZ:-.025,
      life:[1.18,1.72],
      size:[.028,.065],
      stretchBase:1.15,
      stretchMax:2.9,
      stretchSpeed:.32,
      killBelow:.62
    }
  );

  // Near-core curtain: this fills the section directly under the water orb
  // so the fountain does not look like isolated bullet points.
  const inner=createParticleSystem(
    360,
    waterBrightMat,
    {
      spawnMode:'orb',
      spawnY:2.16,
      spawnSpreadY:.08,
      startRadius:[.15,.42],
      speedOut:[.25,1.45],
      speedY:[1.4,2.7],
      tangent:.25,
      gravity:-5.7,
      windX:.015,
      windZ:-.01,
      life:[.62,1.05],
      size:[.022,.052],
      stretchBase:1.2,
      stretchMax:3.8,
      stretchSpeed:.38,
      killBelow:.7
    }
  );

  // Impact spray: secondary droplets are emitted from the pool edge where
  // the main arcs arrive, giving the landing point some physical response.
  const splash=createParticleSystem(
    240,
    waterBrightMat,
    {
      spawnMode:'impact',
      spawnY:.62,
      spawnSpreadY:.02,
      startRadius:[2.55,4.65],
      speedOut:[.18,.9],
      speedY:[.35,1.45],
      tangent:.22,
      gravity:-5.2,
      windX:.02,
      windZ:-.015,
      life:[.35,.78],
      size:[.018,.045],
      stretchBase:1.1,
      stretchMax:2.8,
      stretchSpeed:.34,
      killBelow:.53
    }
  );

  // A soft mist layer uses point sprites rather than hard geometric spheres.
  const mistPositions=new Float32Array(150*3);
  const mistPhase=new Float32Array(150);
  const mistGeometry=new THREE.BufferGeometry();
  mistGeometry.setAttribute('position',new THREE.BufferAttribute(mistPositions,3));
  const mistMaterial=new THREE.PointsMaterial({
    color:0xd9f9ff,
    size:.08,
    transparent:true,
    opacity:.23,
    depthWrite:false,
    sizeAttenuation:true,
    blending:THREE.NormalBlending
  });
  const mist=new THREE.Points(mistGeometry,mistMaterial);
  g.add(mist);
  for(let i=0;i<mistPhase.length;i++) mistPhase[i]=Math.random();

  // Particle-only central water "orb": a dense swarm of droplets rather than
  // one obvious glowing ball.
  const orbParticleSystem=createParticleSystem(
    180,
    waterBrightMat,
    {
      spawnMode:'orb',
      spawnY:2.28,
      spawnSpreadY:.04,
      startRadius:[.4,.62],
      speedOut:[0,0],
      speedY:[0,0],
      tangent:0,
      gravity:0,
      windX:0,
      windZ:0,
      life:[999,999],
      size:[.022,.05],
      stretchBase:1,
      stretchMax:1.05,
      stretchSpeed:0,
      killBelow:-999
    }
  );

  // Bottom ripples: readable and deliberately retained.
  const ripples=[];
  for(let i=0;i<7;i++){
    const ripple=new THREE.Mesh(
      new THREE.TorusGeometry(.48+i*.46,.026+i*.002,6,36),
      new THREE.MeshBasicMaterial({
        color:0xbaf5ff,
        transparent:true,
        opacity:.4,
        depthWrite:false,
        side:THREE.DoubleSide
      })
    );
    ripple.rotation.x=Math.PI/2;
    ripple.position.y=.595;
    g.add(ripple);
    ripples.push(ripple);
  }

  // Small impact rings distributed around the landing area.
  const impactRipples=[];
  for(let i=0;i<5;i++){
    const ripple=new THREE.Mesh(
      new THREE.TorusGeometry(.16,.018,5,28),
      new THREE.MeshBasicMaterial({
        color:0xe4fbff,
        transparent:true,
        opacity:.3,
        depthWrite:false,
        side:THREE.DoubleSide
      })
    );
    ripple.rotation.x=Math.PI/2;
    ripple.position.y=.604;
    g.add(ripple);
    impactRipples.push(ripple);
  }

  // Split the fountain into a shallow basin floor and a dry upper rim.
  // The basin floor is below the water surface so the character's feet are
  // visibly submerged instead of standing on top of the water.
  const waterInner=1.62;
  const waterOuter=5.56;
  const rimInner=5.46;
  const rimOuter=6.08;

  addWalkableSurface(
    0,0,waterOuter*2.1,waterOuter*2.1,.48,
    null,
    (x,z)=>{
      const r2=x*x+z*z;
      return r2>=waterInner*waterInner && r2<=waterOuter*waterOuter;
    }
  );

  addWalkableSurface(
    0,0,rimOuter*2.1,rimOuter*2.1,.62,
    null,
    (x,z)=>{
      const r2=x*x+z*z;
      return r2>=rimInner*rimInner && r2<=rimOuter*rimOuter;
    }
  );

  // Only the central structural pedestal blocks the player. Water, particles
  // and the basin itself do not become combat-blocking collision geometry.
  circleCollider(0,0,1.58,3.0,null,true);

  const light=new THREE.PointLight(0x76eaff,2.1,13,2);
  light.position.set(0,2.25,0);
  g.add(light);

  const systems=[main,inner,splash];
  g.userData.waterSystems=systems;
  g.userData.orbSystem=orbParticleSystem;

  g.userData.updateParticles=(dt,time)=>{
    main.update(dt);
    inner.update(dt);
    splash.update(dt);

    // Slowly swirl the central particle mass. It stays tight enough to read
    // as a source of water without becoming a solid sphere.
    const orbSys=orbParticleSystem.system;
    for(let i=0;i<orbSys.mesh.count;i++){
      const v=i*3;
      const seed=orbSys.seeds[i*4];
      const ang=time*.0009*(.65+seed*.35)+seed*Math.PI*2;
      const baseX=orbSys.positions[v];
      const baseY=orbSys.positions[v+1];
      const baseZ=orbSys.positions[v+2];
      const pulse=1+.055*Math.sin(time*.002+seed*7);
      const x=baseX*pulse;
      const z=baseZ*pulse;
      orbSys.positions[v]=x*Math.cos(ang)-z*Math.sin(ang);
      orbSys.positions[v+2]=x*Math.sin(ang)+z*Math.cos(ang);
      orbSys.positions[v+1]=baseY+.04*Math.sin(time*.0025+seed*11);
      orbSys.dummy.position.set(orbSys.positions[v],orbSys.positions[v+1],orbSys.positions[v+2]);
      orbSys.dummy.rotation.set(0,ang,0);
      orbSys.dummy.scale.setScalar(orbSys.sizes[i]);
      orbSys.dummy.updateMatrix();
      orbSys.mesh.setMatrixAt(i,orbSys.dummy.matrix);
    }
    orbSys.mesh.instanceMatrix.needsUpdate=true;

    const mistAttr=mist.geometry.attributes.position;
    for(let i=0;i<mistPhase.length;i++){
      const v=i*3;
      const p=(mistPhase[i]+time*.00022*(.7+(i%5)*.08))%1;
      const a=mistPhase[i]*Math.PI*13.0+time*.00011;
      const r=.35+p*3.85;
      const y=.72 + Math.sin(p*Math.PI)*.55 + (1-p)*.85;
      mistPositions[v]=Math.cos(a)*r;
      mistPositions[v+1]=y;
      mistPositions[v+2]=Math.sin(a)*r;
    }
    mistAttr.needsUpdate=true;

    ripples.forEach((r,i)=>{
      const t=(time*.00036+i*.12)%1;
      r.scale.setScalar(.5+t*1.15);
      r.material.opacity=.42*(1-t)*(i===0?.9:1);
    });

    impactRipples.forEach((r,i)=>{
      const t=(time*.00105+i*.21)%1;
      const a=time*.00015+i*1.256;
      const radius=2.45+(i%3)*.48;
      r.position.x=Math.cos(a)*radius;
      r.position.z=Math.sin(a)*radius;
      r.scale.setScalar(.55+t*.95);
      r.material.opacity=.34*(1-t);
    });
  };

  g.userData.pool=pool;
  g.userData.coreRing=pedestalGlow;
  world.userData.fountain=g;
}

function addPlazaFurniture(){
  return; // superseded by the park-specific furniture pass
  /*
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
    const c=Math.cos(rot);
    const sn=Math.sin(rot);
    addWalkableSurface(
      x,z,3.4,0.7,.50,
      null,
      (px,pz)=>{
        const lx=(px-x)*c+(pz-z)*sn;
        const lz=-(px-x)*sn+(pz-z)*c;
        return Math.abs(lx)<=1.7 && Math.abs(lz)<=.35;
      }
    );
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
  */
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
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(360,360),MAT.grass);
  ground.rotation.x=-Math.PI/2;
  ground.receiveShadow=true;
  world.add(ground);

  box(300,.08,300,0,-.05,0,MAT.soil);

  // ------------------------------------------------------------
  // CITY PARK DISTRICT
  // 360m x 360m tactical sandbox.
  // Central park: ~150m square.
  // Ring road: 16m wide around the park.
  // Outer district: mixed-use buildings and secondary streets.
  // ------------------------------------------------------------
  addRoad(0,-84,190,16);
  addRoad(0,84,190,16);
  addRoad(-84,0,16,190);
  addRoad(84,0,16,190);

  // Outer city streets create a second rotation layer without cutting through
  // the park itself.
  addRoad(-138,0,14,300);
  addRoad(138,0,14,300);
  addRoad(0,-138,300,14);
  addRoad(0,138,300,14);

  // Sidewalks follow both park and outer road rings.
  addSidewalk(0,-74,164,4.5);
  addSidewalk(0,74,164,4.5);
  addSidewalk(-74,0,4.5,164);
  addSidewalk(74,0,4.5,164);
  addSidewalk(0,-128,300,4);
  addSidewalk(0,128,300,4);
  addSidewalk(-128,0,4,300);
  addSidewalk(128,0,4,300);

  // Four short pedestrian entries into the park.
  addParkPath(0,-60,9,28,.19);
  addParkPath(0,60,9,28,.19);
  addParkPath(-60,0,28,9,.19);
  addParkPath(60,0,28,9,.19);

  // Four broad pedestrian crossings connect the park gates to the ring road.
  for(const [cx,cz,horizontal] of [[0,-84,true],[0,84,true],[-84,0,false],[84,0,false]]){
    for(let i=-4;i<=4;i++){
      if(horizontal) box(1.6,.014,.55,cx+i*2,cz,7.0<8?MAT.white:MAT.white);
      else box(.55,.014,1.6,cx,cz+i*2,MAT.white);
    }
  }

  // Core circulation: an inner ring and an outer ring.
  addParkPathRing(20,27,.2);
  addParkPathRing(52,61,.2);

  // Central cross lanes connect the rings through the fountain zone.
  addParkPath(-10,0,20,80,.2);
  addParkPath(10,0,20,80,.2);
  addParkPath(0,-10,80,20,.2);
  addParkPath(0,10,80,20,.2);

  // Buildings around the park perimeter: deliberately varied footprint,
  // facade material and height to create multiple believable sightline blocks.
  const buildings=[
    [-108,-107,28,18,9,MAT.buildingA],[-62,-108,32,20,12,MAT.buildingC],
    [-14,-108,28,18,8,MAT.buildingB],[38,-108,34,20,11,MAT.buildingA],
    [92,-106,26,19,10,MAT.buildingC],
    [-108,106,30,20,11,MAT.buildingB],[-58,108,30,18,9,MAT.buildingA],
    [-10,108,26,20,12,MAT.buildingC],[38,108,34,18,10,MAT.buildingB],
    [94,106,28,20,9,MAT.buildingA],
    [-107,-60,20,28,10,MAT.buildingC],[-108,4,18,30,8,MAT.buildingA],
    [-108,62,22,26,12,MAT.buildingB],
    [108,-62,22,26,12,MAT.buildingA],[108,3,18,30,9,MAT.buildingC],
    [108,64,24,27,11,MAT.buildingB],
    [-155,-74,18,24,9,MAT.buildingB],[155,74,18,24,9,MAT.buildingC]
  ];
  buildings.forEach(([x,z,w,d,h,mat])=>addBuilding(x,z,w,d,h,mat));

  // Park edge vegetation creates soft sightline breaks while preserving lanes.
  for(const p of [
    [-62,-48],[-42,-48],[-22,-48],[22,-48],[42,-48],[62,-48],
    [-62,48],[-42,48],[-22,48],[22,48],[42,48],[62,48],
    [-48,-62],[-24,-62],[24,-62],[48,-62],
    [-48,62],[-24,62],[24,62],[48,62]
  ]) addHedgeCluster(p[0],p[1],2.2,1.25);

  // Four pavilions become secondary combat anchors and real park amenities.
  addParkPavilion(-44,-44,0);
  addParkPavilion(44,-44,Math.PI/2);
  addParkPavilion(-44,44,-Math.PI/2);
  addParkPavilion(44,44,Math.PI);

  // Two believable service kiosks near the park perimeter.
  addParkKiosk(-58,0,Math.PI/2);
  addParkKiosk(58,0,-Math.PI/2);

  // Layered hard cover: low planters are partial cover; longer stone walls
  // form stronger sightline breaks; neither blocks the entire map.
  for(const [x,z] of [
    [-30,-30],[30,-30],[-30,30],[30,30],
    [-56,-18],[56,18],[-56,18],[56,-18]
  ]) addPlanterCover(x,z,.95,1.0);

  addLowWall(-18,-41,18,.8,1.15,0,MAT.stone);
  addLowWall(18,41,18,.8,1.15,0,MAT.stone);
  addLowWall(-41,18,.8,18,1.15,0,MAT.stone);
  addLowWall(41,-18,.8,18,1.15,0,MAT.stone);

  // Benches align with circulation rather than appearing as arbitrary cover.
  for(const [x,z,r] of [
    [-18,-25,0],[18,-25,Math.PI],[25,-18,Math.PI/2],[-25,18,-Math.PI/2],
    [18,25,Math.PI],[ -18,25,0],[25,18,Math.PI/2],[-25,-18,-Math.PI/2]
  ]) addParkBench(x,z,r);

  // Small bins and plausible park furniture.
  for(const [x,z] of [[-13,-44],[13,-44],[-44,-13],[44,13],[-13,44],[13,44],[44,-13],[-44,13]]){
    addParkBin(x,z);
  }

  // Stronger tree composition: clusters at the park edges and a few open-lane trees.
  addParkTreeLine([
    [-68,-68,1.0],[-48,-70,.92],[-24,-69,.88],[24,-69,.9],[48,-70,.95],[68,-68,1.0],
    [-68,68,.96],[-46,70,.92],[-22,69,.9],[24,69,.92],[48,70,.98],[68,68,1.0],
    [-70,-24,.96],[-70,24,1.0],[70,-24,.92],[70,24,.98]
  ]);

  // A few isolated canopy anchors inside the park. Their spacing deliberately
  // leaves readable combat lanes between them.
  addTree(-30,-4,.86);
  addTree(30,4,.9);
  addTree(-4,30,.88);
  addTree(4,-30,.86);

  // Central landmark stays exactly where the whole layout can orient around it.
  addCentralFountain();

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

  const points=[
    [-74,-72],[-24,-72],[24,-72],[74,-72],
    [-74,72],[-24,72],[24,72],[74,72],
    [-72,-74],[-72,-24],[-72,24],[-72,74],
    [72,-74],[72,-24],[72,24],[72,74],
    [-132,-108],[-132,108],[132,-108],[132,108]
  ];

  for(const p of points){
    const g=template.clone(true);
    const box3=new THREE.Box3().setFromObject(g);
    const h=box3.max.y-box3.min.y;
    if(h>0) g.scale.multiplyScalar(6.2/h);
    g.position.set(p[0],0,p[1]);
    world.add(g);
  }
}

const player = new THREE.Group();
player.position.set(0,0,142);
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
    fountain.userData.updateParticles(dt, time);
    fountain.userData.coreRing.rotation.z=time*.00055;
    fountain.userData.pool.rotation.y=time*.00005;
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
    const halfW=c.shape==='circle' ? c.radius : c.w*.5;
    const halfD=c.shape==='circle' ? c.radius : c.d*.5;
    cameraBox.min.set(
      c.x-halfW-cameraCollisionRadius,
      -cameraCollisionRadius,
      c.z-halfD-cameraCollisionRadius
    );
    cameraBox.max.set(
      c.x+halfW+cameraCollisionRadius,
      (Number.isFinite(c.h)?c.h:32)+cameraCollisionRadius,
      c.z+halfD+cameraCollisionRadius
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