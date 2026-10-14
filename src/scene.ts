import * as T from 'three';
import type { Preferences, ScreenState } from './state';
import { createLobby } from './lobby-scene';
import { defaults, type HomePreview } from './home-state';

const boxGeometry = new T.BoxGeometry(1, 1, 1);
const up = new T.Vector3(0, 1, 0);
function seeded(seed: number) { return () => { seed |= 0; seed = seed + 0x6d2b79f5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const random = seeded(28117);
const between = (a: number, b: number) => a + random() * (b - a);
function material(color: number, map?: T.Texture) { return new T.MeshLambertMaterial({ color, map: map ?? null }); }
/** Static cubes are instanced by material: no physics, runtime debris or dynamic shadows. */
class Blocks {
  root: T.Group;
  batches = new Map<T.Material, T.Matrix4[]>();
  constructor(root: T.Group) { this.root = root; }
  add(m: T.Material, x: number, y: number, z: number, w: number, h: number, d: number, rx = 0, ry = 0, rz = 0) {
    const matrix = new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(rx, ry, rz)), new T.Vector3(w, h, d));
    if (!this.batches.has(m)) this.batches.set(m, []);
    this.batches.get(m)!.push(matrix);
  }
  beam(m: T.Material, from: number[], to: number[], thickness: number) {
    const a = new T.Vector3(...from), b = new T.Vector3(...to), delta = b.clone().sub(a);
    const matrix = new T.Matrix4().compose(a.add(b).multiplyScalar(.5), new T.Quaternion().setFromUnitVectors(up, delta.clone().normalize()), new T.Vector3(thickness, delta.length(), thickness));
    if (!this.batches.has(m)) this.batches.set(m, []);
    this.batches.get(m)!.push(matrix);
  }
  finish() {
    this.batches.forEach((matrices, mat) => {
      const instance = new T.InstancedMesh(boxGeometry, mat, matrices.length);
      matrices.forEach((matrix, i) => instance.setMatrixAt(i, matrix));
      instance.instanceMatrix.needsUpdate = true;
      instance.computeBoundingSphere();
      this.root.add(instance);
    });
  }
}
function facadeTexture(seed: number) {
  const rng = seeded(seed), c = document.createElement('canvas'); c.width = 256; c.height = 512;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#777973'; ctx.fillRect(0, 0, 256, 512);
  for (let y = 0; y < 512; y += 30) {
    ctx.fillStyle = '#4e5350'; ctx.fillRect(0, y + 28, 256, 2);
    for (let x = 0; x < 256; x += 27) {
      const broken = rng() > .8;
      ctx.fillStyle = broken ? '#1a211f' : rng() > .5 ? '#333d3b' : '#4b5754';
      ctx.fillRect(x + 4, y + 5, 18, 19);
      ctx.fillStyle = '#9b9b8b';ctx.globalAlpha = .23;ctx.fillRect(x+4,y+5,1,19);ctx.globalAlpha=1;
      if (broken) { ctx.fillStyle = '#252d29'; ctx.fillRect(x + 2, y + 3, 21, 7); }
    }
  }
  for (let i = 0; i < 800; i++) {
    ctx.fillStyle = rng() > .45 ? '#111713' : '#b3b3a4'; ctx.globalAlpha = rng() * .14;
    ctx.fillRect(rng() * 256, rng() * 512, rng() * 5, rng() * 80);
  }
  ctx.globalAlpha = 1;
  const texture = new T.CanvasTexture(c); texture.colorSpace = T.SRGBColorSpace; return texture;
}
function roadTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512; const ctx = c.getContext('2d')!;
  const rng = seeded(3013); ctx.fillStyle = '#4a4d45'; ctx.fillRect(0, 0, 512, 512);
  for (let i=0;i<12000;i++) {const g=40+rng()*68;ctx.fillStyle=`rgba(${g},${g},${g-3},.22)`;ctx.fillRect(rng()*512,rng()*512,1+rng()*2,1+rng()*2);}
  for(let i=0;i<16;i++){let x=rng()*512,y=rng()*512;ctx.beginPath();ctx.moveTo(x,y);for(let j=0;j<5;j++){x+=rng()*70-35;y+=rng()*65;ctx.lineTo(x,y);}ctx.strokeStyle='#232c25';ctx.lineWidth=1+rng()*3;ctx.stroke();}
  const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.repeat.set(14,14);return texture;
}
function addSign(root:T.Group,text:string,x:number,y:number,z:number,w:number,h:number,rotation=0){
 const c=document.createElement('canvas');c.width=512;c.height=160;const ctx=c.getContext('2d')!;
 ctx.fillStyle='#3d4d42';ctx.fillRect(0,0,512,160);ctx.strokeStyle='#a2aa97';ctx.lineWidth=3;ctx.strokeRect(8,8,496,144);
 ctx.fillStyle='#b8c1ab';ctx.font='bold 49px sans-serif';ctx.textAlign='center';ctx.fillText(text,256,74);ctx.font='22px monospace';ctx.fillText('TOKYO     /     通行止',256,122);
 ctx.fillStyle='#1b281f';ctx.globalAlpha=.25;ctx.fillRect(0,94,205,12);ctx.fillRect(354,0,18,160);
 const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;
 const mesh=new T.Mesh(new T.PlaneGeometry(w,h),material(0xb5b5a8,texture));mesh.position.set(x,y,z);mesh.rotation.z=rotation;root.add(mesh);
}
function createTokyo() {
  const scene = new T.Scene(); scene.background = new T.Color(0x828780); scene.fog = new T.Fog(0x828780, 36, 260);
  const world = new T.Group(); scene.add(world);
  scene.add(new T.HemisphereLight(0xe1e4d5,0x252e27,2));
  const light=new T.DirectionalLight(0xf4edda,2.1);light.position.set(-80,90,35);scene.add(light);
  const concrete=material(0x73766c),slab=material(0x818278),dark=material(0x313a33),steel=material(0x333e36),rust=material(0x675346),marks=material(0xaca992);
  const facades=[material(0x9ca096,facadeTexture(10)),material(0x858c82,facadeTexture(14)),material(0xadb0a1,facadeTexture(97))];
  const b = new Blocks(world);
  const ground=new T.Mesh(new T.PlaneGeometry(620,640),material(0x96978d,roadTexture()));ground.rotation.x=-Math.PI/2;ground.position.set(0,-.2,-200);world.add(ground);
  // A fractured, empty boulevard leads the eye into Tokyo. Geography is intentionally stylized.
  b.add(concrete,-22,.24,-100,13,.55,330);b.add(concrete,23,.24,-100,13,.55,330);
  for(let z=29;z>-280;z-=12){b.add(marks,-.9,.015,z,.17,.035,5);b.add(marks,.9,.015,z,.17,.035,5);}
  for(let side of [-1,1])for(let i=0;i<11;i++){
    const z=9-i*26+between(-4,4),w=between(13,25),h=between(24,69),d=between(13,23),x=side*(25+between(-3,6));
    const f=facades[i%3],base=h*(i%3===0?.61:.79);
    b.add(f,x,base/2,z,w,base,d);
    b.add(dark,x,base+.15,z,w*.88,.35,d*.88);
    // Missing roofs, exposed floor plates and broken columns, rather than intact box towers.
    const floors=Math.floor((h-base)/3.8);
    for(let n=0;n<floors;n++){
      const yy=base+n*3.8;
      const frac=1-n/(floors+1)*.46;
      b.add(slab,x+side*n*.75,yy,z,w*frac,.4,d*(1-n/(floors+1)*.35),0,0,n===floors-1?side*.045:0);
      for(let corner=0;corner<4;corner++){
        if(n>floors/2&&random()<.3)continue;
        const px=x+(corner%2===0?-1:1)*w*frac*.44;
        const pz=z+(corner<2?-1:1)*d*.43;
        b.add(concrete,px,yy+1.7,pz,.58,3.5,.62);
      }
    }
    for(let n=0;n<6;n++){const px=x+between(-w*.4,w*.4);b.add(steel,px,h+between(-6,1),z+between(-d*.4,d*.4),.12,between(2,6),.12,0,0,between(-.25,.25));}
    b.add(dark,x,1.8,z+d*.5+.035,w*.8,3.2,.15);
    if(i<5)b.add(concrete,x,4,z+d*.5+.5,w*1.06,.45,1.7,0,0,side*.008);
  }
  // Ragged, receding skyline and a leaning tower.
  for(let i=0;i<31;i++){const x=between(-155,155),h=between(19,70),z=between(-340,-212);b.add(facades[i%3],x,h/2,z,between(9,23),h,between(13,24),0,between(-.1,.1),i===5?-.09:0);}
  b.add(facades[1],56,49,-94,21,90,21,0,0,.11);b.add(slab,52,95,-94,24,.8,23,0,0,.11);
  // A partially fallen elevated road; the break leaves the central view open.
  for(let x=24;x<92;x+=15){b.add(concrete,x,4,-53,2.6,8,3.4);b.add(slab,x,8.1,-53,16,1.4,9);b.add(dark,x,9.1,-56.8,16,.8,.38);}
  b.add(slab,15,5.1,-53,19,1.4,9,0,0,.44);
  for(let i=0;i<10;i++)b.beam(steel,[20,8.6,-57+i*.8],[12+between(-2,2),6,-57+i*.8],.12);
  // Tokyo Tower-inspired silhouette, not a geographical replica or third-party asset.
  const tx=-8,tz=-128,segments=[{y:0,r:8.2},{y:24,r:4},{y:42,r:2.3},{y:62,r:.8},{y:79,r:.1}];
  for(let s=0;s<segments.length-1;s++){
    const a=segments[s],c=segments[s+1];
    for(let dx of [-1,1])for(let dz of [-1,1]){
      const lean=s>2?2.1:0;
      b.beam(rust,[tx+dx*a.r,a.y,tz+dz*a.r],[tx+dx*c.r+lean,c.y,tz+dz*c.r],s<2?.53:.28);
      if(s<3){const step=4;for(let y=a.y;y<c.y-2;y+=step){const r=a.r+(c.r-a.r)*(y-a.y)/(c.y-a.y),r2=a.r+(c.r-a.r)*(y+step-a.y)/(c.y-a.y);b.beam(rust,[tx+dx*r,y,tz+dz*r],[tx-dx*r2,y+step,tz+dz*r2],.15);}}
    }
  }
  b.add(rust,tx,24,tz,11,2,11);b.add(concrete,tx,26,tz,8,1.2,8);b.add(rust,tx,43,tz,6,2,6);
  // Utility poles and slack cables are inert. No busy sky effects.
  const wirePoints:T.Vector3[]=[];
  for(let side of [-1,1])for(let i=0;i<5;i++){
    const x=side*15.8,z=10-i*29,lean=side*(i===0?1.2:.15);
    b.beam(steel,[x,0,z],[x+lean,9,z],.2);b.add(steel,x+lean+side*1.1,9,z,2.6,.17,.18);b.add(dark,x+lean+side*1.9,8.8,z,.7,.3,.4);
    if(i<4)for(let j=0;j<20;j++){const t=j/20,tt=(j+1)/20;wirePoints.push(new T.Vector3(x+lean,8.8-Math.sin(t*Math.PI)*1.6,z-t*29),new T.Vector3(x+lean,8.8-Math.sin(tt*Math.PI)*1.6,z-tt*29));}
  }
  world.add(new T.LineSegments(new T.BufferGeometry().setFromPoints(wirePoints),new T.LineBasicMaterial({color:0x263329})));
  // Rubble and worn lane fragments share a handful of instanced meshes.
  for(let i=0;i<330;i++){
    const z=between(-185,31),side=random()>.5?1:-1,x=side*between(7,22),s=between(.2,1.6);
    b.add(i%3===0?dark:concrete,x,s*.37,z,s*between(1,2.8),s*.7,s*between(.7,2.2),between(-.5,.5),between(-3,3),between(-.4,.4));
  }
  for(let i=0;i<26;i++){
    const x=between(-10,10),z=between(-90,21);
    b.add(dark,x,.013,z,between(1,3),.025,between(.4,3),0,between(-3,3));
  }
  // Abandoned cars: recognizable silhouettes without heavy meshes.
  for(const [x,z,rot] of [[-11,10,.14],[10,-21,-.3],[-13,-75,.6],[15,-113,-.1]]){
    b.add(dark,x,.65,z,2.1,1.1,4.5,0,rot,0);b.add(steel,x,1.5,z-.15,1.8,.8,2.3,0,rot,0);
    b.add(material(0x404a42),x,1.5,z+1.04,1.55,.55,.025,0,rot,0);
    for(let dx of [-1,1])for(let dz of [-1,1])b.add(dark,x+dx*1.05,.4,z+dz*1.45,.3,.65,.65);
  }
  // A collapsed barrier in the foreground and a weathered road sign.
  b.add(concrete,-10,.7,20,5,1.4,.85,0,.2,.03);for(let i=0;i<4;i++)b.add(rust,-11.5+i,.8,20.5,.35,.7,.06,0,.2,.5);
  b.beam(steel,[9,0,-32],[9,11,-32],.32);b.beam(steel,[9,11,-32],[-2,11,-32],.25);
  addSign(world,'東京方面',3.6,9.8,-31.8,8.5,2.65,-.055);
  b.finish();
  const bossMat=new T.MeshBasicMaterial({color:0x202824,transparent:true,opacity:0,depthWrite:false,fog:false});
  const boss=new T.Group(); const bb=new Blocks(boss); const bx=28,bz=-218;
  bb.add(bossMat,bx,85,bz,39,25,16,0,0,-.035);bb.add(bossMat,bx-3,106,bz,17,14,13,.1,0,.08);
  bb.add(bossMat,bx-2,111,bz,30,3,10,0,0,.12);
  for(let side of [-1,1]){
    bb.beam(bossMat,[bx+side*13,91,bz],[bx+side*44,77,bz+5],9);
    bb.beam(bossMat,[bx+side*44,77,bz+5],[bx+side*65,31,bz+5],5.6);
    bb.beam(bossMat,[bx+side*65,31,bz+5],[bx+side*72,0,bz+8],3.2);
    bb.beam(bossMat,[bx+side*12,79,bz+8],[bx+side*22,42,bz+25],8);
    bb.beam(bossMat,[bx+side*22,42,bz+25],[bx+side*17,0,bz+37],5);
    bb.add(bossMat,bx+side*22,101,bz,5,18,6,0,0,-side*.12);
  }
  bb.finish();boss.visible=false;scene.add(boss);
  return { scene, boss, bossMat };
}
export class WorldView {
  renderer:T.WebGLRenderer;
  title:ReturnType<typeof createTokyo>;
  lobby:ReturnType<typeof createLobby> | null = null;
  camera=new T.PerspectiveCamera(54,1,.1,700);
  pointer=new T.Vector2();
  previewSettings:HomePreview=defaults();
  stage={left:250,top:150,width:800,height:500};
  labels:HTMLElement[]=[];
  layoutKey='';
  bounds:{left:number;right:number;top:number;bottom:number}[]=[];
  preview(value:HomePreview){this.previewSettings=value;this.lobby?.preview(value);}
  setStage(rect:DOMRect,labels:HTMLElement[]){this.stage={left:rect.left,top:rect.top,width:Math.max(1,rect.width),height:Math.max(1,rect.height)};this.labels=labels;this.layoutKey='';}
  reducedMotion=false;
  quality:'balanced'|'low'='balanced';
  width=1;height=1;
  lost=false;
  onLost:()=>void;
  constructor(host:HTMLElement,onLost:()=>void){
    this.onLost=onLost;
    this.renderer=new T.WebGLRenderer({antialias:true,alpha:false,powerPreference:'low-power'});
    this.renderer.outputColorSpace=T.SRGBColorSpace;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=.95;
    host.append(this.renderer.domElement);
    this.renderer.domElement.addEventListener('webglcontextlost',this.contextLost);
    this.title=createTokyo();
  }
  contextLost=(event:Event)=>{event.preventDefault();this.lost=true;this.onLost();};
  preferences(p:Preferences){this.reducedMotion=p.reducedMotion;this.quality=p.quality;this.resize();}
  resize(){this.width=innerWidth;this.height=innerHeight;const mobile=this.width<700;this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,this.quality==='low'?.75:mobile?1:1.25));this.renderer.setSize(this.width,this.height);this.camera.aspect=this.width/this.height;this.camera.updateProjectionMatrix();}
  render(time:number,state:ScreenState,opacity:number){
    if(this.lost)return;
    if(state.screen==='title'){
      const drift=this.reducedMotion?0:Math.sin(time*.00007)*.4;
      const px=this.reducedMotion?0:this.pointer.x*.4,py=this.reducedMotion?0:this.pointer.y*.2;
      this.camera.clearViewOffset();
      this.camera.fov=this.width<700?63:54;
      this.camera.position.set(1.5+drift+px,5.2+py,35);this.camera.lookAt(0,13,-98);
      this.title.boss.visible=opacity>0;this.title.bossMat.opacity=opacity;
      this.camera.updateProjectionMatrix();this.renderer.render(this.title.scene,this.camera);
    }else{
      if(!this.lobby){this.lobby=createLobby();this.lobby.preview(this.previewSettings);}
      const portrait=this.width/this.height<.85;
      const key=`${this.width}:${this.height}:${state.squadPreview}:${this.stage.left}:${this.stage.top}:${this.stage.width}:${this.stage.height}`;
      if(key!==this.layoutKey){
        this.layoutKey=key;this.lobby.formation(state.squadPreview,portrait);
        const s=this.stage, centerX=s.left+s.width/2,centerY=s.top+s.height/2;
        this.camera.fov=34;
        const tan=Math.tan(this.camera.fov*Math.PI/360);
        const span=state.squadPreview?(portrait?4.45:6.8):2.45;
        let distance=Math.max(3.65/(2*tan*s.height/this.height),span/(2*tan*this.camera.aspect*s.width/this.width));
        this.camera.setViewOffset(this.width,this.height,this.width/2-centerX,this.height/2-centerY,this.width,this.height);
        const corners=this.lobby.survivors.map(({group})=>{
          group.updateMatrixWorld(true);const box=new T.Box3().setFromObject(group),points:T.Vector3[]=[];
          for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])points.push(new T.Vector3(x,y,z));
          return points;
        });
        // Fit actual model and weapon bounds into the unobstructed stage, including portrait.
        for(let pass=0;pass<4;pass++){
          this.camera.position.set(state.squadPreview?.20:0,1.52+distance*.065,distance+1);this.camera.lookAt(state.squadPreview?.20:0,1.48,0);
          this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld();
          this.bounds=corners.map(points=>{const projected=points.map(p=>p.clone().project(this.camera));return{left:Math.min(...projected.map(p=>(p.x+1)*this.width/2)),right:Math.max(...projected.map(p=>(p.x+1)*this.width/2)),top:Math.min(...projected.map(p=>(1-p.y)*this.height/2)),bottom:Math.max(...projected.map(p=>(1-p.y)*this.height/2))};});
          const ratio=Math.max(...this.bounds.filter((_,i)=>i===0||state.squadPreview).map(b=>Math.max(Math.abs(b.left-centerX)/(s.width/2),Math.abs(b.right-centerX)/(s.width/2),Math.abs(b.top-centerY)/(s.height/2),Math.abs(b.bottom-centerY)/(s.height/2))));
          if(ratio<.96)break;distance*=ratio*1.06;
        }
        this.lobby.survivors.forEach((survivor,i)=>{
          const label=this.labels[i];if(!label)return;label.hidden=!survivor.group.visible;
          const pos=new T.Vector3(survivor.group.position.x,-.10,survivor.group.position.z).project(this.camera);
          label.style.left=`${(pos.x+1)*this.width/2}px`;label.style.top=`${(1-pos.y)*this.height/2}px`;
        });
      }
      this.lobby.idle(time,this.reducedMotion);
      this.renderer.render(this.lobby.scene,this.camera);
    }
  }
  stats(){const info=this.renderer.info;return{drawCalls:info.render.calls,triangles:info.render.triangles,geometries:info.memory.geometries,textures:info.memory.textures,pixelRatio:this.renderer.getPixelRatio(),idle:this.lobby?.survivors[0].body.position.y??0,bounds:this.bounds,formation:this.lobby?.survivors.map(s=>({visible:s.group.visible,x:s.group.position.x,z:s.group.position.z}))??[]};}
  dispose(){this.renderer.domElement.removeEventListener('webglcontextlost',this.contextLost);const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>(),textures=new Set<T.Texture>();
    for(const scene of [this.title.scene,this.lobby?.scene])scene?.traverse((o)=>{const mesh=o as T.Mesh;if(mesh.geometry)geometries.add(mesh.geometry);for(const m of Array.isArray(mesh.material)?mesh.material:mesh.material?[mesh.material]:[]){materials.add(m);const map=(m as T.MeshLambertMaterial).map;if(map)textures.add(map);}});
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());this.renderer.dispose();this.renderer.domElement.remove();}
}
