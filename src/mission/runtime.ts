import * as T from 'three';
import { AreaLoader, getAreaDefinition, type AreaId, type WorldQuality } from '../world/index.ts';
import { CampaignStore, visibleAreas, type MissionCheckpoint } from '../campaign/index.ts';
import { CharacterController, PLAYER_TUNING } from './controller.ts';
import { SimulationClock, SIMULATION_TIMING } from './clock.ts';
import { COMBAT_TUNING, obstructionDistance } from './combat.ts';
import { RamDrone, HumanoidEnemy, type EnemyPosition } from './enemy-ai.ts';
import { WeaponState, type WeaponShot, type EquippedWeapon } from './weapon-state.ts';
import { MissionActors, type ActorMotion as PlayerMotion } from './actors.ts';
import { MissionProjectilePipeline } from './projectile-pipeline.ts';
import { missionSegmentWorld } from './mission-collider-adapter.ts';
import { resolveSegmentImpact, resolveAimImpact, type SegmentWorld, type Solid, type TaggedImpact } from './trajectory-effects.ts';
import { CombatEffects } from './combat-effects.ts';
import type { Collider } from '../world/types.ts';
import { MissionRenderBackpressure } from './render-backpressure.ts';
import type { HomePreview } from '../home-state.ts';
import type { MissionWorld } from './world.ts';
import { AUTHORED_MAP_META } from '../world/authored-map-meta.ts';
import { FreeMouseLook } from './mouse-look.ts';
import { createAuthoredHorde, type HordeDirector } from './horde-director.ts';
import { EncounterPresentation } from './encounter-presentation.ts';
import { BossDirector } from './boss-director.ts';
import { BossActors } from './boss-actors.ts';
import { BossHealthPresentation } from './boss-health.ts';
import './boss-health.css';
import './mission.css';
const node=<E extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id)! as E;
export type MissionHooks={returnHome:()=>void;announce:(s:string)=>void;invalidate:()=>void;effect:(kind:'radio'|'shot'|'hit')=>void;stopEffects:()=>void};
export class Mission {
 loader:MissionWorld;camera=new T.PerspectiveCamera(74,1,.055,2200);controller:CharacterController;drone:RamDrone|null=null;humanoid:HumanoidEnemy|null=null;
 actors:MissionActors;weapons:WeaponState;projectiles=new MissionProjectilePipeline();effects:CombatEffects;thirdPerson=false;enemyLevel:1|5=1;
 horde:HordeDirector|null=null;encounter:EncounterPresentation|null=null;
 bosses:BossDirector|null=null;bossActors:BossActors|null=null;bossHealth:BossHealthPresentation|null=null;
 private deathReturnSeconds=0;private corpseAges=new Map<string,number>();private markerKey='';
 private cachedColliders:readonly Collider[]|null=null;private shotSolids:readonly Solid[]=[];
 private visualDirty=true;private deviceMask=-1;private deviceCache:Solid[]=[];private combinedBase:readonly Solid[]|null=null;private combinedDevices:readonly Solid[]|null=null;private combinedSolids:readonly Solid[]=[];
 private speed=0;private actionTime=0;private actionMotion:PlayerMotion='Idle';private hurtTime=0;private damageFlash=0;private hits=0;private meleeHits=0;
 private readonly freeMouse=new FreeMouseLook();private lockRequest=0;private pendingLock=false;
 paused=true;disposed=false;hp:number=COMBAT_TUNING.playerHp;keys=new Set<string>();clock=new SimulationClock();elapsed=0;checkpointClock=0;hudClock=0;nextShot=0;shots=0;misses=0;lastHit=false;hitFlash=0;lastUI='';locked=false;freeLook=false;transitions=0;frames=0;frameTimes:number[]=[];loadMs=0;storyShowing=false;endShowing=false;lockSettledAt=0;ignoreFirstMouseMove=false;jumpBuffered=false;
 canvas:HTMLCanvasElement;store:CampaignStore;renderer:T.WebGLRenderer;renderBackpressure:MissionRenderBackpressure;hooks:MissionHooks;preview:HomePreview;areaId:AreaId;quality:WorldQuality;debug:boolean;
 constructor(renderer:T.WebGLRenderer,store:CampaignStore,areaId:AreaId,quality:WorldQuality,preview:HomePreview,hooks:MissionHooks,resume:MissionCheckpoint|null=null,debug=false,character:'jonesy'|'ramirez'='jonesy',worldOverride?:MissionWorld){
  const start=performance.now();this.renderer=renderer;this.renderBackpressure=new MissionRenderBackpressure(renderer.getContext() as WebGL2RenderingContext);this.canvas=renderer.domElement;this.store=store;this.hooks=hooks;this.preview=preview;this.areaId=areaId;this.quality=quality;this.debug=debug;
  this.loader=worldOverride??new AreaLoader(getAreaDefinition(areaId),quality);
  this.enemyLevel=debug&&new URLSearchParams(location.search).get('enemy-level')==='5'?5:1;
  if(areaId==='shiretoko'&&this.loader.worldId&&this.loader.data){
   const accelerated=debug&&new URLSearchParams(location.search).has('horde-preview');
   this.horde=createAuthoredHorde(this.loader.data,this.loader.terrain,{level:this.enemyLevel,...(accelerated?{spawnInterval:.2}:{})});
   this.encounter=new EncounterPresentation(this.loader.scene,this.camera,{reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,viewDistance:quality==='low'?120:180});
   this.encounter.setSpawnDevices(this.horde.devices);
   if(this.loader.encounterLayout){
    this.bosses=new BossDirector(this.loader.encounterLayout.bossArena,this.loader.terrain);
    this.bossHealth=new BossHealthPresentation(this.loader.scene,this.camera,{viewDistance:quality==='low'?120:180});
   }
  }
  const terrain=this.loader.terrain;
  this.controller=new CharacterController(this.horde?{heightAt:terrain.heightAt.bind(terrain),inWater:terrain.inWater.bind(terrain),blockedAt:(x,z,y,radius,height)=>!!terrain.blockedAt?.(x,z,y,radius,height)||this.deviceSolids().some(s=>y+height>s.bounds.minY&&y<s.bounds.maxY&&Math.hypot(x-Math.max(s.bounds.minX,Math.min(s.bounds.maxX,x)),z-Math.max(s.bounds.minZ,Math.min(s.bounds.maxZ,z)))<radius)||!!this.bosses?.bosses.some(b=>b.hp>0&&y+height>b.position.y&&y<b.position.y+b.bodyHeight&&Math.hypot(x-b.position.x,z-b.position.z)<radius+b.bodyRadius)}:terrain,()=>this.loader.colliders,this.loader.area.bounds,this.loader.area.spawn);
  const introNeedsCabin=areaId==='shiretoko'&&store.value.introStep<4;
  const cabin=this.loader.area.landmarks.find(p=>p.type==='cabin');
  const resumeAllowed=resume&&resume.areaId===areaId&&(!introNeedsCabin||(cabin&&Math.hypot(resume.x-cabin.position.x,resume.z-cabin.position.z)<cabin.radius));
  const resumeAccepted=!!resumeAllowed&&this.controller.restore(resume!);
  if(resumeAccepted)this.hp=Math.max(1,resume!.hp);
  else if(resume)hooks.announce('保存位置が安全ではないため、起点から再開しました。');
  if(debug&&new URLSearchParams(location.search).get('combat-preview')==='1')this.controller.restore({x:0,y:this.loader.terrain.heightAt(0,12),z:12,yaw:Math.PI,pitch:0});
  if(!debug){store.beginSession(areaId,resumeAccepted);store.record({type:'position',areaId,position:{...this.controller.position},grounded:this.controller.grounded});}
  if(areaId==='shiretoko'&&!this.horde) {const point=this.loader.area.landmarks.find(p=>p.id==='drone')?.position??{x:0,z:25};this.drone=new RamDrone(point.x,point.z,this.loader.terrain.heightAt(point.x,point.z),this.enemyLevel,!debug&&store.value.droneDefeated);const human=this.safeEnemySpawn(point.x+3,point.z+(this.loader.worldId?-17:17));this.humanoid=new HumanoidEnemy(human.x,human.z,human.y,this.enemyLevel);}
  if(debug&&this.horde&&new URLSearchParams(location.search).get('horde-preview')==='warehouse')this.controller.restore({x:-191,y:110.2,z:-99,yaw:-Math.PI/2,pitch:0});
  this.weapons=new WeaponState(preview[preview.held]);this.loader.scene.add(this.camera);
  this.effects=new CombatEffects(this.loader.scene);
  this.actors=new MissionActors(this.loader.scene,this.camera,character,{onLoad:()=>{if(!this.disposed){this.updateVisuals(0);hooks.invalidate();}},onError:message=>hooks.announce(message)});
  this.actors.setEnemyViewDistance(quality==='low'?120:180);
  if(this.bosses){
   this.bossActors=new BossActors(this.loader.scene,this.camera,{onLoad:()=>{if(!this.disposed){this.updateVisuals(0);hooks.invalidate();}},onError:message=>hooks.announce(message)});
   this.bossActors.setViewDistance(quality==='low'?120:180);void this.bossActors.load();
  }
  void this.actors.load();
  this.loader.update(this.controller.position.x,this.controller.position.z);this.resize();this.updateCamera();this.updateVisuals(0);this.bind();this.loadMs=performance.now()-start;this.render();this.save();this.showInitial();this.updateHUD(true);
 }
 bind(){
  document.addEventListener('keydown',this.keyDown);document.addEventListener('keyup',this.keyUp);document.addEventListener('mousemove',this.mouseMove);document.addEventListener('mouseup',this.mouseUp);document.addEventListener('pointerlockchange',this.lockChange);document.addEventListener('pointerlockerror',this.lockError);document.addEventListener('visibilitychange',this.visibility);window.addEventListener('blur',this.blur);this.canvas.addEventListener('mousedown',this.mouseDown);this.canvas.addEventListener('contextmenu',this.contextMenu);this.canvas.addEventListener('mouseleave',this.mouseLeave);
  node('mission-lock').addEventListener('click',this.lockClick);node('mission-home').addEventListener('click',this.homeClick);node('mission-interact').addEventListener('click',this.interactClick);node('mission-skip').addEventListener('click',this.skipClick);node('mission-continue').addEventListener('click',this.continueClick);node('mission-retry').addEventListener('click',this.retryClick);node('mission-next').addEventListener('click',this.nextClick);node('mission-pause-button').addEventListener('click',this.pauseClick);
 }
 keyDown=(e:KeyboardEvent)=>{
  if(e.target instanceof HTMLInputElement||e.target instanceof HTMLSelectElement||node<HTMLDialogElement>('settings-dialog').open)return;
  if(!this.paused&&['KeyW','KeyA','KeyS','KeyD','ShiftLeft','ShiftRight','Space','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyE'].includes(e.code))e.preventDefault();
  if(e.code==='Escape'){this.pause();return;}
  if(e.code==='KeyE'&&!e.repeat){this.interact();return;}
  if(!this.paused&&!e.repeat){
   const selection:Partial<Record<string,EquippedWeapon>>={Digit1:this.preview.primary,Digit2:this.preview.secondary,Digit3:'knife'};
   if(selection[e.code]){this.weapons.select(selection[e.code]!);this.actionTime=0;this.updateHUD(true);return;}
   if(e.code==='KeyR'){this.weapons.reload();return;}
   if(e.code==='KeyV'){this.thirdPerson=!this.thirdPerson;this.updateCamera();this.updateVisuals(0);this.hooks.announce(this.thirdPerson?'三人称視点':'一人称視点');return;}
  }
  if(e.code.startsWith('Arrow')&&!this.paused){const dx=e.code==='ArrowLeft'?-22:e.code==='ArrowRight'?22:0,dy=e.code==='ArrowUp'?-22:e.code==='ArrowDown'?22:0;this.controller.look(dx,dy);}
  if(!this.paused){this.keys.add(e.code);if(e.code==='Space'&&!e.repeat)this.jumpBuffered=true;}
 };
 keyUp=(e:KeyboardEvent)=>{this.keys.delete(e.code);if(e.code==='Space')this.controller.clearInput();};
 mouseMove=(e:MouseEvent)=>{
  if(this.paused||this.disposed)return;
  if(this.locked){
   if(this.ignoreFirstMouseMove){this.ignoreFirstMouseMove=false;return;}
   if(performance.now()<this.lockSettledAt||Math.abs(e.movementX)>180||Math.abs(e.movementY)>180)return;
   this.controller.look(e.movementX,e.movementY);return;
  }
  if(!this.freeLook)return;
  if(this.mouseOverInterface(e.target)){this.freeMouse.reset();return;}
  const delta=this.freeMouse.move(e.clientX,e.clientY,this.canvas.getBoundingClientRect());
  if(delta)this.controller.look(delta.dx,delta.dy);
 };
 private mouseOverInterface(target:EventTarget|null){return target instanceof Element&&!!target.closest('button,input,select,textarea,dialog,[role="button"],[contenteditable="true"]');}
 mouseLeave=(event:MouseEvent)=>{
  if(this.paused||!this.freeLook||this.mouseOverInterface(event.relatedTarget)){this.freeMouse.reset();return;}
  this.freeMouse.leave(event.clientX,event.clientY,this.canvas.getBoundingClientRect());
 };
 mouseDown=(e:MouseEvent)=>{if(this.paused||(!this.locked&&!this.freeLook))return;if(e.button===0)this.shoot();if(e.button===2)this.weapons.setAiming(true);};
 mouseUp=(e:MouseEvent)=>{if(e.button===0)this.weapons.trigger(false);if(e.button===2)this.weapons.setAiming(false);};
 contextMenu=(e:Event)=>{if(this.locked||this.freeLook)e.preventDefault();};
 lockChange=()=>{
  if(this.disposed)return;
  const previouslyLocked=this.locked;this.locked=document.pointerLockElement===this.canvas;
  if(this.locked){
   if(!this.pendingLock||this.storyShowing||this.endShowing||document.hidden||!document.hasFocus()||this.hp<=0){this.locked=false;document.exitPointerLock();return;}
   this.pendingLock=false;this.lockSettledAt=performance.now()+100;this.ignoreFirstMouseMove=true;this.startMouseLook(false);
  }else if(previouslyLocked)this.pause(false);
  this.updateHUD(true);this.hooks.invalidate();
 };
 lockError=()=>{
  if(!this.pendingLock||this.disposed||this.storyShowing||this.endShowing||document.hidden||!document.hasFocus()||this.hp<=0)return;
  this.pendingLock=false;this.startMouseLook(true);
  this.hooks.announce('マウスを動かすだけで視点が動きます。画面の端に寄せると続けて回転できます。WASDで移動、Escで停止。');
 };
 private startMouseLook(free:boolean){this.freeLook=free;this.freeMouse.reset();this.paused=false;this.clock.reset();node('mission-overlay').hidden=true;node('mission-pause').hidden=true;this.canvas.style.cursor='none';this.canvas.focus();this.updateHUD(true);this.hooks.invalidate();}
 visibility=()=>{if(document.hidden)this.pause();};blur=()=>this.pause();
 lockClick=()=>this.requestLock();homeClick=()=>{this.save();this.hooks.returnHome();};interactClick=()=>this.interact();skipClick=()=>this.skipOpening();continueClick=()=>this.continueStory();retryClick=()=>this.retry();nextClick=()=>{this.endShowing=false;this.hooks.returnHome();};pauseClick=()=>this.pause();
 requestLock(){
  if(this.disposed||this.storyShowing||this.endShowing||this.hp<=0||document.hidden)return;
  const request=++this.lockRequest;this.pendingLock=true;
  try{const promise=this.canvas.requestPointerLock();promise?.then(()=>{if(request!==this.lockRequest&&document.pointerLockElement===this.canvas)document.exitPointerLock();}).catch(()=>{if(request===this.lockRequest)this.lockError();});}catch{if(request===this.lockRequest)this.lockError();}
 }
 pause(release=true){this.visualDirty=true;this.lockRequest++;this.pendingLock=false;this.paused=true;this.freeLook=false;this.freeMouse.reset();this.canvas.style.cursor='';this.weapons.clearInput();this.projectiles.clear();this.effects.clear();this.keys.clear();this.jumpBuffered=false;this.controller.clearInput();this.clock.reset();if(release&&document.pointerLockElement===this.canvas)document.exitPointerLock();if(!this.storyShowing&&!this.endShowing){node('mission-overlay').hidden=false;node('mission-pause').hidden=false;}this.hooks.invalidate();}
 showInitial(){node('mission-area').textContent=this.loader.area.displayName;node('mission-prototype').textContent=this.areaId==='shiretoko'?'導入プレイ / 仮バランス':'環境プロトタイプ / 正式任務は開発中';if(this.areaId==='shiretoko'&&this.store.value.introStep===0&&!this.debug)this.showStory('WAKE / 01','北の家で、目を覚ます。','朝の薄明かり。木造の家には、いつもと違う静けさがある。まず、ラジオの報道を確かめよう。','起き上がる');else if(this.areaId==='shiretoko'&&this.store.value.introStep===2&&!this.debug)this.showStory('RADIO / 02','日本各地で、AIが暴走。','日本各地に危機が広がっている。東京の親友から連絡が届いた。','届いた連絡を読む');else this.pause(false);}
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
  if(this.areaId==='shiretoko'&&this.store.value.introStep===1&&!this.storyShowing){const radio=this.loader.area.landmarks.find(p=>p.type==='radio'||p.id==='radio');const p=radio?.position??{x:-3,z:-3};if(Math.hypot(this.controller.position.x-p.x,this.controller.position.z-p.z)>2.4){this.hooks.announce('ラジオに近づいてEキーを押してください。');return;}this.recordOpening('radio');this.hooks.effect('radio');this.showStory('RADIO / 02','日本各地で、AIが暴走。','「……日本各地でAIの暴走が相次ぎ、危機的な状況が広がっています……」\n報道を聞いた直後、東京にいる親友から連絡が届く。','届いた連絡を読む');}
 }
 get needsFrame(){return !this.paused||this.hp<=0||this.visualDirty||this.hitFlash>0||this.damageFlash>0;}
 update(dt:number){
  if(this.disposed||document.hidden)return;
  if(!this.needsFrame)return;
  if(!Number.isFinite(dt)||dt<0)dt=0;dt=Math.min(dt,SIMULATION_TIMING.maxFrameSeconds);
  this.hitFlash=Math.max(0,this.hitFlash-dt);
  this.damageFlash=Math.max(0,(this.damageFlash??0)-dt);
  if(this.deathReturnSeconds>0){this.deathReturnSeconds=Math.max(0,this.deathReturnSeconds-dt);if(this.deathReturnSeconds===0)this.retry();}
  if(!this.paused)this.clock.advance(dt,seconds=>{this.step(seconds);return !this.paused;});
  this.updateCamera();this.updateVisuals?.(this.paused&&this.hp>0?0:dt);this.render();this.hudClock+=dt;if(this.hudClock>.12){this.hudClock=0;this.updateHUD();}
 }
 step(dt:number){
  if(this.freeLook){const delta=this.freeMouse.step(dt);this.controller.look(delta.dx,delta.dy);}
  this.elapsed+=dt;this.actionTime=Math.max(0,this.actionTime-dt);this.hurtTime=Math.max(0,this.hurtTime-dt);const oldRecover=this.controller.recoveries,oldDistance=this.controller.distance;
  this.controller.step({forward:Number(this.keys.has('KeyW'))-Number(this.keys.has('KeyS')),right:Number(this.keys.has('KeyD'))-Number(this.keys.has('KeyA')),sprint:this.keys.has('ShiftLeft')||this.keys.has('ShiftRight'),jump:this.jumpBuffered||this.keys.has('Space')},dt);this.jumpBuffered=false;
  this.speed=(this.controller.distance-oldDistance)/dt;this.weapons.setMoving(this.speed>.1);
  if(this.controller.recoveries!==oldRecover)this.hooks.announce('場外から安全な起点へ戻りました。');
  this.loader.update(this.controller.position.x,this.controller.position.z);
  if(this.areaId==='shiretoko'&&this.store.value.introStep===3){const p=this.controller.position,c=AUTHORED_MAP_META.cabin;const outside=this.loader.worldId?(p.x<c.minX||p.x>c.maxX||p.z<c.minZ||p.z>c.maxZ):(Math.abs(p.x)>5.4||Math.abs(p.z)>5.4);if(outside)this.recordOpening('leave-cabin');}
  for(const enemy of [this.drone,this.humanoid])if(enemy&&(this.debug||this.store.value.introStep===4||enemy.hp===0)){
   const damage=enemy.step(dt,this.controller.position,(x,z)=>this.loader.terrain.heightAt(x,z),this.enemyVisible(enemy.position,enemy===this.humanoid?1:0),(from,to,radius)=>this.enemyCanMove(from,to,radius,enemy===this.drone));
   if(damage)this.takeDamage(damage);
  }
  if(this.horde){const result=this.horde.step(dt,this.controller.position,{combatEnabled:this.debug||this.store.value.introStep===4,visible:unit=>this.enemyVisible(unit.position,unit.kind==='humanoid'?1:0),canMove:(from,to,radius,kind)=>this.enemyCanMove(from,to,radius,kind==='drone')});if(result.damage)this.takeDamage(result.damage);}
  if(!this.paused&&this.bosses){const result=this.bosses.step(dt,this.controller.position,{combatEnabled:this.debug||this.store.value.introStep===4,canSee:boss=>this.enemyVisible(boss.position,boss.bodyHeight*.5),canMove:(from,to,radius)=>!this.loader.terrain.blockedAt?.(to.x,to.z,to.y,radius,2)});if(result.damage)this.takeDamage(result.damage);}
  if(!this.paused){for(const shot of this.weapons.step(dt)){this.updateCamera();this.fireShot(shot);}
   if(this.projectiles.active||this.projectiles.visibleTracers.length){const world=this.projectiles.active?this.shotWorld():{solids:[],drone:null,heightAt:()=>0};
    for(let i=0;i<2;i++){const frame=this.projectiles.tick(world,dt/2);for(const receipt of frame.impacts){this.effects.impact(receipt.impact);if(!this.acceptHit(receipt.impact.targetId,receipt.damage,receipt.impact))this.misses++;}this.misses+=frame.expirations.length;}
   }
   this.effects.step(dt,this.projectiles.visibleTracers);
  }
  this.checkpointClock+=dt;if(this.checkpointClock>.35){this.checkpointClock=0;if(!this.debug){this.store.record({type:'position',areaId:this.areaId,position:{...this.controller.position},grounded:this.controller.grounded});this.save();}}
  const exit=this.loader.area.exitTriggers[0];
  if(exit&&!this.endShowing&&Math.hypot(this.controller.position.x-exit.position.x,this.controller.position.z-exit.position.z)<=exit.radius&&this.controller.grounded){
   const achieved=!this.debug&&this.store.record({type:'area-exit',areaId:this.areaId,position:{...this.controller.position},grounded:true});
   if(achieved||this.areaId==='sapporo'||this.debug){this.save();this.endShowing=true;this.pause();node('mission-overlay').hidden=false;node('mission-pause').hidden=true;node('mission-end').hidden=false;node('mission-end-title').textContent=achieved?'道を確かめ、次の区間へ。':'プレイ可能な範囲はここまで';node('mission-end-text').textContent=achieved?`実際の到達条件を確認しました。次の区間はHOMEの出撃前確認から選べます。${this.areaId==='shiretoko'?'道中の環境はプロトタイプです。':'正式なストーリークリアではありません。'}`:'この先の正式任務・敵・物語は開発中です。未制作地域の完了は付与しません。';node('mission-retry').hidden=true;node('mission-next').hidden=false;}
  }
 }
 shoot(){
  if(this.paused)return;
  if(!this.debug&&this.store.value.introStep!==4){this.hooks.announce('ラジオと親友の連絡を確かめてから、出発してください。');return;}
  this.weapons.trigger(true);
 }
 private shotWorld():SegmentWorld {
  const colliders=this.loader.combatColliders?.(this.controller.position.x,this.controller.position.z)??this.loader.colliders;
  if(this.cachedColliders!==colliders){this.cachedColliders=colliders;this.shotSolids=missionSegmentWorld(colliders,(x,z)=>this.loader.terrain.heightAt(x,z),null).solids;}
  const targets:NonNullable<SegmentWorld['targets']>[number][]=[];
  if(this.drone&&this.drone.hp>0)targets.push({id:this.drone.id,center:{...this.drone.position},radius:.72,material:'drone'});
  if(this.humanoid&&this.humanoid.hp>0)for(const [height,radius]of [[.45,.28],[1.0,.34],[1.6,.25]])targets.push({id:this.humanoid.id,center:{...this.humanoid.position,y:this.humanoid.position.y+height},radius,material:'humanoid'});
  for(const unit of this.horde?.units??[])if(unit.hp>0){if(unit.kind==='drone')targets.push({id:unit.id,center:{...unit.position},radius:.72,material:'drone'});else for(const [height,radius]of [[.45,.28],[1,.34],[1.6,.25]])targets.push({id:unit.id,center:{...unit.position,y:unit.position.y+height},radius,material:'humanoid'});}
  targets.push(...this.bosses?.targets()??[]);
  const devices=this.deviceSolids();if(this.combinedBase!==this.shotSolids||this.combinedDevices!==devices){this.combinedBase=this.shotSolids;this.combinedDevices=devices;this.combinedSolids=devices.length?[...this.shotSolids,...devices]:this.shotSolids;}
  return {solids:this.combinedSolids,drone:null,targets,heightAt:(x,z)=>this.loader.terrain.heightAt(x,z)};
 }
 private deviceSolids():Solid[]{const devices=this.horde?.devices,mask=(devices??[]).reduce((value,device,index)=>value|(device.destroyed?1<<index:0),0);if(this.deviceMask!==mask){this.deviceMask=mask;this.deviceCache=(devices??[]).filter(d=>!d.destroyed).map(d=>({id:d.id,material:'metal',bounds:{minX:d.position.x-1.2,maxX:d.position.x+1.2,minY:d.position.y,maxY:d.position.y+(d.kind==='humanoid'?2.3:2.1),minZ:d.position.z-1.0,maxZ:d.position.z+1.0}}));}return this.deviceCache;}
 private fireShot(shot:WeaponShot){
  this.shots++;this.lastHit=false;this.actionTime=shot.melee?.36:.14;this.actionMotion=shot.melee?'Melee':'Shoot';
  this.updateVisuals(0);
  const world=this.shotWorld(),eye=new T.Vector3(this.controller.position.x,this.controller.position.y+PLAYER_TUNING.eyeHeight,this.controller.position.z);
  const direction=new T.Vector3();this.camera.getWorldDirection(direction);
  if(shot.melee){
   const deviceTargets=this.deviceSolids().map(s=>({id:s.id,center:{x:(s.bounds.minX+s.bounds.maxX)/2,y:(s.bounds.minY+s.bounds.maxY)/2,z:(s.bounds.minZ+s.bounds.maxZ)/2},radius:1}));
   const candidates=[...(world.targets??[]),...deviceTargets].filter(t=>{const delta=new T.Vector3(t.center.x-eye.x,t.center.y-eye.y,t.center.z-eye.z),distance=delta.length();return distance<=shot.range+t.radius&&delta.normalize().dot(direction)>.64;}).sort((a,b)=>eye.distanceTo(new T.Vector3(a.center.x,a.center.y,a.center.z))-eye.distanceTo(new T.Vector3(b.center.x,b.center.y,b.center.z)));
   let accepted=false;
   for(const target of candidates){const impact=resolveSegmentImpact(eye,target.center,world);if(impact?.targetId===target.id){accepted=this.acceptHit(target.id,shot.damage,impact);if(accepted){this.meleeHits++;this.effects.impact(impact);}break;}}
   if(!accepted)this.misses++;
  }else{
   this.actors.setWeapon(shot.kind,{...this.weapons.pose,lookPitch:this.controller.pitch,thirdPerson:this.thirdPerson});
   this.camera.updateMatrixWorld(true);
   const far=this.camera.position.clone().addScaledVector(direction,shot.range);
   const cameraHit=resolveAimImpact(this.camera.position,far,world);
   const aimPoint=cameraHit?new T.Vector3(cameraHit.point.x,cameraHit.point.y,cameraHit.point.z):far;
   let muzzle=this.actors.muzzleWorld(new T.Vector3())??eye.clone().addScaledVector(direction,.35);
   // A barrel poking through a thin wall cannot move the launch origin past it.
   if(resolveSegmentImpact(eye,muzzle,world))muzzle=eye.clone();
   const launch=aimPoint.clone().sub(muzzle);if(launch.lengthSq()<1e-10)launch.copy(direction);launch.normalize();
   const right=new T.Vector3().crossVectors(launch,new T.Vector3(0,1,0)).normalize();
   const up=new T.Vector3().crossVectors(right,launch).normalize();
   const angle=shot.id*2.399963229728653,radius=Math.sqrt(((shot.id*73)%101)/101)*shot.spread;
   launch.addScaledVector(right,Math.cos(angle)*radius).addScaledVector(up,Math.sin(angle)*radius).normalize();
   this.projectiles.fire(muzzle,launch,{owner:'player',weapon:shot.kind==='sniper'?'sniper':'assault',damage:shot.damage},shot.speed,shot.range);
   this.effects.muzzle(muzzle,launch);
  }
  if(!shot.melee)this.hooks.effect('shot');else if(this.lastHit)this.hooks.effect('hit');this.updateHUD(true);
 }
 private acceptHit(id:string|null,damage:number,impact:TaggedImpact):boolean {
  const boss=this.bosses?.bosses.find(b=>b.id===id);
  if(boss&&this.bosses){
   const before=boss.hp;if(!this.bosses.hit(boss.id,damage))return false;
   this.encounter?.showDamage(impact.point,Math.min(before,damage));this.hits++;this.lastHit=true;this.hitFlash=.17;
   if(boss.hp===0)this.hooks.announce(`${boss.name}を撃破。${this.bosses.bosses.every(b=>b.hp===0)?'山麓のボス2体を停止しました。':'もう1体のボスに注意してください。'}`);
   this.bossHealth?.update(this.bosses.bosses,0);return true;
  }
  if(this.horde&&id){
   const unit=this.horde.units.find(u=>u.id===id),device=this.horde.devices.find(d=>d.id===id),before=unit?.hp??device?.hp??0;
   if(!(unit?this.horde.hit(id,damage):device?this.horde.hitDevice(id,damage):false))return false;
   this.encounter?.showDamage(impact.point,Math.min(before,damage));this.hits++;this.lastHit=true;this.hitFlash=.17;
   if(unit?.kind==='drone'&&unit.hp===0&&!this.debug&&!this.store.value.droneDefeated)this.store.record({type:'drone-defeated',areaId:'shiretoko',enemyId:'shiretoko-scout-01',remainingHp:0,hitCount:unit.machine.hits});
   if(device?.destroyed)this.hooks.announce(`${device.sourceId==='warehouse-original'?'奥の倉庫':'中継倉庫'}：${device.kind==='drone'?'ドローン':'人型'}の製造装置を破壊。この倉庫からの同型増援を停止しました。`);
   this.save();return true;
  }
  const enemy=id===this.drone?.id?this.drone:id===this.humanoid?.id?this.humanoid:null;
  if(!enemy||!enemy.hit(damage))return false;
  this.hits++;this.lastHit=true;this.hitFlash=.17;
  if(enemy===this.drone&&enemy.hp===0&&!this.debug)this.store.record({type:'drone-defeated',areaId:'shiretoko',enemyId:enemy.id,remainingHp:0,hitCount:enemy.hits});
  this.save();return true;
 }
 private enemyVisible(position:EnemyPosition,height:number){
  const origin={...this.controller.position,y:this.controller.position.y+PLAYER_TUNING.eyeHeight},delta=new T.Vector3(position.x-origin.x,position.y+height-origin.y,position.z-origin.z),distance=delta.length();
  return distance<.01||distance<40&&obstructionDistance(origin,delta.normalize(),distance,this.loader.sightColliders?.(origin.x,origin.z)??this.loader.colliders,this.loader.terrain)>=distance-.12;
 }
 private enemyCanMove(from:Readonly<EnemyPosition>,to:Readonly<EnemyPosition>,radius:number,flying:boolean){
  const bounds=this.loader.area.bounds;
  if(to.x<bounds.minX+1||to.x>bounds.maxX-1||to.z<bounds.minZ+1||to.z>bounds.maxZ-1)return false;
  if(!flying){
   const terrain=this.loader.terrain,e=.35;
   const slope=Math.hypot((terrain.heightAt(to.x+e,to.z)-terrain.heightAt(to.x-e,to.z))/(2*e),(terrain.heightAt(to.x,to.z+e)-terrain.heightAt(to.x,to.z-e))/(2*e));
   if(terrain.inWater(to.x,to.z)||Math.abs(to.y-from.y)>.45||slope>PLAYER_TUNING.maximumSlope)return false;
  }
  const minY=flying?Math.min(from.y,to.y)-radius:to.y,maxY=flying?Math.max(from.y,to.y)+radius:to.y+1.8;
  if(this.loader.terrain.blockedAt)return !this.loader.terrain.blockedAt(to.x,to.z,minY,radius,maxY-minY);
  return !this.loader.colliders.some(c=>{if(maxY<=c.minY||minY>=c.maxY)return false;if(c.type==='cylinder')return Math.hypot(to.x-c.x,to.z-c.z)<c.radius+radius;return Math.hypot(to.x-Math.max(c.minX,Math.min(c.maxX,to.x)),to.z-Math.max(c.minZ,Math.min(c.maxZ,to.z)))<radius;});
 }
 private safeEnemySpawn(x:number,z:number):EnemyPosition {
  for(const [dx,dz]of [[0,0],[-3,0],[3,0],[0,-3],[0,3],[-6,0],[6,0],[0,-6],[0,6]]){const point={x:x+dx,y:this.loader.terrain.heightAt(x+dx,z+dz),z:z+dz};if(this.enemyCanMove(point,point,.34,false))return point;}
  return {x:0,y:this.loader.terrain.heightAt(0,z),z};
 }
 private takeDamage(damage:number){
  if(this.hp<=0)return;this.hp=Math.max(0,this.hp-damage);this.damageFlash=.28;this.hurtTime=.28;this.hooks.effect('hit');
  if(this.hp===0){if(this.horde){if(!this.debug)this.store.reset(true);this.deathReturnSeconds=2.2;}this.thirdPerson=true;this.endShowing=true;this.pause();node('mission-overlay').hidden=false;node('mission-pause').hidden=true;node('mission-end').hidden=false;node('mission-end-title').textContent=this.horde?'家から、もう一度。':'安全な起点から、もう一度。';node('mission-end-text').textContent=this.horde?'行動不能になりました。まもなく家へ戻り、体力・装備・敵の出現を最初からやり直します。':'敵の攻撃で行動不能になりました。再挑戦では起点と体力、装備を戻します。';node('mission-retry').hidden=false;node('mission-next').hidden=true;}
 }
 private updateVisuals(dt:number){
  this.visualDirty=true;
  const weapon=this.weapons.snapshot(),pose=this.weapons.pose;
  const motion:PlayerMotion=this.hp<=0?'Death':this.hurtTime>0?'Hit':weapon.reloading?'Reload':this.actionTime>0?this.actionMotion:!this.controller.grounded?'Jump':this.speed>4?'Run':this.speed>.1?'Walk':weapon.aiming?'Aim':'Idle';
  const visibleThird=this.thirdPerson&&this.camera.position.distanceTo(new T.Vector3(this.controller.position.x,this.controller.position.y+PLAYER_TUNING.eyeHeight,this.controller.position.z))>.8;
  this.actors.setPlayer(this.controller.position,this.controller.yaw,motion,dt,visibleThird);
  if(this.drone)this.actors.setEnemy('drone',this.drone.position,this.drone.yaw,this.drone.motion,dt,this.enemyLevel);
  if(this.humanoid)this.actors.setEnemy('humanoid',this.humanoid.position,this.humanoid.yaw,this.humanoid.motion,dt,this.enemyLevel);
  if(this.horde&&this.encounter){
   for(const unit of this.horde.units){const age=unit.hp<=0?(this.corpseAges.get(unit.id)??0)+dt:0;if(unit.hp<=0)this.corpseAges.set(unit.id,age);if(age>6){this.actors.removeEnemyUnit(unit.id);this.encounter.removeEnemy(unit.id);continue;}this.actors.setEnemyUnit(unit.id,unit.kind,unit.position,unit.yaw,unit.motion,dt,this.enemyLevel);this.encounter.setEnemyHealth(unit.id,unit.position,unit.hp,unit.maxHp,unit.kind);}
   for(const device of this.horde.devices)this.encounter.setDeviceHealth(device.id,device.position,device.hp,device.maxHp);
   this.updateMissionMarkers();this.encounter.step(dt);
  }
  if(this.bosses){for(const boss of this.bosses.bosses)this.bossActors?.setBoss(boss.id,boss.kind,boss.position,boss.yaw,boss.motion,dt);this.bossHealth?.update(this.bosses.bosses,dt);}
  this.actors.setWeapon(weapon.kind,{...pose,lookPitch:this.controller.pitch+pose.cameraPitch,thirdPerson:visibleThird});
 }
 private updateMissionMarkers(){
  if(!this.horde||!this.encounter)return;const step=this.store.value.introStep,key=`${step}:${this.horde.devices.map(d=>d.destroyed).join(',')}`;if(key===this.markerKey)return;this.markerKey=key;
  const radio=AUTHORED_MAP_META.radio,door=AUTHORED_MAP_META.door;
  const points=step<3&&!this.debug?[{id:'radio',position:{x:radio.x,y:AUTHORED_MAP_META.cabin.floorY,z:radio.z},radius:.8,height:2}]:step===3&&!this.debug?[{id:'door',position:door,radius:1.1,height:2.6}]:[...this.horde.devices.filter(d=>!d.destroyed).map(d=>({id:d.id,position:d.position,radius:1.6,height:3})),...[AUTHORED_MAP_META.checkpoint,AUTHORED_MAP_META.exit].map(p=>({id:p.id,position:{x:p.x,y:p.y,z:p.z},radius:2.7,height:4}))];
  const arena=this.loader.encounterLayout?.bossArena;if(arena&&(step===4||this.debug))points.push({id:arena.id,position:arena.center,radius:5,height:5});
  this.encounter.setMissionMarkers(points);
 }
 save(){if(this.debug||this.horde&&this.hp<=0)return;const c=this.controller;this.store.checkpoint({areaId:this.areaId,...c.position,yaw:c.yaw,pitch:c.pitch,hp:this.hp});}
 retry(){this.bosses?.reset();this.bossActors?.reset();this.bossHealth?.reset();this.deathReturnSeconds=0;this.weapons.reset(this.preview[this.preview.held]);this.projectiles.clear();this.effects.clear();this.hp=COMBAT_TUNING.playerHp;this.controller.recover();this.controller.yaw=this.loader.area.spawn.yaw;this.controller.pitch=0;this.speed=0;this.actionTime=this.hurtTime=this.damageFlash=0;this.drone?.reset(!this.debug&&this.store.value.droneDefeated);this.humanoid?.reset();if(this.horde){this.horde.reset();this.actors.resetEnemyUnits();this.encounter?.reset();this.encounter?.setSpawnDevices(this.horde.devices);this.corpseAges.clear();this.markerKey='';this.elapsed=this.checkpointClock=this.hudClock=0;this.shots=this.hits=this.meleeHits=this.misses=0;this.thirdPerson=false;if(!this.debug){this.store.reset(true);this.store.beginSession(this.areaId,false);}}if(!this.debug)this.store.record({type:'position',areaId:this.areaId,position:{...this.controller.position},grounded:true});this.endShowing=false;node('mission-end').hidden=true;node('mission-retry').hidden=true;this.pause(false);this.save();if(this.horde)this.showInitial();this.updateCamera();this.updateVisuals(0);this.updateHUD(true);}
 updateCamera(){
  const p=this.controller.position,pose=this.weapons.pose;
  const eye=new T.Vector3(p.x,p.y+PLAYER_TUNING.eyeHeight,p.z);
  this.camera.position.copy(eye);this.camera.rotation.set(this.controller.pitch+pose.cameraPitch-(this.hp<=0?.22:0),this.controller.yaw+pose.cameraYaw,0,'YXZ');
  if(this.thirdPerson){const back=new T.Vector3(.55,.35,3.3).applyEuler(new T.Euler(this.controller.pitch*.45,this.controller.yaw,0,'YXZ'));const distance=back.length();const allowed=obstructionDistance(eye,back.normalize(),distance,this.loader.colliders,this.loader.terrain);this.camera.position.addScaledVector(back,Math.max(.08,allowed-.16));}
  const base=innerWidth<700?82:74,target=this.weapons.kind==='sniper'?30:58,fov=T.MathUtils.lerp(base,target,pose.aim);
  if(Math.abs(this.camera.fov-fov)>.01){this.camera.fov=fov;this.camera.updateProjectionMatrix();}
  this.camera.updateMatrixWorld(true);
 }
 resize(){this.visualDirty=true;this.freeMouse.reset();this.camera.aspect=innerWidth/innerHeight;this.camera.fov=innerWidth<700?82:74;this.camera.updateProjectionMatrix();}
 preferences(quality:WorldQuality){if(this.quality===quality)return;this.visualDirty=true;this.quality=quality;this.loader.setQuality(quality);this.actors.setEnemyViewDistance(quality==='low'?120:180);this.encounter?.setViewDistance(quality==='low'?120:180);this.bossActors?.setViewDistance(quality==='low'?120:180);this.bossHealth?.setViewDistance(quality==='low'?120:180);this.hooks.invalidate();}
 render(){if(this.disposed||!this.renderBackpressure.canSubmit())return;const start=performance.now();this.renderer.render(this.loader.scene,this.camera);this.visualDirty=false;this.renderBackpressure.submitted();this.frames++;this.frameTimes.push(performance.now()-start);if(this.frameTimes.length>240)this.frameTimes.shift();}
 updateHUD(force=false){
  const step=this.store.value.introStep;
  let text=this.areaId==='sapporo'?'都市入口を徒歩で探索。廃車は装飾・運転不可。正式任務は開発中。':this.areaId!=='shiretoko'?'道標をたどり、歩ける環境を確かめる。正式任務は開発中。':step===0?'木造の家で目覚める。':step===1?'家のラジオへ近づき、Eで報道を聞く。':step===2?'親友から届いた連絡を読む。':step===3?'玄関を抜け、森へ出発する。':this.drone&&this.drone.hp>0?'林道の小型ドローンを停止させ、道標へ向かう。':'林道をたどり、次の区間の道標へ。';
  const arena=this.loader.encounterLayout?.bossArena,inArena=!!arena&&Math.hypot(this.controller.position.x-arena.center.x,this.controller.position.z-arena.center.z)<arena.radius+5;
  if(this.horde&&step===4)text=inArena?(this.bosses?.bosses.every(b=>b.hp===0)?'山麓のボス2体を撃破。残る敵を警戒し、次の道標へ。':'山麓のボス「錆猪」「哨戒梟」を停止させる。'):this.horde.devices.every(d=>d.destroyed)?'製造装置を停止した。残る敵に注意し、山麓のボス戦エリアへ。':'林道沿いの中継倉庫と奥の倉庫で、人型・ドローンの製造装置を破壊する。';
  if(this.debug)text='開発用の環境確認 / 進行は保存されません。';
  const exit=this.loader.area.exitTriggers[0],activeDevice=step===4?this.horde?.devices.filter(device=>!device.destroyed).sort((a,b)=>Math.hypot(this.controller.position.x-a.position.x,this.controller.position.z-a.position.z)-Math.hypot(this.controller.position.x-b.position.x,this.controller.position.z-b.position.z))[0]:undefined;
  const destination=activeDevice?.position??(step===4&&this.horde&&arena?arena.center:exit?.position),destinationLabel=activeDevice?(activeDevice.sourceId==='warehouse-original'?'奥の倉庫':'中継倉庫'):step===4&&this.horde&&arena?'山麓のボスエリア':'道標',distance=destination?Math.round(Math.hypot(this.controller.position.x-destination.x,this.controller.position.z-destination.z)):0;
  const weapon=this.weapons.snapshot(),horde=this.horde?.summary();const data=JSON.stringify([text,Math.ceil(this.hp),this.drone?.hp,this.drone?.state,this.humanoid?.hp,this.humanoid?.state,horde?.spawned,horde?.killed,horde?.devices.map(d=>d.hp),Math.ceil(horde?.nextSpawnIn??0),weapon.kind,weapon.ammo,weapon.reserve,weapon.unlimitedReserve,Math.round(weapon.reloadProgress*10),weapon.aiming,this.thirdPerson,this.paused,distance,destinationLabel,this.hitFlash>0,this.damageFlash>0,this.store.saveStatus]);if(!force&&data===this.lastUI)return;this.lastUI=data;
  node('mission-objective').textContent=text;node('mission-health').textContent=`${Math.ceil(this.hp)} / ${COMBAT_TUNING.playerHp}`;node('player-health-fill').style.width=`${100*this.hp/COMBAT_TUNING.playerHp}%`;node('player-health-bar').setAttribute('aria-valuenow',String(Math.ceil(this.hp)));node('mission-distance').textContent=`${destinationLabel}まで ${distance} m`;
  const enemySeen=this.drone&&(step===4||this.debug)&&Math.hypot(this.controller.position.x-this.drone.position.x,this.controller.position.z-this.drone.position.z)<30;const states={patrol:'巡回',alert:'発見',chase:'追跡',windup:'攻撃予備動作',attack:'攻撃',recover:'立て直し',hit:'ひるみ',dead:'停止'};
  node('mission-enemy').textContent=enemySeen&&this.drone?`ドローンLv.${this.enemyLevel} / HP ${this.drone.hp} / ${states[this.drone.state]}${this.humanoid?`　人型 / HP ${this.humanoid.hp}`:''}`:this.areaId==='shiretoko'?'人型・偵察ドローン / 林道を探索':'環境探索 / 正式任務は開発中';
  if(horde)node('mission-enemy').textContent=`敵 ${horde.alive}体 / 撃破 ${horde.killed}体　${horde.sources.map(source=>`${source.id==='warehouse-original'?'奥':'中継'} ${source.spawned}/${source.target}`).join('・')}${horde.nextSpawnIn===null?'':`　次 ${Math.ceil(horde.nextSpawnIn)}秒`}`;
  node('mission-weapon').textContent=`${{assault:'アサルト',sniper:'スナイパー',knife:'ナイフ'}[weapon.kind]}　${weapon.ammo===null?'近接':`${weapon.ammo} / ${weapon.unlimitedReserve?'∞':weapon.reserve}`}${weapon.reloading?`　装填中 ${Math.round(weapon.reloadProgress*100)}%`:''}`;
  node('mission-view').textContent=`${this.thirdPerson?'三人称':'一人称'}${weapon.aiming?' / 構え':''}${this.freeLook?' / マウス視点':''}`;
  node('mission-crosshair').dataset.hit=String(this.lastHit&&this.hitFlash>0);node('mission-crosshair').dataset.aim=String(weapon.aiming);node('mission-damage').hidden=!(this.damageFlash>0);node('mission-interact').hidden=this.areaId!=='shiretoko'||step!==1;
  const scoped=weapon.kind==='sniper'&&weapon.aiming&&!this.thirdPerson;node('mission-scope').hidden=!scoped;node('mission-crosshair').dataset.scope=String(scoped);
  node('mission-save').textContent=this.debug?'開発プレビュー / 進行保存なし':this.store.saveStatus==='saved'?'進行をこの端末に保存':'進行はこのセッションで維持';
 }
 snapshot(detail=true){const values=[...this.frameTimes].sort((a,b)=>a-b);return {areaId:this.areaId,paused:this.paused,locked:this.locked,inputMode:this.paused?'paused':this.locked?'pointer-lock':this.freeLook?'free-mouse':'paused',player:{...this.controller.position,yaw:this.controller.yaw,pitch:this.controller.pitch,grounded:this.controller.grounded,distance:this.controller.distance,recoveries:this.controller.recoveries,hp:this.hp},enemy:this.drone?{...this.drone.snapshot(),state:this.drone.hp===0?'stopped':this.drone.state}:null,enemies:this.horde?this.horde.units.map(u=>u.snapshot()):[this.drone?.snapshot(),this.humanoid?.snapshot()].filter(Boolean),horde:this.horde?.snapshot()??null,encounter:this.encounter?.snapshot()??null,bosses:this.bosses?.snapshot()??null,bossActors:this.bossActors?.snapshot()??null,bossHealth:this.bossHealth?.snapshot()??null,deathReturnSeconds:this.deathReturnSeconds,shield:0,weapon:this.weapons.snapshot(),recoil:this.weapons.pose,thirdPerson:this.thirdPerson,actors:this.actors.snapshot(),projectiles:{active:this.projectiles.active,pending:this.projectiles.pendingReceipts,tracers:this.projectiles.visibleTracers.length},effects:this.effects.snapshot(),shots:this.shots,hits:this.hits,meleeHits:this.meleeHits,misses:this.misses,elapsed:this.elapsed,keys:[...this.keys],storyStep:this.store.value.introStep,frames:this.frames,renderQueue:this.renderBackpressure.snapshot(),loadMs:this.loadMs,renderCpuMs:{median:values[Math.floor(values.length*.5)]??0,p95:values[Math.floor(values.length*.95)]??0},world:detail?this.loader.stats():null,quality:this.quality,debug:this.debug,sites:this.loader.encounterLayout?{warehouse:{id:this.loader.encounterLayout.warehouse.id,center:this.loader.encounterLayout.warehouse.center,entrance:this.loader.encounterLayout.warehouse.entrance},bossArena:{id:this.loader.encounterLayout.bossArena.id,center:this.loader.encounterLayout.bossArena.center,radius:this.loader.encounterLayout.bossArena.radius,entrance:this.loader.encounterLayout.bossArena.entrance,bossPlaced:!!this.bosses,bossCount:this.bosses?.bosses.length??0}}:null};}
 dispose(){
  if(this.disposed)return;this.save();this.disposed=true;this.lockRequest++;this.pendingLock=false;this.freeLook=false;this.freeMouse.reset();this.canvas.style.cursor='';this.canvas.removeEventListener('mouseleave',this.mouseLeave);this.renderBackpressure.dispose();this.hooks.stopEffects();this.keys.clear();if(document.pointerLockElement===this.canvas)document.exitPointerLock();
  document.removeEventListener('keydown',this.keyDown);document.removeEventListener('keyup',this.keyUp);document.removeEventListener('mousemove',this.mouseMove);document.removeEventListener('mouseup',this.mouseUp);document.removeEventListener('pointerlockchange',this.lockChange);document.removeEventListener('pointerlockerror',this.lockError);document.removeEventListener('visibilitychange',this.visibility);window.removeEventListener('blur',this.blur);this.canvas.removeEventListener('mousedown',this.mouseDown);this.canvas.removeEventListener('contextmenu',this.contextMenu);
  node('mission-lock').removeEventListener('click',this.lockClick);node('mission-home').removeEventListener('click',this.homeClick);node('mission-interact').removeEventListener('click',this.interactClick);node('mission-skip').removeEventListener('click',this.skipClick);node('mission-continue').removeEventListener('click',this.continueClick);node('mission-retry').removeEventListener('click',this.retryClick);node('mission-next').removeEventListener('click',this.nextClick);node('mission-pause-button').removeEventListener('click',this.pauseClick);
  this.weapons.clearInput();this.projectiles.clear();this.actors.dispose();this.bossActors?.dispose();this.bossHealth?.dispose();this.encounter?.dispose();this.effects.dispose();this.loader.scene.remove(this.camera);this.loader.dispose();this.renderer.renderLists.dispose();
  for(const id of ['mission-story','mission-end','mission-pause','mission-overlay'])node(id).hidden=true;
 }
}
