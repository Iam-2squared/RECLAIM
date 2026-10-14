import './style.css';
import { ScreenState, parsePreferences, REVEAL_MS, type Preferences } from './state';
import { WorldView } from './scene';
import { makeFallback } from './fallback';
import { Atmosphere } from './audio';
import { Home } from './home';

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
let world:WorldView|null=null,fallback:ReturnType<typeof makeFallback>|null=null;
function enableFallback(){
  element('renderer-notice').hidden=false;document.body.dataset.renderer='fallback';
  fallback=makeFallback(sceneHost);
}
try{
 world=new WorldView(sceneHost,enableFallback);world.preferences(prefs);
 // Precompile the hidden boss shader without drawing it; the first click stays brief.
 world.title.boss.visible=true;
 world.renderer.compile(world.title.scene,world.camera);
 world.title.boss.visible=false;
 document.body.dataset.renderer='webgl';
}catch{enableFallback();}
// Entry always starts at the title. No previous session is ever resumed straight into a mission.
document.body.dataset.screen='title';document.body.dataset.reveal='false';
let frameId=0,lastFrame=0,frameCount=0,lastRafTime=0,wasVisible=false,disposed=false;
let revealTimer:ReturnType<typeof setTimeout>|null=null;
/** A brief reveal must end even when the GPU stops delivering animation frames. */
function endReveal(){
 if(revealTimer!==null){clearTimeout(revealTimer);revealTimer=null;}
 state.revealStarted=null;document.body.dataset.reveal='false';wasVisible=false;
 if(world){world.title.boss.visible=false;world.title.bossMat.opacity=0;}
 fallback?.bossOpacity(0);
}
function frame(time:number){
  if(disposed||document.hidden)return;
  frameId=requestAnimationFrame(frame);
  lastRafTime=time;
  // A delayed compositor timestamp must not gate new UI/camera work. Use the
  // same current monotonic clock for the 30fps cap, animation and reveal expiry.
  const now=performance.now();
  if(now-lastFrame<1000/30)return;
  lastFrame=now;frameCount++;
  const opacity=state.bossOpacity(now,prefs.reducedMotion);
  const visible=opacity>0;
  if(visible!==wasVisible){document.body.dataset.reveal=String(visible);wasVisible=visible;}
  if(world&&!world.lost)world.render(now,state,opacity);else fallback?.bossOpacity(opacity);
}
frameId=requestAnimationFrame(frame);
function announce(message:string){live.textContent=message;}
const home=new Home(state,world,announce);
titleButton.addEventListener('click',()=>{
 if(!state.reveal(performance.now()))return;
 if(revealTimer!==null)clearTimeout(revealTimer);
 revealTimer=setTimeout(endReveal,REVEAL_MS);
 atmosphere.hint();announce('東京の廃墟の向こうに、巨大な機械の影が一瞬現れます。');
});
function switchScreen(target:'title'|'home'){
 endReveal();
 if(target==='home')state.goHome();else state.goTitle();
 titleScreen.hidden=target!=='title';homeScreen.hidden=target!=='home';document.body.dataset.screen=target;document.body.dataset.reveal='false';wasVisible=false;
 home.screenChanged();
 if(target==='home'){element<HTMLButtonElement>('start-button').focus({preventScroll:true});announce('ホーム。キャラクターとメニューのプレビューです。戦闘とマルチプレイは未実装です。');}
 else{homeButton.focus({preventScroll:true});announce('タイトル画面に戻りました。');}
}
homeButton.addEventListener('click',()=>switchScreen('home'));
element('back-title').addEventListener('click',()=>switchScreen('title'));
element('settings-button').addEventListener('click',()=>settings.showModal());
settings.addEventListener('close',()=>{if(home.modal&&home.panel)element('panel-title').focus({preventScroll:true});});
const quality=element<HTMLSelectElement>('quality-select'),motion=element<HTMLInputElement>('motion-toggle');quality.value=prefs.quality;motion.checked=prefs.reducedMotion;
function savePrefs(){world?.preferences(prefs);try{localStorage.setItem('reclaim.display.v1',JSON.stringify(prefs));}catch{/* Storage is optional; browsing in private mode still works. */}}
quality.addEventListener('change',()=>{prefs.quality=quality.value==='low'?'low':'balanced';savePrefs();});
motion.addEventListener('change',()=>{prefs.reducedMotion=motion.checked;savePrefs();});
const off=icon('<path d="M4 9h4l5-4v14l-5-4H4zM17 9l5 6M22 9l-5 6"/>');
const on=icon('<path d="M4 9h4l5-4v14l-5-4H4zM17 8a6 6 0 010 8M20 5a10 10 0 010 14"/>');
element('sound-icon').innerHTML=off;
soundButton.addEventListener('click',async()=>{const enabled=await atmosphere.setEnabled(!atmosphere.enabled);soundButton.setAttribute('aria-pressed',String(enabled));soundButton.setAttribute('aria-label',enabled?'環境音をオフにする':'環境音をオンにする');element('sound-icon').innerHTML=enabled?on:off;announce(enabled?'環境音をオンにしました。':'環境音はオフです。');});
function resize(){world?.resize();home.layout();}
function pointer(event:PointerEvent){if(world){world.pointer.x=(event.clientX/innerWidth-.5)*2;world.pointer.y=(event.clientY/innerHeight-.5)*2;}}
function visibility(){cancelAnimationFrame(frameId);if(document.hidden){endReveal();}else{lastFrame=0;frameId=requestAnimationFrame(frame);}void atmosphere.visibility(document.hidden);}
const viewportScroll=()=>home.layout();
addEventListener('resize',resize);window.visualViewport?.addEventListener('resize',resize);window.visualViewport?.addEventListener('scroll',viewportScroll);addEventListener('pointermove',pointer,{passive:true});document.addEventListener('visibilitychange',visibility);
function dispose(){if(disposed)return;disposed=true;endReveal();cancelAnimationFrame(frameId);home.dispose();world?.dispose();atmosphere.dispose();removeEventListener('resize',resize);window.visualViewport?.removeEventListener('resize',resize);window.visualViewport?.removeEventListener('scroll',viewportScroll);removeEventListener('pointermove',pointer);document.removeEventListener('visibilitychange',visibility);}
// Preserve the page when it goes into the browser back/forward cache.
addEventListener('pagehide',(event:PageTransitionEvent)=>{if(!event.persisted)dispose();});
// Read-only diagnostics for automated checks. No state mutation or network entry point.
Object.defineProperty(window,'__RECLAIM__',{value:Object.freeze({snapshot:()=>({screen:state.screen,squadPreview:state.squadPreview,revealing:state.bossOpacity(performance.now(),prefs.reducedMotion)>0,reducedMotion:prefs.reducedMotion,renderer:document.body.dataset.renderer,renderClock:{rafTime:lastRafTime,clockTime:lastFrame,frames:frameCount},home:home.snapshot(),render:world?.stats()??null})}),writable:false});
document.body.dataset.ready='true';
for(const button of [titleButton,homeButton,soundButton,element<HTMLButtonElement>('settings-button')])button.disabled=false;
element('boot-notice').hidden=true;
