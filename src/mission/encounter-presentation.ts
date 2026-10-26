import * as T from 'three';
import type { ActorPosition, EnemyKind } from './actors.ts';

export type MissionMarker=ActorPosition|Readonly<{id?:string;position:ActorPosition;radius?:number;height?:number;visible?:boolean}>;
export type SpawnDeviceVisual=Readonly<{id:string;kind:EnemyKind;position:ActorPosition;destroyed?:boolean;radius?:number;hp?:number;maxHp?:number}>;
export type EncounterPresentationOptions=Readonly<{reducedMotion?:boolean;viewDistance?:number}>;
type Bar={root:T.Group;fill:T.Mesh;position:T.Vector3;alive:boolean};
type Damage={root:T.Group;glyphs:T.Mesh[];material:T.MeshBasicMaterial;origin:T.Vector3;age:number;active:boolean;serial:number};
type Device={root:T.Group;kind:EnemyKind;energy:T.Object3D[];destroyed:boolean};

const valid=(p:ActorPosition)=>[p.x,p.y,p.z].every(Number.isFinite);
const MAX_ENEMIES=50,MAX_DEVICES=2,MAX_DAMAGE=32,MAX_MARKERS=16;
const GLYPHS='0123456789-+';

function damageAtlas():T.Texture {
  if(typeof document!=='undefined'){
    const canvas=document.createElement('canvas');canvas.width=GLYPHS.length*64;canvas.height=96;
    const context=canvas.getContext('2d');
    if(context){
      context.textAlign='center';context.textBaseline='middle';context.font='900 68px "Arial Black",Arial,sans-serif';context.lineWidth=8;context.lineJoin='round';context.strokeStyle='#15151b';context.fillStyle='#ffffff';
      for(let i=0;i<GLYPHS.length;i++){context.strokeText(GLYPHS[i],i*64+32,49);context.fillText(GLYPHS[i],i*64+32,49);}
      const texture=new T.CanvasTexture(canvas);texture.generateMipmaps=false;texture.minFilter=texture.magFilter=T.LinearFilter;texture.colorSpace=T.SRGBColorSpace;return texture;
    }
  }
  // Geometry/resource checks run without a DOM. Real browsers use the atlas above.
  const patterns=['111111000110011101011100111000111111','00100011000010000100001000010001110','11111000010000111111100001000011111','11111000010000101111000010000111111','10001100011000111111000010000100001','11111100001000011111000010000111111','11111100001000011111100011000111111','11111000010001000100010000100001000','11111100011000111111100011000111111','11111100011000111111000010000111111','00000000000000011111000000000000000','00100001000010011111001000010000100'];
  const width=GLYPHS.length*6,height=8,bytes=new Uint8Array(width*height*4);
  for(let digit=0;digit<patterns.length;digit++)for(let y=0;y<7;y++)for(let x=0;x<5;x++)if(patterns[digit][y*5+x]==='1'){const at=((height-1-y)*width+digit*6+x)*4;bytes.set([255,255,255,255],at);}
  const texture=new T.DataTexture(bytes,width,height);texture.needsUpdate=true;texture.generateMipmaps=false;texture.magFilter=T.NearestFilter;return texture;
}

