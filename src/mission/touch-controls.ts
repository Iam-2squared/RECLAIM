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
type Contact = { kind: HeldInput | 'action'; element: HTMLElement; x: number; y: number };

/** Independent pointer ownership lets both thumbs move, aim and fire together. */
export class TouchControls {
  readonly coarse = matchMedia('(any-pointer: coarse)');
  readonly fine = matchMedia('(any-pointer: fine)');
  readonly root = document.createElement('div');
  private readonly contacts = new Map<number, Contact>();
  private readonly suppressedClicks = new Map<HTMLElement, number>();
  private readonly button = (id: string) => this.root.querySelector<HTMLButtonElement>(`#touch-${id}`)!;
  private forward = 0;
  private right = 0;
  private sprint = false;
  private jumping = false;
  private aiming = false;
  private firing = false;
  private running = false;
  private disposed = false;

  constructor(host: HTMLElement, private readonly hooks: TouchHooks) {
    this.root.id = 'mission-touch-controls';
    this.root.className = 'mission-touch-controls';
    this.root.hidden = true;
    this.root.setAttribute('aria-label', '探索のタッチ操作');
    this.root.innerHTML = `
      <div id="touch-look" class="touch-look" data-touch-input="look" role="application" aria-label="視点を動かす"><span>スワイプで視点</span></div>
      <div class="touch-top">
        <button id="touch-interact" type="button" data-touch-action="interact" hidden>調べる</button>
        <button id="touch-pause" type="button" data-touch-action="pause" aria-label="一時停止">一時停止</button>
      </div>
      <div class="touch-movement">
        <button id="touch-sprint" type="button" data-touch-action="sprint" aria-pressed="false">ダッシュ</button>
        <button id="touch-move" class="touch-stick" type="button" data-touch-input="move" aria-label="移動スティック。押したまま動かす"><span class="touch-stick-label">移動</span><span class="touch-stick-knob" aria-hidden="true"></span></button>
      </div>
      <div class="touch-actions">
        <button id="touch-aim" type="button" data-touch-action="aim" aria-pressed="false">構え</button>
        <button id="touch-fire" type="button" data-touch-input="fire" aria-label="押して射撃。ナイフは近接攻撃" aria-pressed="false">射撃</button>
        <button id="touch-jump" type="button" data-touch-input="jump" aria-pressed="false">ジャンプ</button>
        <button id="touch-reload" type="button" data-touch-action="reload">装填</button>
      </div>
      <div class="touch-equipment" role="group" aria-label="武器と視点">
        <button id="touch-primary" type="button" data-touch-action="primary" aria-label="主武器に切り替え" aria-pressed="false">1 主武器</button>
        <button id="touch-secondary" type="button" data-touch-action="secondary" aria-label="副武器に切り替え" aria-pressed="false">2 副武器</button>
        <button id="touch-knife" type="button" data-touch-action="knife" aria-label="ナイフに切り替え" aria-pressed="false">3 ナイフ</button>
        <button id="touch-view" type="button" data-touch-action="view" aria-label="一人称と三人称の視点切り替え" aria-pressed="false">視点</button>
      </div>`;
    host.append(this.root);
    this.root.addEventListener('pointerdown', this.pointerDown);
    this.root.addEventListener('pointermove', this.pointerMove);
    this.root.addEventListener('pointerup', this.pointerUp);
    this.root.addEventListener('pointercancel', this.pointerCancel);
    this.root.addEventListener('lostpointercapture', this.lostCapture);
    this.root.addEventListener('click', this.click);
    this.root.addEventListener('contextmenu', this.contextMenu);
    this.coarse.addEventListener('change', this.mediaChanged);
    this.fine.addEventListener('change', this.mediaChanged);
  }

  get enabled() { return this.coarse.matches && !this.fine.matches; }
  get active() { return this.running && this.enabled && !this.disposed; }
  get input(): MoveInput { return { forward: this.forward, right: this.right, sprint: this.sprint, jump: this.jumping }; }

  setActive(active: boolean) {
    const next = active && this.enabled && !this.disposed;
    if (!next) this.reset();
    this.running = next;
    this.root.hidden = !next;
  }

  private mediaChanged = () => {
    this.setActive(false);
    this.hooks.modeChanged();
  };

  private pointerDown = (event: PointerEvent) => {
    if (!this.active || (event.pointerType !== 'touch' && event.pointerType !== 'pen')) return;
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-touch-input],[data-touch-action]') : null;
    if (!target) return;
    if (target instanceof HTMLButtonElement && target.disabled) return;
    const kind = target.dataset.touchAction ? 'action' : target.dataset.touchInput as HeldInput;
    event.preventDefault();
    if (kind !== 'action' && [...this.contacts.values()].some(contact => contact.kind === kind)) return;
    this.contacts.set(event.pointerId, { kind, element: target, x: event.clientX, y: event.clientY });
    try { target.setPointerCapture(event.pointerId); } catch { /* Cancel/release still clears input if capture is unavailable. */ }
    if (kind === 'action') {
      // Browsers suppress click for a second finger while the first thumb is held.
      // Run the action on its own pointer and ignore its later compatibility click.
      this.suppressedClicks.set(target, performance.now() + 1000);
      this.activateAction(target);
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
    contact.x = event.clientX;
    contact.y = event.clientY;
  };

