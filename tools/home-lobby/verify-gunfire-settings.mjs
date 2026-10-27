import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const output='release/audio-update';await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.RECLAIM_TEST_BROWSER??'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
const report={passed:false,errors:[],consoleErrors:[]};let page;
try{
 const context=await browser.newContext({viewport:{width:1000,height:800}});await context.addInitScript(()=>{if(!localStorage.getItem('reclaim.display.v1'))localStorage.setItem('reclaim.display.v1',JSON.stringify({quality:'low',reducedMotion:false}));HTMLCanvasElement.prototype.requestPointerLock=function(){return Promise.reject(new DOMException('Fixture mouse fallback','NotAllowedError'));};});
 page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(m.text());});
 await page.goto(process.argv[2]??'http://127.0.0.1:4177/',{waitUntil:'domcontentloaded',timeout:120000});await page.locator('body[data-ready="true"]').waitFor();
 const state=()=>page.evaluate(()=>window.__RECLAIM__.snapshot());
 await page.locator('#title-settings').click();assert.equal(await page.locator('#gunfire-toggle').isChecked(),true);assert.equal(await page.locator('#sound-button').getAttribute('aria-pressed'),'false');
 await page.locator('#gunfire-toggle').uncheck();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('reclaim.display.v1')).gunfire),false);
 await page.reload();await page.locator('body[data-ready="true"]').waitFor();await page.locator('#title-settings').click();assert.equal(await page.locator('#gunfire-toggle').isChecked(),false);
 await page.locator('#gunfire-toggle').check();await page.screenshot({path:output+'/settings-desktop.png'});await page.keyboard.press('Escape');
 await page.locator('#home-button').click();await page.locator('#start-button').click();await page.locator('#mission-launch').click();
 await page.waitForFunction(()=>window.__RECLAIM__.snapshot().screen==='mission'&&window.__RECLAIM__.missionSnapshot()?.bossActors?.status==='ready',null,{timeout:180000});
 const initial=await state();report.initial=initial;assert.deepEqual(initial.mission.bosses.bosses.map(b=>b.hp),[1000,1000]);
 assert.deepEqual(await page.locator('#mission-boss-health [role="progressbar"]').evaluateAll(nodes=>nodes.map(n=>Number(n.getAttribute('aria-valuemax')))),[1000,1000]);
 await page.locator('#mission-continue').click();await page.locator('#mission-lock').click();await page.waitForFunction(()=>!window.__RECLAIM__.missionSnapshot().paused);
 await page.keyboard.press('KeyE');await page.locator('#mission-continue').click();await page.locator('#mission-continue').click();await page.locator('#mission-lock').click();
 await page.waitForFunction(()=>!window.__RECLAIM__.missionSnapshot().paused);const start=(await state()).mission.player.distance;await page.keyboard.down('KeyW');try{await page.waitForFunction(distance=>window.__RECLAIM__.missionSnapshot().player.distance>distance+9,start,{timeout:40000});}finally{await page.keyboard.up('KeyW');}
 await page.waitForFunction(()=>window.__RECLAIM__.missionSnapshot().storyStep===4);
 const fire=async()=>{await page.waitForTimeout(180);const before=await state();await page.mouse.click(500,400);await page.waitForFunction(shots=>window.__RECLAIM__.missionSnapshot().shots>shots,before.mission.shots,{timeout:5000});await page.waitForTimeout(50);return {before,after:await state()};};
 report.assault=await fire();assert.equal(report.assault.after.audio.ambientEnabled,false);assert.equal(report.assault.after.audio.gunfireEnabled,true);assert.ok(report.assault.after.audio.shotCount>report.assault.before.audio.shotCount);assert.equal(report.assault.after.audio.lastWeapon,'assault');
 await page.locator('#settings-button').click();await page.locator('#gunfire-toggle').uncheck();assert.equal((await state()).audio.activeShotVoices,0);await page.keyboard.press('Escape');await page.locator('#mission-lock').click();await page.waitForFunction(()=>!window.__RECLAIM__.missionSnapshot().paused);
 report.muted=await fire();assert.equal(report.muted.after.audio.shotCount,report.muted.before.audio.shotCount);assert.ok(report.muted.after.mission.shots>report.muted.before.mission.shots);
 await page.locator('#sound-button').click();assert.equal((await state()).audio.ambientEnabled,true);report.windWithMutedGun=await fire();assert.equal(report.windWithMutedGun.after.audio.shotCount,report.windWithMutedGun.before.audio.shotCount);await page.locator('#sound-button').click();
 await page.locator('#settings-button').click();await page.locator('#gunfire-toggle').check();await page.keyboard.press('Escape');await page.locator('#mission-lock').click();await page.waitForFunction(()=>!window.__RECLAIM__.missionSnapshot().paused);await page.keyboard.press('Digit2');report.sniper=await fire();assert.equal(report.sniper.after.audio.lastWeapon,'sniper');assert.ok(report.sniper.after.audio.shotCount>report.sniper.before.audio.shotCount);assert.equal(report.sniper.after.audio.ambientEnabled,false);
 await page.keyboard.press('Escape');assert.equal((await state()).audio.activeShotVoices,0);
 await page.locator('#settings-button').click();await page.locator('#gunfire-toggle').uncheck();await page.keyboard.press('Escape');
 await page.reload();await page.locator('body[data-ready="true"]').waitFor();await page.locator('#title-settings').click();assert.equal(await page.locator('#gunfire-toggle').isChecked(),false);assert.equal((await state()).audio.gunfireEnabled,false);
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:output+'/settings-mobile.png'});assert.ok(await page.locator('#gunfire-toggle').isVisible());const bounds=await page.locator('#settings-dialog').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=391);await page.locator('#gunfire-toggle').check();await page.keyboard.press('Escape');
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.consoleErrors,[]);report.passed=true;console.log('PASS: two1000HP bosses, saved independent gunfire switch, actual assault/sniper shots audible with wind off, mute silences only gunfire, wind independent, pause stops voices, responsive settings.');
}catch(error){report.failure=String(error.stack??error);if(page)await page.screenshot({path:output+'/failure.png'}).catch(()=>{});throw error;}finally{await writeFile(output+'/check.json',JSON.stringify(report,null,2));await browser.close();}
