import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

await mkdir('release',{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.RECLAIM_TEST_BROWSER??'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
try {
 const context=await browser.newContext({viewport:{width:900,height:700},reducedMotion:'no-preference'});
 await context.addInitScript(()=>{
  localStorage.setItem('reclaim.display.v1',JSON.stringify({quality:'low',reducedMotion:false}));
  // Verify the fallback used by embedded browser panels that deny pointer lock.
  HTMLCanvasElement.prototype.requestPointerLock=function(){return Promise.reject(new DOMException('Embedded browser denies pointer lock','NotAllowedError'));};
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 const state=()=>page.evaluate(()=>window.__RECLAIM__.snapshot());
 await page.goto(process.argv[2]??'http://127.0.0.1:5173/',{waitUntil:'domcontentloaded',timeout:90000});
 await page.locator('body[data-ready="true"]').waitFor({timeout:90000});
 if(await page.locator('#title-screen').isVisible())await page.locator('#home-button').click();
 await page.locator('#start-button').click();await page.locator('#mission-launch').click();
 await page.waitForFunction(()=>window.__RECLAIM__.snapshot().screen==='mission'&&window.__RECLAIM__.snapshot().mission?.world?.source==='authored-map',null,{timeout:120000});
 const spawned=await state();assert.ok(spawned.mission.player.x<-150&&spawned.mission.player.y>75);assert.equal(spawned.mission.world.atmosphere,'purple_storm');
 assert.equal(spawned.mission.world.authoredTerrainMeshes,12);assert.ok(spawned.mission.world.authoredStructureMeshes>=57);
 await page.screenshot({path:resolve('release/DEPLOY-interior.png')});
 await page.locator('#mission-continue').click();await page.locator('#mission-lock').click();
 await page.waitForFunction(()=>window.__RECLAIM__.snapshot().mission?.paused===false);
 assert.equal((await state()).mission.inputMode,'free-mouse');
 await page.keyboard.press('KeyE');await page.locator('#mission-continue').click();await page.locator('#mission-continue').click();
 await page.locator('#mission-lock').click();await page.waitForFunction(()=>!window.__RECLAIM__.snapshot().mission.paused);
 const start=(await state()).mission.player;
 await page.keyboard.down('KeyW');
 await page.waitForFunction(distance=>window.__RECLAIM__.snapshot().mission.player.distance>distance+9,start.distance,{timeout:30000});
 await page.keyboard.up('KeyW');const walked=await state();
 assert.ok(walked.mission.player.z<start.z-5,'Player did not walk through the actual front door');
 assert.equal(walked.mission.player.recoveries,0);assert.equal(walked.campaign.introStep,4);assert.ok(walked.mission.player.grounded);
 await page.keyboard.press('KeyV');await page.screenshot({path:resolve('release/DEPLOY-outside.png')});
 await page.keyboard.press('Escape');await page.locator('#mission-home').click();
 assert.equal((await state()).screen,'home');assert.ok((await state()).campaign.checkpoint);
 await page.locator('#start-button').click();await page.locator('#mission-resume').click();
 await page.waitForFunction(()=>window.__RECLAIM__.snapshot().screen==='mission',null,{timeout:120000});
 const resumed=await state();assert.ok(Math.abs(resumed.mission.player.z-walked.mission.player.z)<.5,'New map checkpoint did not resume');
 await page.locator('#mission-home').click();
 await page.locator('[data-panel="map"]').click();await page.locator('.authored-map-deploy').click();
 await page.waitForFunction(()=>window.__RECLAIM__.snapshot().screen==='mission',null,{timeout:120000});
 assert.equal((await state()).mission.world.source,'authored-map');
 await page.locator('#mission-home').click();assert.deepEqual(errors,[]);
 await writeFile('release/DEPLOY-check.json',JSON.stringify({errors,spawned:spawned.mission,walked:walked.mission,resumed:resumed.mission,campaign:walked.campaign,narrowPc:true,pointerLockFallback:true},null,2));
 console.log('PASS: narrow PC deployment into latest authored map, denied pointer-lock fallback, real radio/story, front-door walking, grounding and save/resume.');
 await context.close();
} catch(error){console.error(error);throw error;}finally{await browser.close();}
