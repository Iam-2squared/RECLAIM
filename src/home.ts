import './home.css';
import { HOME_KEY, MAX_NAME, PALETTES, GUNS, MELEE, RARITIES, ROUTE, defaults, parseHome, normalizeName, chooseGun, gunName, type Appearance, type HomePreview, type GunId, type PaletteId } from './home-state';
import { WEAPON_PREVIEWS } from './weapon-assets';
import { mountAuthoredMap } from './authored-map';
import type { ScreenState } from './state';
import { CampaignStore, visibleRoute, visibleAreas, type MissionCheckpoint } from './campaign/index';
import type { AreaId } from './world/index';

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id)! as T;
const svg = (paths: string) => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
const features = [
  ['map', 'マップ', 'CAMPAIGN / JAPAN', '<path d="M3 5l6-2 6 2 6-2v16l-6 2-6-2-6 2zM9 3v16M15 5v16"/>'],
  ['character', 'キャラ設定', 'YOUR SURVIVOR', '<circle cx="12" cy="7" r="3"/><path d="M5 21v-5a7 7 0 0114 0v5"/>'],
  ['weapons', '武器', 'FIELD EQUIPMENT', '<path d="M3 9h15l3 3-3 3H9l-2 5H4l2-7H3zM12 9V6h4v3"/>'],
  ['boss', '今のボス状況', 'WORLD RAID', '<path d="M5 7l7-4 7 4v10l-7 4-7-4zM8 10h2M14 10h2M9 16l3-3 3 3"/>'],
  ['ranking', 'ランキング', 'FIELD RECORDS', '<path d="M4 21V11h5v10M10 21V4h5v17M16 21v-7h5v7"/>'],
] as const;
type Panel = typeof features[number][0] | 'briefing';

