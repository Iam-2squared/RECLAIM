import type { MoveInput } from './controller.ts';
import type { EquippedWeapon } from './weapon-state.ts';
import './touch-controls.css';

type TouchHooks = {
  look: (dx: number, dy: number) => void;
  fire: (pressed: boolean) => void;
  jump: (pressed: boolean) => void;
  aim: (aiming: boolean) => void;
  reload: () => void;
  select: (slot: 'primary' | 'secondary' | 'knife') => void;
  view: () => void;
  interact: () => void;
  pause: () => void;
  reset: () => void;
  modeChanged: () => void;
};
type HeldInput = 'move' | 'look' | 'fire' | 'jump';
type Contact = { kind: HeldInput | 'action' | 'weapon'; element: HTMLElement; x: number; y: number; timer?: number; longPress?: boolean; moved?: boolean };
type TouchStatus = {
  interact: boolean; aiming: boolean; thirdPerson: boolean;
  weapon: EquippedWeapon; primary: EquippedWeapon; secondary: EquippedWeapon;
  ammo?: number | null; reserve?: number; unlimitedReserve?: boolean; reloading?: boolean;
};
const icon = (content: string) => `<svg viewBox="0 0 24 24" aria-hidden="true">${content}</svg>`;
const gunIcon = icon('<path d="M3 9h15v5H9l-2 5H4l1-5H3zM18 10h4M11 6v3M15 6v3"/>');

/** A small shooter HUD; each thumb owns its contact independently. */
export class TouchControls {
  readonly coarse = matchMedia('(any-pointer: coarse)');
  readonly fine = matchMedia('(any-pointer: fine)');
  readonly root = document.createElement('div');
  private readonly contacts = new Map<number, Contact>();
  private readonly suppressedClicks = new Map<HTMLElement, number>();
  private readonly buttons = new Map<string, HTMLButtonElement>();
  private readonly button = (id: string) => this.buttons.get(id)!;
  private forward = 0;
  private right = 0;
  private sprint = false;
  private jumping = false;
  private aiming = false;
  private firing = false;
  private running = false;
  private disposed = false;
  private equipmentOpen = false;
  private selectedWeapon: EquippedWeapon = 'assault';
  private primaryWeapon: EquippedWeapon = 'assault';
  private lastStatus = '';
  private readonly equipment: HTMLElement;
  private readonly backdrop: HTMLElement;
  private readonly weaponName: HTMLElement;
  private readonly ammoLabel: HTMLElement;

