import './home.css';
import { HOME_KEY, MAX_NAME, PALETTES, GUNS, RARITIES, ROUTE, defaults, parseHome, normalizeName, chooseGun, gunName, type Appearance, type HomePreview, type GunId, type PaletteId } from './home-state';
import type { ScreenState } from './state';
import type { WorldView } from './scene';

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
  readonly compact = matchMedia('(max-width: 959px), (max-height: 440px)');
  readonly stageObserver = new ResizeObserver(() => this.layout());
  readonly compactChanged = () => this.layout();
  readonly blocked = new Map<HTMLElement, { aria: string | null; inert: boolean; tabs: [HTMLElement, string | null][] }>();
  readonly labels = Array.from(document.querySelectorAll<HTMLElement>('.survivor-label'));
  constructor(readonly state: ScreenState, readonly world: WorldView | null, readonly announce: (s: string) => void, readonly invalidateRender: () => void) {
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
      if (e.key === 'Tab' && this.panel && this.modal && !el<HTMLDialogElement>('settings-dialog').open) {
        const controls = Array.from(el('home-panel').querySelectorAll<HTMLElement>('button:not(:disabled), input, select, summary, [tabindex]')).filter(n => n.tabIndex >= 0 && n.getClientRects().length);
        const first = controls[0], last = controls.at(-1);
        if (document.activeElement === el('panel-title') || (e.shiftKey && document.activeElement === first) || (!e.shiftKey && document.activeElement === last)) {
          e.preventDefault(); (e.shiftKey ? last : first)?.focus();
        }
      }
      if (e.key !== 'Escape' || el<HTMLDialogElement>('settings-dialog').open) return;
      if (this.panel) { e.preventDefault(); this.close(); }
      else if (el('menu-toggle').getAttribute('aria-expanded') === 'true') { this.drawer(false); el('menu-toggle').focus(); }
    });
    // Observe the reserved stage, rather than measuring the DOM on every render frame.
    this.stageObserver.observe(el('lobby-stage'));
    this.labels.forEach(label => this.stageObserver.observe(label));
    this.compact.addEventListener('change', this.compactChanged);
    document.addEventListener('focusin', e => {
      if (this.modal && this.panel && !el<HTMLDialogElement>('settings-dialog').open && !el('home-panel').contains(e.target as Node)) el('panel-title').focus({ preventScroll: true });
    });
    this.sync();
  }
  drawer(open: boolean) { el('home-nav').classList.toggle('is-open', open); el('menu-toggle').setAttribute('aria-expanded', String(open)); }
  squad(value: boolean) {
    this.state.squadPreview = value;
    el('solo-button').setAttribute('aria-pressed', String(!value)); el('squad-button').setAttribute('aria-pressed', String(value));
    this.formationNote();
    this.labels.slice(1).forEach(label => { label.hidden = !value; });
    if (this.panel === 'briefing') this.briefing();
    this.layout(); this.announce(value ? '4人編成プレビュー。後方3人は見本です。オンライン未接続。' : 'ソロ配置に戻しました。');
  }
  get current(): HomePreview { return { ...this.saved, appearance: this.draft ?? this.saved.appearance }; }
  sync() {
    const v = this.current;
    el('survivor-name').textContent = v.appearance.name;
    el('held-weapon').textContent = `${gunName(v[v.held])} / 日本刀`;
    document.body.dataset.heldWeapon = v[v.held]; document.body.dataset.palette = v.appearance.palette;
    this.world?.preview(v);
  }
  formationNote() {
    el('squad-note').textContent = this.state.squadPreview
      ? this.panel && !this.compact.matches ? '自キャラの外観プレビュー・4人は閉じて確認' : '4人編成プレビュー・オンライン未接続'
      : 'SOLO · この端末のローカルプレビュー';
  }
  panelMode() {
    const modal = Boolean(this.panel && this.compact.matches);
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
      const rect = el('lobby-stage').getBoundingClientRect();
      const nameLimit = innerWidth >= 960 && innerWidth < 1200 && !this.panel ? 160 : 250;
      document.body.style.setProperty('--preview-label-width', `${Math.max(80, Math.min(nameLimit, rect.width - 16))}px`);
      this.labels.forEach((label,i) => { label.hidden = i > 0 && (!this.state.squadPreview || Boolean(this.panel)); });
      const obstacles = ['.home-footnote', '.launch-area', '.lobby-heading', '.squad-tools'].map(s => document.querySelector<HTMLElement>(s)!).filter(n => n.getClientRects().length).map(n => n.getBoundingClientRect());
      this.world?.setStage(rect, this.labels, Boolean(this.panel), obstacles);
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
    el('panel-content').scrollTop = 0; this.layout(); el('panel-title').focus({ preventScroll: true });
  }
  close(focus = true) {
    if (!this.panel) return;
    this.draft = null; this.panel = null; this.sync();
    el('home-panel').hidden = true; document.body.dataset.panelOpen = 'false';
    el<HTMLButtonElement>('start-button').disabled = false;
    this.panelMode();
    el('nav-items').querySelectorAll<HTMLElement>('button').forEach(b => b.setAttribute('aria-expanded', 'false'));
    this.layout();
    if (focus) {
      const opener = this.opener;
      (opener && opener.getClientRects().length ? opener : el('menu-toggle')).focus({ preventScroll: true });
    }
  }
  footer(html = '') { el('panel-footer').innerHTML = html; el('panel-footer').hidden = !html; }
  dispose() { clearTimeout(this.layoutTask); this.stageObserver.disconnect(); this.compact.removeEventListener('change', this.compactChanged); }
  character() {
    this.draft = { ...this.saved.appearance };
    el('panel-content').innerHTML = `<p class="panel-intro">旅に出る、自分の姿を。</p>
      <label class="field-label" for="preview-name">表示名</label><input id="preview-name" class="name-input" maxlength="64" autocomplete="off" spellcheck="false" aria-describedby="name-help name-count"><div class="field-meta"><span id="name-help">16文字まで。空欄はSURVIVOR。</span><span id="name-count"></span></div>
      <p class="field-label">衣服と装備の色</p><div class="palette-options">${PALETTES.map(p => `<button type="button" class="palette" data-palette="${p.id}" aria-pressed="${p.id === this.draft!.palette}"><span class="color-chip" style="--chip:${p.color}"></span>${p.name}</button>`).join('')}</div><p id="palette-note" class="muted"></p>
      <p class="muted">この端末だけの外観設定です。適用するまでプレビュー。閉じると変更を取り消します。</p>`;
    this.footer('<div class="panel-actions"><button id="apply-character" class="primary-action" type="button">適用</button><button id="cancel-character" class="secondary-action" type="button">キャンセル</button><button id="reset-character" class="text-action" type="button">初期状態に戻す</button></div>');
    const input = el<HTMLInputElement>('preview-name'); input.value = this.draft.name;
    const update = () => {
      this.draft!.name = normalizeName(input.value);
      el('name-count').textContent = `${Array.from(input.value).length} / ${MAX_NAME}`;
      el('name-help').textContent = Array.from(input.value).length > MAX_NAME ? '16文字を超えた分は適用時に省略します。' : '16文字まで。空欄はSURVIVOR。';
      el('palette-note').textContent = PALETTES.find(p => p.id === this.draft!.palette)!.note;
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
    el('panel-content').innerHTML = `<p class="panel-intro">この手に、頼れる道具を。</p>
      <div class="weapon-slots">${(['primary', 'secondary'] as const).map((slot, i) => `<fieldset class="weapon-slot"><legend>${i === 0 ? '主武器' : '副武器'}</legend><div class="gun-options">${GUNS.map(g => `<button type="button" data-slot="${slot}" data-gun="${g.id}" class="gun-option" aria-pressed="${v[slot] === g.id}"><small>${g.code}</small><span>${g.name}</span></button>`).join('')}</div></fieldset>`).join('')}</div>
      <p class="muted">見た目用のローカル装備プレビュー。選択はこの端末に保存します。<br>同じ銃を選ぶと、主・副武器が入れ替わります。</p><p class="field-label">HOMEで手に持つ銃</p><div class="held-options"><button type="button" id="hold-primary" class="secondary-action" aria-pressed="${v.held === 'primary'}">主武器を持つ</button><button type="button" id="hold-secondary" class="secondary-action" aria-pressed="${v.held === 'secondary'}">副武器を持つ</button></div>
      <div class="katana-card"><span>日本刀</span><small>左腰に帯刀 · 鞘つき</small></div><details><summary>装備レアリティについて</summary><p class="muted">${RARITIES.join(' → ')}<br>分類の予定です。所持・取得を示すものではありません。競技ランクとは別です。</p></details><p class="muted">性能・強化・素材消費は未実装。</p>`;
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
    const path = ROUTE.slice(0, -1).map(r => `${r[2]},${r[3]}`).join(' ');
    el('panel-content').innerHTML = `<div class="map-overview"><div class="paper-map"><span class="map-caption">JAPAN / ROUTE PLAN</span><svg id="campaign-map" viewBox="0 0 350 360" role="group" aria-label="日本編の作戦ルート概略図"><g class="map-grid"><path d="M0 90h350M0 180h350M0 270h350M87 0v360M175 0v360M262 0v360"/></g><g class="map-land"><path d="M252 38l23-15 15 22 43 4-18 28-30 14-23 18-29-15 12-28-21-7zM233 122l21 13-8 31 15 22-7 35 15 24 3 34-27 27-38 1-19 15-27-8-26-9-15 12-39-3-17 18-26-9 2-21 31-7 24-18 25-11 24 4 27-12 18-10 12-30 11-25 4-29-5-24zM50 315l20 18-18 25-18-4-7-17zM78 329l28-4 15 10-25 12-20-5z"/></g><polyline class="map-route" points="${path}"/><path class="map-return" d="M95 308Q161 192 277 265"/>${ROUTE.map((r, i) => `<circle data-region="${i}" cx="${r[2]}" cy="${r[3]}" r="${i === 0 ? 7 : 4}" tabindex="0" role="button" aria-label="${r[1]}の予定を見る"/>`).join('')}<text x="281" y="35">知床</text><text x="265" y="300">東京</text><text x="12" y="36">N ↑</text></svg><span class="map-caption">経路の概略図 · 地理的な正確さを示す地図ではありません</span></div><div class="map-details"><p class="panel-intro">北の果てから、もう一度東京へ。</p><label class="field-label" for="region-select">地域を閲覧</label><select id="region-select" class="region-select">${ROUTE.map((r, i) => `<option value="${i}">${String(i + 1).padStart(2, '0')} / ${r[1]}</option>`).join('')}</select><div id="region-detail" class="region-detail"><h3 id="region-name"></h3><span id="region-status" class="status-tag"></span><p id="region-description"></p></div><p class="muted">初回の東京は撤退、最後の東京は再突入の予定です。</p></div></div>`;
    this.footer('<p>現在地：知床 · 地点を眺めても出撃先は変わりません。</p>');
    const select = el<HTMLSelectElement>('region-select');
    const update = () => {
      const i = Number(select.value), r = ROUTE[i]; el('region-name').textContent = r[1];
      el('region-status').textContent = i === 0 ? '現在地 · 出撃前確認のみ' : '未到達 / 未実装'; el('region-description').textContent = r[4];
      el('campaign-map').querySelectorAll<SVGElement>('[data-region]').forEach(c => c.setAttribute('aria-pressed', String(Number(c.dataset.region) === i)));
    };
    select.addEventListener('change', update);
    el('campaign-map').querySelectorAll<SVGElement>('[data-region]').forEach(c => {
      const choose = () => { select.value = c.dataset.region!; update(); };
      c.addEventListener('click', choose); c.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(); } });
    }); update();
  }
  boss() {
    el('panel-content').innerHTML = `<p class="panel-intro">別の戦場でも、同じ敵と。</p><div class="connection-state"><span class="status-dot"></span>未接続<span class="muted">攻略情報の配信準備中</span></div><div class="unknown-hp"><span>共通HP</span><strong>—</strong><small>取得していません</small></div><div class="wall-list">${[1, 2, 3].map(i => `<div><span>WALL 0${i}</span><span>条件未確定</span></div>`).join('')}</div><p>HPを削るだけでは越えられない、3つの壁。他小隊の攻略成果も共有される予定です。</p><p class="muted">壁の割合・必要人数は未確定。現時点でサーバーへの接続はありません。</p><p class="field-label">ボス配置の予定地域</p><p class="planned-regions">東京 / 名古屋 / 京都 / 大阪</p><p class="muted">設計上の予定情報です。攻略済み・参加可能を示しません。</p>`;
  }
  ranking() {
    el('panel-content').innerHTML = `<p class="panel-intro">ここに、これからの足跡を。</p><div class="empty-records">${svg('<path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h4"/>')}<h3>まだ、記録は届いていません。</h3><span class="status-tag">未接続 / 集計準備中</span><p>ランキングの収集は始まっていません。<br>順位・スコアは表示できません。</p></div><p class="muted">プレイヤーの競技ランクと装備レアリティは、別の仕組みです。ログイン・記録APIは今後実装します。</p>`;
  }
  briefing() {
    const v = this.current;
    el('panel-content').innerHTML = `<span class="briefing-location">SHIRETOKO</span><p class="panel-intro">ここから、奪還の旅が始まる。</p><div class="mission-boundary"><strong>戦闘は未実装</strong><p id="combat-reason">この画面では開始できません。<br>知床の移動・射撃は次の制作工程です。</p></div><div class="briefing-strip"><span>出撃予定地</span><strong>知床 / 北海道</strong></div><div class="briefing-strip"><span>編成</span><strong>${this.state.squadPreview ? '4人配置見本' : 'SOLO'}</strong></div><p class="muted">${this.state.squadPreview ? '後方3人は見本です。オンライン未接続。' : 'この端末のローカルプレビューです。'}</p><div class="briefing-strip"><span>生存者</span><strong id="briefing-name"></strong></div><div class="briefing-strip"><span>主武器 / 副武器</span><strong>${gunName(v.primary)} / ${gunName(v.secondary)}</strong></div><div class="briefing-strip"><span>現在の持ち物</span><strong>${gunName(v[v.held])} + 日本刀</strong></div>`;
    this.footer('<div class="panel-actions"><button class="primary-action combat-disabled" type="button" disabled aria-describedby="combat-reason">出撃開始 · 準備中</button><button id="briefing-back" class="secondary-action" type="button">HOMEに戻る</button></div>');
    el('briefing-name').textContent = v.appearance.name;
    el('briefing-back').addEventListener('click', () => this.close());
  }
  snapshot() { return { panel: this.panel, preview: structuredClone(this.current) }; }
}
