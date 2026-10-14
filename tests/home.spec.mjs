import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fourFits } from './layout-helpers.mjs';
const ready = async page => { await page.goto('/'); await expect(page.locator('body')).toHaveAttribute('data-ready', 'true'); await page.locator('#home-button').click(); };
const open = async (page, name) => { if (await page.locator('#menu-toggle').isVisible()) await page.locator('#menu-toggle').click(); await page.getByRole('button', { name, exact: true }).click(); };
const snapshot = page => page.evaluate(() => window.__RECLAIM__.snapshot());
const visualReady = async page => { await expect(page.locator('body')).toHaveAttribute('data-renderer', 'webgl'); await expect.poll(async () => (await snapshot(page)).render?.formation.length).toBe(4); await page.waitForTimeout(180); };

test('appearance previews immediately, cancels, resets, safely applies Japanese and restores on reload', async ({ page }) => {
  await ready(page); await open(page, 'キャラ設定');
  await page.locator('#preview-name').fill('北の生存者'); await page.locator('[data-palette="slate"]').click();
  await expect(page.locator('#survivor-name')).toHaveText('北の生存者'); await expect(page.locator('body')).toHaveAttribute('data-palette', 'slate');
  await page.locator('#cancel-character').click(); await expect(page.locator('#survivor-name')).toHaveText('SURVIVOR');
  await open(page, 'キャラ設定'); await page.locator('#preview-name').fill('<b>北</b>'); await page.locator('#apply-character').click();
  await expect(page.locator('#survivor-name')).toHaveText('<b>北</b>'); await expect(page.locator('#survivor-name b')).toHaveCount(0);
  await page.reload(); await expect(page.locator('#title-screen')).toBeVisible(); await page.locator('#home-button').click();
  await expect(page.locator('#survivor-name')).toHaveText('<b>北</b>');
  await open(page, 'キャラ設定'); await page.locator('#reset-character').click(); await page.locator('#cancel-character').click();
  await expect(page.locator('#survivor-name')).toHaveText('<b>北</b>');
  await open(page, 'キャラ設定'); await page.locator('#preview-name').fill('   '); await page.locator('#apply-character').click();
  await expect(page.locator('#survivor-name')).toHaveText('SURVIVOR');
});
test('IME composition is not rewritten and leaving the appearance panel discards its draft', async ({ page }) => {
  await ready(page); await open(page, 'キャラ設定');
  const input = page.locator('#preview-name');
  await input.dispatchEvent('compositionstart'); await input.fill('しれとこ'); await expect(input).toHaveValue('しれとこ');
  await input.fill('知床'); await input.dispatchEvent('compositionend'); await expect(input).toHaveValue('知床');
  await page.getByRole('button', { name: '武器', exact: true }).click();
  await expect(page.locator('#survivor-name')).toHaveText('SURVIVOR');
});
test('weapon slots swap duplicates, change the held gun and persist without granting inventory', async ({ page }) => {
  await ready(page); await open(page, '武器');
  await page.locator('[data-slot="primary"][data-gun="sniper"]').click();
  await expect(page.locator('[data-slot="secondary"][data-gun="assault"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('body')).toHaveAttribute('data-held-weapon', 'sniper');
  await page.locator('#hold-secondary').click(); await expect(page.locator('body')).toHaveAttribute('data-held-weapon', 'assault');
  await page.locator('[data-slot="secondary"][data-gun="rifle"]').click(); await expect(page.locator('#held-weapon')).toHaveText('小銃 / 日本刀');
  await page.keyboard.press('Escape'); await page.reload(); await page.locator('#home-button').click();
  await expect(page.locator('body')).toHaveAttribute('data-held-weapon', 'rifle'); await page.locator('#start-button').click();
  await expect(page.locator('#panel-content')).toContainText('スナイパー / 小銃');
});
test('all planned regions can be inspected, while the briefing stays at Shiretoko', async ({ page }) => {
  await ready(page); await open(page, 'マップ');
  await expect(page.locator('#region-select option')).toHaveCount(18);
  await page.locator('#region-select').selectOption('9'); await expect(page.locator('#region-name')).toHaveText('東京［初回：撤退］');
  await expect(page.locator('#region-status')).toHaveText('未到達 / 未実装');
  await page.locator('#region-select').selectOption('17'); await expect(page.locator('#region-name')).toHaveText('東京［再突入］');
  await page.keyboard.press('Escape'); await page.locator('#start-button').click();
  await expect(page.locator('#panel-title')).toHaveText('最初の出撃：知床'); await expect(page.locator('#panel-content')).toContainText('知床 / 北海道');
  await expect(page.locator('.mission-boundary')).toBeInViewport({ ratio: 1 });
  await page.locator('#briefing-back').click(); await expect(page.locator('#start-button')).toBeFocused();
});
test('boss and rankings stay honest empty states without fabricated data', async ({ page }) => {
  await ready(page); await open(page, '今のボス状況'); await expect(page.locator('.unknown-hp strong')).toHaveText('—');
  await expect(page.locator('.wall-list>div')).toHaveCount(3); await expect(page.locator('#panel-content')).toContainText('割合・必要人数は未確定');
  await page.waitForTimeout(350); await expect(page.locator('.unknown-hp strong')).toHaveText('—');
  await page.keyboard.press('Escape'); await open(page, 'ランキング'); await expect(page.locator('.empty-records')).toContainText('未接続 / 集計準備中');
  await expect(page.locator('#panel-content table')).toHaveCount(0);
});
test('corrupt storage, unknown versions and write failures leave local controls usable', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('reclaim.home-preview.v1', '{bad'); }); await ready(page);
  await expect(page.locator('#survivor-name')).toHaveText('SURVIVOR');
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('quota'); }; });
  await open(page, 'キャラ設定'); await page.locator('#preview-name').fill('保存不可でも反映'); await page.locator('#apply-character').click();
  await expect(page.locator('#survivor-name')).toHaveText('保存不可でも反映'); await expect(page.locator('#local-save-status')).toContainText('保存できません');
  await page.locator('#start-button').click(); await expect(page.locator('#briefing-name')).toHaveText('保存不可でも反映');
});
test('reduced motion freezes idle; repeated screen/panel/formation visits reuse GPU resources', async ({ page }) => {
  test.setTimeout(60000); await page.emulateMedia({ reducedMotion: 'reduce' }); await ready(page); await visualReady(page);
  await page.locator('#squad-button').click(); await open(page, '武器');
  // Warm each held model once; first upload is expected to allocate a geometry.
  for (const gun of ['rifle', 'sniper', 'assault']) { await page.locator(`[data-slot="primary"][data-gun="${gun}"]`).click(); await page.waitForTimeout(100); }
  await page.keyboard.press('Escape'); await page.waitForTimeout(200); const before = (await snapshot(page)).render;
  for (let i = 0; i < 5; i++) {
    await page.locator('#back-title').click(); await page.locator('#home-button').click(); await page.locator('#solo-button').click(); await page.locator('#squad-button').click();
    await open(page, 'キャラ設定'); await page.locator('[data-palette="clay"]').click(); await page.keyboard.press('Escape');
  }
  await page.waitForTimeout(200); const after = (await snapshot(page)).render;
  expect(after.geometries).toBe(before.geometries); expect(after.textures).toBe(before.textures); expect(after.idle).toBe(0);
  expect(after.drawCalls).toBeLessThan(150); expect(after.triangles).toBeLessThan(100000);
});
test('runtime stays static-only through every menu, including WebSockets', async ({ page }) => {
  const requests = [], sockets = [], errors = []; page.on('request', r => requests.push(r.url())); page.on('websocket', s => sockets.push(s.url())); page.on('pageerror', e => errors.push(e.message));
  await ready(page);
  for (const name of ['マップ', 'キャラ設定', '武器', '今のボス状況', 'ランキング']) { await open(page, name); await page.keyboard.press('Escape'); }
  await page.locator('#start-button').click(); await page.locator('#briefing-back').click();
  expect(requests.filter(u => /^https?:/.test(u) && !u.startsWith('http://127.0.0.1:4173/'))).toEqual([]); expect(sockets).toEqual([]); expect(errors).toEqual([]);
});
test('WebGL failure still permits appearance, equipment and briefing', async ({ page }) => {
  await page.addInitScript(() => { const original = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (type, ...args) { return String(type).includes('webgl') ? null : original.call(this, type, ...args); }; });
  await ready(page); await open(page, 'キャラ設定'); await page.locator('#preview-name').fill('表示なしでも操作'); await page.locator('#apply-character').click();
  await page.locator('#start-button').click(); await expect(page.locator('#briefing-name')).toHaveText('表示なしでも操作');
});
test('touch drawer closes, all five items remain reachable, Escape restores focus', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }); const page = await context.newPage();
  await page.goto('http://127.0.0.1:4173/'); await page.locator('#home-button').tap(); await page.locator('#menu-toggle').tap();
  await expect(page.locator('#nav-items button')).toHaveCount(5); await page.getByRole('button', { name: 'キャラ設定', exact: true }).tap();
  await expect(page.locator('#home-nav')).toBeHidden(); await expect(page.locator('#home-panel')).toBeVisible(); await page.keyboard.press('Escape'); await expect(page.locator('#menu-toggle')).toBeFocused();
  await expect(page.locator('#start-button')).toBeInViewport(); expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390); await context.close();
});

