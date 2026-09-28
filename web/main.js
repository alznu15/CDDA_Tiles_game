// Load the 3D engine defensively. A CDN failure must never leave the boot screen
// silently stuck at "Preparing scene…".
let THREE = null;
let GLTFLoader = null;
let OBJLoader = null;
let MTLLoader = null;
const engineSources = [
  {
    three: 'https://cdn.jsdelivr.net/npm/three@0.186.0/build/three.module.js',
    loader: 'https://cdn.jsdelivr.net/npm/three@0.186.0/examples/jsm/loaders/GLTFLoader.js',
    objLoader: 'https://cdn.jsdelivr.net/npm/three@0.186.0/examples/jsm/loaders/OBJLoader.js',
    mtlLoader: 'https://cdn.jsdelivr.net/npm/three@0.186.0/examples/jsm/loaders/MTLLoader.js'
  },
  {
    three: 'https://unpkg.com/three@0.186.0/build/three.module.js',
    loader: 'https://unpkg.com/three@0.186.0/examples/jsm/loaders/GLTFLoader.js?module',
    objLoader: 'https://unpkg.com/three@0.186.0/examples/jsm/loaders/OBJLoader.js?module',
    mtlLoader: 'https://unpkg.com/three@0.186.0/examples/jsm/loaders/MTLLoader.js?module'
  },
  {
    three: 'https://esm.sh/three@0.186.0?bundle',
    loader: 'https://esm.sh/three@0.186.0/examples/jsm/loaders/GLTFLoader.js?bundle',
    objLoader: 'https://esm.sh/three@0.186.0/examples/jsm/loaders/OBJLoader.js?bundle',
    mtlLoader: 'https://esm.sh/three@0.186.0/examples/jsm/loaders/MTLLoader.js?bundle'
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
      try{
        const objModule = await import(source.objLoader);
        OBJLoader = objModule.OBJLoader || null;
      }catch(objError){
        console.warn('Optional OBJLoader source failed:', source.objLoader, objError);
      }
      try{
        const mtlModule = await import(source.mtlLoader);
        MTLLoader = mtlModule.MTLLoader || null;
      }catch(mtlError){
        console.warn('Optional MTLLoader source failed:', source.mtlLoader, mtlError);
      }
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
renderer.toneMappingExposure = 1.12;
document.body.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xd9efff, 0x304139, 1.65));
const sun = new THREE.DirectionalLight(0xffe7c2, 2.55);
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
  glass:new THREE.MeshPhysicalMaterial({color:0x72b9d8,roughness:.10,metalness:.20,transparent:true,opacity:.76,transmission:.1,ior:1.45,thickness:.03,clearcoat:.55,clearcoatRoughness:.12}),
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

bindPBR(MAT.grass,'grass_ground',18,18,.34);
bindPBR(MAT.soil,'park_dirt',9,9,.48);
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

function collider(x,z,w,d,pad=.7,h=32,passable=null,walkableTop=false,jumpable=false,baseY=0,surfaceHeight=null) {
  staticColliders.push({
    shape:'box',x,z,w:w+pad,d:d+pad,h,baseY,
    passable,walkableTop,jumpable,surfaceHeight
  });
}

function orientedCollider(x,z,w,d,h,rot=0,pad=.08,passable=null,walkableTop=false,jumpable=false,baseY=0,surfaceHeight=null){
  const quarter=Math.abs(Math.sin(rot))>.5;
  staticColliders.push({
    shape:'box',
    x,z,
    w:(quarter?d:w)+pad,
    d:(quarter?w:d)+pad,
    h,
    baseY,
    passable,
    walkableTop,
    jumpable,
    surfaceHeight
  });
}

