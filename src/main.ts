import './style.css';
import { ScreenState, parsePreferences, type Preferences } from './state';
import { WorldView } from './scene';
import { makeFallback } from './fallback';
import { Atmosphere } from './audio';

function element<T extends HTMLElement>(id:string){const el=document.getElementById(id);if(!el)throw new Error(`Missing UI element: ${id}`);return el as T;}
const state=new ScreenState(),atmosphere=new Atmosphere();
const sceneHost=element('scene'),titleScreen=element('title-screen'),homeScreen=element('home-screen');
const settings=element<HTMLDialogElement>('settings-dialog'),feature=element<HTMLDialogElement>('feature-dialog');
const titleButton=element<HTMLButtonElement>('title-button'),homeButton=element<HTMLButtonElement>('home-button');
const soundButton=element<HTMLButtonElement>('sound-button');
const live=element('live-region');
const media=matchMedia('(prefers-reduced-motion: reduce)');
let prefs:Preferences;
try{prefs=parsePreferences(localStorage.getItem('reclaim.display.v1'),media.matches);}catch{prefs=parsePreferences(null,media.matches);}
let world:WorldView|null=null,fallback:ReturnType<typeof makeFallback>|null=null;
function enableFallback(){
  element('renderer-notice').hidden=false;document.body.dataset.renderer='fallback';
  fallback=makeFallback(sceneHost);
}
try{world=new WorldView(sceneHost,enableFallback);world.preferences(prefs);document.body.dataset.renderer='webgl';}catch{enableFallback();}
// Entry always starts at the title. No previous session is ever resumed straight into a mission.
document.body.dataset.screen='title';document.body.dataset.reveal='false';
let frameId=0,lastFrame=0,wasVisible=false,disposed=false;
function frame(time:number){
  if(disposed||document.hidden)return;
  frameId=requestAnimationFrame(frame);
  if(time-lastFrame<1000/30)return;
  lastFrame=time;
  const opacity=state.bossOpacity(time,prefs.reducedMotion);
  const visible=opacity>0;
  if(visible!==wasVisible){document.body.dataset.reveal=String(visible);wasVisible=visible;}
  if(world&&!world.lost)world.render(time,state,opacity);else fallback?.bossOpacity(opacity);
}
frameId=requestAnimationFrame(frame);
function announce(message:string){live.textContent=message;}
titleButton.addEventListener('click',()=>{
 if(!state.reveal(performance.now()))return;
 atmosphere.hint();announce('東京の廃墟の向こうに、巨大な機械の影が一瞬現れます。');
});
function switchScreen(target:'title'|'home'){
 if(target==='home')state.goHome();else state.goTitle();
 titleScreen.hidden=target!=='title';homeScreen.hidden=target!=='home';document.body.dataset.screen=target;document.body.dataset.reveal='false';wasVisible=false;
 if(target==='home'){element<HTMLButtonElement>('start-button').focus({preventScroll:true});announce('ホーム。キャラクターとメニューのプレビューです。戦闘とマルチプレイは未実装です。');}
 else{homeButton.focus({preventScroll:true});announce('タイトル画面に戻りました。');}
}
homeButton.addEventListener('click',()=>switchScreen('home'));
element('back-title').addEventListener('click',()=>switchScreen('title'));
element('solo-button').addEventListener('click',()=>setSquad(false));
element('squad-button').addEventListener('click',()=>setSquad(true));
function setSquad(value:boolean){state.squadPreview=value;element('solo-button').setAttribute('aria-pressed',String(!value));element('squad-button').setAttribute('aria-pressed',String(value));element('squad-note').textContent=value?'4人配置の見本・オンライン接続ではありません':'ローカル画面プレビュー・通信なし';announce(value?'自分を先頭にした4人配置の見本です。ほかの3体は仮モデルです。':'ソロ配置に戻しました。');}
const icon=(paths:string)=>`<svg viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
const features=[
 {name:'マップ',icon:'<path d="M3 5l6-2 6 2 6-2v16l-6 2-6-2-6 2zM9 3v16M15 5v16"/>',category:'CAMPAIGN MAP',copy:'知床から南へ。そして、もう一度東京へ。',detail:'知床 → 札幌 → 函館\n日本縦断の最初の作戦は、知床です。\nマップ選択・出撃機能は今後実装します。'},
 {name:'キャラ設定',icon:'<circle cx="12" cy="7" r="3"/><path d="M5 21v-5a7 7 0 0114 0v5"/>',category:'YOUR SURVIVOR',copy:'この世界を取り戻す、ひとりになる。',detail:'中央・最前列が自分の位置です。\n現在のキャラクターは形状確認用の仮モデル。\n外見の編集・保存はまだありません。'},
 {name:'武器',icon:'<path d="M3 9h15l3 3-3 3H9l-2 5H4l2-7H3zM12 9V6h4v3"/>',category:'ARMORY',copy:'頼れるのは、この手で整えた道具だけ。',detail:'アサルト / スナイパー / 小銃 / 日本刀\n武器の装備・強化・レアリティは今後実装。\nこの画面で性能や所持品は変更されません。'},
 {name:'今のボス状況',icon:'<path d="M5 7l7-4 7 4v10l-7 4-7-4zM8 10h2M14 10h2M9 16l3-3 3 3"/>',category:'WORLD RAID',copy:'別の戦場でも、同じ敵と戦っている。',detail:'同時戦闘は1小隊4人まで。\n共有HPと3つの壁は将来の実装です。\n現在のHP・参加人数・討伐状況の接続はありません。'},
 {name:'ランキング',icon:'<path d="M4 21V11h5v10M10 21V4h5v17M16 21v-7h5v7"/>',category:'RECORDS',copy:'誰かの一歩が、次の道になる。',detail:'ランキングは未接続です。\n現在はプレイヤーの記録を収集していません。\n順位やほかのプレイヤーの数値は表示しません。'},
];
const nav=element('nav-items');
features.forEach((item)=>{
 const button=document.createElement('button');button.className='nav-button';button.type='button';button.innerHTML=icon(item.icon)+`<span>${item.name}</span>`;
 button.addEventListener('click',()=>openFeature(item.name,item.category,item.copy,item.detail));nav.append(button);
});
function openFeature(name:string,category:string,copy:string,detail:string){element('feature-title').textContent=name;element('feature-category').textContent=category;element('feature-copy').textContent=copy;element('feature-detail').textContent=detail;feature.showModal();}
element('start-button').addEventListener('click',()=>openFeature('最初の出撃：知床','MISSION IN DEVELOPMENT','ここから、奪還の旅が始まる。','出撃導線のプレビューです。\n知床の移動・射撃・戦闘はまだ実装していません。\nホームから作戦へ進む構成で制作していきます。'));
element('settings-button').addEventListener('click',()=>settings.showModal());
const quality=element<HTMLSelectElement>('quality-select'),motion=element<HTMLInputElement>('motion-toggle');quality.value=prefs.quality;motion.checked=prefs.reducedMotion;
function savePrefs(){world?.preferences(prefs);try{localStorage.setItem('reclaim.display.v1',JSON.stringify(prefs));}catch{/* Storage is optional; browsing in private mode still works. */}}
quality.addEventListener('change',()=>{prefs.quality=quality.value==='low'?'low':'balanced';savePrefs();});
motion.addEventListener('change',()=>{prefs.reducedMotion=motion.checked;savePrefs();});
const off=icon('<path d="M4 9h4l5-4v14l-5-4H4zM17 9l5 6M22 9l-5 6"/>');
const on=icon('<path d="M4 9h4l5-4v14l-5-4H4zM17 8a6 6 0 010 8M20 5a10 10 0 010 14"/>');
element('sound-icon').innerHTML=off;
soundButton.addEventListener('click',async()=>{const enabled=await atmosphere.setEnabled(!atmosphere.enabled);soundButton.setAttribute('aria-pressed',String(enabled));soundButton.setAttribute('aria-label',enabled?'環境音をオフにする':'環境音をオンにする');element('sound-icon').innerHTML=enabled?on:off;announce(enabled?'環境音をオンにしました。':'環境音はオフです。');});
function resize(){world?.resize();}
function pointer(event:PointerEvent){if(world){world.pointer.x=(event.clientX/innerWidth-.5)*2;world.pointer.y=(event.clientY/innerHeight-.5)*2;}}
function visibility(){cancelAnimationFrame(frameId);if(document.hidden){state.revealStarted=null;document.body.dataset.reveal='false';wasVisible=false;}else{lastFrame=0;frameId=requestAnimationFrame(frame);}void atmosphere.visibility(document.hidden);}
addEventListener('resize',resize);addEventListener('pointermove',pointer,{passive:true});document.addEventListener('visibilitychange',visibility);
function dispose(){if(disposed)return;disposed=true;cancelAnimationFrame(frameId);world?.dispose();atmosphere.dispose();removeEventListener('resize',resize);removeEventListener('pointermove',pointer);document.removeEventListener('visibilitychange',visibility);}
// Preserve the page when it goes into the browser back/forward cache.
addEventListener('pagehide',(event:PageTransitionEvent)=>{if(!event.persisted)dispose();});
// Read-only diagnostics for automated checks. No state mutation or network entry point.
Object.defineProperty(window,'__RECLAIM__',{value:Object.freeze({snapshot:()=>({screen:state.screen,squadPreview:state.squadPreview,revealing:state.bossOpacity(performance.now(),prefs.reducedMotion)>0,reducedMotion:prefs.reducedMotion,renderer:document.body.dataset.renderer,render:world?.stats()??null})}),writable:false});
document.body.dataset.ready='true';
