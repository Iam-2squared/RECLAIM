import {chromium} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const out=resolve(process.argv[2]??'release/shiretoko-phase1-review/v4/interaction');await mkdir(out,{recursive:true});
const file=resolve('release/RECLAIM_Shiretoko_Terrain_Phase1.html'),browser=await chromium.launch({headless:true,...(process.env.RECLAIM_TEST_BROWSER?{executablePath:process.env.RECLAIM_TEST_BROWSER}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--allow-file-access-from-files']});
const context=await browser.newContext({viewport:{width:1600,height:900},deviceScaleFactor:1}),page=await context.newPage(),errors=[],network=[],checks=[],walks=[];
page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});
await page.addInitScript(()=>{
 window.__storage=[];for(const method of ['getItem','setItem','removeItem','clear'])Storage.prototype[method]=function(){window.__storage.push(method);throw new Error('Independent terrain may not access game storage');};
 const add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener,records=[];
 EventTarget.prototype.addEventListener=function(type,fn,options){const capture=typeof options==='boolean'?options:Boolean(options?.capture),app=new Error().stack?.includes(location.href);if(app&&!records.some(r=>r.active&&r.target===this&&r.type===type&&r.fn===fn&&r.capture===capture))records.push({target:this,type,fn,capture,active:true});return add.call(this,type,fn,options);};
 EventTarget.prototype.removeEventListener=function(type,fn,options){const capture=typeof options==='boolean'?options:Boolean(options?.capture);for(const r of records)if(r.target===this&&r.type===type&&r.fn===fn&&r.capture===capture)r.active=false;return remove.call(this,type,fn,options);};
 window.__activeAppListeners=()=>records.filter(r=>r.active).map(r=>({target:r.target===window?'window':r.target===document?'document':r.target.nodeName,type:r.type}));
});
const state=()=>page.evaluate(()=>window.__SHIRETOKO_TERRAIN__.diagnostics());
try{
 await page.bringToFront();await page.goto(pathToFileURL(file).href);await page.waitForFunction(()=>window.__SHIRETOKO_TERRAIN__?.diagnostics().ready,{}, {timeout:60000});await page.evaluate(()=>document.fonts.ready);
 await page.evaluate(()=>window.__SHIRETOKO_TERRAIN__.freeze(true));const initial=await state();assert.equal(initial.revision,4);
 const before=await state();await page.mouse.move(830,420);await page.mouse.down();await page.mouse.move(960,470,{steps:6});await page.mouse.up();await page.waitForFunction(p=>Math.hypot(...window.__SHIRETOKO_TERRAIN__.diagnostics().camera.position.map((v,i)=>v-p[i]))>10,before.camera.position);
 const rotated=await state();await page.mouse.wheel(0,-170);await page.waitForFunction(p=>Math.hypot(...window.__SHIRETOKO_TERRAIN__.diagnostics().camera.position.map((v,i)=>v-p[i]))>10,rotated.camera.position);
 const zoomed=await state();await page.mouse.down({button:'right'});await page.mouse.move(1060,510,{steps:6});await page.mouse.up({button:'right'});await page.waitForFunction(t=>Math.hypot(...window.__SHIRETOKO_TERRAIN__.diagnostics().camera.target.map((v,i)=>v-t[i]))>3,zoomed.camera.target);
 checks.push('Real mouse drag, wheel zoom and right-button pan change the actual orbit camera/target');
 const cameraTargets=[[1320,1660,2270],[-500,260,1120],[460,255,760],[600,365,30],[710,640,-480]];
 for(let i=0;i<5;i++){await page.keyboard.press(String(i));await page.waitForFunction(p=>Math.hypot(...window.__SHIRETOKO_TERRAIN__.diagnostics().camera.position.map((v,i)=>v-p[i]))<.01,cameraTargets[i]);}
 checks.push('Real0–4 keyboard shortcuts reach every existing fixed review camera');
 const warm=await state(),listenersBefore=await page.evaluate(()=>window.__activeAppListeners());
 // Resource cycles use the review API for explicit return, which releases the
 // lock. A native locked cursor cannot click an overlay button. Four genuine
 // Escape exits are tested below; repeated rapid nativeEscape can also invoke
 // browser re-lock cooldown. Do not replace those four input assertions.
 for(let i=0;i<10;i++){
  await page.evaluate(()=>window.__SHIRETOKO_TERRAIN__.setView(1));const before=(await state()).renderCallsTotal;
  await page.locator('#walk').click();await page.waitForFunction(()=>Boolean(document.pointerLockElement));await page.waitForFunction(n=>window.__SHIRETOKO_TERRAIN__.diagnostics().renderCallsTotal>n,before);
  await page.evaluate(()=>window.__SHIRETOKO_TERRAIN__.setView(0));await page.waitForFunction(()=>window.__SHIRETOKO_TERRAIN__.diagnostics().mode==='orbit'&&!document.pointerLockElement);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 }
 const after=await state(),listenersAfter=await page.evaluate(()=>window.__activeAppListeners());assert.equal(after.geometries,warm.geometries);assert.equal(after.textures,warm.textures);assert.deepEqual(listenersAfter,listenersBefore);
 checks.push('Ten real click/lock entries and explicit review-API returns keep geometries/textures and application listeners constant');
 for(let i=1;i<=4;i++){
  await page.evaluate(i=>window.__SHIRETOKO_TERRAIN__.setView(i),i);await page.locator('#walk').click();await page.waitForFunction(()=>document.pointerLockElement===document.querySelector('canvas'));
  const before=(await state()).player;await page.keyboard.down('Shift');await page.keyboard.down('w');
  await page.waitForFunction(start=>{const d=window.__SHIRETOKO_TERRAIN__.diagnostics();return d.inputKeys.includes('ShiftLeft')&&Math.hypot(d.player.x-start.x,d.player.z-start.z)>.8;},before,{timeout:15000});
  await page.keyboard.up('w');await page.keyboard.up('Shift');await page.keyboard.down('Space');await page.waitForFunction(()=>!window.__SHIRETOKO_TERRAIN__.diagnostics().player.grounded,{}, {timeout:15000});await page.keyboard.up('Space');await page.waitForFunction(()=>window.__SHIRETOKO_TERRAIN__.diagnostics().player.grounded,{}, {timeout:15000});
  const tick=await page.evaluate(()=>window.__SHIRETOKO_TERRAIN__.diagnostics().renderCallsTotal);
  await page.waitForFunction(n=>window.__SHIRETOKO_TERRAIN__.diagnostics().renderCallsTotal>n,tick);
  const frame=await page.evaluate(()=>{const a=window.__SHIRETOKO_TERRAIN__,c=document.querySelector('canvas'),gl=c.getContext('webgl2');gl.finish();const d=a.diagnostics();return{...d,groundError:Math.abs(d.player.y-a.terrain.heightAt(d.player.x,d.player.z)),water:a.terrain.inWater(d.player.x,d.player.z),glError:gl.getError(),image:c.toDataURL('image/jpeg',.94)};});
  assert.equal(frame.mode,'walk');assert.ok(frame.pointerLocked&&frame.player.grounded);assert.equal(frame.water,false);assert.ok(frame.groundError<.001);assert.equal(frame.glError,0);assert.deepEqual(frame.inputKeys,[]);assert.ok(frame.player.distance-before.distance>.8);
  const image=`walk-${['cape','wetland','lake','mountain'][i-1]}-webgl-framebuffer.jpg`;await writeFile(resolve(out,image),Buffer.from(frame.image.split(',')[1],'base64'));delete frame.image;walks.push({location:i,file:image,method:'Actual preserved WebGL framebuffer after real W+Shift and Space input; DOM overlay excluded',...frame});
  await page.keyboard.press('Escape');await page.waitForFunction(()=>window.__SHIRETOKO_TERRAIN__.diagnostics().mode==='orbit'&&!document.pointerLockElement);
 }
 checks.push('All four actual first-person starts accept W+Shift, jump/land, enforce dry shared grounding and release onEscape');
 await page.evaluate(()=>window.__SHIRETOKO_TERRAIN__.dispose());const disposed=await state(),remaining=await page.evaluate(()=>window.__activeAppListeners());assert.equal(disposed.geometries,0);assert.equal(disposed.textures,0);assert.equal(await page.locator('canvas').count(),0);assert.deepEqual(remaining,[]);
 assert.deepEqual(errors,[]);assert.deepEqual(network,[]);assert.deepEqual(await page.evaluate(()=>window.__storage),[]);
 checks.push('Dispose removes all observed application listeners, canvas, GL geometries/textures; zero externalHTTP and gameStorage');
 const html=await readFile(file,'utf8');await writeFile(resolve(out,'verification-v4.json'),JSON.stringify({source:html.match(/name="reclaim-terrain-source" content="([^"]+)/)?.[1],tree:html.match(/name="reclaim-terrain-tree" content="([^"]+)/)?.[1],browser:browser.version(),viewport:[1600,900],dpr:1,checks,initial,walks,warm,after,listenersBefore,listenersAfter,remaining,disposed,errors,network,physicalWindowsGPU:false,notes:'Real browser input with software SwiftShader. Four point starts are separate tests; the uninterrupted full route is verified separately. Framebuffer images exclude DOM.'},null,2));
 console.log(JSON.stringify({checks,walks:walks.length,remaining,errors,network}));
}catch(e){await writeFile(resolve(out,'FAILED.txt'),String(e));await writeFile(resolve(out,'FAILED-state.json'),JSON.stringify(await state().catch(()=>null),null,2));await page.screenshot({path:resolve(out,'FAILED.png')}).catch(()=>{});throw e;}finally{await browser.close();}
