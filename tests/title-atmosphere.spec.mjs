import { test, expect } from './browser-fixtures.mjs';
import { mkdir } from 'node:fs/promises';

const atmosphere = page => page.locator('#title-screen .title-atmosphere');

async function openTitle(page) {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('body')).toHaveAttribute('data-menu-presentation', 'atmospheric-title-2d');
  await expect(page.locator('#title-screen')).toBeVisible();
  await expect(atmosphere(page)).toHaveAttribute('data-active', 'true');
  await page.locator('#title-screen .title-atmosphere img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
}

test('title artwork loads and animated 2D layers keep the game renderer idle', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await openTitle(page);
  await expect(atmosphere(page)).toHaveAttribute('aria-hidden', 'true');
  await expect(atmosphere(page)).toHaveAttribute('data-running', 'true');
  await expect(page.locator('.title-atmosphere__background')).toBeVisible();
  const imageSizes = await atmosphere(page).locator('img').evaluateAll(images => images.map(image => ({
    complete: image.complete, width: image.naturalWidth, height: image.naturalHeight,
  })));
  expect(imageSizes).toHaveLength(4);
  expect(imageSizes.every(image => image.complete && image.width > 0 && image.height > 0)).toBe(true);
  const fog = page.locator('.title-atmosphere__fog--street');
  const transform = await fog.evaluate(node => getComputedStyle(node).transform);
  expect(await page.evaluate(() => window.__RECLAIM__.snapshot().renderer)).toBe('deferred');
  expect(await page.evaluate(() => window.__RECLAIM__.snapshot().render)).toBeNull();
  await expect(page.locator('#scene canvas')).toHaveCount(0);
  const frames = await page.evaluate(() => window.__RECLAIM__.snapshot().renderClock.rendererFrames);
  const loopFrames = await page.evaluate(() => window.__RECLAIM__.snapshot().renderClock.frames);
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => window.__RECLAIM__.snapshot().renderClock.rendererFrames)).toBe(frames);
  expect(await page.evaluate(() => window.__RECLAIM__.snapshot().renderClock.frames)).toBe(loopFrames);
  await expect(page.locator('#sound-button')).toHaveAttribute('aria-pressed', 'false');
  expect(errors).toEqual([]);
  expect(await fog.evaluate(node => getComputedStyle(node).transform)).not.toBe(transform);
  await mkdir('release', { recursive: true });
  await page.screenshot({ path: 'release/title-preview.png' });
});

test('START enters HOME and returning to the title resumes its atmosphere', async ({ page }) => {
  await openTitle(page);
  await expect(page.locator('#continue-button')).toBeDisabled();
  await page.locator('#home-button').click();
  await expect(page.locator('#home-screen')).toBeVisible();
  await expect(page.locator('#title-screen')).toBeHidden();
  await expect(atmosphere(page)).toHaveAttribute('data-active', 'false');
  await expect(atmosphere(page)).toHaveAttribute('data-running', 'false');
  await page.locator('#back-title').click();
  await expect(page.locator('#title-screen')).toBeVisible();
  await expect(atmosphere(page)).toHaveAttribute('data-running', 'true');
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#title-screen')).toBeVisible();
  await expect(page.locator('#home-screen')).toBeHidden();
});

test('title settings pause and restore motion through the saved user preference', async ({ page }) => {
  await openTitle(page);
  await page.locator('#title-settings').click();
  await expect(page.locator('#settings-dialog')).toBeVisible();
  await page.locator('#motion-toggle').check();
  await expect(atmosphere(page)).toHaveAttribute('data-reduced-motion', 'true');
  await expect(atmosphere(page)).toHaveAttribute('data-running', 'false');
  await page.keyboard.press('Escape');
  await expect(page.locator('#settings-dialog')).toBeHidden();
  await expect(page.locator('#title-settings')).toBeFocused();
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  await expect(atmosphere(page)).toHaveAttribute('data-reduced-motion', 'true');
  await expect(atmosphere(page)).toHaveAttribute('data-running', 'false');
  await page.locator('#title-settings').click();
  await page.locator('#motion-toggle').uncheck();
  await expect(atmosphere(page)).toHaveAttribute('data-reduced-motion', 'false');
  await expect(atmosphere(page)).toHaveAttribute('data-running', 'true');
});

