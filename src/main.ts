import './style.css';
import { ScreenState, parsePreferences, REVEAL_MS, type Preferences } from './state';
import { WorldView } from './scene';
import { makeFallback } from './fallback';
import { Atmosphere } from './audio';
import { Home } from './home';
import { ReferenceMenus } from './reference-menus';
import { CampaignStore, isAreaUnlocked, type MissionCheckpoint } from './campaign/index';
import { AREA_DEFINITIONS, AREA_IDS, type AreaId } from './world/index';
import { Mission } from './mission/runtime';

function element<T extends HTMLElement>(id:string){const el=document.getElementById(id);if(!el)throw new Error(`Missing UI element: ${id}`);return el as T;}
const state=new ScreenState(),atmosphere=new Atmosphere();
const sceneHost=element('scene'),titleScreen=element('title-screen'),homeScreen=element('home-screen');
const settings=element<HTMLDialogElement>('settings-dialog');
const titleButton=element<HTMLButtonElement>('title-button'),homeButton=element<HTMLButtonElement>('home-button');
const soundButton=element<HTMLButtonElement>('sound-button');
const icon=(paths:string)=>`<svg viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
const live=element('live-region');
const media=matchMedia('(prefers-reduced-motion: reduce)');
let prefs:Preferences;
try{prefs=parsePreferences(localStorage.getItem('reclaim.display.v1'),media.matches);}catch{prefs=parsePreferences(null,media.matches);}
let world:WorldView|null=null,fallback:ReturnType<typeof makeFallback>|null=null,mission:Mission|null=null,referenceMenus:ReferenceMenus|null=null;
let campaign:CampaignStore;try{campaign=new CampaignStore(localStorage);}catch{campaign=new CampaignStore(null);}
function enableFallback(){
  if(mission){mission.dispose();mission=null;switchScreen('home');}
  element('renderer-notice').hidden=false;document.body.dataset.renderer='fallback';
  fallback=makeFallback(sceneHost);
}
try{
 world=new WorldView(sceneHost,enableFallback);world.preferences(prefs);
 // TITLE/HOME are 2D on every viewport; never precompile the retired mobile boss reveal.
 document.body.dataset.renderer='webgl';
}catch{enableFallback();}
// Entry always starts at the title. No previous session is ever resumed straight into a mission.
document.body.dataset.screen='title';document.body.dataset.reveal='false';
let frameId=0,lastFrame=0,frameCount=0,lastRafTime=0,fallbackFrames=0,frameTicket=0,watchdogTimer=0,frameDirty=true,wasVisible=false,disposed=false;
function invalidateRender(){frameDirty=true;}
function scheduleFrame(){
 const ticket=++frameTicket;
 frameId=requestAnimationFrame(time=>{if(ticket===frameTicket)frame(time);});
 const check=()=>{
  if(ticket!==frameTicket||disposed||document.hidden)return;
  // A compositor can delay RAF while input/timers still work. Submit one
  // pending UI change, never an idle animation stream, after that delay.
  if(frameDirty){cancelAnimationFrame(frameId);frame(performance.now(),true);}
  else watchdogTimer=window.setTimeout(check,100);
 };
 watchdogTimer=window.setTimeout(check,100);
}
let revealTimer:ReturnType<typeof setTimeout>|null=null;
/** A brief reveal must end even when the GPU stops delivering animation frames. */
function endReveal(){
 if(revealTimer!==null){clearTimeout(revealTimer);revealTimer=null;}
 state.revealStarted=null;document.body.dataset.reveal='false';wasVisible=false;
 if(world){world.title.boss.visible=false;world.title.bossMat.opacity=0;}
 fallback?.bossOpacity(0);
 invalidateRender();
}
function frame(time:number,fromWatchdog=false){
 clearTimeout(watchdogTimer);
  if(disposed||document.hidden)return;
  scheduleFrame();
  if(!fromWatchdog)lastRafTime=time;
  // A delayed compositor timestamp must not gate new UI/camera work. Use the
  // same current monotonic clock for the 30fps cap, animation and reveal expiry.
  const now=performance.now();
  if(now-lastFrame<(state.screen==='mission'&&mission&&!mission.paused?0:1000/30))return;
  const delta=lastFrame?Math.max(0,(now-lastFrame)/1000):0;
  lastFrame=now;frameCount++;if(fromWatchdog)fallbackFrames++;frameDirty=false;
  const opacity=state.bossOpacity(now,prefs.reducedMotion);
  const visible=opacity>0;
  if(visible!==wasVisible){document.body.dataset.reveal=String(visible);wasVisible=visible;}
  if(state.screen==='mission'&&mission&&!world?.lost)mission.update(delta);
  else if(!referenceMenus?.active){if(world&&!world.lost)world.render(now,state,opacity);else fallback?.bossOpacity(opacity);}
}
scheduleFrame();
function announce(message:string){live.textContent=message;}
const home=new Home(state,world,announce,invalidateRender,campaign,startMission);
referenceMenus=new ReferenceMenus(state,home,campaign,()=>prefs,()=>atmosphere.enabled,switchScreen,announce);
titleButton.addEventListener('click',()=>{
 if(referenceMenus?.active){announce('RECLAIM。STARTからHOMEへ進めます。');return;}
 if(!state.reveal(performance.now()))return;
 if(revealTimer!==null)clearTimeout(revealTimer);
 revealTimer=setTimeout(endReveal,REVEAL_MS);
 invalidateRender();
 atmosphere.hint();announce('東京の廃墟の向こうに、巨大な機械の影が一瞬現れます。');
});
function switchScreen(target:'title'|'home'){
 mission?.dispose();mission=null;element('mission-screen').hidden=true;
 endReveal();
 if(target==='home')state.goHome();else state.goTitle();
 titleScreen.hidden=target!=='title';homeScreen.hidden=target!=='home';document.body.dataset.screen=target;document.body.dataset.reveal='false';wasVisible=false;
 home.screenChanged();
 referenceMenus?.refresh();
 invalidateRender();
 if(target==='home'){element<HTMLButtonElement>('start-button').focus({preventScroll:true});announce('ホーム。外観と装備を準備し、知床の探索へ出撃できます。オンライン未接続です。');}
 else{homeButton.focus({preventScroll:true});announce('タイトル画面に戻りました。');}
}

function startMission(areaId:AreaId,resume:MissionCheckpoint|null=null,debug=false){
 if(!debug&&referenceMenus&&(referenceMenus.mobile||referenceMenus.touchOnly)){
  const message='本編の徒歩・射撃はPCのキーボードとマウスが必要です。スマホでは出撃を開始しません。保存位置・進行は変更していません。';
  element('mobile-mission-notice').textContent=message;element('mobile-mission-notice').hidden=false;
  announce(message);return;
 }
 if(!world||world.lost){announce('3Dを表示できないため出撃できません。HOMEは操作できます。');return;}
 if(!debug&&!isAreaUnlocked(campaign.value,areaId))return;
 endReveal();mission?.dispose();mission=null;home.close(false);home.drawer(false);state.goMission();
 titleScreen.hidden=true;homeScreen.hidden=true;element('mission-screen').hidden=false;document.body.dataset.screen='mission';lastFrame=performance.now();
 referenceMenus?.refresh();
 try{mission=new Mission(world.renderer,campaign,areaId,prefs.quality,home.saved,{returnHome:()=>switchScreen('home'),announce,invalidate:invalidateRender,effect:kind=>atmosphere.effect(kind),stopEffects:()=>atmosphere.stopEffects()},resume,debug);world.renderer.domElement.tabIndex=-1;invalidateRender();}
 catch(error){announce(`探索の読み込みに失敗しました。${error instanceof Error?error.message:''}`);switchScreen('home');}
}
homeButton.addEventListener('click',()=>switchScreen('home'));
element('back-title').addEventListener('click',()=>switchScreen('title'));
element('settings-button').addEventListener('click',()=>{mission?.pause();settings.showModal();});
settings.addEventListener('close',()=>{if(home.modal&&home.panel)element('panel-title').focus({preventScroll:true});});
const quality=element<HTMLSelectElement>('quality-select'),motion=element<HTMLInputElement>('motion-toggle');quality.value=prefs.quality;motion.checked=prefs.reducedMotion;
function savePrefs(){world?.preferences(prefs);mission?.preferences(prefs.quality);referenceMenus?.refresh();invalidateRender();try{localStorage.setItem('reclaim.display.v1',JSON.stringify(prefs));element('settings-save-status').hidden=true;}catch{element('settings-save-status').hidden=false;announce('表示設定を保存できませんでした。この画面では変更を維持します。');}}
quality.addEventListener('change',()=>{prefs.quality=quality.value==='low'?'low':'balanced';savePrefs();});
motion.addEventListener('change',()=>{prefs.reducedMotion=motion.checked;savePrefs();});
const off=icon('<path d="M4 9h4l5-4v14l-5-4H4zM17 9l5 6M22 9l-5 6"/>');
const on=icon('<path d="M4 9h4l5-4v14l-5-4H4zM17 8a6 6 0 010 8M20 5a10 10 0 010 14"/>');
element('sound-icon').innerHTML=off;
soundButton.addEventListener('click',async()=>{try{const enabled=await atmosphere.setEnabled(!atmosphere.enabled);soundButton.setAttribute('aria-pressed',String(enabled));soundButton.setAttribute('aria-label',enabled?'環境音をオフにする':'環境音をオンにする');element('sound-icon').innerHTML=enabled?on:off;referenceMenus?.refresh();announce(enabled?'環境音をオンにしました。':'環境音はオフです。');}catch{announce('環境音を開始できませんでした。音はオフのままメニューを操作できます。');}});
function syncMenuViewport(){const view=window.visualViewport;document.body.style.setProperty('--menu-height',`${view?.height??innerHeight}px`);document.body.style.setProperty('--menu-offset-top',`${view?.offsetTop??0}px`);}
function resize(){syncMenuViewport();world?.resize();mission?.resize();referenceMenus?.refresh();home.layout();invalidateRender();}
function pointer(event:PointerEvent){if(world){world.pointer.x=(event.clientX/innerWidth-.5)*2;world.pointer.y=(event.clientY/innerHeight-.5)*2;if(state.screen==='title'&&!prefs.reducedMotion)invalidateRender();}}
function visibility(){frameTicket++;cancelAnimationFrame(frameId);clearTimeout(watchdogTimer);if(document.hidden){endReveal();mission?.pause();}else{lastFrame=0;invalidateRender();scheduleFrame();}void atmosphere.visibility(document.hidden);}
const viewportScroll=()=>{syncMenuViewport();home.layout();};
addEventListener('resize',resize);window.visualViewport?.addEventListener('resize',resize);window.visualViewport?.addEventListener('scroll',viewportScroll);addEventListener('pointermove',pointer,{passive:true});document.addEventListener('visibilitychange',visibility);
const enforceMissionPointerLock=()=>{if(state.screen!=='mission'&&document.pointerLockElement)document.exitPointerLock();};
document.addEventListener('pointerlockchange',enforceMissionPointerLock);
function dispose(){if(disposed)return;disposed=true;endReveal();frameTicket++;cancelAnimationFrame(frameId);clearTimeout(watchdogTimer);mission?.dispose();mission=null;referenceMenus?.dispose();home.dispose();world?.dispose();atmosphere.dispose();removeEventListener('resize',resize);window.visualViewport?.removeEventListener('resize',resize);window.visualViewport?.removeEventListener('scroll',viewportScroll);removeEventListener('pointermove',pointer);document.removeEventListener('visibilitychange',visibility);document.removeEventListener('pointerlockchange',enforceMissionPointerLock);}
// Preserve the page when it goes into the browser back/forward cache.
addEventListener('pagehide',(event:PageTransitionEvent)=>{if(!event.persisted)dispose();});
// Read-only diagnostics for automated checks. No state mutation or network entry point.
Object.defineProperty(window,'__RECLAIM__',{value:Object.freeze({snapshot:()=>({screen:state.screen,squadPreview:state.squadPreview,revealing:state.bossOpacity(performance.now(),prefs.reducedMotion)>0,reducedMotion:prefs.reducedMotion,renderer:document.body.dataset.renderer,menus:referenceMenus?.snapshot()??null,renderClock:{rafTime:lastRafTime,clockTime:lastFrame,frames:frameCount,fallbackFrames,rendererFrames:world?.renderer.info.render.frame??0},home:home.snapshot(),campaign:campaign.value,mission:mission?.snapshot()??null,render:world?.stats()??null})}),writable:false});
syncMenuViewport();document.body.dataset.ready='true';
for(const button of [titleButton,homeButton,soundButton,element<HTMLButtonElement>('settings-button')])button.disabled=false;
element('boot-notice').hidden=true;

if(import.meta.env.DEV){const id=new URLSearchParams(location.search).get('dev-area');if(AREA_IDS.includes(id as AreaId)){switchScreen('home');startMission(id as AreaId,null,true);}}