function circleCollider(x,z,r,h=32,passable=null,walkableTop=false,jumpable=false,baseY=0,surfaceHeight=null) {
  staticColliders.push({
    shape:'circle',x,z,radius:r,h,baseY,
    passable,walkableTop,jumpable,surfaceHeight
  });
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

const playerBodyHeight=1.9;
const jumpClearance=.10;

function isBlocked(x,z,r=.55,feetY=0,airborne=false) {
  if (x < -176 || x > 176 || z < -176 || z > 176) return true;
  const bodyBottom=feetY;
  const bodyTop=feetY+playerBodyHeight;

  for(const c of staticColliders){
    if(c.passable && c.passable(x,z)) continue;

    const baseY=Number.isFinite(c.baseY) ? c.baseY : 0;
    const topY=baseY+(Number.isFinite(c.h)?c.h:32);
    if(bodyTop <= baseY+.02 || bodyBottom >= topY-.02) continue;
    if(airborne && c.jumpable && bodyBottom >= topY-jumpClearance) continue;

    if(c.shape==='circle'){
      const dx=x-c.x,dz=z-c.z;
      if(dx*dx+dz*dz < (c.radius+r)*(c.radius+r)) return true;
    }else if(Math.abs(x-c.x) < c.w*.5+r && Math.abs(z-c.z) < c.d*.5+r){
      return true;
    }
  }
  return false;
}

function topSurfaceAt(x,z){
  let top=0;
  for(const c of staticColliders){
    if(!c.walkableTop) continue;
    const surface=Number.isFinite(c.surfaceHeight)
      ? c.surfaceHeight
      : (Number.isFinite(c.baseY)?c.baseY:0)+(Number.isFinite(c.h)?c.h:32);

    if(c.shape==='circle'){
      const dx=x-c.x,dz=z-c.z;
      if(dx*dx+dz*dz <= c.radius*c.radius) top=Math.max(top,surface);
    }else if(Math.abs(x-c.x)<=c.w*.5+playerRadius && Math.abs(z-c.z)<=c.d*.5+playerRadius){
      top=Math.max(top,surface);
    }
  }
  return top;
}

function canTraverseTo(x,z,fromGround,feetY=0,airborne=false){
  if(isBlocked(x,z,playerRadius,feetY,airborne)) return false;
  return Math.abs(groundHeightAt(x,z)-fromGround)<=terrainStepHeight;
}

function resolvePlayerPenetration(){
  for(let pass=0;pass<4;pass++){
    let moved=false;
    const feetY=player.position.y;
    const bodyTop=feetY+playerBodyHeight;

    for(const c of staticColliders){
      if(c.passable && c.passable(player.position.x,player.position.z)) continue;
      const surface=Number.isFinite(c.surfaceHeight)
        ? c.surfaceHeight
        : (Number.isFinite(c.baseY)?c.baseY:0)+(Number.isFinite(c.h)?c.h:32);

      if(c.walkableTop && feetY>=surface-.08) continue;

      const baseY=Number.isFinite(c.baseY) ? c.baseY : 0;
      const topY=baseY+(Number.isFinite(c.h)?c.h:32);
      if(bodyTop <= baseY+.02 || feetY >= topY-.02) continue;

      if(c.shape==='circle'){
        const dx=player.position.x-c.x,dz=player.position.z-c.z;
        const minDist=c.radius+playerRadius;
        const distSq=dx*dx+dz*dz;
        if(distSq<minDist*minDist){
          const dist=Math.sqrt(distSq);
          if(dist<.0001) player.position.x+=minDist+.012;
          else{
            const push=(minDist-dist)+.012;
            player.position.x+=(dx/dist)*push;
            player.position.z+=(dz/dist)*push;
          }
          moved=true;
        }
      }else{
        const dx=player.position.x-c.x,dz=player.position.z-c.z;
        const overlapX=(c.w*.5+playerRadius)-Math.abs(dx);
        const overlapZ=(c.d*.5+playerRadius)-Math.abs(dz);
        if(overlapX>0 && overlapZ>0){
          if(overlapX<overlapZ) player.position.x+=(dx>=0?1:-1)*(overlapX+.012);
          else player.position.z+=(dz>=0?1:-1)*(overlapZ+.012);
          moved=true;
        }
      }
    }
    if(!moved) break;
  }
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
    ? new THREE.Mesh(new THREE.BoxGeometry(w,.12,.08),MAT.stone)
    : new THREE.Mesh(new THREE.BoxGeometry(.08,.12,d),MAT.stone);
  edge.position.set(
    horizontal ? x : x + Math.sign(x||1)*w*.5,
    .25,
    horizontal ? z + Math.sign(z||1)*d*.5 : z
  );
  edge.castShadow=true;
  edge.receiveShadow=true;
  world.add(edge);
}

function facadeWearMaterial(baseMat,seed){
  const mat=baseMat.clone();
  const canvas=document.createElement('canvas');
  canvas.width=256; canvas.height=256;
  const ctx=canvas.getContext('2d');
  const base=baseMat.color.getHexString();
  ctx.fillStyle='#'+base;
  ctx.fillRect(0,0,256,256);

  // Subtle paint variation: broad faded areas + tiny scratches, not decorative stripes.
  let s=Math.abs(Math.floor(seed*1000003))>>>0;
  const rnd=()=>{ s=(s*1664525+1013904223)>>>0; return s/4294967296; };
  for(let i=0;i<34;i++){
    const x=rnd()*256, y=rnd()*256;
    const w=10+rnd()*58, h=3+rnd()*18;
    const light=rnd()>.5;
    const a=.035+rnd()*.07;
    ctx.fillStyle=light?('rgba(255,255,255,'+a+')'):('rgba(25,25,25,'+a+')');
    ctx.fillRect(x,y,w,h);
  }
  for(let i=0;i<46;i++){
    const x=rnd()*256, y=rnd()*256;
    ctx.strokeStyle='rgba(35,35,35,'+(0.035+rnd()*.075)+')';
    ctx.lineWidth=.4+rnd()*1.2;
    ctx.beginPath();
    ctx.moveTo(x,y);
    ctx.lineTo(x+3+rnd()*16,y+(rnd()-.5)*2);
    ctx.stroke();
  }
  const tex=new THREE.CanvasTexture(canvas);
  tex.wrapS=THREE.RepeatWrapping;
  tex.wrapT=THREE.RepeatWrapping;
  tex.repeat.set(1,1);
  tex.colorSpace=THREE.SRGBColorSpace;
  mat.map=tex;
  mat.needsUpdate=true;
  return mat;
}

function addBuildingWeather(g,w,d,h,frontZ,seed){
  const rand=()=>{
    const v=Math.sin(seed*12.9898)*43758.5453;
    seed=v-Math.floor(v);
    return seed;
  };
  const makeWearCanvas=()=>{
    const c=document.createElement('canvas');
    c.width=256;c.height=256;
    const ctx=c.getContext('2d');
    ctx.clearRect(0,0,256,256);
    for(let i=0;i<18;i++){
      const x=rand()*256,y=rand()*256;
      const len=10+rand()*75;
      const width=.5+rand()*2.8;
      ctx.strokeStyle='rgba(44,38,32,'+(0.12+rand()*.16).toFixed(3)+')';
      ctx.lineWidth=width;
      ctx.beginPath();ctx.moveTo(x,y);
      ctx.lineTo(x+len*(.4+rand()*.6),y-8+rand()*34);
      ctx.stroke();
    }
    for(let i=0;i<11;i++){
      const x=rand()*256,y=rand()*256,r=3+rand()*12;
      ctx.fillStyle='rgba(103,87,67,'+(0.06+rand()*.12).toFixed(3)+')';
      ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
    }
    return new THREE.CanvasTexture(c);
  };
  const front=new THREE.Mesh(
    new THREE.PlaneGeometry(Math.max(2,w-1),Math.max(2,h-1.1)),
    new THREE.MeshStandardMaterial({map:makeWearCanvas(),transparent:true,opacity:.5,roughness:.96,depthWrite:false})
  );
  front.position.set(0,h*.52,frontZ+.012);
  g.add(front);

  const side=new THREE.Mesh(
    new THREE.PlaneGeometry(Math.max(2,d-1),Math.max(2,h-1.1)),
    new THREE.MeshStandardMaterial({map:makeWearCanvas(),transparent:true,opacity:.38,roughness:.98,depthWrite:false})
  );
  side.rotation.y=Math.PI/2;
  side.position.set(w*.5+.012,h*.52,0);
  g.add(side);
}

function addBuilding(x,z,w,d,h,mat){
  const g=new THREE.Group();
  g.position.set(x,0,z);
  world.add(g);

  const facadeMat=facadeWearMaterial(mat,x*0.73+z*1.17+w*2.1+d*.37);
  box(w,h,d,0,h/2,0,facadeMat,g);

  // Mixed-material base without artificial T-shaped strips.
  const accent=mat===MAT.buildingC ? MAT.buildingA :
    (mat===MAT.buildingB ? MAT.wood : MAT.brick);
  box(w+.36,.62,d+.36,0,.31,0,MAT.stone,g);

  const frontZ=d/2+.035;
  const backZ=-d/2-.035;

  // Gable roof: two correctly-sized halves meet at a real center ridge.
  const styleIndex=Math.abs(Math.round(x*.13+z*.07))%3;
  let roofTop=h+.47;
  if(styleIndex===1){
    const roofRun=(d*.5)+.34;
    const roofAngle=THREE.MathUtils.degToRad(15);
    const rise=Math.tan(roofAngle)*roofRun;
    const roofSlopeLength=Math.hypot(roofRun,rise);
    const roofY=h+(rise*.5)+.05;
    const roofA=box(w+.62,.30,roofSlopeLength,0,roofY,roofRun*.5,MAT.roof,g);
    const roofB=box(w+.62,.30,roofSlopeLength,0,roofY,-roofRun*.5,MAT.roof,g);
    roofA.rotation.x=roofAngle;
    roofB.rotation.x=-roofAngle;
    box(w+.70,.16,.24,0,h+rise+.06,0,MAT.roof,g);
    roofTop=h+rise+.20;

    const makeGableEnd=(z)=>{
      const t=.055;
      const verts=new Float32Array([
        -w*.5,h,z-t, w*.5,h,z-t, 0,h+rise,z-t,
        -w*.5,h,z+t, w*.5,h,z+t, 0,h+rise,z+t
      ]);
      const geom=new THREE.BufferGeometry();
      geom.setAttribute('position',new THREE.BufferAttribute(verts,3));
      geom.setIndex([0,1,2,5,4,3,0,3,4,0,4,1,1,4,5,1,5,2,2,5,3,2,3,0]);
      geom.computeVertexNormals();
      const cap=new THREE.Mesh(geom,facadeMat.clone());
      cap.material.side=THREE.DoubleSide;
      cap.castShadow=true;
      cap.receiveShadow=true;
      g.add(cap);
    };
    makeGableEnd(frontZ);
    makeGableEnd(backZ);
  }else if(styleIndex===2){
    box(w+.5,.46,d+.5,0,h+.23,0,MAT.roof,g);
    box(Math.min(4.8,w*.42),.18,.9,0,h+.58,frontZ-.35,MAT.wood,g);
  }else{
    box(w+.5,.46,d+.5,0,h+.23,0,MAT.roof,g);
  }

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

  collider(x,z,w,d,.18,roofTop);
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
  collider(x,z,w,d,.08,h,null,false,true);
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
  collider(x,z,r*2.05,r*2.05,.08,h,null,false,true);
  return planter;
}

function addParkBench(x,z,rot=0){
  const g=new THREE.Group();
  g.position.set(x,.28,z);
  g.rotation.y=rot;
  world.add(g);

  box(4.5,.28,.92,0,.22,0,MAT.wood,g);
  box(3.75,.92,.18,0,.58,-.35,MAT.wood,g);
  {
    const c=Math.cos(rot),s=Math.sin(rot);
    const bx=x+0.35*s, bz=z-0.35*c;
    orientedCollider(bx,bz,3.75,.18,.92,rot,.06);
  }
  box(.16,.55,.64,-1.55,-.02,.16,MAT.stone,g);
  box(.16,.55,.64,1.55,-.02,.16,MAT.stone,g);

  const c=Math.cos(rot),s=Math.sin(rot);
  const toWorld=(lx,lz)=>[x+lx*c-lz*s,z+lx*s+lz*c];
  const [seatX,seatZ]=toWorld(0,0);
  orientedCollider(seatX,seatZ,4.5,.92,.04,rot,.05,null,true,false,.64,.64);
  const [backX,backZ]=toWorld(0,-.35);
  orientedCollider(backX,backZ,3.75,.18,.92,rot,.05,null,false,true);
  addWalkableSurface(x,z,4.5,.92,.64,null,(px,pz)=>{
    const lx=(px-x)*c+(pz-z)*s;
    const lz=-(px-x)*s+(pz-z)*c;
    return Math.abs(lx)<=2.25 && Math.abs(lz)<=.46;
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
  circleCollider(x,z,Math.max(sx,sz)*.48,1.72,null,false,true);
  return g;
}

function addParkPavilion(x,z,rot=0){
  const g=new THREE.Group();
  g.position.set(x,0,z);
  g.rotation.y=rot;
  world.add(g);

  const wood=MAT.wood;
  const stone=MAT.stone;
  const c=Math.cos(rot),s=Math.sin(rot);
  const toWorld=(lx,lz)=>[x+lx*c-lz*s,z+lx*s+lz*c];

  for(const [px,pz] of [[-2.7,-2.0],[2.7,-2.0],[-2.7,2.0],[2.7,2.0]]){
    box(.34,3.0,.34,px,1.5,pz,wood,g);
    const [wx,wz]=toWorld(px,pz);
    orientedCollider(wx,wz,.34,.34,3.0,rot,.05);
  }

  box(6.35,.28,4.95,0,3.05,0,MAT.roof,g);
  box(5.85,.14,4.45,0,3.22,0,wood,g);
  collider(x,z,6.35,4.95,.05,.28,null,false,false,2.91,3.19);
  collider(x,z,5.85,4.45,.04,.14,null,false,false,3.15,3.29);

  // Connected beams visually tie the roof to the posts.
  box(5.95,.22,.26,0,2.84,-2.18,wood,g);
  box(5.95,.22,.26,0,2.84,2.18,wood,g);
  box(.26,.22,4.55,-2.92,2.84,0,wood,g);
  box(.26,.22,4.55,2.92,2.84,0,wood,g);
  collider(x,z-2.18,5.95,.26,.04,.22,null,false,false,2.73,2.95);
  collider(x,z+2.18,5.95,.26,.04,.22,null,false,false,2.73,2.95);
  {
    const [lx,lz]=toWorld(-2.92,0);
    const [rx,rz]=toWorld(2.92,0);
    orientedCollider(lx,lz,.26,4.55,.22,rot,.04,null,false,false,2.73,2.95);
    orientedCollider(rx,rz,.26,4.55,.22,rot,.04,null,false,false,2.73,2.95);
  }

  // Two partial walls create useful cover while leaving the pavilion enterable.
  box(5.55,1.55,.20,0,.775,1.98,stone,g);
  box(.20,1.25,3.55,-2.68,.625,0,stone,g);
  const [bx,bz]=toWorld(0,1.98);
  orientedCollider(bx,bz,5.55,.20,1.55,rot,.05,null,false,true);
  const [sx,sz]=toWorld(-2.68,0);
  orientedCollider(sx,sz,.20,3.55,1.25,rot,.05,null,false,true);
}
function addParkKiosk(x,z,rot=0){
  const g=new THREE.Group();
  g.position.set(x,0,z);
  g.rotation.y=rot;
  world.add(g);

  const c=Math.cos(rot),s=Math.sin(rot);
  const toWorld=(lx,lz)=>[x+lx*c-lz*s,z+lx*s+lz*c];

  // Back wall + two side walls leave the front open.
  box(4.35,2.85,.20,0,1.425,-1.52,MAT.wood,g);
  box(.20,2.5,3.05,-2.08,1.25,0,MAT.wood,g);
  box(.20,2.5,3.05,2.08,1.25,0,MAT.wood,g);

  // Roof and connected fascia.
  box(4.6,.24,3.55,0,2.93,0,MAT.roof,g);
  box(4.25,.14,3.18,0,3.11,0,MAT.wood,g);
  const [roofX,roofZ]=toWorld(0,0);
  orientedCollider(roofX,roofZ,4.6,3.55,.24,rot,.05,null,false,false,2.81,3.05);
  box(4.35,.18,.24,0,2.73,-1.6,MAT.wood,g);
  box(.24,.18,3.15,-2.18,2.73,0,MAT.wood,g);
  box(.24,.18,3.15,2.18,2.73,0,MAT.wood,g);

  // Front service counter with a clear standing gap.
  box(3.55,.68,.42,0,1.08,1.38,MAT.stone,g);
  const [counterX,counterZ]=toWorld(0,1.38);
  orientedCollider(counterX,counterZ,3.55,.42,.68,rot,.05,null,true,false,.74,1.42);
  box(3.6,.16,.14,0,2.35,1.38,MAT.wood,g);
  box(.22,2.65,.22,-1.85,1.325,1.35,MAT.wood,g);
  box(.22,2.65,.22,1.85,1.325,1.35,MAT.wood,g);

  let [wx,wz]=toWorld(0,-1.52);
  orientedCollider(wx,wz,4.35,.20,2.85,rot,.05);
  [ [-2.08,0,.20,3.05,2.5], [2.08,0,.20,3.05,2.5] ].forEach(([lx,lz,w,d,h])=>{
    const [px,pz]=toWorld(lx,lz);
    orientedCollider(px,pz,w,d,h,rot,.05);
  });
  [ [-1.85,1.35], [1.85,1.35] ].forEach(([lx,lz])=>{
    const [px,pz]=toWorld(lx,lz);
    orientedCollider(px,pz,.24,.24,2.65,rot,.05);
  });
}
function addParkBin(x,z){
  const bin=new THREE.Mesh(new THREE.CylinderGeometry(.28,.34,.8,12),MAT.metal);
  bin.position.set(x,.4,z);
  bin.castShadow=true;
  world.add(bin);
  collider(x,z,.68,.68,.05,.8,null,false,true);
}

function addParkTreeLine(points,s=.88){
  points.forEach(([x,z,scale])=>addTree(x,z,scale||s));
}

function addPlayground(x,z,rot=0){
  const g=new THREE.Group();
  g.position.set(x,0,z);
  g.rotation.y=rot;
  world.add(g);

  // Soft dirt/rubber play surface.
  const pad=new THREE.Mesh(new THREE.CylinderGeometry(10.5,10.5,.08,32),MAT.parkPath);
  pad.scale.z=.72;
  pad.position.y=.04;
  pad.receiveShadow=true;
  g.add(pad);

  // Low perimeter fence: explicitly jumpable.
  const fenceH=.82, fenceW=12.5, fenceD=8.5;
  const fenceParts=[
    [0,fenceD/2,.16,fenceW,.82],
    [0,-fenceD/2,.16,fenceW,.82],
    [-fenceW/2,0,.16,fenceD,.82],
    [fenceW/2,0,.16,fenceD,.82]
  ];
  fenceParts.forEach(([px,pz,th,w,h],i)=>{
    const m=box(w,h,th,px,h/2,pz,MAT.wood,g);
    const c=Math.cos(rot),s=Math.sin(rot);
    const wx=x+px*c-pz*s,wz=z+px*s+pz*c;
    orientedCollider(wx,wz,w,th,h,rot,.05,null,false,true);
  });

  // Sandbox with a thick wooden rim.
  box(5.6,.45,.28,0,.225,1.2,MAT.wood,g);
  box(5.6,.45,.28,0,.225,-1.2,MAT.wood,g);
  box(.28,.45,2.15,-2.8,.225,0,MAT.wood,g);
  box(.28,.45,2.15,2.8,.225,0,MAT.wood,g);
  {
    const c=Math.cos(rot),s=Math.sin(rot);
    const wp=(lx,lz)=>[x+lx*c-lz*s,z+lx*s+lz*c];
    for(const [lx,lz,w,d] of [[0,1.2,5.6,.28],[0,-1.2,5.6,.28],[-2.8,0,.28,2.15],[2.8,0,.28,2.15]]){
      const [px,pz]=wp(lx,lz);
      orientedCollider(px,pz,w,d,.45,rot,.04,null,false,true);
    }
  }

  // Swing frame: connected top beam + four legs, not floating pieces.
  const swingY=3.0;
  box(7.0,.24,.24,0,swingY,0,MAT.metal,g);
  orientedCollider(x,z,7.0,.24,.24,rot,.04,null,false,false,swingY-.12,swingY+.12);
  for(const px of [-3.1,3.1]){
    box(.24,swingY,.24,px,swingY/2,-.95,MAT.metal,g);
    box(.24,swingY,.24,px,swingY/2,.95,MAT.metal,g);
    const c=Math.cos(rot),s=Math.sin(rot);
    for(const pz of [-.95,.95]){
      const wx=x+px*c-pz*s,wz=z+px*s+pz*c;
      orientedCollider(wx,wz,.24,.24,swingY,rot,.04);
    }
  }
  // Seats and chains.
  for(const sx of [-1.4,1.4]){
    const seat=box(1.05,.13,.38,sx,1.12,0,MAT.wood,g);
    {
      const c=Math.cos(rot),s=Math.sin(rot);
      const seatX=x+sx*c;
      const seatZ=z+sx*s;
      orientedCollider(seatX,seatZ,1.05,.38,.13,rot,.03,null,true,false,1.055,1.185);
    }
    const chainL=box(.035,1.75,.035,sx-.42,2.0,0,MAT.metal,g);
    const chainR=box(.035,1.75,.035,sx+.42,2.0,0,MAT.metal,g);
    chainL.material=MAT.metal;
    chainR.material=MAT.metal;
  }

  // Climbing frame / jungle gym with large readable silhouette.
  for(const px of [-5.0,5.0]){
    box(.22,2.8,.22,px,1.4,2.1,MAT.metal,g);
    box(.22,2.8,.22,px,1.4,3.8,MAT.metal,g);
    const c=Math.cos(rot),s=Math.sin(rot);
    for(const pz of [2.1,3.8]){
      const wx=x+px*c-pz*s,wz=z+px*s+pz*c;
      orientedCollider(wx,wz,.22,.22,2.8,rot,.04);
    }
  }
  box(10,.22,.22,0,2.72,2.95,MAT.metal,g);
  {
    const c=Math.cos(rot),s=Math.sin(rot);
    const px=x-2.95*s;
    const pz=z+2.95*c;
    orientedCollider(px,pz,10,.22,.22,rot,.04,null,false,false,2.61,2.83);
  }

  // Slide platform, ladder, rails, and a sloped slide.
  box(2.6,.24,2.4,-3.8,2.0,-2.8,MAT.wood,g);
  box(2.4,.18,1.7,-3.8,1.0,-1.8,MAT.metal,g);
  {
    const c=Math.cos(rot),s=Math.sin(rot);
    const px=x+(-3.8)*c-(-1.8)*s;
    const pz=z+(-3.8)*s+(-1.8)*c;
    orientedCollider(px,pz,2.4,1.7,.18,rot,.03,null,false,false,.91,1.09);
  }
  {
    const c=Math.cos(rot),s=Math.sin(rot);
    const px=x+(-3.8)*c-(-2.8)*s;
    const pz=z+(-3.8)*s+(-2.8)*c;
    orientedCollider(px,pz,2.6,2.4,.24,rot,.05,null,true,false,1.88,2.12);
  }
  const slide=box(1.9,.16,5.2,-3.8,.95,-4.2,MAT.wood,g);
  slide.rotation.x=.38;
  {
    const c=Math.cos(rot),s=Math.sin(rot);
    const px=x+(-3.8)*c-(-4.2)*s;
    const pz=z+(-3.8)*s+(-4.2)*c;
    orientedCollider(px,pz,1.9,.16,5.2,rot+.38,.03,null,false,false,.84,1.06);
  }
  const railL=box(.12,1.0,5.2,-4.9,1.35,-4.2,MAT.metal,g);
  const railR=box(.12,1.0,5.2,-2.7,1.35,-4.2,MAT.metal,g);
  railL.rotation.x=.38;
  railR.rotation.x=.38;
  {
    const c=Math.cos(rot),s=Math.sin(rot);
    for(const [lx,lz] of [[-4.9,-4.2],[-2.7,-4.2]]){
      const px=x+lx*c-lz*s;
      const pz=z+lx*s+lz*c;
      orientedCollider(px,pz,.12,5.2,1.0,rot+.38,.03,null,false,false,.85,1.85);
    }
  }

  // Large tree + low treehouse: a visual landmark and climbable low cover.
  const treeX=6.0, treeZ=-2.0;
  addTree(x+treeX*Math.cos(rot)-treeZ*Math.sin(rot),z+treeX*Math.sin(rot)+treeZ*Math.cos(rot),1.45);

  box(4.6,.32,3.8,treeX,1.12,treeZ,MAT.wood,g);
  box(4.2,1.65,.18,treeX,1.95,treeZ-1.75,MAT.wood,g);
  box(.18,1.45,3.5,treeX-2.02,1.84,treeZ,MAT.wood,g);
  box(.18,1.45,3.5,treeX+2.02,1.84,treeZ,MAT.wood,g);
  box(4.8,.24,4.0,treeX,2.82,treeZ,MAT.roof,g);
  {
    const c=Math.cos(rot),s=Math.sin(rot);
    const wp=(lx,lz)=>[x+lx*c-lz*s,z+lx*s+lz*c];
    const [deckX,deckZ]=wp(treeX,treeZ);
    const [backX,backZ]=wp(treeX,treeZ-1.75);
    const [leftX,leftZ]=wp(treeX-2.02,treeZ);
    const [rightX,rightZ]=wp(treeX+2.02,treeZ);
    orientedCollider(deckX,deckZ,4.6,3.8,.32,rot,.05,null,true,false,.96,1.28);
    orientedCollider(backX,backZ,4.2,.18,1.65,rot,.05,null,false,false,1.125);
    orientedCollider(leftX,leftZ,.18,3.5,1.45,rot,.05,null,false,false,1.115);
    orientedCollider(rightX,rightZ,.18,3.5,1.45,rot,.05,null,false,false,1.115);
    orientedCollider(deckX,deckZ,4.8,4.0,.24,rot,.05,null,false,false,2.70);
  }
  addWalkableSurface(
    x+treeX*Math.cos(rot)-treeZ*Math.sin(rot),
    z+treeX*Math.sin(rot)+treeZ*Math.cos(rot),
    4.4,3.5,1.28
  );

  // Perimeter posts of the play structure are combat obstacles, but the low fence remains jumpable.
}


function addParkWagon(x,z,rot=0){
  const g=new THREE.Group();
  g.position.set(x,.02,z);
  g.rotation.y=rot;
  world.add(g);
  box(2.9,.16,1.55,0,.72,0,MAT.wood,g);
  box(2.7,.72,.14,0,1.08,-.70,MAT.wood,g);
  box(.14,.72,1.42,-1.36,1.08,0,MAT.wood,g);
  box(.14,.72,1.42,1.36,1.08,0,MAT.wood,g);
  for(const wx of [-1.08,1.08]) for(const wz of [-.78,.78]){
    const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.42,.42,.16,18),MAT.wood);
    wheel.rotation.z=Math.PI/2;
    wheel.position.set(wx,.43,wz);
    wheel.castShadow=true;
    wheel.receiveShadow=true;
    g.add(wheel);
  }
  const handle=new THREE.Mesh(new THREE.CylinderGeometry(.08,.08,2.1,10),MAT.metal);
  handle.rotation.z=Math.PI/2;
  handle.position.set(0,.82,1.45);
  handle.castShadow=true;
  g.add(handle);
  collider(x,z,2.95,1.65,.08,1.35,null,false,true,.05,1.40);
  return g;
}

function addCarouselRide(x,z,rot=0){
  const g=new THREE.Group();
  g.position.set(x,.02,z);
  g.rotation.y=rot;
  world.add(g);
  const base=new THREE.Mesh(new THREE.CylinderGeometry(4.4,4.7,.22,32),MAT.stone);
  base.position.y=.11; base.castShadow=true; base.receiveShadow=true; g.add(base);
  const platform=new THREE.Mesh(new THREE.CylinderGeometry(4.05,4.05,.12,32),MAT.wood);
  platform.position.y=.29; platform.castShadow=true; platform.receiveShadow=true; g.add(platform);
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(.18,.24,2.8,16),MAT.metal);
  pole.position.y=1.52; pole.castShadow=true; g.add(pole);
  const roof=new THREE.Mesh(new THREE.ConeGeometry(4.15,1.25,24),MAT.roof);
  roof.position.y=3.45; roof.castShadow=true; g.add(roof);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(3.25,.08,8,48),MAT.metal);
  ring.rotation.x=Math.PI/2; ring.position.y=1.95; g.add(ring);
  for(let i=0;i<6;i++){
    const a=i*Math.PI/3;
    const seat=new THREE.Mesh(new THREE.BoxGeometry(1.1,.22,.72),MAT.wood);
    seat.position.set(Math.cos(a)*2.75,1.08,Math.sin(a)*2.75);
    seat.rotation.y=-a; seat.castShadow=true; seat.receiveShadow=true; g.add(seat);
    const rod=new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,.95,8),MAT.metal);
    rod.position.set(Math.cos(a)*2.75,1.48,Math.sin(a)*2.75);
    rod.castShadow=true; g.add(rod);
  }
  circleCollider(x,z,4.72,.30,null,false,true,.02,.32);
  circleCollider(x,z,.55,2.8);
  g.userData.rotationSpeed=.18;
  return g;
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
  circleCollider(0,0,1.58,3.0,null,false,false);

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
  addSidewalk(0,-74.1,164,4.5);
  addSidewalk(0,74.1,164,4.5);
  addSidewalk(-74.1,0,4.5,164);
  addSidewalk(74.1,0,4.5,164);
  addSidewalk(0,-128,300,4);
  addSidewalk(0,128,300,4);
  addSidewalk(-128,0,4,300);
  addSidewalk(128,0,4,300);

  // Four short pedestrian entries into the park.
  addParkPath(0,-59,9,26,.19);
  addParkPath(0,59,9,26,.19);
  addParkPath(-59,0,26,9,.19);
  addParkPath(59,0,26,9,.19);

  // Four broad pedestrian crossings connect the park gates to the ring road.
  // Keep the raised lamp/furniture strip outside this crossing footprint.
  for(const [cx,cz,horizontal] of [[0,-84,true],[0,84,true],[-84,0,false],[84,0,false]]){
    for(let i=-4;i<=4;i++){
      if(horizontal) box(1.6,.014,.55,cx+i*2,.155,cz,MAT.white);
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

  // Large playground becomes a distinct combat landmark and cover cluster.
  addPlayground(46,-24,-Math.PI/2);

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
    [-64,-66,1.0],[-47,-67,.92],[-24,-66,.88],[24,-66,.9],[47,-67,.95],[64,-66,1.0],
    [-64,66,.96],[-46,67,.92],[-22,66,.9],[24,66,.92],[46,67,.98],[64,66,1.0],
    [-66,-24,.96],[-66,24,1.0],[66,-24,.92],[66,24,.98]
  ]);

  // A few isolated canopy anchors inside the park. Their spacing deliberately
  // leaves readable combat lanes between them.
  addTree(-30,-4,.92);
  addTree(30,4,.96);
  addTree(-4,30,.92);

  // Additional outer trees soften the city edge without closing the main combat lanes.
  addTree(-92,-44,1.05);
  addTree(-92,44,.98);
  addTree(92,-44,1.0);
  addTree(92,44,1.06);
  addTree(-46,-92,.98);
  addTree(46,-92,1.03);
  addTree(-46,92,1.0);
  addTree(46,92,.96);

  // Central landmark stays exactly where the whole layout can orient around it.
  addCentralFountain();

  world.userData.carouselRide=addCarouselRide(0,-31,Math.PI/12);
  addParkWagon(58,-24,-Math.PI/2);

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
    [-76,-72],[-24,-76],[24,-76],[76,-72],
    [-76,72],[-24,76],[24,76],[76,72],
    [-76,-24],[-76,24],[76,-24],[76,24],
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
let upperMixer=null;
let actions={};
let currentAction=null;
let characterReady=false;
let protoframePreviewActive=false;
let protoframePreviewRoot=null;

