import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const snapshot = page => page.evaluate(() => window.__RECLAIM__.snapshot());
const ready = async page => {
  const response = await page.goto('/');
  expect(response?.ok()).toBe(true);
  expect(response?.headers()['content-type']).toContain('text/html');
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#boot-notice')).toBeHidden();
  await expect(page.locator('#home-button')).toBeEnabled();
};
const home = async page => { await ready(page); await page.locator('#home-button').tap(); await expect(page.locator('#home-screen')).toBeVisible(); };
const open = async (page, name) => { await page.locator('#menu-toggle').tap(); await page.getByRole('button', { name, exact: true }).tap(); await expect(page.locator('#home-nav')).toBeHidden(); };
const fullSquad = async page => {
  // A flat fallback cannot satisfy the four visible 3D survivors requirement.
  await expect(page.locator('body')).toHaveAttribute('data-renderer', 'webgl');
  await expect.poll(async () => (await snapshot(page)).render?.formation.filter(s => s.visible).length).toBe(4);
  await expect.poll(async () => (await snapshot(page)).render?.bounds.length).toBe(4);
  const stage = await page.locator('#lobby-stage').boundingBox(), view = await snapshot(page);
  for (const b of view.render.bounds) {
    expect(b.left).toBeGreaterThanOrEqual(stage.x - 1);
    expect(b.right).toBeLessThanOrEqual(stage.x + stage.width + 1);
    expect(b.top).toBeGreaterThanOrEqual(stage.y - 1);
    expect(b.bottom).toBeLessThanOrEqual(stage.y + stage.height + 1);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width);
};

test('a file-viewer-like module block gives a visible Safari instruction instead of an active dead HOME button', async ({ page }) => {
  await page.route(/\/assets\/.*\.js(?:\?.*)?$/, route => route.abort());
  await page.goto('/');
  await expect(page.locator('#title-screen')).toBeVisible();
  await expect(page.locator('#boot-notice')).toContainText('Preview URLをSafari');
  await expect(page.locator('#boot-notice')).toBeInViewport();
  await expect(page.locator('#home-button')).toBeDisabled();
  await expect(page.locator('#home-screen')).toBeHidden();
  await expect(page.locator('body')).not.toHaveAttribute('data-ready', 'true');
});

