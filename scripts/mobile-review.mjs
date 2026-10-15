import { chromium, webkit, devices } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';

// This captures actual pages. It does not composite art into fake screenshots.
// Use a locally served build or an explicitly supplied review URL; no deploys.
const option = name => process.argv.find(a => a.startsWith(`${name}=`))?.slice(name.length + 1);
const url = option('--url') ?? 'http://127.0.0.1:4175/';
const output = resolve(option('--output') ?? 'test-results/mobile-review');
const requested = (option('--browsers') ?? 'chromium,webkit').split(',');
const root = resolve(import.meta.dirname, '..');
const views = [[320, 568], [360, 800], [375, 667], [390, 844], [430, 932], [667, 375], [844, 390], [932, 430], [768, 1024], [1024, 768], [959, 441], [960, 441], [960, 440], [959, 440]];
const sha256 = data => createHash('sha256').update(data).digest('hex');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
await mkdir(output, { recursive: true });
const result = {
  createdAt: new Date().toISOString(), sourceCommit: git('rev-parse', 'HEAD'), workingTree: git('status', '--porcelain') ? 'dirty' : 'clean',
  sourceTree: git('rev-parse', 'HEAD^{tree}'), url, environment: { platform: process.platform, arch: process.arch, node: process.version, physicalDevices: false, note: 'Linux browser automation. WebKit is not physical iPhone Safari; Chromium is not physical Android/Windows FPS.' },
  referenceAssets: [], browsers: [], failures: [],
};
let server;
if (!option('--url')) {
  server = spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', '4175', '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolveReady, reject) => {
    const timer = setTimeout(() => reject(new Error('Local review server did not become ready')), 10000);
    const ready = chunk => {
      process.stdout.write(chunk);
      if (chunk.toString().includes('http://127.0.0.1:4175')) { clearTimeout(timer); resolveReady(); }
    };
    server.stdout.on('data', ready);
    server.stderr.on('data', chunk => process.stderr.write(chunk));
    server.once('exit', code => { clearTimeout(timer); reject(new Error(`Local review server exited (${code})`)); });
    server.once('error', error => { clearTimeout(timer); reject(error); });
  });
  process.once('exit', () => server?.kill());
}
for (const file of ['src/ui-reference/title.jpeg', 'src/ui-reference/home.jpeg']) {
  const bytes = await readFile(resolve(root, file));
  result.referenceAssets.push({ file, bytes: bytes.length, sha256: sha256(bytes) });
}