export class Home {
  saved: HomePreview;
  draft: Appearance | null = null;
  panel: Panel | null = null;
  opener: HTMLElement | null = null;
  modal = false;
  layoutTask = 0;
  partySize: 1|2|3|4 = 1;
  onPresentationChange: () => void = () => {};
  readonly compact = matchMedia('(max-width: 959px), (max-height: 440px)');
  readonly coarse = matchMedia('(any-pointer: coarse)');
  readonly fine = matchMedia('(any-pointer: fine)');
  readonly stageObserver = new ResizeObserver(() => this.layout());
  readonly compactChanged = () => this.layout();
  readonly blocked = new Map<HTMLElement, { aria: string | null; inert: boolean; tabs: [HTMLElement, string | null][] }>();
  readonly labels = Array.from(document.querySelectorAll<HTMLElement>('.survivor-label'));
  constructor(readonly state: ScreenState, public world: {readonly lost:boolean} | null, readonly announce: (s: string) => void, readonly invalidateRender: () => void, readonly campaign: CampaignStore, readonly startMission:(area:AreaId,resume?:MissionCheckpoint|null)=>void, readonly prepareMission:()=>void=()=>{}) {
    try { this.saved = parseHome(localStorage.getItem(HOME_KEY)); } catch { this.saved = defaults(); }
    el('nav-items').innerHTML = features.map(([id, name, , icon], i) => `<button type="button" class="nav-button" data-panel="${id}" aria-controls="home-panel" aria-expanded="false">${svg(icon)}<span>${name}</span><small aria-hidden="true">0${i + 1}</small></button>`).join('');
    el('nav-items').querySelectorAll<HTMLButtonElement>('button').forEach(b => b.addEventListener('click', () => this.open(b.dataset.panel as Panel, b)));
    el('menu-toggle').addEventListener('click', () => this.drawer(el('menu-toggle').getAttribute('aria-expanded') !== 'true'));
    el('menu-dismiss').addEventListener('click', () => { this.drawer(false); el('menu-toggle').focus(); });
    el('panel-close').addEventListener('click', () => this.close());
    el('start-button').addEventListener('click', () => this.open('briefing', el('start-button')));
    el('solo-button').addEventListener('click', () => this.squad(false));
    el('squad-button').addEventListener('click', () => this.squad(true));
    document.addEventListener('keydown', e => {
      if (e.key === 'Tab' && this.panel && this.modal && !document.querySelector('dialog[open]')) {
        const controls = Array.from(el('home-panel').querySelectorAll<HTMLElement>('button:not(:disabled), input, select, summary, [tabindex]')).filter(n => n.tabIndex >= 0 && n.getClientRects().length);
        const first = controls[0], last = controls.at(-1);
        if (document.activeElement === el('panel-title') || (e.shiftKey && document.activeElement === first) || (!e.shiftKey && document.activeElement === last)) {
          e.preventDefault(); (e.shiftKey ? last : first)?.focus();
        }
      }
      if (e.key !== 'Escape' || document.querySelector('dialog[open]')) return;
      if (this.panel) { e.preventDefault(); this.close(); }
      else if (el('menu-toggle').getAttribute('aria-expanded') === 'true') { e.preventDefault(); this.drawer(false); el('menu-toggle').focus(); }
    });
    // Observe the reserved stage, rather than measuring the DOM on every render frame.
    this.stageObserver.observe(el('lobby-stage'));
    this.labels.forEach(label => this.stageObserver.observe(label));
    for (const media of [this.compact,this.coarse,this.fine]) media.addEventListener('change', this.compactChanged);
    document.addEventListener('focusin', e => {
      if (this.modal && this.panel && !document.querySelector('dialog[open]') && !el('home-panel').contains(e.target as Node)) el('panel-title').focus({ preventScroll: true });
    });
    this.sync();
  }
  drawer(open: boolean) { el('home-nav').classList.toggle('is-open', open); el('menu-toggle').setAttribute('aria-expanded', String(open)); }
  squad(value: boolean) {
    this.setPartySize(value?4:1);
  }
  setPartySize(count:1|2|3|4) {
    this.partySize=count;
    this.state.squadPreview = count>1;
    el('solo-button').setAttribute('aria-pressed', String(count===1)); el('squad-button').setAttribute('aria-pressed', String(count>1));
    this.formationNote();
    this.labels.forEach((label,index) => { label.hidden = index>=count; });
    if (this.panel === 'briefing') this.briefing();
    this.layout();this.onPresentationChange();
    this.announce(count>1?`${count}人編成のローカルプレビュー。オンラインには接続していません。`:'ソロ配置に戻しました。');
  }
  get current(): HomePreview { return { ...this.saved, appearance: this.draft ?? this.saved.appearance }; }
  get compactMode() { return this.compact.matches || (this.coarse.matches && !this.fine.matches); }
  sync() {
    const v = this.current;
    el('survivor-name').textContent = v.appearance.name;
    el('held-weapon').textContent = `${gunName(v[v.held])} / ${MELEE.name}`;
    document.body.dataset.heldWeapon = v[v.held]; document.body.dataset.palette = v.appearance.palette;
    this.onPresentationChange();
  }
  formationNote() {
    el('squad-note').textContent=this.partySize>1?`${this.partySize}人のローカル編成プレビュー`:'ソロ / この端末のプレビュー';
  }
  panelMode() {
    const modal = Boolean(this.panel && this.compactMode);
    if (modal === this.modal) return;
    this.modal = modal;
    el('home-panel').setAttribute('aria-modal', String(modal));
    el('panel-backdrop').hidden = !modal;
    if (modal) {
      const roots = [document.querySelector<HTMLElement>('.topbar')!, ...Array.from(el('home-screen').children).filter(n => n.id !== 'home-panel' && n.id !== 'panel-backdrop') as HTMLElement[]];
      for (const root of roots) {
        const tabs = Array.from(root.querySelectorAll<HTMLElement>('button, input, select, [tabindex]')).map(n => [n, n.getAttribute('tabindex')] as [HTMLElement, string | null]);
        if (root.matches('button, input, select, [tabindex]')) tabs.push([root, root.getAttribute('tabindex')]);
        this.blocked.set(root, { aria: root.getAttribute('aria-hidden'), inert: root.inert, tabs });
        root.inert = true; root.setAttribute('aria-hidden', 'true'); root.classList.add('panel-background');
        // Safari 15.4 predates native inert. Preserve/restore tab order as a fallback.
        tabs.forEach(([n]) => n.setAttribute('tabindex', '-1'));
      }
    } else {
      for (const [root, prior] of this.blocked) {
        root.inert = prior.inert; root.classList.remove('panel-background');
        if (prior.aria === null) root.removeAttribute('aria-hidden'); else root.setAttribute('aria-hidden', prior.aria);
        prior.tabs.forEach(([n, tab]) => { if (tab === null) n.removeAttribute('tabindex'); else n.setAttribute('tabindex', tab); });
      }
      this.blocked.clear();
    }
  }
  layout() {
    if (this.state.screen !== 'home') return;
    const view = window.visualViewport;
    document.body.style.setProperty('--home-height', `${view?.height ?? innerHeight}px`);
    document.body.style.setProperty('--home-offset-top', `${view?.offsetTop ?? 0}px`);
    this.panelMode(); this.formationNote();
    if (this.layoutTask) clearTimeout(this.layoutTask);
    // UI layout must settle even when the compositor delays animation frames.
    this.layoutTask = window.setTimeout(() => {
      this.layoutTask = 0;
      if(this.state.screen!=='home')return;
      // Progress controls change the fixed footer's height. Fit the complete map
      // and its two captions into the actual scroll viewport, not a stale vh guess.
      const paper=el('panel-content').querySelector<HTMLElement>('.paper-map');
      if(paper){
        const body=el('panel-content'),bs=getComputedStyle(body),ps=getComputedStyle(paper);
        const captions=Array.from(paper.querySelectorAll<HTMLElement>('.map-caption')).reduce((n,c)=>n+c.getBoundingClientRect().height,0);
        const available=body.clientHeight-parseFloat(bs.paddingTop)-parseFloat(bs.paddingBottom)-parseFloat(ps.paddingTop)-parseFloat(ps.paddingBottom)-captions-2;
        document.body.style.setProperty('--home-map-svg-height',`${Math.max(100,available)}px`);
      }
      const rect = el('lobby-stage').getBoundingClientRect();
      const nameLimit = innerWidth >= 960 && innerWidth < 1200 && !this.panel ? 160 : 250;
      document.body.style.setProperty('--preview-label-width', `${Math.max(80, Math.min(nameLimit, rect.width - 16))}px`);
      this.labels.forEach((label,i) => { label.hidden = i>=this.partySize; });
      const obstacles = ['.home-footnote', '.launch-area', '.lobby-heading', '.squad-tools'].map(s => document.querySelector<HTMLElement>(s)!).filter(n => n.getClientRects().length).map(n => n.getBoundingClientRect());
      this.onPresentationChange();
      this.invalidateRender();
    },0);
  }
  screenChanged() {
    this.close(false); this.drawer(false);
    if (this.state.screen === 'home') { this.sync(); this.layout(); }
  }
  persist() {
    try { localStorage.setItem(HOME_KEY, JSON.stringify(this.saved)); el('local-save-status').textContent = 'この端末に保存済み'; }
    catch { el('local-save-status').textContent = '保存できませんでした。この画面では変更を維持します。'; }
  }
  open(id: Panel, opener: HTMLElement) {
    if(id==='briefing')this.prepareMission();
    this.draft = null; this.sync(); this.panel = id; this.opener = opener;
    this.drawer(false);
    const item = features.find(f => f[0] === id);
    el('panel-category').textContent = item?.[2] ?? 'MISSION / 01';
    el('panel-title').textContent = item?.[1] ?? '最初の出撃：知床';
    el('home-panel').hidden = false; document.body.dataset.panelOpen = 'true';
    el<HTMLButtonElement>('start-button').disabled = true;
    this.footer();
    el('nav-items').querySelectorAll<HTMLElement>('button').forEach(b => b.setAttribute('aria-expanded', String(b.dataset.panel === id)));
    if (id === 'character') this.character();
    else if (id === 'weapons') this.weapons();
    else if (id === 'map') this.map();
    else if (id === 'boss') this.boss();
    else if (id === 'ranking') this.ranking();
    else this.briefing();
    el('panel-content').scrollTop = 0; this.layout();this.onPresentationChange(); el('panel-title').focus({ preventScroll: true });
  }
  close(focus = true) {
    if (!this.panel) return;
    this.draft = null; this.panel = null; this.sync();
    el('home-panel').hidden = true; document.body.dataset.panelOpen = 'false';
    el<HTMLButtonElement>('start-button').disabled = false;
    this.panelMode();
    el('nav-items').querySelectorAll<HTMLElement>('button').forEach(b => b.setAttribute('aria-expanded', 'false'));
    this.layout();this.onPresentationChange();
    if (focus) {
      const opener = this.opener;
      (opener && opener.getClientRects().length ? opener : el('menu-toggle')).focus({ preventScroll: !this.compactMode });
    }
  }
  footer(html = '') { el('panel-footer').innerHTML = html; el('panel-footer').hidden = !html; }
  dispose() {
    clearTimeout(this.layoutTask); this.stageObserver.disconnect();
    for (const media of [this.compact,this.coarse,this.fine]) media.removeEventListener('change', this.compactChanged);
  }
  character() {
    this.draft = { ...this.saved.appearance };
    el('panel-content').innerHTML = `<p class="panel-intro">旅に出る、自分の姿を。表示名とロビーのアクセントを設定します。オペレーターはロビー左の選択欄で切り替えられます。</p>
      <label class="field-label" for="preview-name">表示名</label><input id="preview-name" class="name-input" maxlength="64" autocomplete="off" spellcheck="false" aria-describedby="name-help name-count"><div class="field-meta"><span id="name-help">16文字まで。空欄はSURVIVOR。</span><span id="name-count"></span></div>
      <p class="field-label">ロビーのアクセント</p><div class="palette-options">${PALETTES.map(p => `<button type="button" class="palette" data-palette="${p.id}" aria-pressed="${p.id === this.draft!.palette}"><span class="color-chip" style="--chip:${p.color}"></span>${p.name}</button>`).join('')}</div><p id="palette-note" class="muted"></p>
      <p class="muted">この端末だけの外観設定です。適用するまでプレビュー。閉じると変更を取り消します。</p>`;
    this.footer('<div class="panel-actions"><button id="apply-character" class="primary-action" type="button">適用</button><button id="cancel-character" class="secondary-action" type="button">キャンセル</button><button id="reset-character" class="text-action" type="button">初期状態に戻す</button></div>');
    const input = el<HTMLInputElement>('preview-name'); input.value = this.draft.name;
    const update = () => {
      this.draft!.name = normalizeName(input.value);
      el('name-count').textContent = `${Array.from(input.value).length} / ${MAX_NAME}`;
      el('name-help').textContent = Array.from(input.value).length > MAX_NAME ? '16文字を超えた分は適用時に省略します。' : '16文字まで。空欄はSURVIVOR。';
      el('palette-note').textContent = 'モデル本来の服や装備の質感は保ち、画面のアクセントを切り替えます。';
      this.sync();
    };
    // Do not rewrite the input while an IME composition is in progress.
    input.addEventListener('input', update);
    el('panel-content').querySelectorAll<HTMLButtonElement>('[data-palette]').forEach(button => button.addEventListener('click', () => {
      this.draft!.palette = button.dataset.palette as PaletteId;
      el('panel-content').querySelectorAll<HTMLElement>('[data-palette]').forEach(b => b.setAttribute('aria-pressed', String(b === button))); update();
    }));
    el('apply-character').addEventListener('click', () => { this.saved = { ...this.saved, appearance: { ...this.draft! } }; this.persist(); this.close(); this.announce('外観を適用しました。'); });
    el('cancel-character').addEventListener('click', () => this.close());
    el('reset-character').addEventListener('click', () => {
      this.draft = defaults().appearance; input.value = this.draft.name;
      el('panel-content').querySelectorAll<HTMLElement>('[data-palette]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.palette === this.draft!.palette))); update();
    }); update();
  }
  weapons() {
    const v = this.saved;
    el('panel-content').innerHTML = `<p class="panel-intro">主武器・副武器に銃を1つずつ、近接枠にサバイバルナイフ。装備設定はこの端末に保存します。</p>
      <div class="weapon-catalogue">${GUNS.map(g=>`<article class="weapon-asset-card" data-weapon-id="${g.id}" data-model-source="home-weapons/${g.id}.glb"><header><h3>${g.name}</h3><span>${g.code}</span></header><img src="${WEAPON_PREVIEWS[g.id]}" alt="${g.name}の新しい武器モデル" width="1200" height="600"><p>${g.description}</p><div class="weapon-card-actions">${(['primary','secondary'] as const).map(slot=>`<button type="button" data-slot="${slot}" data-gun="${g.id}" aria-pressed="${v[slot]===g.id}">${slot==='primary'?'主武器':'副武器'}${v[slot]===g.id?' ✓':''}</button>`).join('')}</div></article>`).join('')}<article class="weapon-asset-card weapon-melee-card" data-weapon-id="knife" data-model-source="home-weapons/knife.glb"><header><h3>${MELEE.name}</h3><span>${MELEE.code}</span></header><img src="${WEAPON_PREVIEWS.knife}" alt="サバイバルナイフの新しい武器モデル" width="947" height="600"><p>${MELEE.description}<strong>近接枠に装備</strong></p></article></div>
      <div class="weapon-loadout-summary"><span>主武器 <strong>${gunName(v.primary)}</strong></span><span>副武器 <strong>${gunName(v.secondary)}</strong></span><span>近接武器 <strong>${MELEE.name}</strong></span></div>
      <p class="muted">同じ銃を選ぶと、主・副武器が入れ替わります。ロビーでは武器を表示せず、オペレーター本来の立ち姿を表示します。</p><p class="field-label">選択中の武器</p><div class="held-options"><button type="button" id="hold-primary" class="secondary-action" aria-pressed="${v.held === 'primary'}">主武器を選択</button><button type="button" id="hold-secondary" class="secondary-action" aria-pressed="${v.held === 'secondary'}">副武器を選択</button></div>
      <details><summary>装備レアリティについて</summary><p class="muted">${RARITIES.join(' → ')}<br>分類の予定です。所持・取得を示すものではありません。競技ランクとは別です。</p></details><p class="muted">性能・強化・素材消費は未実装。</p>`;
    this.footer('<button id="weapon-done" class="secondary-action" type="button">閉じて装備を見る</button>');
    el('weapon-done').addEventListener('click', () => this.close());
    el('panel-content').querySelectorAll<HTMLButtonElement>('[data-gun]').forEach(b => b.addEventListener('click', () => {
      this.saved = chooseGun(this.saved, b.dataset.slot as 'primary' | 'secondary', b.dataset.gun as GunId); this.persist(); this.sync(); this.weapons();
      el('panel-content').querySelector<HTMLElement>(`[data-slot="${b.dataset.slot}"][data-gun="${b.dataset.gun}"]`)?.focus({ preventScroll: true });
    }));
    for (const slot of ['primary', 'secondary'] as const) el(`hold-${slot}`).addEventListener('click', () => {
      this.saved = { ...this.saved, held: slot }; this.persist(); this.sync(); this.weapons(); el(`hold-${slot}`).focus({ preventScroll: true });
    });
  }
  map() {
    const route=visibleRoute(this.campaign.value),available=visibleAreas(this.campaign.value);
    const path=route.map(r=>`${r.x},${r.y}`).join(' ');
    el('panel-content').innerHTML = `<div class="map-overview"><div class="paper-map"><span class="map-caption">JAPAN / JOURNEY</span><svg id="campaign-map" viewBox="0 0 350 360" role="group" aria-label="日本編の旅路概略図"><g class="map-grid"><path d="M0 90h350M0 180h350M0 270h350M87 0v360M175 0v360M262 0v360"/></g><g class="map-land"><path d="M252 38l23-15 15 22 43 4-18 28-30 14-23 18-29-15 12-28-21-7zM233 122l21 13-8 31 15 22-7 35 15 24 3 34-27 27-38 1-19 15-27-8-26-9-15 12-39-3-17 18-26-9 2-21 31-7 24-18 25-11 24 4 27-12 18-10 12-30 11-25 4-29-5-24zM50 315l20 18-18 25-18-4-7-17zM78 329l28-4 15 10-25 12-20-5z"/></g><polyline class="map-route" points="${path}"/>${route.map((r,i)=>`<circle data-region="${i}" cx="${r.x}" cy="${r.y}" r="${i===0?7:4}" tabindex="0" role="button" aria-label="${r.number} ${r.name}の情報を見る"/>`).join('')}<text x="281" y="35">知床</text><text x="12" y="36">N ↑</text></svg><span class="map-caption">物語の旅路概略図 / 実際の登山経路ではありません</span></div><div class="map-details"><p class="panel-intro">まだ知らない、日本の先へ。</p><label class="field-label" for="region-select">地域を閲覧</label><select id="region-select" class="region-select">${route.map((r,i)=>`<option value="${i}">${String(r.number).padStart(2,'0')} / ${r.name}</option>`).join('')}</select><div id="region-detail" class="region-detail"><h3 id="region-name"></h3><span id="region-status" class="status-tag"></span><p id="region-description"></p></div><div class="campaign-subareas" aria-label="北海道の道中"><span class="field-label">道中の記録</span>${['shiretoko','ishikari-mountains','hidaka-mountains','sapporo'].map(id=>{const a=available.find(a=>a.id===id);return`<div><span>${a?.displayName??'???'}</span><small>${a?(a.status==='playable'?'探索可能':'環境プロトタイプ'):'???'}</small></div>`;}).join('')}</div><p class="muted">実際の到達条件で、次の区間を1つずつ公開します。未制作地域の完了は付与しません。</p></div></div>`;
    mountAuthoredMap(el('panel-content'),()=>this.startMission('shiretoko'));
    this.footer('<div class="campaign-save-actions"><p>18訪問地点 / 未到達の情報は ???</p><button id="campaign-reset" class="text-action" type="button">進行をリセット</button></div><div id="campaign-reset-confirm" class="campaign-reset-confirm" hidden>進行だけを初期状態へ戻します。外観と武器は保持します。<div class="panel-actions"><button id="campaign-reset-yes" class="secondary-action" type="button">進行リセットを確定</button><button id="campaign-reset-no" class="text-action" type="button">キャンセル</button></div></div>');
    el('campaign-reset').addEventListener('click',()=>{el('campaign-reset-confirm').hidden=false;el('campaign-reset-yes').focus();this.layout();});
    el('campaign-reset-no').addEventListener('click',()=>{el('campaign-reset-confirm').hidden=true;el('campaign-reset').focus();this.layout();});
    el('campaign-reset-yes').addEventListener('click',()=>{this.campaign.reset(true);this.map();this.layout();this.announce('進行をリセットしました。外観・武器は保持します。');});
    const select=el<HTMLSelectElement>('region-select');
    const update=()=>{const i=Number(select.value),r=route[i];el('region-name').textContent=r.name;el('region-status').textContent=r.revealed?(r.status==='playable'?'探索可能':'環境プロトタイプ'):'???';el('region-description').textContent=r.description;el('campaign-map').querySelectorAll<SVGElement>('[data-region]').forEach(c=>c.setAttribute('aria-pressed',String(Number(c.dataset.region)===i)));};
    select.addEventListener('change',update);el('campaign-map').querySelectorAll<SVGElement>('[data-region]').forEach(c=>{const choose=()=>{select.value=c.dataset.region!;update();};c.addEventListener('click',choose);c.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose();}});});update();
  }

  boss() {
    el('panel-content').innerHTML = `<p class="panel-intro">別の戦場でも、同じ敵と。</p><div class="connection-state"><span class="status-dot"></span>未接続<span class="muted">攻略情報の配信準備中</span></div><div class="unknown-hp"><span>共通HP</span><strong>—</strong><small>取得していません</small></div><div class="wall-list">${[1, 2, 3].map(i => `<div><span>WALL 0${i}</span><span>条件未確定</span></div>`).join('')}</div><p>HPを削るだけでは越えられない、3つの壁。他小隊の攻略成果も共有される予定です。</p><p class="muted">壁の割合・必要人数は未確定。現時点でサーバーへの接続はありません。</p><p class="field-label">未到達地域の攻略情報</p><p class="planned-regions">???</p><p class="muted">先の敵や物語の情報は、まだ公開されていません。</p>`;
  }
  ranking() {
    el('panel-content').innerHTML = `<p class="panel-intro">ここに、これからの足跡を。</p><div class="empty-records">${svg('<path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h4"/>')}<h3>まだ、記録は届いていません。</h3><span class="status-tag">未接続 / 集計準備中</span><p>ランキングの収集は始まっていません。<br>順位・スコアは表示できません。</p></div><p class="muted">プレイヤーの競技ランクと装備レアリティは、別の仕組みです。ログイン・記録APIは今後実装します。</p>`;
  }
  briefing() {
    const v=this.current,areas=visibleAreas(this.campaign.value),checkpoint=this.campaign.value.checkpoint;
    el('panel-content').innerHTML=`<span class="briefing-location">FIELD / ON FOOT</span><p class="panel-intro">木造の家から、北の森へ。</p><div class="mission-boundary"><strong>知床の探索・射撃プロトタイプ</strong><p id="combat-reason">キーボード・マウス、またはスマホのタッチ操作で徒歩探索。最初の小型ドローンと遭遇できます。<br>戦闘の数値・通過条件はPROVISIONAL。オンライン未接続。</p></div><label class="field-label" for="mission-area-select">出撃先</label><select id="mission-area-select" class="briefing-select">${areas.map(a=>`<option value="${a.id}">${a.displayName}${a.status==='prototype'?' / 環境プロトタイプ':''}</option>`).join('')}</select><div class="briefing-strip"><span>出撃予定地</span><strong id="briefing-area">知床 / 北海道</strong></div><div class="briefing-strip"><span>編成</span><strong>SOLO / 徒歩</strong></div><p class="muted">${this.state.squadPreview?'4人配置はHOMEの見本です。ミッションはソロで開始します。':'この端末のローカル探索です。'}</p><div class="briefing-strip"><span>生存者</span><strong id="briefing-name"></strong></div><div class="briefing-strip"><span>主武器 / 副武器</span><strong>${gunName(v.primary)} / ${gunName(v.secondary)}</strong></div><div class="briefing-strip"><span>現在の持ち物</span><strong>${gunName(v[v.held])} + ${MELEE.name}</strong></div><p id="mission-unavailable" class="muted" ${this.world&&!this.world.lost?'hidden':''}>WebGL2が利用できないため、出撃は開始できません。HOMEの設定は操作できます。</p>`;
    this.footer(`<div class="panel-actions"><button id="mission-launch" class="primary-action" type="button" ${this.world&&!this.world.lost?'':'disabled'} aria-describedby="combat-reason">出撃開始</button><button id="mission-resume" class="secondary-action" type="button" ${checkpoint&&this.world&&!this.world.lost?'':'hidden'}>保存位置から再開</button><button id="briefing-back" class="secondary-action" type="button">HOMEに戻る</button></div>`);
    el('briefing-name').textContent=v.appearance.name;
    const select=el<HTMLSelectElement>('mission-area-select');
    if(checkpoint&&areas.some(a=>a.id===checkpoint.areaId))select.value=checkpoint.areaId;
    const update=()=>{
      const area=areas.find(a=>a.id===select.value)!;
      el('panel-title').textContent=area.id==='shiretoko'?'最初の出撃：知床':`出撃確認：${area.displayName}`;
      el('briefing-area').textContent=`${area.displayName} / 北海道`;
      el('panel-content').querySelector<HTMLElement>('.panel-intro')!.textContent=area.id==='shiretoko'?'木造の家から、北の森へ。':area.id==='sapporo'?'森を抜け、都市の入口へ。':'北の山道を徒歩で進む。';
      el('panel-content').querySelector<HTMLElement>('.mission-boundary strong')!.textContent=area.id==='shiretoko'?'知床 / 新しいマップへ出撃':`${area.displayName}の環境プロトタイプ`;
      const controls=this.coarse.matches&&!this.fine.matches?'左スティックで移動、右側をスワイプして視点、画面のボタンで射撃・ジャンプ。横向きがおすすめです。':'WASDで移動、マウスで視点、Shiftで走る、Spaceでジャンプ。';
      el('combat-reason').textContent=(area.id==='shiretoko'?'新しい家・庭・山道・廃倉庫のあるマップを実際に歩けます。':'地形・経路・POIを徒歩で確認する環境プロトタイプです。正式任務・敵は開発中。')+controls;
      el('mission-resume').hidden=!checkpoint||checkpoint.areaId!==select.value||!this.world||this.world.lost;
    };
    select.addEventListener('change',update);update();
    el('mission-launch').addEventListener('click',()=>this.startMission(select.value as AreaId));
    el('mission-resume').addEventListener('click',()=>this.startMission(select.value as AreaId,checkpoint));
    el('briefing-back').addEventListener('click',()=>this.close());
  }

  snapshot() { return { panel: this.panel, preview: structuredClone(this.current) }; }
}
