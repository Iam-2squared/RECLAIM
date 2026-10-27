import { test, expect } from './browser-fixtures.mjs';

const mission = page => page.evaluate(() => window.__RECLAIM__.missionSnapshot());
const state = page => page.evaluate(() => window.__RECLAIM__.snapshot());

// Chromium exposes genuine simultaneous touch input through CDP. Playwright's
// WebKit touchscreen only supports taps, so its drag/cancel checks dispatch the
// same PointerEvents at the actual DOM targets; navigation remains native taps.
async function fingers(page, browserName) {
  const session = browserName === 'chromium' ? await page.context().newCDPSession(page) : null;
  const active = new Map();
  const dispatch = async (type, id, selector, x, y) => {
    if (session) {
      await session.send('Input.dispatchTouchEvent', {
        type,
        // For touchEnd CDP identifies the finger being ended; passing the
        // remaining set releases another thumb during simultaneous gestures.
        touchPoints: type === 'touchEnd' ? [{ id, x, y, radiusX: 3, radiusY: 3, force: 1 }]
          : [...active].map(([pointer, point]) => ({ id: pointer, x: point.x, y: point.y, radiusX: 3, radiusY: 3, force: 1 })),
      });
    } else {
      await page.locator(selector).dispatchEvent(type === 'touchStart' ? 'pointerdown' : type === 'touchMove' ? 'pointermove' : type === 'touchCancel' ? 'pointercancel' : 'pointerup', {
        pointerId: id, pointerType: 'touch', clientX: x, clientY: y,
        buttons: type === 'touchEnd' || type === 'touchCancel' ? 0 : 1,
        button: 0, isPrimary: id === 1, bubbles: true, cancelable: true,
      });
    }
  };
  return {
    async down(id, selector) {
      const box = await page.locator(selector).boundingBox();
      expect(box, `${selector} is reachable`).not.toBeNull();
      const point = { selector, x: box.x + box.width / 2, y: box.y + box.height / 2 };
      active.set(id, point);
      await dispatch('touchStart', id, selector, point.x, point.y);
      return point;
    },
    async move(id, dx, dy) {
      const point = active.get(id);
      if (!point) throw new Error(`finger ${id} is not down`);
      point.x += dx; point.y += dy;
      await dispatch('touchMove', id, point.selector, point.x, point.y);
    },
    async up(id) {
      const point = active.get(id);
      if (!point) return;
      active.delete(id);
      await dispatch('touchEnd', id, point.selector, point.x, point.y);
    },
    async cancel() {
      if (session) {
        active.clear();
        await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
      } else {
        for (const [id, point] of active) await dispatch('touchCancel', id, point.selector, point.x, point.y);
        active.clear();
      }
    },
    async release() {
      for (const id of [...active.keys()]) await this.up(id);
    },
    async close() { await this.release(); await session?.detach(); },
  };
}

async function start(page, browserName, viewport) {
  await page.addInitScript(() => localStorage.setItem('reclaim.display.v1', JSON.stringify({ quality: 'low', reducedMotion: true })));
  const response = await page.goto('/');
  expect(response?.ok()).toBe(true);
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  await page.locator('#home-button').tap();
  await expect.poll(async () => (await state(page)).lobby.status, { timeout: 30000 }).toBe('ready');
  expect((await state(page)).lobby.modelCount).toBe(1);
  expect((await state(page)).lobby.models).toHaveLength(1);
  await page.locator('#start-button').tap();
  // Opening the briefing must preserve the existing campaign until launch.
  expect((await state(page)).campaign.checkpoint).toBeNull();
  await page.locator('#mission-launch').tap();
  // The real authored map is streamed and decoded after the explicit launch;
  // its loading card is expected to outlast a five-second UI assertion on CPU WebGL.
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'mission', { timeout: 60000 });
  await expect(page.locator('body')).toHaveAttribute('data-renderer', 'webgl');
  await expect(page.locator('#mission-story')).toBeVisible();
  if (browserName === 'chromium' && viewport.width > viewport.height) {
    // A short real viewport makes the existing story overflow. A native swipe
    // must scroll it; changing scrollTop would miss ancestor touch-action bugs.
    await page.setViewportSize({ width: 667, height: 240 });
    const card = page.locator('#mission-story');
    await expect.poll(() => card.evaluate(node => node.scrollHeight - node.clientHeight)).toBeGreaterThan(0);
    const scroll = await fingers(page, browserName);
    try {
      await scroll.down(7, '#mission-story');
      for (let step = 0; step < 6; step++) await scroll.move(7, 0, -12);
      await scroll.up(7);
      await expect.poll(() => card.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
    } finally { await scroll.close(); }
    await page.setViewportSize(viewport);
  }
  await page.locator('#mission-continue').tap();
  await page.locator('#mission-lock').tap();
  await expect.poll(async () => (await mission(page))?.inputMode).toBe('touch');
  // Safari may omit the Pointer Lock API entirely; absent and null both mean
  // no pointer lock, and touch exploration must work in either case.
  expect(await page.evaluate(() => Boolean(document.pointerLockElement))).toBe(false);
  // The authored spawn is beside the radio: complete the actual opening with
  // the touch interaction, without fabricating campaign state or coordinates.
  await page.locator('#touch-interact').tap();
  await expect(page.locator('#mission-story-title')).toContainText('AIが暴走');
  await page.locator('#mission-continue').tap();
  await expect(page.locator('#mission-story-title')).toContainText('東京の親友');
  await page.locator('#mission-continue').tap();
  await page.locator('#mission-lock').tap();
  await expect.poll(async () => (await mission(page)).inputMode).toBe('touch');
}