let weaponRoot=null;
let muzzleFlash=null;
let muzzlePoint=null;
let weaponSockets={rightGrip:null,leftGrip:null,muzzle:null};
let aimBones=null;
let aimWeight=0;
let recoilKick=0;
let recoilYaw=0;
let recoilPitch=0;
let weaponInitialized=false;
let ammo=120;
let lastShotTime=0;
let fireAccumulator=0;
let gunActions={};

// Upper-body weapon template layer. Locomotion stays on the base action
// while these actions own chest/arms/head when the rifle is equipped.
let upperBodyActions={
  idle:null,
  walk:null,
  run:null
};
let activeUpperBodyAction=null;

// CDDA_WEAPON_RIG_V2
// Separate weapon socket system: rifle starts on the back, then transitions
// into a hand-driven two-point grip without being parented to an arm mesh.
let weaponState='holstered'; // holstered | drawing | equipped | holstering
let fireQueued=false;
let weaponGraspAction=null;
let weaponPoseWeight=0;
const weaponTransition={
  active:false,
  target:'holstered',
  startedAt:0,
  duration:.72,
  fromPosition:new THREE.Vector3(),
  fromQuaternion:new THREE.Quaternion()
};
const weaponHolsterPosition=new THREE.Vector3(.28,1.34,-.46);
const weaponHolsterEuler=new THREE.Euler(-.72,Math.PI,.10,'YXZ');
const weaponHolsterQuaternion=new THREE.Quaternion().setFromEuler(weaponHolsterEuler);
const weaponHandWorldPosition=new THREE.Vector3();
const weaponHandWorldQuaternion=new THREE.Quaternion();
const weaponBasis=new THREE.Matrix4();
const weaponForward=new THREE.Vector3();
const weaponRightAxis=new THREE.Vector3();
const weaponUpAxis=new THREE.Vector3();