/** Bounded scene-only feedback. It owns no input, timers, saves or damage authority. */
export class EncounterPresentation {
  readonly scene:T.Scene;
  readonly camera:T.Camera;
  private readonly plane=new T.PlaneGeometry(1,1);
  private readonly box=new T.BoxGeometry(1,1,1);
  private readonly cylinder=new T.CylinderGeometry(1,1,1,28);
  private readonly ring=new T.RingGeometry(.86,1,48);
  private readonly column=new T.CylinderGeometry(1,1,1,32,1,true);
  private readonly torus=new T.TorusGeometry(1,.035,6,40);
  private readonly geometries=new Set<T.BufferGeometry>();
  private readonly materials=new Set<T.Material>();
  private readonly atlas=damageAtlas();
  private readonly glyphGeometry:T.PlaneGeometry[]=[];
  private readonly bars=new Map<string,Bar>();
  private readonly deviceBars=new Map<string,Bar>();
  private readonly barPool:Bar[]=[];
  private barsCreated=0;
  private readonly damage:Damage[]=[];
  private damageCursor=0;private damageSerial=0;
  private readonly markers:T.Group[]=[];
  private markerCount=0;
  private readonly devices=new Map<string,Device>();
  private readonly devicePool=new Map<EnemyKind,Device>();
  private readonly cameraPosition=new T.Vector3();
  private readonly cameraRotation=new T.Quaternion();
  private reduced=false;private distance=180;private disposed=false;
  private readonly dark=this.material({color:0x101c25,transparent:true,opacity:.87,depthWrite:false});
  // Keep the fill in the same transparent pass as its backing so 30/31 ordering applies.
  private readonly green=this.material({color:0x80ed91,transparent:true,depthWrite:false});
  private readonly yellow=this.material({color:0xffd96a,transparent:true,depthWrite:false});
  private readonly red=this.material({color:0xff6b63,transparent:true,depthWrite:false});
  private readonly cyan=this.material({color:0x87eeff,transparent:true,depthWrite:false});
  private readonly markerRing=this.material({color:0x83efff,transparent:true,opacity:.8,depthWrite:false,side:T.DoubleSide});
  private readonly markerColumn=this.material({color:0x89eaff,transparent:true,opacity:.055,depthWrite:false,side:T.DoubleSide});

  constructor(scene:T.Scene,camera:T.Camera,options:EncounterPresentationOptions={}){
    this.scene=scene;this.camera=camera;
    this.reduced=!!options.reducedMotion;if(Number.isFinite(options.viewDistance))this.distance=T.MathUtils.clamp(options.viewDistance!,30,250);
    for(const geometry of [this.plane,this.box,this.cylinder,this.ring,this.column,this.torus])this.geometries.add(geometry);
    for(let digit=0;digit<GLYPHS.length;digit++){
      const geometry=new T.PlaneGeometry(.32,.48),uv=geometry.getAttribute('uv');
      for(let index=0;index<uv.count;index++)uv.setX(index,(digit+uv.getX(index))/GLYPHS.length);
      this.glyphGeometry.push(geometry);this.geometries.add(geometry);
    }
  }
  private material(parameters:T.MeshBasicMaterialParameters):T.MeshBasicMaterial {const material=new T.MeshBasicMaterial(parameters);this.materials.add(material);return material;}
  private solid(parameters:T.MeshStandardMaterialParameters):T.MeshStandardMaterial {const material=new T.MeshStandardMaterial(parameters);this.materials.add(material);return material;}
  private bar():Bar|null {
    const existing=this.barPool.pop();if(existing)return existing;if(this.barsCreated>=MAX_ENEMIES+MAX_DEVICES)return null;
    this.barsCreated++;const root=new T.Group(),back=new T.Mesh(this.plane,this.dark),fill=new T.Mesh(this.plane,this.green);
    root.name='Encounter health bar';back.scale.set(1.12,.13,1);fill.scale.set(1.02,.075,1);fill.position.z=.004;root.add(back,fill);root.renderOrder=30;back.renderOrder=30;fill.renderOrder=31;
    return{root,fill,position:new T.Vector3(),alive:true};
  }
  private health(collection:Map<string,Bar>,id:string,position:ActorPosition,hp:number,max:number,offset:number,device:boolean):void {
    if(this.disposed||!id||id.length>128||!valid(position)||![hp,max].every(Number.isFinite)||max<=0)return;
    if(!collection.has(id)&&collection.size>=(device?MAX_DEVICES:MAX_ENEMIES))return;
    let bar=collection.get(id);if(!bar){bar=this.bar()??undefined;if(!bar)return;collection.set(id,bar);this.scene.add(bar.root);}
    const ratio=T.MathUtils.clamp(hp/max,0,1);bar.alive=hp>0;bar.position.set(position.x,position.y+offset,position.z);bar.root.position.copy(bar.position);bar.root.visible=bar.alive;
    const width=device?1.55:1.02;bar.root.children[0].scale.x=width+.10;bar.fill.scale.x=width*ratio;bar.fill.position.x=-width*(1-ratio)/2;
    bar.fill.material=device?this.cyan:ratio>.5?this.green:ratio>.25?this.yellow:this.red;
  }
  setEnemyHealth(id:string,position:ActorPosition,hp:number,max:number,kind?:EnemyKind):void {this.health(this.bars,id,position,hp,max,(kind??(id.includes('drone')?'drone':'humanoid'))==='drone'?.85:2.3,false);}
  setDeviceHealth(id:string,position:ActorPosition,hp:number,max:number):void {
    this.health(this.deviceBars,id,position,hp,max,2.35,true);const device=this.devices.get(id);if(device){device.destroyed=hp<=0;for(const part of device.energy)part.visible=!device.destroyed;}
  }
  private releaseBar(collection:Map<string,Bar>,id:string):void {const bar=collection.get(id);if(!bar)return;bar.root.removeFromParent();bar.root.visible=false;collection.delete(id);this.barPool.push(bar);}
  removeEnemy(id:string):void {this.releaseBar(this.bars,id);}
  removeDevice(id:string):void {this.releaseBar(this.deviceBars,id);const device=this.devices.get(id);if(device){device.root.removeFromParent();this.devices.delete(id);}}
  remove(id:string):void {this.removeEnemy(id);this.removeDevice(id);}
  setViewDistance(metres:number):void {if(Number.isFinite(metres))this.distance=T.MathUtils.clamp(metres,30,250);}
  setReducedMotion(reduced:boolean):void {this.reduced=reduced;}

