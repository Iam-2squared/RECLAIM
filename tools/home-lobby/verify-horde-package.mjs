import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';

const browser=await chromium.launch({headless:true,executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
try{
 const page=await browser.newPage({viewport:{width:900,height:700}}),errors=[],http=[];
 page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(/^https?:/.test(request.url()))http.push(request.url());});
 await page.goto('file:///C:/Users/Owner/Desktop/RECLAIM/home/HOME-PLAYABLE.html',{waitUntil:'domcontentloaded',timeout:120000});
 await page.locator('body[data-ready="true"]').waitFor({timeout:120000});
 await page.locator('#start-button').click();
 const waiting=await page.evaluate(()=>{document.getElementById('mission-launch').click();const dialog=document.getElementById('deployment-loading');return{open:dialog.open,photo:dialog.style.getPropertyValue('--deployment-photo'),background:getComputedStyle(dialog).backgroundImage};});
 assert.equal(waiting.open,true);assert.ok(waiting.background.includes('data:image/webp')||waiting.photo.includes('data:image/webp'));
 await page.waitForFunction(()=>{const state=window.__RECLAIM__.snapshot();return state.screen==='mission'&&state.mission?.world?.source==='authored-map';},null,{timeout:120000});
 await page.waitForFunction(()=>window.__RECLAIM__.missionSnapshot()?.actors?.status==='ready',null,{timeout:90000});
 const snapshot=await page.evaluate(()=>window.__RECLAIM__.snapshot());
 assert.equal(snapshot.mission.world.source,'authored-map');assert.equal(snapshot.mission.horde.spawned,0);assert.equal(snapshot.mission.horde.units.length,0);assert.equal(snapshot.mission.encounter.enemyBars,0);assert.equal(snapshot.mission.encounter.deviceBars,4);assert.equal(snapshot.mission.encounter.markers,1);assert.equal(snapshot.mission.player.hp,100);assert.equal(snapshot.mission.shield,0);
 assert.equal(snapshot.mission.horde.devices.length,4);assert.ok(snapshot.mission.horde.devices.every(device=>device.hp===500&&device.maxHp===500));assert.equal(snapshot.mission.horde.target,50);assert.equal(snapshot.mission.horde.nextSpawnIn,5);
 assert.deepEqual(snapshot.mission.horde.sources.map(source=>source.target).sort((a,b)=>a-b),[20,30]);assert.ok(snapshot.mission.horde.sources.every(source=>source.spawned===0));
 for(const source of snapshot.mission.horde.sources)assert.deepEqual(snapshot.mission.horde.devices.filter(device=>device.sourceId===source.id).map(device=>device.kind).sort(),['drone','humanoid']);
 assert.equal(snapshot.mission.weapon.unlimitedReserve,true);assert.equal(snapshot.mission.weapon.reserve,null);assert.ok((await page.locator('#mission-weapon').textContent()).includes('∞'),'Offline unlimited reserve HUD is missing');
 assert.equal(await page.locator('#player-health-bar').getAttribute('aria-valuenow'),'100');assert.equal(await page.locator('#player-shield-bar').getAttribute('aria-valuenow'),'0');
 assert.deepEqual(errors,[]);assert.deepEqual(http,[]);
 await page.screenshot({path:'release/HORDE-offline-interior.png'});
 await writeFile('release/HORDE-offline-check.json',JSON.stringify({errors,http,waiting:{open:waiting.open,photoEmbedded:true},snapshot},null,2));
 console.log('PASS: final standalone HOME deploys offline with embedded photograph, actual map and models, empty initial roads, four500HP devices,20/30 warehouse caps, unlimited ammo HUD/JSON, mission marker, HP100/shield0; no HTTP requests or page errors.');
}finally{await browser.close();}