function hideBuiltInWeapons(root){
  const hiddenNames=/^(ak|ak47|grenade|grenadelauncher|pistol|revolver|rocketlauncher|shortcannon|shotgun|shovel|smg|sniper|weapon|weapon_geometry)$/i;
  root.traverse(o=>{
    if(o.isMesh && hiddenNames.test(o.name||'')) o.visible=false;
  });
}

function collectAimBones(){
  aimBones={
    rightHand:null,leftHand:null,
    rightLowerArm:null,leftLowerArm:null,
    rightUpperArm:null,leftUpperArm:null
  };

  const classify=(raw)=>{
    const n=String(raw||'').toLowerCase().replace(/[^a-z0-9]/g,'');
    const right=n.includes('right')||n.endsWith('r');
    const left=n.includes('left')||n.endsWith('l');
    if((n.includes('hand')||n.includes('wrist')) && right) return 'rightHand';
    if((n.includes('hand')||n.includes('wrist')) && left) return 'leftHand';
    if((n.includes('lowerarm')||n.includes('forearm')) && right) return 'rightLowerArm';
    if((n.includes('lowerarm')||n.includes('forearm')) && left) return 'leftLowerArm';
    if(n.includes('upperarm') && right) return 'rightUpperArm';
    if(n.includes('upperarm') && left) return 'leftUpperArm';
    return null;
  };

  characterRoot?.traverse(o=>{
    if(!o.isBone) return;
    const role=classify(o.name);
    if(role) aimBones[role]=o;
  });

  for(const side of ['right','left']){
    const handKey=side+'Hand';
    const forearm=aimBones[side+'LowerArm'];
    if(!aimBones[handKey] && forearm){
      const candidate=forearm.children.find(c=>c.isBone);
      if(candidate) aimBones[handKey]=candidate;
    }
  }
}
function makeWeapon(){
  if(weaponInitialized||!characterRoot) return;
  weaponInitialized=true;
  collectAimBones();

  const metal=new THREE.MeshStandardMaterial({color:0x20262a,roughness:.38,metalness:.78});
  const dark=new THREE.MeshStandardMaterial({color:0x0f1417,roughness:.54,metalness:.34});
  const polymer=new THREE.MeshStandardMaterial({color:0x30383c,roughness:.72,metalness:.10});

  weaponRoot=new THREE.Group();
  weaponRoot.name='AR-01 Carbine';
  player.add(weaponRoot);
  weaponRoot.rotation.order='YXZ';
  weaponRoot.scale.setScalar(.60);

  // Custom weapon forward is +Z, matching the player facing axis.
  // Initial weapon state is a visible back-mounted rifle.
  weaponRoot.position.copy(weaponHolsterPosition);
  weaponRoot.quaternion.copy(weaponHolsterQuaternion);
  box(.34,.26,.82,0,0,-.05,metal,weaponRoot);
  box(.22,.19,.72,0,.02,.58,dark,weaponRoot);
  box(.12,.12,1.04,0,.02,1.28,metal,weaponRoot);
  box(.18,.32,.30,0,-.18,-.42,polymer,weaponRoot);
  box(.16,.36,.28,0,-.17,.02,dark,weaponRoot);

  // Dedicated forward foregrip: a real weapon component for the left hand.
  // The left-hand socket is centered inside this part, so changing the weapon
  // mesh later does not require changing the character rig.
  const foregrip=box(.14,.34,.20,0,-.20,.54,polymer,weaponRoot);
  foregrip.rotation.x=-.10;

  box(.11,.11,.24,0,.14,.36,metal,weaponRoot);
  box(.08,.10,.18,0,.18,.64,metal,weaponRoot);

  const muzzle=new THREE.Mesh(new THREE.CylinderGeometry(.055,.055,.12,10),dark);
  muzzle.rotation.x=Math.PI/2;
  muzzle.position.set(0,.02,1.80);
  muzzle.castShadow=true;
  weaponRoot.add(muzzle);

  muzzleFlash=new THREE.Mesh(
    new THREE.ConeGeometry(.13,.38,8),
    new THREE.MeshBasicMaterial({
      color:0xffe8a0,transparent:true,opacity:.92,
      depthWrite:false,side:THREE.DoubleSide
    })
  );
  muzzleFlash.rotation.x=-Math.PI/2;
  muzzleFlash.position.set(0,.02,2.02);
  muzzleFlash.visible=false;
  weaponRoot.add(muzzleFlash);

  weaponSockets.rightGrip=new THREE.Object3D();
  weaponSockets.rightGrip.name='RightGrip';
  weaponSockets.rightGrip.position.set(0,-.18,-.42);
  weaponSockets.rightGrip.userData.role='trigger_hand';
  weaponRoot.add(weaponSockets.rightGrip);

  weaponSockets.leftGrip=new THREE.Object3D();
  weaponSockets.leftGrip.name='LeftGrip';
  // Forward support hand belongs on the physical foregrip.
  weaponSockets.leftGrip.position.set(0,-.20,.54);
  weaponSockets.leftGrip.userData.role='support_hand';
  weaponRoot.add(weaponSockets.leftGrip);

  weaponSockets.muzzle=new THREE.Object3D();
  weaponSockets.muzzle.name='Muzzle';
  weaponSockets.muzzle.position.set(0,.02,2.16);
  weaponSockets.muzzle.userData.role='muzzle';
  weaponRoot.add(weaponSockets.muzzle);
  muzzlePoint=weaponSockets.muzzle;

  const name=document.querySelector('.weaponName');
  const meta=document.querySelector('.weaponMeta');
  if(name) name.textContent='AR-01 CARBINE';
  if(meta) meta.textContent='LMB FIRE • RMB AIM • 120 / ∞';
  updateAimVisual(0);
}

function updateAimVisual(weight){
  const crosshair=document.getElementById('crosshair');
  if(!crosshair) return;
  crosshair.style.transform='translate(-50%,-50%) scale('+(1-weight*.18)+')';
  crosshair.style.opacity=String(.72+.28*weight);
}

function getRoleForward(){
  return new THREE.Vector3(0,0,1).applyQuaternion(player.quaternion).normalize();
}

function getAimDirection(){
  const direction=new THREE.Vector3();
  if(input.aim||input.fire){
    camera.getWorldDirection(direction);
    if(direction.lengthSq()<1e-6) direction.copy(getRoleForward());
    return direction.normalize();
  }
  return getRoleForward();
}

function smoothWeaponT(t){
  const x=THREE.MathUtils.clamp(t,0,1);
  return x*x*(3-2*x);
}

function getWeaponHolsterLocalPosition(out){
  return out.copy(weaponHolsterPosition);
}

function getWeaponHandWorldPose(outPosition,outQuaternion){
  if(!aimBones?.rightHand){
    outPosition.copy(player.getWorldPosition(new THREE.Vector3())).add(
      new THREE.Vector3(.02,1.24,.05).applyQuaternion(player.quaternion)
    );
    outQuaternion.copy(player.quaternion);
    return false;
  }

  const rightHand=aimBones.rightHand.getWorldPosition(new THREE.Vector3());
  const leftHand=aimBones.leftHand
    ? aimBones.leftHand.getWorldPosition(new THREE.Vector3())
    : rightHand.clone().add(getRoleForward().multiplyScalar(.46));

  weaponForward.subVectors(leftHand,rightHand);
  const bodyForward=getRoleForward();

  if(weaponForward.lengthSq()<.0025){
    weaponForward.copy(bodyForward);
  }else{
    weaponForward.normalize();
    if(weaponForward.dot(bodyForward)<-.20) weaponForward.negate();
  }

  weaponRightAxis.crossVectors(new THREE.Vector3(0,1,0),weaponForward);
  if(weaponRightAxis.lengthSq()<.001){
    weaponRightAxis.set(1,0,0);
  }else{
    weaponRightAxis.normalize();
  }
  weaponUpAxis.crossVectors(weaponForward,weaponRightAxis).normalize();

  weaponBasis.makeBasis(weaponRightAxis,weaponUpAxis,weaponForward);
  outQuaternion.setFromRotationMatrix(weaponBasis);

  const gripOffset=new THREE.Vector3(0,0,-.08).applyQuaternion(outQuaternion);
  outPosition.copy(rightHand).sub(gripOffset);
  return true;
}

function setWeaponWorldPose(worldPosition,worldQuaternion){
  const localPosition=worldPosition.clone();
  player.worldToLocal(localPosition);
  weaponRoot.position.copy(localPosition);

  const playerInverse=player.getWorldQuaternion(new THREE.Quaternion()).invert();
  weaponRoot.quaternion.copy(playerInverse.multiply(worldQuaternion));
}

function setWeaponHolsteredPose(){
  weaponRoot.position.copy(weaponHolsterPosition);
  weaponRoot.quaternion.copy(weaponHolsterQuaternion);
}

