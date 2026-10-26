import { test, expect } from './browser-fixtures.mjs';
import { writeFile } from 'node:fs/promises';

const views = [[320, 568], [360, 800], [375, 667], [390, 844], [430, 932], [667, 375], [844, 390], [932, 430], [768, 1024], [1024, 768], [959, 441], [960, 441], [960, 440], [959, 440]];
const panels = ['マップ', 'キャラ設定', '武器', '今のボス状況', 'ランキング'];
const snapshot = page => page.evaluate(() => window.__RECLAIM__.snapshot());
const presentation = page => page.evaluate(() => {
  const coarse = matchMedia('(any-pointer: coarse)').matches;
  const fine = matchMedia('(any-pointer: fine)').matches;
  const touchOnly = coarse && !fine;
  const compactViewport = !matchMedia('(min-width: 960px) and (min-height: 441px)').matches;
  return { coarse, fine, touchOnly, compactViewport, mobile: compactViewport || touchOnly };
});

async function ready(page) {
  const response = await page.goto('/');
  expect(response?.ok()).toBe(true);
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#home-button')).toBeEnabled();
  await expect(page.locator('#boot-notice')).toBeHidden();
}
async function tap(page, selector) {
  const item = typeof selector === 'string' ? page.locator(selector) : selector;
  await item.scrollIntoViewIfNeeded();
  await item.tap();
}
async function home(page) {
  await ready(page);
  await tap(page, '#home-button');
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'home');
}
async function openPanel(page, name) {
  if (await page.locator('#menu-toggle').isVisible()) await tap(page, '#menu-toggle');
  await tap(page, page.locator('#nav-items').getByRole('button', { name, exact: true }));
  await expect(page.locator('#home-panel')).toBeVisible();
}
async function noOverflow(page) {
  const widths = await page.evaluate(() => ({ width: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  expect(widths.document).toBeLessThanOrEqual(widths.width + 1);
  expect(widths.body).toBeLessThanOrEqual(widths.width + 1);
}
async function targets(page, selectors) {
  for (const selector of selectors) {
    const node = page.locator(selector);
    if (!await node.isVisible()) continue;
    const r = await node.boundingBox();
    expect(r?.width, `${selector} width`).toBeGreaterThanOrEqual(44);
    expect(r?.height, `${selector} height`).toBeGreaterThanOrEqual(44);
  }
}
async function capture(page, info, name) {
  const input = await presentation(page);
  // Do not exempt wide tablets by trusting the app's mode: that was the bug.
  if (input.mobile) {
    const controls = await page.locator('button,input,select,summary').evaluateAll(nodes => nodes
      .filter(n => n.getClientRects().length && getComputedStyle(n).visibility !== 'hidden')
      .map(n => { const r=n.getBoundingClientRect(); return { id:n.id||n.getAttribute('aria-label')||n.textContent.trim().slice(0,60),width:r.width,height:r.height }; }));
    for (const control of controls) {
      expect(control.width, `${name}: ${control.id} width`).toBeGreaterThanOrEqual(44);
      expect(control.height, `${name}: ${control.id} height`).toBeGreaterThanOrEqual(44);
    }
  }
  const path = info.outputPath(`${name}.png`);
  await page.screenshot({ path });
  await info.attach(name, { path, contentType: 'image/png' });
}

for (const view of views) {
  const [width, height] = view;
  test(`2D touch viewport ${width}x${height}: title, HOME, five panels and safe briefing`, async ({ page }, info) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width, height });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await ready(page);
    const input = await presentation(page);
    expect(input.touchOnly, 'all 14 device-emulation viewports exercise coarse-only touch targets').toBe(true);
    expect((await snapshot(page)).menus.mode).toBe('atmospheric-title-2d');
    await page.locator('.title-atmosphere img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
    await expect(page.locator('#continue-button')).toBeDisabled();
    await noOverflow(page);
    await targets(page, ['#home-button', '#continue-button', '#title-settings', '#reference-extras', '#sound-button', '#reference-motion']);
    await capture(page, info, 'title');
    await tap(page, '#home-button');
    await expect(page.locator('body')).toHaveAttribute('data-screen', 'home');
    expect((await snapshot(page)).menus.mode).toBe(input.mobile ? 'mobile-reference-2d' : 'reference-2d');
    await noOverflow(page);
    await targets(page, ['#menu-toggle', '#solo-button', '#squad-button', '#start-button', '#reference-destination', '#reference-equipment', '#reference-mail']);
    await capture(page, info, 'home');
    const campaign = (await snapshot(page)).campaign;
    for (const [index, name] of panels.entries()) {
      await openPanel(page, name);
      await noOverflow(page);
      const r = await page.locator('#home-panel').boundingBox();
      expect(r.x).toBeGreaterThanOrEqual(-1);
      expect(r.y).toBeGreaterThanOrEqual(-1);
      expect(r.x + r.width).toBeLessThanOrEqual(width + 1);
      expect(r.y + r.height).toBeLessThanOrEqual(height + 1);
      if (input.mobile) {
        await targets(page, ['#panel-close', '#apply-character', '#cancel-character', '#reset-character', '#weapon-done', '#campaign-reset']);
        await expect(page.locator('#home-panel')).toHaveAttribute('aria-modal', 'true');
      }
      if (name === 'マップ') {
        await expect(page.locator('#region-select option')).toHaveCount(18);
        await page.locator('#region-select').selectOption('17');
        await expect(page.locator('#region-name')).toHaveText('???');
      }
      if (name === 'キャラ設定' || name === '武器') await expect(page.locator('#panel-content')).toContainText('絵は固定');
      if (name === '今のボス状況') await expect(page.locator('.unknown-hp strong')).toHaveText('—');
      if (name === 'ランキング') await expect(page.locator('.empty-records')).toContainText('未接続');
      await capture(page, info, `panel-${index + 1}`);
      await page.locator('#panel-content').evaluate(n => { n.scrollTop = n.scrollHeight; });
      expect(await page.locator('#panel-content').evaluate(n => n.scrollHeight - n.clientHeight - n.scrollTop)).toBeLessThanOrEqual(1);
      await tap(page, '#panel-close');
      await expect(page.locator('#home-panel')).toBeHidden();
    }
    expect((await snapshot(page)).campaign).toEqual(campaign);
    await tap(page, '#start-button');
    await capture(page, info, 'briefing');
    if (input.mobile) {
      await expect(page.locator('#home-panel')).toContainText(/PC|キーボード|マウス/);
      await expect(page.locator('#mobile-mission-notice')).toBeVisible();
      if (await page.locator('#mission-launch').isEnabled()) await tap(page, '#mission-launch');
      await expect(page.locator('body')).toHaveAttribute('data-screen', 'home');
      expect((await snapshot(page)).mission).toBeNull();
      expect((await snapshot(page)).campaign).toEqual(campaign);
      if (await page.locator('#reference-dialog').isVisible()) await tap(page, '#reference-dialog .close-button');
    }
    await tap(page, '#briefing-back');
    await expect(page.locator('#home-panel')).toBeHidden();
    expect(errors).toEqual([]);
    const path = info.outputPath('state.json');
    await writeFile(path, JSON.stringify({ viewport: view, input, physicalDevice: false, browser: info.project.name, snapshot: await snapshot(page) }, null, 2));
    await info.attach('state', { path, contentType: 'application/json' });
  });
}

test('touch START, settings, extras, mail and local formation have real state changes without WebGL frames', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const requests = [], sockets = [];
  page.on('request', r => requests.push(r.url()));
  page.on('websocket', s => sockets.push(s.url()));
  await ready(page);
  await expect(page.locator('#sound-button')).toHaveAttribute('aria-pressed', 'false');
  await tap(page, '#title-settings');
  await page.locator('#quality-select').selectOption('low');
  await page.locator('#motion-toggle').check();
  await capture(page, info, 'settings');
  await expect(page.locator('#mobile-settings-sound')).toHaveAttribute('aria-pressed', 'false');
  await tap(page, '#mobile-settings-sound');
  await expect(page.locator('#mobile-settings-sound')).toHaveAttribute('aria-pressed', 'true');
  await tap(page, '#mobile-settings-sound');
  await expect(page.locator('#mobile-settings-sound')).toHaveAttribute('aria-pressed', 'false');
  await tap(page, '#settings-dialog .close-button');
  expect((await snapshot(page)).reducedMotion).toBe(true);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('reclaim.display.v1')).quality)).toBe('low');
  await tap(page, '#reference-extras');
  await expect(page.locator('#reference-dialog')).toBeVisible();
  await targets(page, ['#reference-dialog .secondary-action']);
  await capture(page, info, 'extras');
  await tap(page, '#reference-dialog .close-button');
  await tap(page, '#home-button');
  const initial = await snapshot(page);
  await tap(page, '#squad-button');
  expect((await snapshot(page)).squadPreview).toBe(true);
  await expect(page.locator('#squad-note')).toContainText('未接続');
  await expect(page.locator('.sample-label:visible')).toHaveCount(3);
  await tap(page, '#solo-button');
  expect((await snapshot(page)).squadPreview).toBe(false);
  await tap(page, '#reference-mail');
  await expect(page.locator('#reference-dialog')).toContainText('未接続');
  await capture(page, info, 'mail');
  await tap(page, '#reference-dialog .close-button');
  const before = await snapshot(page);
  await page.waitForTimeout(250);
  expect((await snapshot(page)).renderClock.rendererFrames).toBe(before.renderClock.rendererFrames);
  expect((await snapshot(page)).campaign).toEqual(initial.campaign);
  expect(sockets).toEqual([]);
  expect(requests.filter(url => /^https?:/.test(url) && !url.startsWith('http://127.0.0.1:4175/'))).toEqual([]);
});