test('iPhone touch preserves the brief title reveal and travels TITLE to HOME and back', async ({ page }) => {
  test.setTimeout(60000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await ready(page);
  await page.locator('#title-button').tap();
  await expect(page.locator('body')).toHaveAttribute('data-reveal', 'true');
  await expect(page.locator('body')).toHaveAttribute('data-reveal', 'false', { timeout: 4000 });
  await page.locator('#home-button').tap();
  await expect(page.locator('#title-screen')).toBeHidden();
  await expect(page.locator('#home-screen')).toBeVisible();
  await page.locator('#menu-toggle').tap(); await page.locator('#back-title').tap();
  await expect(page.locator('#title-screen')).toBeVisible();
  await page.locator('#home-button').tap(); await page.reload();
  await expect(page.locator('#title-screen')).toBeVisible();
  expect(errors).toEqual([]);
});

test('Safari display dialog, reduced motion and quality remain touch operable', async ({ page }) => {
  await ready(page); await page.locator('#settings-button').tap();
  await expect(page.locator('#settings-dialog')).toBeVisible();
  await page.locator('#motion-toggle').check(); await page.locator('#quality-select').selectOption('low');
  await page.locator('#settings-dialog .close-button').tap();
  await expect(page.locator('#settings-dialog')).toBeHidden();
  expect((await snapshot(page)).reducedMotion).toBe(true);
  await page.locator('#home-button').tap(); await page.locator('#squad-button').tap(); await fullSquad(page);
  expect((await snapshot(page)).render.pixelRatio).toBeLessThanOrEqual(.75);
});

for (const [width, height] of [[375, 667], [390, 664], [390, 844], [430, 932]]) {
  test(`iPhone portrait ${width}x${height} shows all four survivors, including after toolbar-height changes`, async ({ page }, info) => {
    test.setTimeout(60000); await page.setViewportSize({ width, height }); await home(page);
    await page.locator('#squad-button').tap(); await fullSquad(page);
    await expect(page.locator('#start-button')).toBeInViewport({ ratio: 1 });
    const imagePath=info.outputPath('portrait-four-survivors.png'), boundsPath=info.outputPath('portrait-model-bounds.json');
    await page.screenshot({path:imagePath}); await writeFile(boundsPath,JSON.stringify(await snapshot(page),null,2));
    await info.attach('portrait-four-survivors', { path:imagePath, contentType: 'image/png' });
    await info.attach('portrait-model-bounds', { path:boundsPath, contentType: 'application/json' });
    await page.setViewportSize({ width, height: height - 80 }); await fullSquad(page);
    await open(page, '武器'); await fullSquad(page);
    await page.locator('[data-slot="primary"][data-gun="sniper"]').tap(); await fullSquad(page);
    await page.locator('#panel-close').tap(); await expect(page.locator('#start-button')).toBeInViewport({ ratio: 1 });
  });
}

test('iPhone touch operates every left-menu item, saves appearance, changes guns and opens the briefing', async ({ page }) => {
  test.setTimeout(90000); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await home(page); await page.locator('#squad-button').tap();
  await open(page, 'キャラ設定'); await page.locator('#preview-name').fill('知床の生存者');
  await page.locator('[data-palette="slate"]').tap(); await page.locator('#apply-character').tap();
  await expect(page.locator('#survivor-name')).toHaveText('知床の生存者'); await fullSquad(page);
  await open(page, '武器'); await page.locator('[data-slot="primary"][data-gun="sniper"]').tap();
  await page.locator('#hold-secondary').tap(); await page.locator('[data-slot="secondary"][data-gun="rifle"]').tap();
  await expect(page.locator('body')).toHaveAttribute('data-held-weapon', 'rifle'); await page.locator('#panel-close').tap();
  await open(page, 'マップ'); await page.locator('#region-select').selectOption('17');
  await expect(page.locator('#region-name')).toHaveText('東京［再突入］'); await page.locator('#panel-close').tap();
  await open(page, '今のボス状況'); await expect(page.locator('.unknown-hp strong')).toHaveText('—'); await page.locator('#panel-close').tap();
  await open(page, 'ランキング'); await expect(page.locator('.empty-records')).toContainText('未接続'); await page.locator('#panel-close').tap();
  await page.locator('#start-button').tap(); await expect(page.locator('.mission-boundary')).toBeInViewport({ ratio: 1 });
  await expect(page.locator('.combat-disabled')).toBeDisabled(); await page.locator('#briefing-back').tap();
  await page.reload(); await page.locator('#home-button').tap();
  await expect(page.locator('#survivor-name')).toHaveText('知床の生存者');
  await expect(page.locator('body')).toHaveAttribute('data-palette', 'slate');
  await expect(page.locator('body')).toHaveAttribute('data-held-weapon', 'rifle');
  expect(errors).toEqual([]);
});

test('Safari without storage or WebGL still reaches HOME and permits local controls', async ({ page }) => {
  await page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) { return String(type).includes('webgl') ? null : get.call(this, type, ...args); };
    Storage.prototype.getItem = Storage.prototype.setItem = () => { throw new Error('Storage unavailable'); };
  });
  await home(page); await expect(page.locator('body')).toHaveAttribute('data-renderer', 'fallback');
  await open(page, 'キャラ設定'); await page.locator('#preview-name').fill('一時プレビュー'); await page.locator('#apply-character').tap();
  await expect(page.locator('#survivor-name')).toHaveText('一時プレビュー');
  await open(page, '武器'); await page.locator('[data-slot="primary"][data-gun="rifle"]').tap(); await page.locator('#panel-close').tap();
  await expect(page.locator('body')).toHaveAttribute('data-held-weapon', 'rifle');
});