function beginWeaponDraw(){
  if(!weaponRoot||weaponState==='equipped'||weaponState==='drawing') return;
  weaponTransition.active=true;
  weaponTransition.target='equipped';
  weaponTransition.startedAt=performance.now();
  weaponTransition.duration=.72;
  getWeaponHolsterLocalPosition(weaponTransition.fromPosition);
  weaponTransition.fromQuaternion.copy(weaponHolsterQuaternion);
  weaponState='drawing';
}

function beginWeaponHolster(){
  if(!weaponRoot||weaponState==='holstered'||weaponState==='holstering') return;
  weaponTransition.active=true;
  weaponTransition.target='holstered';
  weaponTransition.startedAt=performance.now();
  weaponTransition.duration=.68;
  weaponTransition.fromPosition.copy(weaponRoot.position);
  weaponTransition.fromQuaternion.copy(weaponRoot.quaternion);
  weaponState='holstering';
}

function toggleWeapon(){
  if(weaponState==='holstered') beginWeaponDraw();
  else if(weaponState==='equipped') beginWeaponHolster();
}

function updateWeaponAnimation(dt){
  let targetWeight=0;
  if(weaponState==='equipped'){
    targetWeight=1;
  }else if(weaponState==='drawing'&&weaponTransition.active){
    const p=(performance.now()-weaponTransition.startedAt)/weaponTransition.duration;
    targetWeight=smoothWeaponT(p);
  }else if(weaponState==='holstering'&&weaponTransition.active){
    const p=(performance.now()-weaponTransition.startedAt)/weaponTransition.duration;
    targetWeight=1-smoothWeaponT(p);
  }

  weaponPoseWeight=THREE.MathUtils.damp(weaponPoseWeight,targetWeight,18,dt);

  if(weaponGraspAction){
    weaponGraspAction.enabled=weaponPoseWeight>.001;
    weaponGraspAction.setEffectiveWeight(weaponPoseWeight);
    weaponGraspAction.time=weaponGraspAction.getClip().duration-.001;
  }
}

function updateWeaponState(dt){
  if(weaponRoot){
    if(weaponState==='holstered'){
      setWeaponHolsteredPose();
    }else if(weaponState==='equipped'){
      getWeaponHandWorldPose(weaponHandWorldPosition,weaponHandWorldQuaternion);
      setWeaponWorldPose(weaponHandWorldPosition,weaponHandWorldQuaternion);
    }else if(weaponTransition.active){
      const raw=(performance.now()-weaponTransition.startedAt)/weaponTransition.duration;
      const p=smoothWeaponT(raw);

      if(weaponState==='drawing'){
        getWeaponHandWorldPose(weaponHandWorldPosition,weaponHandWorldQuaternion);
        const targetLocal=weaponHandWorldPosition.clone();
        player.worldToLocal(targetLocal);
        const targetLocalQuaternion=player.getWorldQuaternion(new THREE.Quaternion()).invert()
          .multiply(weaponHandWorldQuaternion);

        weaponRoot.position.lerpVectors(weaponTransition.fromPosition,targetLocal,p);
        weaponRoot.quaternion.copy(weaponTransition.fromQuaternion).slerp(targetLocalQuaternion,p);
      }else{
        weaponRoot.position.lerpVectors(weaponTransition.fromPosition,weaponHolsterPosition,p);
        weaponRoot.quaternion.copy(weaponTransition.fromQuaternion).slerp(weaponHolsterQuaternion,p);
      }

      if(raw>=1){
        weaponTransition.active=false;
        if(weaponTransition.target==='equipped'){
          weaponState='equipped';
          getWeaponHandWorldPose(weaponHandWorldPosition,weaponHandWorldQuaternion);
          setWeaponWorldPose(weaponHandWorldPosition,weaponHandWorldQuaternion);
        }else{
          weaponState='holstered';
          setWeaponHolsteredPose();
        }
      }
    }

    weaponRoot.position.z-=recoilKick*.018;
  }

  if(muzzleFlash){
    muzzleFlash.visible=recoilKick>0.06&&weaponState!=='holstered';
    muzzleFlash.scale.setScalar(.75+recoilKick*.9);
  }

  updateAimVisual(aimWeight);
  recoilKick=Math.max(0,recoilKick-dt*8.5);
  recoilYaw=THREE.MathUtils.damp(recoilYaw,0,12,dt);
  recoilPitch=THREE.MathUtils.damp(recoilPitch,0,12,dt);
}
function raycastStatic(origin,direction,maxDistance=260){
  cameraRay.origin.copy(origin);
  cameraRay.direction.copy(direction).normalize();
  let best=maxDistance;
  const hit=new THREE.Vector3();

  for(const c of staticColliders){
    const halfW=c.shape==='circle'?c.radius:c.w*.5;
    const halfD=c.shape==='circle'?c.radius:c.d*.5;
    const baseY=Number.isFinite(c.baseY)?c.baseY:0;
    const topY=baseY+(Number.isFinite(c.h)?c.h:32);
    cameraBox.min.set(c.x-halfW,baseY,c.z-halfD);
    cameraBox.max.set(c.x+halfW,topY,c.z+halfD);
    const p=cameraRay.intersectBox(cameraBox,hit);
    if(!p) continue;
    const d=p.distanceTo(origin);
    if(d>.05&&d<best) best=d;
  }
  return {distance:best,point:origin.clone().addScaledVector(direction,best)};
}

function spawnTracer(origin,point){
  const geometry=new THREE.BufferGeometry().setFromPoints([origin,point]);
  const material=new THREE.LineBasicMaterial({
    color:0xffd38a,transparent:true,opacity:.9,depthWrite:false
  });
  const line=new THREE.Line(geometry,material);
  world.add(line);
  setTimeout(()=>{
    world.remove(line);
    geometry.dispose();
    material.dispose();
  },70);
}

function spawnImpact(point){
  const impact=new THREE.Mesh(
    new THREE.SphereGeometry(.055,6,6),
    new THREE.MeshBasicMaterial({
      color:0xffd76d,transparent:true,opacity:.95,depthWrite:false
    })
  );
  impact.position.copy(point);
  world.add(impact);
  setTimeout(()=>{
    world.remove(impact);
    impact.geometry.dispose();
    impact.material.dispose();
  },110);
}

function fireWeapon(){
  if(!started||!weaponRoot) return;
  if(weaponState!=='equipped'){
    fireQueued=true;
    beginWeaponDraw();
    return;
  }
  const now=performance.now();
  if(now-lastShotTime<88||ammo<=0) return;

  lastShotTime=now;
  ammo--;
  recoilKick=1;
  recoilPitch=.08;
  recoilYaw=(Math.random()-.5)*.045;

  const origin=camera.position.clone();
  const direction=getAimDirection();
  const hit=raycastStatic(origin,direction,260);
  const muzzleWorld=muzzlePoint.getWorldPosition(new THREE.Vector3());

  spawnTracer(muzzleWorld,hit.point);
  if(hit.distance<259.9) spawnImpact(hit.point);

  const meta=document.querySelector('.weaponMeta');
  if(meta) meta.textContent='LMB FIRE • RMB AIM • '+ammo+' / ∞';
}

function buildWeaponGraspOverlay(clip){
  if(!mixer||!clip) return null;

  const upperBody=/shoulder|clavicle|upperarm|lowerarm|forearm|hand|wrist/i;
  const excluded=/thigh|calf|shin|leg|foot|toe|pelvis|hip/i;
  const tracks=clip.tracks.filter(t=>{
    const name=String(t.name||'');
    return upperBody.test(name)&&!excluded.test(name);
  }).map(t=>t.clone());

  if(!tracks.length) return null;

  const overlayClip=clip.clone();
  overlayClip.name='CDDA_Armed_UpperBody';
  overlayClip.tracks=tracks;

  try{
    THREE.AnimationUtils.makeClipAdditive(overlayClip,0);
  }catch(err){
    console.warn('Could not build additive armed pose:',err);
    return null;
  }

  const action=mixer.clipAction(overlayClip);
  action.blendMode=THREE.AdditiveAnimationBlendMode;
  action.setLoop(THREE.LoopOnce,1);
  action.clampWhenFinished=true;
  action.enabled=true;
  action.weight=0;
  action.time=Math.max(0,overlayClip.duration-.001);
  action.paused=true;
  action.play();
  return action;
}

function chooseAnimation(base){
  return actions[base]||actions.Idle||null;
}

function setAction(name,fade=.18){
  const next=chooseAnimation(name);
  if(!next) return;
  if(currentAction===next) return;
  if(currentAction) currentAction.fadeOut(fade);
  next.reset().fadeIn(fade).play();
  currentAction=next;
}

function buildUpperBodyWeaponAction(sourceAction,name){
  if(!mixer||!sourceAction) return null;
  const clip=sourceAction.getClip().clone();
  const keep=/spine|clavicle|neck|head|shoulder|upperarm|lowerarm|forearm|hand|wrist/i;
  const drop=/pelvis|hip|thigh|calf|shin|leg|foot|toe/i;
  clip.tracks=clip.tracks.filter(track=>{
    const pathName=String(track.name||'');
    return keep.test(pathName)&&!drop.test(pathName);
  }).map(track=>track.clone());

  if(!clip.tracks.length) return null;

  clip.name='CDDA_UpperBody_'+name;
  const action=upperMixer.clipAction(clip);
  action.enabled=false;
  action.setEffectiveWeight(0);
  action.setLoop(THREE.LoopRepeat,Infinity);
  action.play();
  return action;
}

function setUpperBodyAction(next,fade=.12){
  if(activeUpperBodyAction===next) return;
  if(activeUpperBodyAction){
    activeUpperBodyAction.fadeOut(fade);
  }
  activeUpperBodyAction=next||null;
  if(activeUpperBodyAction){
    activeUpperBodyAction.enabled=true;
    activeUpperBodyAction.reset().setEffectiveWeight(1).fadeIn(fade).play();
  }
}

function updateUpperBodyWeaponTemplate(dt,moving,sprint){
  if(!characterReady||!mixer) return;

  const equipped =
    weaponState==='equipped' ||
    weaponState==='drawing' ||
    weaponState==='holstering';

  if(!equipped){
    if(activeUpperBodyAction){
      activeUpperBodyAction.fadeOut(.10);
      activeUpperBodyAction=null;
    }
    return;
  }

  // Fire and ADS deliberately lock the chest/arms to the static armed template.
  // Only non-firing locomotion gets the walk/run gun sway.
  let wanted=upperBodyActions.idle;
  if(!input.fire && !input.aim){
    wanted=moving
      ? (sprint ? (upperBodyActions.run||upperBodyActions.walk||upperBodyActions.idle)
                : (upperBodyActions.walk||upperBodyActions.idle))
      : upperBodyActions.idle;
  }

  setUpperBodyAction(wanted,.10);

  if(activeUpperBodyAction){
    activeUpperBodyAction.enabled=true;
    activeUpperBodyAction.setEffectiveWeight(
      weaponState==='drawing'
        ? THREE.MathUtils.clamp(
            (performance.now()-weaponTransition.startedAt)/weaponTransition.duration,
            0,1
          )
        : weaponState==='holstering'
          ? THREE.MathUtils.clamp(
              1-(performance.now()-weaponTransition.startedAt)/weaponTransition.duration,
              0,1
            )
          : 1
    );
  }
}