  showDamage(position:ActorPosition,amount:number):void {
    if(this.disposed||!valid(position)||!Number.isFinite(amount)||amount<=0)return;
    let entry=this.damage.find(number=>!number.active);
    if(!entry&&this.damage.length<MAX_DAMAGE){
      const root=new T.Group(),material=this.material({map:this.atlas,color:0xfff2b2,transparent:true,depthTest:false,depthWrite:false,side:T.DoubleSide});
      const glyphs=Array.from({length:4},()=>new T.Mesh(this.glyphGeometry[0],material));for(const glyph of glyphs){glyph.renderOrder=1000;root.add(glyph);}root.renderOrder=1000;root.name='Floating damage';this.scene.add(root);
      entry={root,glyphs,material,origin:new T.Vector3(),age:0,active:false,serial:0};this.damage.push(entry);
    }
    if(!entry)entry=this.damage[this.damageCursor++%this.damage.length];
    const value=String(Math.min(9999,Math.max(1,Math.round(amount))));entry.active=true;entry.age=0;entry.serial=this.damageSerial++;entry.origin.set(position.x,position.y+.28,position.z);entry.root.position.copy(entry.origin);entry.root.visible=true;entry.material.opacity=1;
    for(let i=0;i<entry.glyphs.length;i++){const glyph=entry.glyphs[i];glyph.visible=i<value.length;if(glyph.visible){glyph.geometry=this.glyphGeometry[GLYPHS.indexOf(value[i])];glyph.position.x=(i-(value.length-1)/2)*.3;}}
  }