async function reachableControls(page) {
  const layout = await page.locator('#mission-touch-controls button').evaluateAll(nodes => nodes
    .filter(node => node.getClientRects().length)
    .map(node => {
      const r = node.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { id: node.id, x: r.x, y: r.y, width: r.width, height: r.height, reachable: node === hit || node.contains(hit) };
    }));
  expect(layout.map(control => control.id).sort(), 'normal shooter HUD keeps only the six essential touch targets').toEqual(['touch-move', 'touch-fire', 'touch-aim', 'touch-jump', 'touch-weapon', 'touch-pause'].sort());
  const { width, height, scrollWidth } = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth }));
  expect(scrollWidth).toBeLessThanOrEqual(width + 1);
  for (const r of layout) {
    expect(r.width, `${r.id} width`).toBeGreaterThanOrEqual(44);
    expect(r.height, `${r.id} height`).toBeGreaterThanOrEqual(44);
    expect(r.x, `${r.id} left`).toBeGreaterThanOrEqual(0);
    expect(r.y, `${r.id} top`).toBeGreaterThanOrEqual(0);
    expect(r.x + r.width, `${r.id} right`).toBeLessThanOrEqual(width + 1);
    expect(r.y + r.height, `${r.id} bottom`).toBeLessThanOrEqual(height + 1);
    expect(r.reachable, `${r.id} receives touch at its center`).toBe(true);
  }
  const overlaps = await page.evaluate(() => {
    const boss = document.querySelector('.mission-boss-health');
    if (!boss?.getClientRects().length) return [];
    const a = boss.getBoundingClientRect();
    return [...document.querySelectorAll('.player-vitals,.mission-status,#mission-touch-controls button')]
      .filter(node => node.getClientRects().length)
      .filter(node => {
        const b = node.getBoundingClientRect();
        return Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1
          && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
      }).map(node => node.id || node.className);
  });
  expect(overlaps, 'boss health leaves player vitals, mission status and touch targets readable').toEqual([]);
}

