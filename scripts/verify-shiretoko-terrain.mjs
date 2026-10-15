import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const root = resolve(import.meta.dirname, '..'), release = resolve(root, 'release'), captures = resolve(release, 'shiretoko-phase1-review');
await mkdir(captures, { recursive: true });
const artifact = resolve(release, 'RECLAIM_Shiretoko_Terrain_Phase1.html');
const html = await readFile(artifact, 'utf8');
const markup = html.replace(/<script[\s\S]*?<\/script>/gi, tag => tag.slice(0,tag.indexOf('>')+1)+'</script>');
assert.ok(!/<script[^>]+src=|<link[^>]+rel="stylesheet"/i.test(markup), 'Standalone must embed its scripts and styles');
for (const css of html.matchAll(/<style>([\s\S]*?)<\/style>/gi)) for (const url of css[1].matchAll(/url\(([^)]+)\)/g)) assert.ok(url[1].replace(/["']/g,'').startsWith('data:'), 'Standalone font must be embedded');
const browser = await chromium.launch({
  headless: true, ...(process.env.RECLAIM_TEST_BROWSER ? { executablePath: process.env.RECLAIM_TEST_BROWSER } : {}),
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--allow-file-access-from-files'],
});
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
const page = await context.newPage(), errors = [], network = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.on('request', request => { if (/^https?:/.test(request.url())) network.push(request.url()); });
await page.addInitScript(() => {
  window.__storageAccesses = [];
  for (const method of ['getItem', 'setItem', 'removeItem', 'clear']) Storage.prototype[method] = function () { window.__storageAccesses.push(method); throw new Error('Review surface must not access game saves'); };
});
try {
  await page.goto(pathToFileURL(artifact).href);
  await page.waitForFunction(() => window.__SHIRETOKO_TERRAIN__?.diagnostics().ready, {}, { timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);
  assert.deepEqual(errors, []); checks.push('real WebGL compilation + first visible frame, no shader/page errors');
  const idleDraws = await page.evaluate(async () => {
    const api=window.__SHIRETOKO_TERRAIN__, start=api.diagnostics().renderCallsTotal;
    for(let i=0;i<15;i++) await new Promise(resolve=>requestAnimationFrame(resolve));
    return api.diagnostics().renderCallsTotal-start;
  });
  assert.ok(idleDraws<=1, 'An idle overview must not continually resubmit the same scene');
  checks.push('idle overview stops GPU redraws; camera/UI changes request a fresh frame');
  const initial = await page.evaluate(() => {
    const api = window.__SHIRETOKO_TERRAIN__, gl = document.querySelector('canvas').getContext('webgl2'), ext = gl.getExtension('WEBGL_debug_renderer_info');
    api.freeze(true);
    return { ...api.diagnostics(), renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) };
  });
  for (const [width, height] of [[1600,900],[1366,768],[1280,720],[1024,576]]) {
    await page.setViewportSize({ width, height });
    const clipped = await page.locator('.terrain-ui button').evaluateAll(buttons => buttons.filter(b => { const r = b.getBoundingClientRect(); return r.x < 0 || r.y < 0 || r.right > innerWidth || r.bottom > innerHeight; }).map(b => b.id || b.textContent));
    assert.deepEqual(clipped, []);
    const overlap=await page.evaluate(()=>{
      const a=document.querySelector('.scene-note').getBoundingClientRect(),b=document.querySelector('.locations').getBoundingClientRect();
      return Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
    });assert.equal(overlap,0,'Copy must not overlap location 01');
    await page.screenshot({path:resolve(captures,`UI-${width}x${height}.jpg`),type:'jpeg',quality:92});
    checks.push(`desktop controls fit ${width}x${height}`);
  }
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.screenshot({ path: resolve(captures, '01-overview-with-controls.jpg'), type: 'jpeg', quality: 92 });
  await page.evaluate(() => window.__SHIRETOKO_TERRAIN__.setClean(true));
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.masthead')).opacity === '0');
  // Render immediately after every camera change; this avoids screenshots of the previous swap buffer.
  for (let index = 0; index <= 4; index++) {
    await page.evaluate(index => window.__SHIRETOKO_TERRAIN__.setView(index), index);
    await page.screenshot({ path: resolve(captures, `${String(index + 2).padStart(2, '0')}-${['overview', 'cape', 'wetland', 'lake', 'mountains'][index]}.jpg`), type: 'jpeg', quality: 94 });
  }
  checks.push('actual clean WebGL captures: overview + all four locations');
  await page.keyboard.press('h');
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.masthead')).opacity === '1');
  await page.getByRole('button', { name: '標高', exact: true }).click();
  assert.equal(await page.locator('#elevation').getAttribute('aria-pressed'), 'true');
  await page.getByRole('button', { name: 'ルート', exact: true }).click();
  assert.equal(await page.locator('#route').getAttribute('aria-pressed'), 'true');
  await page.keyboard.press('h');
  assert.equal(await page.evaluate(()=>window.__SHIRETOKO_TERRAIN__.diagnostics().routeOverlayVisible),false);
  await page.keyboard.press('h');
  assert.equal(await page.evaluate(()=>window.__SHIRETOKO_TERRAIN__.diagnostics().routeOverlayVisible),true);
  checks.push('H hides terrain overlays as well as DOM UI, then restores the prior route toggle');
  await page.evaluate(() => window.__SHIRETOKO_TERRAIN__.setView(0));
  await page.screenshot({ path: resolve(captures, '07-elevation-and-route.jpg'), type: 'jpeg', quality: 92 });
  await page.locator('#elevation').click(); await page.locator('#route').click();
  await page.evaluate(() => window.__SHIRETOKO_TERRAIN__.setView(1));
  await page.locator('#walk').click();
  await page.waitForFunction(() => document.pointerLockElement === document.querySelector('canvas'));
  const before = await page.evaluate(() => window.__SHIRETOKO_TERRAIN__.diagnostics().player);
  await page.keyboard.down('w');
  // Wait on observed displacement, not a wall-clock key pulse between slow software-rendered frames.
  await page.waitForFunction(start => {
    const p = window.__SHIRETOKO_TERRAIN__.diagnostics().player;
    return Math.hypot(p.x-start.x,p.z-start.z) > .65;
  }, before, { timeout: 15000 });
  await page.keyboard.up('w');
  const moved = await page.evaluate(() => window.__SHIRETOKO_TERRAIN__.diagnostics().player);
  assert.ok(Math.hypot(moved.x-before.x,moved.z-before.z) > .65);
  assert.ok(moved.distance > before.distance + .65); checks.push('real user-gesture pointer lock and W keyboard movement in the current look direction');
  await page.keyboard.down('Space');
  await page.waitForFunction(() => !window.__SHIRETOKO_TERRAIN__.diagnostics().player.grounded, {}, { timeout: 15000 });
  await page.keyboard.up('Space');
  await page.waitForFunction(() => window.__SHIRETOKO_TERRAIN__.diagnostics().player.grounded, {}, { timeout: 15000 });
  // Protocol dispatch can complete before a slow software-GL page delivers
  // mousemove. Observe that real nonzero input before fixing the capture pose;
  // otherwise the late event changes yaw AFTER the exact0/-.06 assertions.
  await page.evaluate(()=>{
    window.__terrainLookDelivered=new Promise(resolve=>{
      const delivered=e=>{if(e.movementX||e.movementY){document.removeEventListener('mousemove',delivered);resolve();}};
      document.addEventListener('mousemove',delivered);
    });
  });
  await page.mouse.move(840, 475);
  await page.evaluate(async()=>{await window.__terrainLookDelivered;delete window.__terrainLookDelivered;});
  // Keep only the review image's heading reproducible after the real inputs.
  // Never move the walker or replace the W/jump/Escape assertions above/below.
  const beforeWalkingCapture=await page.evaluate(()=>{const api=window.__SHIRETOKO_TERRAIN__,w=api.walker;w.yaw=0;w.pitch=-.06;return api.diagnostics().renderCallsTotal;});
  // Walking continuously submits frames. The software-GPU page compositor can
  // stall on screenshot synchronization while that valid WebGL loop is active.
  // Wait for a real new submission, then read its preserved shader framebuffer.
  await page.waitForFunction(n=>window.__SHIRETOKO_TERRAIN__.diagnostics().renderCallsTotal>n,beforeWalkingCapture);
  const walkingReadback=await page.evaluate(()=>{
    const api=window.__SHIRETOKO_TERRAIN__,canvas=document.querySelector('canvas'),gl=canvas.getContext('webgl2');gl.finish();
    const d=api.diagnostics(),rgba=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,rgba);
    let min=255,max=0;for(let i=0;i<rgba.length;i+=4)for(let c=0;c<3;c++){min=Math.min(min,rgba[i+c]);max=Math.max(max,rgba[i+c]);}
    return{width:canvas.width,height:canvas.height,viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,preserveDrawingBuffer:Boolean(gl.getContextAttributes()?.preserveDrawingBuffer),mode:d.mode,pointerLocked:d.pointerLocked,grounded:d.player.grounded,inputKeys:d.inputKeys,contextLost:d.contextLost,shaderError:d.shaderError,renderCallsTotal:d.renderCallsTotal,groundError:Math.abs(d.player.y-api.terrain.heightAt(d.player.x,d.player.z)),yaw:api.walker.yaw,pitch:api.walker.pitch,cameraPosition:d.camera.position,fov:d.camera.fov,min,max,glError:gl.getError(),image:canvas.toDataURL('image/jpeg',.92)};
  });
  assert.equal(walkingReadback.glError,0);assert.equal(walkingReadback.preserveDrawingBuffer,true);assert.equal(walkingReadback.dpr,1);assert.deepEqual(walkingReadback.viewport,[1600,1000]);assert.equal(walkingReadback.width,1600);assert.equal(walkingReadback.height,1000);assert.ok(walkingReadback.max>walkingReadback.min,'Walking framebuffer is not blank');
  assert.equal(walkingReadback.mode,'walk');assert.equal(walkingReadback.pointerLocked,true);assert.equal(walkingReadback.grounded,true);assert.deepEqual(walkingReadback.inputKeys,[]);assert.equal(walkingReadback.contextLost,false);assert.equal(walkingReadback.shaderError,false);assert.ok(walkingReadback.renderCallsTotal>beforeWalkingCapture);assert.ok(walkingReadback.groundError<.001);
  assert.equal(walkingReadback.yaw,0);assert.equal(walkingReadback.pitch,-.06);assert.equal(walkingReadback.fov,66);
  assert.ok(walkingReadback.image.startsWith('data:image/jpeg;base64,'));const walkingJPEG=Buffer.from(walkingReadback.image.split(',')[1],'base64');assert.equal(walkingJPEG[0],255);assert.equal(walkingJPEG[1],216);
  await writeFile(resolve(captures,'08-first-person-cape-webgl-framebuffer.jpg'),walkingJPEG);
  const {image:unusedWalkingImage,...walkingCapture}=walkingReadback;walkingCapture.captureMethod='WebGL framebuffer (DOM overlay not included)';walkingCapture.file='08-first-person-cape-webgl-framebuffer.jpg';
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__SHIRETOKO_TERRAIN__.diagnostics().mode === 'orbit');
  checks.push('Space jump settles; Escape releases the pointer and returns to orbit');
  const passage = await page.evaluate(async () => {
    const api = window.__SHIRETOKO_TERRAIN__, w = api.walker, t = api.terrain;
    // Start of this independent walking test; intermediate points are NEVER teleported.
    w.place(-170, 850);
    const route = api.route.map(p => [p.x,p.z]);
    const start = w.distance; let maxGroundError = 0, ticks = 0;
    for (const [x,z] of [...route.slice(1), ...route.slice(0,-1).reverse()]) {
      let segmentTicks = 0;
      while (Math.hypot(w.x-x,w.z-z) > .12 && segmentTicks < 6000) {
        w.yaw = Math.atan2(-(x-w.x), -(z-w.z)); w.step({ forward:1, right:0, sprint:true, jump:false }, 1/60);
        maxGroundError = Math.max(maxGroundError, Math.abs(w.y-t.heightAt(w.x,w.z))); segmentTicks++; ticks++;
      }
      if (segmentTicks >= 6000) throw new Error(`Route blocked at ${x},${z}`);
    }
    return { distanceMetres: w.distance-start, ticks, maxGroundError, final: { x:w.x,y:w.y,z:w.z } };
  });
  assert.ok(passage.distanceMetres > 4100); assert.ok(passage.maxGroundError < .001); checks.push('browser: full 4.1km round trip with the actual walker, fixed 60Hz simulation');
  const storage = await page.evaluate(() => window.__storageAccesses);
  assert.deepEqual(storage, []); assert.deepEqual(network, []); assert.deepEqual(errors, []);
  checks.push('zero network requests and zero local/session-storage access');
  const measured = await page.evaluate(() => window.__SHIRETOKO_TERRAIN__.diagnostics());
  await page.evaluate(() => window.__SHIRETOKO_TERRAIN__.dispose());
  assert.equal(await page.locator('canvas').count(), 0);
  const disposed=await page.evaluate(()=>window.__SHIRETOKO_TERRAIN__.diagnostics());assert.equal(disposed.geometries,0);assert.equal(disposed.textures,0); checks.push('explicit dispose releases canvas / scene / GPU resources and input listeners');
  const samples = measured.frameTimesMs.filter(x => x > 0).sort((a,b) => a-b), percentile = p => samples[Math.min(samples.length-1,Math.floor(samples.length*p))] ?? null;
  const report = { source: html.match(/name="reclaim-terrain-source" content="([^"]+)/)?.[1], artifactBytes: Buffer.byteLength(html), checks, errors, network, storage, initial, passage, walkingCapture, measurements: { frameIntervalMedianMs:percentile(.5), frameIntervalP95Ms:percentile(.95), note:'Headless Chromium / software SwiftShader, not a physical-PC FPS guarantee', end:measured } };
  await writeFile(resolve(captures,'verification.json'), JSON.stringify(report,null,2));
  console.log(JSON.stringify({ checks, firstFrameMs:initial.firstFrameMs, renderer:initial.renderer, passage, frameIntervalMedianMs:percentile(.5), frameIntervalP95Ms:percentile(.95), output:captures }, null, 2));
} catch(error) {
  await page.screenshot({path:resolve(captures,'FAILED-verification.png'),timeout:60000}).catch(()=>{});
  await writeFile(resolve(captures,'FAILED-verification.txt'),String(error));
  console.error('Verification failed', error);
  console.error('Runtime state',JSON.stringify(await page.evaluate(()=>window.__SHIRETOKO_TERRAIN__?.diagnostics()).catch(()=>null)));
  throw error;
} finally { await browser.close(); }
