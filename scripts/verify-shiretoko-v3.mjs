import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const out=resolve(process.argv[2]??'release/shiretoko-phase1-review/v3');await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.RECLAIM_TEST_BROWSER?{executablePath:process.env.RECLAIM_TEST_BROWSER}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--allow-file-access-from-files']});
const context=await browser.newContext({viewport:{width:1600,height:900},deviceScaleFactor:1});
const page=await context.newPage(),errors=[],network=[],checks=[],ring=[];let rearSkySamples,activePage=page;
page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});
const state=()=>page.evaluate(()=>window.__SHIRETOKO_TERRAIN__.diagnostics());
const artifact=pathToFileURL(resolve('release/RECLAIM_Shiretoko_Terrain_Phase1.html')).href;
async function captured(name,position,target){
 const before=(await state()).renderCallsTotal;
 await page.evaluate(([p,t])=>window.__SHIRETOKO_TERRAIN__.viewFrom(p,t),[position,target]);
 await page.waitForFunction(n=>window.__SHIRETOKO_TERRAIN__.diagnostics().renderCallsTotal>n,before);
 await page.evaluate(()=>document.querySelector('canvas').getContext('webgl2').finish());
 await page.screenshot({path:resolve(out,`${name}.jpg`),type:'jpeg',quality:94});
 return await state();
}
try{
 await page.goto(artifact);await page.waitForFunction(()=>window.__SHIRETOKO_TERRAIN__?.diagnostics().ready,{}, {timeout:60000});await page.evaluate(()=>document.fonts.ready);
 await page.evaluate(()=>{const a=window.__SHIRETOKO_TERRAIN__;a.freeze(true);a.setClean(true);});
 await page.waitForFunction(()=>getComputedStyle(document.querySelector('.masthead')).opacity==='0');
 const initial=await state();assert.equal(initial.revision,4);
 // Rotate around the full main peninsula, then the distant naturally closed
 // terminal cape. Geometry remains visible: this is NOT a fog-only boundary test.
 for(let i=0;i<8;i++){
  const angle=i*Math.PI/4,position=[Math.sin(angle)*2650,1360,Math.cos(angle)*2650-150];
  const s=await captured(`360-main-${i*45}`,position,[0,170,-180]);ring.push({angleDegrees:i*45,camera:s.camera,triangles:s.triangles,drawCalls:s.drawCalls});
 }
 for(const [name,p,t] of [['rear-terminal',[3000,1600,-10700],[0,240,-7200]],['20-80m-join',[-1600,1000,-4200],[300,550,-4200]],['mountain-lookdown',[220,800,-1310],[10,100,320]],['wetland-close',[-110,94.8,419],[48,92,485]],['plateau-ground',[-112,171,-440],[180,153,-370]]]){
  await captured(name,p,t);
  if(name==='rear-terminal'){
   // The terminal camera is >11km from the origin. A fixed 11km BackSide sky
   // used to expose the black clear buffer here even though every check passed.
   rearSkySamples=await page.evaluate(()=>{const canvas=document.querySelector('canvas'),gl=canvas.getContext('webgl2');gl.finish();const pixels=[8,Math.floor(canvas.width/2),canvas.width-9].map(x=>{const rgba=new Uint8Array(4);gl.readPixels(x,canvas.height-9,1,1,gl.RGBA,gl.UNSIGNED_BYTE,rgba);return{x,y:8,rgba:[...rgba]};});return{pixels,glError:gl.getError()};});
   assert.equal(rearSkySamples.glError,0);for(const sample of rearSkySamples.pixels){assert.ok(sample.rgba[0]+sample.rgba[1]+sample.rgba[2]>24,'Distant rear sky must not expose the black clear buffer');assert.equal(sample.rgba[3],255);}
  }
 }
 checks.push('eight 45-degree main coast views, terminal cape, 20/80m join, mountain lookdown, wetland close and plateau');
 const canvasPixels=()=>page.evaluate(()=>{const canvas=document.querySelector('canvas');canvas.getContext('webgl2').finish();return canvas.toDataURL('image/png');});
 const fresh=async action=>{const before=(await state()).renderCallsTotal;await action();await page.waitForFunction(n=>window.__SHIRETOKO_TERRAIN__.diagnostics().renderCallsTotal>n,before);};
 await page.evaluate(()=>window.__SHIRETOKO_TERRAIN__.setView(0));
 await fresh(()=>page.evaluate(()=>window.__SHIRETOKO_TERRAIN__.setClean(false)));
 const withoutRoute=await canvasPixels();
 await fresh(()=>page.locator('#route').click());const withRoute=await canvasPixels();assert.notEqual(withRoute,withoutRoute);
 await fresh(()=>page.keyboard.press('h'));assert.equal((await state()).routeOverlayVisible,false);assert.equal(await canvasPixels(),withoutRoute,'H must actually remove the line pixels, not only change a visible flag');
 await page.screenshot({path:resolve(out,'clean-route-hidden.jpg'),type:'jpeg',quality:94});
 await fresh(()=>page.keyboard.press('h'));assert.equal(await canvasPixels(),withRoute,'H restores the route pixels at the same frozen camera');
 await fresh(()=>page.locator('#route').click());assert.equal(await canvasPixels(),withoutRoute);
 const afterOverlayWarmup=await state();assert.equal(afterOverlayWarmup.geometries,initial.geometries+1,'Exactly one first-upload route-line geometry');assert.equal(afterOverlayWarmup.textures,initial.textures);
 checks.push('H invalidates the GL frame: exact frozen canvas pixels lose/restore the route, then return to the original image');
 await page.evaluate(()=>window.__SHIRETOKO_TERRAIN__.setClean(false));await page.keyboard.press('1');await page.locator('#walk').click();await page.waitForFunction(()=>document.pointerLockElement===document.querySelector('canvas'));
 await page.keyboard.down('w');await page.waitForFunction(()=>window.__SHIRETOKO_TERRAIN__.diagnostics().inputKeys.includes('KeyW'));
 await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
 let s=await state();assert.deepEqual(s.inputKeys,[]);await page.keyboard.up('w');
 await page.keyboard.press('Escape');await page.waitForFunction(()=>window.__SHIRETOKO_TERRAIN__.diagnostics().mode==='orbit');
 for(let i=0;i<3;i++){await page.locator('#walk').click();await page.waitForFunction(()=>document.pointerLockElement===document.querySelector('canvas'));await page.keyboard.press('Escape');await page.waitForFunction(()=>window.__SHIRETOKO_TERRAIN__.diagnostics().mode==='orbit');}
 const afterCycles=await state();assert.equal(afterCycles.geometries,afterOverlayWarmup.geometries);assert.equal(afterCycles.textures,afterOverlayWarmup.textures);
 checks.push('real repeated pointer-lock entry/ESC exit; synthetic blur clears held input; no geometry/texture growth');
 const hidden=await page.evaluate(async()=>{
  const a=window.__SHIRETOKO_TERRAIN__,before=a.diagnostics().renderCallsTotal;
  Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));
  for(let i=0;i<12;i++)await new Promise(r=>requestAnimationFrame(r));
  const hiddenDraws=a.diagnostics().renderCallsTotal-before;delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));return hiddenDraws;
 });assert.equal(hidden,0);checks.push('synthetic visibility-hidden lifecycle stops GL submissions, then restores state');
 await page.evaluate(()=>window.__SHIRETOKO_TERRAIN__.setView(0));
 const idle=await page.evaluate(async()=>{const a=window.__SHIRETOKO_TERRAIN__;for(let i=0;i<30;i++)await new Promise(r=>requestAnimationFrame(r));const n=a.diagnostics().renderCallsTotal;for(let i=0;i<20;i++)await new Promise(r=>requestAnimationFrame(r));return a.diagnostics().renderCallsTotal-n;});assert.equal(idle,0);
 const beforeDispose=await state();await page.evaluate(()=>window.__SHIRETOKO_TERRAIN__.dispose());const disposed=await state();assert.equal(disposed.geometries,0);assert.equal(disposed.textures,0);assert.equal(await page.locator('canvas').count(),0);
 checks.push('idle overview submits zero identical frames; dispose returns GPU geometry/texture counts to zero');

 // The WebGL-unavailable screenshot is mandatory, not an optional smoke.
 // A fresh Chromium process isolates capture from the heavy positive GL tests.
 const unavailableBrowser=await chromium.launch({headless:true,...(process.env.RECLAIM_TEST_BROWSER?{executablePath:process.env.RECLAIM_TEST_BROWSER}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--allow-file-access-from-files']});
 try{
  const unavailableContext=await unavailableBrowser.newContext({viewport:{width:1600,height:900},deviceScaleFactor:1});
  const unavailable=await unavailableContext.newPage();
  activePage=unavailable;
  await unavailable.bringToFront();
  await unavailable.addInitScript(()=>{const native=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...rest){return type==='webgl2'?null:native.call(this,type,...rest);};});
  await unavailable.goto(artifact);await unavailable.bringToFront();
  await unavailable.locator('#error').waitFor({state:'visible'});
  assert.ok((await unavailable.locator('#error').textContent()).includes('WebGL 2'));
  assert.equal(await unavailable.locator('#loading').isVisible(),false);
  await unavailable.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
  try{await unavailable.screenshot({path:resolve(out,'WebGL-unavailable.jpg'),type:'jpeg',quality:92});}
  catch(error){
   const state=await unavailable.evaluate(()=>({error:document.querySelector('#error')?.textContent,loadingHidden:document.querySelector('#loading')?.hidden,readyState:document.readyState})).catch(()=>null);
   await writeFile(resolve(out,'WebGL-unavailable-failure-context.json'),JSON.stringify(state,null,2));
   throw error;
  }
 }finally{await unavailableBrowser.close();activePage=page;}
 checks.push('WebGL unavailable has a readable error and loading state resolves');
 assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
 const html=await readFile(resolve('release/RECLAIM_Shiretoko_Terrain_Phase1.html'),'utf8');
 const report={source:html.match(/name="reclaim-terrain-source" content="([^"]+)/)?.[1],tree:html.match(/name="reclaim-terrain-tree" content="([^"]+)/)?.[1],environment:{browser:browser.version(),userAgent:await page.evaluate(()=>navigator.userAgent),node:process.version,platform:process.platform,architecture:process.arch},checks,initial,ring,rearSkySamples,afterOverlayWarmup,afterCycles,hiddenSubmissions:hidden,idleSubmissions:idle,beforeDispose,disposed,errors,network,physicalWindowsTest:false,notes:'Headless Chromium + software SwiftShader. Blur and hidden lifecycle are synthetic browser events, not an actual laptop or OS GPU test.'};
 await writeFile(resolve(out,'verification-v3.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({checks,errors,network},null,2));
}catch(e){await activePage.screenshot({path:resolve(out,'FAILED-v3.png')}).catch(()=>{});await writeFile(resolve(out,'FAILED-v3-state.json'),JSON.stringify(await activePage.evaluate(()=>({hidden:document.hidden,visibility:document.visibilityState,focus:document.hasFocus(),error:document.querySelector('#error')?.outerHTML,loading:document.querySelector('#loading')?.outerHTML,state:window.__SHIRETOKO_TERRAIN__?.diagnostics()})).catch(()=>null),null,2));await writeFile(resolve(out,'FAILED-v3.txt'),String(e));throw e;}finally{await browser.close();}
