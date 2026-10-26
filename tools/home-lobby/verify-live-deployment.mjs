import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';

const supplied=process.env.RECLAIM_LIVE_URL??process.argv[2];
if(!supplied)throw Error('Provide the deployed HTTPS URL as RECLAIM_LIVE_URL or the first argument.');
const destination=new URL(supplied);
if(destination.protocol!=='https:')throw Error('Live verification requires HTTPS.');
const publicUrl=destination.origin+destination.pathname;
const sanitize=value=>String(value).replace(/([?&](?:_vercel_share|x-vercel-protection-bypass|token)=)[^\s&"']+/gi,'$1[redacted]');
const cleanUrl=value=>{try{const parsed=new URL(value);return parsed.origin+parsed.pathname;}catch{return sanitize(value);}};
await mkdir('release/vercel-live',{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.RECLAIM_TEST_BROWSER??'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
const report={url:publicUrl,checkedAt:new Date().toISOString(),pageErrors:[],consoleErrors:[],failedRequests:[],httpErrors:[],phases:[],passed:false};
let context,page;
try{
 context=await browser.newContext({viewport:{width:900,height:700},reducedMotion:'no-preference'});
 await context.addInitScript(()=>{
  localStorage.setItem('reclaim.display.v1',JSON.stringify({quality:'low',reducedMotion:false}));
  HTMLCanvasElement.prototype.requestPointerLock=function(){return Promise.reject(new DOMException('Embedded browser denies pointer lock','NotAllowedError'));};
 });
 page=await context.newPage();
 page.on('pageerror',error=>report.pageErrors.push(sanitize(error.message)));
 page.on('console',message=>{if(message.type()==='error')report.consoleErrors.push(sanitize(message.text()));});
 page.on('requestfailed',request=>report.failedRequests.push({url:cleanUrl(request.url()),error:sanitize(request.failure()?.errorText??'request failed')}));
 page.on('response',response=>{if(response.status()>=400)report.httpErrors.push({url:cleanUrl(response.url()),status:response.status()});});
 const state=()=>page.evaluate(()=>window.__RECLAIM__.snapshot());
 const documentResponse=await page.goto(destination.href,{waitUntil:'domcontentloaded',timeout:120000});
 report.documentStatus=documentResponse?.status()??null;
 assert.equal(report.documentStatus,200,'Deployment document did not return HTTP200.');
 await page.locator('body[data-ready="true"]').waitFor({timeout:120000});
 report.phases.push('application-ready');
 if(await page.locator('#title-screen').isVisible())await page.locator('#home-button').click();
 await page.locator('#start-button').click();
 const waiting=await page.evaluate(()=>{
  document.getElementById('mission-launch').click();
  const dialog=document.getElementById('deployment-loading'),background=getComputedStyle(dialog).backgroundImage,photo=dialog.style.getPropertyValue('--deployment-photo');
  return{open:dialog.open,photoEmbedded:background.includes('data:image/webp')||photo.includes('data:image/webp')};
 });
 assert.ok(waiting.open&&waiting.photoEmbedded,'Deployment waiting dialog lacks the map photo.');report.waiting=waiting;
 await page.waitForFunction(()=>window.__RECLAIM__.snapshot().screen==='mission'&&window.__RECLAIM__.snapshot().mission?.world?.source==='authored-map',null,{timeout:180000});
 await page.waitForFunction(()=>window.__RECLAIM__.missionSnapshot()?.actors?.status==='ready',null,{timeout:120000});
 const spawned=await state();report.spawned=spawned.mission;
 assert.ok(spawned.mission.player.x<-150&&spawned.mission.player.y>75);assert.equal(spawned.mission.world.atmosphere,'purple_storm');
 assert.equal(spawned.mission.world.authoredTerrainMeshes,12);assert.ok(spawned.mission.world.authoredStructureMeshes>=57);
 assert.equal(spawned.mission.horde.spawned,2);assert.equal(spawned.mission.encounter.enemyBars,2);assert.equal(spawned.mission.encounter.deviceBars,2);assert.equal(spawned.mission.encounter.markers,1);
 assert.ok(spawned.mission.horde.devices.every(device=>device.hp===500&&device.maxHp===500),'Both spawn devices must have500HP');assert.equal(spawned.mission.horde.target,50);assert.equal(spawned.mission.horde.nextSpawnIn,5);
 assert.equal(spawned.mission.player.hp,100);assert.equal(spawned.mission.shield,0);assert.equal(await page.locator('#player-health-bar').getAttribute('aria-valuenow'),'100');assert.equal(await page.locator('#player-shield-bar').getAttribute('aria-valuenow'),'0');
 assert.ok(spawned.mission.actors.enemyUnits.every(unit=>unit.loaded&&!unit.fallback));report.phases.push('actual-map-models-and-horde-ready');
 await page.screenshot({path:'release/vercel-live/interior.png'});
 await page.locator('#mission-continue').click();await page.locator('#mission-lock').click();
 await page.waitForFunction(()=>window.__RECLAIM__.missionSnapshot()?.paused===false);
 assert.equal((await state()).mission.inputMode,'free-mouse');
 await page.keyboard.press('KeyE');await page.locator('#mission-continue').click();await page.locator('#mission-continue').click();
 await page.locator('#mission-lock').click();await page.waitForFunction(()=>!window.__RECLAIM__.missionSnapshot().paused);
 const start=(await state()).mission.player;await page.keyboard.down('KeyW');
 try{await page.waitForFunction(distance=>window.__RECLAIM__.missionSnapshot().player.distance>distance+9,start.distance,{timeout:40000});}finally{await page.keyboard.up('KeyW');}
 const walked=await state();report.walked=walked.mission;
 assert.ok(walked.mission.player.z<start.z-5,'Player did not walk through the actual front door');assert.equal(walked.mission.player.recoveries,0);assert.equal(walked.campaign.introStep,4);assert.ok(walked.mission.player.grounded);
 await page.waitForFunction(()=>window.__RECLAIM__.missionSnapshot().horde.elapsed>=5.1,null,{timeout:20000});
 const continuous=await state();report.continuous=continuous.mission.horde;
 assert.ok(report.continuous.spawned>=3,'The first reinforcement must appear after5active seconds');assert.equal(report.continuous.spawned,Math.min(50,2+Math.floor((report.continuous.elapsed+1e-6)/5)));report.phases.push('continuous-five-second-spawns-and-500hp-devices');
 await page.keyboard.press('KeyV');await page.screenshot({path:'release/vercel-live/outside.png'});report.phases.push('story-front-door-and-mouse-fallback');
 await page.keyboard.press('Escape');await page.locator('#mission-home').click();assert.equal((await state()).screen,'home');assert.ok((await state()).campaign.checkpoint);
 await page.locator('#start-button').click();await page.locator('#mission-resume').click();await page.waitForFunction(()=>window.__RECLAIM__.snapshot().screen==='mission',null,{timeout:180000});
 const resumed=await state();report.resumed=resumed.mission;assert.ok(Math.abs(resumed.mission.player.z-walked.mission.player.z)<.5,'New map checkpoint did not resume');
 await page.locator('#mission-home').click();await page.locator('[data-panel="map"]').click();await page.locator('.authored-map-deploy').click();
 await page.waitForFunction(()=>window.__RECLAIM__.snapshot().screen==='mission',null,{timeout:180000});assert.equal((await state()).mission.world.source,'authored-map');await page.locator('#mission-home').click();
 report.phases.push('save-resume-and-map-deploy');
 const gameFailures=report.failedRequests.filter(request=>new URL(request.url).origin===destination.origin&&!request.error.includes('ERR_ABORTED'));
 const gameHttpErrors=report.httpErrors.filter(response=>new URL(response.url).origin===destination.origin&&!response.url.includes('/favicon.ico'));
 assert.deepEqual(report.pageErrors,[]);assert.deepEqual(gameFailures,[]);assert.deepEqual(gameHttpErrors,[]);assert.deepEqual(report.consoleErrors,[]);
 report.passed=true;console.log('PASS: live HTTPS deploy, embedded waiting photo, actual map/models, initial horde/HP/shield, story, front door, mouse fallback, save/resume and map deploy; no game request or page errors.');
}catch(error){
 report.failure=sanitize(error?.stack??error);if(page)await page.screenshot({path:'release/vercel-live/failure.png'}).catch(()=>{});throw new Error(sanitize(error?.message??error));
}finally{
 await writeFile('release/vercel-live/check.json',JSON.stringify(report,null,2));
 await context?.close();await browser.close();
}
