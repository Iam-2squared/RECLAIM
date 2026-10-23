import * as T from 'three';
import { AreaLoader, getAreaDefinition, type AreaId, type WorldQuality } from '../world/index.ts';
import { CampaignStore, visibleAreas, type MissionCheckpoint } from '../campaign/index.ts';
import { CharacterController, PLAYER_TUNING } from './controller.ts';
import { SimulationClock, SIMULATION_TIMING } from './clock.ts';
import { ScoutDrone, COMBAT_TUNING, WEAPON_TUNING, raySphere, obstructionDistance } from './combat.ts';
import { WeaponFeedback, DroneCrashRig } from './feedback.ts';
import type { HomePreview } from '../home-state.ts';
import './mission.css';
const node=<E extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id)! as E;
const sceneResources=(root:T.Object3D)=>{const g=new Set<T.BufferGeometry>(),m=new Set<T.Material>();root.traverse(o=>{const mesh=o as T.Mesh;if(mesh.geometry)g.add(mesh.geometry);(Array.isArray(mesh.material)?mesh.material:mesh.material?[mesh.material]:[]).forEach(mat=>m.add(mat));});g.forEach(v=>v.dispose());m.forEach(v=>v.dispose());};
function createDroneModel() {
 const group=new T.Group(),rotors:T.Mesh[]=[];
 const metal=new T.MeshLambertMaterial({color:0x59635d,flatShading:true}),dark=new T.MeshLambertMaterial({color:0x202b29}),lens=new T.MeshBasicMaterial({color:0xc77852});
 const body=new T.Mesh(new T.BoxGeometry(.72,.26,.5),metal);group.add(body);
 const sensor=new T.Mesh(new T.SphereGeometry(.12,8,6),lens);sensor.position.set(0,-.04,.29);group.add(sensor);
 const bar=new T.BoxGeometry(1.5,.06,.065),blade=new T.BoxGeometry(.64,.015,.075),motor=new T.CylinderGeometry(.1,.1,.13,8);
 for(const z of [-.32,.32]){const arm=new T.Mesh(bar,dark);arm.position.z=z;group.add(arm);for(const x of [-.68,.68]){const hub=new T.Mesh(motor,metal);hub.position.set(x,.05,z);group.add(hub);const rotor=new T.Mesh(blade,dark);rotor.position.set(x,.13,z);group.add(rotor);rotors.push(rotor);}}
 return{group,rotors,lens};
}
function createWeapon(id:string) {
 const root=new T.Group(),metal=new T.MeshLambertMaterial({color:0x343e3c}),wood=new T.MeshLambertMaterial({color:id==='rifle'?0x72513c:0x596044}),edge=new T.MeshLambertMaterial({color:0x839088});
 const box=(m:T.Material,x:number,y:number,z:number,w:number,h:number,d:number)=>{const o=new T.Mesh(new T.BoxGeometry(w,h,d),m);o.position.set(x,y,z);root.add(o);};
 box(metal,0,0,-.1,.12,.11,.37);box(wood,0,-.014,.18,.13,.13,.26);box(wood,0,0,-.38,.13,.095,.26);box(metal,0,-.1,-.05,.07,.17,.1);box(metal,0,.015,id==='sniper'?-.78:-.63,.035,.035,id==='sniper'?.57:.3);box(edge,0,.09,-.38,.025,.07,.025);
 if(id==='sniper')box(metal,0,.14,-.18,.09,.09,.31);
 root.position.set(.27,-.25,-.44);root.rotation.y=-.065;return root;
}
export type MissionHooks={returnHome:()=>void;announce:(s:string)=>void;invalidate:()=>void;effect:(kind:'radio'|'shot'|'hit')=>void;stopEffects:()=>void};
export class Mission {
 loader:AreaLoader;camera=new T.PerspectiveCamera(74,1,.055,900);controller:CharacterController;drone:ScoutDrone|null=null;droneArt:ReturnType<typeof createDroneModel>|null=null;weapon:T.Group;weaponFeedback=new WeaponFeedback();droneCrash=new DroneCrashRig();
 paused=true;disposed=false;hp:number=COMBAT_TUNING.playerHp;keys=new Set<string>();clock=new SimulationClock();elapsed=0;checkpointClock=0;hudClock=0;nextShot=0;shots=0;misses=0;lastHit=false;hitFlash=0;lastUI='';locked=false;transitions=0;frames=0;frameTimes:number[]=[];loadMs=0;storyShowing=false;endShowing=false;lockSettledAt=0;ignoreFirstMouseMove=false;jumpBuffered=false;
 canvas:HTMLCanvasElement;store:CampaignStore;renderer:T.WebGLRenderer;hooks:MissionHooks;preview:HomePreview;areaId:AreaId;quality:WorldQuality;debug:boolean;
 constructor(renderer:T.WebGLRenderer,store:CampaignStore,areaId:AreaId,quality:WorldQuality,preview:HomePreview,hooks:MissionHooks,resume:MissionCheckpoint|null=null,debug=false){
  const start=performance.now();this.renderer=renderer;this.canvas=renderer.domElement;this.store=store;this.hooks=hooks;this.preview=preview;this.areaId=areaId;this.quality=quality;this.debug=debug;
  this.loader=new AreaLoader(getAreaDefinition(areaId),quality);this.controller=new CharacterController(this.loader.terrain,()=>this.loader.colliders,getAreaDefinition(areaId).bounds,getAreaDefinition(areaId).spawn);
  const introNeedsCabin=areaId==='shiretoko'&&store.value.introStep<4;
  const resumeAllowed=resume&&resume.areaId===areaId&&(!introNeedsCabin||(Math.abs(resume.x)<=5&&resume.z>=-5&&resume.z<=5));
  const resumeAccepted=!!resumeAllowed&&this.controller.restore(resume!);
  if(resumeAccepted)this.hp=Math.max(1,resume!.hp);
  else if(resume)hooks.announce('保存位置が安全ではないため、起点から再開しました。');
  if(!debug){store.beginSession(areaId,resumeAccepted);store.record({type:'position',areaId,position:{...this.controller.position},grounded:this.controller.grounded});}
  if(areaId==='shiretoko') {const point=getAreaDefinition(areaId).landmarks.find(p=>p.id==='drone')?.position??{x:0,z:25};this.drone=new ScoutDrone(point.x,point.z,this.loader.terrain.heightAt(point.x,point.z),!debug&&store.value.droneDefeated);this.droneArt=createDroneModel();this.loader.scene.add(this.droneArt.group);}
  this.weapon=createWeapon(preview[preview.held]);this.camera.add(this.weapon);this.loader.scene.add(this.camera);
  this.loader.update(this.controller.position.x,this.controller.position.z);this.resize();this.updateCamera();this.bind();this.loadMs=performance.now()-start;this.render();this.save();this.showInitial();this.updateHUD(true);
 }
 bind(){
  document.addEventListener('keydown',this.keyDown);document.addEventListener('keyup',this.keyUp);document.addEventListener('mousemove',this.mouseMove);document.addEventListener('pointerlockchange',this.lockChange);document.addEventListener('pointerlockerror',this.lockError);document.addEventListener('visibilitychange',this.visibility);window.addEventListener('blur',this.blur);this.canvas.addEventListener('mousedown',this.mouseDown);
  node('mission-lock').addEventListener('click',this.lockClick);node('mission-home').addEventListener('click',this.homeClick);node('mission-interact').addEventListener('click',this.interactClick);node('mission-skip').addEventListener('click',this.skipClick);node('mission-continue').addEventListener('click',this.continueClick);node('mission-retry').addEventListener('click',this.retryClick);node('mission-next').addEventListener('click',this.nextClick);node('mission-pause-button').addEventListener('click',this.pauseClick);
 }
 keyDown=(e:KeyboardEvent)=>{
  if(e.target instanceof HTMLInputElement||e.target instanceof HTMLSelectElement||node<HTMLDialogElement>('settings-dialog').open)return;
  if(!this.paused&&['KeyW','KeyA','KeyS','KeyD','ShiftLeft','ShiftRight','Space','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyE'].includes(e.code))e.preventDefault();
  if(e.code==='Escape'){this.pause();return;}
  if(e.code==='KeyE'&&!e.repeat){this.interact();return;}
  if(e.code.startsWith('Arrow')&&!this.paused){const dx=e.code==='ArrowLeft'?-22:e.code==='ArrowRight'?22:0,dy=e.code==='ArrowUp'?-22:e.code==='ArrowDown'?22:0;this.controller.look(dx,dy);}
  if(!this.paused){this.keys.add(e.code);if(e.code==='Space'&&!e.repeat)this.jumpBuffered=true;}
 };
 keyUp=(e:KeyboardEvent)=>{this.keys.delete(e.code);if(e.code==='Space')this.controller.clearInput();};
 mouseMove=(e:MouseEvent)=>{if(!this.locked||this.paused)return;if(this.ignoreFirstMouseMove){this.ignoreFirstMouseMove=false;return;}if(performance.now()<this.lockSettledAt||Math.abs(e.movementX)>180||Math.abs(e.movementY)>180)return;this.controller.look(e.movementX,e.movementY);};
 mouseDown=(e:MouseEvent)=>{if(e.button!==0||this.paused||!this.locked)return;this.shoot();};
 lockChange=()=>{if(this.disposed)return;this.locked=document.pointerLockElement===this.canvas;if(this.locked){this.lockSettledAt=performance.now()+100;this.ignoreFirstMouseMove=true;}if(this.locked&&!this.storyShowing&&!this.endShowing&&!document.hidden){this.paused=false;this.clock.reset();node('mission-overlay').hidden=true;node('mission-pause').hidden=true;this.canvas.focus();}else this.pause(false);this.updateHUD(true);this.hooks.invalidate();};
 lockError=()=>{if(this.disposed)return;node('mission-pause-message').textContent='視点操作を開始できませんでした。通常のPCブラウザで「探索を開始」を押してください。';this.pause(false);};
 visibility=()=>{if(document.hidden)this.pause();};blur=()=>this.pause();
 lockClick=()=>this.requestLock();homeClick=()=>{this.save();this.hooks.returnHome();};interactClick=()=>this.interact();skipClick=()=>this.skipOpening();continueClick=()=>this.continueStory();retryClick=()=>this.retry();nextClick=()=>{this.endShowing=false;this.hooks.returnHome();};pauseClick=()=>this.pause();
 requestLock(){if(this.disposed||this.storyShowing||this.endShowing||this.hp<=0)return;try{const promise=this.canvas.requestPointerLock();promise?.then(()=>{if(this.disposed&&document.pointerLockElement===this.canvas)document.exitPointerLock();}).catch(()=>{if(!this.disposed)this.lockError();});}catch{this.lockError();}}
 pause(release=true){this.paused=true;this.weaponFeedback.clear();this.keys.clear();this.jumpBuffered=false;this.controller.clearInput();this.clock.reset();if(release&&document.pointerLockElement===this.canvas)document.exitPointerLock();if(!this.storyShowing&&!this.endShowing){node('mission-overlay').hidden=false;node('mission-pause').hidden=false;}this.hooks.invalidate();}
 showInitial(){node('mission-area').textContent=getAreaDefinition(this.areaId).displayName;node('mission-prototype').textContent=this.areaId==='shiretoko'?'導入プレイ / 仮バランス':'環境プロトタイプ / 正式任務は開発中';if(this.areaId==='shiretoko'&&this.store.value.introStep===0&&!this.debug)this.showStory('WAKE / 01','北の家で、目を覚ます。','朝の薄明かり。木造の家には、いつもと違う静けさがある。まず、ラジオの報道を確かめよう。','起き上がる');else if(this.areaId==='shiretoko'&&this.store.value.introStep===2&&!this.debug)this.showStory('RADIO / 02','日本各地で、AIが暴走。','日本各地に危機が広がっている。東京の親友から連絡が届いた。','届いた連絡を読む');else this.pause(false);}
 showStory(kicker:string,title:string,text:string,action:string){this.pause();this.storyShowing=true;node('mission-overlay').hidden=false;node('mission-pause').hidden=true;node('mission-story').hidden=false;node('mission-story-kicker').textContent=kicker;node('mission-story-title').textContent=title;node('mission-story-text').textContent=text;node('mission-continue').textContent=action;node('mission-continue').focus();}
 continueStory(){
  if(!this.storyShowing)return;
  if(this.store.value.introStep===0)this.recordOpening('wake');
  else if(this.store.value.introStep===2){this.recordOpening('friend-contact');this.showStory('CONTACT / 03','東京の親友から、連絡が届く。','「一緒に日本を脱出しよう。東京で合流しよう。」\nいつもの声を思い出しながら、返事をする。装備を手に取り、南へ続く道を探す。','家を出発する');return;}
  this.storyShowing=false;node('mission-story').hidden=true;this.pause(false);this.updateHUD(true);node('mission-lock').focus();
 }
 recordOpening(step:'wake'|'radio'|'friend-contact'|'leave-cabin',skipped=false){if(this.debug)return;this.store.record({type:'opening',step,areaId:'shiretoko',position:{...this.controller.position},grounded:this.controller.grounded,...(skipped?{skipped:true}:{})});this.save();}
 skipOpening(){if(this.areaId!=='shiretoko')return;for(const step of ['wake','radio','friend-contact'] as const)this.recordOpening(step,true);this.storyShowing=false;node('mission-story').hidden=true;this.pause(false);this.updateHUD(true);}
 interact(){
  if(this.areaId==='shiretoko'&&this.store.value.introStep===1&&!this.storyShowing){const radio=getAreaDefinition(this.areaId).landmarks.find(p=>p.type==='radio'||p.id==='radio');const p=radio?.position??{x:-3,z:-3};if(Math.hypot(this.controller.position.x-p.x,this.controller.position.z-p.z)>2.4){this.hooks.announce('ラジオに近づいてEキーを押してください。');return;}this.recordOpening('radio');this.hooks.effect('radio');this.showStory('RADIO / 02','日本各地で、AIが暴走。','「……日本各地でAIの暴走が相次ぎ、危機的な状況が広がっています……」\n報道を聞いた直後、東京にいる親友から連絡が届く。','届いた連絡を読む');}
 }
 update(dt:number){
  if(this.disposed||document.hidden)return;
  if(!Number.isFinite(dt)||dt<0)dt=0;dt=Math.min(dt,SIMULATION_TIMING.maxFrameSeconds);
  this.hitFlash=Math.max(0,this.hitFlash-dt);
  if(!this.paused)this.clock.advance(dt,seconds=>{this.step(seconds);return !this.paused;});
  this.updateCamera();this.render();this.hudClock+=dt;if(this.hudClock>.12){this.hudClock=0;this.updateHUD();}
 }
 step(dt:number){
  this.elapsed+=dt;this.weaponFeedback.step(dt);const oldRecover=this.controller.recoveries;
  this.controller.step({forward:Number(this.keys.has('KeyW'))-Number(this.keys.has('KeyS')),right:Number(this.keys.has('KeyD'))-Number(this.keys.has('KeyA')),sprint:this.keys.has('ShiftLeft')||this.keys.has('ShiftRight'),jump:this.jumpBuffered||this.keys.has('Space')},dt);this.jumpBuffered=false;
  if(this.controller.recoveries!==oldRecover)this.hooks.announce('場外から安全な起点へ戻りました。');
  this.loader.update(this.controller.position.x,this.controller.position.z);
  if(this.areaId==='shiretoko'&&this.store.value.introStep===3&&(Math.abs(this.controller.position.x)>5.4||Math.abs(this.controller.position.z)>5.4))this.recordOpening('leave-cabin');
  if(this.drone&&this.droneArt){
   const origin={x:this.controller.position.x,y:this.controller.position.y+PLAYER_TUNING.eyeHeight,z:this.controller.position.z},delta=new T.Vector3(this.drone.position.x-origin.x,this.drone.position.y-origin.y,this.drone.position.z-origin.z),distance=delta.length();delta.normalize();
   const visible=obstructionDistance(origin,delta,distance,this.loader.colliders,this.loader.terrain)>=distance-.8;
   const damage=this.debug||this.store.value.introStep===4?this.drone.step(dt,this.controller.position,(x,z)=>this.loader.terrain.heightAt(x,z),visible):0;
   if(damage){this.hp=Math.max(0,this.hp-damage);this.hitFlash=.28;this.hooks.effect('hit');if(this.hp===0){this.endShowing=true;this.pause();node('mission-overlay').hidden=false;node('mission-pause').hidden=true;node('mission-end').hidden=false;node('mission-end-title').textContent='安全な起点から、もう一度。';node('mission-end-text').textContent='ドローンの攻撃で行動不能になりました。実HPは0です。再挑戦では起点と体力を戻します。';node('mission-retry').hidden=false;node('mission-next').hidden=true;}}
   const crash=this.drone.state==='stopped'?this.droneCrash.step(dt,this.drone.position.y,this.loader.terrain.heightAt(this.drone.position.x,this.drone.position.z)):null;
   this.droneArt.group.position.set(this.drone.position.x,crash?.y??this.drone.position.y,this.drone.position.z);this.droneArt.group.rotation.y=this.drone.clock*.15;this.droneArt.group.rotation.z=crash?.bank??0;this.droneArt.rotors.forEach(r=>r.rotation.y=this.drone!.state==='stopped'?r.rotation.y:this.drone!.clock*27);
  }
  this.checkpointClock+=dt;if(this.checkpointClock>.35){this.checkpointClock=0;if(!this.debug){this.store.record({type:'position',areaId:this.areaId,position:{...this.controller.position},grounded:this.controller.grounded});this.save();}}
  const exit=getAreaDefinition(this.areaId).exitTriggers[0];
  if(exit&&!this.endShowing&&Math.hypot(this.controller.position.x-exit.position.x,this.controller.position.z-exit.position.z)<=exit.radius&&this.controller.grounded){
   const achieved=!this.debug&&this.store.record({type:'area-exit',areaId:this.areaId,position:{...this.controller.position},grounded:true});
   if(achieved||this.areaId==='sapporo'||this.debug){this.save();this.endShowing=true;this.pause();node('mission-overlay').hidden=false;node('mission-pause').hidden=true;node('mission-end').hidden=false;node('mission-end-title').textContent=achieved?'道を確かめ、次の区間へ。':'プレイ可能な範囲はここまで';node('mission-end-text').textContent=achieved?`実際の到達条件を確認しました。次の区間はHOMEの出撃前確認から選べます。${this.areaId==='shiretoko'?'道中の環境はプロトタイプです。':'正式なストーリークリアではありません。'}`:'この先の正式任務・敵・物語は開発中です。未制作地域の完了は付与しません。';node('mission-retry').hidden=true;node('mission-next').hidden=false;}
  }
 }
 shoot(){
  if(this.paused||!this.drone||this.drone.hp<=0||this.elapsed<this.nextShot)return;
  if(!this.debug&&this.store.value.introStep!==4){this.hooks.announce('ラジオと親友の連絡を確かめてから、出発してください。');return;}
  const gun=this.preview[this.preview.held],tuning=WEAPON_TUNING[gun];this.nextShot=this.elapsed+tuning.interval;this.shots++;this.weaponFeedback.fire(gun);this.updateCamera();
  const direction=new T.Vector3();this.camera.getWorldDirection(direction);const origin=this.camera.position;
  const distance=raySphere(origin,direction,this.drone.position,COMBAT_TUNING.aimRadius),obstruction=obstructionDistance(origin,direction,tuning.range,this.loader.colliders,this.loader.terrain);
  this.lastHit=distance!==null&&distance<=tuning.range&&distance<obstruction;
  if(this.lastHit){this.drone.hit(tuning.damage);this.hitFlash=.17;if(this.drone.hp===0&&!this.debug)this.store.record({type:'drone-defeated',areaId:'shiretoko',enemyId:this.drone.id,remainingHp:0,hitCount:this.drone.hits});this.save();}else this.misses++;
  this.hooks.effect('shot');this.updateHUD(true);
 }
 save(){if(this.debug)return;const c=this.controller;this.store.checkpoint({areaId:this.areaId,...c.position,yaw:c.yaw,pitch:c.pitch,hp:this.hp});}
 retry(){this.weaponFeedback.clear();this.droneCrash.reset();this.hp=COMBAT_TUNING.playerHp;this.controller.recover();if(!this.debug)this.store.record({type:'position',areaId:this.areaId,position:{...this.controller.position},grounded:true});this.endShowing=false;node('mission-end').hidden=true;node('mission-retry').hidden=true;this.pause(false);this.save();this.updateHUD(true);}
 updateCamera(){const p=this.controller.position;this.camera.position.set(p.x,p.y+PLAYER_TUNING.eyeHeight,p.z);this.camera.rotation.set(this.controller.pitch,this.controller.yaw,0,'YXZ');const recoil=this.weaponFeedback.pose;this.weapon.position.y=-.25+(this.paused?0:Math.sin(this.elapsed*9)*Math.min(.012,this.keys.size*.004))-recoil.drop;this.weapon.position.z=-.44+recoil.rear;this.weapon.rotation.x=recoil.rise;}
 resize(){this.camera.aspect=innerWidth/innerHeight;this.camera.fov=innerWidth<700?82:74;this.camera.updateProjectionMatrix();}
 preferences(quality:WorldQuality){if(this.quality===quality)return;this.quality=quality;this.loader.setQuality(quality);this.hooks.invalidate();}
 render(){const start=performance.now();this.renderer.render(this.loader.scene,this.camera);this.frames++;this.frameTimes.push(performance.now()-start);if(this.frameTimes.length>240)this.frameTimes.shift();}
 updateHUD(force=false){
  const step=this.store.value.introStep;
  let text=this.areaId==='sapporo'?'都市入口を徒歩で探索。廃車は装飾・運転不可。正式任務は開発中。':this.areaId!=='shiretoko'?'道標をたどり、歩ける環境を確かめる。正式任務は開発中。':step===0?'木造の家で目覚める。':step===1?'家のラジオへ近づき、Eで報道を聞く。':step===2?'親友から届いた連絡を読む。':step===3?'玄関を抜け、森へ出発する。':this.drone&&this.drone.hp>0?'林道の小型ドローンを停止させ、道標へ向かう。':'林道をたどり、次の区間の道標へ。';
  if(this.debug)text='開発用の環境確認 / 進行は保存されません。';
  const exit=getAreaDefinition(this.areaId).exitTriggers[0],distance=exit?Math.round(Math.hypot(this.controller.position.x-exit.position.x,this.controller.position.z-exit.position.z)):0;
  const data=JSON.stringify([text,Math.ceil(this.hp),this.drone?.hp,this.drone?.state,this.paused,distance,this.hitFlash>0,this.store.saveStatus]);if(!force&&data===this.lastUI)return;this.lastUI=data;
  node('mission-objective').textContent=text;node('mission-health').textContent=`HP ${Math.ceil(this.hp)} / ${COMBAT_TUNING.playerHp}`;node('mission-distance').textContent=`道標まで ${distance} m`;
  const enemySeen=this.drone&&step===4&&Math.hypot(this.controller.position.x-this.drone.position.x,this.controller.position.z-this.drone.position.z)<30;const states={idle:'待機',scanning:'索敵',following:'追従',attacking:'攻撃',retreating:'離脱',stopped:'停止'};
  node('mission-enemy').textContent=enemySeen&&this.drone?(this.drone.hp<=0?'偵察ドローン / 停止':`偵察ドローン / HP ${this.drone.hp} / ${states[this.drone.state]}`):this.areaId==='shiretoko'?'装備 / 射撃・仮バランス':'環境探索 / 正式任務は開発中';
  node('mission-crosshair').dataset.hit=String(this.lastHit&&this.hitFlash>0);node('mission-damage').hidden=!(this.hitFlash>0);node('mission-interact').hidden=this.areaId!=='shiretoko'||step!==1;
  node('mission-save').textContent=this.debug?'開発プレビュー / 進行保存なし':this.store.saveStatus==='saved'?'進行をこの端末に保存':'進行はこのセッションで維持';
 }
 snapshot(){const values=[...this.frameTimes].sort((a,b)=>a-b);return {areaId:this.areaId,paused:this.paused,locked:this.locked,player:{...this.controller.position,yaw:this.controller.yaw,pitch:this.controller.pitch,grounded:this.controller.grounded,distance:this.controller.distance,recoveries:this.controller.recoveries,hp:this.hp},enemy:this.drone?{state:this.drone.state,hp:this.drone.hp,hits:this.drone.hits,position:{...this.drone.position}}:null,shots:this.shots,misses:this.misses,elapsed:this.elapsed,keys:[...this.keys],storyStep:this.store.value.introStep,frames:this.frames,loadMs:this.loadMs,renderCpuMs:{median:values[Math.floor(values.length*.5)]??0,p95:values[Math.floor(values.length*.95)]??0},world:this.loader.stats(),quality:this.quality,debug:this.debug};}
 dispose(){
  if(this.disposed)return;this.save();this.disposed=true;this.hooks.stopEffects();this.keys.clear();if(document.pointerLockElement===this.canvas)document.exitPointerLock();
  document.removeEventListener('keydown',this.keyDown);document.removeEventListener('keyup',this.keyUp);document.removeEventListener('mousemove',this.mouseMove);document.removeEventListener('pointerlockchange',this.lockChange);document.removeEventListener('pointerlockerror',this.lockError);document.removeEventListener('visibilitychange',this.visibility);window.removeEventListener('blur',this.blur);this.canvas.removeEventListener('mousedown',this.mouseDown);
  node('mission-lock').removeEventListener('click',this.lockClick);node('mission-home').removeEventListener('click',this.homeClick);node('mission-interact').removeEventListener('click',this.interactClick);node('mission-skip').removeEventListener('click',this.skipClick);node('mission-continue').removeEventListener('click',this.continueClick);node('mission-retry').removeEventListener('click',this.retryClick);node('mission-next').removeEventListener('click',this.nextClick);node('mission-pause-button').removeEventListener('click',this.pauseClick);
  this.loader.scene.remove(this.camera);sceneResources(this.weapon);if(this.droneArt){this.loader.scene.remove(this.droneArt.group);sceneResources(this.droneArt.group);}this.loader.dispose();this.renderer.renderLists.dispose();
  for(const id of ['mission-story','mission-end','mission-pause','mission-overlay'])node(id).hidden=true;
 }
}