test('character apply/cancel/reset draft and weapon swap persist; map/reset cancel do not change campaign', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await home(page);
  const campaign = (await snapshot(page)).campaign;
  await openPanel(page, 'キャラ設定');
  await page.locator('#preview-name').fill('北の旅人');
  await tap(page, '[data-palette="slate"]');
  await tap(page, '#apply-character');
  await expect(page.locator('#survivor-name')).toHaveText('北の旅人');
  await openPanel(page, 'キャラ設定');
  await page.locator('#preview-name').fill('取り消す名前');
  await tap(page, '[data-palette="clay"]');
  await tap(page, '#reset-character');
  await expect(page.locator('#preview-name')).toHaveValue('SURVIVOR');
  await tap(page, '#cancel-character');
  expect((await snapshot(page)).home.preview.appearance).toEqual({ name: '北の旅人', palette: 'slate' });
  await openPanel(page, '武器');
  await tap(page, '[data-slot="primary"][data-gun="sniper"]');
  expect((await snapshot(page)).home.preview.primary).toBe('sniper');
  expect((await snapshot(page)).home.preview.secondary).toBe('assault');
  await tap(page, '#hold-secondary');
  await tap(page, '#weapon-done');
  await openPanel(page, 'マップ');
  for (let i = 0; i < 18; i++) {
    await page.locator('#region-select').selectOption(String(i));
    await expect(page.locator('#region-name')).toHaveText(i === 0 ? '知床' : '???');
  }
  await tap(page, '#campaign-reset');
  await expect(page.locator('#campaign-reset-confirm')).toBeVisible();
  await tap(page, '#campaign-reset-no');
  await expect(page.locator('#campaign-reset-confirm')).toBeHidden();
  await tap(page, '#panel-close');
  expect((await snapshot(page)).campaign).toEqual(campaign);
  await page.reload();
  await tap(page, '#home-button');
  expect((await snapshot(page)).home.preview).toMatchObject({ appearance: { name: '北の旅人', palette: 'slate' }, primary: 'sniper', secondary: 'assault', held: 'secondary' });
});

