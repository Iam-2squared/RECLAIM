/**
 * Real WebGL/SwiftShader, opt-in Shiretoko flora smoke and visual evidence.
 * Only touches the standalone development preview; never a campaign save.
 */
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const output = resolve('release/shiretoko-flora-review');
const preview = resolve('release/RECLAIM_Shiretoko_Terrain_Phase1.html');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: [
    '--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle',
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--allow-file-access-from-files',
  ],
});
const evidence = { source: 'real bundled standalone HTML / Chromium WebGL',
  browser: browser.version(), cases: [], physicalDevice: false, errors: [] };
const reference = pathToFileURL(preview).href;
const html = await readFile(preview, 'utf8');
evidence.sourceCommit = html.match(/name="reclaim-terrain-source" content="([^"]+)"/)?.[1] ?? 'not embedded';
try {
  for (const quality of ['off', 'low', 'balanced']) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('request', request => {
      if (/^https?:/.test(request.url())) pageErrors.push('Unexpected external request: ' + request.url());
    });
    await page.addInitScript(() => {
      window.__floraStorageReadsAndWrites = [];
      for (const method of ['getItem', 'setItem', 'removeItem', 'clear']) {
        Storage.prototype[method] = function () {
          window.__floraStorageReadsAndWrites.push(method);
          throw new Error('Independent flora preview must not access game storage');
        };
      }
    });
    try {
      const url = reference + (quality === 'off' ? '' : '?flora=' + quality);
      await page.goto(url, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__SHIRETOKO_TERRAIN__?.diagnostics().ready,
        null, { timeout: 60000 });
      await page.evaluate(() => window.__SHIRETOKO_TERRAIN__.freeze(true));
      const baseline = await page.evaluate(() => window.__SHIRETOKO_TERRAIN__.diagnostics());
      assert.equal(baseline.contextLost, false);
      assert.equal(baseline.shaderError, false);
      assert.equal(baseline.floraReview.enabled, quality !== 'off');
      assert.equal(baseline.terrainOnly, quality === 'off');
      if (quality !== 'off') {
        assert.equal(baseline.floraReview.quality, quality);
        assert(baseline.floraReview.instances > 1000);
        assert(baseline.floraReview.instances <= 58000);
        assert(baseline.floraReview.drawGroups > 0);
        assert(baseline.floraReview.drawGroups <= 96);
        assert.equal(baseline.floraReview.instanceBytes, baseline.floraReview.instances * 76);
        assert.equal(baseline.floraReview.saveWrites, 0);
        assert.equal(await page.locator('[data-flora-review]').count(), 1);
      } else {
        assert.equal(await page.locator('[data-flora-review]').count(), 0);
      }
      const frames = [];
      for (const view of [2, 3]) {
        const previous = await page.evaluate(() => window.__SHIRETOKO_TERRAIN__.diagnostics().renderCallsTotal);
        await page.evaluate(index => window.__SHIRETOKO_TERRAIN__.setView(index), view);
        await page.waitForFunction(n => window.__SHIRETOKO_TERRAIN__.diagnostics().renderCallsTotal > n,
          previous, { timeout: 30000 });
        const observation = await page.evaluate(() => {
          const d = window.__SHIRETOKO_TERRAIN__.diagnostics();
          const canvas = document.querySelector('canvas');
          const gl = canvas.getContext('webgl2');
          gl.finish();
          return { drawCalls: d.drawCalls, triangles: d.triangles, frames: d.renderCallsTotal,
            glError: gl.getError(), camera: d.camera, textureCount: d.textures,
            geometryCount: d.geometries };
        });
        assert(observation.drawCalls > 0 && observation.triangles > 0);
        assert.equal(observation.glError, 0, 'actual WebGL rendering must be error-free');
        const file = quality + '-view-' + view + '-webgl.png';
        await page.locator('canvas').screenshot({ path: resolve(output, file), animations: 'disabled' });
        frames.push({ view, file, ...observation });
      }
      const storage = await page.evaluate(() => window.__floraStorageReadsAndWrites);
      assert.deepEqual(storage, [], 'review must never access campaign storage');
      assert.deepEqual(pageErrors, [], 'no JavaScript failures or network requests');
      await page.evaluate(() => window.__SHIRETOKO_TERRAIN__.dispose());
      const final = await page.evaluate(() => window.__SHIRETOKO_TERRAIN__.diagnostics());
      assert.equal(final.disposed, true);
      assert.equal(await page.locator('canvas').count(), 0);
      assert.equal(final.geometries, 0);
      assert.equal(final.textures, 0);
      assert.equal(await page.locator('[data-flora-review]').count(), 0);
      evidence.cases.push({ quality, baseline, frames, final, storage, pageErrors });
      console.log('Flora real-WebGL review PASS: ' + quality + ' (' + frames.length + ' frames)');
    } finally {
      await context.close();
    }
  }
  const low = evidence.cases.find(c => c.quality === 'low').baseline.floraReview;
  const balanced = evidence.cases.find(c => c.quality === 'balanced').baseline.floraReview;
  assert(balanced.instances > low.instances, 'balanced must have greater coverage than low');
  console.log('Flora comparison low=' + low.instances + ', balanced=' + balanced.instances);
} catch (error) {
  evidence.errors.push(String(error?.stack ?? error));
  throw error;
} finally {
  await writeFile(resolve(output, 'visual-verification.json'), JSON.stringify(evidence, null, 2));
  await browser.close();
}
