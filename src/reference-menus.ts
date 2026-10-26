import './reference-menus.css';
import './mobile-reference-menus.css';
import { TitleAtmosphere } from './title-atmosphere';
import './title-screen.css';
import { HomeLobby } from './home-lobby';
import { REFERENCE_QUERY, referencePercent, type ReferenceRect } from './reference-layout';
import type { ScreenState, Preferences } from './state';
import type { Home } from './home';
import type { CampaignStore } from './campaign/index';

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id)! as T;
/** Only presentation and native menu input. Never awards progress or updates a mission. */
export class ReferenceMenus {
  readonly media = matchMedia(REFERENCE_QUERY);
  readonly coarse = matchMedia('(any-pointer: coarse)');
  readonly fine = matchMedia('(any-pointer: fine)');
  readonly images: HTMLImageElement[] = [];
  readonly atmosphere: TitleAtmosphere;
  readonly lobby: HomeLobby;
  readonly observer: MutationObserver;
  readonly changed = () => this.refresh();
  readonly keydown = (event: KeyboardEvent) => {
    if (!this.active || event.defaultPrevented || document.querySelector('dialog[open]')) return;
    if (this.state.screen === 'home') {
      if (event.key === 'Escape' && el('menu-toggle').getAttribute('aria-expanded') === 'true') return;
      if (event.key === 'Escape' && !this.home.panel) { event.preventDefault(); this.go('title'); }
      return;
    }
    if (this.state.screen !== 'title') return;
    const buttons = ['home-button','continue-button','title-settings','reference-extras']
      .map(id => el<HTMLButtonElement>(id)).filter(button => !button.disabled);
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next = index < 0 ? (event.key === 'ArrowDown' ? 0 : buttons.length-1)
        : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next].focus();
    } else if (event.key === 'Enter' && index < 0 && document.activeElement === document.body) {
      event.preventDefault(); buttons[0].click();
    }
  };
  constructor(readonly state: ScreenState, readonly home: Home, readonly campaign: CampaignStore,
    readonly preferences: () => Preferences, readonly soundEnabled: () => boolean,
    readonly go: (screen: 'title'|'home') => void, readonly announce: (text: string) => void) {
    this.atmosphere = new TitleAtmosphere(el('title-screen'));
    this.lobby = new HomeLobby(home,campaign,preferences,announce);
    home.onPresentationChange=this.changed;
    const add = (host: HTMLElement, id: string, name: string, rect: ReferenceRect, action: () => void, reference = true) => {
      const button = document.createElement('button'); button.id = id; button.type = 'button';
      button.className = 'reference-only'; button.textContent = name; button.setAttribute('aria-label',name);
      button.addEventListener('click',action); host.append(button);
      if (reference) this.place(button,rect); else button.className = 'title-menu-button';
      return button;
    };
    const continuation = add(el('title-menu'),'continue-button','CONTINUE',
      'titleContinue',() => { this.go('home'); this.home.open('briefing',el('start-button')); },false);
    continuation.setAttribute('aria-label','CONTINUE — 保存位置の出撃確認');
    continuation.disabled = true;
    el('title-settings').addEventListener('click',() => el('settings-button').click());
    el('title-menu').append(el('title-settings'));
    add(el('title-footer-info'),'reference-extras','INFORMATION','titleExtras',() => this.notice(false),false);
    const missionNotice=document.createElement('p'); missionNotice.id='mobile-mission-notice';
    missionNotice.className='mobile-only'; missionNotice.setAttribute('role','status');
    missionNotice.textContent='本編の徒歩・射撃はPCのキーボードとマウスが必要です。このスマホ版は出撃前確認まで操作できます。';
    el('home-panel').insertBefore(missionNotice,el('panel-footer'));
    const settingsSound=document.createElement('button'); settingsSound.id='mobile-settings-sound';
    settingsSound.type='button'; settingsSound.className='mobile-only';
    settingsSound.addEventListener('click',() => el('sound-button').click());
    el('settings-dialog').querySelector('form')!.append(settingsSound);
    add(document.querySelector('.utility')!,'reference-motion','背景の動きを切り替える','titleMotion',() => {
      const motion = el<HTMLInputElement>('motion-toggle'); motion.checked = !motion.checked;
      motion.dispatchEvent(new Event('change',{bubbles:true})); this.refresh();
    });
    el('reference-mail').addEventListener('click',()=>this.notice(true));
    el('reference-dialog').addEventListener('close',() => this.refresh());
    this.observer = new MutationObserver(this.changed);
    this.observer.observe(el('local-save-status'),{subtree:true,childList:true,characterData:true});
    for (const media of [this.media,this.coarse,this.fine]) media.addEventListener('change',this.changed);
    this.atmosphere.motionMedia.addEventListener('change',this.changed);
    document.addEventListener('keydown',this.keydown);
    this.refresh();
  }
  // These menu components own their presentation; the game renderer stays idle.
  get active() { return true; }
  // A tablet must not inherit scaled-down PC hit rectangles merely because it is wide.
  // Fine-pointer/hybrid PCs keep the original query and pixel-exact PC presentation.
  get mobile() { return !this.media.matches || this.touchOnly; }
  get touchOnly() { return this.coarse.matches && !this.fine.matches; }
  place(node: HTMLElement, id: ReferenceRect) {
    node.classList.add('reference-hit');
    const box = referencePercent(id);
    for (const [key,value] of Object.entries(box)) node.style.setProperty(`--ref-${key}`,`${value}%`);
  }
  refresh() {
    const active = this.active && this.state.screen !== 'mission', title = this.state.screen === 'title';
    document.body.dataset.menuPresentation = active ? (title?'atmospheric-title-2d':'home-3d-lobby') : 'mission-webgl';
    this.atmosphere.setActive(active && title);
    this.atmosphere.setReducedMotion(this.preferences().reducedMotion);
    this.lobby.refresh(active&&!title);
    document.body.dataset.touchOnly=String(this.touchOnly);
    document.body.dataset.referenceSquad = String(this.state.squadPreview);
    document.body.dataset.referenceName = this.home.current.appearance.name === 'SURVIVOR' ? 'default' : 'custom';
    document.body.dataset.referenceWeapon = this.home.current[this.home.current.held] === 'assault' ? 'default' : 'custom';
    document.body.dataset.referenceSave = el('local-save-status').textContent?.includes('保存できません') ? 'error' : 'normal';
    const motionReduced = this.atmosphere.snapshot().reducedMotion;
    document.body.dataset.referenceMotion = motionReduced ? 'off' : 'on';
    document.body.dataset.referenceSound = this.soundEnabled() ? 'on' : 'off';
    el<HTMLButtonElement>('title-button').tabIndex = active ? -1 : 0;
    el('title-button').setAttribute('aria-label','RECLAIM');
    el('home-button').setAttribute('aria-label',active ? 'START — HOMEへ進む' : 'HOME');
    for (const id of ['sound-button','settings-button','reference-motion']) el(id).classList.remove('reference-hit');
    el('sound-button').setAttribute('data-label',this.soundEnabled() ? 'SOUND ON' : 'SOUND OFF');
    el('reference-motion').setAttribute('data-label',motionReduced ? 'Ⅱ  MOTION OFF' : 'Ⅱ  MOTION ON');
    el('reference-motion').setAttribute('aria-pressed',String(!motionReduced));
    const soundLabel=this.soundEnabled()?'環境音 ON — タップでOFF':'環境音 OFF — タップでON';
    if(el('mobile-settings-sound').textContent!==soundLabel)el('mobile-settings-sound').textContent=soundLabel;
    el('mobile-settings-sound').setAttribute('aria-pressed',String(this.soundEnabled()));
    el('mobile-mission-notice').hidden=this.home.panel!=='briefing'||!this.touchOnly;
    const continuation = el<HTMLButtonElement>('continue-button');
    continuation.disabled = !this.campaign.value.checkpoint;
    continuation.dataset.available = String(!continuation.disabled);
    el('back-title').setAttribute('aria-label','タイトルへ戻る');
    if (active && !title && this.state.screen === 'home') {
      for (const [index,label] of this.home.labels.slice(1).entries()) label.dataset.referenceIndex = String(index);
    }
  }
  notice(mail: boolean) {
    el('reference-dialog-title').textContent = mail ? '通信のお知らせ' : 'RECLAIM / MENU PREVIEW';
    el('reference-dialog-text').textContent = mail
      ? '受信メッセージはありません。実ネットワーク通信・オンライン機能は未接続です。'
      : 'RECLAIM — 奪われた世界を、取り戻せ。AIの反逆で失われた日本を舞台にしたサバイバルゲームの開発版です。進行と設定はこの端末に保存されます。本編の探索・射撃にはPCのキーボードとマウスが必要です。';
    el<HTMLDialogElement>('reference-dialog').showModal();
  }
  snapshot() { return { mode:this.state.screen==='mission'?'mission-webgl':this.state.screen==='title'?'atmospheric-title-2d':'home-3d-lobby',width:innerWidth,height:innerHeight,
    images:this.images.map(image => ({loaded:image.complete&&image.naturalWidth===1536,naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight})),
    fixedIllustration:false,atmosphere:this.atmosphere.snapshot(),formationSamples:this.home.partySize-1 }; }
  dispose() {
    this.home.onPresentationChange=()=>{};
    this.lobby.dispose();
    this.atmosphere.dispose();
    this.atmosphere.motionMedia.removeEventListener('change',this.changed);
    this.observer.disconnect();
    for (const media of [this.media,this.coarse,this.fine]) media.removeEventListener('change',this.changed);
    document.removeEventListener('keydown',this.keydown);
  }
}