test('CONTINUE only accepts an actual consistent checkpoint and never starts or rewrites it on mobile', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem('reclaim.campaign.v1', JSON.stringify({ version: 1, introStep: 4, droneDefeated: false, completedAreaIds: [], passages: [], checkpoint: { areaId: 'shiretoko', x: 0, y: 0, z: 8, yaw: Math.PI, pitch: 0, hp: 80 }, traversal: { areaId: 'shiretoko', distance: 9.5, lastPosition: { x: 0, y: 0, z: 8 }, passedCheckpointIds: [] } })));
  await ready(page);
  const before = (await snapshot(page)).campaign;
  expect(before.checkpoint).not.toBeNull();
  await expect(page.locator('#continue-button')).toBeEnabled();
  await tap(page, '#continue-button');
  await expect(page.locator('#home-panel')).toBeVisible();
  await expect(page.locator('#mission-resume')).toBeVisible();
  await capture(page, info, 'continue-briefing');
  if (await page.locator('#mission-resume').isEnabled()) await tap(page, '#mission-resume');
  expect((await snapshot(page)).mission).toBeNull();
  expect((await snapshot(page)).campaign).toEqual(before);
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'home');
});

test('ten touch TITLE-HOME roundtrips preserve resources, campaign and idle renderer counter', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await ready(page);
  await tap(page, '#home-button');
  await tap(page, '#menu-toggle');
  await tap(page, '#back-title');
  const initial = await snapshot(page);
  for (let i = 0; i < 10; i++) {
    await tap(page, '#home-button');
    await tap(page, '#menu-toggle');
    await tap(page, '#back-title');
    await expect(page.locator('body')).toHaveAttribute('data-screen', 'title');
  }
  const after = await snapshot(page);
  expect(after.campaign).toEqual(initial.campaign);
  expect(after.mission).toBeNull();
  expect(after.renderClock.rendererFrames).toBe(initial.renderClock.rendererFrames);
  if (initial.render) {
    expect(after.render.geometries).toBe(initial.render.geometries);
    expect(after.render.textures).toBe(initial.render.textures);
  }
});