  setMissionMarkers(points:readonly MissionMarker[]):void {
    if(this.disposed)return;this.markerCount=Math.min(MAX_MARKERS,points.length);
    for(let index=0;index<this.markerCount;index++){
      const entry=points[index],position='position'in entry?entry.position:entry;
      if(!valid(position)){if(this.markers[index])this.markers[index].visible=false;continue;}
      if(!this.markers[index]){const root=new T.Group(),ring=new T.Mesh(this.ring,this.markerRing),column=new T.Mesh(this.column,this.markerColumn);ring.rotation.x=-Math.PI/2;root.add(ring,column);root.name='Cyan mission point';this.markers[index]=root;this.scene.add(root);}
      const marker=this.markers[index],radius='radius'in entry&&Number.isFinite(entry.radius)?T.MathUtils.clamp(entry.radius!, .4,5):1.2,height='height'in entry&&Number.isFinite(entry.height)?T.MathUtils.clamp(entry.height!,1,8):2.4;
      marker.position.set(position.x,position.y+.035,position.z);marker.visible=!('visible'in entry)||entry.visible!==false;marker.children[0].scale.set(radius,radius,1);marker.children[1].scale.set(radius,height,radius);marker.children[1].position.y=height/2;
    }
    for(let index=this.markerCount;index<this.markers.length;index++)this.markers[index].visible=false;
  }

  private device(kind:EnemyKind):Device {
    const root=new T.Group(),energy:T.Object3D[]=[],metal=this.solid({color:0x35434e,metalness:.55,roughness:.5}),edge=this.solid({color:0x8293a0,metalness:.65,roughness:.4}),yellow=this.solid({color:0xe8c85c,metalness:.12,roughness:.6}),glow=this.material({color:kind==='humanoid'?0x87efff:0x92ffbc,transparent:true,opacity:.86});
    const box=(material:T.Material,x:number,y:number,z:number,w:number,h:number,d:number)=>{const mesh=new T.Mesh(this.box,material);mesh.position.set(x,y,z);mesh.scale.set(w,h,d);root.add(mesh);return mesh;};
    if(kind==='humanoid'){
      root.name='Humanoid assembly bay';box(metal,0,.13,0,2.4,.26,1.8);box(metal,-1.02,1.2,.43,.24,2.1,.42);box(metal,1.02,1.2,.43,.24,2.1,.42);box(edge,0,2.2,.43,2.4,.20,.5);box(metal,0,1.1,.76,1.85,1.85,.12);
      for(const x of [-.87,.87])energy.push(box(glow,x,1.2,.17,.07,1.65,.08));
      box(edge,0,1.05,.44,.45,.74,.3);box(edge,0,1.61,.44,.31,.31,.3);for(const x of [-.32,.32])box(edge,x,1.03,.43,.12,.7,.18);
      for(const x of [-.82,.82])box(yellow,x,.3,-.67,.34,.035,.27);
    }else{
      root.name='Drone launch platform';const base=new T.Mesh(this.cylinder,metal);base.scale.set(1.2,.24,1.2);base.position.y=.12;root.add(base);
      const ring=new T.Mesh(this.torus,glow);ring.rotation.x=Math.PI/2;ring.scale.setScalar(.91);ring.position.y=.27;root.add(ring);energy.push(ring);
      for(const [x,z]of [[-.85,-.65],[.85,-.65],[-.85,.65],[.85,.65]]){box(edge,x,.46,z,.15,.8,.15);energy.push(box(glow,x,.89,z,.18,.08,.18));}
      box(metal,0,.45,0,.8,.22,.65);box(edge,0,.58,0,.44,.09,.35);box(edge,1.02,1.1,.55,.10,1.8,.10);energy.push(box(glow,1.02,2.02,.55,.19,.15,.19));
    }
    return{root,kind,energy,destroyed:false};
  }
  setSpawnDevices(devices:readonly SpawnDeviceVisual[]):void {
    if(this.disposed)return;const active=new Set<string>(),kinds=new Set<EnemyKind>();
    for(const spec of devices.slice(0,MAX_DEVICES)){
      if(!spec.id||!valid(spec.position)||!['humanoid','drone'].includes(spec.kind)||kinds.has(spec.kind))continue;kinds.add(spec.kind);
      let device=this.devices.get(spec.id);
      if(!device||device.kind!==spec.kind){if(device)this.removeDevice(spec.id);if(!this.devicePool.has(spec.kind))this.devicePool.set(spec.kind,this.device(spec.kind));device=this.devicePool.get(spec.kind)!;for(const [priorId,prior]of this.devices)if(prior===device)this.removeDevice(priorId);this.devices.set(spec.id,device);this.scene.add(device.root);}
      device.root.position.set(spec.position.x,spec.position.y,spec.position.z);device.destroyed=!!spec.destroyed;for(const part of device.energy)part.visible=!device.destroyed;active.add(spec.id);
      if(Number.isFinite(spec.hp)&&Number.isFinite(spec.maxHp))this.setDeviceHealth(spec.id,spec.position,spec.hp!,spec.maxHp!);
    }
    for(const id of [...this.devices.keys()])if(!active.has(id))this.removeDevice(id);
  }