  private moveStick(element: HTMLElement, x: number, y: number) {
    const rect = element.getBoundingClientRect();
    const radius = Math.max(1, Math.min(rect.width, rect.height) * .32);
    const dx = (x - rect.left - rect.width / 2) / radius;
    const dy = (y - rect.top - rect.height / 2) / radius;
    const length = Math.hypot(dx, dy);
    const magnitude = Math.min(1, Math.max(0, (length - .12) / .88));
    this.right = length ? dx / length * magnitude : 0;
    this.forward = length ? -dy / length * magnitude : 0;
    element.style.setProperty('--stick-x', `${this.right * radius}px`);
    element.style.setProperty('--stick-y', `${-this.forward * radius}px`);
  }

  private pointerUp = (event: PointerEvent) => {
    const contact = this.contacts.get(event.pointerId);
    if (!contact) return;
    event.preventDefault();
    this.contacts.delete(event.pointerId);
    if (contact.kind === 'move') this.resetStick();
    if (contact.kind === 'fire') { this.firing = false; contact.element.setAttribute('aria-pressed', 'false'); this.hooks.fire(false); }
    if (contact.kind === 'jump') { this.jumping = false; contact.element.setAttribute('aria-pressed', 'false'); this.hooks.jump(false); }
    if (contact.kind === 'action') this.suppressedClicks.set(contact.element, performance.now() + 1000);
    this.release(contact, event.pointerId);
  };

  private pointerCancel = (event: PointerEvent) => { if (this.contacts.has(event.pointerId)) this.reset(); };
  private lostCapture = (event: PointerEvent) => { if (this.contacts.has(event.pointerId)) this.reset(); };
  private release(contact: Contact, id: number) {
    try { if (contact.element.hasPointerCapture(id)) contact.element.releasePointerCapture(id); } catch { /* The browser may already have cancelled this contact. */ }
  }

  private click = (event: MouseEvent) => {
    if (!this.active) return;
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-touch-action]') : null;
    if (!target) return;
    event.preventDefault();
    if (event.detail > 0 && performance.now() < (this.suppressedClicks.get(target) ?? 0)) return;
    this.activateAction(target);
  };

  private activateAction(target: HTMLElement) {
    switch (target.dataset.touchAction) {
      case 'sprint': this.sprint = !this.sprint; target.setAttribute('aria-pressed', String(this.sprint)); break;
      case 'aim': this.aiming = !this.aiming; this.hooks.aim(this.aiming); break;
      case 'reload': this.hooks.reload(); break;
      case 'primary': case 'secondary': case 'knife': this.hooks.select(target.dataset.touchAction); break;
      case 'view': this.hooks.view(); break;
      case 'interact': this.hooks.interact(); break;
      case 'pause': this.hooks.pause(); break;
    }
  }

  private contextMenu = (event: Event) => { if (this.active) event.preventDefault(); };
  private resetStick() {
    this.forward = this.right = 0;
    const stick = this.button('move');
    stick.style.setProperty('--stick-x', '0px');
    stick.style.setProperty('--stick-y', '0px');
  }

  /** Called before pausing, rotating or changing input devices; no old contact survives. */
  reset() {
    const contacts = [...this.contacts];
    this.contacts.clear();
    for (const [id, contact] of contacts) this.release(contact, id);
    this.resetStick();
    this.sprint = this.jumping = this.aiming = this.firing = false;
    for (const id of ['sprint', 'aim', 'fire', 'jump']) this.button(id).setAttribute('aria-pressed', 'false');
    this.hooks.reset();
  }

  updateStatus(status: { interact: boolean; aiming: boolean; thirdPerson: boolean; weapon: EquippedWeapon; primary: EquippedWeapon; secondary: EquippedWeapon }) {
    this.aiming = status.aiming;
    this.button('aim').setAttribute('aria-pressed', String(status.aiming));
    this.button('aim').disabled = status.weapon === 'knife';
    this.button('reload').disabled = status.weapon === 'knife';
    this.button('interact').hidden = !status.interact;
    this.button('view').setAttribute('aria-pressed', String(status.thirdPerson));
    this.button('view').textContent = status.thirdPerson ? '三人称' : '一人称';
    this.button('fire').textContent = status.weapon === 'knife' ? '近接' : '射撃';
    for (const slot of ['primary', 'secondary', 'knife'] as const) this.button(slot).setAttribute('aria-pressed', String(status.weapon === (slot === 'knife' ? 'knife' : status[slot])));
  }

  snapshot() {
    return { enabled: this.enabled, active: this.active, ...this.input, aiming: this.aiming, firing: this.firing,
      pointers: [...this.contacts].map(([id, contact]) => ({ id, kind: contact.kind })) };
  }

  dispose() {
    this.setActive(false);
    this.disposed = true;
    this.coarse.removeEventListener('change', this.mediaChanged);
    this.fine.removeEventListener('change', this.mediaChanged);
    this.root.removeEventListener('pointerdown', this.pointerDown);
    this.root.removeEventListener('pointermove', this.pointerMove);
    this.root.removeEventListener('pointerup', this.pointerUp);
    this.root.removeEventListener('pointercancel', this.pointerCancel);
    this.root.removeEventListener('lostpointercapture', this.lostCapture);
    this.root.removeEventListener('click', this.click);
    this.root.removeEventListener('contextmenu', this.contextMenu);
    this.suppressedClicks.clear();
    this.root.remove();
  }
}