for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
  test(`touch mission ${viewport.width}x${viewport.height}: story, multi-touch combat and clean resume`, async ({ page, browserName }, info) => {
    await page.setViewportSize(viewport);
    const errors = [], homeRequests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (/\/home-models\/.*\.glb(?:\?.*)?$/.test(request.url())) homeRequests.push(request.url()); });
    await start(page, browserName, viewport);
    expect(homeRequests).toHaveLength(1);
    await expect(page.locator('#lobby-stage canvas')).toHaveCount(0);
    const inactiveLobby = (await state(page)).lobby;
    expect(inactiveLobby.active).toBe(false);
    expect(inactiveLobby.modelCount).toBe(0);
    expect(inactiveLobby.resources.geometries).toBe(0);
    expect(inactiveLobby.resources.textures).toBe(0);
    await reachableControls(page);
    const input = await fingers(page, browserName);
    try {
      const before = await mission(page);
      await input.down(1, '#touch-move');
      await input.move(1, 0, -40);
      await expect.poll(async () => (await mission(page)).player.distance, { timeout: 15000 }).toBeGreaterThan(before.player.distance + .2);
      await expect.poll(async () => (await mission(page)).storyStep, { timeout: 20000 }).toBe(4);
      await input.up(1);

      // Actions must respond to a second finger while the joystick stays held;
      // mobile browsers suppress compatibility clicks during this gesture.
      await input.down(1, '#touch-move');
      await input.move(1, 0, -28);
      await input.down(6, '#touch-aim');
      await input.up(6);
      expect((await mission(page)).weapon.aiming).toBe(true);
      await input.down(6, '#touch-aim');
      await input.up(6);
      expect((await mission(page)).weapon.aiming).toBe(false);
      // Pushing beyond the stick's outer ring runs without a separate button.
      const stick = await page.locator('#touch-move').boundingBox();
      await input.move(1, 0, -stick.height * .3);
      await expect.poll(async () => (await mission(page)).touch.sprint).toBe(true);
      await input.move(1, 0, stick.height * .3);
      await expect.poll(async () => (await mission(page)).touch.sprint).toBe(false);
      const lookBefore = (await mission(page)).player;
      await input.down(2, '#touch-look');
      await input.move(2, 48, -16);
      await expect.poll(async () => Math.abs((await mission(page)).player.yaw - lookBefore.yaw)).toBeGreaterThan(.02);
      await expect.poll(async () => Math.abs((await mission(page)).player.pitch - lookBefore.pitch)).toBeGreaterThan(.01);

      // Genuine independent fingers keep the joystick, look surface and trigger
      // active together. Actual shots/ammunition verify the combat integration.
      const fireBefore = await mission(page);
      await input.down(3, '#touch-fire');
      await expect.poll(async () => (await mission(page)).shots, { timeout: 15000 }).toBeGreaterThanOrEqual(fireBefore.shots + 2);
      await input.move(2, -20, 8);
      expect((await mission(page)).weapon.ammo).toBeLessThan(fireBefore.weapon.ammo);
      expect((await mission(page)).player.distance).toBeGreaterThan(fireBefore.player.distance);
      await input.release();

      await page.evaluate(() => {
        const log = { active: true, air: false, landed: false };
        window.__mobileJump = log;
        const observe = () => {
          if (!log.active) return;
          const p = window.__RECLAIM__.missionSnapshot()?.player;
          if (p && !p.grounded) log.air = true;
          if (p && log.air && p.grounded) log.landed = true;
          requestAnimationFrame(observe);
        };
        requestAnimationFrame(observe);
      });
      await input.down(4, '#touch-jump');
      await expect.poll(() => page.evaluate(() => window.__mobileJump.air), { timeout: 10000 }).toBe(true);
      await input.up(4);
      await expect.poll(() => page.evaluate(() => window.__mobileJump.landed), { timeout: 10000 }).toBe(true);
      await page.evaluate(() => { window.__mobileJump.active = false; });

      // One compact weapon/ammo button replaces three always-visible slots.
      await page.locator('#touch-weapon').tap();
      await expect.poll(async () => (await mission(page)).weapon.kind).toBe('sniper');
      await expect.poll(async () => (await mission(page)).actors.weapons.includes('sniper'), { timeout: 20000 }).toBe(true);
      await page.locator('#touch-aim').tap();
      await expect(page.locator('#mission-scope')).toBeVisible();
      await page.locator('#touch-aim').tap();
      await expect(page.locator('#mission-scope')).toBeHidden();
      const equipment = async selector => {
        const heldWeapon = (await mission(page)).weapon.kind;
        await input.down(8, '#touch-weapon');
        await expect(page.locator('#touch-equipment-panel')).toBeVisible();
        await input.up(8);
        // Observe after the browser has dispatched the native compatibility
        // click too, rather than sampling between pointerup and that click.
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await expect(page.locator('#touch-equipment-panel'), 'releasing the opening thumb must not click an item underneath it').toBeVisible();
        expect((await mission(page)).weapon.kind).toBe(heldWeapon);
        await page.locator(selector).tap();
        await expect(page.locator('#touch-equipment-panel')).toBeHidden();
      };
      await equipment('#touch-view');
      expect((await mission(page)).thirdPerson).toBe(true);
      await expect.poll(async () => { const actors = (await mission(page)).actors; return actors.models.includes(actors.character); }, { timeout: 20000 }).toBe(true);
      await equipment('#touch-view');
      await equipment('#touch-knife');
      expect((await mission(page)).weapon.kind).toBe('knife');
      await equipment('#touch-primary');
      expect((await mission(page)).weapon.kind).toBe('assault');
      await equipment('#touch-reload');
      await expect.poll(async () => (await mission(page)).weapon.reloading).toBe(true);
      await expect.poll(async () => (await mission(page)).weapon.ammo, { timeout: 20000 }).toBe(24);
      // Empty magazines reload automatically so the normal HUD needs no extra
      // reload button. Actual rounds/shots must be spent before it starts.
      const autoReloadBefore = await mission(page);
      await input.down(3, '#touch-fire');
      await expect.poll(async () => (await mission(page)).weapon.reloading, { timeout: 20000 }).toBe(true);
      await input.up(3);
      expect((await mission(page)).shots).toBeGreaterThanOrEqual(autoReloadBefore.shots + 24);
      await expect.poll(async () => (await mission(page)).weapon.ammo, { timeout: 20000 }).toBe(24);

      // OS interruption cancels both walking and firing, even with independent
      // fingers held. Verify the resumed game itself stays idle afterwards.
      await input.down(1, '#touch-move');
      await input.move(1, 0, -35);
      await input.down(3, '#touch-fire');
      await input.cancel();
      const canceled = await mission(page);
      await expect.poll(async () => (await mission(page)).elapsed, { timeout: 10000 }).toBeGreaterThan(canceled.elapsed + .25);
      const afterCancel = await mission(page);
      expect(afterCancel.player.x).toBeCloseTo(canceled.player.x, 6);
      expect(afterCancel.player.z).toBeCloseTo(canceled.player.z, 6);
      expect(afterCancel.shots).toBe(canceled.shots);

      await input.down(1, '#touch-move');
      await input.move(1, 0, -35);
      await input.down(3, '#touch-fire');
      await input.down(5, '#touch-pause');
      await input.up(5);
      await input.release();
      await expect(page.locator('#mission-lock')).toBeVisible();
      expect((await mission(page)).paused).toBe(true);
      await expect(page.locator('#mission-touch-controls')).toBeHidden();
      await page.locator('#mission-lock').tap();
      const resumed = await mission(page);
      await expect.poll(async () => (await mission(page)).elapsed, { timeout: 10000 }).toBeGreaterThan(resumed.elapsed + .25);
      const idle = await mission(page);
      expect(idle.player.x).toBeCloseTo(resumed.player.x, 6);
      expect(idle.player.z).toBeCloseTo(resumed.player.z, 6);
      expect(idle.shots).toBe(resumed.shots);

      await reachableControls(page);
      await page.screenshot({ path: info.outputPath('touch-gameplay.png') });
      await info.attach('touch-input-method', { body: Buffer.from(browserName === 'chromium' ? 'Native simultaneous touch via CDP; software WebGL, not physical Android.' : 'Native navigation taps; synthetic PointerEvents for simultaneous gestures, actions and cancel; software WebGL, not physical iPhone.'), contentType: 'text/plain' });
      await page.locator('#touch-pause').tap();
      await page.locator('#mission-home').tap();
      await expect(page.locator('body')).toHaveAttribute('data-screen', 'home');
      expect(await mission(page)).toBeNull();
      await expect(page.locator('#mission-touch-controls')).toHaveCount(0);
      await expect.poll(async () => (await state(page)).lobby.modelCount).toBe(1);
      await expect(page.locator('#lobby-stage canvas')).toHaveCount(1);
      expect(homeRequests, 'returning HOME reuses its decoded survivor instead of downloading it again').toHaveLength(1);
      await page.locator('#start-button').tap();
      await page.locator('#mission-resume').tap();
      await page.locator('#mission-lock').tap();
      await expect.poll(async () => (await mission(page)).inputMode).toBe('touch');
      await expect(page.locator('#mission-touch-controls')).toHaveCount(1);
      expect((await mission(page)).weapon.triggerHeld).toBe(false);
      expect(errors).toEqual([]);
    } finally {
      await input.close().catch(() => {});
      await page.evaluate(() => { if (window.__mobileJump) window.__mobileJump.active = false; }).catch(() => {});
    }
  });
}
