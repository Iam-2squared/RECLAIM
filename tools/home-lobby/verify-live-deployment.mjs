import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';

const supplied=process.env.RECLAIM_LIVE_URL??process.argv[2];
if(!supplied)throw Error('Provide the deployed HTTPS URL as RECLAIM_LIVE_URL or the first argument.');
const destination=new URL(supplied);
if(destination.protocol!=='https:'&&!(destination.protocol==='http:'&&['127.0.0.1','localhost'].includes(destination.hostname)))throw Error('Verification requires HTTPS or a loopback development server.');
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
 assert.equal(spawned.mission.horde.spawned,0);assert.equal(spawned.mission.horde.units.length,0);assert.equal(spawned.mission.encounter.enemyBars,0);assert.equal(spawned.mission.encounter.deviceBars,4);assert.equal(spawned.mission.encounter.markers,1);
 assert.equal(spawned.mission.horde.devices.length,4);assert.ok(spawned.mission.horde.devices.every(device=>device.hp===500&&device.maxHp===500),'All four spawn devices must have500HP');assert.equal(spawned.mission.horde.target,50);assert.equal(spawned.mission.horde.nextSpawnIn,5);
 assert.deepEqual(spawned.mission.horde.sources.map(source=>source.target).sort((a,b)=>a-b),[20,30]);assert.ok(spawned.mission.horde.sources.every(source=>source.spawned===0));
 for(const source of spawned.mission.horde.sources)assert.deepEqual(spawned.mission.horde.devices.filter(device=>device.sourceId===source.id).map(device=>device.kind).sort(),['drone','humanoid']);
 assert.equal(spawned.mission.weapon.unlimitedReserve,true);assert.equal(spawned.mission.weapon.reserve,null);assert.ok((await page.locator('#mission-weapon').textContent()).includes('∞'),'Unlimited reserve is missing from the live HUD');
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
 const expectedSpawns=report.continuous.sources.reduce((sum,source)=>sum+Math.min(source.target,Math.floor((report.continuous.elapsed+1e-6)/5)),0);
 assert.ok(report.continuous.spawned>=2,'Each warehouse must spawn its first enemy after5active seconds');assert.equal(report.continuous.spawned,expectedSpawns);
 for(const source of report.continuous.sources){
  const units=report.continuous.units.filter(unit=>unit.sourceId===source.id);assert.equal(source.spawned,Math.min(source.target,Math.floor((report.continuous.elapsed+1e-6)/5)));assert.equal(units.length,source.spawned);
  for(const unit of units){assert.equal(unit.initial,false);assert.equal(unit.kind,unit.sourceSlot%2?'humanoid':'drone');}
 }
 assert.equal(continuous.mission.weapon.unlimitedReserve,true);assert.equal(continuous.mission.weapon.reserve,null);assert.ok((await page.locator('#mission-weapon').textContent()).includes('∞'));report.phases.push('two-warehouse-five-second-spawns-four-500hp-devices-and-unlimited-ammo');
 await page.keyboard.press('KeyV');await page.screenshot({path:'release/vercel-live/outside.png'});report.phases.push('story-front-door-and-mouse-fallback');
 await page.keyboard.press('Escape');
 await page.waitForTimeout(400);
 const pausedBefore=await state();await page.waitForTimeout(400);const pausedAfter=await state();
 report.pausedFrames={before:pausedBefore.renderClock.frames,after:pausedAfter.renderClock.frames};
 assert.ok(Number.isFinite(report.pausedFrames.before));
 assert.equal(report.pausedFrames.after,report.pausedFrames.before,'Paused game continued submitting animation frames');
 report.phases.push('paused-rendering-stops');
 await page.locator('#mission-home').click();assert.equal((await state()).screen,'home');assert.ok((await state()).campaign.checkpoint);
 await page.locator('#start-button').click();await page.locator('#mission-resume').click();await page.waitForFunction(()=>window.__RECLAIM__.snapshot().screen==='mission',null,{timeout:180000});
 const resumed=await state();report.resumed=resumed.mission;assert.ok(Math.abs(resumed.mission.player.z-walked.mission.player.z)<.5,'New map checkpoint did not resume');
 await page.locator('#mission-home').click();await page.locator('[data-panel="map"]').click();await page.locator('.authored-map-deploy').click();
 await page.waitForFunction(()=>window.__RECLAIM__.snapshot().screen==='mission',null,{timeout:180000});assert.equal((await state()).mission.world.source,'authored-map');await page.locator('#mission-home').click();
 report.phases.push('save-resume-and-map-deploy');
 const gameFailures=report.failedRequests.filter(request=>new URL(request.url).origin===destination.origin&&!request.error.includes('ERR_ABORTED'));
 const gameHttpErrors=report.httpErrors.filter(response=>new URL(response.url).origin===destination.origin&&!response.url.includes('/favicon.ico'));
 assert.deepEqual(report.pageErrors,[]);assert.deepEqual(gameFailures,[]);assert.deepEqual(gameHttpErrors,[]);assert.deepEqual(report.consoleErrors,[]);
 report.passed=true;console.log('PASS: live HTTPS deploy, embedded waiting photo, actual map/models, empty initial roads, four500HP devices,20/30 warehouse caps, alternating5-second spawns, unlimited ammo HUD/JSON, story, front door, mouse fallback, save/resume and map deploy; no game request or page errors.');
}catch(error){
 report.failure=sanitize(error?.stack??error);if(page)await page.screenshot({path:'release/vercel-live/failure.png'}).catch(()=>{});throw new Error(sanitize(error?.message??error));
}finally{
 await writeFile('release/vercel-live/check.json',JSON.stringify(report,null,2));
 await context?.close();await browser.close();
}
