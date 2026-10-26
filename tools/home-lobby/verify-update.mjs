import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const output=resolve('release');await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.RECLAIM_TEST_BROWSER??'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
try {
 const context=await browser.newContext({viewport:{width:1600,height:900},reducedMotion:'no-preference'});
 const page=await context.newPage(),errors=[],mapRequests=[];
 page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(request.url().includes('home-map/shiretoko.html'))mapRequests.push(request.url());});
 await page.goto(process.argv[2]??'http://127.0.0.1:5173/',{waitUntil:'domcontentloaded',timeout:90000});
 await page.locator('body[data-ready="true"]').waitFor({timeout:90000});
 if(await page.locator('#title-screen').isVisible())await page.locator('#home-button').click();
 await page.waitForFunction(()=>window.__RECLAIM__.snapshot().lobby.status==='ready',null,{timeout:60000});
 const snapshot=()=>page.evaluate(()=>window.__RECLAIM__.snapshot());
 const initial=await snapshot();assert.equal(initial.lobby.animation.clip,'Idle');
 for(const character of ['jonesy','ramirez'])assert.equal(initial.lobby.animation.available[character].length,10);
 await page.waitForFunction(time=>window.__RECLAIM__.snapshot().lobby.animation.actors[0].mixerTime>time+.08,initial.lobby.animation.actors[0].mixerTime);
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.waitForFunction(()=>!window.__RECLAIM__.snapshot().lobby.running);
 const paused=await snapshot();await page.waitForTimeout(200);
 assert.deepEqual((await snapshot()).lobby.animation.actors,paused.lobby.animation.actors);
 await page.screenshot({path:resolve(output,'HOME-preview.png')});
 await page.locator('[data-panel="character"]').click();
 await page.locator('#preview-name').fill('あいうえおかきくけこさしすせそた');await page.locator('#apply-character').click();
 const labels=await page.locator('.survivor-label:visible').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height};}));
 for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++){const a=labels[i],b=labels[j];assert.ok(a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y,'Long character name overlaps another label');}
 assert.equal(mapRequests.length,0);
 await page.locator('[data-panel="map"]').click();
 await page.locator('.authored-map-preview').evaluate(image=>image.decode());
 assert.equal(mapRequests.length,0,'Map loaded before requested');
 assert.equal(await page.locator('#region-select option').count(),18);
 await page.locator('.authored-map-open').click();
 await page.locator('#authored-map-dialog[data-authored-map-state="ready"]').waitFor({timeout:60000}).catch(async error=>{
  await page.screenshot({path:resolve(output,'MAP-load-failure.png')});
  console.log(JSON.stringify({frames:page.frames().map(frame=>frame.url()),status:await page.locator('.authored-map-load').innerText(),errors}));
  throw error;
 });
 assert.equal((await snapshot()).lobby.active,false);
 const frame=page.frameLocator('.authored-map-frame');
 const terrain=await frame.locator('body').evaluate(()=>window.__terrainSnapshot());
 assert.ok(terrain.renderCount>0);assert.equal(terrain.contextLost,false);
 for(const preset of ['house','floor1','floor2','warehouse']){
  await frame.locator(`[data-preset="${preset}"]`).click();
  assert.equal(await frame.locator('body').evaluate(()=>window.__terrainSnapshot().preset),preset);
 }
 await page.screenshot({path:resolve(output,'MAP-preview.png')});
 await page.locator('#authored-map-close').click();assert.equal(await page.locator('#authored-map-dialog').count(),0);
 assert.equal((await snapshot()).lobby.active,true);assert.deepEqual((await snapshot()).campaign,initial.campaign);
 await page.keyboard.press('Escape');
 await page.locator('#solo-button').click();await page.locator('#home-character-select').selectOption('ramirez');
 assert.equal((await snapshot()).lobby.animation.actors[0].character,'ramirez');
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.waitForFunction(()=>window.__RECLAIM__.snapshot().lobby.running);
 await page.locator('#back-title').click();const title=await snapshot();await page.waitForTimeout(200);
 assert.deepEqual((await snapshot()).lobby.animation.actors,title.lobby.animation.actors);
 assert.deepEqual(errors,[]);
 await writeFile(resolve(output,'HOME-update-check.json'),JSON.stringify({errors,animation:initial.lobby.animation,map:terrain,mapRequests:mapRequests.length,campaignUnchanged:true},null,2));
 console.log('PASS: real Idle clips, motion pause/resume, long names, lazy authored map, interior presets, close disposal and unchanged campaign.');
 await context.close();
} finally {await browser.close();}
