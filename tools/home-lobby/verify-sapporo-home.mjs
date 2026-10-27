import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';

const output='release/sapporo-integration';await mkdir(output,{recursive:true});
const url=process.argv[2]??'http://127.0.0.1:4177/';
const standalone=url.startsWith('file:');
const browser=await chromium.launch({headless:true,executablePath:process.env.RECLAIM_TEST_BROWSER??'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
const report={url,passed:false,errors:[],consoleErrors:[],requests:[],failedRequests:[],deploymentImages:[]};let page;
try{
 const context=await browser.newContext({viewport:{width:1280,height:800}});
 await context.addInitScript(()=>{localStorage.clear();localStorage.setItem('reclaim.display.v1',JSON.stringify({quality:'low',reducedMotion:true}));HTMLCanvasElement.prototype.requestPointerLock=function(){return Promise.reject(new DOMException('Mouse fallback fixture','NotAllowedError'));};});
 page=await context.newPage();page.setDefaultTimeout(30000);
 page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(m.text());});
 page.on('response',r=>{if(r.url().includes('sapporo-map/deployment.webp'))report.deploymentImages.push({url:r.url(),status:r.status(),contentType:r.headers()['content-type']});});
 page.on('request',r=>{if(/^https?:/.test(r.url()))report.requests.push(r.url());});page.on('requestfailed',r=>report.failedRequests.push({url:r.url(),failure:r.failure()}));
 await page.goto(url,{waitUntil:'domcontentloaded',timeout:180000});await page.locator('body[data-ready="true"]').waitFor({timeout:120000});
 await page.locator('#home-button').click();await page.locator('#start-button').click();
 assert.ok(await page.locator('#mission-area-select option[value="sapporo"]').count());
 await page.locator('#mission-area-select').selectOption('sapporo');assert.match(await page.locator('#combat-reason').textContent(),/50体.*50体/);
 await page.screenshot({path:output+`/home-briefing${standalone?'-offline':''}.png`});await page.locator('#mission-launch').click();
 await page.waitForFunction(()=>window.__RECLAIM__?.missionSnapshot()?.areaId==='sapporo'&&window.__RECLAIM__.missionSnapshot()?.actors?.status==='ready'&&window.__RECLAIM__.missionSnapshot()?.bossActors?.status==='ready',null,{timeout:180000});
 const snapshot=()=>page.evaluate(()=>window.__RECLAIM__.snapshot());report.initial=await snapshot();
 assert.equal(report.initial.mission.city.phase,1);assert.equal(report.initial.mission.city.spawned,50);assert.equal(report.initial.mission.bosses.bosses.length,0);assert.equal(report.initial.mission.storyStep,0);assert.equal(report.initial.mission.actors.enemyUnitLimit,100);
 assert.ok(await page.locator('#mission-phase').isVisible());assert.match(await page.locator('#mission-phase').textContent(),/PHASE 1/);assert.equal(await page.locator('#mission-story').isVisible(),false);
 await page.locator('#mission-lock').click();await page.waitForFunction(()=>!window.__RECLAIM__.missionSnapshot().paused);const before=await snapshot();
 await page.keyboard.down('KeyW');try{await page.waitForFunction(d=>window.__RECLAIM__.missionSnapshot().player.distance>d+2,before.mission.player.distance,{timeout:30000});}finally{await page.keyboard.up('KeyW');}
 await page.mouse.click(640,400);await page.waitForFunction(n=>window.__RECLAIM__.missionSnapshot().shots>n,before.mission.shots);await page.keyboard.press('Escape');
 report.played=await snapshot();assert.ok(report.played.mission.city.elapsed>0);assert.equal(report.played.mission.city.phase,1);assert.equal(report.played.mission.storyStep,0);
 await page.screenshot({path:output+`/city-entry${standalone?'-offline':''}.png`});
 for(const size of [{width:1000,height:700},{width:800,height:600}]){await page.setViewportSize(size);assert.ok(await page.locator('#mission-phase').isVisible());assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 await page.locator('#mission-home').click();await page.waitForFunction(()=>window.__RECLAIM__.snapshot().screen==='home');report.returned=await snapshot();assert.equal(report.returned.mission,null);
 if(standalone)assert.deepEqual(report.requests,[]);else{assert.equal(report.deploymentImages.length,1);assert.equal(report.deploymentImages[0].status,200);assert.match(report.deploymentImages[0].contentType,/image\/webp/);}assert.deepEqual(report.errors,[]);assert.deepEqual(report.consoleErrors,[]);assert.deepEqual(report.failedRequests,[]);report.passed=true;
 console.log('PASS: production HOME→Sapporo selection→actual city/50 enemies→walk/fire with intro0→pause→HOME; responsive HUD'+(standalone?', offline with zero HTTP requests.':'.'));
}catch(error){report.failure=String(error.stack??error);if(page)await page.screenshot({path:output+`/home-failure${standalone?'-offline':''}.png`}).catch(()=>{});throw error;}finally{await writeFile(output+`/home-check${standalone?'-offline':''}.json`,JSON.stringify(report,null,2));await browser.close();}