for (const [width, height] of [[1920, 1080], [1366, 768], [390, 844], [844, 390]]) {
  test(`real WebGL composition ${width}x${height}, full squad bounds and usable START`, async ({ page }) => {
    test.setTimeout(60000); await page.setViewportSize({ width, height }); await ready(page); await visualReady(page); await page.locator('#squad-button').click(); await fourFits(page);
    await expect.poll(async () => (await snapshot(page)).render.formation.filter(s => s.visible).length).toBe(4);
    const stage = await page.locator('#lobby-stage').boundingBox(), s = await snapshot(page);
    for (const b of s.render.bounds) { expect(b.left).toBeGreaterThanOrEqual(stage.x); expect(b.right).toBeLessThanOrEqual(stage.x + stage.width); expect(b.top).toBeGreaterThanOrEqual(stage.y); expect(b.bottom).toBeLessThanOrEqual(stage.y + stage.height); }
    expect(s.render.formation[0].z).toBeGreaterThan(Math.max(...s.render.formation.slice(1).map(s => s.z)));
    await expect(page.locator('#start-button')).toBeInViewport(); await expect(page.locator('#squad-note')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(height);
    await mkdir('test-results/visual', { recursive: true }); await page.screenshot({ path: `test-results/visual/home-squad-${width}x${height}.png` });
    await writeFile(`test-results/visual/render-${width}x${height}.json`, JSON.stringify(s, null, 2));
  });
}
test('actual menu, solo and mission screenshots with WebGL, plus load metrics', async ({ page }) => {
  test.setTimeout(120000); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.emulateMedia({ reducedMotion: 'reduce' }); await ready(page); await visualReady(page); await mkdir('test-results/visual', { recursive: true });
  await page.screenshot({ path: 'test-results/visual/home-solo-desktop.png' });
  for (const [name, file] of [['キャラ設定', 'character-settings'], ['武器', 'weapons'], ['マップ', 'map'], ['今のボス状況', 'boss-unconnected'], ['ランキング', 'ranking-empty']]) {
    await open(page, name); await page.waitForTimeout(180); await page.screenshot({ path: `test-results/visual/home-${file}.png` }); await page.keyboard.press('Escape');
  }
  await page.locator('#start-button').click(); await expect(page.locator('.mission-boundary')).toBeInViewport({ ratio: 1 }); await page.waitForTimeout(180); await page.screenshot({ path: 'test-results/visual/home-start-briefing.png' }); await page.locator('#briefing-back').click();
  const metrics = await page.evaluate(() => ({ userAgent: navigator.userAgent, navigation: performance.getEntriesByType('navigation').map(n => ({ duration: n.duration, domContentLoaded: n.domContentLoadedEventEnd, transferSize: n.transferSize })), resources: performance.getEntriesByType('resource').map(r => ({ name: r.name, transferSize: r.transferSize, encodedBodySize: r.encodedBodySize, duration: r.duration })), snapshot: window.__RECLAIM__.snapshot() }));
  await writeFile('test-results/visual/home-performance.json', JSON.stringify(metrics, null, 2)); expect(errors).toEqual([]);
});
