import './home-cinematic.css';
import shiretoko from './home-art/shiretoko.avif?inline';
import ishikari from './home-art/ishikari.avif?inline';
import hidaka from './home-art/hidaka.avif?inline';
import survivor from './home-art/survivor.avif?inline';
import { visibleAreas, type CampaignStore, type AreaId } from './campaign/index';
import { homeArtId, normalizeHomeView, selectHomeArea, type HomeViewMode } from './home-presentation';
import { gunName, type HomePreview } from './home-state';

const images = { shiretoko, 'ishikari-mountains': ishikari, 'hidaka-mountains': hidaka };
const codes: Record<AreaId, string> = { shiretoko: 'SHIRETOKO', 'ishikari-mountains': 'ISHIKARI', 'hidaka-mountains': 'HIDAKA', sapporo: 'SAPPORO' };
const byId = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id)! as T;
const clothMask = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 894"><path fill="white" d="M128 149Q205 108 238 156L263 179 277 237 274 296 287 351 239 408 145 407 123 363 130 292 197 215 171 192Z M100 421L244 419 278 458 265 593 243 634 249 710 242 760 179 761 169 699 183 604 189 548 181 525 143 643 108 694 83 758 20 757 10 731 43 654 79 582 87 497Z"/></svg>')}`;

/** Pre-rendered character layers + real DOM controls. Does not claim to be a rigged model. */
export class CinematicHome {
  area: AreaId = 'shiretoko';
  mode: HomeViewMode = 'cinematic';
  private readonly observer: MutationObserver;
  private readonly abort = new AbortController();
  private signature = '';
  private source = '';
  private destroyed = false;
  private imageFailed = false;
  private actorFailed = false;
  private pendingFrame = 0;
  private lastPreview: HomePreview | null = null;
  private readonly root: HTMLElement;
  private readonly actors: HTMLElement[];
  constructor(readonly campaign: CampaignStore, readonly canRenderModel: () => boolean, readonly relayout: () => void) {
    this.root = byId('home-screen');
    const scenery = document.createElement('div');
    scenery.id = 'home-scenery'; scenery.setAttribute('aria-hidden','true');
    scenery.innerHTML = '<img id="home-background-image" alt="" decoding="async"><div class="home-photo-shade"></div><div class="home-mist"></div><div class="home-warmth"></div>';
    this.root.prepend(scenery);
    const cast = document.createElement('div');
    cast.id = 'home-cast'; cast.setAttribute('aria-hidden','true');
    cast.innerHTML = [0,1,2,3].map(i => `<div class="home-actor home-actor-${i}" data-actor="${i}" ${i?'hidden':''}><div class="actor-shadow"></div><div class="actor-art"><img class="actor-base" alt="" decoding="async"><img class="actor-cloth" alt="" decoding="async"></div><div class="actor-label"><span>${i?`見本 / 0${i+1}`:'YOU / 01'}</span>${i?'':'<strong id="cinematic-name"></strong><small id="cinematic-gear"></small>'}</div></div>`).join('');
    this.root.append(cast);
    this.actors = Array.from(cast.querySelectorAll<HTMLElement>('.home-actor'));
    cast.querySelectorAll<HTMLImageElement>('img').forEach(img => { img.src = survivor; });
    cast.style.setProperty('--cloth-mask', `url("${clothMask}")`);
    this.actors[0].querySelector('img')!.addEventListener('error', () => { this.actorFailed = true; this.root.dataset.actorError = 'true'; }, {signal:this.abort.signal});
    const plate = document.createElement('div');
    plate.id = 'home-place-sign'; plate.setAttribute('aria-hidden','true');
    plate.innerHTML = '<strong id="home-place-name"></strong><span id="home-place-code"></span><small>まだ、終わっていない。</small>';
    this.root.append(plate);
    const destination = byId('home-screen').querySelector<HTMLElement>('.launch-area > div')!;
    destination.classList.add('home-destination-card');
    destination.innerHTML = '<img id="home-destination-image" alt="" decoding="async"><div><label for="home-area-select" class="overline">NEXT DESTINATION</label><select id="home-area-select" aria-label="HOMEの地域・出撃先を選択"></select><small id="home-area-caption"></small></div>';
    const footnote = this.root.querySelector<HTMLElement>('.home-footnote')!;
    const weaponArt = document.createElement('div'); weaponArt.id='home-weapon-art'; weaponArt.setAttribute('aria-hidden','true');
    weaponArt.innerHTML = '<svg viewBox="0 0 260 86"><g id="rack-gun" fill="#667269" stroke="#b4bca3" stroke-width="1.2"><path d="M13 30L46 24 57 27 101 21 155 22 162 29 183 29 185 35 159 38 129 37 119 53 100 50 108 36 60 38 52 47 42 44 47 34 17 46Z"/><rect x="145" y="29" width="84" height="5"/><rect x="66" y="17" width="69" height="5"/><path d="M78 16V11H113V16"/><rect x="229" y="27" width="14" height="8"/></g><g fill="none" stroke="#c3c9b8" stroke-width="3"><path d="M59 71Q150 72 240 59Q211 74 59 76Z"/><path d="M12 73H54" stroke="#747a66" stroke-width="7"/><path d="M53 64V80" stroke-width="4"/></g></svg>';
    footnote.prepend(weaponArt);
    const mode = document.createElement('button'); mode.id='home-render-mode'; mode.type='button'; mode.className='home-mode-button';
    mode.textContent='立体装備プレビュー'; mode.setAttribute('aria-pressed','false');
    mode.addEventListener('click', () => this.setMode(this.mode==='cinematic'?'model':'cinematic'), {signal:this.abort.signal});
    footnote.append(mode);
    const artNote = document.createElement('small'); artNote.id='home-art-note'; artNote.textContent='キャラは2Dビジュアル / 装備形状は立体表示で確認'; footnote.append(artNote);
    const version=document.createElement('p');version.id='home-edition';version.textContent='RECLAIM   /   SURVIVE. EXPLORE. REBUILD.';this.root.append(version);
    byId<HTMLSelectElement>('home-area-select').addEventListener('change', e => this.choose((e.target as HTMLSelectElement).value), {signal:this.abort.signal});
    byId<HTMLImageElement>('home-background-image').addEventListener('error',()=>{this.imageFailed=true;this.root.dataset.imageError='true';}, {signal:this.abort.signal});
    this.observer = new MutationObserver(() => this.activity());
    this.observer.observe(document.body,{attributes:true,attributeFilter:['data-screen','data-panel-open']});
    document.addEventListener('visibilitychange',this.activity,{signal:this.abort.signal});
    byId('motion-toggle').addEventListener('change',this.activity,{signal:this.abort.signal});
    byId('quality-select').addEventListener('change',this.activity,{signal:this.abort.signal});
    this.refresh(); this.activity();
  }
  get render3D(): boolean { return this.mode==='model' && this.canRenderModel(); }
  setMode(value: string) {
    this.mode=normalizeHomeView(value,this.canRenderModel());
    document.body.dataset.homeView=this.mode;
    const button=byId<HTMLButtonElement>('home-render-mode');button.textContent=this.mode==='model'?'ビジュアル表示に戻る':'立体装備プレビュー';button.setAttribute('aria-pressed',String(this.mode==='model'));
    this.activity();this.relayout();
  }
  choose(requested: string) {
    this.area=selectHomeArea(this.campaign.value,this.area,requested);
    this.refresh();this.relayout();
  }
  refresh() {
    if(this.destroyed)return;
    this.area=selectHomeArea(this.campaign.value,this.area,this.area);
    const available=visibleAreas(this.campaign.value),signature=available.map(a=>a.id).join('|');
    const select=byId<HTMLSelectElement>('home-area-select');
    if(signature!==this.signature){
      this.signature=signature;select.replaceChildren(...available.map(a=>{const o=document.createElement('option');o.value=a.id;o.textContent=a.displayName;return o;}));
    }
    select.value=this.area;
    const current=available.find(a=>a.id===this.area)!;
    document.body.dataset.homeArea=this.area;
    byId('home-place-name').textContent=current.displayName;
    byId('home-place-code').textContent=codes[this.area];
    const art=homeArtId(this.area);
    const image=art?images[art]:'';
    byId('home-area-caption').textContent=current.status==='playable'?'北海道 / 導入エリア':'北海道 / 環境プロトタイプ';
    const header=document.querySelector<HTMLElement>('.home-wordmark span');if(header)header.textContent=`生存者の仮拠点 / ${current.displayName}`;
    const overline=this.root.querySelector<HTMLElement>('.home-location > .overline');if(overline)overline.textContent=`HOKKAIDO / ${codes[this.area]}`;
    const bg=byId<HTMLImageElement>('home-background-image'),thumb=byId<HTMLImageElement>('home-destination-image');
    if(this.source!==image){
      this.source=image;this.imageFailed=false;delete this.root.dataset.imageError;
      if(image){bg.src=image;thumb.src=image;}else{bg.removeAttribute('src');thumb.removeAttribute('src');}
    }
    bg.hidden=!image;thumb.hidden=!image;this.root.dataset.homeArt=art??'unavailable';
    byId('home-art-note').textContent=art?'キャラは2Dビジュアル / 装備形状は立体表示で確認':'この地域の背景は未制作 / 共通背景で表示';
    const button=byId<HTMLButtonElement>('home-render-mode');button.disabled=!this.canRenderModel();
    if(!this.canRenderModel()&&this.mode==='model'){this.mode='cinematic';document.body.dataset.homeView='cinematic';button.setAttribute('aria-pressed','false');button.textContent='立体装備プレビュー';}
  }
  sync(preview: HomePreview) {
    this.lastPreview=preview;
    byId('cinematic-name').textContent=preview.appearance.name;
    byId('cinematic-gear').textContent=`${gunName(preview[preview.held])} / 日本刀`;
    this.actors[0].dataset.outfit=preview.appearance.palette;
    ['slate','clay','olive'].forEach((p,i)=>this.actors[i+1].dataset.outfit=p);
    byId('home-weapon-art').dataset.weapon=preview[preview.held];
  }
  layout(squad: boolean, panelOpen: boolean) {
    this.refresh();this.root.dataset.squad=String(squad);this.root.dataset.focusOwn=String(panelOpen);
    this.actors.forEach((a,i)=>{a.hidden=i>0&&(!squad||panelOpen);});
    this.activity();
  }
  private activity = () => {
    if(this.destroyed)return;
    if(!document.body.dataset.homeView)document.body.dataset.homeView=this.mode;
    const visible=document.body.dataset.screen==='home'&&!document.hidden;
    const reduced=byId<HTMLInputElement>('motion-toggle').checked||matchMedia('(prefers-reduced-motion: reduce)').matches;
    const low=byId<HTMLSelectElement>('quality-select').value==='low';
    this.root.dataset.homeMotion=visible&&!reduced&&!low&&this.mode==='cinematic'?'running':'stopped';
    // No perpetual JS animation loop. CSS mist pauses when HOME is inactive.
  };
  snapshot() {
    const bg=byId<HTMLImageElement>('home-background-image');
    const actors=this.actors.filter(a=>!a.hidden).map(a=>{const r=a.querySelector('.actor-art')!.getBoundingClientRect();const label=a.querySelector('.actor-label')!.getBoundingClientRect();return{index:Number(a.dataset.actor),left:r.left,top:r.top,right:r.right,bottom:r.bottom,label:{left:label.left,top:label.top,right:label.right,bottom:label.bottom}};});
    return {mode:this.mode,area:this.area,art:homeArtId(this.area),backgroundDecoded:bg.complete&&bg.naturalWidth>0,backgroundError:this.imageFailed,actorError:this.actorFailed,actors,rendered3D:this.render3D,characterRepresentation:'pre-rendered-2d',palette:this.lastPreview?.appearance.palette,motion:this.root.dataset.homeMotion};
  }
  dispose(){if(this.destroyed)return;this.destroyed=true;this.observer.disconnect();this.abort.abort();cancelAnimationFrame(this.pendingFrame);this.root.dataset.homeMotion='stopped';}
}