  constructor(host: HTMLElement, private readonly hooks: TouchHooks) {
    this.root.id = 'mission-touch-controls';
    this.root.className = 'mission-touch-controls';
    this.root.hidden = true;
    this.root.setAttribute('aria-label', '探索のタッチ操作');
    this.root.innerHTML = `
      <div id="touch-look" class="touch-look" data-touch-input="look" role="application" aria-label="右側をスワイプして視点を動かす"></div>
      <div class="touch-top">
        <button id="touch-interact" type="button" data-touch-action="interact" hidden>${icon('<path d="M8 13V5a2 2 0 0 1 4 0v6l1-5a2 2 0 0 1 4 1l-1 5 2-2a2 2 0 0 1 3 2l-4 7H8l-5-7a2 2 0 0 1 3-2z"/>')}<span>調べる</span></button>
        <button id="touch-pause" type="button" data-touch-action="pause" aria-label="一時停止">${icon('<path d="M8 5v14M16 5v14"/>')}</button>
      </div>
      <div class="touch-movement touch-primary-control">
        <button id="touch-move" class="touch-stick" type="button" data-touch-input="move" aria-label="移動スティック。大きく前へ倒すとダッシュ"><span class="touch-stick-run" aria-hidden="true">⌃</span><span class="touch-stick-knob" aria-hidden="true"></span></button>
      </div>
      <div class="touch-actions touch-primary-control">
        <button id="touch-aim" type="button" data-touch-action="aim" aria-label="構えを切り替える" aria-pressed="false">${icon('<circle cx="12" cy="12" r="6"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>')}</button>
        <button id="touch-fire" type="button" data-touch-input="fire" aria-label="押して射撃。ナイフは近接攻撃" aria-pressed="false">${icon('<circle cx="12" cy="12" r="4"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4M4 4l3 3M17 17l3 3M4 20l3-3M17 7l3-3"/>')}</button>
        <button id="touch-jump" type="button" data-touch-input="jump" aria-label="ジャンプ" aria-pressed="false">${icon('<path d="m6 10 6-6 6 6M12 4v14M5 21h14"/>')}</button>
      </div>
      <button id="touch-weapon" class="touch-weapon touch-primary-control" type="button" data-touch-input="weapon" aria-label="武器を切り替える。長押しで装備を開く" aria-haspopup="dialog" aria-expanded="false" aria-describedby="touch-weapon-help">${gunIcon}<span class="touch-weapon-copy"><span id="touch-weapon-name">アサルト</span><strong id="touch-ammo">—</strong></span><span class="touch-weapon-more" aria-hidden="true">•••</span></button>
      <span id="touch-weapon-help" class="touch-visually-hidden">タップで主武器と副武器を切り替えます。長押し、または下矢印キーで装填・ナイフ・視点切替を開きます。</span>
      <div id="touch-equipment-backdrop" class="touch-equipment-backdrop" data-touch-action="close-equipment" aria-hidden="true" hidden></div>
      <section id="touch-equipment-panel" class="touch-equipment-panel" role="dialog" aria-modal="true" aria-label="装備" hidden>
        <div class="touch-equipment-heading"><strong>装備</strong><button id="touch-equipment-close" type="button" data-touch-action="close-equipment" aria-label="装備を閉じる">×</button></div>
        <div class="touch-equipment-options">
          <button id="touch-reload" type="button" data-touch-action="reload">装填</button>
          <button id="touch-view" type="button" data-touch-action="view" aria-pressed="false">三人称に切替</button>
          <button id="touch-primary" type="button" data-touch-action="primary" aria-pressed="false">主武器</button>
          <button id="touch-secondary" type="button" data-touch-action="secondary" aria-pressed="false">副武器</button>
          <button id="touch-knife" type="button" data-touch-action="knife" aria-pressed="false">ナイフ</button>
        </div>
      </section>`;
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('button')) this.buttons.set(button.id.replace('touch-', ''), button);
    this.equipment = this.root.querySelector('#touch-equipment-panel')!;
    this.backdrop = this.root.querySelector('#touch-equipment-backdrop')!;
    this.weaponName = this.root.querySelector('#touch-weapon-name')!;
    this.ammoLabel = this.root.querySelector('#touch-ammo')!;
    host.append(this.root);
    this.root.addEventListener('pointerdown', this.pointerDown);
    this.root.addEventListener('pointermove', this.pointerMove);
    this.root.addEventListener('pointerup', this.pointerUp);
    this.root.addEventListener('pointercancel', this.pointerCancel);
    this.root.addEventListener('lostpointercapture', this.lostCapture);
    this.root.addEventListener('click', this.click);
    this.root.addEventListener('keydown', this.keyDown);
    this.root.addEventListener('contextmenu', this.contextMenu);
    this.coarse.addEventListener('change', this.mediaChanged);
    this.fine.addEventListener('change', this.mediaChanged);
  }

  get enabled() { return this.coarse.matches && !this.fine.matches; }
  get active() { return this.running && this.enabled && !this.disposed; }
  get fireHeld() { return this.firing; }
  get input(): MoveInput { return { forward: this.forward, right: this.right, sprint: this.sprint, jump: this.jumping }; }

  setActive(active: boolean) {
    const next = active && this.enabled && !this.disposed;
    if (!next) this.reset();
    this.running = next;
    this.root.hidden = !next;
    document.body.dataset.touchControlsActive = String(next);
  }

  private mediaChanged = () => { this.setActive(false); this.hooks.modeChanged(); };

  private pointerDown = (event: PointerEvent) => {
    if (!this.active || (event.pointerType !== 'touch' && event.pointerType !== 'pen')) return;
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-touch-input],[data-touch-action]') : null;
    if (!target || target instanceof HTMLButtonElement && target.disabled) return;
    const kind = target.dataset.touchAction ? 'action' : target.dataset.touchInput as Contact['kind'];
    event.preventDefault();
    if (kind !== 'action' && [...this.contacts.values()].some(contact => contact.kind === kind)) return;
    const contact: Contact = { kind, element: target, x: event.clientX, y: event.clientY };
    this.contacts.set(event.pointerId, contact);
    try { target.setPointerCapture(event.pointerId); } catch { /* Cancellation still clears owned input. */ }
    if (kind === 'action') {
      this.suppressedClicks.set(target, performance.now() + 1000);
      this.activateAction(target);
    }
    if (kind === 'weapon') {
      this.suppressedClicks.set(target, Infinity);
      contact.timer = window.setTimeout(() => {
        if (!this.active || this.contacts.get(event.pointerId) !== contact || contact.moved) return;
        contact.longPress = true;
        this.openEquipment(event.pointerId);
      }, 450);
    }
    if (kind === 'move') this.moveStick(target, event.clientX, event.clientY);
    if (kind === 'fire') { this.firing = true; target.setAttribute('aria-pressed', 'true'); this.hooks.fire(true); }
    if (kind === 'jump') { this.jumping = true; target.setAttribute('aria-pressed', 'true'); this.hooks.jump(true); }
  };

  private pointerMove = (event: PointerEvent) => {
    const contact = this.contacts.get(event.pointerId);
    if (!this.active || !contact) return;
    event.preventDefault();
    if (contact.kind === 'move') this.moveStick(contact.element, event.clientX, event.clientY);
    if (contact.kind === 'look') this.hooks.look((event.clientX - contact.x) * 2.7, (event.clientY - contact.y) * 2.7);
    if (contact.kind === 'weapon' && Math.hypot(event.clientX - contact.x, event.clientY - contact.y) > 12) {
      contact.moved = true; clearTimeout(contact.timer);
    }
    if (contact.kind !== 'weapon') { contact.x = event.clientX; contact.y = event.clientY; }
  };

  private moveStick(element: HTMLElement, x: number, y: number) {
    const rect = element.getBoundingClientRect(), radius = Math.max(1, Math.min(rect.width, rect.height) * .32);
    const dx = (x - rect.left - rect.width / 2) / radius, dy = (y - rect.top - rect.height / 2) / radius;
    const length = Math.hypot(dx, dy), magnitude = Math.min(1, Math.max(0, (length - .12) / .88));
    this.right = length ? dx / length * magnitude : 0;
    this.forward = length ? -dy / length * magnitude : 0;
    this.sprint = length > 1.05 && this.forward > .65;
    element.dataset.sprinting = String(this.sprint);
    element.style.setProperty('--stick-x', `${this.right * radius}px`);
    element.style.setProperty('--stick-y', `${-this.forward * radius}px`);
  }

  private pointerUp = (event: PointerEvent) => {
    const contact = this.contacts.get(event.pointerId);
    if (!contact) return;
    event.preventDefault();
    this.contacts.delete(event.pointerId); clearTimeout(contact.timer);
    if (contact.kind === 'move') this.resetStick();
    if (contact.kind === 'fire') { this.firing = false; contact.element.setAttribute('aria-pressed', 'false'); this.hooks.fire(false); }
    if (contact.kind === 'jump') { this.jumping = false; contact.element.setAttribute('aria-pressed', 'false'); this.hooks.jump(false); }
    if (contact.kind === 'weapon' && !contact.longPress && !contact.moved) this.cycleWeapon();
    if (contact.kind === 'action' || contact.kind === 'weapon') this.suppressedClicks.set(contact.element, performance.now() + 1000);
    this.release(contact, event.pointerId);
  };

  private pointerCancel = (event: PointerEvent) => { if (this.contacts.has(event.pointerId)) this.reset(); };
  private lostCapture = (event: PointerEvent) => {
    const contact = this.contacts.get(event.pointerId);
    if (!contact) return;
    // A tapped panel action may hide itself; it owns no continuing input.
    if (contact.kind === 'action') this.contacts.delete(event.pointerId); else this.reset();
  };
  private release(contact: Contact, id: number) {
    try { if (contact.element.hasPointerCapture(id)) contact.element.releasePointerCapture(id); } catch { /* Already cancelled by the browser. */ }
  }

  private click = (event: MouseEvent) => {
    if (!this.active) return;
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-touch-action],[data-touch-input="weapon"]') : null;
    if (!target || target instanceof HTMLButtonElement && target.disabled) return;
    event.preventDefault();
    if (event.detail > 0 && performance.now() < (this.suppressedClicks.get(target) ?? 0)) return;
    if (target.dataset.touchInput === 'weapon') this.cycleWeapon(); else this.activateAction(target);
  };

  private activateAction(target: HTMLElement) {
    switch (target.dataset.touchAction) {
      case 'aim': this.aiming = !this.aiming; this.hooks.aim(this.aiming); break;
      case 'reload': this.hooks.reload(); this.closeEquipment(); break;
      case 'primary': case 'secondary': case 'knife': this.hooks.select(target.dataset.touchAction); this.closeEquipment(); break;
      case 'view': this.hooks.view(); this.closeEquipment(); break;
      case 'interact': this.hooks.interact(); break;
      case 'pause': this.hooks.pause(); break;
      case 'close-equipment': this.closeEquipment(); break;
    }
  }

  private cycleWeapon() { this.hooks.select(this.selectedWeapon === this.primaryWeapon ? 'secondary' : 'primary'); }
  private openEquipment(openingPointer?: number) {
    if (this.equipmentOpen) return;
    // Keep the opening thumb captured until it lifts. Otherwise its release can
    // click a newly appeared equipment action beneath the original weapon tile.
    const openingContact = openingPointer === undefined ? null : this.contacts.get(openingPointer);
    if (openingContact) this.contacts.delete(openingPointer!);
    this.reset();
    if (!this.active) { if (openingContact) this.release(openingContact, openingPointer!); return; }
    if (openingContact) this.contacts.set(openingPointer!, openingContact);
    this.equipmentOpen = true; this.equipment.hidden = this.backdrop.hidden = false;
    this.root.dataset.equipmentOpen = 'true'; this.button('weapon').setAttribute('aria-expanded', 'true');
    (this.button('reload').disabled ? this.button('equipment-close') : this.button('reload')).focus({ preventScroll: true });
  }
  private closeEquipment() {
    const wasOpen = this.equipmentOpen;
    this.equipmentOpen = false; this.equipment.hidden = this.backdrop.hidden = true;
    this.root.dataset.equipmentOpen = 'false'; this.button('weapon').setAttribute('aria-expanded', 'false');
    if (wasOpen && this.active) this.button('weapon').focus({ preventScroll: true });
  }
  private keyDown = (event: KeyboardEvent) => {
    if (!this.active) return;
    if (this.equipmentOpen && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.closeEquipment(); }
    else if (this.equipmentOpen && event.key === 'Tab') {
      const buttons = [...this.equipment.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && event.target === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && event.target === last) { event.preventDefault(); first?.focus(); }
    } else if (event.target === this.button('weapon') && event.key === 'ArrowDown') { event.preventDefault(); event.stopPropagation(); this.openEquipment(); }
    if (this.equipmentOpen) event.stopPropagation();
  };
  private contextMenu = (event: Event) => {
    if (!this.active) return;
    event.preventDefault();
    if (event.target instanceof Element && event.target.closest('#touch-weapon')) this.openEquipment();
  };

  private resetStick() {
    this.forward = this.right = 0; this.sprint = false;
    const stick = this.button('move'); stick.dataset.sprinting = 'false';
    stick.style.setProperty('--stick-x', '0px'); stick.style.setProperty('--stick-y', '0px');
  }

  /** Pause, OS cancellation and rotation release every thumb and pending long press. */
  reset() {
    const contacts = [...this.contacts]; this.contacts.clear();
    for (const [id, contact] of contacts) { clearTimeout(contact.timer); this.release(contact, id); }
    this.resetStick(); this.jumping = this.aiming = this.firing = false;
    for (const id of ['aim', 'fire', 'jump']) this.button(id).setAttribute('aria-pressed', 'false');
    this.equipmentOpen = false; this.equipment.hidden = this.backdrop.hidden = true;
    this.root.dataset.equipmentOpen = 'false'; this.button('weapon').setAttribute('aria-expanded', 'false');
    this.hooks.reset();
  }

  updateStatus(status: TouchStatus) {
    const signature = [status.interact, status.aiming, status.thirdPerson, status.weapon, status.primary, status.secondary, status.ammo, status.reserve, status.unlimitedReserve, status.reloading].join('|');
    if (signature === this.lastStatus) return;
    this.lastStatus = signature;
    this.aiming = status.aiming; this.selectedWeapon = status.weapon;
    this.primaryWeapon = status.primary;
    this.button('aim').setAttribute('aria-pressed', String(status.aiming));
    this.button('aim').disabled = status.weapon === 'knife'; this.button('reload').disabled = status.weapon === 'knife';
    this.button('interact').hidden = !status.interact;
    this.button('view').setAttribute('aria-pressed', String(status.thirdPerson));
    this.button('view').textContent = status.thirdPerson ? '一人称に切替' : '三人称に切替';
    this.weaponName.textContent = { assault: 'アサルト', sniper: 'スナイパー', knife: 'ナイフ' }[status.weapon];
    this.ammoLabel.textContent = status.reloading ? '装填中' : status.weapon === 'knife' ? '近接' : status.ammo === undefined ? '—' : `${status.ammo} / ${status.unlimitedReserve === false ? status.reserve ?? 0 : '∞'}`;
    this.button('weapon').setAttribute('aria-label', `${this.weaponName.textContent} ${this.ammoLabel.textContent}。タップで武器切替、長押しで装備`);
    this.button('fire').setAttribute('aria-label', status.weapon === 'knife' ? '押して近接攻撃' : '押して射撃。アサルトは長押しで連射');
    for (const slot of ['primary', 'secondary', 'knife'] as const) this.button(slot).setAttribute('aria-pressed', String(status.weapon === (slot === 'knife' ? 'knife' : status[slot])));
  }

  snapshot() {
    return { enabled: this.enabled, active: this.active, ...this.input, aiming: this.aiming, firing: this.firing, equipmentOpen: this.equipmentOpen,
      pointers: [...this.contacts].map(([id, contact]) => ({ id, kind: contact.kind })) };
  }

  dispose() {
    this.setActive(false); this.disposed = true;
    this.coarse.removeEventListener('change', this.mediaChanged); this.fine.removeEventListener('change', this.mediaChanged);
    this.root.removeEventListener('pointerdown', this.pointerDown); this.root.removeEventListener('pointermove', this.pointerMove);
    this.root.removeEventListener('pointerup', this.pointerUp); this.root.removeEventListener('pointercancel', this.pointerCancel);
    this.root.removeEventListener('lostpointercapture', this.lostCapture); this.root.removeEventListener('click', this.click);
    this.root.removeEventListener('keydown', this.keyDown); this.root.removeEventListener('contextmenu', this.contextMenu);
    this.suppressedClicks.clear(); delete document.body.dataset.touchControlsActive; this.root.remove();
  }
}
