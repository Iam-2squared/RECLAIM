import './reference-menus.css';
import titleArt from './ui-reference/title.jpeg?inline';
import homeArt from './ui-reference/home.jpeg?inline';
import { REFERENCE_QUERY, referencePercent, type ReferenceRect } from './reference-layout';
import type { ScreenState, Preferences } from './state';
import type { Home } from './home';
import type { CampaignStore } from './campaign/index';

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id)! as T;
/** Only presentation and native menu input. Never awards progress or updates a mission. */
export class ReferenceMenus {
  readonly media = matchMedia(REFERENCE_QUERY);
  readonly images: HTMLImageElement[] = [];
  readonly observer: MutationObserver;
  readonly changed = () => this.refresh();
  readonly keydown = (event: KeyboardEvent) => {
    if (!this.active || event.defaultPrevented || document.querySelector('dialog[open]')) return;
    if (this.state.screen === 'home') {
      if (event.key === 'Escape' && !this.home.panel) { event.preventDefault(); this.go('title'); }
      return;
    }
    if (this.state.screen !== 'title') return;
    const buttons = ['home-button','continue-button','settings-button','reference-extras']
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
    for (const [id,source] of [['title-screen',titleArt],['home-screen',homeArt]]) {
      const image = new Image(); image.className = 'reference-backplate'; image.src = source;
      image.alt = ''; image.draggable = false; image.setAttribute('aria-hidden','true');
      el(id).prepend(image); this.images.push(image);
    }
    const add = (host: HTMLElement, id: string, name: string, rect: ReferenceRect, action: () => void) => {
      const button = document.createElement('button'); button.id = id; button.type = 'button';
      button.className = 'reference-only'; button.textContent = name; button.setAttribute('aria-label',name);
      button.addEventListener('click',action); host.append(button); this.place(button,rect); return button;
    };
    this.place(el('title-button'),'titleLogo'); this.place(el('home-button'),'titleStart');
    const continuation = add(el('title-screen'),'continue-button','CONTINUE — 保存位置の出撃確認',
      'titleContinue',() => { this.go('home'); this.home.open('briefing',el('start-button')); });
    continuation.disabled = true;
    add(el('title-screen'),'reference-extras','EXTRAS — このプレビューについて','titleExtras',() => this.notice(false));
    add(document.querySelector('.utility')!,'reference-motion','背景の動きを切り替える','titleMotion',() => {
      const motion = el<HTMLInputElement>('motion-toggle'); motion.checked = !motion.checked;
      motion.dispatchEvent(new Event('change',{bubbles:true})); this.refresh();
    });
    add(el('home-screen'),'reference-mail','通信のお知らせ','homeMail',() => this.notice(true));
    add(el('home-screen'),'reference-equipment','装備を確認する','homeEquipment',() => this.home.open('weapons',el('reference-equipment')));
    add(el('home-screen'),'reference-destination','知床のマップを確認する','homeDestination',() => this.home.open('map',el('reference-destination')));
    this.place(el('back-title'),'homeBack'); this.place(el('solo-button'),'homeSolo');
    this.place(el('squad-button'),'homeSquad'); this.place(el('start-button'),'homeStart');
    const nav: ReferenceRect[] = ['homeMap','homeCharacter','homeWeapons','homeBoss','homeRanking'];
    document.querySelectorAll<HTMLElement>('#nav-items button').forEach((button,i) => this.place(button,nav[i]));
    el('reference-dialog').addEventListener('close',() => this.refresh());
    this.observer = new MutationObserver(this.changed);
    this.observer.observe(el('home-screen'),{subtree:true,childList:true,characterData:true});
    this.media.addEventListener('change',this.changed); document.addEventListener('keydown',this.keydown);
    this.refresh();
  }
  get active() { return this.media.matches; }
  place(node: HTMLElement, id: ReferenceRect) {
    node.classList.add('reference-hit');
    const box = referencePercent(id);
    for (const [key,value] of Object.entries(box)) node.style.setProperty(`--ref-${key}`,`${value}%`);
  }
  refresh() {
    const active = this.active && this.state.screen !== 'mission', title = this.state.screen === 'title';
    document.body.dataset.menuPresentation = active ? 'reference-2d' : 'legacy-3d';
    document.body.dataset.referenceSquad = String(this.state.squadPreview);
    document.body.dataset.referenceName = this.home.current.appearance.name === 'SURVIVOR' ? 'default' : 'custom';
    document.body.dataset.referenceWeapon = this.home.current[this.home.current.held] === 'assault' ? 'default' : 'custom';
    document.body.dataset.referenceSave = el('local-save-status').textContent?.includes('保存できません') ? 'error' : 'normal';
    document.body.dataset.referenceMotion = this.preferences().reducedMotion ? 'off' : 'on';
    document.body.dataset.referenceSound = this.soundEnabled() ? 'on' : 'off';
    el<HTMLButtonElement>('title-button').tabIndex = active ? -1 : 0;
    el('title-button').setAttribute('aria-label',active ? 'RECLAIM タイトルイラスト' : 'RECLAIM — 東京の大ボスの影を見る');
    el('home-button').setAttribute('aria-label',active ? 'START — HOMEへ進む' : 'HOME');
    this.place(el('sound-button'),'titleSound'); this.place(el('settings-button'),title?'titleSettings':'homeSettings');
    el('sound-button').setAttribute('data-label',this.soundEnabled() ? 'SOUND ON' : 'SOUND OFF');
    el('reference-motion').setAttribute('data-label',this.preferences().reducedMotion ? 'Ⅱ  MOTION OFF' : 'Ⅱ  MOTION ON');
    el('reference-motion').setAttribute('aria-pressed',String(!this.preferences().reducedMotion));
    const continuation = el<HTMLButtonElement>('continue-button');
    continuation.disabled = !this.campaign.value.checkpoint;
    continuation.dataset.available = String(!continuation.disabled);
    el('back-title').setAttribute('aria-label','タイトルへ戻る');
    if (active && !title && this.state.screen === 'home') {
      for (const [index,label] of this.home.labels.slice(1).entries()) label.dataset.referenceIndex = String(index);
    }
  }
  notice(mail: boolean) {
    el('reference-dialog-title').textContent = mail ? '通信のお知らせ' : 'RECLAIM / PC PREVIEW';
    el('reference-dialog-text').textContent = mail
      ? '受信メッセージはありません。実ネットワーク通信・オンライン機能は未接続です。'
      : 'PC向けのタイトル・HOMEです。添付の2枚を固定イラストとして使用しています。キャラ設定と装備の選択値はこの端末に保存します。背景の人物・銃の絵自体は差し替わりません。';
    el<HTMLDialogElement>('reference-dialog').showModal();
  }
  snapshot() { return { mode:this.state.screen==='mission'?'mission-webgl':this.active?'reference-2d':'legacy-3d',width:1536,height:864,
    images:this.images.map(image => ({loaded:image.complete&&image.naturalWidth===1536,naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight})),
    fixedIllustration:true,formationSamples:this.state.squadPreview?3:0 }; }
  dispose() { this.observer.disconnect();this.media.removeEventListener('change',this.changed);document.removeEventListener('keydown',this.keydown); }
}