const snap = page => page.evaluate(() => window.__RECLAIM__.snapshot());
async function tap(page, item) {
  const target = typeof item === 'string' ? page.locator(item) : item;
  await target.scrollIntoViewIfNeeded();
  await target.tap();
}
async function capture(page, folder, name, states) {
  const screenshot = resolve(folder, `${name}.png`);
  await page.screenshot({ path: screenshot });
  const bytes = await readFile(screenshot);
  const state = await page.evaluate(() => {
    const rect = n => { const r = n.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
    return {
      snapshot: window.__RECLAIM__.snapshot(), visualViewport: window.visualViewport ? { width: visualViewport.width, height: visualViewport.height, offsetTop: visualViewport.offsetTop, offsetLeft: visualViewport.offsetLeft, scale: visualViewport.scale } : null,
      input: { coarse: matchMedia('(any-pointer: coarse)').matches, fine: matchMedia('(any-pointer: fine)').matches, compactViewport: !matchMedia('(min-width: 960px) and (min-height: 441px)').matches },
      documentWidth: document.documentElement.scrollWidth,
      targets: [...document.querySelectorAll('button,input,select,summary')].filter(n => n.getClientRects().length && getComputedStyle(n).visibility !== 'hidden').map(n => ({ id: n.id || n.getAttribute('aria-label') || n.textContent.trim().slice(0, 60), ...rect(n), disabled: n.disabled ?? false })),
    };
  });
  states.push({ name, screenshot, bytes: bytes.length, sha256: sha256(bytes), ...state });
  await writeFile(resolve(folder, `${name}.json`), JSON.stringify(state, null, 2));
  // Capability-derived gate: a wrong PC mode must fail instead of hiding tiny targets.
  if (state.input.compactViewport || (state.input.coarse && !state.input.fine)) {
    for (const target of state.targets) assert(target.width >= 44 && target.height >= 44, `${name}: ${target.id} touch target ${target.width}x${target.height} is below 44x44 CSS px`);
  }
}

for (const name of requested) {
  const type = name === 'chromium' ? chromium : name === 'webkit' ? webkit : null;
  if (!type) throw new Error(`Unknown browser: ${name}`);
  const record = { name, version: null, viewports: [] };
  result.browsers.push(record);
  let browser;
  try {
    browser = await type.launch(name === 'chromium' ? {
      ...(process.env.RECLAIM_TEST_BROWSER ? { executablePath: process.env.RECLAIM_TEST_BROWSER } : {}),
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
    } : { env: { ...process.env, LIBGL_ALWAYS_SOFTWARE: '1' } });
    record.version = browser.version();
    for (const [width, height] of views) {
      const folder = resolve(output, name, `${width}x${height}`);
      await mkdir(folder, { recursive: true });
      const view = { width, height, compactViewport: width < 960 || height < 441, status: 'running', states: [], consoleErrors: [], pageErrors: [], externalRequests: [], websockets: [] };
      record.viewports.push(view);
      const context = await browser.newContext({ ...(name === 'webkit' ? devices['iPhone 13'] : devices['Pixel 5']), viewport: { width, height }, deviceScaleFactor: 1 });
      const page = await context.newPage();
      page.on('console', e => { if (e.type() === 'error') view.consoleErrors.push(e.text()); });
      page.on('pageerror', e => view.pageErrors.push(e.message));
      page.on('request', r => { if (/^https?:/.test(r.url()) && new URL(r.url()).origin !== new URL(url).origin) view.externalRequests.push(r.url()); });
      page.on('websocket', s => view.websockets.push(s.url()));
      try {
        const response = await page.goto(url);
        assert(response?.ok(), 'HTML response must succeed');
        await page.waitForFunction(() => document.body.dataset.ready === 'true');
        const input = await page.evaluate(() => ({
          coarse: matchMedia('(any-pointer: coarse)').matches,
          fine: matchMedia('(any-pointer: fine)').matches,
          compactViewport: !matchMedia('(min-width: 960px) and (min-height: 441px)').matches,
        }));
        view.touchOnly = input.coarse && !input.fine;
        view.compactViewport = input.compactViewport;
        view.mobile = view.compactViewport || view.touchOnly;
        assert.equal((await snap(page)).menus.mode, view.mobile ? 'mobile-reference-2d' : 'reference-2d');
        await capture(page, folder, '01-title', view.states);
        await tap(page, '#settings-button');
        await page.locator('#quality-select').selectOption('low');
        await page.locator('#motion-toggle').check();
        await capture(page, folder, '02-settings', view.states);
        await tap(page, '#settings-dialog .close-button');
        await tap(page, '#reference-extras');
        await capture(page, folder, '03-extras', view.states);
        await tap(page, '#reference-dialog .close-button');
        await tap(page, '#home-button');
        assert.equal((await snap(page)).screen, 'home');
        await capture(page, folder, '04-home', view.states);
        const before = (await snap(page)).campaign;
        await tap(page, '#squad-button');
        assert.equal((await snap(page)).squadPreview, true);
        await capture(page, folder, '05-local-squad-samples', view.states);
        await tap(page, '#solo-button');
        for (const [i, panel] of ['マップ', 'キャラ設定', '武器', '今のボス状況', 'ランキング'].entries()) {
          if (await page.locator('#menu-toggle').isVisible()) await tap(page, '#menu-toggle');
          await tap(page, page.locator('#nav-items').getByRole('button', { name: panel, exact: true }));
          if (panel === 'マップ') {
            assert.equal(await page.locator('#region-select option').count(), 18);
            await page.locator('#region-select').selectOption('17');
            assert.equal(await page.locator('#region-name').innerText(), '???');
          }
          if (panel === '今のボス状況') assert.equal(await page.locator('.unknown-hp strong').innerText(), '—');
          if (panel === 'ランキング') assert.match(await page.locator('.empty-records').innerText(), /未接続/);
          await capture(page, folder, `0${i + 6}-panel-${i + 1}`, view.states);
          await tap(page, '#panel-close');
        }
        assert.deepEqual((await snap(page)).campaign, before);
        await tap(page, '#reference-mail');
        await capture(page, folder, '11-mail-offline', view.states);
        await tap(page, '#reference-dialog .close-button');
        await tap(page, '#start-button');
        await capture(page, folder, '12-preflight', view.states);
        if (view.mobile && await page.locator('#mission-launch').isEnabled()) {
          await tap(page, '#mission-launch');
          assert.equal((await snap(page)).mission, null);
          assert.equal((await snap(page)).screen, 'home');
          assert.deepEqual((await snap(page)).campaign, before);
          await capture(page, folder, '13-safe-mobile-stop', view.states);
        }
        assert.equal(view.pageErrors.length, 0, 'unhandled page errors');
        assert.equal(view.externalRequests.length, 0, 'unapproved external HTTP request');
        assert.equal(view.websockets.length, 0, 'unexpected WebSocket');
        for (const state of view.states) assert(state.documentWidth <= width + 1, `horizontal overflow: ${state.name}`);
        view.status = 'PASS';
        console.log(`${name} ${width}x${height} PASS (${view.states.length} real screenshots)`);
      } catch (error) {
        view.status = 'FAIL';
        view.error = error.stack ?? String(error);
        try { await capture(page, folder, 'FAILURE', view.states); } catch {}
        result.failures.push({ browser: name, width, height, error: view.error });
        console.error(`${name} ${width}x${height} FAIL: ${error.message}`);
      } finally {
        await writeFile(resolve(folder, 'review.json'), JSON.stringify(view, null, 2));
        await context.close();
        await writeFile(resolve(output, 'review.json'), JSON.stringify(result, null, 2));
      }
    }
  } catch (error) {
    result.failures.push({ browser: name, stage: 'launch', error: error.stack ?? String(error) });
    console.error(`${name} launch failed: ${error.message}`);
  } finally {
    await browser?.close();
  }
}
result.status = result.failures.length ? 'FAIL' : 'PASS';
await writeFile(resolve(output, 'review.json'), JSON.stringify(result, null, 2));
server?.kill();
console.log(JSON.stringify({ status: result.status, browsers: result.browsers.map(b => ({ name: b.name, version: b.version, views: b.viewports.length })), failures: result.failures.length, report: resolve(output, 'review.json') }));
if (result.failures.length) process.exitCode = 1;