test('keyboard users can activate START and return to the focused title entry', async ({ page }) => {
  await openTitle(page);
  await page.locator('#home-button').focus();
  await expect(page.locator('#home-button')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#home-screen')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#title-screen')).toBeVisible();
  await expect(page.locator('#home-button')).toBeFocused();
});

test('a changed system motion preference pauses and resumes the decorative layers', async ({ page }) => {
  await openTitle(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(atmosphere(page)).toHaveAttribute('data-reduced-motion', 'true');
  await expect(atmosphere(page)).toHaveAttribute('data-running', 'false');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(atmosphere(page)).toHaveAttribute('data-reduced-motion', 'false');
  await expect(atmosphere(page)).toHaveAttribute('data-running', 'true');
});

for (const size of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1024, height: 576 }]) {
  test(`title controls remain reachable without horizontal overflow at ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    await openTitle(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(size.width);
    for (const id of ['home-button', 'continue-button', 'title-settings']) {
      const control = page.locator(`#${id}`);
      await control.scrollIntoViewIfNeeded();
      await expect(control).toBeInViewport({ ratio: 1 });
      const bounds = await control.boundingBox();
      expect(bounds.width).toBeGreaterThanOrEqual(44);
      expect(bounds.height).toBeGreaterThanOrEqual(44);
    }
    await page.locator('#home-button').click();
    await expect(page.locator('#home-screen')).toBeVisible();
  });
}

test('explicit mission launch resumes the deferred game loop and HOME stops it', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const snapshot = () => page.evaluate(() => window.__RECLAIM__.snapshot());
  await page.setViewportSize({ width: 1366, height: 768 });
  await openTitle(page);
  expect((await snapshot()).renderer).toBe('deferred');
  await expect(page.locator('#scene canvas')).toHaveCount(0);

  await page.locator('#title-settings').click();
  await page.locator('#quality-select').selectOption('low');
  await page.keyboard.press('Escape');
  await page.locator('#home-button').click();
  await expect(page.locator('#home-screen')).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-renderer', 'deferred');
  await expect(page.locator('#scene canvas')).toHaveCount(0);
  expect((await snapshot()).renderClock.frames).toBe(0);

  await page.locator('#start-button').click();
  await expect(page.locator('body')).toHaveAttribute('data-renderer', 'webgl');
  await expect(page.locator('#scene canvas')).toHaveCount(1);
  await expect(page.locator('#mission-launch')).toBeEnabled();
  await page.locator('#mission-launch').click();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'mission');
  await expect(page.locator('#mission-story')).toBeVisible();
  await expect(atmosphere(page)).toHaveAttribute('data-running', 'false');
  // The constructor renders once. Subsequent frames prove the deferred main loop started.
  await expect.poll(async () => {
    const state = await snapshot();
    return Boolean(state.mission && state.mission.frames > 1 && state.renderClock.frames > 0);
  }).toBe(true);

  await page.locator('#mission-continue').click();
  await page.locator('#mission-lock').click();
  await expect.poll(async () => {
    const mission = (await snapshot()).mission;
    return Boolean(mission && mission.locked && !mission.paused);
  }).toBe(true);
  const playing = await snapshot();
  await expect.poll(async () => {
    const state = await snapshot();
    return Boolean(state.mission && state.mission.elapsed > playing.mission.elapsed
      && state.renderClock.frames > playing.renderClock.frames
      && state.renderClock.rendererFrames > playing.renderClock.rendererFrames);
  }).toBe(true);

  await page.keyboard.press('Escape');
  await expect(page.locator('#mission-home')).toBeVisible();
  await page.locator('#mission-home').click();
  await expect(page.locator('#home-screen')).toBeVisible();
  const returned = await snapshot();
  expect(returned.mission).toBeNull();
  await expect(page.locator('#scene canvas')).toHaveCount(1);
  await page.waitForTimeout(250);
  expect((await snapshot()).renderClock).toEqual(returned.renderClock);
  expect(errors).toEqual([]);
});