async function loadProtoframePreview(){
  if(!OBJLoader) return null;

  try{
    const objLoader=new OBJLoader();
    if(MTLLoader){
      try{
        const mtlLoader=new MTLLoader();
        const materials=await mtlLoader.loadAsync(
          'assets/player/Warframe1999_Protoframe_LowPoly_v2.mtl'
        );
        materials.preload();
        objLoader.setMaterials(materials);
      }catch(err){
        console.warn('Protoframe MTL preview failed; using fallback material:',err);
      }
    }

    const root=await objLoader.loadAsync(
      'assets/player/Warframe1999_Protoframe_LowPoly_v2.obj'
    );

    root.traverse(o=>{
      if(!o.isMesh) return;
      o.castShadow=true;
      o.receiveShadow=true;
      if(o.material){
        o.material.side=THREE.FrontSide;
        o.material.roughness=.42;
        o.material.metalness=.52;
      }
    });

    const box=new THREE.Box3().setFromObject(root);
    const size=box.getSize(new THREE.Vector3());
    const desiredHeight=1.95;
    const scale=desiredHeight/Math.max(size.y,.001);
    root.scale.setScalar(scale);

    const scaledBox=new THREE.Box3().setFromObject(root);
    root.position.y=-scaledBox.min.y;

    root.name='Warframe1999_Protoframe_LowPoly_Preview';
    return root;
  }catch(err){
    console.warn('Protoframe preview failed:',err);
    return null;
  }
}