test('rotation, visual-height shrink, safe-area substitutes and keyboard focus keep panel actions reachable', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await home(page);
  for (const view of [{ width: 390, height: 844, top: 47, bottom: 34, left: 16, right: 16 }, { width: 844, height: 390, top: 16, bottom: 21, left: 47, right: 47 }]) {
    await page.setViewportSize({ width: view.width, height: view.height });
    await page.evaluate(v => {
      for (const key of ['top', 'bottom', 'left', 'right']) document.body.style.setProperty(`--home-safe-${key}`, `${v[key]}px`);
      document.body.style.setProperty('--sheet-safe-top', `${v.top}px`);
      document.body.style.setProperty('--sheet-safe-bottom', `${v.bottom}px`);
    }, view);
    await openPanel(page, 'キャラ設定');
    await page.locator('#preview-name').fill('長い日本語とEnglish');
    expect(await page.locator('#preview-name').evaluate(n => parseFloat(getComputedStyle(n).fontSize))).toBeGreaterThanOrEqual(16);
    const p = await page.locator('#home-panel').boundingBox();
    expect(p.y).toBeGreaterThanOrEqual(view.top - 1);
    expect(p.y + p.height).toBeLessThanOrEqual(view.height - view.bottom + 1);
    for (const selector of ['#apply-character', '#cancel-character', '#reset-character', '#panel-close']) {
      const r = await page.locator(selector).boundingBox();
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.y + r.height).toBeLessThanOrEqual(view.height + 1);
      expect(await page.locator(selector).evaluate(n => { const r = n.getBoundingClientRect(); return n.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); })).toBe(true);
    }
    await page.locator('#panel-close').focus();
    await page.keyboard.press('Shift+Tab');
    expect(await page.evaluate(() => document.querySelector('#home-panel').contains(document.activeElement))).toBe(true);
    await capture(page, info, `safe-${view.width}`);
    await tap(page, '#cancel-character');
    await expect(page.locator('#menu-toggle')).toBeFocused();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await openPanel(page, 'キャラ設定');
  await page.locator('#preview-name').focus();
  await page.setViewportSize({ width: 390, height: 404 });
  await targets(page, ['#apply-character', '#cancel-character', '#reset-character']);
  await expect(page.locator('#apply-character')).toBeInViewport({ ratio: 1 });
  await capture(page, info, 'simulated-keyboard-height');
  await tap(page, '#cancel-character');
});

