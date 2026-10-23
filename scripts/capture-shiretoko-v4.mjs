/** Fixed v3/v4 cameras. Only real browser captures; no fog/material/camera substitutions. */
import {chromium} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {Vector3,Spherical} from 'three';
const artifact=resolve(process.argv[2]??'release/RECLAIM_Shiretoko_Terrain_Phase1.html'),out=resolve(process.argv[3]??'release/shiretoko-phase1-review/v4/captures');
await mkdir(out,{recursive:true});
const views=[
 ['A-overview',[1320,1660,2270],[-10,125,-85]],['B-coast',[-1320,640,750],[-70,100,120]],
 ['C-plan',[0,3500,-139],[0,0,-140]],['D-cape',[-170,109.68,850],[-15,330,-650]],
 ['E-wetland',[-130,93.68,410],[100,93,435]],['F-lake',[-140,156.68,-310],[180,151,-340]],
 ['G-mountain',[170,336.68,-850],[-70,600,-1250]],
 ['I-inland-reverse',[1100,1700,-4850],[0,370,-1400]],['J-cape-sea',[430,160,1110],[-185,62,840]],
 ...Array.from({length:8},(_,i)=>{const a=i*Math.PI/4;return[`main-${i*45}`,[Math.sin(a)*2650,1360,Math.cos(a)*2650-150],[0,170,-180]];}),
 ...Array.from({length:8},(_,i)=>{const a=i*Math.PI/4;return[`far-${i*45}`,[Math.sin(a)*5500,2000,Math.cos(a)*5500-6500],[0,250,-6500]];}),
 ['270-close',[-3500,900,-5900],[-2200,180,-5700]],
 ['270-low',[-3600,150,-5700],[-2350,150,-5600]],
 ['270-reverse',[-600,1050,-5700],[-2700,90,-5900]],
 // Like the originalC-plan, a1m offset avoids the exact-pole azimuth singularity.
 ['270-high',[-2100,2400,-5699],[-2100,0,-5700]],
 ['315-close',[-3100,850,-3950],[-1900,180,-4700]],
 ['315-low',[-3000,180,-4000],[-2100,160,-4700]],
 ['315-reverse',[-600,1100,-5100],[-2200,120,-4200]],
 ['315-high',[-1700,2400,-4699],[-1700,0,-4700]],
 ['coast-join',[-1600,1000,-4200],[300,550,-4200]],
 ['terminal',[3000,1600,-10700],[0,240,-7200]],
 ['watercourse',[114,93.5,475],[46,91.5,500]],
 ['plateau',[-112,171,-440],[180,153,-370]],
];
const selected=process.env.RECLAIM_CAPTURE_FILTER?views.filter(v=>new RegExp(process.env.RECLAIM_CAPTURE_FILTER).test(v[0])):views;
const browser=await chromium.launch({headless:true,...(process.env.RECLAIM_TEST_BROWSER?{executablePath:process.env.RECLAIM_TEST_BROWSER}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--allow-file-access-from-files']});
const context=await browser.newContext({viewport:{width:1600,height:900},deviceScaleFactor:1}),page=await context.newPage(),errors=[],network=[],records=[];
page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});
await page.addInitScript(()=>{const p=WebGL2RenderingContext.prototype,get=p.getUniformLocation,set=p.uniform1f,clock=new WeakSet();p.getUniformLocation=function(program,name){const loc=get.call(this,program,name);if(loc&&name==='uTime')clock.add(loc);return loc;};p.uniform1f=function(loc,value){return set.call(this,loc,clock.has(loc)?0:value);};});
try{
 await page.bringToFront();await page.goto(pathToFileURL(artifact).href);
 await page.waitForFunction(()=>window.__SHIRETOKO_TERRAIN__?.diagnostics().ready,{}, {timeout:60000});await page.evaluate(()=>document.fonts.ready);
 const initial=await page.evaluate(()=>{const a=window.__SHIRETOKO_TERRAIN__;a.freeze(true);a.setClean(true);return a.diagnostics();});
 await page.waitForFunction(()=>getComputedStyle(document.querySelector('.masthead')).opacity==='0');
 for(const [name,p,t]of selected){
  const before=await page.evaluate(()=>window.__SHIRETOKO_TERRAIN__.diagnostics().renderCallsTotal);
  await page.evaluate(([p,t])=>window.__SHIRETOKO_TERRAIN__.viewFrom(p,t),[p,t]);
  await page.waitForFunction(n=>window.__SHIRETOKO_TERRAIN__.diagnostics().renderCallsTotal>n,before);
  const state=await page.evaluate(()=>{const c=document.querySelector('canvas'),gl=c.getContext('webgl2');gl.finish();const top=[8,Math.floor(c.width/2),c.width-9].map(x=>{const rgba=new Uint8Array(4);gl.readPixels(x,c.height-9,1,1,gl.RGBA,gl.UNSIGNED_BYTE,rgba);return Array.from(rgba);});return{...window.__SHIRETOKO_TERRAIN__.diagnostics(),topPixels:top,glError:gl.getError()};});
  // Preserve every original v3 request. Its existing OrbitControls limits
  // polar angle to0.49*pi, distance10..6300 and makes the pole safe. Compare
  // against that independently calculated physical pose, at the SAME10nm
  // tolerance, then compare actual v3/v4 poses again in diff-shiretoko-v4.
  const spherical=new Spherical().setFromVector3(new Vector3(...p).sub(new Vector3(...t)));
  spherical.phi=Math.max(0,Math.min(Math.PI*.49,spherical.phi));spherical.makeSafe();spherical.radius=Math.max(10,Math.min(6300,spherical.radius));
  const canonical=new Vector3().setFromSpherical(spherical).add(new Vector3(...t)).toArray();
  assert.equal(state.camera.fov,44);const canonicalError=Math.hypot(...canonical.map((v,i)=>state.camera.position[i]-v));
  if(canonicalError>=1e-8)await writeFile(resolve(out,'FAILED-camera.json'),JSON.stringify({name,requested:p,target:t,canonical,actual:state.camera,canonicalError},null,2));
  assert.ok(canonicalError<1e-8);
  assert.equal(state.glError,0);for(const rgba of state.topPixels){assert.equal(rgba[3],255);assert.ok(rgba[0]+rgba[1]+rgba[2]>24,'No exposed black clear-buffer at the sky/world edge');}
  const file=name+'.jpg';await page.screenshot({path:resolve(out,file),type:'jpeg',quality:94});
  const data=await readFile(resolve(out,file));records.push({name,file,requestedPosition:p,requestedTarget:t,canonicalPosition:canonical,requestToActualMetres:Math.hypot(...p.map((v,i)=>state.camera.position[i]-v)),camera:state.camera,triangles:state.triangles,drawCalls:state.drawCalls,topPixels:state.topPixels,glError:state.glError,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});
 }
 if(!process.env.RECLAIM_CAPTURE_FILTER){
  await page.evaluate(()=>{const a=window.__SHIRETOKO_TERRAIN__;a.setView(0);a.setClean(false);});await page.waitForFunction(()=>getComputedStyle(document.querySelector('.masthead')).opacity==='1');
  const file='H-overview-UI.jpg';await page.screenshot({path:resolve(out,file),type:'jpeg',quality:94});const data=await readFile(resolve(out,file)),state=await page.evaluate(()=>window.__SHIRETOKO_TERRAIN__.diagnostics());records.push({name:'H-overview-UI',file,camera:state.camera,triangles:state.triangles,drawCalls:state.drawCalls,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});
 }
 assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
 const html=await readFile(artifact,'utf8');
 await writeFile(resolve(out,'capture.json'),JSON.stringify({source:html.match(/name="reclaim-terrain-source" content="([^"]+)/)?.[1],tree:html.match(/name="reclaim-terrain-tree" content="([^"]+)/)?.[1],artifactSHA256:createHash('sha256').update(html).digest('hex'),artifactBytes:Buffer.byteLength(html),browser:browser.version(),viewport:[1600,900],dpr:1,fov:44,waterTime:0,views:selected,records,initial,filter:process.env.RECLAIM_CAPTURE_FILTER??null,errors,network,method:'Actual page screenshots. Original v3 camera formula retained for main and far eight directions. Same FOV, light, sky, atmosphere and water time. No imagegen or hidden defects.'},null,2));
 console.log(JSON.stringify({out,captures:records.length,initialTriangles:initial.triangles,initialCalls:initial.drawCalls,errors,network}));
}catch(e){await page.screenshot({path:resolve(out,'FAILED.png')}).catch(()=>{});await writeFile(resolve(out,'FAILED.txt'),String(e));throw e;}finally{await browser.close();}