async function loadCharacter(){
  const loading=document.getElementById('loading');
  if(!loader){
    loading.textContent='Character asset skipped; gameplay is available.';
    return;
  }
  try{
    loading.textContent='Loading replacement character…';

    // Cloud-generated character is the primary asset. The external humanoid
    // remains a safety fallback so a missing/unfinished cloud commit never
    // blanks the scene.
    const characterSources=[
      'assets/player/CDDA_SciFi_Soldier_Generated.glb',
      'https://raw.githubusercontent.com/NafisRayan/Animate-Rigged-Humanoid-No-Blender/main/test/human_male.glb'
    ];
    let gltf=null;
    let lastCharacterError=null;
    for(const src of characterSources){
      try{
        gltf=await loader.loadAsync(src);
        if(src.startsWith('assets/')) console.log('Using cloud-generated character:',src);
        else console.warn('Cloud-generated character unavailable; using fallback:',src);
        break;
      }catch(err){
        lastCharacterError=err;
        console.warn('Character source failed:',src,err);
      }
    }
    if(!gltf) throw lastCharacterError||new Error('No character source could be loaded');

    characterRoot=gltf.scene;
    hideBuiltInWeapons(characterRoot);
    characterRoot.traverse(o=>{
      if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}
    });

    characterRoot.visible=true;
    characterRoot.scale.setScalar(1);

    const initialBox=new THREE.Box3().setFromObject(characterRoot);
    const initialSize=initialBox.getSize(new THREE.Vector3());
    const initialHeight=initialSize.y;
    if(initialHeight>0){
      characterBaseScale=1.95/initialHeight;
      characterRoot.scale.setScalar(characterBaseScale);
    }

    // Keep the replacement on the same +Z gameplay-forward axis.
    characterRoot.rotation.y=0;

    characterRoot.updateMatrixWorld(true);
    const finalBox=new THREE.Box3().setFromObject(characterRoot);
    if(Number.isFinite(finalBox.min.y)) characterRoot.position.y=-finalBox.min.y;

    player.add(characterRoot);
    characterRoot.updateMatrixWorld(true);

    // A/B visual test: keep the original gameplay skeleton for movement,
    // terrain, jump and the existing animation infrastructure, but replace
    // its rendered body with the new Protoframe low-poly preview.
    protoframePreviewRoot=await loadProtoframePreview();
    if(protoframePreviewRoot){
      characterRoot.traverse(o=>{
        if(o.isMesh) o.visible=false;
      });
      protoframePreviewRoot.scale.multiplyScalar(1/Math.max(characterBaseScale,.0001));
      characterRoot.add(protoframePreviewRoot);
      protoframePreviewActive=true;
      console.log('Protoframe visual preview active.');
    }

    makeWeapon();
    if(protoframePreviewActive&&weaponRoot) weaponRoot.visible=false;

    mixer=new THREE.AnimationMixer(characterRoot);
    upperMixer=new THREE.AnimationMixer(characterRoot);
    actions={};
    gunActions={};

    const clipMap=new Map();
    for(const clip of gltf.animations||[]){
      const normalized=clip.name.toLowerCase().replace(/\s+/g,'_');
      const action=mixer.clipAction(clip);
      clipMap.set(normalized,action);

      if(normalized==='idle'&&!actions.Idle) actions.Idle=action;
      if(normalized==='walk'&&!actions.Walk) actions.Walk=action;
      if(normalized==='run'&&!actions.Run) actions.Run=action;
      if((normalized==='jump'||normalized==='jump_start'||normalized==='jump_loop')&&!actions.Jump) actions.Jump=action;

      // Exact armed-locomotion names win. Shooting variants are never
      // allowed to become the idle/walk/run loop accidentally.
      if(normalized==='idle_gun') gunActions.Idle=gunActions.Idle||action;
      if(normalized==='walk_gun') gunActions.Walk=gunActions.Walk||action;
      if(normalized==='run_gun') gunActions.Run=gunActions.Run||action;
      if(normalized==='jump_gun') gunActions.Jump=gunActions.Jump||action;
    }

    const findClip=(patterns)=>{
      for(const p of patterns){
        const exact=clipMap.get(p);
        if(exact) return exact;
      }
      for(const [name,action] of clipMap){
        if(patterns.some(p=>name.includes(p))) return action;
      }
      return null;
    };

    const graspActionSource=findClip(['grasp','grab','take_weapon','weapon_grab']);
    weaponGraspAction=graspActionSource
      ? buildWeaponGraspOverlay(graspActionSource.getClip())
      : null;

    gunActions.Idle=gunActions.Idle||findClip(['idle_gun','idle_gun_pointing','idle_weapon'])||actions.Idle;
    gunActions.Walk=gunActions.Walk||findClip(['walk_gun','walk_weapon'])||actions.Walk;
    gunActions.Run=gunActions.Run||findClip(['run_gun','run_weapon'])||actions.Run;
    gunActions.Jump=gunActions.Jump||findClip(['jump_gun','jump_weapon','run_gun_shoot'])||actions.Jump;

    // Upper-body-only armed templates. These tracks override only the chest,
    // arms and head, leaving the normal Idle/Walk/Run legs untouched.
    upperBodyActions.idle=buildUpperBodyWeaponAction(gunActions.Idle||actions.Idle,'Idle');
    upperBodyActions.walk=buildUpperBodyWeaponAction(gunActions.Walk||actions.Walk,'Walk');
    upperBodyActions.run=buildUpperBodyWeaponAction(gunActions.Run||actions.Run,'Run');

    setAction('Idle',0);
    mixer.update(0);
    __CDDA_refreshWeaponRig();
    __CDDA_captureCombatNeutralPose();
    characterReady=true;
    loading.textContent=protoframePreviewActive
      ? 'Protoframe visual preview ready.'
      : 'Replacement character ready.';
    console.log('Replacement character loaded:',{
      clipCount:(gltf.animations||[]).length,
      gunActions:Object.fromEntries(Object.entries(gunActions).map(([k,v])=>[k,v?.getClip().name||null])),
      rightHand:aimBones?.rightHand?.name||null,
      leftHand:aimBones?.leftHand?.name||null
    });
  }catch(err){
    console.error('Character replacement load failed',err);
    loading.textContent='Replacement character failed to load; gameplay remains available.';
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
const cameraCollisionRadius=.36;
const cameraCollisionSkin=.24;
const cameraMinClearance=1.18;
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
  space:false,
  aim:false,
  fire:false
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
  if(e.key==='g'||e.key==='G') return 'KeyG';
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

  if(code==='KeyG'){
    toggleWeapon();
    e.preventDefault();
    return;
  }
  recordInputEvent('keydown',e,code);
  updateInputDiagnostics();

  if(code==='Space'){
    // Leave browser/system modifier combinations such as Ctrl+Shift+Space alone.
    if(e.ctrlKey||e.altKey||e.metaKey) return;
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

  verticalVelocity=jumpSpeed;
  grounded=false;
  jumpRequest=false;

  // Space is always a normal jump. No W+Shift or modifier combo is involved.
  return true;
}

function handleKeyUp(e){
  const code=normalizeCode(e);
  recordInputEvent('keyup',e,code);
  updateInputDiagnostics();
  if(code) setInput(code,false);
}

addEventListener('keydown',handleKeyDown,true);
addEventListener('keyup',handleKeyUp,true);

// Jump is driven only by the real Space keydown. No keypress/beforeinput
// compatibility path is used, so Ctrl+Shift+Space cannot enter gameplay.

addEventListener('contextmenu',e=>e.preventDefault());

addEventListener('mousedown',e=>{
  if(!started) return;
  if(e.button===2){
    beginWeaponDraw();
    input.aim=true;
    e.preventDefault();
  }else if(e.button===0){
    input.fire=true;
    fireWeapon();
  }
});

addEventListener('mouseup',e=>{
  if(e.button===2) input.aim=false;
  if(e.button===0) input.fire=false;
});

addEventListener('blur',()=>{
  input.w=input.a=input.s=input.d=input.shift=input.space=input.aim=input.fire=false;
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
    'V SWITCH  •  G DRAW/HOLSTER  •  WASD MOVE  •  SHIFT SPRINT  •  SPACE JUMP  •  LMB FIRE • RMB AIM • MOUSE LOOK';
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
    ? ((shoulderSide>0?'SHOULDER: LEFT • ':'SHOULDER: RIGHT • ')+'V SWITCH  •  G DRAW/HOLSTER  •  WASD MOVE  •  SHIFT SPRINT  •  SPACE JUMP  •  LMB FIRE • RMB AIM • MOUSE LOOK')
    : 'CLICK GAME TO LOCK MOUSE  •  V SWITCH SHOULDER  •  WASD MOVE  •  SHIFT SPRINT  •  SPACE JUMP • LMB FIRE • RMB AIM';
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

function getCrosshairYaw(){
  // The central reticle is the player's canonical aim direction.
  // Camera pitch is ignored for body yaw; the character only needs the
  // horizontal projection of the reticle direction.
  const cameraDir=new THREE.Vector3();
  camera.getWorldDirection(cameraDir);
  cameraDir.y=0;
  if(cameraDir.lengthSq()<1e-6){
    return yaw+Math.PI;
  }
  cameraDir.normalize();
  return Math.atan2(cameraDir.x,cameraDir.z);
}

function updateReticleFacing(dt,response=11.5){
  if(!started) return;

  const targetYaw=getCrosshairYaw();
  const diff=THREE.MathUtils.euclideanModulo(
    targetYaw-player.rotation.y+Math.PI,
    Math.PI*2
  )-Math.PI;

  player.rotation.y+=diff*Math.min(1,dt*response);
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

  // Hip-fire is compatible with sprint. ADS is the only state that blocks sprint.
  const sprint=input.shift && !input.aim;
  const speed=input.aim ? (sprint?8.2:4.9) : (sprint?10.5:6.2);

  // Restore the original movement model:
  // - WASD determines movement relative to the camera.
  // - While moving normally, the character faces the actual movement vector.
  // - RMB aim keeps the old camera-facing behavior.
  // New addition only:
  // - when WASD is released, the character smoothly returns to the reticle;
  // - while firing, the character turns toward the reticle.
  let movementStep=null;

  if(input.aim && started){
    const targetYaw=yaw+Math.PI;
    const diff=THREE.MathUtils.euclideanModulo(
      targetYaw-player.rotation.y+Math.PI,
      Math.PI*2
    )-Math.PI;
    player.rotation.y+=diff*Math.min(1,dt*18);
  }

  if(moving && started){
    const currentGround=groundHeightAt(player.position.x,player.position.z);
    const step=move.clone().multiplyScalar(speed*dt);
    movementStep=step;

    const nx=player.position.x+step.x;
    const nz=player.position.z+step.z;

    if(canTraverseTo(nx,player.position.z,currentGround,player.position.y,!grounded)){
      player.position.x=nx;
    }
    if(canTraverseTo(
      player.position.x,
      nz,
      groundHeightAt(player.position.x,player.position.z),
      player.position.y,
      !grounded
    )){
      player.position.z=nz;
    }

    if(!input.aim && !input.fire){
      const targetYaw=Math.atan2(step.x,step.z);
      const diff=THREE.MathUtils.euclideanModulo(
        targetYaw-player.rotation.y+Math.PI,
        Math.PI*2
      )-Math.PI;
      player.rotation.y+=diff*Math.min(1,dt*12);
    }
  }

  if(started && !input.aim){
    if(input.fire){
      // Fire immediately owns facing, even while WASD is held.
      updateReticleFacing(dt,18);
    }else if(!moving){
      // Releasing all WASD smoothly returns the body to the reticle.
      updateReticleFacing(dt,11.5);
    }
  }

  const surfaceY=groundHeightAt(player.position.x,player.position.z);

  if(started){
    if(jumpRequest && grounded && performance.now()-lastSpaceDown<220){
      performJump();
      jumpRequest=false;
    }else if(jumpRequest && performance.now()-lastSpaceDown>=220){
      jumpRequest=false;
    }

    if(grounded){
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
      const coverTop=topSurfaceAt(player.position.x,player.position.z);
      const landingY=Math.max(surfaceY,coverTop);

      if(nextY<=landingY){
        player.position.y=landingY;
        verticalVelocity=0;
        grounded=true;
        resolvePlayerPenetration();
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

  if(characterReady){
    setAction(moving?(sprint?'Run':'Walk'):'Idle',.15);
  }

  updateWeaponAnimation(dt);
  if(mixer) mixer.update(dt);

  // Base locomotion writes the whole skeleton first. The independent upper
  // mixer then writes only the armed upper-body tracks, so Walk/Run can never
  // overwrite the weapon pose.
  if(characterReady){
    updateUpperBodyWeaponTemplate(dt,moving,sprint);
    if(upperMixer) upperMixer.update(dt);
  }

  const carousel=world.userData.carouselRide;
  if(carousel) carousel.rotation.y += dt*carousel.userData.rotationSpeed;

  const fountain=world.userData.fountain;
  if(fountain){
    fountain.userData.updateParticles(dt, time);
    fountain.userData.coreRing.rotation.z=time*.00055;
    fountain.userData.pool.rotation.y=time*.00005;
  }

  if(weaponRoot){
    aimWeight=THREE.MathUtils.damp(
      aimWeight,
      input.aim?1:0,
      16,
      dt
    );
    updateWeaponState(dt);
  }

  if(input.fire) fireAccumulator+=dt;
  while(input.fire && fireAccumulator>=.088){
    fireAccumulator-=.088;
    fireWeapon();
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
    const baseY=Number.isFinite(c.baseY) ? c.baseY : 0;
    const topY=baseY+(Number.isFinite(c.h)?c.h:32);
    cameraBox.min.set(
      c.x-halfW-cameraCollisionRadius,
      baseY-cameraCollisionRadius,
      c.z-halfD-cameraCollisionRadius
    );
    cameraBox.max.set(
      c.x+halfW+cameraCollisionRadius,
      topY+cameraCollisionRadius,
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

  const effectiveDistance=THREE.MathUtils.lerp(cameraDistance,Math.min(cameraDistance,3.25),aimWeight);
  const effectiveHeight=THREE.MathUtils.lerp(cameraHeight,1.72,aimWeight);
  const horiz=Math.cos(pitch)*effectiveDistance;
  const desired=target.clone().add(new THREE.Vector3(
    Math.sin(yaw)*horiz,
    Math.sin(pitch)*effectiveDistance+effectiveHeight,
    Math.cos(yaw)*horiz
  ));

  const shoulderRight=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
  const effectiveShoulder=THREE.MathUtils.lerp(cameraShoulder,.82,aimWeight);
  desired.addScaledVector(shoulderRight,effectiveShoulder*shoulderSide);

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

  camera.position.lerp(desired,1-Math.pow(.0002,dt));

  const effectiveAimOffset=THREE.MathUtils.lerp(cameraAimOffset,.52,aimWeight);
  const lookTarget=target.clone().addScaledVector(shoulderRight,effectiveAimOffset*shoulderSide);
  camera.lookAt(lookTarget);

  const targetFov=THREE.MathUtils.lerp(67,53,aimWeight);
  if(Math.abs(camera.fov-targetFov)>.05){
    camera.fov=targetFov;
    camera.updateProjectionMatrix();
  }
}

// CDDA independent weapon IK layer

function __CDDA_findBoneExact(name){
  let found=null;
  if(!characterRoot) return null;
  characterRoot.traverse(o=>{
    if(o.isBone && String(o.name||'').toLowerCase()===name.toLowerCase()) found=o;
  });
  return found;
}

const __CDDA_weaponRig={
  rightGrip:new THREE.Vector3(0,-.18,-.42),
  leftGrip:new THREE.Vector3(0,-.18,.70)
};

let __CDDA_weaponRigReady=false;
let __CDDA_aimPoseWeight=0;
const __CDDA_combatNeutralPose=[];

function __CDDA_captureCombatNeutralPose(){
  __CDDA_combatNeutralPose.length=0;
  const bones=window.__CDDAWeaponBones;
  if(!bones) return;
  for(const key of [
    'spine05','spine04','spine03','spine02','spine01',
    'clavicleL','clavicleR'
  ]){
    const bone=bones[key];
    if(!bone) continue;
    __CDDA_combatNeutralPose.push({
      bone,
      quaternion:bone.quaternion.clone()
    });
  }
}

function __CDDA_restoreCombatNeutralPose(){
  for(const item of __CDDA_combatNeutralPose){
    item.bone.quaternion.copy(item.quaternion);
    item.bone.updateMatrixWorld(true);
  }
}

function __CDDA_refreshWeaponRig(){
  if(!characterRoot) return false;
  const names={
    spine01:'scout:spine01',
    spine02:'scout:spine02',
    spine03:'scout:spine03',
    spine04:'scout:spine04',
    spine05:'scout:spine05',
    clavicleL:'scout:clavicle.L',
    clavicleR:'scout:clavicle.R',
    rightUpper:'scout:upperarm01.r',
    rightElbow:'scout:lowerarm01.r',
    rightWrist:'scout:wrist.r',
    leftUpper:'scout:upperarm01.l',
    leftElbow:'scout:lowerarm01.l',
    leftWrist:'scout:wrist.l',
    neck1:'scout:neck01',
    neck2:'scout:neck02',
    neck3:'scout:neck03',
    head:'scout:head'
  };
  const next={};
  for(const [k,n] of Object.entries(names)){
    next[k]=__CDDA_findBoneExact(n);
  }
  if(!next.rightUpper||!next.rightElbow||!next.rightWrist||!next.leftUpper||!next.leftElbow||!next.leftWrist){
    return false;
  }
  aimBones={
    rightHand:next.rightWrist,
    leftHand:next.leftWrist,
    rightLowerArm:next.rightElbow,
    leftLowerArm:next.leftElbow,
    rightUpperArm:next.rightUpper,
    leftUpperArm:next.leftUpper
  };
  window.__CDDAWeaponBones=next;
  __CDDA_weaponRigReady=true;
  return true;
}

function __CDDA_setBoneWorldQuaternion(bone,worldQuaternion){
  if(!bone) return;
  if(!bone.parent){
    bone.quaternion.copy(worldQuaternion);
  }else{
    const parentWorld=new THREE.Quaternion();
    bone.parent.getWorldQuaternion(parentWorld);
    bone.quaternion.copy(parentWorld.invert().multiply(worldQuaternion));
  }
  bone.updateMatrixWorld(true);
}

function __CDDA_alignBoneChain(rootBone,endBone,targetDirection){
  if(!rootBone||!endBone||targetDirection.lengthSq()<1e-8) return;
  const rootPos=rootBone.getWorldPosition(new THREE.Vector3());
  const endPos=endBone.getWorldPosition(new THREE.Vector3());
  const currentDir=endPos.sub(rootPos).normalize();
  const desiredDir=targetDirection.clone().normalize();
  const delta=new THREE.Quaternion().setFromUnitVectors(currentDir,desiredDir);
  const currentWorldQ=new THREE.Quaternion();
  rootBone.getWorldQuaternion(currentWorldQ);
  __CDDA_setBoneWorldQuaternion(rootBone,delta.multiply(currentWorldQ));
}

function __CDDA_solveArm(side,targetWorld,hintWorld,weight){
  const upper=side==='right'?window.__CDDAWeaponBones.rightUpper:window.__CDDAWeaponBones.leftUpper;
  const elbow=side==='right'?window.__CDDAWeaponBones.rightElbow:window.__CDDAWeaponBones.leftElbow;
  const wrist=side==='right'?window.__CDDAWeaponBones.rightWrist:window.__CDDAWeaponBones.leftWrist;
  if(!upper||!elbow||!wrist||weight<=0) return;

  // The rig has an extra forearm segment (lowerarm02) between lowerarm01 and
  // the wrist. Solve against the actual wrist end-effector, and iterate twice
  // so the residual does not leave the hand visibly walking away from the gun.
  const solveOnce=()=>{
    const s=upper.getWorldPosition(new THREE.Vector3());
    const e=elbow.getWorldPosition(new THREE.Vector3());
    const w=wrist.getWorldPosition(new THREE.Vector3());
    const l1=s.distanceTo(e);
    const l2=e.distanceTo(w);
    if(l1<.05||l2<.05) return false;

    const desiredW=w.clone().lerp(targetWorld,THREE.MathUtils.clamp(weight,0,1));
    const axis=desiredW.clone().sub(s);
    let d=axis.length();
    if(d<.001) return false;

    const maxD=Math.max(.06,l1+l2-.012);
    const minD=Math.abs(l1-l2)+.012;
    d=THREE.MathUtils.clamp(d,minD,maxD);
    axis.multiplyScalar(1/axis.length());

    const hint=hintWorld.clone().sub(s);
    hint.addScaledVector(axis,-hint.dot(axis));
    if(hint.lengthSq()<1e-6){
      hint.set(side==='right'?1:-1,0,0);
      hint.addScaledVector(axis,-hint.dot(axis));
    }
    hint.normalize();

    const along=(l1*l1+d*d-l2*l2)/(2*d);
    const lateral=Math.sqrt(Math.max(0,l1*l1-along*along));
    const elbowTarget=s.clone()
      .addScaledVector(axis,along)
      .addScaledVector(hint,lateral);

    __CDDA_alignBoneChain(upper,elbow,elbowTarget.clone().sub(s));
    characterRoot.updateMatrixWorld(true);

    const elbowNow=elbow.getWorldPosition(new THREE.Vector3());
    const lowerDir=desiredW.clone().sub(elbowNow);
    if(lowerDir.lengthSq()>1e-6){
      __CDDA_alignBoneChain(elbow,wrist,lowerDir);
      characterRoot.updateMatrixWorld(true);
    }
    return true;
  };

  solveOnce();
  solveOnce();
}

function __CDDA_weaponPoseFromGrips(rightGripWorld,leftGripWorld,outPosition,outQuaternion){
  const forward=leftGripWorld.clone().sub(rightGripWorld);
  if(forward.lengthSq()<1e-6) forward.copy(getRoleForward());
  forward.normalize();

  const up=new THREE.Vector3(0,1,0);
  const right=new THREE.Vector3().crossVectors(up,forward);
  if(right.lengthSq()<1e-6) right.set(1,0,0);
  else right.normalize();
  const correctedUp=new THREE.Vector3().crossVectors(forward,right).normalize();

  weaponBasis.makeBasis(right,correctedUp,forward);
  outQuaternion.setFromRotationMatrix(weaponBasis);

  const gripLocal=(weaponSockets.rightGrip?.position?.clone()||__CDDA_weaponRig.rightGrip.clone())
    .multiplyScalar(weaponRoot?.scale.x||1);
  const scaledSocket=gripLocal;
  scaledSocket.applyQuaternion(outQuaternion);
  outPosition.copy(rightGripWorld).sub(scaledSocket);
}

function __CDDA_playerLocalPose(worldPosition,worldQuaternion){
  const localPos=worldPosition.clone();
  player.worldToLocal(localPos);
  const invPlayer=player.getWorldQuaternion(new THREE.Quaternion()).invert();
  return {position:localPos,quaternion:invPlayer.multiply(worldQuaternion)};
}

function __CDDA_getBaseHandTargets(){
  const r=window.__CDDAWeaponBones.rightWrist.getWorldPosition(new THREE.Vector3());
  const l=window.__CDDAWeaponBones.leftWrist.getWorldPosition(new THREE.Vector3());
  return {right:r,left:l};
}

function __CDDA_getWeaponGripTargets(aimWeight){
  const playerPos=player.getWorldPosition(new THREE.Vector3());
  const forward=getRoleForward();
  const rightAxis=new THREE.Vector3(1,0,0)
    .applyQuaternion(player.getWorldQuaternion(new THREE.Quaternion()))
    .normalize();
  const up=new THREE.Vector3(0,1,0);

  // Match hand spacing to the actual weapon sockets. Both hands stay on the
  // right-shoulder side of the body instead of pulling the rifle diagonally
  // across the chest.
  const rightHeight=THREE.MathUtils.lerp(1.18,1.34,aimWeight);
  const rightForward=THREE.MathUtils.lerp(.38,.50,aimWeight);
  const lateralRight=THREE.MathUtils.lerp(.17,.19,aimWeight);
  const lateralLeft=THREE.MathUtils.lerp(.12,.14,aimWeight);
  const scale=weaponRoot?.scale.x||.60;
  const fallbackSpan=Math.abs(__CDDA_weaponRig.leftGrip.z-__CDDA_weaponRig.rightGrip.z)*scale;
  const socketSpan=weaponSockets.leftGrip&&weaponSockets.rightGrip
    ? Math.abs(weaponSockets.leftGrip.position.z-weaponSockets.rightGrip.position.z)*scale
    : fallbackSpan;
  const leftForward=rightForward+socketSpan;

  const r=playerPos.clone()
    .addScaledVector(rightAxis,lateralRight)
    .addScaledVector(up,rightHeight)
    .addScaledVector(forward,rightForward);

  const l=playerPos.clone()
    .addScaledVector(rightAxis,lateralLeft)
    .addScaledVector(up,rightHeight+.008)
    .addScaledVector(forward,leftForward);

  if(recoilKick>.001){
    const recoil=forward.clone().multiplyScalar(-.040*recoilKick);
    r.add(recoil); l.add(recoil);
    r.y+=.012*recoilKick; l.y+=.010*recoilKick;
  }

  return {right:r,left:l};
}

function __CDDA_applyHeadAim(weight){
  const bones=window.__CDDAWeaponBones;
  if(!bones?.head||!bones?.neck1) return;

  const playerPos=player.getWorldPosition(new THREE.Vector3());
  const forward=getRoleForward();
  const rightAxis=new THREE.Vector3(1,0,0).applyQuaternion(player.getWorldQuaternion(new THREE.Quaternion())).normalize();

  const cameraDir=new THREE.Vector3();
  camera.getWorldDirection(cameraDir);
  if(cameraDir.lengthSq()<1e-6) cameraDir.copy(forward);
  cameraDir.normalize();

  const horizontal=new THREE.Vector3(cameraDir.x,0,cameraDir.z);
  if(horizontal.lengthSq()<1e-6) horizontal.copy(forward);
  horizontal.normalize();

  const yawTarget=Math.atan2(horizontal.x,horizontal.z);
  const bodyYaw=player.rotation.y;
  let relYaw=THREE.MathUtils.euclideanModulo(yawTarget-bodyYaw+Math.PI,Math.PI*2)-Math.PI;
  relYaw=THREE.MathUtils.clamp(
    relYaw,
    -THREE.MathUtils.degToRad(28),
    THREE.MathUtils.degToRad(28)
  );

  let pitch=-Math.asin(THREE.MathUtils.clamp(cameraDir.y,-.92,.92));
  pitch=THREE.MathUtils.clamp(
    pitch+THREE.MathUtils.degToRad(2),
    -THREE.MathUtils.degToRad(8),
    THREE.MathUtils.degToRad(15)
  );

  for(const [bone,share] of [
    [bones.neck1,.25],[bones.neck2,.25],[bones.neck3,.20],[bones.head,.30]
  ]){
    if(!bone) continue;
    const baseQ=bone.getWorldQuaternion(new THREE.Quaternion());
    const qYaw=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),relYaw*weight*share);
    const qPitch=new THREE.Quaternion().setFromAxisAngle(rightAxis,pitch*weight*share);
    const desired=qPitch.multiply(qYaw).multiply(baseQ);
    __CDDA_setBoneWorldQuaternion(bone,desired);
  }
}

function __CDDA_restoreHeadPose(){
  // Mixer re-applies the authored head pose next frame; this function is kept
  // as a named hook for future head-look layers.
}

function __CDDA_applyWeaponPose(dt){
  if(!weaponRoot) return;

  const rigReady=!!characterRoot &&
    (__CDDA_weaponRigReady || __CDDA_refreshWeaponRig());

  let armBlend=1;
  if(weaponState==='holstered'){
    armBlend=0;
  }else if(weaponState==='drawing'){
    armBlend=smoothWeaponT(
      (performance.now()-weaponTransition.startedAt)/weaponTransition.duration
    );
  }else if(weaponState==='holstering'){
    armBlend=1-smoothWeaponT(
      (performance.now()-weaponTransition.startedAt)/weaponTransition.duration
    );
  }
  armBlend=THREE.MathUtils.clamp(armBlend,0,1);
  weaponPoseWeight=armBlend;

  const poseWanted=weaponState==='equipped'
    ? (input.aim?1:(input.fire?.82:.15))
    : 0;
  __CDDA_aimPoseWeight=THREE.MathUtils.damp(
    __CDDA_aimPoseWeight,
    poseWanted,
    input.aim?24:(input.fire?30:10),
    dt
  );

  const baseHands=rigReady?__CDDA_getBaseHandTargets():null;
  const targetHands=rigReady
    ? __CDDA_getWeaponGripTargets(__CDDA_aimPoseWeight)
    : null;

  const readyPosition=new THREE.Vector3();
  const readyQuaternion=new THREE.Quaternion();
  const fallbackRight=player.getWorldPosition(new THREE.Vector3())
    .addScaledVector(new THREE.Vector3(1,0,0).applyQuaternion(player.quaternion),.17)
    .add(new THREE.Vector3(0,1.18,.38).applyQuaternion(player.quaternion));
  const fallbackLeft=fallbackRight.clone().add(getRoleForward().multiplyScalar(.67));

  __CDDA_weaponPoseFromGrips(
    targetHands?.right||fallbackRight,
    targetHands?.left||fallbackLeft,
    readyPosition,
    readyQuaternion
  );

  const readyLocalPosition=readyPosition.clone();
  player.worldToLocal(readyLocalPosition);
  const playerInverse=player.getWorldQuaternion(new THREE.Quaternion()).invert();
  const readyLocalQuaternion=playerInverse.multiply(readyQuaternion);

  if(weaponState==='drawing'){
    weaponRoot.position.lerpVectors(
      weaponTransition.fromPosition,
      readyLocalPosition,
      armBlend
    );
    weaponRoot.quaternion.copy(weaponTransition.fromQuaternion)
      .slerp(readyLocalQuaternion,armBlend);
  }else if(weaponState==='holstering'){
    const p=1-armBlend;
    weaponRoot.position.lerpVectors(
      weaponTransition.fromPosition,
      weaponHolsterPosition,
      p
    );
    weaponRoot.quaternion.copy(weaponTransition.fromQuaternion)
      .slerp(weaponHolsterQuaternion,p);
  }else if(weaponState==='holstered'){
    weaponRoot.position.copy(weaponHolsterPosition);
    weaponRoot.quaternion.copy(weaponHolsterQuaternion);
  }else{
    weaponRoot.position.copy(readyLocalPosition);
    weaponRoot.quaternion.copy(readyLocalQuaternion);
  }

  if(rigReady&&armBlend>.001){
    weaponRoot.updateMatrixWorld(true);

    // The upper-body animation is now authoritative. Use the actual wrists
    // produced by that template as the two physical gun attachment points.
    const solvedR=window.__CDDAWeaponBones.rightWrist.getWorldPosition(new THREE.Vector3());
    const solvedL=window.__CDDAWeaponBones.leftWrist.getWorldPosition(new THREE.Vector3());

    const attachedPosition=new THREE.Vector3();
    const attachedQuaternion=new THREE.Quaternion();
    __CDDA_weaponPoseFromGrips(
      solvedR,
      solvedL,
      attachedPosition,
      attachedQuaternion
    );

    const attachedLocalPosition=attachedPosition.clone();
    player.worldToLocal(attachedLocalPosition);
    const attachedLocalQuaternion=player.getWorldQuaternion(new THREE.Quaternion()).invert()
      .multiply(attachedQuaternion);

    weaponRoot.position.copy(attachedLocalPosition);
    weaponRoot.quaternion.copy(attachedLocalQuaternion);
    weaponRoot.updateMatrixWorld(true);

    // Aim only changes the head/neck after the armed body template is locked.
    if(__CDDA_aimPoseWeight>.35){
      __CDDA_applyHeadAim(__CDDA_aimPoseWeight);
      characterRoot.updateMatrixWorld(true);
    }
  }

  if(muzzleFlash){
    muzzleFlash.visible=recoilKick>.06&&weaponState!=='holstered';
    muzzleFlash.scale.setScalar(.74+recoilKick*1.05);
  }

  updateAimVisual(aimWeight);
  weaponRoot.position.z-=recoilKick*.018;

  if(weaponTransition.active){
    const raw=(performance.now()-weaponTransition.startedAt)/weaponTransition.duration;
    if(raw>=1){
      weaponTransition.active=false;
      if(weaponTransition.target==='equipped'){
        weaponState='equipped';
        if(fireQueued){
          fireQueued=false;
          fireWeapon();
        }
      }else{
        weaponState='holstered';
        __CDDA_aimPoseWeight=0;
        fireQueued=false;
      }
    }
  }

  recoilKick=Math.max(0,recoilKick-dt*8.5);
  recoilYaw=THREE.MathUtils.damp(recoilYaw,0,12,dt);
  recoilPitch=THREE.MathUtils.damp(recoilPitch,0,12,dt);
}
// Replace the old "grasp clip" layer. The character asset's grasp clip is kept
// as source material, but it no longer drives the arms into a mismatched pose.
updateWeaponAnimation=function(dt){
  if(weaponGraspAction){
    weaponGraspAction.enabled=false;
    weaponGraspAction.setEffectiveWeight(0);
  }
};

updateWeaponState=function(dt){
  __CDDA_applyWeaponPose(dt);
};

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
  shoulderLabel:shoulderSide>0?'left':'right',
  weapon:{
    state:weaponState,
    transition:weaponTransition.active,
    poseWeight:weaponPoseWeight,
    ammo,
    combatPose:__CDDA_aimPoseWeight,
    rightGrip:weaponSockets.rightGrip?.name||null,
    leftGrip:weaponSockets.leftGrip?.name||null,
    muzzle:weaponSockets.muzzle?.name||null
  }
});