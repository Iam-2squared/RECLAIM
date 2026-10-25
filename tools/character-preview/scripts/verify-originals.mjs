import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

let playwright;
try { playwright = await import(process.env.PLAYWRIGHT_MODULE || 'playwright'); }
catch (error) {
  if (process.env.PLAYWRIGHT_MODULE) throw error;
  playwright = await import('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
}
const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'review/originals');
const url = process.argv.find(a => a.startsWith('--base-url='))?.slice(11) || 'http://127.0.0.1:4173/';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const difference = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
const orientation = m => [0, 4, 8].flatMap(i => { const s = Math.hypot(...m.slice(i, i + 3)); return m.slice(i, i + 3).map(v => v / s); });
const source = meshes => meshes.map(o => ({ ...o, map: !!o.map }));
const report = { started: new Date().toISOString(), url, checks: [], browserErrors: [], screenshots: [], warnings: ['This environment’s managed Chromium policy blocks file:// navigation. The exact standalone HTML is instead verified over HTTP with all subsequent network requests blocked. Direct file:// launch remains unverified here.'], models: {}, failures: [] };
await fs.mkdir(out, { recursive: true });
report.artifacts = await Promise.all(['dist/index.html', 'dist/assets/male/male.glb', 'dist/assets/female/female.glb', 'dist/RECLAIM_Character_Studio.html'].map(async file => { const bytes = await fs.readFile(path.join(root, file)); return { file, bytes: bytes.length, sha256: hash(bytes) }; }));
const browser = await playwright.chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
report.browser = browser.version();
const contexts = [];
const read = page => page.evaluate(() => window.__RECLAIM_CHARACTER_REVIEW__());
async function pageFor(label, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, ...options }); contexts.push(context);
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on('pageerror', e => report.browserErrors.push({ label, type: 'page', message: e.message }));
  page.on('console', e => { if (e.type() === 'error') report.browserErrors.push({ label, type: 'console', message: e.text() }); });
  page.on('requestfailed', r => report.browserErrors.push({ label, type: 'request', url: r.url(), message: r.failure()?.errorText }));
  page.on('response', r => { if (r.status() >= 400) report.browserErrors.push({ label, type: 'HTTP', status: r.status(), url: r.url() }); });
  return page;
}
async function ready(page, gender) {
  await page.waitForFunction(g => { const d = window.__RECLAIM_CHARACTER_REVIEW__?.(); return d?.ready && d.gender === g && document.querySelector('#loader').hidden; }, gender, { timeout: 60000 });
  assert.equal(await page.locator('#error').isVisible(), false);
}
async function click(page, selector) { await page.locator(selector).scrollIntoViewIfNeeded(); await page.locator(selector).click(); }
async function idle(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  let frames = (await read(page)).frames, stable = 0;
  for (let i = 0; i < 35; i++) {
    await pause(150); const d = await read(page);
    stable = d.frames === frames && !d.pose && !d.rotate ? stable + 1 : 0;
    if (stable >= 2) return d;
    frames = d.frames;
  }
  throw Error('Demand renderer failed to stop after controls settled');
}
async function shot(page, name) {
  const file = path.join(out, `${name}.png`), bytes = await page.screenshot({ path: file, fullPage: false });
  report.screenshots.push({ file: path.relative(root, file), bytes: bytes.length, sha256: hash(bytes) });
}
async function check(name, fn) {
  const started = Date.now();
  try { const details = await fn(); report.checks.push({ name, status: 'passed', ms: Date.now() - started, ...(details ? { details } : {}) }); process.stdout.write(`PASS ${name}\n`); }
  catch (error) { report.checks.push({ name, status: 'failed', ms: Date.now() - started, message: error.message }); report.failures.push({ name, message: error.message, stack: error.stack }); process.stdout.write(`FAIL ${name}: ${error.message}\n`); }
}
try {
  const page = await pageFor('desktop'); await page.goto(url); await ready(page, 'male');
  const baselines = {};
  await check('Only the original two skins, source meshes and skeletons are present', async () => {
    assert.equal(await page.locator('[data-style], [data-color], #hairstyles, #hair-colors').count(), 0, 'Rejected custom-hair controls remain');
    for (const [gender, expectedMeshes, expectedBones] of [['male', 5, 123], ['female', 3, 183]]) {
      await click(page, `[data-gender="${gender}"]`); await ready(page, gender); await click(page, '#reset-customization'); const d = await idle(page);
      assert.equal(d.meshes.length, expectedMeshes); assert.equal(d.bones, expectedBones);
      assert.ok(d.meshes.every(m => m.visible && m.vertices > 0 && !/^Hair_(?:original|long|short|mohawk|center_part|undercut)/i.test(m.name)), 'A source mesh is hidden or a replacement hair mesh remains');
      assert.equal(d.hairMeshes.length, 1); assert.ok(d.renderer.triangles > 1000);
      baselines[gender] = d; report.models[gender] = { meshes: source(d.meshes), bones: d.bones, originalHair: d.hairMeshes.map(h => h.name) };
      await shot(page, `${gender}-original`);
    }
  });
  await check('Original hair follows head motion and returns exactly to rest', async () => {
    const motion = [];
    for (const gender of ['male', 'female']) {
      await click(page, `[data-gender="${gender}"]`); await ready(page, gender); const rest = await idle(page);
      await click(page, '#pose-check');
      let moving;
      try {
        await page.waitForFunction(f => { const d = window.__RECLAIM_CHARACTER_REVIEW__(); return d.pose && d.frames >= f + 3; }, rest.frames);
        moving = await read(page);
        assert.ok(difference(orientation(moving.headWorldMatrix), orientation(rest.headWorldMatrix)) > .005, `${gender}: head did not rotate`);
        assert.ok(moving.hairMeshes.every((h, i) => difference(h.position, rest.hairMeshes[i].position) > .00001), `${gender}: original hair did not follow head`);
        assert.deepEqual(moving.meshes, rest.meshes, `${gender}: source buffers/materials changed`);
      } finally { if ((await read(page)).pose) await click(page, '#pose-check'); }
      const stopped = await idle(page);
      assert.ok(difference(stopped.headWorldMatrix, rest.headWorldMatrix) < 1e-7, `${gender}: head failed to return to rest`);
      assert.ok(stopped.hairMeshes.every((h, i) => difference(h.position, rest.hairMeshes[i].position) < 1e-7), `${gender}: hair failed to return to rest`);
      assert.deepEqual(stopped.meshes, rest.meshes);
      motion.push({ gender, hairMotion: difference(moving.hairMeshes[0].position, rest.hairMeshes[0].position) });
    }
    return motion;
  });
  await check('Body/head framing, drag, wheel, keyboard, auto rotation, reset and idle work', async () => {
    await click(page, '#reset-customization'); const body = await idle(page);
    await click(page, '#frame-head'); const head = await idle(page); assert.ok(head.camera[2] < body.camera[2] / 2);
    await click(page, '#frame-body'); const original = await idle(page); assert.ok(difference(original.camera, body.camera) < 1e-7);
    const b = await page.locator('#canvas').boundingBox(), x = b.x + b.width * .54, y = b.y + b.height * .52;
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 150, y - 25, { steps: 8 }); await page.mouse.up();
    assert.ok(difference((await read(page)).camera, original.camera) > .05);
    await click(page, '#reset-view'); assert.ok(difference((await idle(page)).camera, original.camera) < 1e-5);
    await page.mouse.move(x, y); await page.mouse.wheel(0, -190); const zoom = await idle(page); assert.ok(zoom.camera[2] < original.camera[2] - .1);
    await page.locator('#canvas').focus(); await page.keyboard.press('ArrowRight'); assert.ok(Math.abs((await idle(page)).camera[0]) > .02);
    await click(page, '#auto-rotate'); const before = await read(page); await page.waitForFunction(f => window.__RECLAIM_CHARACTER_REVIEW__().frames >= f + 3, before.frames); const rotated = await read(page); assert.ok(difference(rotated.camera, before.camera) > .001);
    await click(page, '#reset-customization'); const reset = await idle(page); assert.ok(difference(reset.camera, original.camera) < 1e-5); assert.equal(reset.pose, false); assert.equal(reset.rotate, false);
    await pause(400); assert.equal((await read(page)).frames, reset.frames);
    assert.deepEqual(source(reset.meshes), report.models.female.meshes);
  });
  await check('Original skin choice persists after reload', async () => {
    await click(page, '[data-gender="male"]'); await ready(page, 'male'); await page.reload(); await ready(page, 'male');
    assert.deepEqual(source((await idle(page)).meshes), report.models.male.meshes);
    await click(page, '[data-gender="female"]'); await ready(page, 'female'); await page.reload(); await ready(page, 'female');
    assert.deepEqual(source((await idle(page)).meshes), report.models.female.meshes);
  });
  await check('Pending gender loads are shared and cached GPU resources remain stable', async () => {
    const race = await pageFor('race'), counts = { male: 0, female: 0 };
    await race.route('**/assets/*/*.glb', async route => { counts[route.request().url().includes('/male/') ? 'male' : 'female']++; await pause(600); await route.continue(); });
    await race.goto(url, { waitUntil: 'domcontentloaded' }); await race.waitForFunction(() => !!window.__RECLAIM_CHARACTER_REVIEW__);
    for (const g of ['female', 'male', 'female', 'male', 'female']) await click(race, `[data-gender="${g}"]`);
    await ready(race, 'female'); assert.deepEqual(counts, { male: 1, female: 1 });
    for (const g of ['male', 'female']) { await click(race, `[data-gender="${g}"]`); await ready(race, g); await idle(race); }
    const warm = (await read(race)).renderer;
    for (const g of ['male', 'female', 'male', 'female']) { await click(race, `[data-gender="${g}"]`); await ready(race, g); await idle(race); }
    const final = (await read(race)).renderer; assert.equal(final.geometries, warm.geometries); assert.equal(final.textures, warm.textures); assert.deepEqual(counts, { male: 1, female: 1 });
    return { requests: counts, geometries: final.geometries, textures: final.textures };
  });
  await check('Mobile original-skin controls are reachable without overflow', async () => {
    const mobile = await pageFor('mobile', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); await mobile.goto(url); await ready(mobile, 'male');
    assert.equal(await mobile.locator('[data-style], [data-color]').count(), 0);
    for (const selector of ['#frame-head', '#frame-body', '#auto-rotate', '#auto-rotate', '#reset-view', '[data-gender="female"]']) await click(mobile, selector);
    await ready(mobile, 'female'); await click(mobile, '#pose-check'); await click(mobile, '#pose-check'); await click(mobile, '#reset-customization'); await idle(mobile);
    assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    for (const selector of ['[data-gender="male"]', '#pose-check', '#reset-customization']) { await mobile.locator(selector).scrollIntoViewIfNeeded(); const b = await mobile.locator(selector).boundingBox(); assert.ok(b.x >= 0 && b.x + b.width <= 391 && b.y >= 0 && b.y < 844, `${selector} unreachable`); }
    assert.deepEqual(source((await read(mobile)).meshes), report.models.female.meshes);
  });
  await check('Standalone embeds both original skins and needs no additional network', async () => {
    const offline = await pageFor('standalone'), requests = [], standaloneURL = new URL('RECLAIM_Character_Studio.html', url.endsWith('/') ? url : `${url}/`).href;
    offline.on('request', r => { if (/^https?:/.test(r.url())) requests.push(r.url()); });
    await offline.route('**/*', route => route.request().isNavigationRequest() && route.request().url() === standaloneURL ? route.continue() : route.abort());
    await offline.goto(standaloneURL, { timeout: 60000 }); await ready(offline, 'male'); assert.deepEqual(source((await idle(offline)).meshes), report.models.male.meshes);
    await click(offline, '[data-gender="female"]'); await ready(offline, 'female'); assert.deepEqual(source((await idle(offline)).meshes), report.models.female.meshes);
    assert.equal(await offline.locator('[data-style], [data-color]').count(), 0); assert.deepEqual(requests, [standaloneURL]);
    return { additionalNetworkRequests: 0, transport: 'HTTP document with subsequent network blocked' };
  });
  await check('No browser errors; reviewed build unchanged throughout verification', async () => {
    assert.deepEqual(report.browserErrors, []);
    for (const file of report.artifacts) assert.equal(hash(await fs.readFile(path.join(root, file.file))), file.sha256, `${file.file} changed during verification`);
  });
} catch (error) { report.failures.push({ name: 'Setup', message: error.message, stack: error.stack }); }
finally {
  report.finished = new Date().toISOString(); report.passed = report.failures.length === 0;
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  for (const context of contexts) await context.close(); await browser.close();
  process.stdout.write(`${report.passed ? 'PASS' : 'FAIL'} original-only build; report: ${path.join(out, 'report.json')}\n`); process.exitCode = report.passed ? 0 : 1;
}
