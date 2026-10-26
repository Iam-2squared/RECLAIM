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
 await page.waitForFunction(()=>window.__RECLAIM__.missionSnapshot()?.horde?.spawned===2,null,{timeout:120000});
 await page.waitForFunction(()=>window.__RECLAIM__.missionSnapshot()?.actors?.status==='ready',null,{timeout:90000});
 const snapshot=await page.evaluate(()=>window.__RECLAIM__.snapshot());
 assert.equal(snapshot.mission.world.source,'authored-map');assert.equal(snapshot.mission.encounter.enemyBars,2);assert.equal(snapshot.mission.encounter.deviceBars,2);assert.equal(snapshot.mission.encounter.markers,1);assert.equal(snapshot.mission.player.hp,100);assert.equal(snapshot.mission.shield,0);
 assert.equal(await page.locator('#player-health-bar').getAttribute('aria-valuenow'),'100');assert.equal(await page.locator('#player-shield-bar').getAttribute('aria-valuenow'),'0');
 assert.deepEqual(errors,[]);assert.deepEqual(http,[]);
 await page.screenshot({path:'release/HORDE-offline-interior.png'});
 await writeFile('release/HORDE-offline-check.json',JSON.stringify({errors,http,waiting:{open:waiting.open,photoEmbedded:true},snapshot},null,2));
 console.log('PASS: final standalone HOME deploys offline with embedded photograph, actual map and models, 2 enemies, 2 devices, mission marker, HP100/shield0; no HTTP requests or page errors.');
}finally{await browser.close();}
