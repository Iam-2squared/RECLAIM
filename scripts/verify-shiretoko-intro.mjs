import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const out=resolve('release/shiretoko-phase1-review/intro');await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.RECLAIM_TEST_BROWSER?{executablePath:process.env.RECLAIM_TEST_BROWSER}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--allow-file-access-from-files']});
const context=await browser.newContext({viewport:{width:1366,height:768},deviceScaleFactor:1});
const page=await context.newPage(),errors=[],requests=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
await page.addInitScript(()=>{
 window.__storage=[];
 for(const name of ['getItem','setItem','removeItem','clear'])Storage.prototype[name]=()=>{window.__storage.push(name);throw new Error('No save access in intro');};
});
const state=()=>page.evaluate(()=>window.__SHIRETOKO_TERRAIN__.diagnostics());
const ready=()=>page.waitForFunction(()=>window.__SHIRETOKO_TERRAIN__?.diagnostics().ready,{}, {timeout:60000});
const open=()=>page.evaluate(()=>window.__SHIRETOKO_TERRAIN__.openIntro());
try {
 await page.goto(pathToFileURL(resolve('release/RECLAIM_Shiretoko_Intro_Demo.html')).href);await ready();
 await page.waitForFunction(()=>window.__SHIRETOKO_TERRAIN__.diagnostics().intro==='overview');
 assert.equal((await state()).sound,'off / no audio resources');
 await page.screenshot({path:resolve(out,'01-overview.jpg'),type:'jpeg',quality:94});
 const initial=await state();
 const idle=await page.evaluate(async()=>{const a=window.__SHIRETOKO_TERRAIN__,n=a.diagnostics().renderCallsTotal;for(let i=0;i<16;i++)await new Promise(r=>requestAnimationFrame(r));return a.diagnostics().renderCallsTotal-n;});assert.ok(idle<=1);
 for(const [width,height] of [[1600,900],[1366,768],[1280,720],[1024,576]]){
  await page.setViewportSize({width,height});
  const layout=await page.locator('#intro-panel button:not([hidden])').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect()).every(r=>r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight));assert.ok(layout);
  await page.screenshot({path:resolve(out,`overview-${width}x${height}.jpg`),type:'jpeg',quality:92});
 }
 checks.push('isolated intro loads, sound off, on-demand idle, four desktop layouts');
 await page.setViewportSize({width:1366,height:768});
 await page.locator('#intro-explore').click();await page.waitForFunction(()=>window.__SHIRETOKO_TERRAIN__.diagnostics().pointerLocked);assert.equal((await state()).mode,'walk');
 await page.keyboard.down('w');const before=(await state()).player;
 await page.waitForFunction(p=>{const q=window.__SHIRETOKO_TERRAIN__.diagnostics().player;return Math.hypot(q.x-p.x,q.z-p.z)>.5;},before,{timeout:15000});await page.keyboard.up('w');
 await page.keyboard.press('Escape');await page.waitForFunction(()=>window.__SHIRETOKO_TERRAIN__.diagnostics().mode==='orbit');checks.push('direct start with real user-gesture pointer lock, movement and Escape');
 await open();await page.locator('#intro-fly').click();await page.waitForFunction(()=>window.__SHIRETOKO_TERRAIN__.diagnostics().intro==='landed',{}, {timeout:20000});
 assert.equal((await state()).pointerLocked,false);assert.equal((await state()).routeOverlayVisible,false);
 // A landed state is set before the frame is submitted. Wait for a stable idle
 // frame, then read its actual WebGL framebuffer. Chromium's software-GPU page
 // compositor can stall on a screenshot after pointer-lock/flight even when
 // gl.finish has completed; direct readback still captures the real shader pixels.
 const stable=await page.evaluate(async()=>{
  const api=window.__SHIRETOKO_TERRAIN__;let previous=-1,same=0;
  for(let i=0;i<30&&same<3;i++){await new Promise(r=>requestAnimationFrame(r));const count=api.diagnostics().renderCallsTotal;same=count===previous?same+1:0;previous=count;}
  document.querySelector('canvas').getContext('webgl2').finish();
  return {same,state:api.diagnostics().intro};
 });assert.ok(stable.same>=3);assert.equal(stable.state,'landed');
 await page.bringToFront();
 const landedReadback=await page.evaluate(async()=>{
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  const canvas=document.querySelector('canvas'),gl=canvas.getContext('webgl2');gl.finish();
  const rgba=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,rgba);
  let min=255,max=0;for(let i=0;i<rgba.length;i+=4)for(let c=0;c<3;c++){min=Math.min(min,rgba[i+c]);max=Math.max(max,rgba[i+c]);}
  return{width:canvas.width,height:canvas.height,viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,preserveDrawingBuffer:Boolean(gl.getContextAttributes()?.preserveDrawingBuffer),introState:window.__SHIRETOKO_TERRAIN__.diagnostics().intro,min,max,glError:gl.getError(),image:canvas.toDataURL('image/jpeg',.94)};
 });
 assert.equal(landedReadback.glError,0);assert.equal(landedReadback.preserveDrawingBuffer,true);assert.equal(landedReadback.introState,'landed');assert.equal(landedReadback.dpr,1);assert.deepEqual(landedReadback.viewport,[1366,768]);assert.equal(landedReadback.width,1366);assert.equal(landedReadback.height,768);assert.ok(landedReadback.max>landedReadback.min,'Landed framebuffer is not blank');
 assert.ok(landedReadback.image.startsWith('data:image/jpeg;base64,'));const landedJPEG=Buffer.from(landedReadback.image.split(',')[1],'base64');assert.equal(landedJPEG[0],255);assert.equal(landedJPEG[1],216);
 await writeFile(resolve(out,'02-landed-webgl-framebuffer.jpg'),landedJPEG);
 const {image:unusedImage,...landedCapture}=landedReadback;landedCapture.captureMethod='WebGL framebuffer (DOM overlay not included)';landedCapture.file='02-landed-webgl-framebuffer.jpg';
 await page.locator('#intro-explore').click();await page.waitForFunction(()=>window.__SHIRETOKO_TERRAIN__.diagnostics().pointerLocked);await page.keyboard.press('Escape');checks.push('optional flight ends at a new explicit click, never acquires lock asynchronously');
 await open();await page.locator('#intro-fly').click();await page.keyboard.press('Escape');assert.equal((await state()).intro,'closed');
 await open();await page.locator('#intro-cancel').click();assert.equal((await state()).intro,'closed');checks.push('Escape cancels camera travel; cancel returns to isolated overview');
 for(let i=0;i<10;i++){await open();await page.locator('#intro-cancel').click();}
 const after=await state();assert.equal(after.geometries,initial.geometries);assert.equal(after.textures,initial.textures);checks.push('ten intro round trips reuse the same renderer / terrain / textures');
 await page.emulateMedia({reducedMotion:'reduce'});await open();await page.locator('#intro-fly').click();await page.waitForFunction(()=>window.__SHIRETOKO_TERRAIN__.diagnostics().intro==='landed',{}, {timeout:15000});await page.keyboard.press('Escape');checks.push('reduced motion bypasses the animated travel');
 await open();await page.evaluate(()=>{document.querySelector('canvas').requestPointerLock=()=>Promise.reject(new Error('Intentional lock denial'));});
 await page.locator('#intro-explore').click();await page.waitForFunction(()=>!document.querySelector('#walk-message').hidden);assert.equal((await state()).pointerLocked,false);await page.keyboard.press('Escape');checks.push('pointer-lock denial leaves a visible recovery message and Escape exit');
 await open();await page.evaluate(()=>{const gl=document.querySelector('canvas').getContext('webgl2');gl.getExtension('WEBGL_lose_context').loseContext();});
 await page.waitForFunction(()=>window.__SHIRETOKO_TERRAIN__.diagnostics().contextLost);assert.equal(await page.locator('#error').isVisible(),true);assert.equal((await state()).intro,'closed');
 await page.screenshot({path:resolve(out,'03-context-loss-recovery.jpg'),type:'jpeg',quality:92});checks.push('context loss cancels intro and shows reload guidance without save access');
 assert.deepEqual(await page.evaluate(()=>window.__storage),[]);assert.deepEqual(requests,[]);assert.deepEqual(errors,[]);
 await page.evaluate(()=>window.__SHIRETOKO_TERRAIN__.dispose());const disposed=await state();assert.equal(disposed.geometries,0);assert.equal(disposed.textures,0);assert.equal(await page.locator('canvas').count(),0);checks.push('GPU geometries / textures / canvas disposed to zero');
 await writeFile(resolve(out,'verification.json'),JSON.stringify({checks,initial,after,disposed,landedCapture,errors,requests},null,2));console.log(JSON.stringify({checks,landedCapture},null,2));
}catch(e){await page.screenshot({path:resolve(out,'FAILED.png'),timeout:60000}).catch(()=>{});await writeFile(resolve(out,'FAILED.txt'),String(e));throw e;}finally{await browser.close();}