test('WebGL plus Storage denial still allow touch menus and honestly expose failed persistence', async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) { return String(type).includes('webgl') ? null : get.call(this, type, ...args); };
    Storage.prototype.getItem = Storage.prototype.setItem = () => { throw new Error('Storage unavailable'); };
  });
  await home(page);
  await expect(page.locator('body')).toHaveAttribute('data-renderer', 'fallback');
  await openPanel(page, 'キャラ設定');
  await page.locator('#preview-name').fill('一時設定');
  await tap(page, '#apply-character');
  await expect(page.locator('#survivor-name')).toHaveText('一時設定');
  await expect(page.locator('#local-save-status')).toContainText('保存できません');
  await capture(page, info, 'storage-webgl-denied');
  await tap(page, '#settings-button');
  await page.locator('#quality-select').selectOption('low');
  await expect(page.locator('#settings-save-status')).toBeVisible();
  await expect(page.locator('#settings-save-status')).toContainText('保存できません');
  await capture(page, info, 'settings-save-denied');
  await tap(page, '#settings-dialog .close-button');
  await tap(page, '#start-button');
  await expect(page.locator('#mission-launch')).toBeDisabled();
  expect((await snapshot(page)).mission).toBeNull();
});

test('corrupt Storage and rejected Audio promise do not kill START or settings', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem('reclaim.display.v1', '{broken');
    localStorage.setItem('reclaim.home-preview.v1', '{broken');
    localStorage.setItem('reclaim.campaign.v1', '{broken');
    window.AudioContext = class { constructor() { throw new Error('Audio blocked'); } };
  });
  await ready(page);
  await tap(page, '#sound-button');
  await expect(page.locator('#sound-button')).toHaveAttribute('aria-pressed', 'false');
  await tap(page, '#title-settings');
  await expect(page.locator('#settings-dialog')).toBeVisible();
  await capture(page, info, 'corrupt-storage-audio-blocked');
  await tap(page, '#settings-dialog .close-button');
  await tap(page, '#home-button');
  await expect(page.locator('#survivor-name')).toHaveText('SURVIVOR');
  expect((await snapshot(page)).campaign.checkpoint).toBeNull();
});

test('missing background image does not create an invisible tap shield or remove menus', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    Object.defineProperty(HTMLImageElement.prototype, 'src', { ...descriptor, set(value) { descriptor.set.call(this, String(value).startsWith('data:image') ? 'data:image/jpeg;base64,broken' : value); } });
  });
  await ready(page);
  await expect(page.locator('#title-screen .title-atmosphere')).toHaveAttribute('data-art-error', 'true');
  expect((await snapshot(page)).menus.atmosphere.images.every(image => !image.loaded)).toBe(true);
  expect((await snapshot(page)).menus.images.every(image => !image.loaded)).toBe(true);
  await expect(page.locator('#live-region')).toContainText('背景画像を読み込めませんでした');
  await capture(page, info, 'missing-title-art');
  await tap(page, '#home-button');
  await openPanel(page, 'マップ');
  await expect(page.locator('#region-select option')).toHaveCount(18);
  await capture(page, info, 'missing-home-art-map');
  await tap(page, '#panel-close');
  await tap(page, '#start-button');
  expect((await snapshot(page)).mission).toBeNull();
  await expect(page.locator('#home-panel')).toBeVisible();
});
