import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const output=resolve('release');await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.RECLAIM_TEST_BROWSER??'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
try {
  const context=await browser.newContext({viewport:{width:1600,height:900},deviceScaleFactor:1,reducedMotion:'reduce'});
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(process.argv[2]??'http://127.0.0.1:5173/');
  const enterHome=async()=>{
    await page.locator('body[data-ready="true"]').waitFor();
    if(await page.locator('#title-screen').isVisible())await page.locator('#home-button').click();
    await page.waitForFunction(()=>window.__RECLAIM__.snapshot().lobby.status==='ready');
    await page.waitForFunction(()=>window.__RECLAIM__.snapshot().lobby.resources.triangles>10000);
  };
  await enterHome();const initial=await page.evaluate(()=>window.__RECLAIM__.snapshot());
  await page.locator('[data-panel="weapons"]').click();
  const ids=await page.locator('.weapon-asset-card').evaluateAll(cards=>cards.map(card=>card.dataset.weaponId));
  assert.deepEqual(ids,['assault','sniper','knife']);
  await page.locator('.weapon-asset-card img').evaluateAll(images=>Promise.all(images.map(image=>image.decode())));
  assert.equal(await page.locator('[data-gun="rifle"]').count(),0);assert.equal(await page.locator('[data-gun="knife"]').count(),0);
  assert.ok((await page.locator('.weapon-melee-card').innerText()).includes('近接枠に装備'));
  assert.ok(!(await page.locator('#home-screen').innerText()).includes('日本刀'));
  assert.ok(!(await page.locator('#home-screen').innerText()).includes('小銃'));
  const panel=await page.locator('#home-panel').boundingBox();assert.ok(panel.y>=114&&panel.y+panel.height<=900);
  await page.screenshot({path:resolve(output,'WEAPONS-preview.png')});
  await page.locator('[data-slot="primary"][data-gun="sniper"]').click();
  const selected=await page.evaluate(()=>window.__RECLAIM__.snapshot());
  assert.equal(selected.home.preview.primary,'sniper');assert.equal(selected.home.preview.secondary,'assault');assert.deepEqual(selected.campaign,initial.campaign);
  await page.locator('#weapon-done').click();assert.ok((await page.locator('#held-weapon').innerText()).includes('サバイバルナイフ'));
  await page.locator('#start-button').click();const briefing=await page.locator('#panel-content').innerText();assert.ok(briefing.includes('サバイバルナイフ'));assert.ok(!briefing.includes('日本刀'));
  await page.locator('#briefing-back').click();await page.reload();await enterHome();
  const restored=await page.evaluate(()=>window.__RECLAIM__.snapshot());assert.equal(restored.home.preview.primary,'sniper');assert.equal(restored.home.preview.secondary,'assault');assert.deepEqual(restored.campaign,initial.campaign);
  await page.screenshot({path:resolve(output,'HOME-preview.png')});
  await page.locator('[data-panel="weapons"]').click();await page.setViewportSize({width:390,height:844});await page.locator('.weapon-asset-card img').evaluateAll(images=>Promise.all(images.map(image=>image.decode())));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:resolve(output,'WEAPONS-mobile-preview.png')});
  assert.deepEqual(errors,[]);await writeFile(resolve(output,'WEAPONS-preview-check.json'),JSON.stringify({ids,errors,preview:restored.home.preview,campaignUnchanged:true},null,2));
  console.log('PASS: supplied weapon previews, three-type catalogue, firearm swap/save/reload, knife slot, briefing and compact layout.');
  await context.close();
} finally {await browser.close();}