  step(seconds:number):void {
    if(this.disposed)return;const dt=Number.isFinite(seconds)?T.MathUtils.clamp(seconds,0,.1):0;this.camera.getWorldPosition(this.cameraPosition);this.camera.getWorldQuaternion(this.cameraRotation);
    for(const bar of [...this.bars.values(),...this.deviceBars.values()]){bar.root.quaternion.copy(this.cameraRotation);bar.root.visible=bar.alive&&bar.position.distanceToSquared(this.cameraPosition)<=this.distance*this.distance;}
    for(const entry of this.damage){
      if(!entry.active)continue;entry.age+=dt;const duration=this.reduced?.65:.85;
      if(entry.age>=duration){entry.active=false;entry.root.visible=false;continue;}
      const progress=entry.age/duration;entry.root.position.copy(entry.origin);entry.root.position.y+=progress*(this.reduced?.12:.78);entry.root.position.x+=((entry.serial%3)-1)*.13*(this.reduced?.2:1);entry.root.quaternion.copy(this.cameraRotation);entry.root.scale.setScalar(T.MathUtils.clamp(entry.origin.distanceTo(this.cameraPosition)*.065,.65,2.4));entry.material.opacity=progress<.6?1:(1-progress)/.4;
    }
  }
  reset():void {
    for(const id of [...this.bars.keys()])this.removeEnemy(id);for(const id of [...this.deviceBars.keys()])this.releaseBar(this.deviceBars,id);
    for(const device of this.devices.values())device.root.removeFromParent();this.devices.clear();for(const marker of this.markers)marker.visible=false;this.markerCount=0;
    for(const entry of this.damage){entry.active=false;entry.root.visible=false;}this.damageCursor=0;
  }
  snapshot(){return{enemyBars:this.bars.size,visibleEnemyBars:[...this.bars.values()].filter(bar=>bar.root.visible).length,deviceBars:this.deviceBars.size,devices:[...this.devices].map(([id,device])=>({id,kind:device.kind,destroyed:device.destroyed})),activeDamage:this.damage.filter(entry=>entry.active).length,damageCapacity:this.damage.length,healthBarCapacity:this.barsCreated,markers:this.markers.filter(marker=>marker.visible).length,limits:{enemies:MAX_ENEMIES,devices:MAX_DEVICES,damage:MAX_DAMAGE,markers:MAX_MARKERS},resources:{geometries:this.geometries.size,materials:this.materials.size,textures:this.disposed?0:1},disposed:this.disposed};}
  dispose():void {if(this.disposed)return;this.reset();this.disposed=true;for(const entry of this.damage)entry.root.removeFromParent();for(const marker of this.markers)marker.removeFromParent();for(const device of this.devicePool.values())device.root.removeFromParent();for(const geometry of this.geometries)geometry.dispose();for(const material of this.materials)material.dispose();this.atlas.dispose();this.geometries.clear();this.materials.clear();this.damage.length=0;this.markers.length=0;this.barPool.length=0;this.devicePool.clear();}
}
