import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

await mkdir('release',{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.RECLAIM_TEST_BROWSER??'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
try{
 const context=await browser.newContext({viewport:{width:900,height:700}});
 await context.addInitScript(()=>{
  localStorage.setItem('reclaim.display.v1',JSON.stringify({quality:'low',reducedMotion:false}));
  const native=HTMLCanvasElement.prototype.requestPointerLock;
  window.__nativeMouseLock=native;
  HTMLCanvasElement.prototype.requestPointerLock=function(){
   if(window.__delayMouseLock)return new Promise((_resolve,reject)=>{window.__rejectMouseLock=()=>reject(new DOMException('Denied late','NotAllowedError'));});
   return Promise.reject(new DOMException('Embedded view denies pointer lock','NotAllowedError'));
  };
  document.addEventListener('mousemove',event=>{window.__mouseButtons=event.buttons;window.__mouseTarget={tag:event.target?.tagName,id:event.target?.id,x:event.clientX,y:event.clientY};});
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 const state=()=>page.evaluate(()=>window.__RECLAIM__.missionSnapshot());
 const angle=(a,b)=>Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)));
 await page.goto(process.argv[2]??'http://127.0.0.1:5173/',{waitUntil:'domcontentloaded',timeout:90000});
 await page.locator('body[data-ready="true"]').waitFor({timeout:90000});
 if(await page.locator('#title-screen').isVisible())await page.locator('#home-button').click();
 await page.locator('#start-button').click();await page.locator('#mission-launch').click();
 await page.waitForFunction(()=>window.__RECLAIM__.missionSnapshot()!==null,null,{timeout:120000});
 if(await page.locator('#mission-skip').isVisible())await page.locator('#mission-skip').click();
 await page.locator('#mission-lock').click();await page.waitForFunction(()=>window.__RECLAIM__.missionSnapshot()?.inputMode==='free-mouse');
 await page.mouse.move(450,350);const before=await state();
 await page.mouse.move(490,320,{steps:4});const moved=await state();
 assert.equal(await page.evaluate(()=>window.__mouseButtons),0);
 assert.ok(angle(moved.player.yaw,before.player.yaw)>.05,'Mouse-only horizontal movement did not turn camera');
 assert.ok(moved.player.pitch>before.player.pitch+.03,'Mouse-only vertical movement did not look up');
 await page.mouse.move(899,350,{steps:12});await page.mouse.move(920,350,{steps:2});const edge=await state();
 let last=edge,rotation=0;const deadline=Date.now()+20000;
 // The cursor is now outside the viewport: do not send any further mouse
 // movement while proving a complete turn, including the yaw wrap at pi.
 while(last.elapsed-edge.elapsed<5.3&&Date.now()<deadline){
  await page.waitForTimeout(100);const next=await state();
  rotation+=Math.abs(Math.atan2(Math.sin(next.player.yaw-last.player.yaw),Math.cos(next.player.yaw-last.player.yaw)));last=next;
 }
 assert.ok(rotation>Math.PI*2,`Actual perimeter exit stopped before a full turn (${rotation} rad)`);
 const edgeTurned=last;
 const settings=await page.locator('#settings-button').boundingBox();await page.mouse.move(settings.x+settings.width/2,settings.y+settings.height/2);
 const ui=await state();await page.waitForTimeout(250);assert.ok(angle((await state()).player.yaw,ui.player.yaw)<1e-8,'Hovering UI continued edge turn');
 await page.keyboard.press('Escape');const stopped=await state();
 await page.mouse.move(450,350);await page.mouse.move(500,300,{steps:3});
 await page.evaluate(()=>document.dispatchEvent(new Event('pointerlockerror')));await page.waitForTimeout(150);
 assert.equal((await state()).paused,true);assert.equal((await state()).inputMode,'paused');assert.ok(angle((await state()).player.yaw,stopped.player.yaw)<1e-8);
 await page.evaluate(()=>{window.__delayMouseLock=true;});await page.locator('#mission-lock').click();await page.keyboard.press('Escape');
 await page.evaluate(()=>window.__rejectMouseLock());await page.waitForTimeout(150);assert.equal((await state()).paused,true,'Late pointer-lock rejection resumed paused gameplay');
 await page.evaluate(()=>{HTMLCanvasElement.prototype.requestPointerLock=window.__nativeMouseLock;});
 await page.locator('#mission-lock').click();await page.waitForFunction(()=>window.__RECLAIM__.missionSnapshot()?.inputMode==='pointer-lock');
 await page.waitForTimeout(160);const nativeStart=await state();await page.mouse.move(555,345,{steps:8});
 await page.waitForFunction(yaw=>Math.abs(Math.atan2(Math.sin(window.__RECLAIM__.missionSnapshot().player.yaw-yaw),Math.cos(window.__RECLAIM__.missionSnapshot().player.yaw-yaw)))>.03,nativeStart.player.yaw);
 const native=await state();assert.equal(native.locked,true);assert.equal(await page.evaluate(()=>window.__mouseButtons),0);
 await page.keyboard.press('Escape');await page.waitForFunction(()=>window.__RECLAIM__.missionSnapshot().paused);
 await page.locator('#mission-home').click();assert.deepEqual(errors,[]);
 await writeFile(resolve('release/MOUSE-LOOK-check.json'),JSON.stringify({errors,freeMouse:{before:before.player,after:moved.player,edgeStart:edge.player,edgeEnd:edgeTurned.player,continuousEdgeRotationRadians:rotation,cursorOutsideViewport:true,buttons:0},nativeMouse:{mode:native.inputMode,before:nativeStart.player,after:native.player,buttons:0},pauseAndLateRejection:true,uiStopsEdge:true},null,2));
 console.log('PASS: mouse-only view, actual viewport exit keeps rotating beyond 360 degrees without new mouse events, UI/ESC stop and native pointer lock.');
 await context.close();
}finally{await browser.close();}
